// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IHyraProxyDeployer
 * @notice Minimal interface for HyraProxyDeployer - only essential public functions
 */
interface IHyraProxyDeployer {
    // Core deployment function
    function deployProxy(
        address implementation,
        address proxyAdmin,
        bytes memory initData,
        string memory contractType
    ) external returns (address proxy);
    
    // Essential view functions
    function isDeployedProxy(address proxy) external view returns (bool);
}