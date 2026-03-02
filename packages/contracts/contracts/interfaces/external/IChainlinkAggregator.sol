// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IChainlinkAggregator
/// @notice Minimal interface for Chainlink AggregatorV3 price feeds on Avalanche C-Chain
interface IChainlinkAggregator {
    /// @notice Returns the latest round data from the price feed
    /// @return roundId The round ID
    /// @return answer The price answer (scaled by feed decimals)
    /// @return startedAt Timestamp when the round started
    /// @return updatedAt Timestamp of the last update (used for staleness checks)
    /// @return answeredInRound The round ID of the round in which the answer was computed
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    /// @notice Returns the number of decimals in the answer
    function decimals() external view returns (uint8);

    /// @notice Human-readable description of the feed
    function description() external view returns (string memory);
}
