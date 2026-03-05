// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../../contracts/ZeroXScore.sol";
import "../../contracts/libraries/ScoreCalculator.sol";

/// @notice Invariant test: score is ALWAYS in [300, 850]
contract ZeroXScoreInvariantTest is Test {
    ZeroXScore public score;
    address public owner = address(0x1);
    address public updater = address(0x2);
    address public user = address(0x3);

    function setUp() public {
        vm.startPrank(owner);
        score = new ZeroXScore(owner);
        score.setScoreUpdater(updater);
        score.setVaultAuthorized(updater, true);
        vm.stopPrank();

        // Initialize user
        vm.prank(updater);
        score.initializeScore(user);
    }

    // ─── Invariant ─────────────────────────────────────────────────────────

    /// @notice The credit score must always be in [300, 850]
    function invariant_scoreBounds() public view {
        uint16 s = score.getScore(user);
        assertGe(uint256(s), 300, "Score below minimum");
        assertLe(uint256(s), 850, "Score above maximum");
    }

    /// @notice Score of uninitialized user is always 0
    function invariant_uninitializedScoreIsZero() public view {
        address uninitialized = address(0x9999);
        assertEq(score.getScore(uninitialized), 0, "Uninitialized score should be 0");
    }
}

/// @notice Fuzz test: score computation for any combination of signals
contract ZeroXScoreCalculatorFuzz is Test {

    function testFuzz_scoreAlwaysInBounds(
        uint32 repayment,
        uint32 utilization,
        uint32 age,
        uint32 collateral,
        uint32 diversify
    ) public pure {
        // Clamp to valid range
        repayment   = uint32(bound(uint256(repayment),   0, 10000));
        utilization = uint32(bound(uint256(utilization), 0, 10000));
        age         = uint32(bound(uint256(age),         0, 10000));
        collateral  = uint32(bound(uint256(collateral),  0, 10000));
        diversify   = uint32(bound(uint256(diversify),   0, 10000));

        uint16 s = ScoreCalculator.computeScore(
            repayment, utilization, age, collateral, diversify
        );

        assertGe(uint256(s), 300, "Score below min");
        assertLe(uint256(s), 850, "Score above max");
    }

    function testFuzz_repaymentSignalInBounds(
        uint32 onTime,
        uint32 total,
        uint8 liquidations
    ) public pure {
        total = uint32(bound(uint256(total), 0, 10000));
        onTime = uint32(bound(uint256(onTime), 0, total));
        uint32 sig = ScoreCalculator.repaymentSignal(onTime, total, liquidations);
        assertLe(uint256(sig), 10000, "Repayment signal out of bounds");
    }

    function testFuzz_ageSignalInBounds(uint32 firstDepositAt, uint32 currentTime) public pure {
        // Ensure currentTime >= firstDepositAt
        vm.assume(currentTime >= firstDepositAt);
        uint32 sig = ScoreCalculator.ageSignal(
            uint256(firstDepositAt),
            uint256(currentTime)
        );
        assertLe(uint256(sig), 10000, "Age signal out of bounds");
    }
}
