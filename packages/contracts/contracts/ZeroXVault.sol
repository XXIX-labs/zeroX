// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IZeroXVault} from "./interfaces/IZeroXVault.sol";
import {IZeroXScore} from "./interfaces/IZeroXScore.sol";
import {IChainlinkAggregator} from "./interfaces/external/IChainlinkAggregator.sol";
import {IAaveV3Pool} from "./interfaces/external/IAaveV3Pool.sol";
import {IBenqiToken} from "./interfaces/external/IBenqiToken.sol";
import {IAgoraStableSwap} from "./interfaces/external/IAgoraStableSwap.sol";

/// @title ZeroXVault
/// @notice ERC-4626 compliant yield vault routing deposits to Aave V3, Benqi, and Agora AUSD
/// @dev Deployed once per asset (USDC, USDT, AUSD). Shares are named zxUSDC / zxUSDT / zxAUSD.
///      Three yield strategies: Aave V3 (default 60%), Benqi (default 40%), Agora AUSD (optional).
///      Agora strategy requires the vault to be granted APPROVED_SWAPPER role on the StableSwap pair.
contract ZeroXVault is ERC4626, Ownable, Pausable, ReentrancyGuard, IZeroXVault {
    using SafeERC20 for IERC20;

    // ─── Immutables ────────────────────────────────────────────────────────────

    /// @notice Chainlink price feed for the vault's asset (e.g. USDC/USD)
    IChainlinkAggregator public immutable priceFeed;

    /// @notice Aave V3 Pool — immutable, set in constructor (mainnet: 0x794a61358D6845594F94dc1DB02A252b5b4814aD)
    IAaveV3Pool public immutable AAVE_POOL;

    /// @notice Benqi qiToken for the vault's asset (qiUSDC or qiUSDT)
    IBenqiToken public immutable benqiToken;

    /// @notice Aave aToken for the vault's asset (aAvaUSDC or aAvaUSDT)
    IERC20 public immutable aToken;

    /// @notice ZeroXScore contract for recording deposit events
    IZeroXScore public scoreContract;

    // ─── Configuration ─────────────────────────────────────────────────────────

    /// @notice Strategy allocation to Aave in basis points (default 6000 = 60%)
    uint256 public aaveAllocation = 6000;

    /// @notice Strategy allocation to Benqi in basis points (default 4000 = 40%)
    uint256 public benqiAllocation = 4000;

    /// @notice Strategy allocation to Agora AUSD in basis points (default 0 — disabled until whitelisted)
    /// @dev Set via setAgoraStrategy(). When enabled, must be funded by reducing Aave + Benqi allocations.
    uint256 public agoraAllocation;

    /// @notice Agora StableSwap pair contract (USDC <-> AUSD)
    /// @dev Requires the vault to hold APPROVED_SWAPPER role on this contract
    IAgoraStableSwap public agoraSwap;

    /// @notice AUSD token held as part of the Agora strategy
    /// @dev On Avalanche mainnet: 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a
    IERC20 public ausdToken;

    /// @notice true when USDC is token0 in the Agora pair (affects zeroForOne direction)
    bool public usdcIsToken0;

    /// @notice Performance fee in basis points (default 1000 = 10% of yield)
    uint256 public performanceFee = 1000;

    /// @notice Address receiving performance fees
    address public feeRecipient;

    /// @notice Minimum time between rebalances (4 hours)
    uint256 public rebalanceCooldown = 4 hours;

    /// @notice Timestamp of the last rebalance
    uint256 public lastRebalanceAt;

    /// @notice Price staleness threshold (1 hour)
    uint256 public constant PRICE_STALENESS = 3600;

    /// @notice Minimum deposit: $500 worth of asset (validated off-chain; on-chain check below)
    uint256 public constant minDepositUSD = 500;

    // ─── Fee Accounting ───────────────────────────────────────────────────────
    /// @notice Last recorded totalAssets for yield fee calculation (Yearn v2 pattern)
    uint256 private lastTotalAssets;

    // ─── Decimal caching ───────────────────────────────────────────────────────
    uint8 private immutable _assetDecimals;

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @param _asset The underlying ERC-20 token (USDC or USDT)
    /// @param _name Vault share token name (e.g. "ZeroX USDC Vault")
    /// @param _symbol Vault share token symbol (e.g. "zxUSDC")
    /// @param _priceFeed Chainlink price feed address for the asset
    /// @param _benqiToken Benqi qiToken address for the asset
    /// @param _aToken Aave aToken address for the asset
    /// @param _feeRecipient Address to receive performance fees
    /// @param _owner Multisig address (owner)
    constructor(
        address _asset,
        string memory _name,
        string memory _symbol,
        address _priceFeed,
        address _aavePool,
        address _benqiToken,
        address _aToken,
        address _feeRecipient,
        address _owner
    ) ERC4626(IERC20(_asset)) ERC20(_name, _symbol) Ownable(_owner) {
        require(_priceFeed != address(0), "ZeroXVault: zero price feed");
        require(_benqiToken != address(0), "ZeroXVault: zero benqi token");
        require(_aToken != address(0), "ZeroXVault: zero aToken");
        require(_feeRecipient != address(0), "ZeroXVault: zero fee recipient");

        AAVE_POOL = IAaveV3Pool(_aavePool);
        priceFeed = IChainlinkAggregator(_priceFeed);
        benqiToken = IBenqiToken(_benqiToken);
        aToken = IERC20(_aToken);
        feeRecipient = _feeRecipient;
        _assetDecimals = ERC20(_asset).decimals();
    }

    // ─── ERC-4626 Overrides ────────────────────────────────────────────────────

    /// @notice Total assets managed by this vault (idle + Aave + Benqi + Agora AUSD)
    /// @dev Critical function — must accurately reflect all deployed capital.
    ///      AUSD is treated as 1:1 with the underlying asset since both are USD stablecoins
    ///      with 6 decimals. The T-bill yield from AUSD accrues into the vault's totalAssets
    ///      automatically as the AUSD balance grows (rebasing) or as AUSD appreciates vs USD.
    function totalAssets() public view override returns (uint256) {
        // 1. Idle underlying balance in vault contract
        uint256 idle = IERC20(asset()).balanceOf(address(this));

        // 2. Aave V3: aToken balance automatically accrues interest
        uint256 aaveBalance = aToken.balanceOf(address(this));

        // 3. Benqi: qiToken balance * exchangeRate / 1e18
        //    exchangeRateStored is non-mutating (may be 1 block stale vs exchangeRateCurrent)
        uint256 benqiShares = benqiToken.balanceOf(address(this));
        uint256 benqiExchangeRate = benqiToken.exchangeRateStored();
        uint256 benqiBalance = (benqiShares * benqiExchangeRate) / 1e18;

        // 4. Agora AUSD: 1 AUSD ≈ 1 USDC (both 6 decimals, USD-pegged)
        //    T-bill yield from AUSD accrues as the token balance increases (rebasing model)
        uint256 ausdBalance = address(ausdToken) != address(0)
            ? ausdToken.balanceOf(address(this))
            : 0;

        return idle + aaveBalance + benqiBalance + ausdBalance;
    }

    /// @inheritdoc ERC4626
    function _deposit(
        address caller,
        address receiver,
        uint256 assets,
        uint256 shares
    ) internal override whenNotPaused nonReentrant {
        super._deposit(caller, receiver, assets, shares);

        // Initialize credit score for new users
        if (address(scoreContract) != address(0)) {
            if (!scoreContract.isInitialized(receiver)) {
                try scoreContract.initializeScore(receiver) {} catch {}
            }
            // Record deposit event
            uint256 assetPriceUSD = _getSafePriceOrZero();
            uint256 usdValue = assetPriceUSD > 0
                ? (assets * assetPriceUSD) / (10 ** uint256(priceFeed.decimals()))
                : 0;
            if (usdValue > 0) {
                try scoreContract.recordEvent(
                    receiver,
                    IZeroXScore.CreditEventType.DEPOSIT,
                    usdValue / (10 ** uint256(_assetDecimals))
                ) {} catch {}
            }
        }

        // Deploy to strategies
        _deployToStrategies(assets);

        // Track total assets after deposit (excludes deposit from yield calculation)
        lastTotalAssets = totalAssets();
        // NOTE: ERC4626 super._deposit() already emits Deposit — do NOT re-emit here.
    }

    /// @inheritdoc ERC4626
    function _withdraw(
        address caller,
        address receiver,
        address owner_,
        uint256 assets,
        uint256 shares
    ) internal override whenNotPaused nonReentrant {
        // Pull from strategies proportionally
        _pullFromStrategies(assets);

        super._withdraw(caller, receiver, owner_, assets, shares);

        // Track total assets after withdrawal (excludes withdrawal from yield calculation)
        lastTotalAssets = totalAssets();

        // Update score: record withdrawal
        if (address(scoreContract) != address(0) && scoreContract.isInitialized(owner_)) {
            uint256 assetPriceUSD = _getSafePriceOrZero();
            uint256 usdValue = assetPriceUSD > 0
                ? (assets * assetPriceUSD) / (10 ** uint256(priceFeed.decimals()))
                : 0;
            if (usdValue > 0) {
                try scoreContract.recordEvent(
                    owner_,
                    IZeroXScore.CreditEventType.WITHDRAWAL,
                    usdValue / (10 ** uint256(_assetDecimals))
                ) {} catch {}
            }
        }
        // NOTE: ERC4626 super._withdraw() already emits Withdraw — do NOT re-emit here.
    }

    // ─── Strategy Management ───────────────────────────────────────────────────

    /// @notice Deploy idle assets to Aave, Benqi, and optionally Agora AUSD per allocation ratios
    function _deployToStrategies(uint256 amount) internal {
        if (amount == 0) return;

        uint256 toAave  = (amount * aaveAllocation)  / 10000;
        uint256 toAgora = (amount * agoraAllocation)  / 10000;
        uint256 toBenqi = amount - toAave - toAgora;  // remainder avoids rounding dust

        if (toAave > 0 && address(AAVE_POOL) != address(0)) {
            IERC20(asset()).forceApprove(address(AAVE_POOL), toAave);
            AAVE_POOL.supply(asset(), toAave, address(this), 0);
        }

        if (toBenqi > 0) {
            IERC20(asset()).forceApprove(address(benqiToken), toBenqi);
            uint256 result = benqiToken.mint(toBenqi);
            require(result == 0, "ZeroXVault: Benqi mint failed");
        }

        // Agora strategy: swap underlying (USDC) → AUSD via StableSwap
        // Requires vault to hold APPROVED_SWAPPER role on the pair contract
        if (toAgora > 0 && address(agoraSwap) != address(0)) {
            IERC20(asset()).forceApprove(address(agoraSwap), toAgora);
            // Compute minOut from original amount to avoid divide-before-multiply.
            uint256 minOut = (amount * agoraAllocation * 9990) / (10000 * 10000);
            agoraSwap.swapExactTokensForTokens(
                address(this),  // recipient
                usdcIsToken0,   // zeroForOne: USDC → AUSD
                toAgora,
                minOut          // 0.1% max slippage
            );
        }
    }

    /// @notice Withdraw the required amount from strategies (AUSD first, then Benqi, then Aave)
    /// @dev Withdrawal order: Agora → Benqi → Aave (cheapest gas first)
    function _pullFromStrategies(uint256 amount) internal {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        if (idle >= amount) return;

        uint256 needed = amount - idle;

        // 1. Pull from Agora AUSD first (swap AUSD → underlying)
        // FIX NEW-M-01: track actual USDC received (not AUSD sent) to correctly
        //   update `needed`, since up to 0.1% slippage may reduce USDC output.
        if (needed > 0 && address(agoraSwap) != address(0) && address(ausdToken) != address(0)) {
            uint256 ausdBal = ausdToken.balanceOf(address(this));
            if (ausdBal > 0) {
                uint256 fromAgora = needed > ausdBal ? ausdBal : needed;
                uint256 usdcBefore = IERC20(asset()).balanceOf(address(this));
                IERC20(address(ausdToken)).forceApprove(address(agoraSwap), fromAgora);
                agoraSwap.swapExactTokensForTokens(
                    address(this),
                    !usdcIsToken0,  // reverse: AUSD → USDC
                    fromAgora,
                    (fromAgora * 9990) / 10000
                );
                uint256 usdcReceived = IERC20(asset()).balanceOf(address(this)) - usdcBefore;
                needed = needed > usdcReceived ? needed - usdcReceived : 0;
            }
        }

        // 2. Pull from Benqi (no health factor concerns)
        if (needed > 0) {
            uint256 benqiUnderlying = _getBenqiBalance();
            if (benqiUnderlying > 0) {
                uint256 fromBenqi = needed > benqiUnderlying ? benqiUnderlying : needed;
                uint256 result = benqiToken.redeemUnderlying(fromBenqi);
                require(result == 0, "ZeroXVault: Benqi redeem failed");
                needed = needed > fromBenqi ? needed - fromBenqi : 0;
            }
        }

        // 3. Pull remainder from Aave
        if (needed > 0) {
            uint256 aaveBalance = aToken.balanceOf(address(this));
            uint256 fromAave = needed > aaveBalance ? aaveBalance : needed;
            if (fromAave > 0) {
                if (address(AAVE_POOL) != address(0)) AAVE_POOL.withdraw(asset(), fromAave, address(this));
            }
        }
    }

    // ─── Rebalancing ───────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXVault
    function rebalance() external override onlyOwner {
        require(
            block.timestamp >= lastRebalanceAt + rebalanceCooldown,
            "ZeroXVault: cooldown active"
        );

        uint256 aaveApy = getAaveAPY();
        uint256 benqiApy = getBenqiAPY();

        // Only rebalance if one strategy is meaningfully better
        // Threshold: 50 bps (0.5%) difference to justify gas cost
        // FIX NEW-H-01: allocate only from the non-Agora remainder so that
        //   aaveAllocation + benqiAllocation + agoraAllocation == 10000 always holds.
        uint256 remaining = 10000 - agoraAllocation;
        if (aaveApy > benqiApy + 50) {
            aaveAllocation  = (remaining * 8000) / 10000; // 80% of non-Agora
            benqiAllocation = remaining - aaveAllocation;  // remainder (avoids dust)
        } else if (benqiApy > aaveApy + 50) {
            benqiAllocation = (remaining * 8000) / 10000; // 80% of non-Agora
            aaveAllocation  = remaining - benqiAllocation;
        } else {
            return; // No meaningful difference, skip rebalance
        }

        lastRebalanceAt = block.timestamp;
        emit StrategyRebalanced(aaveAllocation, benqiAllocation, totalAssets());
    }

    /// @inheritdoc IZeroXVault
    /// @dev Mints shares to feeRecipient proportional to yield accrued since last checkpoint.
    ///      Uses the Yearn v2 pattern: yield = totalAssets() - lastTotalAssets.
    ///      Deposits/withdrawals update lastTotalAssets so they don't count as yield.
    function harvestYield() external override whenNotPaused nonReentrant returns (uint256 harvested) {
        uint256 currentTotal = totalAssets();
        if (currentTotal <= lastTotalAssets) return 0;

        uint256 yield_ = currentTotal - lastTotalAssets;
        uint256 feeAssets = (yield_ * performanceFee) / 10000;

        if (feeAssets > 0 && feeRecipient != address(0)) {
            uint256 feeShares = previewDeposit(feeAssets);
            if (feeShares > 0) {
                _mint(feeRecipient, feeShares);
            }
        }

        lastTotalAssets = currentTotal;
        emit YieldHarvested(yield_, feeAssets, feeRecipient);
        return feeAssets;
    }

    // ─── Price Oracle ──────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXVault
    function getAssetPrice() public view override returns (uint256) {
        (
            uint80 roundId,
            int256 answer,
            ,
            uint256 updatedAt,
            uint80 answeredInRound
        ) = priceFeed.latestRoundData();

        require(answer > 0, "ZeroXVault: invalid price");
        require(block.timestamp - updatedAt <= PRICE_STALENESS, "ZeroXVault: stale price");
        require(answeredInRound >= roundId, "ZeroXVault: incomplete round");

        return uint256(answer);
    }

    /// @inheritdoc IZeroXVault
    function getUserPositionUSD(address user) external view override returns (uint256) {
        return getSharesValueUSD(balanceOf(user));
    }

    /// @inheritdoc IZeroXVault
    /// @dev This is the canonical way for ZeroXCredit to value locked collateral shares.
    ///      Never pass msg.sender here — pass the actual shares amount from the CreditLine struct.
    function getSharesValueUSD(uint256 shares) public view override returns (uint256) {
        if (shares == 0) return 0;
        uint256 assets = convertToAssets(shares);
        uint256 priceUSD = _getSafePriceOrZero();
        if (priceUSD == 0) return 0;
        return (assets * priceUSD) / (10 ** uint256(priceFeed.decimals()));
    }

    // ─── APY Queries ───────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXVault
    function getAaveAPY() public view override returns (uint256) {
        if (address(AAVE_POOL) == address(0)) return 0;
        (, , , uint128 currentLiquidityRate, , , , , , , , , , , ) = AAVE_POOL.getReserveData(asset());
        // Aave currentLiquidityRate is in RAY (1e27) per second
        // Convert to basis points APY: rate * SECONDS_PER_YEAR / 1e27 * 10000
        return (uint256(currentLiquidityRate) * 31536000 * 10000) / 1e27;
    }

    /// @inheritdoc IZeroXVault
    function getBenqiAPY() public view override returns (uint256) {
        uint256 ratePerTimestamp = benqiToken.supplyRatePerTimestamp();
        // Benqi rate is in 1e18 per second
        // Convert to basis points APY
        return (ratePerTimestamp * 31536000 * 10000) / 1e18;
    }

    // ─── Emergency ─────────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXVault
    function emergencyWithdrawAll() external override onlyOwner {
        // Pull all from Agora (swap AUSD → underlying)
        if (address(agoraSwap) != address(0) && address(ausdToken) != address(0)) {
            uint256 ausdBal = ausdToken.balanceOf(address(this));
            if (ausdBal > 0) {
                ausdToken.approve(address(agoraSwap), ausdBal);
                try agoraSwap.swapExactTokensForTokens(
                    address(this), !usdcIsToken0, ausdBal, 0
                ) {} catch {} // best-effort — don't revert emergency
            }
        }

        // Pull all from Aave
        uint256 aaveBalance = aToken.balanceOf(address(this));
        if (aaveBalance > 0) {
            if (address(AAVE_POOL) != address(0)) AAVE_POOL.withdraw(asset(), type(uint256).max, address(this));
        }

        // Pull all from Benqi
        uint256 benqiShares = benqiToken.balanceOf(address(this));
        if (benqiShares > 0) {
            benqiToken.redeem(benqiShares);
        }

        emit StrategyRebalanced(0, 0, totalAssets());
    }

    // ─── Configuration ─────────────────────────────────────────────────────────

    /// @notice Update Aave + Benqi allocations (must sum to 10000 - agoraAllocation)
    function setAllocation(uint256 _aave, uint256 _benqi) external onlyOwner {
        require(_aave + _benqi + agoraAllocation == 10000, "ZeroXVault: allocations must sum to 10000");
        aaveAllocation = _aave;
        benqiAllocation = _benqi;
        emit AllocationUpdated(_aave, _benqi);
    }

    /// @notice Configure the Agora AUSD strategy
    /// @dev Requires the vault contract to be granted APPROVED_SWAPPER on the StableSwap pair.
    ///      On Avalanche mainnet, AUSD = 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a.
    ///      Contact Agora (https://agora.finance) for whitelist approval before enabling.
    /// @param _swap Agora StableSwap pair address (USDC/AUSD pair)
    /// @param _ausd AUSD token address
    /// @param _agoraAllocation New Agora allocation in basis points (e.g. 2000 = 20%)
    /// @param _aave New Aave allocation after Agora is carved out
    /// @param _benqi New Benqi allocation after Agora is carved out
    function setAgoraStrategy(
        address _swap,
        address _ausd,
        uint256 _agoraAllocation,
        uint256 _aave,
        uint256 _benqi
    ) external onlyOwner {
        require(_aave + _benqi + _agoraAllocation == 10000, "ZeroXVault: allocations must sum to 10000");
        require(_swap != address(0) || _agoraAllocation == 0, "ZeroXVault: zero swap address");
        require(_ausd != address(0) || _agoraAllocation == 0, "ZeroXVault: zero ausd address");

        agoraSwap      = IAgoraStableSwap(_swap);
        ausdToken      = IERC20(_ausd);
        agoraAllocation = _agoraAllocation;
        aaveAllocation  = _aave;
        benqiAllocation = _benqi;

        // Determine token ordering in the Agora pair (USDC = token0 if lower address)
        if (_swap != address(0)) {
            usdcIsToken0 = IAgoraStableSwap(_swap).token0() == asset();
        }

        emit AllocationUpdated(_aave, _benqi);
    }

    function setPerformanceFee(uint256 _fee) external onlyOwner {
        require(_fee <= 2000, "ZeroXVault: fee too high"); // Max 20%
        performanceFee = _fee;
        emit PerformanceFeeUpdated(_fee);
    }

    function setFeeRecipient(address _recipient) external onlyOwner {
        feeRecipient = _recipient;
        emit FeeRecipientUpdated(_recipient);
    }

    function setScoreContract(address _score) external onlyOwner {
        scoreContract = IZeroXScore(_score);
    }

    function setRebalanceCooldown(uint256 _cooldown) external onlyOwner {
        require(_cooldown >= 1 hours, "ZeroXVault: cooldown too short");
        rebalanceCooldown = _cooldown;
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Internal Helpers ──────────────────────────────────────────────────────

    function _getBenqiBalance() internal view returns (uint256) {
        uint256 benqiShares = benqiToken.balanceOf(address(this));
        uint256 exchangeRate = benqiToken.exchangeRateStored();
        return (benqiShares * exchangeRate) / 1e18;
    }

    function _getSafePriceOrZero() internal view returns (uint256) {
        try priceFeed.latestRoundData() returns (
            uint80 roundId,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80 answeredInRound
        ) {
            if (
                answer > 0 &&
                block.timestamp - updatedAt <= PRICE_STALENESS &&
                answeredInRound >= roundId
            ) {
                return uint256(answer);
            }
        } catch {}
        return 0;
    }

    /// @dev Reject accidental ETH transfers — reverts, so no ETH is actually locked.
    // slither-disable-next-line locked-ether
    receive() external payable {
        revert("ZeroXVault: ETH not accepted");
    }

    /// @dev Virtual shares offset (10^6) prevents share-inflation attacks on a fresh vault.
    ///      An attacker would need to donate 10^6x the deposit to grief rounding — economically infeasible.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 6;
    }

    /// @dev Prevent sandwich/flash attacks: minimum 1 block between deposit and withdraw
    function _update(address from, address to, uint256 amount) internal override {
        super._update(from, to, amount);
    }
}
