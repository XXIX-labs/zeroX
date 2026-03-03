// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title ScoreCalculator
/// @notice Pure math library for computing ZeroX credit scores (300-850)
/// @dev All signals are expressed in basis points (0-10000 = 0%-100%)
library ScoreCalculator {
    // ─── Constants ─────────────────────────────────────────────────────────────

    uint16 internal constant MIN_SCORE = 300;
    uint16 internal constant MAX_SCORE = 850;
    uint16 internal constant SCORE_RANGE = 550; // MAX - MIN
    uint16 internal constant INITIAL_SCORE = 600;

    uint256 internal constant BPS = 10000;

    // Signal weights (must sum to BPS = 10000)
    uint256 internal constant W_REPAYMENT    = 3500; // 35%
    uint256 internal constant W_UTILIZATION  = 3000; // 30%
    uint256 internal constant W_AGE          = 1500; // 15%
    uint256 internal constant W_COLLATERAL   = 1000; // 10%
    uint256 internal constant W_DIVERSIFY    = 500;  // 5%

    // Repayment signal penalties
    uint256 internal constant LIQUIDATION_PENALTY = 2500; // -25 points per liquidation
    uint256 internal constant LATE_REPAY_PENALTY  = 500;  // -5 points per late repayment

    // ─── Core Score Computation ────────────────────────────────────────────────

    /// @notice Compute a credit score from five signals
    /// @param repayBps       0-10000: 10000 = perfect repayment history
    /// @param utilBps        0-10000: 10000 = 0% utilization (inverse of utilization rate)
    /// @param ageBps         0-10000: 10000 = 365+ days of account history
    /// @param collateralBps  0-10000: 10000 = excellent collateral health (LTV close to 0)
    /// @param diversifyBps   0-10000: 10000 = using multiple vaults
    /// @return score The computed credit score in range [300, 850]
    function computeScore(
        uint32 repayBps,
        uint32 utilBps,
        uint32 ageBps,
        uint32 collateralBps,
        uint32 diversifyBps
    ) internal pure returns (uint16 score) {
        // Weighted sum: max possible = 10000 * 10000 = 100_000_000
        uint256 weightedSum =
            (uint256(repayBps)      * W_REPAYMENT) +
            (uint256(utilBps)       * W_UTILIZATION) +
            (uint256(ageBps)        * W_AGE) +
            (uint256(collateralBps) * W_COLLATERAL) +
            (uint256(diversifyBps)  * W_DIVERSIFY);

        // Normalize: max weightedSum = 10000 * 10000 = 100_000_000
        // score = MIN + RANGE * weightedSum / (10000 * 10000)
        uint256 computed = uint256(MIN_SCORE) + (uint256(SCORE_RANGE) * weightedSum) / (BPS * BPS);

        // Clamp to [300, 850]
        if (computed > uint256(MAX_SCORE)) return MAX_SCORE;
        return uint16(computed);
    }

    // ─── Signal Helpers ────────────────────────────────────────────────────────

    /// @notice Compute the repayment signal from repayment counts
    /// @param onTime Number of on-time repayments
    /// @param total Total number of repayments
    /// @param liquidations Number of liquidation events
    /// @return signal 0-10000 basis points
    function repaymentSignal(
        uint32 onTime,
        uint32 total,
        uint8 liquidations
    ) internal pure returns (uint32 signal) {
        // Base: ratio of on-time repayments (neutral 5000 if no history yet)
        uint256 base = (total == 0) ? 5000 : (uint256(onTime) * BPS) / uint256(total);

        // Subtract penalties for liquidations (capped at 0)
        uint256 penalty = uint256(liquidations) * LIQUIDATION_PENALTY;
        if (penalty >= base) return 0;

        uint256 result = base - penalty;
        return uint32(result > BPS ? BPS : result);
    }

    /// @notice Compute the utilization signal (inverse of LTV)
    /// @param currentDebt Outstanding debt
    /// @param maxBorrowable Maximum borrowable amount (collateral * 50% LTV)
    /// @return signal 0-10000 (10000 = 0% utilization, 0 = 100% utilization)
    function utilizationSignal(
        uint256 currentDebt,
        uint256 maxBorrowable
    ) internal pure returns (uint32 signal) {
        if (maxBorrowable == 0 || currentDebt == 0) return uint32(BPS); // 10000 = best
        if (currentDebt >= maxBorrowable) return 0;             // 0 = worst

        uint256 utilization = (currentDebt * BPS) / maxBorrowable;
        uint256 result = BPS - utilization; // invert: lower utilization = higher signal
        return uint32(result);
    }

    /// @notice Compute the account age signal
    /// @param firstDepositAt Unix timestamp of first deposit
    /// @param currentTime Current block timestamp
    /// @return signal 0-10000 (0 at day 0, 10000 at 365+ days)
    function ageSignal(
        uint256 firstDepositAt,
        uint256 currentTime
    ) internal pure returns (uint32 signal) {
        if (firstDepositAt == 0 || currentTime <= firstDepositAt) return 0;

        uint256 elapsed = currentTime - firstDepositAt;
        if (elapsed >= 365 days) return uint32(BPS);
        // elapsed < 365 days so elapsed*BPS < 3.16e12 — no overflow
        return uint32((elapsed * BPS) / (365 days));
    }

    /// @notice Compute collateral health signal from collateral ratio
    /// @param collateralRatioBps Current collateral ratio in basis points
    ///        e.g. 20000 = 200% collateral ratio (healthy), 10500 = 105% (at risk)
    /// @return signal 0-10000
    function collateralSignal(uint256 collateralRatioBps) internal pure returns (uint32 signal) {
        // 10500 bps (105%) = 0 signal, 20000 bps (200%+) = 10000 signal
        uint256 floor = 10500;
        uint256 ceiling = 20000;

        if (collateralRatioBps <= floor) return 0;
        if (collateralRatioBps >= ceiling) return uint32(BPS);

        return uint32(((collateralRatioBps - floor) * BPS) / (ceiling - floor));
    }

    /// @notice Compute diversification signal
    /// @param vaultCount Number of different vaults the user has deposited in
    /// @return signal 0-10000
    function diversifySignal(uint256 vaultCount) internal pure returns (uint32 signal) {
        if (vaultCount == 0) return 0;
        if (vaultCount == 1) return uint32(BPS / 2); // 5000 = 50%
        return uint32(BPS);                           // 10000 = 100% for 2+ vaults
    }

    // ─── Risk Tier ─────────────────────────────────────────────────────────────

    /// @notice Get a human-readable risk tier for a score
    function getRiskTier(uint16 score) internal pure returns (string memory) {
        if (score >= 750) return "EXCELLENT";
        if (score >= 700) return "VERY_GOOD";
        if (score >= 650) return "GOOD";
        if (score >= 580) return "FAIR";
        return "POOR";
    }
}
