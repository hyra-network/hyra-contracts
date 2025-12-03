// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../../contracts/interfaces/IHyraGovernor.sol";

/**
 * @title ProposalForwarder
 * @notice Simple contract to forward proposal calls for testing
 * @dev This allows a signer to act through a contract address
 */
contract ProposalForwarder {
    address public owner;
    
    error NotOwner();
    
    constructor(address _owner) {
        owner = _owner;
    }
    
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }
    
    function proposeWithType(
        address governor,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        uint256 proposalType
    ) external onlyOwner returns (uint256) {
        return IHyraGovernor(governor).proposeWithType(targets, values, calldatas, description, IHyraGovernor.ProposalType(proposalType));
    }
    
    function propose(
        address governor,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) external onlyOwner returns (uint256) {
        return IHyraGovernor(governor).propose(targets, values, calldatas, description);
    }
    
    function cancel(
        address governor,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) external onlyOwner returns (uint256) {
        return IHyraGovernor(governor).cancel(targets, values, calldatas, descriptionHash);
    }
}

