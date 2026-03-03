// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IBenqiToken} from "../interfaces/external/IBenqiToken.sol";

/// @notice Mock Benqi qiToken for testing
contract MockBenqi is ERC20, IBenqiToken {
    using SafeERC20 for IERC20;

    address private _underlying;
    uint256 private _exchangeRate = 1e18; // 1:1 initially
    uint256 public supplyRate = 190258751902; // ~6% APY per second in 1e18

    constructor(address underlying_, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
    {
        _underlying = underlying_;
    }

    function setExchangeRate(uint256 rate) external { _exchangeRate = rate; }
    function setSupplyRate(uint256 rate) external { supplyRate = rate; }

    function mint(uint256 mintAmount) external override returns (uint256) {
        IERC20(_underlying).safeTransferFrom(msg.sender, address(this), mintAmount);
        uint256 qiTokens = (mintAmount * 1e18) / _exchangeRate;
        _mint(msg.sender, qiTokens);
        return 0;
    }

    function redeem(uint256 redeemTokens) external override returns (uint256) {
        uint256 underlying_ = (redeemTokens * _exchangeRate) / 1e18;
        _burn(msg.sender, redeemTokens);
        IERC20(_underlying).safeTransfer(msg.sender, underlying_);
        return 0;
    }

    function redeemUnderlying(uint256 redeemAmount) external override returns (uint256) {
        uint256 qiTokens = (redeemAmount * 1e18) / _exchangeRate;
        _burn(msg.sender, qiTokens);
        IERC20(_underlying).safeTransfer(msg.sender, redeemAmount);
        return 0;
    }

    function exchangeRateCurrent() external override returns (uint256) {
        return _exchangeRate;
    }

    function exchangeRateStored() external view override returns (uint256) {
        return _exchangeRate;
    }

    function balanceOf(address account) public view override(ERC20, IBenqiToken) returns (uint256) {
        return super.balanceOf(account);
    }

    function balanceOfUnderlying(address owner) external view override returns (uint256) {
        return (balanceOf(owner) * _exchangeRate) / 1e18;
    }

    function supplyRatePerTimestamp() external view override returns (uint256) {
        return supplyRate;
    }

    function underlying() external view override returns (address) {
        return _underlying;
    }
}
