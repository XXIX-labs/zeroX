// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IZeroXScore
/// @notice Interface for the ZeroX on-chain credit scoring contract
interface IZeroXScore {
    // ─── Structs ───────────────────────────────────────────────────────────────

    struct ScoreData {
        uint16 score;                  // Current score: 300 - 850
        uint40 lastUpdated;            // Unix timestamp of last score update
        uint32 repaymentSignal;        // 0-10000 bps: repayment history quality
        uint32 utilizationSignal;      // 0-10000 bps: credit utilization (inverse)
        uint32 accountAgeSignal;       // 0-10000 bps: account age
        uint32 collateralSignal;       // 0-10000 bps: collateral health
        uint32 diversificationSignal;  // 0-10000 bps: multi-vault usage
        uint32 totalRepayments;        // Cumulative repayment count
        uint32 onTimeRepayments;       // Repayments within billing cycle
        uint32 totalVolumeUSD;         // Cumulative volume in USD (capped at uint32 max)
        uint8  liquidationCount;       // Number of times liquidated
        uint40 firstDepositAt;         // Timestamp of first vault deposit
    }

    enum CreditEventType {
        DEPOSIT,
        WITHDRAWAL,
        BORROW,
        REPAY_ONTIME,
        REPAY_LATE,
        LIQUIDATION,
        COLLATERAL_ADDED,
        CREDIT_LINE_OPENED,
        CREDIT_LINE_CLOSED
    }

    // Score tier thresholds
    // EXCELLENT: 750 - 850
    // VERY_GOOD: 700 - 749
    // GOOD:      650 - 699
    // FAIR:      580 - 649
    // POOR:      300 - 579

    // ─── Events ────────────────────────────────────────────────────────────────

    event ScoreInitialized(address indexed user, uint16 initialScore);
    event ScoreUpdated(address indexed user, uint16 oldScore, uint16 newScore, CreditEventType trigger);
    event SignalsUpdated(address indexed user, uint32[5] signals);

    // ─── State-Changing Functions ──────────────────────────────────────────────

    /// @notice Initialize a score for a new user (called by vault on first deposit)
    function initializeScore(address user) external;

    /// @notice Record a credit event and recompute the user's score
    function recordEvent(address user, CreditEventType eventType, uint256 amountUSD) external;

    /// @notice Update utilization and collateral signals (called by ZeroXCredit after borrow/repay)
    function updatePositionSignals(
        address user,
        uint256 currentDebt,
        uint256 maxBorrowable,
        uint256 collateralRatioBps
    ) external;

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @notice Get a user's current score (300-850)
    function getScore(address user) external view returns (uint16);

    /// @notice Get all score data for a user
    function getScoreData(address user) external view returns (ScoreData memory);

    /// @notice Get the risk tier string for a score value
    function getRiskTier(uint16 score) external pure returns (string memory);

    /// @notice Returns true if a user has been initialized
    function isInitialized(address user) external view returns (bool);
}
