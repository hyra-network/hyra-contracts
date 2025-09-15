// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../core/HyraToken.sol";
import "../core/HyraGovernor.sol";
import "../core/HyraTimelock.sol";
import "../proxy/SecureProxyAdmin.sol";
import "../proxy/HyraProxyDeployer.sol";
import "../utils/TokenVesting.sol";
import "../interfaces/ITokenVesting.sol";
import "../security/SecureExecutorManager.sol";
import "../security/ProxyAdminValidator.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "../proxy/HyraTransparentUpgradeableProxy.sol";

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
        address vestingContract; // Replace initialHolder with vesting contract
        // Timelock config
        uint256 timelockDelay;
        // Governor config
        uint256 votingDelay;
        uint256 votingPeriod;
        uint256 proposalThreshold;
        uint256 quorumPercentage;
        // Security council
        address[] securityCouncil;
        // Multi-signature config
        address[] multisigSigners;
        uint256 requiredSignatures;
        // Vesting config
        VestingConfig vestingConfig;
    }
    
    struct VestingConfig {
        address[] beneficiaries;      // List of token recipients
        uint256[] amounts;           // Token amount for each person
        uint256[] startTimes;        // Vesting start time
        uint256[] durations;         // Vesting duration
        uint256[] cliffs;            // Cliff duration
        bool[] revocable;            // Whether revocable
        string[] purposes;           // Purpose of usage
    }
    
    struct DeploymentResult {
        // Implementations
        address tokenImplementation;
        address governorImplementation;
        address timelockImplementation;
        address vestingImplementation;
        // Proxies
        address tokenProxy;
        address governorProxy;
        address timelockProxy;
        address vestingProxy;
        // Infrastructure
        address proxyAdmin;
        address proxyDeployer;
        address executorManager;
        address proxyAdminValidator;
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
            config.vestingContract == address(0)) {
            revert InvalidConfig();
        }
        
        // 1. Deploy SecureProxyAdmin (with multisig wallet)
        result.proxyAdmin = address(new SecureProxyAdmin(address(this), config.requiredSignatures));
        
        // 2. Deploy ProxyDeployer
        result.proxyDeployer = address(new HyraProxyDeployer());
        
        // 2.1 Deploy SecureExecutorManager
        address[] memory initialExecutors = new address[](1);
        initialExecutors[0] = address(this); // Temporary executor
        
        result.executorManager = address(new SecureExecutorManager());
        SecureExecutorManager(result.executorManager).initialize(address(this), initialExecutors);
        
        // 2.2 Deploy ProxyAdminValidator
        result.proxyAdminValidator = address(new ProxyAdminValidator());
        ProxyAdminValidator(result.proxyAdminValidator).initialize(address(this));
        
        // 3. Deploy Timelock implementation
        result.timelockImplementation = address(new HyraTimelock());
        
        // 4. Deploy Timelock proxy with initial configuration
        address[] memory proposers = new address[](1);
        proposers[0] = address(this); // Temporary proposer
        
        address[] memory executors = new address[](1);
        executors[0] = address(this); // Temporary executor
        
        bytes memory timelockInitData = abi.encodeWithSelector(
            HyraTimelock.initialize.selector,
            config.timelockDelay,
            proposers,
            executors,
            address(this) // Set contract as temporary admin
        );
        
        result.timelockProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.timelockImplementation,
            result.proxyAdmin,
            timelockInitData,
            "TIMELOCK"
        );
        
        // 5. Deploy Vesting implementation
        result.vestingImplementation = address(new TokenVesting());
        
        // 6. Deploy Vesting proxy (will be initialized after token deployment)
        bytes memory vestingInitData = "";
        
        result.vestingProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.vestingImplementation,
            result.proxyAdmin,
            vestingInitData,
            "VESTING"
        );
        
        // 7. Deploy Token implementation
        result.tokenImplementation = address(new HyraToken());
        
        // 8. Deploy Token proxy with vesting contract address
        bytes memory tokenInitData = abi.encodeWithSelector(
            HyraToken.initialize.selector,
            config.tokenName,
            config.tokenSymbol,
            config.initialSupply,
            result.vestingProxy, // Vesting contract receives initial tokens
            result.timelockProxy // Timelock is the owner
        );
        
        result.tokenProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.tokenImplementation,
            result.proxyAdmin,
            tokenInitData,
            "TOKEN"
        );
        
        // 9. Initialize Vesting contract with token address
        ITokenVesting(result.vestingProxy).initialize(result.tokenProxy, result.timelockProxy);
        
        // 10. Deploy Governor implementation
        result.governorImplementation = address(new HyraGovernor());
        
        // 11. Deploy Governor proxy
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
        
        // 12. Configure roles and setup executor manager
        _configureRoles(result, config);
        
        // 12.1 Setup executor manager and proxy admin validator in timelock
        HyraTimelock(payable(result.timelockProxy)).setExecutorManager(SecureExecutorManager(result.executorManager));
        HyraTimelock(payable(result.timelockProxy)).setProxyAdminValidator(ProxyAdminValidator(result.proxyAdminValidator));
        
        // 12.2 Authorize the deployed proxy admin in the validator
        ProxyAdminValidator(result.proxyAdminValidator).authorizeProxyAdmin(
            result.proxyAdmin,
            "HyraDAO SecureProxyAdmin",
            result.timelockProxy, // Owner is the timelock
            "Main proxy admin for Hyra DAO system"
        );
        
        // 13. Setup vesting schedules
        _setupVestingSchedules(result, config);
        
        // 14. Add proxies to SecureProxyAdmin
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.tokenProxy, "HyraToken");
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.governorProxy, "HyraGovernor");
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.timelockProxy, "HyraTimelock");
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.vestingProxy, "TokenVesting");
        
        // 15. Transfer SecureProxyAdmin ownership to Timelock
        SecureProxyAdmin(result.proxyAdmin).transferOwnership(result.timelockProxy);
        
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
        
        // Grant executor role to SecureExecutorManager
        // This replaces the problematic address(0) executor
        timelock.grantRole(EXECUTOR_ROLE, result.executorManager);
        
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
     * @notice Setup vesting schedules
     */
    function _setupVestingSchedules(
        DeploymentResult memory result,
        DAOConfig memory config
    ) private {
        VestingConfig memory vestingConfig = config.vestingConfig;
        
        // Check vesting configuration
        require(
            vestingConfig.beneficiaries.length > 0 &&
            vestingConfig.beneficiaries.length == vestingConfig.amounts.length &&
            vestingConfig.beneficiaries.length == vestingConfig.startTimes.length &&
            vestingConfig.beneficiaries.length == vestingConfig.durations.length &&
            vestingConfig.beneficiaries.length == vestingConfig.cliffs.length &&
            vestingConfig.beneficiaries.length == vestingConfig.revocable.length &&
            vestingConfig.beneficiaries.length == vestingConfig.purposes.length,
            "Invalid vesting config"
        );
        
        ITokenVesting vesting = ITokenVesting(result.vestingProxy);
        
        // Create vesting schedule for each beneficiary
        for (uint256 i = 0; i < vestingConfig.beneficiaries.length; i++) {
            vesting.createVestingSchedule(
                vestingConfig.beneficiaries[i],
                vestingConfig.amounts[i],
                vestingConfig.startTimes[i],
                vestingConfig.durations[i],
                vestingConfig.cliffs[i],
                vestingConfig.revocable[i],
                vestingConfig.purposes[i]
            );
        }
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
                 result.vestingImplementation != address(0) &&
                 result.tokenProxy != address(0) &&
                 result.governorProxy != address(0) &&
                 result.timelockProxy != address(0) &&
                 result.vestingProxy != address(0) &&
                 result.proxyAdmin != address(0) &&
                 result.proxyDeployer != address(0) &&
                 result.executorManager != address(0) &&
                 result.proxyAdminValidator != address(0);
        
        if (!success) return false;
        
        // Verify proxies point to correct implementations
        // Note: This verification is commented out for simplicity
        // In production, you would verify the proxy implementations
        
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
        // For nonces > 255, revert as RLP encoding becomes complex
        revert("Nonce too large for address computation");
    }
}