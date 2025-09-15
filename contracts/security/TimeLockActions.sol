// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "./MultiSigRoleManager.sol";

/**
 * @title TimeLockActions
 * @notice Manages time-delayed actions for privileged operations
 * @dev This contract enforces delays on critical operations to allow community review
 */
contract TimeLockActions is Initializable, ReentrancyGuardUpgradeable {
    
    // ============ State Variables ============
    MultiSigRoleManager public roleManager;
    
    struct ScheduledAction {
        bytes32 actionHash;
        address target;
        bytes data;
        uint256 executeTime;
        bool executed;
        bool cancelled;
        address proposer;
        bytes32 role;
    }
    
    mapping(bytes32 => ScheduledAction) public scheduledActions;
    bytes32[] public scheduledActionList;
    
    // ============ Configuration ============
    uint256 public constant MIN_DELAY = 2 hours;
    uint256 public constant MAX_DELAY = 30 days;
    uint256 public constant DEFAULT_DELAY = 48 hours;
    
    // Role-specific delays
    mapping(bytes32 => uint256) public roleDelays;
    
    // ============ Events ============
    event ActionScheduled(
        bytes32 indexed actionHash,
        address indexed target,
        bytes32 indexed role,
        uint256 executeTime,
        address proposer
    );
    event ActionExecuted(bytes32 indexed actionHash, address indexed target);
    event ActionCancelled(bytes32 indexed actionHash, address indexed proposer);
    event DelayUpdated(bytes32 indexed role, uint256 oldDelay, uint256 newDelay);
    
    // ============ Errors ============
    error InvalidDelay(uint256 delay);
    error ActionNotFound(bytes32 actionHash);
    error AlreadyScheduled(bytes32 actionHash);
    error ActionNotReady(bytes32 actionHash, uint256 executeTime);
    error ActionAlreadyExecuted(bytes32 actionHash);
    error ActionAlreadyCancelled(bytes32 actionHash);
    error Unauthorized(bytes32 actionHash);
    error InvalidTarget(address target);
    error InvalidData(bytes data);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the TimeLockActions contract
     * @param _roleManager Address of the MultiSigRoleManager
     */
    function initialize(address _roleManager) public initializer {
        __ReentrancyGuard_init();
        
        roleManager = MultiSigRoleManager(_roleManager);
        
        // Set default delays for different roles
        _setDefaultDelays();
    }
    
    /**
     * @notice Schedule an action for future execution
     * @param target Target contract address
     * @param data Encoded function call data
     * @param role Required role for this action
     * @param delay Custom delay (0 for default)
     * @return actionHash Unique identifier for this action
     */
    function scheduleAction(
        address target,
        bytes calldata data,
        bytes32 role,
        uint256 delay
    ) external nonReentrant returns (bytes32) {
        if (target == address(0)) revert InvalidTarget(target);
        if (data.length == 0) revert InvalidData(data);
        
        // Use default delay if not specified
        if (delay == 0) {
            delay = roleDelays[role];
            if (delay == 0) {
                delay = DEFAULT_DELAY;
            }
        }
        
        if (delay < MIN_DELAY || delay > MAX_DELAY) {
            revert InvalidDelay(delay);
        }
        
        bytes32 actionHash = keccak256(abi.encodePacked(target, data, role, block.timestamp, msg.sender));
        
        if (scheduledActions[actionHash].executeTime != 0) {
            revert AlreadyScheduled(actionHash);
        }
        
        uint256 executeTime = block.timestamp + delay;
        
        ScheduledAction storage action = scheduledActions[actionHash];
        action.actionHash = actionHash;
        action.target = target;
        action.data = data;
        action.executeTime = executeTime;
        action.executed = false;
        action.cancelled = false;
        action.proposer = msg.sender;
        action.role = role;
        
        scheduledActionList.push(actionHash);
        
        emit ActionScheduled(actionHash, target, role, executeTime, msg.sender);
        
        return actionHash;
    }
    
    /**
     * @notice Execute a scheduled action
     * @param actionHash The action to execute
     */
    function executeAction(bytes32 actionHash) external nonReentrant {
        ScheduledAction storage action = scheduledActions[actionHash];
        
        if (action.executeTime == 0) revert ActionNotFound(actionHash);
        if (action.executed) revert ActionAlreadyExecuted(actionHash);
        if (action.cancelled) revert ActionAlreadyCancelled(actionHash);
        if (block.timestamp < action.executeTime) {
            revert ActionNotReady(actionHash, action.executeTime);
        }
        
        // Check if caller has the required role
        if (!roleManager.hasRole(action.role, msg.sender)) {
            revert Unauthorized(actionHash);
        }
        
        action.executed = true;
        
        // Execute the action
        (bool success, bytes memory returnData) = action.target.call(action.data);
        if (!success) {
            // Revert with the original error
            assembly {
                let returnDataSize := mload(returnData)
                revert(add(32, returnData), returnDataSize)
            }
        }
        
        emit ActionExecuted(actionHash, action.target);
    }
    
    /**
     * @notice Cancel a scheduled action
     * @param actionHash The action to cancel
     */
    function cancelAction(bytes32 actionHash) external nonReentrant {
        ScheduledAction storage action = scheduledActions[actionHash];
        
        if (action.executeTime == 0) revert ActionNotFound(actionHash);
        if (action.executed) revert ActionAlreadyExecuted(actionHash);
        if (action.cancelled) revert ActionAlreadyCancelled(actionHash);
        
        // Only proposer or role holder can cancel
        if (msg.sender != action.proposer && !roleManager.hasRole(action.role, msg.sender)) {
            revert Unauthorized(actionHash);
        }
        
        action.cancelled = true;
        
        emit ActionCancelled(actionHash, msg.sender);
    }
    
    /**
     * @notice Set delay for a specific role
     * @param role The role
     * @param delay The delay in seconds
     */
    function setRoleDelay(bytes32 role, uint256 delay) external {
        // Only admin can set delays
        require(roleManager.hasRole(roleManager.DEFAULT_ADMIN_ROLE(), msg.sender), "Not admin");
        
        if (delay < MIN_DELAY || delay > MAX_DELAY) {
            revert InvalidDelay(delay);
        }
        
        uint256 oldDelay = roleDelays[role];
        roleDelays[role] = delay;
        
        emit DelayUpdated(role, oldDelay, delay);
    }
    
    /**
     * @notice Check if an action can be executed
     * @param actionHash The action hash
     * @return canExecute True if action can be executed
     */
    function canExecuteAction(bytes32 actionHash) external view returns (bool) {
        ScheduledAction storage action = scheduledActions[actionHash];
        
        return action.executeTime != 0 && 
               !action.executed && 
               !action.cancelled &&
               block.timestamp >= action.executeTime;
    }
    
    /**
     * @notice Get action details
     * @param actionHash The action hash
     * @return target Target contract address
     * @return data Encoded function call data
     * @return executeTime When the action can be executed
     * @return executed Whether the action has been executed
     * @return cancelled Whether the action has been cancelled
     * @return proposer The proposer address
     * @return role The required role
     */
    function getActionDetails(bytes32 actionHash) external view returns (
        address target,
        bytes memory data,
        uint256 executeTime,
        bool executed,
        bool cancelled,
        address proposer,
        bytes32 role
    ) {
        ScheduledAction storage action = scheduledActions[actionHash];
        
        return (
            action.target,
            action.data,
            action.executeTime,
            action.executed,
            action.cancelled,
            action.proposer,
            action.role
        );
    }
    
    /**
     * @notice Get all scheduled actions
     * @return actions Array of scheduled action hashes
     */
    function getScheduledActions() external view returns (bytes32[] memory) {
        return scheduledActionList;
    }
    
    /**
     * @notice Get pending actions (not executed, not cancelled, ready to execute)
     * @return actions Array of pending action hashes
     */
    function getPendingActions() external view returns (bytes32[] memory) {
        bytes32[] memory pending = new bytes32[](scheduledActionList.length);
        uint256 count = 0;
        
        for (uint256 i = 0; i < scheduledActionList.length; i++) {
            bytes32 actionHash = scheduledActionList[i];
            ScheduledAction storage action = scheduledActions[actionHash];
            
            if (!action.executed && !action.cancelled && block.timestamp >= action.executeTime) {
                pending[count] = actionHash;
                count++;
            }
        }
        
        // Resize array to actual count
        bytes32[] memory result = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = pending[i];
        }
        
        return result;
    }
    
    /**
     * @notice Get delay for a role
     * @param role The role
     * @return delay The delay in seconds
     */
    function getRoleDelay(bytes32 role) external view returns (uint256) {
        uint256 delay = roleDelays[role];
        return delay == 0 ? DEFAULT_DELAY : delay;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Set default delays for different roles
     */
    function _setDefaultDelays() internal {
        // Governance actions require longer delays
        roleDelays[roleManager.GOVERNANCE_ROLE()] = 7 days;
        roleDelays[roleManager.SECURITY_COUNCIL_ROLE()] = 2 days;
        
        // Token operations
        roleDelays[roleManager.MINTER_ROLE()] = 24 hours;
        roleDelays[roleManager.PAUSER_ROLE()] = 12 hours;
        
        // Upgrade operations
        roleDelays[roleManager.UPGRADER_ROLE()] = 7 days;
        
        // Timelock operations
        roleDelays[roleManager.PROPOSER_ROLE()] = 2 days;
        roleDelays[roleManager.EXECUTOR_ROLE()] = 1 hours;
        roleDelays[roleManager.CANCELLER_ROLE()] = 1 hours;
    }
}
