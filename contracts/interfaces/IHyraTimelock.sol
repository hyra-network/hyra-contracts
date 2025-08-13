// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IHyraTimelock
 * @notice Minimal interface for HyraTimelock - only essential public functions
 */
interface IHyraTimelock {
    // Core upgrade management functions
    function scheduleUpgrade(
        address proxy,
        address newImplementation,
        bytes memory data,
        bool isEmergency
    ) external;
    
    function cancelUpgrade(address proxy) external;
    
    function executeUpgrade(address proxyAdmin, address proxy) external;
    
    function executeUpgradeWithCall(
        address proxyAdmin,
        address proxy,
        bytes memory data
    ) external;
    
    // Essential view functions
    function isUpgradeReady(address proxy) external view returns (bool);
    function pendingUpgrades(address proxy) external view returns (uint256);
    function pendingImplementations(address proxy) external view returns (address);
}