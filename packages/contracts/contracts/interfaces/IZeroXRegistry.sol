// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IZeroXRegistry
/// @notice Interface for the ZeroX Protocol central address registry
interface IZeroXRegistry {
    // ─── Events ────────────────────────────────────────────────────────────────

    event ContractRegistered(bytes32 indexed key, address indexed contractAddress);
    event ProposalCreated(uint256 indexed proposalId, bytes32 key, address value, address proposer);
    event ProposalApproved(uint256 indexed proposalId, address approver, uint256 approvalCount);
    event ProposalExecuted(uint256 indexed proposalId, bytes32 key, address value);
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    // Note: Paused / Unpaused events are inherited from OZ Pausable — not redeclared here.

    // ─── State-Changing Functions ──────────────────────────────────────────────

    /// @notice Create a proposal to register or update a contract address
    function proposeRegistration(bytes32 key, address contractAddress) external returns (uint256 proposalId);

    /// @notice Approve a pending proposal (requires SIGNER_ROLE)
    function approveProposal(uint256 proposalId) external;

    /// @notice Execute a proposal that has reached the required approval threshold
    function executeProposal(uint256 proposalId) external;

    /// @notice Emergency pause — halts all pausable protocol contracts
    function emergencyPause() external;

    /// @notice Lift the emergency pause
    function unpause() external;

    // ─── View Functions ────────────────────────────────────────────────────────

    /// @notice Look up a registered contract address by key
    function resolve(bytes32 key) external view returns (address);

    /// @notice Check whether an address is a registered signer
    function isSigner(address account) external view returns (bool);

    /// @notice Returns the number of approvals required to execute a proposal
    function requiredApprovals() external view returns (uint256);

    // Note: paused() is provided by OZ Pausable — not redeclared here.
}
