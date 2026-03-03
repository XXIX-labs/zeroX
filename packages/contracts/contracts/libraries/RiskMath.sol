// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title RiskMath
/// @notice Pure math functions for risk calculations across the ZeroX protocol
/// @dev All percentage values are expressed in basis points (1 bps = 0.01%)
library RiskMath {
    // ─── Constants ─────────────────────────────────────────────────────────────

    /// @dev Maximum LTV ratio: 50.00%
    uint256 internal constant LTV_MAX_BPS = 5000;

    /// @dev Warning threshold: collateral ratio of 120% (LTV ~83.33%)
    uint256 internal constant WARN_COLLATERAL_RATIO_BPS = 12000;

    /// @dev Liquidation threshold: collateral ratio of 105% (LTV ~95.24%)
    uint256 internal constant LIQ_COLLATERAL_RATIO_BPS = 10500;

    /// @dev Liquidation bonus: 5.00% total
    uint256 internal constant LIQ_BONUS_BPS = 500;

    /// @dev Liquidation bonus split: 3% to liquidator
    uint256 internal constant LIQ_BONUS_LIQUIDATOR_BPS = 300;

    /// @dev Liquidation bonus split: 2% to protocol treasury
    uint256 internal constant LIQ_BONUS_PROTOCOL_BPS = 200;

    /// @dev Flash credit fee: 0.07% (Phase 2)
    uint256 internal constant FLASH_FEE_BPS = 7;

    /// @dev Basis point denominator
    uint256 internal constant BPS = 10000;

    // ─── LTV Calculations ──────────────────────────────────────────────────────

    /// @notice Calculate current LTV in basis points
    /// @param debtUSD Outstanding debt in USD (18 decimals)
    /// @param collateralUSD Collateral value in USD (18 decimals)
    /// @return ltv LTV in basis points (0-10000+, can exceed 10000 when undercollateralized)
    function calculateLTV(
        uint256 debtUSD,
        uint256 collateralUSD
    ) internal pure returns (uint256 ltv) {
        if (collateralUSD == 0) return type(uint256).max;
        return (debtUSD * BPS) / collateralUSD;
    }

    /// @notice Calculate collateral ratio in basis points (inverse of LTV)
    /// @param collateralUSD Collateral value in USD (18 decimals)
    /// @param debtUSD Outstanding debt in USD (18 decimals)
    /// @return ratio Collateral ratio in basis points
    function calculateCollateralRatio(
        uint256 collateralUSD,
        uint256 debtUSD
    ) internal pure returns (uint256 ratio) {
        if (debtUSD == 0) return type(uint256).max;
        return (collateralUSD * BPS) / debtUSD;
    }

    /// @notice Get the maximum borrowable amount at 50% LTV
    /// @param collateralUSD Collateral value in USD (any decimal precision)
    /// @return maxBorrow Maximum borrowable amount in same decimals as collateralUSD
    function maxBorrowable(uint256 collateralUSD) internal pure returns (uint256 maxBorrow) {
        return (collateralUSD * LTV_MAX_BPS) / BPS;
    }

    /// @notice Check if a position is in warning zone (collateral ratio < 120%)
    /// @param collateralUSD Collateral value in USD
    /// @param debtUSD Debt value in USD
    function isInWarningZone(
        uint256 collateralUSD,
        uint256 debtUSD
    ) internal pure returns (bool) {
        if (debtUSD == 0) return false;
        uint256 ratio = calculateCollateralRatio(collateralUSD, debtUSD);
        return ratio < WARN_COLLATERAL_RATIO_BPS;
    }

    /// @notice Check if a position is liquidatable (collateral ratio <= 105%)
    /// @param collateralUSD Collateral value in USD
    /// @param debtUSD Debt value in USD
    function isLiquidatable(
        uint256 collateralUSD,
        uint256 debtUSD
    ) internal pure returns (bool) {
        if (debtUSD == 0) return false;
        uint256 ratio = calculateCollateralRatio(collateralUSD, debtUSD);
        return ratio <= LIQ_COLLATERAL_RATIO_BPS;
    }

    // ─── Liquidation Math ──────────────────────────────────────────────────────

    /// @notice Calculate collateral to seize during liquidation
    /// @param debtToRepay Amount of debt being repaid by liquidator
    /// @param collateralPriceUSD Price of one unit of collateral in USD (18 decimals)
    /// @param collateralDecimals Decimal precision of the collateral token
    /// @return collateralToSeize Amount of collateral tokens to transfer to liquidator
    function calculateCollateralToSeize(
        uint256 debtToRepay,
        uint256 collateralPriceUSD,
        uint8 collateralDecimals
    ) internal pure returns (uint256 collateralToSeize) {
        // debt * (1 + bonus) / collateralPrice = collateral amount
        // Single division avoids divide-before-multiply precision loss.
        uint256 scale = 10 ** collateralDecimals;
        return (debtToRepay * (BPS + LIQ_BONUS_BPS) * scale) / (BPS * collateralPriceUSD);
    }

    /// @notice Split seized collateral between liquidator (3%) and protocol treasury (2%)
    /// @param totalSeized Total collateral shares seized (includes 5% bonus)
    /// @return liquidatorShares Shares going to the liquidator
    /// @return protocolShares Shares going to the protocol treasury
    function calculateLiquidationSplit(
        uint256 totalSeized
    ) internal pure returns (uint256 liquidatorShares, uint256 protocolShares) {
        protocolShares = (totalSeized * LIQ_BONUS_PROTOCOL_BPS) / LIQ_BONUS_BPS;
        liquidatorShares = totalSeized - protocolShares;
    }

    // ─── Borrow Validation ─────────────────────────────────────────────────────

    /// @notice Check if a borrow operation keeps LTV within the allowed limit
    /// @param currentDebt Current outstanding debt
    /// @param additionalBorrow Additional amount to borrow
    /// @param collateralUSD Current collateral value in USD
    /// @return valid True if the resulting LTV <= 50%
    function isValidBorrow(
        uint256 currentDebt,
        uint256 additionalBorrow,
        uint256 collateralUSD
    ) internal pure returns (bool valid) {
        // Use direct comparison with maxBorrowable to avoid rounding asymmetry.
        // LTV-based check (debt*10000/collateral <= 5000) allows slightly over 50%
        // due to integer floor division, whereas this is exact.
        uint256 newDebt = currentDebt + additionalBorrow;
        return newDebt <= maxBorrowable(collateralUSD);
    }
}
