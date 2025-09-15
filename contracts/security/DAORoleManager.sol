// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/GovernorUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorTimelockControlUpgradeable.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/**
 * @title DAORoleManager
 * @notice Decentralized role management system that replaces centralized governance roles
 * @dev Implements DAO-governed role management to eliminate centralization risks
 */
contract DAORoleManager is Initializable, AccessControlUpgradeable {
    // ============ Constants ============
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant SECURITY_COUNCIL_ROLE = keccak256("SECURITY_COUNCIL_ROLE");
    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant PROPOSER_ROLE = keccak256("PROPOSER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    
    // ============ State Variables ============
    IVotes public governanceToken;
    GovernorUpgradeable public governor;
    TimelockControllerUpgradeable public timelock;
    
    // Role management tracking
    mapping(bytes32 => mapping(address => bool)) public roleRequests;
    mapping(bytes32 => mapping(address => uint256)) public roleRequestTimestamps;
    mapping(bytes32 => mapping(address => string)) public roleRequestReasons;
    
    // Role approval requirements
    mapping(bytes32 => uint256) public roleApprovalThresholds;
    mapping(bytes32 => uint256) public roleRequestTimeouts;
    
    // ============ Events ============
    event RoleRequested(
        bytes32 indexed role,
        address indexed account,
        string reason,
        uint256 timestamp
    );
    event RoleRequestExpired(
        bytes32 indexed role,
        address indexed account
    );
    
    // ============ Errors ============
    error ZeroAddress();
    error RoleAlreadyRequested();
    error RoleRequestNotFound();
    error RoleRequestExpiredError();
    error InsufficientGovernancePower();
    error InvalidRole();
    error UnauthorizedRoleManagement();
    error RoleAlreadyGranted();
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the DAO Role Manager
     * @param _governanceToken The governance token contract
     * @param _governor The governor contract
     * @param _timelock The timelock controller
     */
    function initialize(
        IVotes _governanceToken,
        GovernorUpgradeable _governor,
        TimelockControllerUpgradeable _timelock
    ) public initializer {
        __AccessControl_init();
        
        if (address(_governanceToken) == address(0)) revert ZeroAddress();
        if (address(_governor) == address(0)) revert ZeroAddress();
        if (address(_timelock) == address(0)) revert ZeroAddress();
        
        governanceToken = _governanceToken;
        governor = _governor;
        timelock = _timelock;
        
        // Set default approval thresholds (percentage of total supply)
        roleApprovalThresholds[GOVERNANCE_ROLE] = 2000; // 20%
        roleApprovalThresholds[SECURITY_COUNCIL_ROLE] = 1500; // 15%
        roleApprovalThresholds[EXECUTOR_ROLE] = 1000; // 10%
        roleApprovalThresholds[PROPOSER_ROLE] = 500; // 5%
        roleApprovalThresholds[MINTER_ROLE] = 3000; // 30%
        
        // Set default request timeouts (7 days)
        roleRequestTimeouts[GOVERNANCE_ROLE] = 7 days;
        roleRequestTimeouts[SECURITY_COUNCIL_ROLE] = 7 days;
        roleRequestTimeouts[EXECUTOR_ROLE] = 7 days;
        roleRequestTimeouts[PROPOSER_ROLE] = 7 days;
        roleRequestTimeouts[MINTER_ROLE] = 7 days;
        
        // Grant admin role to timelock
        _grantRole(DEFAULT_ADMIN_ROLE, address(_timelock));
    }
    
    /**
     * @notice Request a role (requires governance approval)
     * @param role The role to request
     * @param reason Reason for requesting the role
     */
    function requestRole(bytes32 role, string memory reason) external {
        if (role == DEFAULT_ADMIN_ROLE) revert InvalidRole();
        if (hasRole(role, msg.sender)) revert RoleAlreadyGranted();
        if (roleRequests[role][msg.sender]) revert RoleAlreadyRequested();
        
        // Check if user has sufficient governance power
        uint256 threshold = roleApprovalThresholds[role];
        uint256 userPower = governanceToken.getVotes(msg.sender);
        uint256 totalSupply = governanceToken.getPastTotalSupply(block.number - 1);
        
        if (userPower < (totalSupply * threshold) / 10000) {
            revert InsufficientGovernancePower();
        }
        
        roleRequests[role][msg.sender] = true;
        roleRequestTimestamps[role][msg.sender] = block.timestamp;
        roleRequestReasons[role][msg.sender] = reason;
        
        emit RoleRequested(role, msg.sender, reason, block.timestamp);
    }
    
    /**
     * @notice Approve a role request (only governance can call)
     * @param role The role to approve
     * @param account The account to grant the role to
     */
    function approveRole(bytes32 role, address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!roleRequests[role][account]) revert RoleRequestNotFound();
        
        // Check if request has expired
        uint256 timeout = roleRequestTimeouts[role];
        if (block.timestamp > roleRequestTimestamps[role][account] + timeout) {
            revert RoleRequestExpiredError();
        }
        
        // Clear request
        delete roleRequests[role][account];
        delete roleRequestTimestamps[role][account];
        delete roleRequestReasons[role][account];
        
        // Grant role
        _grantRole(role, account);
        
        emit RoleGranted(role, account, msg.sender);
    }
    
    /**
     * @notice Revoke a role (only governance can call)
     * @param role The role to revoke
     * @param account The account to revoke the role from
     */
    function revokeRole(bytes32 role, address account) public override onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(role, account);
    }
    
    /**
     * @notice Clean up expired role requests
     * @param role The role to clean up
     * @param account The account to clean up
     */
    function cleanupExpiredRequest(bytes32 role, address account) external {
        if (!roleRequests[role][account]) revert RoleRequestNotFound();
        
        uint256 timeout = roleRequestTimeouts[role];
        if (block.timestamp <= roleRequestTimestamps[role][account] + timeout) {
            revert RoleRequestExpiredError();
        }
        
        delete roleRequests[role][account];
        delete roleRequestTimestamps[role][account];
        delete roleRequestReasons[role][account];
        
        emit RoleRequestExpired(role, account);
    }
    
    /**
     * @notice Update role approval threshold
     * @param role The role to update
     * @param threshold New threshold (basis points)
     */
    function updateRoleThreshold(bytes32 role, uint256 threshold) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (threshold > 10000) revert InvalidRole(); // Max 100%
        roleApprovalThresholds[role] = threshold;
    }
    
    /**
     * @notice Update role request timeout
     * @param role The role to update
     * @param timeout New timeout in seconds
     */
    function updateRoleTimeout(bytes32 role, uint256 timeout) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (timeout == 0) revert InvalidRole();
        roleRequestTimeouts[role] = timeout;
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Check if an account has requested a role
     */
    function hasRequestedRole(bytes32 role, address account) external view returns (bool) {
        return roleRequests[role][account];
    }
    
    /**
     * @notice Get role request details
     */
    function getRoleRequest(bytes32 role, address account) external view returns (
        bool exists,
        uint256 timestamp,
        string memory reason,
        bool expired
    ) {
        exists = roleRequests[role][account];
        timestamp = roleRequestTimestamps[role][account];
        reason = roleRequestReasons[role][account];
        
        if (exists) {
            uint256 timeout = roleRequestTimeouts[role];
            expired = block.timestamp > timestamp + timeout;
        }
    }
    
    /**
     * @notice Get role approval threshold
     */
    function getRoleThreshold(bytes32 role) external view returns (uint256) {
        return roleApprovalThresholds[role];
    }
    
    /**
     * @notice Check if account meets governance requirements for role
     */
    function meetsGovernanceRequirements(bytes32 role, address account) external view returns (bool) {
        uint256 threshold = roleApprovalThresholds[role];
        uint256 userPower = governanceToken.getVotes(account);
        uint256 totalSupply = governanceToken.getPastTotalSupply(block.number - 1);
        
        return userPower >= (totalSupply * threshold) / 10000;
    }
}
