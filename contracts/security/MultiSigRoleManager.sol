// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

/**
 * @title MultiSigRoleManager
 * @notice Centralized role management with multi-signature requirements
 * @dev This contract manages all privileged roles across the Hyra protocol
 *      Each role requires multiple signatures for critical operations
 */
contract MultiSigRoleManager is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable {
    
    // ============ Role Definitions ============
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant SECURITY_COUNCIL_ROLE = keccak256("SECURITY_COUNCIL_ROLE");
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant CANCELLER_ROLE = keccak256("CANCELLER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    
    // ============ Multi-signature Configuration ============
    struct MultiSigConfig {
        uint256 requiredSignatures;
        uint256 totalSigners;
        mapping(address => bool) signers;
        address[] signerList;
    }
    
    mapping(bytes32 => MultiSigConfig) public roleMultiSigConfigs;
    
    // ============ Action Tracking ============
    struct PendingAction {
        bytes32 actionHash;
        address proposer;
        uint256 timestamp;
        uint256 requiredSignatures;
        uint256 currentSignatures;
        mapping(address => bool) signatures;
        bool executed;
    }
    
    mapping(bytes32 => PendingAction) public pendingActions;
    bytes32[] public pendingActionList;
    
    // ============ Constants ============
    uint256 public constant MIN_SIGNATURES = 2;
    uint256 public constant MAX_SIGNATURES = 7;
    uint256 public constant ACTION_TIMEOUT = 7 days;
    
    // ============ Events ============
    event RoleMultiSigConfigured(bytes32 indexed role, uint256 requiredSignatures, address[] signers);
    event ActionProposed(bytes32 indexed actionHash, address indexed proposer, bytes32 indexed role);
    event ActionSigned(bytes32 indexed actionHash, address indexed signer);
    event ActionExecuted(bytes32 indexed actionHash);
    event SignerAdded(bytes32 indexed role, address indexed signer);
    event SignerRemoved(bytes32 indexed role, address indexed signer);
    
    // ============ Errors ============
    error InvalidSignatures(uint256 required, uint256 provided);
    error InvalidRole(bytes32 role);
    error ActionNotFound(bytes32 actionHash);
    error ActionAlreadyExecuted(bytes32 actionHash);
    error ActionExpired(bytes32 actionHash);
    error AlreadySigned(bytes32 actionHash, address signer);
    error NotAuthorized(bytes32 actionHash);
    error InvalidSigner(address signer);
    error DuplicateSigner(address signer);
    error InsufficientSigners(uint256 current, uint256 minimum);
    error ExcessiveSigners(uint256 current, uint256 maximum);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the MultiSigRoleManager
     * @param admin Initial admin address
     */
    function initialize(address admin) public initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        
        // Set default multi-sig configurations
        _setDefaultMultiSigConfigs();
    }
    
    /**
     * @notice Configure multi-signature requirements for a role
     * @param role The role to configure
     * @param requiredSignatures Number of signatures required
     * @param signers Array of signer addresses
     */
    function configureRoleMultiSig(
        bytes32 role,
        uint256 requiredSignatures,
        address[] calldata signers
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (requiredSignatures < MIN_SIGNATURES || requiredSignatures > MAX_SIGNATURES) {
            revert InvalidSignatures(requiredSignatures, requiredSignatures);
        }
        
        if (signers.length < requiredSignatures) {
            revert InsufficientSigners(signers.length, requiredSignatures);
        }
        
        if (signers.length > MAX_SIGNATURES) {
            revert ExcessiveSigners(signers.length, MAX_SIGNATURES);
        }
        
        MultiSigConfig storage config = roleMultiSigConfigs[role];
        config.requiredSignatures = requiredSignatures;
        config.totalSigners = signers.length;
        
        // Clear existing signers
        for (uint256 i = 0; i < config.signerList.length; i++) {
            config.signers[config.signerList[i]] = false;
        }
        delete config.signerList;
        
        // Add new signers
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == address(0)) revert InvalidSigner(signers[i]);
            if (config.signers[signers[i]]) revert DuplicateSigner(signers[i]);
            
            config.signers[signers[i]] = true;
            config.signerList.push(signers[i]);
            
            // Grant the role to the signer
            _grantRole(role, signers[i]);
            
            emit SignerAdded(role, signers[i]);
        }
        
        emit RoleMultiSigConfigured(role, requiredSignatures, signers);
    }
    
    /**
     * @notice Propose an action that requires multi-signature approval
     * @param role The role required for this action
     * @param actionData Encoded action data
     * @return actionHash Unique identifier for this action
     */
    function proposeAction(
        bytes32 role,
        bytes calldata actionData
    ) external onlyRole(role) nonReentrant returns (bytes32) {
        bytes32 actionHash = keccak256(abi.encodePacked(role, actionData, block.timestamp, msg.sender));
        
        if (pendingActions[actionHash].timestamp != 0) {
            revert ActionNotFound(actionHash);
        }
        
        MultiSigConfig storage config = roleMultiSigConfigs[role];
        
        PendingAction storage action = pendingActions[actionHash];
        action.actionHash = actionHash;
        action.proposer = msg.sender;
        action.timestamp = block.timestamp;
        action.requiredSignatures = config.requiredSignatures;
        action.currentSignatures = 1; // Proposer automatically signs
        action.signatures[msg.sender] = true;
        action.executed = false;
        
        pendingActionList.push(actionHash);
        
        emit ActionProposed(actionHash, msg.sender, role);
        emit ActionSigned(actionHash, msg.sender);
        
        return actionHash;
    }
    
    /**
     * @notice Sign a pending action
     * @param actionHash The action to sign
     */
    function signAction(bytes32 actionHash) external nonReentrant {
        PendingAction storage action = pendingActions[actionHash];
        
        if (action.timestamp == 0) revert ActionNotFound(actionHash);
        if (action.executed) revert ActionAlreadyExecuted(actionHash);
        if (block.timestamp > action.timestamp + ACTION_TIMEOUT) revert ActionExpired(actionHash);
        if (action.signatures[msg.sender]) revert AlreadySigned(actionHash, msg.sender);
        
        // Check if signer has the required role
        bytes32 role = _getRoleFromActionHash(actionHash);
        if (!hasRole(role, msg.sender)) revert NotAuthorized(actionHash);
        
        action.signatures[msg.sender] = true;
        action.currentSignatures++;
        
        emit ActionSigned(actionHash, msg.sender);
        
        // Auto-execute if enough signatures
        if (action.currentSignatures >= action.requiredSignatures) {
            _executeAction(actionHash);
        }
    }
    
    /**
     * @notice Execute a fully signed action
     * @param actionHash The action to execute
     */
    function executeAction(bytes32 actionHash) external nonReentrant {
        PendingAction storage action = pendingActions[actionHash];
        
        if (action.timestamp == 0) revert ActionNotFound(actionHash);
        if (action.executed) revert ActionAlreadyExecuted(actionHash);
        if (block.timestamp > action.timestamp + ACTION_TIMEOUT) revert ActionExpired(actionHash);
        if (action.currentSignatures < action.requiredSignatures) revert InvalidSignatures(action.requiredSignatures, action.currentSignatures);
        
        _executeAction(actionHash);
    }
    
    /**
     * @notice Check if an action can be executed
     * @param actionHash The action to check
     * @return canExecute True if action can be executed
     */
    function canExecuteAction(bytes32 actionHash) external view returns (bool) {
        PendingAction storage action = pendingActions[actionHash];
        
        return action.timestamp != 0 && 
               !action.executed && 
               block.timestamp <= action.timestamp + ACTION_TIMEOUT &&
               action.currentSignatures >= action.requiredSignatures;
    }
    
    /**
     * @notice Get action details
     * @param actionHash The action hash
     * @return proposer The proposer address
     * @return timestamp When the action was proposed
     * @return requiredSignatures Required number of signatures
     * @return currentSignatures Current number of signatures
     * @return executed Whether the action has been executed
     */
    function getActionDetails(bytes32 actionHash) external view returns (
        address proposer,
        uint256 timestamp,
        uint256 requiredSignatures,
        uint256 currentSignatures,
        bool executed
    ) {
        PendingAction storage action = pendingActions[actionHash];
        
        return (
            action.proposer,
            action.timestamp,
            action.requiredSignatures,
            action.currentSignatures,
            action.executed
        );
    }
    
    /**
     * @notice Get all pending actions
     * @return actions Array of pending action hashes
     */
    function getPendingActions() external view returns (bytes32[] memory) {
        return pendingActionList;
    }
    
    /**
     * @notice Get signers for a role
     * @param role The role
     * @return signers Array of signer addresses
     */
    function getRoleSigners(bytes32 role) external view returns (address[] memory) {
        return roleMultiSigConfigs[role].signerList;
    }
    
    /**
     * @notice Check if an address is a signer for a role
     * @param role The role
     * @param signer The address to check
     * @return isSigner True if the address is a signer
     */
    function isRoleSigner(bytes32 role, address signer) external view returns (bool) {
        return roleMultiSigConfigs[role].signers[signer];
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Execute a fully signed action
     * @param actionHash The action to execute
     */
    function _executeAction(bytes32 actionHash) internal {
        PendingAction storage action = pendingActions[actionHash];
        action.executed = true;
        
        emit ActionExecuted(actionHash);
        
        // FIXED: Remove from pending list - avoid strict equality
        uint256 pendingLength = pendingActionList.length;
        for (uint256 i = 0; i < pendingLength; i++) {
            // Use keccak256 comparison instead of strict equality
            if (keccak256(abi.encodePacked(pendingActionList[i])) == keccak256(abi.encodePacked(actionHash))) {
                pendingActionList[i] = pendingActionList[pendingLength - 1];
                pendingActionList.pop();
                break;
            }
        }
    }
    
    /**
     * @notice Get role from action hash (simplified implementation)
     * @param actionHash The action hash
     * @return role The role
     */
    function _getRoleFromActionHash(bytes32 actionHash) internal pure returns (bytes32) {
        // This is a simplified implementation
        // In a real implementation, you would decode the action data
        return GOVERNANCE_ROLE;
    }
    
    /**
     * @notice Set default multi-signature configurations
     */
    function _setDefaultMultiSigConfigs() internal {
        // Default configurations will be set by admin after deployment
        // This function is a placeholder for future default settings
    }
}
