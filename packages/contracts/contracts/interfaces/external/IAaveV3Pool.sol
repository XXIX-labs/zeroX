// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAaveV3Pool
/// @notice Minimal interface for Aave V3 Pool on Avalanche C-Chain
/// @dev Aave V3 Pool address: 0x794a61358D6845594F94dc1DB02A252b5b4814aD
interface IAaveV3Pool {
    /// @notice Supply assets to Aave V3 to earn interest
    /// @param asset The address of the ERC-20 token to supply
    /// @param amount The amount to supply
    /// @param onBehalfOf The address that will receive the aTokens (use address(this))
    /// @param referralCode 0 unless part of a referral program
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    /// @notice Withdraw supplied assets from Aave V3
    /// @param asset The address of the ERC-20 token to withdraw
    /// @param amount The amount to withdraw (use type(uint256).max for full balance)
    /// @param to The address that will receive the withdrawn tokens
    /// @return The actual amount withdrawn
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);

    /// @notice Returns account data for a given address
    /// @param user The address of the user
    /// @return totalCollateralBase Total collateral in base currency (USD, 8 decimals)
    /// @return totalDebtBase Total debt in base currency
    /// @return availableBorrowsBase Available borrows in base currency
    /// @return currentLiquidationThreshold Current liquidation threshold (bps)
    /// @return ltv Loan-to-value ratio (bps)
    /// @return healthFactor Current health factor (1e18 = 1.0)
    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        );

    /// @notice Get the aToken address for a given reserve
    /// @param asset The underlying asset address
    /// @dev Returns struct fields including aTokenAddress at index 8
    function getReserveData(address asset)
        external
        view
        returns (
            uint256 configuration,
            uint128 liquidityIndex,
            uint128 currentLiquidityRate,
            uint128 variableBorrowIndex,
            uint128 currentVariableBorrowRate,
            uint128 currentStableBorrowRate,
            uint40 lastUpdateTimestamp,
            uint16 id,
            address aTokenAddress,
            address stableDebtTokenAddress,
            address variableDebtTokenAddress,
            address interestRateStrategyAddress,
            uint128 accruedToTreasury,
            uint128 unbacked,
            uint128 isolationModeTotalDebt
        );
}
