// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/interfaces/IERC1967.sol";

/**
 * @title HyraTransparentUpgradeableProxy
 * @dev Custom TransparentUpgradeableProxy that exposes implementation() function
 *      and is compatible with HyraProxyAdmin
 */
contract HyraTransparentUpgradeableProxy is TransparentUpgradeableProxy, IERC1967 {
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) payable TransparentUpgradeableProxy(_logic, admin_, _data) {}

    /**
     * @dev Returns the current implementation address
     * @return implementation The current implementation address
     */
    function implementation() public view returns (address) {
        return _implementation();
    }

    /**
     * @dev Returns the current admin address
     * @return admin The current admin address
     */
    function admin() public view returns (address) {
        return _proxyAdmin();
    }
}
