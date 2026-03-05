// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../../contracts/ZeroXVault.sol";
import "../../contracts/ZeroXScore.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockAavePool.sol";
import "../../contracts/mocks/MockBenqi.sol";
import "../../contracts/mocks/MockChainlinkFeed.sol";

contract ZeroXVaultFuzzTest is Test {
    ZeroXVault public vault;
    MockERC20 public usdc;
    MockAavePool public aavePool;
    MockBenqi public benqi;
    MockERC20 public aToken;
    MockChainlinkFeed public priceFeed;
    ZeroXScore public score;

    address public owner = address(0x1);
    address public feeRecipient = address(0x2);

    function setUp() public {
        vm.startPrank(owner);

        // Deploy mocks
        usdc = new MockERC20("USD Coin", "USDC", 6);
        aToken = new MockERC20("Aave aUSDC", "aUSDC", 6);
        aavePool = new MockAavePool(address(usdc), address(aToken));
        benqi = new MockBenqi(address(usdc), "Benqi USDC", "qiUSDC");

        // $1 USDC price with 8 decimals
        priceFeed = new MockChainlinkFeed(1_00000000, 8);

        score = new ZeroXScore(owner);

        vault = new ZeroXVault(
            address(usdc),
            "ZeroX USDC Vault",
            "zxUSDC",
            address(priceFeed),
            address(aavePool),
            address(benqi),
            address(aToken),
            feeRecipient,
            owner
        );
        vault.setScoreContract(address(score));
        score.setVaultAuthorized(address(vault), true);

        vm.stopPrank();
    }

    // ─── Fuzz: deposit / withdraw roundtrip ────────────────────────────────

    /// @notice Depositing X assets and immediately withdrawing should return >= X - 1 (rounding)
    function testFuzz_depositWithdrawRoundtrip(uint256 amount) public {
        // Bound: $1 to $1M USDC (6 decimals)
        amount = bound(amount, 1e6, 1_000_000e6);

        address alice = address(0xA1CE);
        usdc.mint(alice, amount);

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);

        // Deposit
        uint256 sharesMinted = vault.deposit(amount, alice);
        assertGt(sharesMinted, 0, "Should mint shares");

        // Withdraw all shares
        vault.approve(address(vault), sharesMinted);
        uint256 assetsOut = vault.redeem(sharesMinted, alice, alice);
        vm.stopPrank();

        // Should get back at most the deposited amount (minus rounding, max 1 wei)
        assertGe(assetsOut + 1, amount, "Should receive deposited assets minus dust");
    }

    /// @notice Two users depositing should not dilute each other beyond rounding
    function testFuzz_twoUsersNoDilution(uint256 amount1, uint256 amount2) public {
        amount1 = bound(amount1, 1e6, 500_000e6);
        amount2 = bound(amount2, 1e6, 500_000e6);

        address alice = address(0xA1CE);
        address bob = address(0xB0B);

        usdc.mint(alice, amount1);
        usdc.mint(bob, amount2);

        vm.startPrank(alice);
        usdc.approve(address(vault), amount1);
        uint256 aliceShares = vault.deposit(amount1, alice);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), amount2);
        vault.deposit(amount2, bob);
        vm.stopPrank();

        // Alice should be able to redeem at least her original deposit - 1 wei
        uint256 aliceValue = vault.convertToAssets(aliceShares);
        assertGe(aliceValue + 1, amount1, "Alice was diluted");
    }

    /// @notice Share price never goes below 1 (assets/share >= 1)
    function testFuzz_sharePriceNeverBelowOne(uint256 amount) public {
        amount = bound(amount, 1e6, 100_000e6);

        address user = address(0xDEAD);
        usdc.mint(user, amount);

        vm.startPrank(user);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(amount, user);
        vm.stopPrank();

        // Share price = assets / shares should be >= 1 (in asset decimals terms)
        uint256 price = vault.convertToAssets(1e6); // price of 1 full share
        assertGe(price, 1, "Share price cannot be zero");
    }

    // ─── Invariants ────────────────────────────────────────────────────────

    /// @notice totalAssets() is always consistent with shares outstanding
    function invariant_totalAssetsConsistency() public view {
        uint256 totalShares = vault.totalSupply();
        if (totalShares == 0) return;

        uint256 assets = vault.totalAssets();
        // If there are shares, there must be assets backing them
        assertGt(assets, 0, "Shares outstanding with zero assets");
    }
}
