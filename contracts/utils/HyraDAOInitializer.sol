// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../core/HyraToken.sol";
import "../core/HyraGovernor.sol";
import "../core/HyraTimelock.sol";
import "../proxy/HyraProxyAdmin.sol";
import "../proxy/HyraProxyDeployer.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @title HyraDAOInitializer
 * @notice Helper contract for deploying and initializing the entire Hyra DAO system
 * @dev Deploys all contracts in the correct order with proper configuration 
 */
contract HyraDAOInitializer {
    // ============ Structs ============
    struct DAOConfig {
        // Token config
        string tokenName;
        string tokenSymbol;
        uint256 initialSupply;
        address initialHolder;
        // Timelock config
        uint256 timelockDelay;
        // Governor config
        uint256 votingDelay;
        uint256 votingPeriod;
        uint256 proposalThreshold;
        uint256 quorumPercentage;
        // Security council
        address[] securityCouncil;
    }
    
    struct DeploymentResult {
        // Implementations
        address tokenImplementation;
        address governorImplementation;
        address timelockImplementation;
        // Proxies
        address tokenProxy;
        address governorProxy;
        address timelockProxy;
        // Infrastructure
        address proxyAdmin;
        address proxyDeployer;
    }
    
    // ============ Events ============
    event DAODeployed(
        address indexed deployer,
        DeploymentResult deployment,
        uint256 timestamp
    );
    
    // ============ Errors ============
    error InvalidConfig();
    error DeploymentFailed();
    error InitializationFailed();
    
    /**
     * @notice Deploy and initialize the complete DAO system
     * @param config Configuration parameters
     * @return result Deployment addresses
     */
    function deployDAO(DAOConfig memory config) 
        external 
        returns (DeploymentResult memory result) 
    {
        // Validate config
        if (bytes(config.tokenName).length == 0 || 
            bytes(config.tokenSymbol).length == 0 ||
            config.initialHolder == address(0)) {
            revert InvalidConfig();
        }
        
        // 1. Deploy ProxyAdmin (with initial owner)
        result.proxyAdmin = address(new HyraProxyAdmin(msg.sender));
        
        // 2. Deploy ProxyDeployer
        result.proxyDeployer = address(new HyraProxyDeployer());
        
        // 3. Deploy Timelock implementation
        result.timelockImplementation = address(new HyraTimelock());
        
        // 4. Deploy Timelock proxy with initial configuration
        address[] memory proposers = new address[](1);
        proposers[0] = address(0); // Will be set to Governor later
        
        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute
        
        bytes memory timelockInitData = abi.encodeWithSelector(
            HyraTimelock.initialize.selector,
            config.timelockDelay,
            proposers,
            executors,
            msg.sender // Temporary admin
        );
        
        result.timelockProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.timelockImplementation,
            result.proxyAdmin,
            timelockInitData,
            "TIMELOCK"
        );
        
        // 5. Deploy Token implementation
        result.tokenImplementation = address(new HyraToken());
        
        // 6. Deploy Token proxy
        bytes memory tokenInitData = abi.encodeWithSelector(
            HyraToken.initialize.selector,
            config.tokenName,
            config.tokenSymbol,
            config.initialSupply,
            config.initialHolder,
            result.timelockProxy // Timelock is the owner
        );
        
        result.tokenProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.tokenImplementation,
            result.proxyAdmin,
            tokenInitData,
            "TOKEN"
        );
        
        // 7. Deploy Governor implementation
        result.governorImplementation = address(new HyraGovernor());
        
        // 8. Deploy Governor proxy
        bytes memory governorInitData = abi.encodeWithSelector(
            HyraGovernor.initialize.selector,
            IVotes(result.tokenProxy),
            TimelockControllerUpgradeable(payable(result.timelockProxy)),
            config.votingDelay,
            config.votingPeriod,
            config.proposalThreshold,
            config.quorumPercentage
        );
        
        result.governorProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.governorImplementation,
            result.proxyAdmin,
            governorInitData,
            "GOVERNOR"
        );
        
        // 9. Configure roles
        _configureRoles(result, config);
        
        // 10. Add proxies to ProxyAdmin
        HyraProxyAdmin(result.proxyAdmin).addProxy(result.tokenProxy, "HyraToken");
        HyraProxyAdmin(result.proxyAdmin).addProxy(result.governorProxy, "HyraGovernor");
        HyraProxyAdmin(result.proxyAdmin).addProxy(result.timelockProxy, "HyraTimelock");
        
        // 11. Transfer ProxyAdmin ownership to Timelock
        HyraProxyAdmin(result.proxyAdmin).transferOwnership(result.timelockProxy);
        
        emit DAODeployed(msg.sender, result, block.timestamp);
        
        return result;
    }
    
    /**
     * @notice Configure roles and permissions
     */
    function _configureRoles(
        DeploymentResult memory result,
        DAOConfig memory config
    ) private {
        HyraTimelock timelock = HyraTimelock(payable(result.timelockProxy));
        
        // Get role identifiers
        bytes32 PROPOSER_ROLE = timelock.PROPOSER_ROLE();
        bytes32 EXECUTOR_ROLE = timelock.EXECUTOR_ROLE();
        bytes32 CANCELLER_ROLE = timelock.CANCELLER_ROLE();
        bytes32 DEFAULT_ADMIN_ROLE = timelock.DEFAULT_ADMIN_ROLE();
        
        // Grant proposer role to Governor
        timelock.grantRole(PROPOSER_ROLE, result.governorProxy);
        
        // Grant executor role to address(0) - anyone can execute
        timelock.grantRole(EXECUTOR_ROLE, address(0));
        
        // Setup security council
        for (uint256 i = 0; i < config.securityCouncil.length; i++) {
            // Grant canceller role
            timelock.grantRole(CANCELLER_ROLE, config.securityCouncil[i]);
            
            // Note: Adding to governor security council would need to be done
            // through governance proposal after deployment as governor is owned by timelock
        }
        
        // Renounce admin role from deployer
        timelock.renounceRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @notice Verify deployment was successful
     * @param result Deployment result to verify
     * @return success True if all contracts deployed correctly
     */
    function verifyDeployment(DeploymentResult memory result) 
        external 
        view 
        returns (bool success) 
    {
        // Check all addresses are non-zero
        success = result.tokenImplementation != address(0) &&
                 result.governorImplementation != address(0) &&
                 result.timelockImplementation != address(0) &&
                 result.tokenProxy != address(0) &&
                 result.governorProxy != address(0) &&
                 result.timelockProxy != address(0) &&
                 result.proxyAdmin != address(0) &&
                 result.proxyDeployer != address(0);
        
        if (!success) return false;
        
        // Verify proxies point to correct implementations
        try HyraProxyAdmin(result.proxyAdmin).getProxyImplementation(
            result.tokenProxy
        ) returns (address impl) {
            success = impl == result.tokenImplementation;
        } catch {
            return false;
        }
        
        if (!success) return false;
        
        try HyraProxyAdmin(result.proxyAdmin).getProxyImplementation(
            result.governorProxy
        ) returns (address impl) {
            success = impl == result.governorImplementation;
        } catch {
            return false;
        }
        
        return success;
    }
    
    /**
     * @notice Calculate deployment addresses in advance
     * @param deployer Address that will deploy
     * @param nonce Starting nonce
     * @return addresses Predicted addresses
     */
    function calculateDeploymentAddresses(
        address deployer,
        uint256 nonce
    ) external pure returns (DeploymentResult memory addresses) {
        addresses.proxyAdmin = computeAddress(deployer, nonce);
        addresses.proxyDeployer = computeAddress(deployer, nonce + 1);
        addresses.timelockImplementation = computeAddress(deployer, nonce + 2);
        // Proxy addresses would be computed from ProxyDeployer's nonce
        // This is simplified - actual implementation would need ProxyDeployer's address
    }
    
    /**
     * @notice Compute contract address from deployer and nonce
     */
    function computeAddress(address deployer, uint256 nonce) 
        private 
        pure 
        returns (address) 
    {
        if (nonce == 0) {
            return address(uint160(uint256(keccak256(abi.encodePacked(
                bytes1(0xd6),
                bytes1(0x94),
                deployer,
                bytes1(0x80)
            )))));
        }
        if (nonce <= 0x7f) {
            return address(uint160(uint256(keccak256(abi.encodePacked(
                bytes1(0xd6),
                bytes1(0x94),
                deployer,
                uint8(nonce)
            )))));
        }
        if (nonce <= 0xff) {
            return address(uint160(uint256(keccak256(abi.encodePacked(
                bytes1(0xd7),
                bytes1(0x94),
                deployer,
                bytes1(0x81),
                uint8(nonce)
            )))));
        }
        // Simplified for larger nonces
        return address(uint160(uint256(keccak256(abi.encodePacked(deployer, nonce)))));
    }
}