// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IZeroXCredit} from "./interfaces/IZeroXCredit.sol";
import {IZeroXScore} from "./interfaces/IZeroXScore.sol";
import {IZeroXVault} from "./interfaces/IZeroXVault.sol";
import {RiskMath} from "./libraries/RiskMath.sol";
import {ScoreCalculator} from "./libraries/ScoreCalculator.sol";

/// @title ZeroXCredit
/// @notice Manages stablecoin credit lines backed by ZeroX vault share collateral
/// @dev Uses a global interest index (Compound-style) for efficient per-block interest.
///      All credit operations are non-custodial — the vault contract holds the collateral.
///      Users borrow USDC or USDT from the protocol reserve.
contract ZeroXCredit is Ownable, Pausable, ReentrancyGuard, IZeroXCredit {
    using SafeERC20 for IERC20;
    using RiskMath for *;

    // ─── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant APR_BPS          = 1000;   // 10% APR
    uint256 public constant SECONDS_PER_YEAR = 31536000;
    uint256 public constant INDEX_PRECISION  = 1e18;

    // ─── Configuration ─────────────────────────────────────────────────────────

    /// @notice USDC contract on Avalanche (borrow token)
    IERC20 public borrowToken;

    /// @notice ZeroXScore contract
    IZeroXScore public scoreContract;

    /// @notice Allowed vaults (only vault shares can be collateral)
    mapping(address => bool) public allowedVaults;

    /// @notice Protocol reserve accumulates interest
    uint256 public protocolReserve;

    /// @notice Treasury address for liquidation bonus split (2% of 5%)
    address public treasury;

    /// @notice Reserve factor: portion of interest going to protocol (500 bps = 5%)
    uint256 public reserveFactor = 500;

    // ─── Interest Accrual (Compound-style index) ───────────────────────────────

    /// @notice Global interest index (1e18 = 1.0 at inception)
    uint256 public globalInterestIndex = INDEX_PRECISION;

    /// @notice Timestamp of last interest accrual
    uint256 public lastAccrualTime;

    /// @notice Total outstanding principal across all credit lines (excludes accrued interest)
    uint256 public totalPrincipal;

    // ─── User State ────────────────────────────────────────────────────────────

    /// @notice Credit line data per user
    mapping(address => CreditLine) private _creditLines;

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @param _borrowToken The stablecoin users borrow (USDC on Avalanche)
    /// @param _scoreContract ZeroXScore address
    /// @param _owner Multisig address
    constructor(
        address _borrowToken,
        address _scoreContract,
        address _owner
    ) Ownable(_owner) {
        require(_borrowToken != address(0), "ZeroXCredit: zero borrow token");
        require(_scoreContract != address(0), "ZeroXCredit: zero score contract");
        borrowToken = IERC20(_borrowToken);
        scoreContract = IZeroXScore(_scoreContract);
        lastAccrualTime = block.timestamp;
    }

    // ─── Core Protocol Functions ───────────────────────────────────────────────

    /// @inheritdoc IZeroXCredit
    function openCreditLine(
        address vault,
        uint256 shares
    ) external override whenNotPaused nonReentrant {
        require(allowedVaults[vault], "ZeroXCredit: vault not allowed");
        require(shares > 0, "ZeroXCredit: zero shares");
        require(!_creditLines[msg.sender].active, "ZeroXCredit: credit line already open");

        // Validate minimum collateral value ($500 USD) for the specific shares being locked
        // FIX L-02: use getSharesValueUSD(shares) not getUserPositionUSD(msg.sender) to check
        // only the collateral being deposited, not the user's total vault balance
        IZeroXVault vaultContract = IZeroXVault(vault);
        uint256 collateralUSD = vaultContract.getSharesValueUSD(shares);
        require(collateralUSD >= 500e6, "ZeroXCredit: collateral below $500 minimum");

        // Transfer vault shares from user to this contract (collateral)
        IERC20(vault).safeTransferFrom(msg.sender, address(this), shares);

        _creditLines[msg.sender] = CreditLine({
            collateralVault: vault,
            collateralShares: shares,
            principal: 0,
            interestIndex: globalInterestIndex,
            openedAt: block.timestamp,
            lastBorrowAt: 0,
            active: true
        });

        // Initialize score if not already done
        if (!scoreContract.isInitialized(msg.sender)) {
            scoreContract.initializeScore(msg.sender);
        }

        scoreContract.recordEvent(
            msg.sender,
            IZeroXScore.CreditEventType.CREDIT_LINE_OPENED,
            collateralUSD / 1e6 // USD value
        );

        emit CreditLineOpened(msg.sender, vault, shares);
    }

    /// @inheritdoc IZeroXCredit
    function borrow(uint256 amount) external override whenNotPaused nonReentrant {
        require(amount > 0, "ZeroXCredit: zero amount");
        CreditLine storage cl = _creditLines[msg.sender];
        require(cl.active, "ZeroXCredit: no active credit line");

        _accrueInterest();

        uint256 currentDebt = _getCurrentDebt(cl);
        uint256 collateralUSD = _getCollateralUSD(cl);
        uint256 maxBorrow = RiskMath.maxBorrowable(collateralUSD);

        require(
            RiskMath.isValidBorrow(currentDebt, amount, collateralUSD),
            "ZeroXCredit: exceeds maximum LTV"
        );
        require(
            borrowToken.balanceOf(address(this)) >= amount,
            "ZeroXCredit: insufficient protocol liquidity"
        );

        // Update principal and interest index snapshot
        cl.principal = currentDebt + amount;
        cl.interestIndex = globalInterestIndex;
        cl.lastBorrowAt = block.timestamp;   // FIX H-01: track borrow time for on-time check
        totalPrincipal += amount;

        borrowToken.safeTransfer(msg.sender, amount);

        // Update score signals
        uint256 newLTV = RiskMath.calculateLTV(cl.principal, collateralUSD);
        uint256 collateralRatio = RiskMath.calculateCollateralRatio(collateralUSD, cl.principal);
        scoreContract.updatePositionSignals(
            msg.sender,
            cl.principal,
            maxBorrow,
            collateralRatio
        );

        scoreContract.recordEvent(
            msg.sender,
            IZeroXScore.CreditEventType.BORROW,
            amount / 1e6
        );

        emit Borrowed(msg.sender, amount, cl.principal, newLTV);
    }

    /// @inheritdoc IZeroXCredit
    function repay(uint256 amount) external override whenNotPaused nonReentrant {
        require(amount > 0, "ZeroXCredit: zero amount");
        CreditLine storage cl = _creditLines[msg.sender];
        require(cl.active, "ZeroXCredit: no active credit line");

        _accrueInterest();

        uint256 currentDebt = _getCurrentDebt(cl);
        require(currentDebt > 0, "ZeroXCredit: no outstanding debt");

        // Cap repayment at current debt
        uint256 actualRepay = amount > currentDebt ? currentDebt : amount;
        bool isFullRepay = actualRepay == currentDebt;

        borrowToken.safeTransferFrom(msg.sender, address(this), actualRepay);

        // Interest portion goes to protocol reserve
        uint256 interestPaid = currentDebt > cl.principal
            ? (currentDebt - cl.principal) * actualRepay / currentDebt
            : 0;
        uint256 reserveShare = (interestPaid * reserveFactor) / 10000;
        protocolReserve += reserveShare;

        // Determine if repayment is on-time (within 30 days of the LAST BORROW)
        // FIX H-01: use lastBorrowAt, not openedAt — credit line age is irrelevant
        bool isOnTime = cl.lastBorrowAt > 0 && block.timestamp <= cl.lastBorrowAt + 30 days;
        IZeroXScore.CreditEventType repayType = isOnTime
            ? IZeroXScore.CreditEventType.REPAY_ONTIME
            : IZeroXScore.CreditEventType.REPAY_LATE;

        // Update credit line
        if (isFullRepay) {
            totalPrincipal = totalPrincipal > cl.principal ? totalPrincipal - cl.principal : 0;
            cl.principal = 0;
        } else {
            // actualRepay < currentDebt; reduce principal proportionally
            uint256 principalRepaid = cl.principal > 0 && currentDebt > 0
                ? (cl.principal * actualRepay) / currentDebt
                : 0;
            totalPrincipal = totalPrincipal > principalRepaid ? totalPrincipal - principalRepaid : 0;
            cl.principal = currentDebt - actualRepay;
        }
        cl.interestIndex = globalInterestIndex;

        // Update score
        uint256 collateralUSD = _getCollateralUSD(cl);
        uint256 maxBorrow = RiskMath.maxBorrowable(collateralUSD);
        uint256 collateralRatio = cl.principal == 0
            ? type(uint256).max
            : RiskMath.calculateCollateralRatio(collateralUSD, cl.principal);

        scoreContract.updatePositionSignals(
            msg.sender,
            cl.principal,
            maxBorrow,
            collateralRatio == type(uint256).max ? 20000 : collateralRatio
        );

        scoreContract.recordEvent(msg.sender, repayType, actualRepay / 1e6);

        emit Repaid(msg.sender, actualRepay, cl.principal, isFullRepay);
    }

    /// @inheritdoc IZeroXCredit
    function addCollateral(uint256 additionalShares) external override whenNotPaused nonReentrant {
        require(additionalShares > 0, "ZeroXCredit: zero shares");
        CreditLine storage cl = _creditLines[msg.sender];
        require(cl.active, "ZeroXCredit: no active credit line");

        IERC20(cl.collateralVault).safeTransferFrom(msg.sender, address(this), additionalShares);
        cl.collateralShares += additionalShares;

        uint256 collateralUSD = _getCollateralUSD(cl);
        scoreContract.recordEvent(
            msg.sender,
            IZeroXScore.CreditEventType.COLLATERAL_ADDED,
            collateralUSD / 1e6
        );

        emit CollateralAdded(msg.sender, additionalShares, cl.collateralShares);
    }

    /// @inheritdoc IZeroXCredit
    function liquidate(address user) external override nonReentrant {
        require(user != msg.sender, "ZeroXCredit: cannot self-liquidate");
        CreditLine storage cl = _creditLines[user];
        require(cl.active, "ZeroXCredit: no active credit line");

        _accrueInterest();

        uint256 currentDebt = _getCurrentDebt(cl);
        require(currentDebt > 0, "ZeroXCredit: no outstanding debt");

        uint256 collateralUSD = _getCollateralUSD(cl);
        require(
            RiskMath.isLiquidatable(collateralUSD, currentDebt),
            "ZeroXCredit: position not liquidatable"
        );

        // Liquidator repays the full debt
        borrowToken.safeTransferFrom(msg.sender, address(this), currentDebt);
        totalPrincipal = totalPrincipal > cl.principal ? totalPrincipal - cl.principal : 0;

        // Calculate collateral to seize (debt + 5% bonus)
        uint256 collateralDebtEquivalent = cl.collateralShares;
        uint256 debtWithBonus = (currentDebt * (10000 + RiskMath.LIQ_BONUS_BPS)) / 10000;

        // Seize proportional shares (debt+bonus / collateral value * total shares)
        // Use currentDebt * bonus numerator directly to avoid divide-before-multiply.
        uint256 sharesToSeize = collateralUSD > 0
            ? (collateralDebtEquivalent * currentDebt * (10000 + RiskMath.LIQ_BONUS_BPS)) / (10000 * collateralUSD)
            : collateralDebtEquivalent;

        if (sharesToSeize > cl.collateralShares) sharesToSeize = cl.collateralShares;

        uint256 remainingShares = cl.collateralShares - sharesToSeize;

        // Split seized shares: 3% liquidator bonus, 2% protocol treasury
        (uint256 liquidatorShares, uint256 protocolShares) = RiskMath.calculateLiquidationSplit(sharesToSeize);

        // Transfer liquidator's portion
        IERC20(cl.collateralVault).safeTransfer(msg.sender, liquidatorShares);

        // Transfer treasury's portion (fallback to liquidator if treasury not set)
        if (protocolShares > 0) {
            if (treasury != address(0)) {
                IERC20(cl.collateralVault).safeTransfer(treasury, protocolShares);
            } else {
                IERC20(cl.collateralVault).safeTransfer(msg.sender, protocolShares);
            }
        }

        // Return remaining collateral to user
        if (remainingShares > 0) {
            IERC20(cl.collateralVault).safeTransfer(user, remainingShares);
        }

        // Close credit line
        cl.principal = 0;
        cl.collateralShares = 0;
        cl.active = false;

        // Penalize score
        scoreContract.recordEvent(
            user,
            IZeroXScore.CreditEventType.LIQUIDATION,
            currentDebt / 1e6
        );

        emit Liquidated(user, msg.sender, currentDebt, sharesToSeize, debtWithBonus - currentDebt);
        emit LiquidationTreasurySplit(user, liquidatorShares, protocolShares);
    }

    /// @inheritdoc IZeroXCredit
    function closeCreditLine() external override whenNotPaused nonReentrant {
        CreditLine storage cl = _creditLines[msg.sender];
        require(cl.active, "ZeroXCredit: no active credit line");

        _accrueInterest();

        uint256 currentDebt = _getCurrentDebt(cl);
        if (currentDebt > 0) {
            borrowToken.safeTransferFrom(msg.sender, address(this), currentDebt);
            totalPrincipal = totalPrincipal > cl.principal ? totalPrincipal - cl.principal : 0;
        }

        uint256 shares = cl.collateralShares;
        cl.principal = 0;
        cl.collateralShares = 0;
        cl.active = false;

        // Return collateral to user
        if (shares > 0) {
            IERC20(cl.collateralVault).safeTransfer(msg.sender, shares);
        }

        scoreContract.recordEvent(
            msg.sender,
            IZeroXScore.CreditEventType.CREDIT_LINE_CLOSED,
            0
        );

        emit CreditLineClosed(msg.sender, shares);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXCredit
    function getCreditLine(address user) external view override returns (CreditLine memory) {
        return _creditLines[user];
    }

    /// @inheritdoc IZeroXCredit
    function getCurrentDebt(address user) external view override returns (uint256) {
        return _getCurrentDebt(_creditLines[user]);
    }

    /// @inheritdoc IZeroXCredit
    function getCollateralValueUSD(address user) external view override returns (uint256) {
        return _getCollateralUSD(_creditLines[user]);
    }

    /// @inheritdoc IZeroXCredit
    function getLTV(address user) external view override returns (uint256) {
        CreditLine storage cl = _creditLines[user];
        if (!cl.active) return 0;
        uint256 debt = _getCurrentDebt(cl);
        uint256 collateral = _getCollateralUSD(cl);
        return RiskMath.calculateLTV(debt, collateral);
    }

    /// @inheritdoc IZeroXCredit
    function getHealthStatus(address user) external view override returns (HealthStatus) {
        CreditLine storage cl = _creditLines[user];
        if (!cl.active) return HealthStatus.HEALTHY;

        uint256 debt = _getCurrentDebt(cl);
        if (debt == 0) return HealthStatus.HEALTHY;

        uint256 collateral = _getCollateralUSD(cl);

        if (RiskMath.isLiquidatable(collateral, debt)) return HealthStatus.LIQUIDATABLE;
        if (RiskMath.isInWarningZone(collateral, debt))  return HealthStatus.AT_RISK;

        // FIX NEW-L-01: check higher severity first — CRITICAL (>= 50% LTV) before WARNING (>= 40%)
        uint256 ltv = RiskMath.calculateLTV(debt, collateral);
        if (ltv >= RiskMath.LTV_MAX_BPS) return HealthStatus.CRITICAL; // >= 50%
        if (ltv >= 4000) return HealthStatus.WARNING;                   // >= 40%

        return HealthStatus.HEALTHY;
    }

    /// @inheritdoc IZeroXCredit
    function getAvailableCredit(address user) external view override returns (uint256) {
        CreditLine storage cl = _creditLines[user];
        if (!cl.active) return 0;

        uint256 collateral = _getCollateralUSD(cl);
        uint256 maxBorrow = RiskMath.maxBorrowable(collateral);
        uint256 currentDebt = _getCurrentDebt(cl);

        return currentDebt >= maxBorrow ? 0 : maxBorrow - currentDebt;
    }

    // ─── Interest Accrual ──────────────────────────────────────────────────────

    /// @notice Accrue interest to the global index (call before any state change)
    function _accrueInterest() internal {
        if (block.timestamp <= lastAccrualTime) return;

        uint256 elapsed = block.timestamp - lastAccrualTime;
        // Per-second rate = APR / SECONDS_PER_YEAR
        // New index = old index * (1 + rate * elapsed)
        uint256 rateAccrued = (APR_BPS * elapsed * INDEX_PRECISION) /
            (10000 * SECONDS_PER_YEAR);
        globalInterestIndex += rateAccrued;
        lastAccrualTime = block.timestamp;
    }

    /// @notice Get the current debt for a credit line including accrued interest
    function _getCurrentDebt(CreditLine storage cl) internal view returns (uint256) {
        if (cl.principal == 0) return 0;

        // Simulate current index without state mutation
        uint256 elapsed = block.timestamp - lastAccrualTime;
        uint256 rateAccrued = (APR_BPS * elapsed * INDEX_PRECISION) /
            (10000 * SECONDS_PER_YEAR);
        uint256 currentIndex = globalInterestIndex + rateAccrued;

        return (cl.principal * currentIndex) / cl.interestIndex;
    }

    /// @notice Get the USD value of a credit line's locked collateral
    /// @dev FIX C-01: Use getSharesValueUSD(cl.collateralShares) — NOT getUserPositionUSD(msg.sender).
    ///      After openCreditLine(), shares are held by THIS contract, not msg.sender.
    ///      getUserPositionUSD(msg.sender) would return 0 (or an unrelated balance), breaking all LTV checks.
    function _getCollateralUSD(CreditLine storage cl) internal view returns (uint256) {
        if (!cl.active || cl.collateralShares == 0) return 0;
        return IZeroXVault(cl.collateralVault).getSharesValueUSD(cl.collateralShares);
    }

    // ─── Flash Credit (Phase 2 — not yet implemented) ────────────────────────

    /// @inheritdoc IZeroXCredit
    function flashCredit(uint256, address, bytes calldata) external pure override {
        revert("ZeroXCredit: flash credit not yet available");
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function addAllowedVault(address vault) external onlyOwner {
        require(vault != address(0), "ZeroXCredit: zero address");
        allowedVaults[vault] = true;
    }

    function removeAllowedVault(address vault) external onlyOwner {
        allowedVaults[vault] = false;
    }

    function setBorrowToken(address token) external onlyOwner {
        require(token != address(0), "ZeroXCredit: zero address");
        borrowToken = IERC20(token);
    }

    function setScoreContract(address _score) external onlyOwner {
        require(_score != address(0), "ZeroXCredit: zero address");
        scoreContract = IZeroXScore(_score);
    }

    function setTreasury(address _treasury) external onlyOwner {
        treasury = _treasury;
    }

    function setReserveFactor(uint256 _factor) external onlyOwner {
        require(_factor <= 3000, "ZeroXCredit: reserve factor too high"); // Max 30%
        reserveFactor = _factor;
    }

    /// @notice Fund the protocol with borrow token liquidity
    function fundReserve(uint256 amount) external onlyOwner {
        borrowToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw protocol reserve earnings
    function withdrawReserve(address recipient, uint256 amount) external onlyOwner {
        require(amount <= protocolReserve, "ZeroXCredit: exceeds reserve");
        protocolReserve -= amount;
        borrowToken.safeTransfer(recipient, amount);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
