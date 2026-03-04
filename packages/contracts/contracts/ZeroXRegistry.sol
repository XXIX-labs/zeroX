// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IZeroXRegistry} from "./interfaces/IZeroXRegistry.sol";

/// @title ZeroXRegistry
/// @notice Central address book and access control contract for ZeroX Protocol
/// @dev Uses a 3-of-5 signer model with on-chain proposal / approval flow.
///      Non-upgradeable by design — address updates go through Registry itself.
contract ZeroXRegistry is Pausable, IZeroXRegistry {
    // ─── Constants ─────────────────────────────────────────────────────────────

    uint256 public constant REQUIRED_APPROVALS = 3;
    uint256 public constant MAX_SIGNERS = 5;

    /// @notice Minimum delay between reaching 3 approvals and execution (FIX H-02: timelock)
    uint256 public constant MIN_EXECUTION_DELAY = 48 hours;

    // Well-known registry keys (keccak256 of string, precomputed for gas efficiency)
    bytes32 public constant KEY_VAULT_USDC = keccak256("VAULT_USDC");
    bytes32 public constant KEY_VAULT_USDT = keccak256("VAULT_USDT");
    bytes32 public constant KEY_CREDIT     = keccak256("CREDIT");
    bytes32 public constant KEY_SCORE      = keccak256("SCORE");

    // ─── Storage ───────────────────────────────────────────────────────────────

    /// @notice List of authorized signers (fixed at 5)
    address[MAX_SIGNERS] public signers;

    /// @notice Registered contract addresses
    mapping(bytes32 => address) private _registry;

    /// @notice Signer lookup for O(1) validation
    mapping(address => bool) private _isSigner;

    /// @notice Proposal counter
    uint256 public proposalCount;

    struct Proposal {
        bytes32 key;
        address value;
        address proposer;
        uint256 approvalCount;
        uint256 createdAt;
        uint256 approvedAt;   // Timestamp when REQUIRED_APPROVALS threshold was first reached
        bool executed;
        mapping(address => bool) approved;
    }

    mapping(uint256 => Proposal) private _proposals;

    // ─── Constructor ───────────────────────────────────────────────────────────

    /// @param _signers Array of exactly 5 signer addresses
    constructor(address[MAX_SIGNERS] memory _signers) {
        for (uint256 i = 0; i < MAX_SIGNERS; i++) {
            require(_signers[i] != address(0), "ZeroXRegistry: zero signer address");
            require(!_isSigner[_signers[i]], "ZeroXRegistry: duplicate signer");
            signers[i] = _signers[i];
            _isSigner[_signers[i]] = true;
        }
    }

    // ─── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlySigner() {
        require(_isSigner[msg.sender], "ZeroXRegistry: caller is not a signer");
        _;
    }

    // ─── Proposal Flow ─────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXRegistry
    function proposeRegistration(
        bytes32 key,
        address contractAddress
    ) external override onlySigner returns (uint256 proposalId) {
        require(contractAddress != address(0), "ZeroXRegistry: zero address");

        proposalId = ++proposalCount;
        Proposal storage p = _proposals[proposalId];
        p.key = key;
        p.value = contractAddress;
        p.proposer = msg.sender;
        p.createdAt = block.timestamp;

        // Auto-approve from proposer
        p.approved[msg.sender] = true;
        p.approvalCount = 1;

        emit ProposalCreated(proposalId, key, contractAddress, msg.sender);
        emit ProposalApproved(proposalId, msg.sender, 1);
    }

    /// @inheritdoc IZeroXRegistry
    function approveProposal(uint256 proposalId) external override onlySigner {
        Proposal storage p = _proposals[proposalId];
        require(p.proposer != address(0), "ZeroXRegistry: proposal does not exist");
        require(!p.executed, "ZeroXRegistry: already executed");
        require(!p.approved[msg.sender], "ZeroXRegistry: already approved");

        p.approved[msg.sender] = true;
        p.approvalCount += 1;

        // Record when threshold was first reached (starts the 48h execution window)
        if (p.approvalCount == REQUIRED_APPROVALS && p.approvedAt == 0) {
            p.approvedAt = block.timestamp;
        }

        emit ProposalApproved(proposalId, msg.sender, p.approvalCount);
    }

    /// @inheritdoc IZeroXRegistry
    function executeProposal(uint256 proposalId) external override onlySigner {
        Proposal storage p = _proposals[proposalId];
        require(p.proposer != address(0), "ZeroXRegistry: proposal does not exist");
        require(!p.executed, "ZeroXRegistry: already executed");
        require(p.approvalCount >= REQUIRED_APPROVALS, "ZeroXRegistry: insufficient approvals");
        // FIX H-02: enforce 48-hour timelock after reaching approval threshold
        require(p.approvedAt > 0 && block.timestamp >= p.approvedAt + MIN_EXECUTION_DELAY,
            "ZeroXRegistry: timelock not elapsed");

        p.executed = true;
        _registry[p.key] = p.value;

        emit ProposalExecuted(proposalId, p.key, p.value);
        emit ContractRegistered(p.key, p.value);
    }

    // ─── Emergency Pause ───────────────────────────────────────────────────────

    /// @inheritdoc IZeroXRegistry
    function emergencyPause() external override onlySigner {
        _pause();
    }

    /// @inheritdoc IZeroXRegistry
    function unpause() external override onlySigner {
        _unpause();
    }

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @inheritdoc IZeroXRegistry
    function resolve(bytes32 key) external view override returns (address) {
        return _registry[key];
    }

    /// @inheritdoc IZeroXRegistry
    function isSigner(address account) external view override returns (bool) {
        return _isSigner[account];
    }

    /// @inheritdoc IZeroXRegistry
    function requiredApprovals() external pure override returns (uint256) {
        return REQUIRED_APPROVALS;
    }

    /// @notice Get proposal details (without the approval map)
    function getProposal(uint256 proposalId)
        external
        view
        returns (bytes32 key, address value, address proposer, uint256 approvalCount, bool executed)
    {
        Proposal storage p = _proposals[proposalId];
        return (p.key, p.value, p.proposer, p.approvalCount, p.executed);
    }

    /// @notice Check if a specific signer has approved a proposal
    function hasApproved(uint256 proposalId, address signer) external view returns (bool) {
        return _proposals[proposalId].approved[signer];
    }
}
