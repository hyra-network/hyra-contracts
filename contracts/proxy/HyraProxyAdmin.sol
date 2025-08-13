// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "../interfaces/IHyraProxyAdmin.sol";

/**
 * @title HyraProxyAdmin
 * @notice Extended ProxyAdmin for managing Hyra protocol proxies
 */
contract HyraProxyAdmin is ProxyAdmin, IHyraProxyAdmin {
    // ============ State Variables ============
    mapping(address => bool) private _isManaged;
    address[] public managedProxies;
    mapping(address => string) public proxyNames;
    
    // ============ Events ============
    event ProxyAdded(address indexed proxy, string name);
    event ProxyRemoved(address indexed proxy);
    event ProxyNameUpdated(address indexed proxy, string newName);
    event BatchUpgradeExecuted(uint256 count);
    
    // ============ Errors ============
    error ProxyAlreadyManaged();
    error ProxyNotManaged();
    error InvalidProxy();
    error ZeroAddress();
    error ArrayLengthMismatch();
    error IndexOutOfBounds();

    /**
     * @notice Constructor
     * @param initialOwner The initial owner of the ProxyAdmin
     */
    constructor(address initialOwner) ProxyAdmin(initialOwner) {}

    // ============ Management Functions ============

    /**
     * @notice Add a proxy to management with a name
     * @param proxy Address of the proxy to manage
     * @param name Human-readable name for the proxy
     */
    function addProxy(address proxy, string memory name) 
        external 
        override
        onlyOwner 
    {
        if (proxy == address(0)) revert ZeroAddress();
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
    function removeProxy(address proxy) external override onlyOwner {
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
        onlyOwner 
    {
        if (!_isManaged[proxy]) revert ProxyNotManaged();
        proxyNames[proxy] = newName;
        emit ProxyNameUpdated(proxy, newName);
    }

    /**
     * @notice Batch upgrade multiple proxies
     * @param proxies Array of proxy addresses
     * @param implementations Array of new implementation addresses
     */
    function batchUpgrade(
        address[] calldata proxies,
        address[] calldata implementations
    ) external override onlyOwner {
        if (proxies.length != implementations.length) revert ArrayLengthMismatch();
        
        for (uint256 i = 0; i < proxies.length; i++) {
            if (!_isManaged[proxies[i]]) revert ProxyNotManaged();
            
            // Use the ProxyAdmin's upgradeAndCall function
            ITransparentUpgradeableProxy proxy = ITransparentUpgradeableProxy(payable(proxies[i]));
            upgradeAndCall(proxy, implementations[i], bytes(""));
        }
        
        emit BatchUpgradeExecuted(proxies.length);
    }

    /**
     * @notice Batch upgrade with initialization calls
     * @param proxies Array of proxy addresses
     * @param implementations Array of new implementation addresses
     * @param datas Array of initialization call data
     */
    function batchUpgradeAndCall(
        address[] calldata proxies,
        address[] calldata implementations,
        bytes[] calldata datas
    ) external onlyOwner {
        if (proxies.length != implementations.length || 
            proxies.length != datas.length) {
            revert ArrayLengthMismatch();
        }
        
        for (uint256 i = 0; i < proxies.length; i++) {
            if (!_isManaged[proxies[i]]) revert ProxyNotManaged();
            
            ITransparentUpgradeableProxy proxy = ITransparentUpgradeableProxy(payable(proxies[i]));
            upgradeAndCall(proxy, implementations[i], datas[i]);
        }
        
        emit BatchUpgradeExecuted(proxies.length);
    }

    // ============ View Functions ============

    /**
     * @notice Get all managed proxies
     * @return Array of managed proxy addresses
     */
    function getManagedProxies() external view override returns (address[] memory) {
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
     * @notice Check if a proxy is managed
     * @param proxy Address to check
     * @return True if the proxy is managed
     */
    function isManaged(address proxy) external view override returns (bool) {
        return _isManaged[proxy];
    }

    /**
     * @notice Get implementation address of a proxy
     * @dev Uses low-level call to get implementation
     * @param proxyAddress The proxy address
     * @return impl The implementation address
     */
    function getProxyImplementation(address proxyAddress) 
        external 
        view 
        returns (address impl) 
    {
        // Use low-level staticcall to get implementation
        // This avoids interface issues
        bytes memory data = abi.encodeWithSignature("implementation()");
        (bool success, bytes memory returnData) = proxyAddress.staticcall(data);
        
        if (success && returnData.length == 32) {
            impl = abi.decode(returnData, (address));
        } else {
            impl = address(0);
        }
    }

    /**
     * @notice Get admin of a proxy
     * @dev Returns this contract if we manage the proxy
     * @param proxy The proxy address
     * @return The admin address
     */
    function getProxyAdmin(address proxy) 
        external 
        view 
        returns (address) 
    {
        // If we manage this proxy, we are the admin
        return _isManaged[proxy] ? address(this) : address(0);
    }
}