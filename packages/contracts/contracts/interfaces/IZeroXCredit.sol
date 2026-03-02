// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IZeroXCredit
/// @notice Interface for ZeroX credit line contract
interface IZeroXCredit {
    // ─── Structs ───────────────────────────────────────────────────────────────

    struct CreditLine {
        address collateralVault;   // Address of the ZeroXVault used as collateral
        uint256 collateralShares;  // Vault shares deposited as collateral
        uint256 principal;         // Outstanding principal (asset decimals)
        uint256 interestIndex;     // Global interest index snapshot at last interaction
        uint256 openedAt;          // Block timestamp when credit line was opened
        uint256 lastBorrowAt;      // Block timestamp of last borrow (used for on-time repay check)
        bool active;               // Whether the credit line is active
    }

    enum HealthStatus {
        HEALTHY,    // LTV < 40%
        WARNING,    // LTV >= 40% and < 50%
        CRITICAL,   // LTV >= 50% (at maximum borrow)
        AT_RISK,    // Collateral ratio approaching liquidation threshold
        LIQUIDATABLE // Collateral ratio <= 105%
    }

    // ─── Events ────────────────────────────────────────────────────────────────

    event CreditLineOpened(address indexed user, address indexed vault, uint256 shares);
    event Borrowed(address indexed user, uint256 amount, uint256 totalDebt, uint256 ltv);
    event Repaid(address indexed user, uint256 amount, uint256 remainingDebt, bool isFullRepay);
    event CollateralAdded(address indexed user, uint256 additionalShares, uint256 totalShares);
    event Liquidated(
        address indexed user,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 bonus
    );
    event CreditLineClosed(address indexed user, uint256 remainingCollateralReturned);
    event LiquidationTreasurySplit(
        address indexed borrower,
        uint256 liquidatorShares,
        uint256 protocolShares
    );

    /// @dev Phase 2: Flash credit fee event (not yet implemented)
    event FlashCreditExecuted(address indexed borrower, uint256 amount, uint256 fee);

    // ─── State-Changing Functions ──────────────────────────────────────────────

    /// @notice Open a credit line by depositing vault shares as collateral
    function openCreditLine(address vault, uint256 shares) external;

    /// @notice Borrow stablecoins against deposited collateral
    function borrow(uint256 amount) external;

    /// @notice Repay outstanding debt (partial or full)
    function repay(uint256 amount) external;

    /// @notice Add more collateral to an existing credit line
    function addCollateral(uint256 additionalShares) external;

    /// @notice Liquidate an at-risk credit line
    function liquidate(address user) external;

    /// @notice Close a credit line (must have zero debt)
    function closeCreditLine() external;

    /// @notice Set the protocol treasury for liquidation fee split
    function setTreasury(address _treasury) external;

    /// @dev Phase 2: Flash credit — borrow and repay within one transaction
    function flashCredit(uint256 amount, address callback, bytes calldata data) external;

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @notice Get the full credit line for a user
    function getCreditLine(address user) external view returns (CreditLine memory);

    /// @notice Get current debt including accrued interest
    function getCurrentDebt(address user) external view returns (uint256);

    /// @notice Get the current collateral value in USD (via vault price feed)
    function getCollateralValueUSD(address user) external view returns (uint256);

    /// @notice Get current LTV in basis points (debt / collateral * 10000)
    function getLTV(address user) external view returns (uint256);

    /// @notice Get health status enum
    function getHealthStatus(address user) external view returns (HealthStatus);

    /// @notice Get maximum additional amount the user can borrow
    function getAvailableCredit(address user) external view returns (uint256);
}
