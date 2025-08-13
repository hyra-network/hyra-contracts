// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/governance/IGovernor.sol";

/**
 * @title IHyraGovernor
 * @notice Minimal interface for HyraGovernor - only essential public functions
 */
interface IHyraGovernor is IGovernor {
    // Proposal type enum 
    enum ProposalType {
        STANDARD,
        EMERGENCY,
        CONSTITUTIONAL,
        UPGRADE
    }
    
    // Core governance functions
    function proposeWithType(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalType proposalType
    ) external returns (uint256);
    
    // Security council management
    function addSecurityCouncilMember(address member) external;
    function removeSecurityCouncilMember(address member) external;
    
    // Essential view functions
    function proposalTypes(uint256 proposalId) external view returns (ProposalType);
    function getProposalQuorum(uint256 proposalId) external view returns (uint256);
    function isSecurityCouncilMember(address account) external view returns (bool);
}