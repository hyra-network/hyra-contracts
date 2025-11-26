// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/IHyraGovernor.sol";

/**
 * @title MintRequestProposer
 * @notice Simple contract wrapper for testing privileged proposals
 * @dev This contract allows testing the privileged multisig wallet logic
 */
contract MintRequestProposer {
    IHyraGovernor public governor;
    
    constructor(address _governor) {
        if (_governor != address(0)) {
            governor = IHyraGovernor(_governor);
        }
    }
    
    function setGovernor(address _governor) external {
        require(_governor != address(0), "Invalid governor");
        governor = IHyraGovernor(_governor);
    }
    
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) external returns (uint256) {
        return governor.propose(targets, values, calldatas, description);
    }
    
    function proposeWithType(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        uint8 proposalType
    ) external returns (uint256) {
        return governor.proposeWithType(targets, values, calldatas, description, IHyraGovernor.ProposalType(proposalType));
    }
}

