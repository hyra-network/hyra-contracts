// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title DAOConfigHelper
 * @notice Helper contract with minimal code to assist with DAO setup
 * @dev This contract is SMALL (<2KB) and can be deployed easily
 *      It only contains data structures and helper functions
 */
contract DAOConfigHelper {
    
    struct DAOConfig {
        string tokenName;
        string tokenSymbol;
        uint256 initialSupply;
        address vestingContract;
        uint256 timelockDelay;
        uint256 votingDelay;
        uint256 votingPeriod;
        uint256 proposalThreshold;
        uint256 quorumPercentage;
        address[] securityCouncil;
        address[] multisigSigners;
        uint256 requiredSignatures;
    }
    
    struct VestingSchedule {
        address beneficiary;
        uint256 amount;
        uint256 startTime;
        uint256 duration;
        uint256 cliff;
        bool revocable;
        string purpose;
    }
    
    /**
     * @notice Pack config data
     */
    function packConfig(DAOConfig memory config) external pure returns (bytes memory) {
        return abi.encode(config);
    }
    
    /**
     * @notice Compute address from deployer and nonce
     */
    function computeAddress(address deployer, uint256 nonce) external pure returns (address) {
        return address(uint160(uint256(keccak256(abi.encodePacked(deployer, nonce)))));
    }
}

