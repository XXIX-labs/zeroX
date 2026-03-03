// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title VaultMath
/// @notice Pure math helpers for ERC-4626 vault share calculations
library VaultMath {
    // ─── Share ↔ Asset Conversions ─────────────────────────────────────────────

    /// @notice Convert assets to shares (ERC-4626 style, with virtual offset for rounding)
    /// @param assets Amount of assets to convert
    /// @param totalAssets Total assets currently in the vault
    /// @param totalShares Total shares currently outstanding
    /// @param virtual_ Virtual shares/assets to prevent inflation attacks (usually 1)
    /// @return shares The number of shares that correspond to the given assets
    function assetsToShares(
        uint256 assets,
        uint256 totalAssets,
        uint256 totalShares,
        uint256 virtual_
    ) internal pure returns (uint256 shares) {
        // ERC-4626 standard: shares = assets * (totalShares + virtual) / (totalAssets + virtual)
        return (assets * (totalShares + virtual_)) / (totalAssets + virtual_);
    }

    /// @notice Convert shares to assets (ERC-4626 style)
    /// @param shares Number of shares to convert
    /// @param totalAssets Total assets currently in the vault
    /// @param totalShares Total shares currently outstanding
    /// @param virtual_ Virtual offset for rounding protection
    /// @return assets The number of assets that correspond to the given shares
    function sharesToAssets(
        uint256 shares,
        uint256 totalAssets,
        uint256 totalShares,
        uint256 virtual_
    ) internal pure returns (uint256 assets) {
        return (shares * (totalAssets + virtual_)) / (totalShares + virtual_);
    }

    // ─── APY Calculations ──────────────────────────────────────────────────────

    /// @notice Calculate APY from a rate per second in basis points
    /// @dev Compounds the per-second rate over one year
    /// @param ratePerSecondBps Rate per second in basis points (1e-4)
    /// @return apyBps Annual Percentage Yield in basis points
    function rateToAPY(uint256 ratePerSecondBps) internal pure returns (uint256 apyBps) {
        // Simplified linear approximation for small rates
        // For production: use (1 + r)^31536000 - 1 via logarithm approximation
        return ratePerSecondBps * 31536000;
    }

    /// @notice Estimate blended APY from two strategies
    /// @param apy1Bps APY of strategy 1 in basis points
    /// @param allocation1Bps Allocation to strategy 1 in basis points
    /// @param apy2Bps APY of strategy 2 in basis points
    /// @param allocation2Bps Allocation to strategy 2 in basis points
    /// @return blendedApyBps Weighted average APY in basis points
    function blendedAPY(
        uint256 apy1Bps,
        uint256 allocation1Bps,
        uint256 apy2Bps,
        uint256 allocation2Bps
    ) internal pure returns (uint256 blendedApyBps) {
        require(allocation1Bps + allocation2Bps == 10000, "Allocations must sum to 10000");
        return (apy1Bps * allocation1Bps + apy2Bps * allocation2Bps) / 10000;
    }

    // ─── Precision Scaling ─────────────────────────────────────────────────────

    /// @notice Scale an amount from one decimal precision to another
    /// @param amount The amount to scale
    /// @param fromDecimals Source decimal count
    /// @param toDecimals Target decimal count
    function scaleDecimals(
        uint256 amount,
        uint8 fromDecimals,
        uint8 toDecimals
    ) internal pure returns (uint256) {
        if (fromDecimals == toDecimals) return amount;
        if (fromDecimals < toDecimals) {
            return amount * (10 ** uint256(toDecimals - fromDecimals));
        }
        return amount / (10 ** uint256(fromDecimals - toDecimals));
    }
}
