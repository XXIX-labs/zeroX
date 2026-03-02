// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IBenqiToken
/// @notice Minimal interface for Benqi qiToken (Compound fork) on Avalanche C-Chain
/// @dev qiUSDC address: 0xB715808a78F6041E46d61Cb123C9B4A27056AE9C
interface IBenqiToken {
    /// @notice Supply underlying asset to mint qiTokens
    /// @param mintAmount The amount of underlying to supply
    /// @return 0 on success, error code otherwise
    function mint(uint256 mintAmount) external returns (uint256);

    /// @notice Redeem qiTokens for underlying asset
    /// @param redeemTokens The number of qiTokens to redeem
    /// @return 0 on success, error code otherwise
    function redeem(uint256 redeemTokens) external returns (uint256);

    /// @notice Redeem a specific amount of underlying asset
    /// @param redeemAmount The amount of underlying to receive
    /// @return 0 on success, error code otherwise
    function redeemUnderlying(uint256 redeemAmount) external returns (uint256);

    /// @notice Returns the current exchange rate from qiToken to underlying (scaled by 1e18)
    function exchangeRateCurrent() external returns (uint256);

    /// @notice Returns the stored exchange rate (no state mutation, may be stale by 1 block)
    function exchangeRateStored() external view returns (uint256);

    /// @notice Returns the qiToken balance of an account
    function balanceOf(address account) external view returns (uint256);

    /// @notice Returns the underlying balance for an account (calls exchangeRateCurrent)
    function balanceOfUnderlying(address owner) external returns (uint256);

    /// @notice Returns the current supply APY in basis points (non-standard, Benqi extension)
    function supplyRatePerTimestamp() external view returns (uint256);

    /// @notice Returns the address of the underlying ERC-20 asset
    function underlying() external view returns (address);
}
