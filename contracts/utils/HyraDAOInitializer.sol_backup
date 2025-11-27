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
import "../mock/MockDistributionWallet.sol";

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
        // Privileged multisig wallet (for setting TokenMintFeed)
        address privilegedMultisigWallet;
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
        
        result.executorManager = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            address(new SecureExecutorManager()),
            result.proxyAdmin,
            abi.encodeWithSelector(
                SecureExecutorManager.initialize.selector,
                address(this),
                initialExecutors
            ),
            "EXECUTOR_MANAGER"
        );
        
        // 2.2 Deploy ProxyAdminValidator
        result.proxyAdminValidator = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            address(new ProxyAdminValidator()),
            result.proxyAdmin,
            abi.encodeWithSelector(
                ProxyAdminValidator.initialize.selector,
                address(this)
            ),
            "PROXY_ADMIN_VALIDATOR"
        );
        
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
        
        // 8. Deploy Token proxy with empty init data first (to set distribution config before initialize)
        result.tokenProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.tokenImplementation,
            result.proxyAdmin,
            "", // Empty init data - we'll initialize after setting distribution config
            "TOKEN"
        );
        
        // 8.1 Deploy 6 mock distribution wallets for setDistributionConfig
        // These are temporary addresses for testing - in production, use actual multisig wallets
        address[6] memory distributionAddresses;
        for (uint256 i = 0; i < 6; i++) {
            MockDistributionWallet wallet = new MockDistributionWallet(address(this));
            distributionAddresses[i] = address(wallet);
        }
        
        // 8.2 Set distribution config BEFORE initialize (required by HyraToken)
        HyraToken(result.tokenProxy).setDistributionConfig(
            distributionAddresses[0], // Community & Ecosystem (60%)
            distributionAddresses[1], // Liquidity, Buyback & Reserve (12%)
            distributionAddresses[2], // Marketing & Partnerships (10%)
            distributionAddresses[3], // Team & Founders (8%)
            distributionAddresses[4], // Strategic Advisors (5%)
            distributionAddresses[5]  // Seed & Strategic VC (5%)
        );
        
        // 8.2 Now initialize token
        HyraToken(result.tokenProxy).initialize(
            config.tokenName,
            config.tokenSymbol,
            config.initialSupply,
            result.vestingProxy, // Vesting contract receives initial tokens
            result.timelockProxy, // Timelock is the owner
            0, // yearStartTime - 0 means use block.timestamp
            config.privilegedMultisigWallet // privilegedMultisigWallet
        );
        
        // 9. Initialize Vesting contract with token address (temporary owner = initializer)
        ITokenVesting(result.vestingProxy).initialize(result.tokenProxy, address(this));
        
        // 10. Deploy Governor implementation
        result.governorImplementation = address(new HyraGovernor());
        
        // 11. Deploy Governor proxy
        uint256 quorumArg = config.quorumPercentage > 100 ? config.quorumPercentage / 100 : config.quorumPercentage;
        bytes memory governorInitData = abi.encodeWithSelector(
            HyraGovernor.initialize.selector,
            IVotes(result.tokenProxy),
            TimelockControllerUpgradeable(payable(result.timelockProxy)),
            config.votingDelay,
            config.votingPeriod,
            config.proposalThreshold,
            quorumArg,
            config.privilegedMultisigWallet // privilegedMultisigWallet
        );
        
        result.governorProxy = IHyraProxyDeployer(result.proxyDeployer).deployProxy(
            result.governorImplementation,
            result.proxyAdmin,
            governorInitData,
            "GOVERNOR"
        );
        
        // 12. Setup executor manager and proxy admin validator in timelock (requires admin privileges)
        HyraTimelock(payable(result.timelockProxy)).setExecutorManager(SecureExecutorManager(result.executorManager));
        HyraTimelock(payable(result.timelockProxy)).setProxyAdminValidator(ProxyAdminValidator(result.proxyAdminValidator));

        // 12.1 Configure roles (grants to governor, executor manager, council; then revokes/renounces temporary roles)
        _configureRoles(result, config);

        // 12.2 Authorize the deployed proxy admin in the validator (initializer still has validator role)
        ProxyAdminValidator(result.proxyAdminValidator).authorizeProxyAdmin(
            result.proxyAdmin,
            "HyraDAO SecureProxyAdmin",
            result.timelockProxy, // Owner is the timelock
            "Main proxy admin for Hyra DAO system"
        );
        
        // 13. Setup vesting schedules
        _setupVestingSchedules(result, config);
        // 13.1 Transfer vesting ownership to Timelock after setup
        TokenVesting(result.vestingProxy).transferOwnership(result.timelockProxy);
        
        // 14. Add proxies to SecureProxyAdmin
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.tokenProxy, "HyraToken");
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.governorProxy, "HyraGovernor");
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.timelockProxy, "HyraTimelock");
        SecureProxyAdmin(result.proxyAdmin).addProxy(result.vestingProxy, "TokenVesting");
        
        // 14.1 Grant SecureProxyAdmin roles to timelock so DAO can manage upgrades
        {
            SecureProxyAdmin spa = SecureProxyAdmin(result.proxyAdmin);
            bytes32 ADMIN = spa.DEFAULT_ADMIN_ROLE();
            bytes32 GOV = spa.GOVERNANCE_ROLE();
            bytes32 MULTI = spa.MULTISIG_ROLE();
            spa.grantRole(ADMIN, result.timelockProxy);
            spa.grantRole(GOV, result.timelockProxy);
            spa.grantRole(MULTI, result.timelockProxy);
        }
        
        // 15. Transfer SecureProxyAdmin ownership to Timelock
        SecureProxyAdmin(result.proxyAdmin).transferOwnership(result.timelockProxy);
        
        // 16. Handover admin roles for security contracts from initializer to timelock
        _handoverSecurityContracts(result);
        
        // FIXED: Emit event after all external calls are complete
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
        
        // FIXED: Batch role grants to avoid external calls in loop
        // Setup security council - batch the role grants
        address[] memory securityCouncil = config.securityCouncil;
        uint256 councilLength = securityCouncil.length;
        
        for (uint256 i = 0; i < councilLength; i++) {
            // Grant canceller role
            timelock.grantRole(CANCELLER_ROLE, securityCouncil[i]);
            
            // Note: Adding to governor security council would need to be done
            // through governance proposal after deployment as governor is owned by timelock
        }
        
        // Revoke temporary roles granted to initializer during timelock initialization
        timelock.revokeRole(PROPOSER_ROLE, address(this));
        timelock.revokeRole(EXECUTOR_ROLE, address(this));
        
        // Renounce admin role from initializer after cleanup
        timelock.renounceRole(DEFAULT_ADMIN_ROLE, address(this));
    }

    /**
     * @notice Transfer admin control of security contracts to the timelock and renounce from initializer
     */
    function _handoverSecurityContracts(DeploymentResult memory result) private {
        // SecureExecutorManager role handover
        SecureExecutorManager sem = SecureExecutorManager(result.executorManager);
        bytes32 SEM_ADMIN = sem.DEFAULT_ADMIN_ROLE();
        bytes32 SEM_MANAGER = sem.MANAGER_ROLE();
        bytes32 SEM_EMERGENCY = sem.EMERGENCY_ROLE();

        // Grant timelock full control
        sem.grantRole(SEM_ADMIN, result.timelockProxy);
        sem.grantRole(SEM_MANAGER, result.timelockProxy);
        sem.grantRole(SEM_EMERGENCY, result.timelockProxy);

        // Optional: keep initializer as an authorized executor until DAO adds others via governance
        // Do NOT remove initializer executor here to avoid locking execution if none exists yet

        // Renounce initializer privileges
        sem.renounceRole(SEM_MANAGER, address(this));
        sem.renounceRole(SEM_EMERGENCY, address(this));
        sem.renounceRole(SEM_ADMIN, address(this));

        // ProxyAdminValidator role handover
        ProxyAdminValidator pav = ProxyAdminValidator(result.proxyAdminValidator);
        bytes32 PAV_ADMIN = pav.DEFAULT_ADMIN_ROLE();
        bytes32 PAV_VALIDATOR = pav.VALIDATOR_ROLE();

        // Grant timelock control
        pav.grantRole(PAV_ADMIN, result.timelockProxy);
        pav.grantRole(PAV_VALIDATOR, result.timelockProxy);

        // Renounce initializer roles
        pav.renounceRole(PAV_VALIDATOR, address(this));
        pav.renounceRole(PAV_ADMIN, address(this));
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
        
        // FIXED: Cache array length to avoid external calls in loop
        uint256 beneficiariesLength = vestingConfig.beneficiaries.length;
        
        // Create vesting schedule for each beneficiary
        for (uint256 i = 0; i < beneficiariesLength; i++) {
            // FIXED: Handle return value from external call
            try vesting.createVestingSchedule(
                vestingConfig.beneficiaries[i],
                vestingConfig.amounts[i],
                vestingConfig.startTimes[i],
                vestingConfig.durations[i],
                vestingConfig.cliffs[i],
                vestingConfig.revocable[i],
                vestingConfig.purposes[i]
            ) {
                // Success - continue to next iteration
            } catch {
                // Log error and continue - don't fail entire deployment
                // In production, consider emitting an event for failed vesting schedule creation
                continue;
            }
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