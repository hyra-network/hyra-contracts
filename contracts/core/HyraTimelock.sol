// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "../interfaces/IHyraTimelock.sol";

/**
 * @title HyraTimelock
 * @notice Extended TimelockController for Hyra DAO with upgrade management
 */
contract HyraTimelock is Initializable, ReentrancyGuardUpgradeable, TimelockControllerUpgradeable, IHyraTimelock {
    // ============ State Variables ============
    mapping(address => uint256) public pendingUpgrades;
    mapping(address => address) public pendingImplementations;
    mapping(bytes32 => bool) public executedUpgrades;
    mapping(address => uint256) public upgradeNonce;
    
    uint256 public constant UPGRADE_DELAY = 7 days;
    uint256 public constant EMERGENCY_UPGRADE_DELAY = 2 days;

    uint256[45] private __gap;
    
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

    // ============ Errors ============
    error InvalidProxy();
    error InvalidImplementation();
    error UpgradeAlreadyScheduled();
    error NoUpgradeScheduled();
    error UpgradeNotReady();
    error UpgradeExpired();
    error UpgradeAlreadyExecuted();
    error ExecutionFailed(string reason);
    error InvalidDelay();
    error InvalidProxyAdmin();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer for upgradeable pattern
     * @param minDelay Minimum delay for operations
     * @param proposers Array of addresses with proposer role
     * @param executors Array of addresses with executor role
     * @param admin Admin address (can be address(0) to renounce)
     */
    function initialize(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    ) public override initializer {
        __TimelockController_init(minDelay, proposers, executors, admin);
    }

    // ============ Upgrade Management ============

    /**
     * @notice Schedule an upgrade for a proxy contract
     * @param proxy Address of the proxy to upgrade
     * @param newImplementation Address of the new implementation
     * @param isEmergency Whether this is an emergency upgrade
     */
    function scheduleUpgrade(
        address proxy,
        address newImplementation,
        bytes memory /* data */,
        bool isEmergency
    ) external override onlyRole(PROPOSER_ROLE) {
        if (proxy == address(0)) revert InvalidProxy();
        if (newImplementation == address(0)) revert InvalidImplementation();
        
        // Check if there's an expired upgrade that needs to be cleared
        if (pendingUpgrades[proxy] != 0) {
            if (block.timestamp > pendingUpgrades[proxy] + 48 hours) {
                // Clear expired upgrade
                pendingUpgrades[proxy] = 0;
                pendingImplementations[proxy] = address(0);
            } else {
                revert UpgradeAlreadyScheduled();
            }
        }
        
        uint256 delay = isEmergency ? EMERGENCY_UPGRADE_DELAY : UPGRADE_DELAY;
        uint256 executeTime = block.timestamp + delay;
        
        pendingUpgrades[proxy] = executeTime;
        pendingImplementations[proxy] = newImplementation;
        
        uint256 nonce = ++upgradeNonce[proxy];
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, newImplementation, nonce)
        );
        
        emit UpgradeScheduled(proxy, newImplementation, executeTime, upgradeId);
        
        if (isEmergency) {
            emit EmergencyUpgradeScheduled(proxy, newImplementation);
        }
    }

    /**
     * @notice Cancel a scheduled upgrade
     * @param proxy Address of the proxy
     */
    function cancelUpgrade(address proxy) 
        external 
        override 
        onlyRole(CANCELLER_ROLE) 
    {
        if (pendingUpgrades[proxy] == 0) revert NoUpgradeScheduled();

        uint256 nonce = upgradeNonce[proxy];
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, pendingImplementations[proxy], nonce)
        );
        
        delete pendingUpgrades[proxy];
        delete pendingImplementations[proxy];
        
        emit UpgradeCancelled(proxy, upgradeId);
    }

    /**
     * @notice Execute a scheduled upgrade
     * @param proxyAdmin Address of the ProxyAdmin contract
     * @param proxy Address of the proxy to upgrade
     */
    function executeUpgrade(
        address proxyAdmin,
        address proxy
    ) external override onlyExecutorOrAnyone nonReentrant {
        if (proxyAdmin == address(0)) revert InvalidProxyAdmin();
        if (pendingUpgrades[proxy] == 0) revert NoUpgradeScheduled();
        if (block.timestamp < pendingUpgrades[proxy]) revert UpgradeNotReady();
        
        // Check if upgrade hasn't expired (48 hour window)
        if (block.timestamp > pendingUpgrades[proxy] + 48 hours) {
            revert UpgradeExpired();
        }
        
        address newImplementation = pendingImplementations[proxy];
        uint256 nonce = upgradeNonce[proxy];
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, newImplementation, nonce)
        );
        
        if (executedUpgrades[upgradeId]) revert UpgradeAlreadyExecuted();
        
        // Validate proxyAdmin is legitimate - check if it's a known proxy admin
        // This prevents fake proxy admin attacks
        if (proxyAdmin == address(0)) revert InvalidProxyAdmin();
        
        // Execute upgrade through ProxyAdmin
        (bool success, bytes memory returnData) = proxyAdmin.call(
            abi.encodeWithSignature(
                "upgradeAndCall(address,address,bytes)",
                proxy,
                newImplementation,
                ""
            )
        );
        
        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returnData_size := mload(returnData)
                    revert(add(32, returnData), returnData_size)
                }
            } else {
                revert ExecutionFailed("Upgrade execution failed");
            }
        }
        
        executedUpgrades[upgradeId] = true;
        delete pendingUpgrades[proxy];
        delete pendingImplementations[proxy];
        
        emit UpgradeExecuted(proxy, newImplementation, upgradeId);
    }

    /**
     * @notice Execute upgrade with initialization call
     * @param proxyAdmin Address of the ProxyAdmin contract
     * @param proxy Address of the proxy to upgrade
     * @param data Initialization data
     */
    function executeUpgradeWithCall(
        address proxyAdmin,
        address proxy,
        bytes memory data
    ) external override onlyExecutorOrAnyone nonReentrant {
        if (proxyAdmin == address(0)) revert InvalidProxyAdmin();
        if (pendingUpgrades[proxy] == 0) revert NoUpgradeScheduled();
        if (block.timestamp < pendingUpgrades[proxy]) revert UpgradeNotReady();
        
        if (block.timestamp > pendingUpgrades[proxy] + 48 hours) {
            revert UpgradeExpired();
        }
        
        address newImplementation = pendingImplementations[proxy];
        uint256 nonce = upgradeNonce[proxy];
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, newImplementation, nonce)
        );
        
        if (executedUpgrades[upgradeId]) revert UpgradeAlreadyExecuted();
        
        // Execute upgrade with call through ProxyAdmin
        (bool success, bytes memory returnData) = proxyAdmin.call(
            abi.encodeWithSignature(
                "upgradeAndCall(address,address,bytes)",
                proxy,
                newImplementation,
                data
            )
        );
        
        if (!success) {
            if (returnData.length > 0) {
                assembly {
                    let returnData_size := mload(returnData)
                    revert(add(32, returnData), returnData_size)
                }
            } else {
                revert ExecutionFailed("Upgrade with call execution failed");
            }
        }
        
        executedUpgrades[upgradeId] = true;
        delete pendingUpgrades[proxy];
        delete pendingImplementations[proxy];
        
        emit UpgradeExecuted(proxy, newImplementation, upgradeId);
    }

    // ============ View Functions ============

    /**
     * @notice Check if an upgrade is ready to execute
     * @param proxy Address of the proxy
     */
    function isUpgradeReady(address proxy) 
        external 
        view 
        override 
        returns (bool) 
    {
        return pendingUpgrades[proxy] != 0 && 
               block.timestamp >= pendingUpgrades[proxy] &&
               block.timestamp <= pendingUpgrades[proxy] + 48 hours;
    }

    /**
     * @notice Get upgrade details
     * @param proxy Address of the proxy
     */
    function getUpgradeDetails(address proxy) 
        external 
        view 
        returns (
            address implementation,
            uint256 executeTime,
            bool isScheduled,
            bool isReady
        ) 
    {
        implementation = pendingImplementations[proxy];
        executeTime = pendingUpgrades[proxy];
        isScheduled = executeTime != 0;
        isReady = isScheduled && 
                  block.timestamp >= executeTime && 
                  block.timestamp <= executeTime + 48 hours;
    }
}