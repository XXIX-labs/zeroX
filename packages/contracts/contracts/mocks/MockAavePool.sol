// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAaveV3Pool} from "../interfaces/external/IAaveV3Pool.sol";
import {MockERC20} from "./MockERC20.sol";

/// @notice Mock Aave V3 Pool for testing — holds deposits and simulates aToken yield
contract MockAavePool is IAaveV3Pool {
    using SafeERC20 for IERC20;

    // asset => aToken
    mapping(address => address) public aTokens;
    // asset => total deposited (tracks only what was supplied via supply(), not pre-funded balance)
    mapping(address => uint256) public depositedBalance;
    // Simulated liquidity rate (in RAY, 1e27)
    uint128 public liquidityRate = 60000000000000000000000000; // ~6% APY in RAY

    constructor(address asset, address aToken_) {
        if (asset != address(0) && aToken_ != address(0)) {
            aTokens[asset] = aToken_;
        }
    }

    function setAToken(address asset, address aToken) external {
        aTokens[asset] = aToken;
    }

    function setLiquidityRate(uint128 _rate) external {
        liquidityRate = _rate;
    }

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16
    ) external override {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        depositedBalance[asset] += amount;
        // Mint equivalent aTokens to the supplier
        address aToken = aTokens[asset];
        if (aToken != address(0)) {
            MockERC20(aToken).mint(onBehalfOf, amount);
        }
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external override returns (uint256) {
        address aToken = aTokens[asset];
        // Use tracked depositedBalance so pre-funded USDC doesn't inflate withdraw amount
        uint256 balance = depositedBalance[asset];
        uint256 actual = amount == type(uint256).max ? balance : (amount > balance ? balance : amount);

        depositedBalance[asset] -= actual;
        if (aToken != address(0)) {
            MockERC20(aToken).burn(msg.sender, actual);
        }
        IERC20(asset).safeTransfer(to, actual);
        return actual;
    }

    function getUserAccountData(address)
        external
        pure
        override
        returns (
            uint256, uint256, uint256, uint256, uint256, uint256
        )
    {
        return (0, 0, 0, 0, 0, type(uint256).max);
    }

    function getReserveData(address)
        external
        view
        override
        returns (
            uint256, uint128, uint128, uint128, uint128, uint128,
            uint40, uint16, address, address, address, address,
            uint128, uint128, uint128
        )
    {
        return (
            0, 1e27, liquidityRate, 1e27, 0, 0,
            uint40(block.timestamp), 0,
            address(0), address(0), address(0), address(0),
            0, 0, 0
        );
    }
}
