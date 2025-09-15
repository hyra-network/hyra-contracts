// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "../interfaces/IHyraTimelock.sol";
import "../security/MultiSigRoleManager.sol";
import "../security/TimeLockActions.sol";

/**
 * @title SecureHyraTimelock
 * @notice Secure TimelockController with multi-signature role management
 * @dev This contract replaces centralized roles with multi-signature requirements
 *      All privileged operations now require multiple signatures and time delays
 */
contract SecureHyraTimelock is Initializable, ReentrancyGuardUpgradeable, TimelockControllerUpgradeable, IHyraTimelock {
    // ============ State Variables ============
    mapping(address => uint256) public pendingUpgrades;
    mapping(address => address) public pendingImplementations;
    mapping(bytes32 => bool) public executedUpgrades;
    mapping(address => uint256) public upgradeNonce;
    
    // Security contracts
    MultiSigRoleManager public roleManager;
    TimeLockActions public timeLockActions;
    
    uint256 public constant UPGRADE_DELAY = 7 days;
    uint256 public constant EMERGENCY_UPGRADE_DELAY = 2 days;

    uint256[43] private __gap;
    
    // ============ Modifiers ============
    modifier onlyExecutorOrAnyone() {
        // Allow anyone to execute if address(0) has EXECUTOR_ROLE
        if (hasRole(EXECUTOR_ROLE, address(0))) {
            // Anyone can execute
            _;
        } else {
            // Only role holders can execute
            _checkRole(EXECUTOR_ROLE);
            _;
        }
    }
    
    // ============ Events ============
    event UpgradeScheduled(
        address indexed proxy,
        address indexed newImplementation,
        uint256 executeTime,
        bytes32 upgradeId
    );
    event UpgradeCancelled(address indexed proxy, bytes32 upgradeId);
    event UpgradeExecuted(
        address indexed proxy,
        address indexed newImplementation,
        bytes32 upgradeId
    );
    event EmergencyUpgradeScheduled(address indexed proxy, address indexed implementation);
    event OperationExecuted(bytes32 indexed id, uint256 index, address target, uint256 value);
    event SecurityContractsUpdated(address indexed roleManager, address indexed timeLockActions);

    // ============ Errors ============
    error InvalidProxy();
    error UpgradeAlreadyScheduled(address proxy);
    error UpgradeNotScheduled(address proxy);
    error UpgradeNotReady(address proxy, uint256 executeTime);
    error UpgradeAlreadyExecuted(address proxy);
    error InvalidImplementation();
    error ZeroAddress();
    error UnauthorizedUpgrade();
    error InvalidSecurityContract();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the Secure Timelock contract
     * @param minDelay Minimum delay for operations
     * @param proposers Array of proposer addresses
     * @param executors Array of executor addresses
     * @param admin Admin address
     * @param _roleManager Address of the MultiSigRoleManager
     * @param _timeLockActions Address of the TimeLockActions contract
     */
    function initialize(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin,
        address _roleManager,
        address _timeLockActions
    ) public initializer {
        __TimelockController_init(minDelay, proposers, executors, admin);
        __ReentrancyGuard_init();
        
        if (_roleManager == address(0) || _timeLockActions == address(0)) {
            revert ZeroAddress();
        }
        
        roleManager = MultiSigRoleManager(_roleManager);
        timeLockActions = TimeLockActions(_timeLockActions);
        
        emit SecurityContractsUpdated(_roleManager, _timeLockActions);
    }

    /**
     * @notice Schedule an upgrade (requires multi-signature)
     * @param proxy Address of the proxy to upgrade
     * @param newImplementation Address of the new implementation
     * @param isEmergency Whether this is an emergency upgrade
     * @return upgradeId Unique identifier for this upgrade
     */
    function scheduleUpgrade(
        address proxy,
        address newImplementation,
        bool isEmergency
    ) external override nonReentrant returns (bytes32) {
        if (proxy == address(0)) revert InvalidProxy();
        if (newImplementation == address(0)) revert InvalidImplementation();
        if (pendingUpgrades[proxy] != 0) revert UpgradeAlreadyScheduled(proxy);
        
        uint256 delay = isEmergency ? EMERGENCY_UPGRADE_DELAY : UPGRADE_DELAY;
        uint256 executeTime = block.timestamp + delay;
        
        bytes32 upgradeId = keccak256(abi.encodePacked(proxy, newImplementation, executeTime, upgradeNonce[proxy]));
        upgradeNonce[proxy]++;
        
        pendingUpgrades[proxy] = executeTime;
        pendingImplementations[proxy] = newImplementation;
        
        // Schedule the actual upgrade through TimeLockActions
        bytes memory data = abi.encodeWithSelector(
            this._executeUpgrade.selector,
            proxy,
            newImplementation,
            upgradeId
        );
        
        bytes32 actionHash = timeLockActions.scheduleAction(
            address(this),
            data,
            roleManager.PROPOSER_ROLE(),
            delay
        );
        
        emit UpgradeScheduled(proxy, newImplementation, executeTime, upgradeId);
        
        return upgradeId;
    }

    /**
     * @notice Cancel a scheduled upgrade (requires multi-signature)
     * @param proxy Address of the proxy
     * @return upgradeId The upgrade ID that was cancelled
     */
    function cancelUpgrade(address proxy) external override nonReentrant returns (bytes32) {
        if (proxy == address(0)) revert InvalidProxy();
        if (pendingUpgrades[proxy] == 0) revert UpgradeNotScheduled(proxy);
        
        bytes32 upgradeId = keccak256(abi.encodePacked(proxy, pendingImplementations[proxy], pendingUpgrades[proxy], upgradeNonce[proxy] - 1));
        
        // Cancel through TimeLockActions
        bytes memory data = abi.encodeWithSelector(
            this._cancelUpgrade.selector,
            proxy,
            upgradeId
        );
        
        bytes32 actionHash = timeLockActions.scheduleAction(
            address(this),
            data,
            roleManager.CANCELLER_ROLE(),
            0 // Use default delay
        );
        
        return upgradeId;
    }

    /**
     * @notice Execute a scheduled upgrade (requires multi-signature)
     * @param proxy Address of the proxy
     * @return upgradeId The upgrade ID that was executed
     */
    function executeUpgrade(address proxy) external override nonReentrant returns (bytes32) {
        if (proxy == address(0)) revert InvalidProxy();
        if (pendingUpgrades[proxy] == 0) revert UpgradeNotScheduled(proxy);
        if (block.timestamp < pendingUpgrades[proxy]) {
            revert UpgradeNotReady(proxy, pendingUpgrades[proxy]);
        }
        
        address newImplementation = pendingImplementations[proxy];
        bytes32 upgradeId = keccak256(abi.encodePacked(proxy, newImplementation, pendingUpgrades[proxy], upgradeNonce[proxy] - 1));
        
        if (executedUpgrades[upgradeId]) revert UpgradeAlreadyExecuted(proxy);
        
        // Execute through TimeLockActions
        bytes memory data = abi.encodeWithSelector(
            this._executeUpgrade.selector,
            proxy,
            newImplementation,
            upgradeId
        );
        
        bytes32 actionHash = timeLockActions.scheduleAction(
            address(this),
            data,
            roleManager.EXECUTOR_ROLE(),
            0 // Use default delay
        );
        
        return upgradeId;
    }

    /**
     * @notice Execute upgrade with initialization call (requires multi-signature)
     * @param proxy Address of the proxy
     * @param newImplementation Address of the new implementation
     * @param data Initialization data
     * @return upgradeId The upgrade ID that was executed
     */
    function executeUpgradeWithCall(
        address proxy,
        address newImplementation,
        bytes calldata data
    ) external override nonReentrant returns (bytes32) {
        if (proxy == address(0)) revert InvalidProxy();
        if (newImplementation == address(0)) revert InvalidImplementation();
        
        bytes32 upgradeId = keccak256(abi.encodePacked(proxy, newImplementation, block.timestamp, upgradeNonce[proxy]));
        upgradeNonce[proxy]++;
        
        // Execute through TimeLockActions
        bytes memory actionData = abi.encodeWithSelector(
            this._executeUpgradeWithCall.selector,
            proxy,
            newImplementation,
            data,
            upgradeId
        );
        
        bytes32 actionHash = timeLockActions.scheduleAction(
            address(this),
            actionData,
            roleManager.EXECUTOR_ROLE(),
            0 // Use default delay
        );
        
        return upgradeId;
    }

    /**
     * @notice Schedule emergency upgrade (requires multi-signature)
     * @param proxy Address of the proxy
     * @param implementation Address of the new implementation
     * @return upgradeId The upgrade ID
     */
    function scheduleEmergencyUpgrade(
        address proxy,
        address implementation
    ) external override nonReentrant returns (bytes32) {
        if (proxy == address(0)) revert InvalidProxy();
        if (implementation == address(0)) revert InvalidImplementation();
        
        // Emergency upgrades require Security Council role
        bytes memory data = abi.encodeWithSelector(
            this._scheduleEmergencyUpgrade.selector,
            proxy,
            implementation
        );
        
        bytes32 actionHash = timeLockActions.scheduleAction(
            address(this),
            data,
            roleManager.SECURITY_COUNCIL_ROLE(),
            EMERGENCY_UPGRADE_DELAY
        );
        
        return keccak256(abi.encodePacked(proxy, implementation, block.timestamp));
    }

    // ============ Internal Functions (called by TimeLockActions) ============

    /**
     * @notice Internal function to execute upgrade (called by TimeLockActions)
     * @param proxy Address of the proxy
     * @param newImplementation Address of the new implementation
     * @param upgradeId The upgrade ID
     */
    function _executeUpgrade(
        address proxy,
        address newImplementation,
        bytes32 upgradeId
    ) external {
        // Only TimeLockActions can call this
        require(msg.sender == address(timeLockActions), "Only TimeLockActions");
        
        // Clear pending upgrade
        delete pendingUpgrades[proxy];
        delete pendingImplementations[proxy];
        
        // Mark as executed
        executedUpgrades[upgradeId] = true;
        
        // Execute the upgrade
        ITransparentUpgradeableProxy(proxy).upgradeTo(newImplementation);
        
        emit UpgradeExecuted(proxy, newImplementation, upgradeId);
    }

    /**
     * @notice Internal function to execute upgrade with call (called by TimeLockActions)
     * @param proxy Address of the proxy
     * @param newImplementation Address of the new implementation
     * @param data Initialization data
     * @param upgradeId The upgrade ID
     */
    function _executeUpgradeWithCall(
        address proxy,
        address newImplementation,
        bytes calldata data,
        bytes32 upgradeId
    ) external {
        // Only TimeLockActions can call this
        require(msg.sender == address(timeLockActions), "Only TimeLockActions");
        
        // Mark as executed
        executedUpgrades[upgradeId] = true;
        
        // Execute the upgrade with call
        ITransparentUpgradeableProxy(proxy).upgradeToAndCall(newImplementation, data);
        
        emit UpgradeExecuted(proxy, newImplementation, upgradeId);
    }

    /**
     * @notice Internal function to cancel upgrade (called by TimeLockActions)
     * @param proxy Address of the proxy
     * @param upgradeId The upgrade ID
     */
    function _cancelUpgrade(address proxy, bytes32 upgradeId) external {
        // Only TimeLockActions can call this
        require(msg.sender == address(timeLockActions), "Only TimeLockActions");
        
        // Clear pending upgrade
        delete pendingUpgrades[proxy];
        delete pendingImplementations[proxy];
        
        emit UpgradeCancelled(proxy, upgradeId);
    }

    /**
     * @notice Internal function to schedule emergency upgrade (called by TimeLockActions)
     * @param proxy Address of the proxy
     * @param implementation Address of the new implementation
     */
    function _scheduleEmergencyUpgrade(address proxy, address implementation) external {
        // Only TimeLockActions can call this
        require(msg.sender == address(timeLockActions), "Only TimeLockActions");
        
        uint256 executeTime = block.timestamp + EMERGENCY_UPGRADE_DELAY;
        
        pendingUpgrades[proxy] = executeTime;
        pendingImplementations[proxy] = implementation;
        
        emit EmergencyUpgradeScheduled(proxy, implementation);
    }

    /**
     * @notice Update security contracts (requires multi-signature)
     * @param _roleManager New role manager address
     * @param _timeLockActions New time lock actions address
     */
    function updateSecurityContracts(
        address _roleManager,
        address _timeLockActions
    ) external {
        if (_roleManager == address(0) || _timeLockActions == address(0)) {
            revert ZeroAddress();
        }
        
        // This function requires multi-signature approval
        bytes memory data = abi.encodeWithSelector(
            this._updateSecurityContracts.selector,
            _roleManager,
            _timeLockActions
        );
        
        bytes32 actionHash = timeLockActions.scheduleAction(
            address(this),
            data,
            roleManager.GOVERNANCE_ROLE(),
            0 // Use default delay
        );
    }
    
    /**
     * @notice Internal function to update security contracts (called by TimeLockActions)
     * @param _roleManager New role manager address
     * @param _timeLockActions New time lock actions address
     */
    function _updateSecurityContracts(
        address _roleManager,
        address _timeLockActions
    ) external {
        // Only TimeLockActions can call this
        require(msg.sender == address(timeLockActions), "Only TimeLockActions");
        
        roleManager = MultiSigRoleManager(_roleManager);
        timeLockActions = TimeLockActions(_timeLockActions);
        
        emit SecurityContractsUpdated(_roleManager, _timeLockActions);
    }

    // ============ View Functions ============

    /**
     * @notice Check if an upgrade is scheduled
     * @param proxy Address of the proxy
     * @return scheduled True if upgrade is scheduled
     */
    function isUpgradeScheduled(address proxy) external view returns (bool) {
        return pendingUpgrades[proxy] != 0;
    }

    /**
     * @notice Get pending upgrade details
     * @param proxy Address of the proxy
     * @return implementation Address of the new implementation
     * @return executeTime When the upgrade can be executed
     */
    function getPendingUpgrade(address proxy) external view returns (address implementation, uint256 executeTime) {
        return (pendingImplementations[proxy], pendingUpgrades[proxy]);
    }

    /**
     * @notice Check if an upgrade has been executed
     * @param upgradeId The upgrade ID
     * @return executed True if upgrade has been executed
     */
    function isUpgradeExecuted(bytes32 upgradeId) external view returns (bool) {
        return executedUpgrades[upgradeId];
    }

    /**
     * @notice Get the current security contracts
     * @return _roleManager Address of the role manager
     * @return _timeLockActions Address of the time lock actions contract
     */
    function getSecurityContracts() external view returns (address _roleManager, address _timeLockActions) {
        return (address(roleManager), address(timeLockActions));
    }

    /**
     * @notice Get upgrade nonce for a proxy
     * @param proxy Address of the proxy
     * @return nonce The upgrade nonce
     */
    function getUpgradeNonce(address proxy) external view returns (uint256) {
        return upgradeNonce[proxy];
    }

    // ============ Override Functions ============

    /**
     * @notice Execute an operation
     * @param id Operation ID
     * @param index Operation index
     * @param target Target address
     * @param value ETH value
     * @param data Operation data
     */
    function execute(
        bytes32 id,
        uint256 index,
        address target,
        uint256 value,
        bytes calldata data
    ) public override onlyExecutorOrAnyone {
        super.execute(id, index, target, value, data);
        emit OperationExecuted(id, index, target, value);
    }

    /**
     * @notice Execute an operation with salt
     * @param id Operation ID
     * @param index Operation index
     * @param target Target address
     * @param value ETH value
     * @param data Operation data
     * @param salt Salt for the operation
     */
    function executeWithSalt(
        bytes32 id,
        uint256 index,
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 salt
    ) public override onlyExecutorOrAnyone {
        super.executeWithSalt(id, index, target, value, data, salt);
        emit OperationExecuted(id, index, target, value);
    }
}
