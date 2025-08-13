// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IHyraProxyAdmin
 * @notice Minimal interface for HyraProxyAdmin - only essential public functions
 */
interface IHyraProxyAdmin {
    // Core proxy management
    function addProxy(address proxy, string memory name) external;
    function removeProxy(address proxy) external;
    function batchUpgrade(
        address[] calldata proxies,
        address[] calldata implementations
    ) external;
    
    // Essential view functions
    function isManaged(address proxy) external view returns (bool);
    function getManagedProxies() external view returns (address[] memory);
}