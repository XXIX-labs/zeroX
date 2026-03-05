// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../../contracts/libraries/RiskMath.sol";
import "../../contracts/ZeroXVault.sol";
import "../../contracts/ZeroXCredit.sol";
import "../../contracts/ZeroXScore.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockAavePool.sol";
import "../../contracts/mocks/MockBenqi.sol";
import "../../contracts/mocks/MockChainlinkFeed.sol";

// ─── Fuzz: RiskMath library ─────────────────────────────────────────────────

/// @notice Fuzz tests for RiskMath library (the core of ZeroXCredit safety)
contract RiskMathFuzzTest is Test {

    // ─── LTV calculations ──────────────────────────────────────────────────

    /// @notice LTV should never exceed type(uint256).max when collateral > 0
    function testFuzz_ltvCalculation(uint128 debt, uint128 collateral) public pure {
        vm.assume(collateral > 0);
        uint256 ltv = RiskMath.calculateLTV(uint256(debt), uint256(collateral));
        // If debt < collateral, LTV should be < 10000 (100%)
        if (uint256(debt) < uint256(collateral)) {
            assertLt(ltv, 10000, "LTV should be < 100% when debt < collateral");
        }
    }

    /// @notice maxBorrowable is always 50% of collateral
    function testFuzz_maxBorrowable(uint256 collateral) public pure {
        collateral = bound(collateral, 0, type(uint128).max);
        uint256 maxBorrow = RiskMath.maxBorrowable(collateral);
        assertLe(maxBorrow, collateral, "Max borrow cannot exceed collateral");
        // Should be exactly 50%
        assertEq(maxBorrow, collateral / 2);
    }

    /// @notice A valid borrow at exactly 50% LTV should pass
    function testFuzz_validBorrowAt50Pct(uint128 collateral) public pure {
        vm.assume(collateral > 1);
        uint256 maxBorrow = RiskMath.maxBorrowable(uint256(collateral));
        bool valid = RiskMath.isValidBorrow(0, maxBorrow, uint256(collateral));
        assertTrue(valid, "Borrow at 50% LTV should be valid");
    }

    /// @notice Borrowing 1 wei over 50% should fail
    function testFuzz_invalidBorrowOverLimit(uint128 collateral) public pure {
        vm.assume(collateral > 2);
        uint256 maxBorrow = RiskMath.maxBorrowable(uint256(collateral));
        if (maxBorrow + 1 > 0) {
            bool valid = RiskMath.isValidBorrow(0, maxBorrow + 1, uint256(collateral));
            assertFalse(valid, "Borrow over 50% LTV should be invalid");
        }
    }

    // ─── Liquidation math ──────────────────────────────────────────────────

    /// @notice Position is liquidatable when collateral ratio <= 10500 bps (105%)
    function testFuzz_liquidationThreshold(uint128 debt, uint128 collateral) public pure {
        vm.assume(debt > 0 && collateral > 0);
        bool liquidatable = RiskMath.isLiquidatable(uint256(collateral), uint256(debt));
        uint256 ratio = RiskMath.calculateCollateralRatio(uint256(collateral), uint256(debt));

        if (ratio <= 10500) {
            assertTrue(liquidatable, "Should be liquidatable at ratio <= 105%");
        } else {
            assertFalse(liquidatable, "Should not be liquidatable at ratio > 105%");
        }
    }

    /// @notice Warning zone is correct
    function testFuzz_warningZone(uint128 debt, uint128 collateral) public pure {
        vm.assume(debt > 0 && collateral > 0);
        bool inWarning = RiskMath.isInWarningZone(uint256(collateral), uint256(debt));
        uint256 ratio = RiskMath.calculateCollateralRatio(uint256(collateral), uint256(debt));

        if (ratio < 12000) {
            assertTrue(inWarning, "Should be in warning zone when ratio < 120%");
        } else {
            assertFalse(inWarning, "Should not be in warning zone when ratio >= 120%");
        }
    }

    // ─── Liquidation bonus ─────────────────────────────────────────────────

    /// @notice Collateral to seize always covers the debt with bonus
    function testFuzz_liquidationBonus(uint64 debtToRepay) public pure {
        vm.assume(debtToRepay > 0);
        // Assume $1 collateral price (scaled to 1e8) and 6 decimals
        uint256 price = 1_00000000; // $1 = 1e8
        uint256 seized = RiskMath.calculateCollateralToSeize(
            uint256(debtToRepay),
            price,
            6
        );

        // Seized collateral value should be >= debtToRepay * 1.05
        uint256 scale = 10 ** 6; // token decimals
        uint256 seizedValue = (seized * price) / scale; // in 1e8 USD
        uint256 debtWithBonus = (uint256(debtToRepay) * 10500) / 10000;
        // Round-trip rounding: floor(debtWithBonus * scale / price) then * price / scale
        // can lose up to (price / scale) units. For $1 price (1e8) and 6-dec token: max loss = 100.
        uint256 tolerance = price / scale + 1;
        assertGe(seizedValue + tolerance, debtWithBonus, "Seized value must cover debt + bonus (within rounding)");
    }
}

// ─── Fuzz: ZeroXCredit with full contract stack ──────────────────────────────

/// @notice Full contract integration fuzz tests for ZeroXCredit
/// @dev Verifies the C-01 fix: collateral = getSharesValueUSD(locked shares)
contract ZeroXCreditFuzzTest is Test {
    ZeroXVault   public vault;
    ZeroXCredit  public credit;
    ZeroXScore   public score;
    MockERC20    public usdc;
    MockERC20    public aToken;
    MockAavePool public aavePool;
    MockBenqi    public benqi;
    MockChainlinkFeed public priceFeed;

    address constant OWNER         = address(0x1);
    address constant FEE_RECIPIENT = address(0x2);
    address constant ALICE         = address(0xA1CE);
    address constant BOB           = address(0xB0B);

    uint256 constant INITIAL_PRICE = 1_00000000; // $1.00, 8 dec

    function setUp() public {
        vm.startPrank(OWNER);

        usdc   = new MockERC20("USDC", "USDC", 6);
        aToken = new MockERC20("aUSDC", "aUSDC", 6);
        aavePool = new MockAavePool(address(usdc), address(aToken));
        benqi  = new MockBenqi(address(usdc), "qiUSDC", "qiUSDC");
        priceFeed = new MockChainlinkFeed(int256(INITIAL_PRICE), 8);

        score = new ZeroXScore(OWNER);

        vault = new ZeroXVault(
            address(usdc), "zxUSDC Vault", "zxUSDC",
            address(priceFeed), address(aavePool), address(benqi), address(aToken),
            FEE_RECIPIENT, OWNER
        );

        credit = new ZeroXCredit(address(usdc), address(score), OWNER);

        // Wire
        vault.setScoreContract(address(score));
        score.setVaultAuthorized(address(vault), true);
        score.setScoreUpdater(address(credit));
        credit.addAllowedVault(address(vault));

        // Fund Benqi and credit reserve
        usdc.mint(address(benqi),  1_000_000e6);
        usdc.mint(OWNER,           1_000_000e6);
        usdc.approve(address(credit), 1_000_000e6);
        credit.fundReserve(1_000_000e6);

        vm.stopPrank();
    }

    // ─── Invariant: C-01 fix ────────────────────────────────────────────────
    // After openCreditLine, getCollateralValueUSD must equal getSharesValueUSD(locked shares)
    // — never zero, never relying on msg.sender balance

    function testFuzz_collateralValueEqualsLockedShares(uint256 depositAmount) public {
        // Bound: $500 minimum to $1M max (6 decimals)
        depositAmount = bound(depositAmount, 500e6, 1_000_000e6);

        usdc.mint(ALICE, depositAmount);

        vm.startPrank(ALICE);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, ALICE);

        uint256 shares = vault.balanceOf(ALICE);
        vm.assume(shares > 0);

        // Capture expected value before shares move
        uint256 expectedUSD = vault.getSharesValueUSD(shares);
        vm.assume(expectedUSD >= 500e6);  // meets minimum

        vault.approve(address(credit), shares);
        credit.openCreditLine(address(vault), shares);
        vm.stopPrank();

        // C-01 invariant: Alice's vault balance must be 0 after openCreditLine
        assertEq(vault.balanceOf(ALICE), 0, "C-01: shares must be in credit contract");

        // Collateral USD must equal getSharesValueUSD(locked shares), NOT getUserPositionUSD(alice)
        uint256 collateralUSD = credit.getCollateralValueUSD(ALICE);
        uint256 lockedShares  = credit.getCreditLine(ALICE).collateralShares;
        uint256 sharesValue   = vault.getSharesValueUSD(lockedShares);

        assertGt(collateralUSD, 0, "C-01: collateral must be non-zero");
        assertEq(collateralUSD, sharesValue, "C-01: collateral must equal locked shares value");
    }

    // ─── Fuzz: borrow never exceeds 50% LTV ────────────────────────────────

    function testFuzz_borrowCannotExceed50PctLTV(
        uint256 depositAmount,
        uint256 borrowAmount
    ) public {
        depositAmount = bound(depositAmount, 1000e6, 500_000e6);
        usdc.mint(ALICE, depositAmount);

        vm.startPrank(ALICE);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, ALICE);
        uint256 shares = vault.balanceOf(ALICE);
        vault.approve(address(credit), shares);
        credit.openCreditLine(address(vault), shares);
        vm.stopPrank();

        uint256 maxBorrow = credit.getAvailableCredit(ALICE);
        borrowAmount = bound(borrowAmount, 1, maxBorrow);

        vm.prank(ALICE);
        credit.borrow(borrowAmount);

        uint256 ltv = credit.getLTV(ALICE);
        assertLe(ltv, 5000, "LTV must never exceed 50% via borrow()");
    }

    // ─── Fuzz: over-borrow always reverts ──────────────────────────────────

    function testFuzz_overBorrowReverts(uint256 depositAmount, uint256 excess) public {
        depositAmount = bound(depositAmount, 1000e6, 100_000e6);
        excess = bound(excess, 1, 1000e6);

        usdc.mint(ALICE, depositAmount);

        vm.startPrank(ALICE);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, ALICE);
        uint256 shares = vault.balanceOf(ALICE);
        vault.approve(address(credit), shares);
        credit.openCreditLine(address(vault), shares);
        vm.stopPrank();

        uint256 maxBorrow = credit.getAvailableCredit(ALICE);

        vm.prank(ALICE);
        vm.expectRevert("ZeroXCredit: exceeds maximum LTV");
        credit.borrow(maxBorrow + excess);
    }

    // ─── Fuzz: debt tracking is monotonically correct ──────────────────────

    /// @notice totalPrincipal must equal the sum of individual principals after operations
    function testFuzz_totalPrincipalTracking(
        uint256 aliceDeposit,
        uint256 aliceBorrow,
        uint256 bobDeposit,
        uint256 bobBorrow
    ) public {
        aliceDeposit = bound(aliceDeposit, 1000e6, 100_000e6);
        bobDeposit   = bound(bobDeposit,   1000e6, 100_000e6);

        // Set up Alice
        usdc.mint(ALICE, aliceDeposit);
        vm.startPrank(ALICE);
        usdc.approve(address(vault), aliceDeposit);
        vault.deposit(aliceDeposit, ALICE);
        uint256 aliceShares = vault.balanceOf(ALICE);
        vault.approve(address(credit), aliceShares);
        credit.openCreditLine(address(vault), aliceShares);
        vm.stopPrank();

        aliceBorrow = bound(aliceBorrow, 1, credit.getAvailableCredit(ALICE));
        vm.prank(ALICE);
        credit.borrow(aliceBorrow);

        // Set up Bob
        usdc.mint(BOB, bobDeposit);
        vm.startPrank(BOB);
        usdc.approve(address(vault), bobDeposit);
        vault.deposit(bobDeposit, BOB);
        uint256 bobShares = vault.balanceOf(BOB);
        vault.approve(address(credit), bobShares);
        credit.openCreditLine(address(vault), bobShares);
        vm.stopPrank();

        bobBorrow = bound(bobBorrow, 1, credit.getAvailableCredit(BOB));
        vm.prank(BOB);
        credit.borrow(bobBorrow);

        // totalPrincipal should equal alice + bob borrows
        uint256 alicePrincipal = credit.getCreditLine(ALICE).principal;
        uint256 bobPrincipal   = credit.getCreditLine(BOB).principal;

        assertEq(
            credit.totalPrincipal(),
            alicePrincipal + bobPrincipal,
            "totalPrincipal must equal sum of individual principals"
        );
    }

    // ─── Fuzz: getSharesValueUSD scales linearly with shares ───────────────

    function testFuzz_getSharesValueUSDScalesWithShares(uint256 depositAmount) public {
        depositAmount = bound(depositAmount, 1000e6, 500_000e6);
        usdc.mint(ALICE, depositAmount * 2);

        // Deposit twice to get some shares
        vm.startPrank(ALICE);
        usdc.approve(address(vault), depositAmount * 2);
        vault.deposit(depositAmount * 2, ALICE);
        vm.stopPrank();

        uint256 totalShares = vault.balanceOf(ALICE);
        vm.assume(totalShares >= 2);

        uint256 halfShares = totalShares / 2;
        uint256 fullValue  = vault.getSharesValueUSD(totalShares);
        uint256 halfValue  = vault.getSharesValueUSD(halfShares);

        // Half shares should be roughly half the value (within 1 wei rounding)
        assertApproxEqAbs(halfValue, fullValue / 2, 1, "Value must scale linearly with shares");
    }
}

// ─── Invariant Handler ───────────────────────────────────────────────────────

/// @notice Invariant test: protocol-wide invariants always hold
/// @dev Foundry calls handler functions randomly to fuzz state transitions
contract ZeroXCreditInvariantHandler is Test {
    ZeroXVault   public vault;
    ZeroXCredit  public credit;
    ZeroXScore   public score;
    MockERC20    public usdc;
    MockERC20    public aToken;
    MockBenqi    public benqi;
    MockChainlinkFeed public priceFeed;

    address[] public actors;
    uint256 public constant ACTOR_COUNT = 3;

    constructor(
        ZeroXVault _vault,
        ZeroXCredit _credit,
        ZeroXScore _score,
        MockERC20 _usdc,
        MockBenqi _benqi
    ) {
        vault  = _vault;
        credit = _credit;
        score  = _score;
        usdc   = _usdc;
        benqi  = _benqi;

        for (uint256 i = 0; i < ACTOR_COUNT; i++) {
            actors.push(address(uint160(0xAAAA + i)));
        }
    }

    function deposit(uint256 actorIdx, uint256 amount) external {
        actorIdx = bound(actorIdx, 0, ACTOR_COUNT - 1);
        amount   = bound(amount, 500e6, 50_000e6);

        address actor = actors[actorIdx];
        usdc.mint(actor, amount);

        vm.startPrank(actor);
        usdc.approve(address(vault), amount);
        try vault.deposit(amount, actor) {} catch {}
        vm.stopPrank();
    }

    function openCreditLine(uint256 actorIdx) external {
        actorIdx = bound(actorIdx, 0, ACTOR_COUNT - 1);
        address actor = actors[actorIdx];

        uint256 shares = vault.balanceOf(actor);
        if (shares == 0) return;

        IZeroXCredit.CreditLine memory cl = credit.getCreditLine(actor);
        if (cl.active) return;

        vm.startPrank(actor);
        vault.approve(address(credit), shares);
        try credit.openCreditLine(address(vault), shares) {} catch {}
        vm.stopPrank();
    }

    function borrow(uint256 actorIdx, uint256 amount) external {
        actorIdx = bound(actorIdx, 0, ACTOR_COUNT - 1);
        address actor = actors[actorIdx];

        uint256 maxBorrow = credit.getAvailableCredit(actor);
        if (maxBorrow == 0) return;
        amount = bound(amount, 1, maxBorrow);

        vm.prank(actor);
        try credit.borrow(amount) {} catch {}
    }

    function repay(uint256 actorIdx) external {
        actorIdx = bound(actorIdx, 0, ACTOR_COUNT - 1);
        address actor = actors[actorIdx];

        uint256 debt = credit.getCurrentDebt(actor);
        if (debt == 0) return;

        usdc.mint(actor, debt);
        vm.startPrank(actor);
        usdc.approve(address(credit), debt);
        try credit.repay(debt) {} catch {}
        vm.stopPrank();
    }
}

contract ZeroXCreditInvariantTest is Test {
    ZeroXVault   public vault;
    ZeroXCredit  public credit;
    ZeroXScore   public score;
    MockERC20    public usdc;
    MockERC20    public aToken;
    MockAavePool public aavePool;
    MockBenqi    public benqi;
    MockChainlinkFeed public priceFeed;
    ZeroXCreditInvariantHandler public handler;

    address constant OWNER         = address(0x1);
    address constant FEE_RECIPIENT = address(0x2);

    function setUp() public {
        vm.startPrank(OWNER);

        usdc      = new MockERC20("USDC", "USDC", 6);
        aToken    = new MockERC20("aUSDC", "aUSDC", 6);
        aavePool  = new MockAavePool(address(usdc), address(aToken));
        benqi     = new MockBenqi(address(usdc), "qiUSDC", "qiUSDC");
        priceFeed = new MockChainlinkFeed(1_00000000, 8);
        score     = new ZeroXScore(OWNER);

        vault = new ZeroXVault(
            address(usdc), "zxUSDC Vault", "zxUSDC",
            address(priceFeed), address(aavePool), address(benqi), address(aToken),
            FEE_RECIPIENT, OWNER
        );

        credit = new ZeroXCredit(address(usdc), address(score), OWNER);

        vault.setScoreContract(address(score));
        score.setVaultAuthorized(address(vault), true);
        score.setScoreUpdater(address(credit));
        credit.addAllowedVault(address(vault));

        usdc.mint(address(benqi), 10_000_000e6);
        usdc.mint(OWNER, 1_000_000e6);
        usdc.approve(address(credit), 1_000_000e6);
        credit.fundReserve(1_000_000e6);

        handler = new ZeroXCreditInvariantHandler(vault, credit, score, usdc, benqi);

        vm.stopPrank();

        // Only call handler functions during invariant runs
        targetContract(address(handler));
    }

    /// @notice LTV never exceeds 5000 bps (50%) for any active credit line
    function invariant_ltvNeverExceedsMax() public view {
        for (uint256 i = 0; i < 3; i++) {
            address actor = address(uint160(0xAAAA + i));
            IZeroXCredit.CreditLine memory cl = credit.getCreditLine(actor);
            if (cl.active && cl.principal > 0) {
                uint256 ltv = credit.getLTV(actor);
                assertLe(ltv, 5000, "LTV must never exceed 50%");
            }
        }
    }

    /// @notice totalPrincipal is always the sum of all individual principals
    function invariant_totalPrincipalConsistency() public view {
        uint256 sum = 0;
        for (uint256 i = 0; i < 3; i++) {
            address actor = address(uint160(0xAAAA + i));
            IZeroXCredit.CreditLine memory cl = credit.getCreditLine(actor);
            if (cl.active) {
                sum += cl.principal;
            }
        }
        assertEq(credit.totalPrincipal(), sum, "totalPrincipal must equal sum of principals");
    }

    /// @notice Collateral USD always equals getSharesValueUSD(locked shares) [C-01 invariant]
    function invariant_collateralEqualsLockedSharesValue() public view {
        for (uint256 i = 0; i < 3; i++) {
            address actor = address(uint160(0xAAAA + i));
            IZeroXCredit.CreditLine memory cl = credit.getCreditLine(actor);
            if (cl.active && cl.collateralShares > 0) {
                uint256 collateralUSD = credit.getCollateralValueUSD(actor);
                uint256 sharesValue   = vault.getSharesValueUSD(cl.collateralShares);
                assertEq(
                    collateralUSD,
                    sharesValue,
                    "C-01 invariant: collateral must equal locked shares value"
                );
            }
        }
    }

    /// @notice Score for any user with activity is always in [300, 850]
    function invariant_scoreBoundsForActiveUsers() public view {
        for (uint256 i = 0; i < 3; i++) {
            address actor = address(uint160(0xAAAA + i));
            if (score.isInitialized(actor)) {
                uint16 s = score.getScore(actor);
                assertGe(uint256(s), 300, "Score below 300");
                assertLe(uint256(s), 850, "Score above 850");
            }
        }
    }
}
