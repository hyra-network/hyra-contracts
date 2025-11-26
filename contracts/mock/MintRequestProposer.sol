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
    
    /**
     * @notice Forward arbitrary call to governor (for testing privileged functions)
     * @param data Encoded function call data
     */
    function forwardCall(bytes memory data) external returns (bytes memory) {
        (bool success, bytes memory returnData) = address(governor).call(data);
        if (!success) {
            // Forward the revert reason/custom error
            assembly {
                let returndata_size := mload(returnData)
                revert(add(32, returnData), returndata_size)
            }
        }
        return returnData;
    }
}

