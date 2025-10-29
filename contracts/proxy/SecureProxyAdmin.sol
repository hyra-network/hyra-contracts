// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title SecureProxyAdmin
 * @notice Enhanced ProxyAdmin with multi-signature and governance controls for HNA-02 fix
 * @dev Implements security recommendations:
 *      - Multi-signature wallet integration
 *      - Time-lock delays for community awareness
 *      - Transparent upgrade process
 */
contract SecureProxyAdmin is ProxyAdmin, AccessControl {
    // ============ Constants ============
    bytes32 public constant MULTISIG_ROLE = keccak256("MULTISIG_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant EMERGENCY_ROLE = keccak256("EMERGENCY_ROLE");
    
    uint256 public constant UPGRADE_DELAY = 48 hours; // 48 hour delay for community awareness
    uint256 public constant EMERGENCY_DELAY = 2 hours; // 2 hour delay for emergency upgrades
    
    // ============ State Variables ============
    mapping(address => bool) private _isManaged;
    address[] public managedProxies;
    mapping(address => string) public proxyNames;
    
    // Upgrade tracking
    struct PendingUpgrade {
        address implementation;
        uint256 executeTime;
        bool isEmergency;
        string reason;
        address proposer;
    }
    
    mapping(address => PendingUpgrade) public pendingUpgrades;
    mapping(bytes32 => bool) public executedUpgrades;
    uint256 public upgradeNonce;
    
    // Multi-signature requirements
    uint256 public requiredSignatures;
    mapping(bytes32 => mapping(address => bool)) public signatures;
    mapping(bytes32 => uint256) public signatureCount;
    
    // ============ Events ============
    event ProxyAdded(address indexed proxy, string name);
    event ProxyRemoved(address indexed proxy);
    event ProxyNameUpdated(address indexed proxy, string newName);
    event BatchUpgradeExecuted(uint256 count);
    
    event UpgradeProposed(
        address indexed proxy,
        address indexed implementation,
        uint256 executeTime,
        bool isEmergency,
        string reason,
        bytes32 upgradeId
    );
    
    event UpgradeExecuted(
        address indexed proxy,
        address indexed implementation,
        bytes32 upgradeId
    );
    
    event UpgradeCancelled(
        address indexed proxy,
        bytes32 upgradeId
    );
    
    event SignatureAdded(
        bytes32 indexed upgradeId,
        address indexed signer,
        uint256 signatureCount,
        uint256 requiredSignatures
    );
    
    // ============ Errors ============
    error ProxyAlreadyManaged();
    error ProxyNotManaged();
    error InvalidProxy();
    error InvalidProxyAddress();
    error ZeroAddress();
    error ArrayLengthMismatch();
    error IndexOutOfBounds();
    error UpgradeAlreadyScheduled();
    error NoUpgradeScheduled();
    error UpgradeNotReady();
    error UpgradeExpired();
    error UpgradeAlreadyExecuted();
    error InsufficientSignatures();
    error AlreadySigned();
    error InvalidDelay();
    error UnauthorizedUpgrade();
    error InvalidImplementation();

    /**
     * @notice Constructor
     * @param initialOwner The initial owner (should be multisig wallet)
     * @param _requiredSignatures Number of signatures required for upgrades
     */
    constructor(address initialOwner, uint256 _requiredSignatures) ProxyAdmin(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
        if (_requiredSignatures == 0) revert InvalidDelay();
        
        requiredSignatures = _requiredSignatures;
        
        // Grant roles
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MULTISIG_ROLE, initialOwner);
        _grantRole(GOVERNANCE_ROLE, initialOwner);
        _grantRole(EMERGENCY_ROLE, initialOwner);
    }

    // ============ Management Functions ============

    /**
     * @notice Add a proxy to management with a name
     * @param proxy Address of the proxy to manage
     * @param name Human-readable name for the proxy
     */
    function addProxy(address proxy, string memory name) 
        external 
        onlyRole(MULTISIG_ROLE)
    {
        if (proxy == address(0)) revert InvalidProxyAddress();
        if (_isManaged[proxy]) revert ProxyAlreadyManaged();
        
        _isManaged[proxy] = true;
        managedProxies.push(proxy);
        proxyNames[proxy] = name;
        
        emit ProxyAdded(proxy, name);
    }

    /**
     * @notice Remove a proxy from management
     * @param proxy Address of the proxy to remove
     */
    function removeProxy(address proxy) external onlyRole(MULTISIG_ROLE) {
        if (!_isManaged[proxy]) revert ProxyNotManaged();
        
        _isManaged[proxy] = false;
        delete proxyNames[proxy];
        
        // Remove from array
        for (uint256 i = 0; i < managedProxies.length; i++) {
            if (managedProxies[i] == proxy) {
                managedProxies[i] = managedProxies[managedProxies.length - 1];
                managedProxies.pop();
                break;
            }
        }
        
        emit ProxyRemoved(proxy);
    }

    /**
     * @notice Update the name of a managed proxy
     * @param proxy Address of the proxy
     * @param newName New name for the proxy
     */
    function updateProxyName(address proxy, string memory newName) 
        external 
        onlyRole(MULTISIG_ROLE)
    {
        if (!_isManaged[proxy]) revert ProxyNotManaged();
        proxyNames[proxy] = newName;
        emit ProxyNameUpdated(proxy, newName);
    }

    // ============ Upgrade Functions ============

    /**
     * @notice Propose an upgrade with multi-signature requirement
     * @param proxy Address of the proxy to upgrade
     * @param implementation Address of the new implementation
     * @param isEmergency Whether this is an emergency upgrade
     * @param reason Reason for the upgrade
     */
    function proposeUpgrade(
        address proxy,
        address implementation,
        bool isEmergency,
        string memory reason
    ) external onlyRole(GOVERNANCE_ROLE) {
        if (proxy == address(0)) revert InvalidProxy();
        if (implementation == address(0)) revert InvalidImplementation();
        if (!_isManaged[proxy]) revert ProxyNotManaged();
        
        // Check if there's already a pending upgrade
        if (pendingUpgrades[proxy].executeTime != 0) {
            if (block.timestamp > pendingUpgrades[proxy].executeTime + 48 hours) {
                // Clear expired upgrade
                delete pendingUpgrades[proxy];
            } else {
                revert UpgradeAlreadyScheduled();
            }
        }
        
        uint256 delay = isEmergency ? EMERGENCY_DELAY : UPGRADE_DELAY;
        uint256 executeTime = block.timestamp + delay;
        
        pendingUpgrades[proxy] = PendingUpgrade({
            implementation: implementation,
            executeTime: executeTime,
            isEmergency: isEmergency,
            reason: reason,
            proposer: msg.sender
        });
        
        uint256 nonce = ++upgradeNonce;
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, implementation, nonce, block.timestamp)
        );
        
        emit UpgradeProposed(proxy, implementation, executeTime, isEmergency, reason, upgradeId);
    }

    /**
     * @notice Sign an upgrade proposal
     * @param upgradeId The upgrade proposal ID
     */
    function signUpgrade(bytes32 upgradeId) external onlyRole(MULTISIG_ROLE) {
        if (signatures[upgradeId][msg.sender]) revert AlreadySigned();
        
        signatures[upgradeId][msg.sender] = true;
        signatureCount[upgradeId]++;
        
        emit SignatureAdded(upgradeId, msg.sender, signatureCount[upgradeId], requiredSignatures);
    }

    /**
     * @notice Execute an upgrade after sufficient signatures and delay
     * @param proxy Address of the proxy to upgrade
     */
    function executeUpgrade(address proxy) external {
        PendingUpgrade memory upgrade = pendingUpgrades[proxy];
        if (upgrade.executeTime == 0) revert NoUpgradeScheduled();
        if (block.timestamp < upgrade.executeTime) revert UpgradeNotReady();
        
        // Check if upgrade hasn't expired (48 hour window)
        if (block.timestamp > upgrade.executeTime + 48 hours) {
            revert UpgradeExpired();
        }
        
        uint256 nonce = upgradeNonce;
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, upgrade.implementation, nonce, upgrade.executeTime - (upgrade.isEmergency ? EMERGENCY_DELAY : UPGRADE_DELAY))
        );
        
        if (executedUpgrades[upgradeId]) revert UpgradeAlreadyExecuted();
        
        // Check signature requirements
        if (signatureCount[upgradeId] < requiredSignatures) {
            revert InsufficientSignatures();
        }
        
        // FIXED: Apply Checks-Effects-Interactions pattern
        // 1. Update state first (Effects)
        executedUpgrades[upgradeId] = true;
        delete pendingUpgrades[proxy];
        
        // 2. Then make external calls (Interactions)
        // Call proxy's admin function directly as this contract is the admin
        ITransparentUpgradeableProxy(payable(proxy)).upgradeToAndCall(upgrade.implementation, bytes(""));
        
        emit UpgradeExecuted(proxy, upgrade.implementation, upgradeId);
    }

    /**
     * @notice Cancel a pending upgrade
     * @param proxy Address of the proxy
     */
    function cancelUpgrade(address proxy) external onlyRole(MULTISIG_ROLE) {
        PendingUpgrade memory upgrade = pendingUpgrades[proxy];
        if (upgrade.executeTime == 0) revert NoUpgradeScheduled();

        uint256 nonce = upgradeNonce;
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, upgrade.implementation, nonce, upgrade.executeTime - (upgrade.isEmergency ? EMERGENCY_DELAY : UPGRADE_DELAY))
        );
        
        delete pendingUpgrades[proxy];
        emit UpgradeCancelled(proxy, upgradeId);
    }

    // ============ View Functions ============

    /**
     * @notice Get all managed proxies
     * @return Array of managed proxy addresses
     */
    function getManagedProxies() external view returns (address[] memory) {
        return managedProxies;
    }

    /**
     * @notice Get the count of managed proxies
     * @return Number of managed proxies
     */
    function getManagedProxyCount() external view returns (uint256) {
        return managedProxies.length;
    }

    /**
     * @notice Get proxy info by index
     * @param index Index in the managed proxies array
     * @return proxy address and name
     */
    function getProxyByIndex(uint256 index) 
        external 
        view 
        returns (address proxy, string memory name) 
    {
        if (index >= managedProxies.length) revert IndexOutOfBounds();
        proxy = managedProxies[index];
        name = proxyNames[proxy];
    }

    /**
     * @notice Get pending upgrade information
     * @param proxy Address of the proxy
     * @return upgrade Pending upgrade details
     */
    function getPendingUpgrade(address proxy) external view returns (PendingUpgrade memory upgrade) {
        return pendingUpgrades[proxy];
    }

    /**
     * @notice Check if upgrade can be executed
     * @param proxy Address of the proxy
     * @return canExecute Whether upgrade can be executed
     * @return reason Reason if cannot execute
     */
    function canExecuteUpgrade(address proxy) external view returns (bool canExecute, string memory reason) {
        PendingUpgrade memory upgrade = pendingUpgrades[proxy];
        
        if (upgrade.executeTime == 0) {
            return (false, "No upgrade scheduled");
        }
        
        if (block.timestamp < upgrade.executeTime) {
            return (false, "Upgrade not ready");
        }
        
        if (block.timestamp > upgrade.executeTime + 48 hours) {
            return (false, "Upgrade expired");
        }
        
        uint256 nonce = upgradeNonce;
        bytes32 upgradeId = keccak256(
            abi.encodePacked(proxy, upgrade.implementation, nonce, upgrade.executeTime - (upgrade.isEmergency ? EMERGENCY_DELAY : UPGRADE_DELAY))
        );
        
        if (signatureCount[upgradeId] < requiredSignatures) {
            return (false, "Insufficient signatures");
        }
        
        return (true, "Upgrade ready to execute");
    }

    /**
     * @notice Get signature count for an upgrade
     * @param upgradeId The upgrade proposal ID
     * @return count Number of signatures
     */
    function getSignatureCount(bytes32 upgradeId) external view returns (uint256 count) {
        return signatureCount[upgradeId];
    }

    /**
     * @notice Check if an address has signed an upgrade
     * @param upgradeId The upgrade proposal ID
     * @param signer Address to check
     * @return Whether the address has signed
     */
    function hasSigned(bytes32 upgradeId, address signer) external view returns (bool) {
        return signatures[upgradeId][signer];
    }

    /**
     * @notice Check if proxy is managed
     * @param proxy Address of the proxy
     * @return Whether proxy is managed
     */
    function isManaged(address proxy) external view returns (bool) {
        return _isManaged[proxy];
    }
}
