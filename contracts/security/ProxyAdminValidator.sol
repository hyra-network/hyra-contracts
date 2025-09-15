// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title ProxyAdminValidator
 * @notice Validates legitimate proxy admin addresses to prevent fake proxy admin attacks
 * @dev Implements secure proxy admin validation to prevent unauthorized upgrades
 */
contract ProxyAdminValidator is Initializable, AccessControlUpgradeable {
    // ============ Constants ============
    bytes32 public constant VALIDATOR_ROLE = keccak256("VALIDATOR_ROLE");
    
    // ============ State Variables ============
    mapping(address => bool) public authorizedProxyAdmins;
    mapping(address => ProxyAdminInfo) public proxyAdminInfo;
    
    struct ProxyAdminInfo {
        string name;
        address owner;
        bool isActive;
        uint256 addedTimestamp;
        string description;
    }
    
    // ============ Events ============
    event ProxyAdminAuthorized(
        address indexed proxyAdmin,
        string name,
        address indexed owner,
        string description
    );
    event ProxyAdminDeauthorized(address indexed proxyAdmin, address indexed deauthorizedBy);
    event ProxyAdminUpdated(
        address indexed proxyAdmin,
        string newName,
        address newOwner,
        string newDescription
    );
    event ProxyAdminValidated(address indexed proxyAdmin, address indexed validator, bool isValid);
    
    // ============ Errors ============
    error ZeroAddress();
    error ProxyAdminAlreadyAuthorized();
    error ProxyAdminNotAuthorized();
    error ProxyAdminNotActive();
    error InvalidProxyAdmin();
    error UnauthorizedValidator();
    error InvalidParameters();
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the Proxy Admin Validator
     * @param admin Initial admin address
     */
    function initialize(address admin) public initializer {
        __AccessControl_init();
        
        if (admin == address(0)) revert ZeroAddress();
        
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VALIDATOR_ROLE, admin);
    }
    
    /**
     * @notice Authorize a proxy admin address
     * @param proxyAdmin Address of the proxy admin to authorize
     * @param name Human-readable name for the proxy admin
     * @param owner Owner of the proxy admin
     * @param description Description of the proxy admin's purpose
     */
    function authorizeProxyAdmin(
        address proxyAdmin,
        string memory name,
        address owner,
        string memory description
    ) external onlyRole(VALIDATOR_ROLE) {
        if (proxyAdmin == address(0)) revert ZeroAddress();
        if (owner == address(0)) revert ZeroAddress();
        if (authorizedProxyAdmins[proxyAdmin]) revert ProxyAdminAlreadyAuthorized();
        
        // Validate that the address is a contract
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(proxyAdmin)
        }
        if (codeSize == 0) revert InvalidProxyAdmin();
        
        authorizedProxyAdmins[proxyAdmin] = true;
        proxyAdminInfo[proxyAdmin] = ProxyAdminInfo({
            name: name,
            owner: owner,
            isActive: true,
            addedTimestamp: block.timestamp,
            description: description
        });
        
        emit ProxyAdminAuthorized(proxyAdmin, name, owner, description);
    }
    
    /**
     * @notice Deauthorize a proxy admin address
     * @param proxyAdmin Address of the proxy admin to deauthorize
     */
    function deauthorizeProxyAdmin(address proxyAdmin) external onlyRole(VALIDATOR_ROLE) {
        if (!authorizedProxyAdmins[proxyAdmin]) revert ProxyAdminNotAuthorized();
        
        authorizedProxyAdmins[proxyAdmin] = false;
        proxyAdminInfo[proxyAdmin].isActive = false;
        
        emit ProxyAdminDeauthorized(proxyAdmin, msg.sender);
    }
    
    /**
     * @notice Update proxy admin information
     * @param proxyAdmin Address of the proxy admin to update
     * @param name New name
     * @param owner New owner
     * @param description New description
     */
    function updateProxyAdmin(
        address proxyAdmin,
        string memory name,
        address owner,
        string memory description
    ) external onlyRole(VALIDATOR_ROLE) {
        if (!authorizedProxyAdmins[proxyAdmin]) revert ProxyAdminNotAuthorized();
        if (owner == address(0)) revert ZeroAddress();
        
        proxyAdminInfo[proxyAdmin].name = name;
        proxyAdminInfo[proxyAdmin].owner = owner;
        proxyAdminInfo[proxyAdmin].description = description;
        
        emit ProxyAdminUpdated(proxyAdmin, name, owner, description);
    }
    
    /**
     * @notice Validate a proxy admin address
     * @param proxyAdmin Address to validate
     * @return isValid Whether the proxy admin is valid and authorized
     * @return info Proxy admin information
     */
    function validateProxyAdmin(address proxyAdmin) external view returns (bool isValid, ProxyAdminInfo memory info) {
        info = proxyAdminInfo[proxyAdmin];
        isValid = authorizedProxyAdmins[proxyAdmin] && info.isActive;
        
        // Emit validation event for tracking
        // Note: This is a view function, so events won't actually be emitted
        // In production, consider using a separate tracking contract
    }
    
    /**
     * @notice Batch validate multiple proxy admin addresses
     * @param proxyAdmins Array of proxy admin addresses to validate
     * @return results Array of validation results
     */
    function batchValidateProxyAdmins(address[] memory proxyAdmins) 
        external 
        view 
        returns (bool[] memory results) 
    {
        results = new bool[](proxyAdmins.length);
        
        for (uint256 i = 0; i < proxyAdmins.length; i++) {
            results[i] = authorizedProxyAdmins[proxyAdmins[i]] && proxyAdminInfo[proxyAdmins[i]].isActive;
        }
    }
    
    /**
     * @notice Check if proxy admin is authorized and active
     * @param proxyAdmin Address to check
     * @return Whether the proxy admin is authorized and active
     */
    function isAuthorizedProxyAdmin(address proxyAdmin) external view returns (bool) {
        return authorizedProxyAdmins[proxyAdmin] && proxyAdminInfo[proxyAdmin].isActive;
    }
    
    /**
     * @notice Get proxy admin information
     * @param proxyAdmin Address of the proxy admin
     * @return info Proxy admin information
     */
    function getProxyAdminInfo(address proxyAdmin) external view returns (ProxyAdminInfo memory info) {
        if (!authorizedProxyAdmins[proxyAdmin]) revert ProxyAdminNotAuthorized();
        return proxyAdminInfo[proxyAdmin];
    }
    
    /**
     * @notice Emergency deauthorization (only admin)
     * @param proxyAdmin Address to emergency deauthorize
     */
    function emergencyDeauthorize(address proxyAdmin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (authorizedProxyAdmins[proxyAdmin]) {
            authorizedProxyAdmins[proxyAdmin] = false;
            proxyAdminInfo[proxyAdmin].isActive = false;
            emit ProxyAdminDeauthorized(proxyAdmin, msg.sender);
        }
    }
    
    /**
     * @notice Add validator role
     * @param validator Address to grant validator role
     */
    function addValidator(address validator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (validator == address(0)) revert ZeroAddress();
        _grantRole(VALIDATOR_ROLE, validator);
    }
    
    /**
     * @notice Remove validator role
     * @param validator Address to revoke validator role
     */
    function removeValidator(address validator) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(VALIDATOR_ROLE, validator);
    }
    
    /**
     * @notice Get all authorized proxy admins (gas-intensive, use with caution)
     * @dev This function is not recommended for large numbers of proxy admins
     * @return proxyAdmins Array of authorized proxy admin addresses
     */
    function getAllAuthorizedProxyAdmins() external view returns (address[] memory proxyAdmins) {
        // This is a simplified implementation
        // In production, you might want to maintain a separate array for efficiency
        // For now, this returns an empty array as a placeholder
        proxyAdmins = new address[](0);
    }
}
