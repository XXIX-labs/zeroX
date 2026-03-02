// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IAgoraStableSwap
/// @notice Interface for Agora's StableSwap pair contract (Uniswap V2-like surface)
/// @dev Agora StableSwap enables atomic swaps between USDC and AUSD at oracle-driven rates.
///      Callers must hold the APPROVED_SWAPPER role on the pair contract.
///      Pair address on Avalanche C-Chain: see deployments/mainnet.json
///      Documentation: https://docs.agora.finance/stable-swaps/smart-contracts
interface IAgoraStableSwap {
    // ─── Core Swap Functions ───────────────────────────────────────────────

    /// @notice Swap an exact amount of input token for as many output tokens as possible
    /// @param to Recipient of the output tokens
    /// @param zeroForOne true = sell token0 for token1; false = sell token1 for token0
    /// @param amountIn Exact amount of input token to sell
    /// @param amountOutMin Minimum acceptable output (slippage protection)
    /// @return amountOut Amount of output token received
    function swapExactTokensForTokens(
        address to,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOutMin
    ) external returns (uint256 amountOut);

    /// @notice Swap as few input tokens as possible to receive an exact output amount
    /// @param to Recipient of the output tokens
    /// @param zeroForOne true = sell token0 for token1; false = sell token1 for token0
    /// @param amountOut Exact amount of output token desired
    /// @param amountInMax Maximum input token to spend
    /// @return amountIn Amount of input token actually spent
    function swapTokensForExactTokens(
        address to,
        bool zeroForOne,
        uint256 amountOut,
        uint256 amountInMax
    ) external returns (uint256 amountIn);

    // ─── Pair Info ────────────────────────────────────────────────────────

    /// @notice The first token in this pair (lower address)
    function token0() external view returns (address);

    /// @notice The second token in this pair (higher address)
    function token1() external view returns (address);

    /// @notice Current reserves of token0 and token1 in the pair
    function getReserves()
        external
        view
        returns (
            uint256 reserve0,
            uint256 reserve1,
            uint256 blockTimestampLast
        );

    /// @notice Maximum slippage allowed by the oracle (in basis points)
    function MAX_ORACLE_DEVIATION() external view returns (uint256);
}
