// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IAgoraStableSwap} from "../interfaces/external/IAgoraStableSwap.sol";

/// @notice Mock AUSD token for testing (ERC-20, non-rebasing, 6 decimals)
/// @dev In production, AUSD is at 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a on Avalanche
contract MockAUSD is ERC20 {
    constructor() ERC20("Agora USD", "AUSD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// @notice Mock Agora StableSwap pair for testing (USDC <-> AUSD at 1:1)
/// @dev In production the pair uses oracle-driven pricing with APPROVED_SWAPPER access control.
///      This mock swaps at a configurable rate (default 1:1) and has no access control.
contract MockAgoraSwap is IAgoraStableSwap {
    using SafeERC20 for IERC20;

    address public immutable override token0; // USDC (lower address)
    address public immutable override token1; // AUSD (higher address)

    // Configurable exchange rate: amount of token1 per token0 (1e6 = 1:1)
    uint256 public rate = 1e6; // 1:1 by default

    constructor(address _usdc, address _ausd) {
        // Maintain token0 < token1 ordering (canonical Uniswap convention)
        if (_usdc < _ausd) {
            token0 = _usdc;
            token1 = _ausd;
        } else {
            token0 = _ausd;
            token1 = _usdc;
        }
    }

    function setRate(uint256 _rate) external {
        rate = _rate;
    }

    /// @notice Swap exact input for output at configured rate
    function swapExactTokensForTokens(
        address to,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOutMin
    ) external override returns (uint256 amountOut) {
        (address tokenIn, address tokenOut) = zeroForOne
            ? (token0, token1)
            : (token1, token0);

        // 1:1 rate (both have 6 decimals)
        amountOut = amountIn;
        require(amountOut >= amountOutMin, "MockAgoraSwap: slippage");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);
    }

    /// @notice Swap to receive exact output at configured rate
    function swapTokensForExactTokens(
        address to,
        bool zeroForOne,
        uint256 amountOut,
        uint256 amountInMax
    ) external override returns (uint256 amountIn) {
        (address tokenIn, address tokenOut) = zeroForOne
            ? (token0, token1)
            : (token1, token0);

        amountIn = amountOut; // 1:1
        require(amountIn <= amountInMax, "MockAgoraSwap: amountIn exceeds max");

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(to, amountOut);
    }

    function getReserves() external view override returns (uint256, uint256, uint256) {
        return (
            IERC20(token0).balanceOf(address(this)),
            IERC20(token1).balanceOf(address(this)),
            block.timestamp
        );
    }

    function MAX_ORACLE_DEVIATION() external pure override returns (uint256) {
        return 50; // 0.5% in basis points
    }
}
