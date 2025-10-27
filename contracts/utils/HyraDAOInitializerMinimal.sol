// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title HyraDAOInitializerMinimal
 * @notice Minimal version - only essential functions, imports interfaces only
 * @dev Reduced bytecode size to deployable size (<49KB)
 */
contract HyraDAOInitializerMinimal {
    
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
    }
    
    struct DeploymentInfo {
        address tokenImpl;
        address governorImpl;
        address timelockImpl;
        address vestingImpl;
    }
    
    event ConfigurationCalculated(address deployer, bytes configHash);
    
    /**
     * @notice Calculate deployment addresses for all contracts
     * @dev This is a pure function that doesn't deploy anything
     *      Returns addresses assuming sequential deployment
     */
    function calculateAddresses(
        address deployer,
        uint256 startNonce
    ) external pure returns (address[] memory addresses) {
        addresses = new address[](4);
        
        // Calculate addresses sequentially
        addresses[0] = computeAddress(deployer, startNonce);     // Token
        addresses[1] = computeAddress(deployer, startNonce + 1);  // Governor
        addresses[2] = computeAddress(deployer, startNonce + 2);  // Timelock
        addresses[3] = computeAddress(deployer, startNonce + 3);  // Vesting
    }
    
    /**
     * @notice Compute contract address from deployer and nonce
     */
    function computeAddress(address deployer, uint256 nonce) public pure returns (address) {
        bytes memory data = abi.encodePacked(deployer, nonce);
        return address(uint160(uint256(keccak256(data))));
    }
    
    /**
     * @notice Validate configuration
     */
    function validateConfig(DAOConfig memory config) external pure returns (bool) {
        return (
            bytes(config.tokenName).length > 0 &&
            bytes(config.tokenSymbol).length > 0 &&
            config.timelockDelay > 0 &&
            config.votingDelay > 0 &&
            config.votingPeriod > 0
        );
    }
    
    /**
     * @notice Generate initialization data for contracts
     */
    function generateInitData(DAOConfig memory config) external pure returns (
        bytes memory tokenInit,
        bytes memory governorInit,
        bytes memory timelockInit,
        bytes memory vestingInit
    ) {
        // Token initialization data
        tokenInit = abi.encodeWithSignature(
            "initialize(string,string,uint256,address,address)",
            config.tokenName,
            config.tokenSymbol,
            config.initialSupply,
            config.vestingContract,
            address(0) // Will be set after deployment
        );
        
        // Governor initialization data
        governorInit = abi.encodeWithSignature(
            "initialize(address,address,uint256,uint256,uint256,uint256)",
            address(0), // Token address - to be set
            address(0), // Timelock address - to be set
            config.votingDelay,
            config.votingPeriod,
            config.proposalThreshold,
            config.quorumPercentage
        );
        
        // Timelock initialization data
        address[] memory proposers = new address[](1);
        proposers[0] = address(0); // To be set
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        
        timelockInit = abi.encodeWithSignature(
            "initialize(uint256,address[],address[],address)",
            config.timelockDelay,
            proposers,
            executors,
            address(0)
        );
        
        // Vesting init is empty
        vestingInit = "";
    }
    
    /**
     * @notice Helper to pack addresses for deployment
     */
    function packAddresses(DeploymentInfo memory info) external pure returns (bytes memory) {
        return abi.encode(info);
    }
}

