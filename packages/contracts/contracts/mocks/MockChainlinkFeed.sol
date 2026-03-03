// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IChainlinkAggregator} from "../interfaces/external/IChainlinkAggregator.sol";

/// @notice Mock Chainlink price feed for testing
contract MockChainlinkFeed is IChainlinkAggregator {
    int256 public price;
    uint256 public updatedAt;
    uint8 private _decimals;

    constructor(int256 _price, uint8 decimals_) {
        price = _price;
        _decimals = decimals_;
        updatedAt = block.timestamp;
    }

    function setPrice(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    /// @notice Alias for setPrice — matches common Chainlink mock interface
    function setAnswer(int256 _price) external {
        price = _price;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt_,
            uint80 answeredInRound
        )
    {
        return (1, price, block.timestamp, updatedAt, 1);
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "MOCK / USD";
    }
}
