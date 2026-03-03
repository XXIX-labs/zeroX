// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IZeroXScore} from "./interfaces/IZeroXScore.sol";
import {ScoreCalculator} from "./libraries/ScoreCalculator.sol";

/// @title ZeroXScore
/// @notice On-chain credit scoring contract for ZeroX Protocol
/// @dev Stores a credit score (300-850) per wallet address.
///      Updated by ZeroXCredit after every credit event.
///      Permissionlessly readable by any external protocol or SDK.
contract ZeroXScore is Ownable, Pausable, IZeroXScore {
    using ScoreCalculator for *;

    // ─── Storage ───────────────────────────────────────────────────────────────

    /// @notice Full score data per wallet address
    mapping(address => ScoreData) private _scores;

    /// @notice Authorized contract that can call recordEvent (ZeroXCredit)
    address public scoreUpdater;

    /// @notice Authorized vaults that can call initializeScore (ZeroXVault instances)
    /// @dev FIX NEW-L-02: mapping instead of single address to support all 3 vaults (USDC/USDT/AUSD)
    mapping(address => bool) public authorizedVaults;

    // ─── Constructor ───────────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─── Access Control ────────────────────────────────────────────────────────

    modifier onlyScoreUpdater() {
        require(
            msg.sender == scoreUpdater || msg.sender == owner(),
            "ZeroXScore: unauthorized caller"
        );
        _;
    }

    modifier onlyVaultUpdater() {
        require(
            authorizedVaults[msg.sender] || msg.sender == scoreUpdater || msg.sender == owner(),
            "ZeroXScore: unauthorized vault caller"
        );
        _;
    }

    /// @notice Set the authorized score updater (ZeroXCredit address)
    function setScoreUpdater(address _updater) external onlyOwner {
        scoreUpdater = _updater;
    }

    /// @notice Authorize a vault to call initializeScore (supports multiple vaults)
    function setVaultAuthorized(address _vault, bool _authorized) external onlyOwner {
        authorizedVaults[_vault] = _authorized;
    }

    // ─── Initialization ────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXScore
    function initializeScore(address user) external override onlyVaultUpdater whenNotPaused {
        if (_scores[user].firstDepositAt != 0) return; // already initialized

        _scores[user] = ScoreData({
            score: ScoreCalculator.INITIAL_SCORE,
            lastUpdated: uint40(block.timestamp),
            repaymentSignal: 5000,      // neutral start
            utilizationSignal: 10000,   // 0% utilization = best
            accountAgeSignal: 0,        // just started
            collateralSignal: 10000,    // no debt = best
            diversificationSignal: 5000, // one vault = mid
            totalRepayments: 0,
            onTimeRepayments: 0,
            totalVolumeUSD: 0,
            liquidationCount: 0,
            firstDepositAt: uint40(block.timestamp)
        });

        emit ScoreInitialized(user, ScoreCalculator.INITIAL_SCORE);
    }

    // ─── Event Recording ───────────────────────────────────────────────────────

    /// @inheritdoc IZeroXScore
    function recordEvent(
        address user,
        CreditEventType eventType,
        uint256 amountUSD
    ) external override onlyScoreUpdater whenNotPaused {
        ScoreData storage s = _scores[user];
        require(s.firstDepositAt != 0, "ZeroXScore: user not initialized");

        uint16 oldScore = s.score;

        // Update signals based on event type
        if (eventType == CreditEventType.REPAY_ONTIME) {
            s.totalRepayments += 1;
            s.onTimeRepayments += 1;
            if (amountUSD > 0 && s.totalVolumeUSD < type(uint32).max) {
                s.totalVolumeUSD += uint32(amountUSD > type(uint32).max ? type(uint32).max : amountUSD);
            }
        } else if (eventType == CreditEventType.REPAY_LATE) {
            s.totalRepayments += 1;
            // onTimeRepayments NOT incremented for late repayments
        } else if (eventType == CreditEventType.LIQUIDATION) {
            if (s.liquidationCount < type(uint8).max) s.liquidationCount += 1;
            // Immediately reflect liquidation in repayment signal so _recomputeScore
            // applies the penalty even before the next updatePositionSignals call.
            s.repaymentSignal = ScoreCalculator.repaymentSignal(
                s.onTimeRepayments, s.totalRepayments, s.liquidationCount
            );
        } else if (eventType == CreditEventType.DEPOSIT || eventType == CreditEventType.COLLATERAL_ADDED) {
            if (amountUSD > 0 && s.totalVolumeUSD < type(uint32).max) {
                s.totalVolumeUSD += uint32(amountUSD > type(uint32).max ? type(uint32).max : amountUSD);
            }
        }

        // Recompute score
        uint16 newScore = _recomputeScore(s);
        s.score = newScore;
        s.lastUpdated = uint40(block.timestamp);

        emit ScoreUpdated(user, oldScore, newScore, eventType);
    }

    /// @notice Update the utilization and collateral signals directly from ZeroXCredit
    /// @dev Called after every borrow/repay to keep signals current
    function updatePositionSignals(
        address user,
        uint256 currentDebt,
        uint256 maxBorrowable,
        uint256 collateralRatioBps
    ) external onlyScoreUpdater whenNotPaused {
        ScoreData storage s = _scores[user];
        if (s.firstDepositAt == 0) return;

        uint16 oldScore = s.score;

        s.utilizationSignal = ScoreCalculator.utilizationSignal(currentDebt, maxBorrowable);
        s.accountAgeSignal = ScoreCalculator.ageSignal(s.firstDepositAt, block.timestamp);
        s.collateralSignal = ScoreCalculator.collateralSignal(collateralRatioBps);
        s.repaymentSignal = ScoreCalculator.repaymentSignal(
            s.onTimeRepayments,
            s.totalRepayments,
            s.liquidationCount
        );

        uint16 newScore = _recomputeScore(s);
        s.score = newScore;
        s.lastUpdated = uint40(block.timestamp);

        if (oldScore != newScore) {
            emit ScoreUpdated(user, oldScore, newScore, CreditEventType.BORROW);
        }

        uint32[5] memory signals = [
            s.repaymentSignal,
            s.utilizationSignal,
            s.accountAgeSignal,
            s.collateralSignal,
            s.diversificationSignal
        ];
        emit SignalsUpdated(user, signals);
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXScore
    function getScore(address user) external view override returns (uint16) {
        ScoreData storage s = _scores[user];
        if (s.firstDepositAt == 0) return 0; // uninitialized
        return s.score;
    }

    /// @inheritdoc IZeroXScore
    function getScoreData(address user) external view override returns (ScoreData memory) {
        return _scores[user];
    }

    /// @inheritdoc IZeroXScore
    function getRiskTier(uint16 score) external pure override returns (string memory) {
        return ScoreCalculator.getRiskTier(score);
    }

    /// @inheritdoc IZeroXScore
    function isInitialized(address user) external view override returns (bool) {
        return _scores[user].firstDepositAt != 0;
    }

    // ─── Admin ─────────────────────────────────────────────────────────────────

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    // ─── Internal ──────────────────────────────────────────────────────────────

    function _recomputeScore(ScoreData storage s) internal view returns (uint16) {
        return ScoreCalculator.computeScore(
            s.repaymentSignal,
            s.utilizationSignal,
            s.accountAgeSignal,
            s.collateralSignal,
            s.diversificationSignal
        );
    }
}
