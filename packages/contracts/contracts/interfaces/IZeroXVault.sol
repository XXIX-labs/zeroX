// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IZeroXVault
/// @notice Interface for ZeroX ERC-4626 yield vault
interface IZeroXVault {
    // ─── Events ────────────────────────────────────────────────────────────────

    // Note: Deposit / Withdraw events are declared in IERC4626 — not redeclared here.
    event StrategyRebalanced(
        uint256 newAaveAllocation,
        uint256 newBenqiAllocation,
        uint256 totalAssets
    );
    event YieldHarvested(uint256 yieldAmount, uint256 feeAmount, address feeRecipient);
    event AllocationUpdated(uint256 aaveAllocation, uint256 benqiAllocation);
    event PerformanceFeeUpdated(uint256 newFee);
    event FeeRecipientUpdated(address newRecipient);

    // Note: ERC-4626 core functions (asset, totalAssets, deposit, withdraw, redeem, etc.)
    // are declared in IERC4626 — not redeclared here to avoid conflict.

    // ─── ZeroX Extensions ─────────────────────────────────────────────────────

    /// @notice Get the current USD value of a user's vault position (via Chainlink)
    function getUserPositionUSD(address user) external view returns (uint256);

    /// @notice Get the USD value of an arbitrary number of vault shares (via Chainlink)
    /// @dev Used by ZeroXCredit to price locked collateral shares without relying on msg.sender
    function getSharesValueUSD(uint256 shares) external view returns (uint256);

    /// @notice Trigger strategy rebalancing (open to any caller, subject to cooldown)
    function rebalance() external;

    /// @notice Harvest yield and distribute performance fee
    function harvestYield() external returns (uint256 harvested);

    /// @notice Get the current Chainlink price for the vault's asset (8 decimals)
    function getAssetPrice() external view returns (uint256);

    /// @notice Returns the current Aave V3 utilization APY in basis points
    function getAaveAPY() external view returns (uint256);

    /// @notice Returns the current Benqi supply APY in basis points
    function getBenqiAPY() external view returns (uint256);

    /// @notice Emergency: pull all funds back to vault (multisig only)
    function emergencyWithdrawAll() external;
}
