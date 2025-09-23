// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import "@openzeppelin/contracts/interfaces/IERC1967.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/utils/Address.sol";

/**
 * @title HyraTransparentUpgradeableProxy
 * @dev Custom proxy that is compatible with HyraProxyAdmin
 *      Inherits from ERC1967Proxy instead of TransparentUpgradeableProxy
 *      to avoid auto-creation of ProxyAdmin in OZ v5.4+
 */
contract HyraTransparentUpgradeableProxy is ERC1967Proxy {
    
    /**
     * @dev Emitted when the admin account has changed.
     */
    event AdminChanged(address previousAdmin, address newAdmin);

    /**
     * @dev Throws if called by any account other than the admin.
     */
    modifier ifAdmin() {
        if (msg.sender == _getAdmin()) {
            _;
        } else {
            _fallback();
        }
    }

    /**
     * @dev If caller is the admin process the call internally, otherwise transparently fallback to the proxy behavior
     */
    function _fallback() internal virtual override {
        if (msg.sender == _getAdmin()) {
            bytes memory ret;
            bytes4 selector = msg.sig;
            if (selector == bytes4(keccak256("upgradeToAndCall(address,bytes)"))) {
                ret = _dispatchUpgradeToAndCall();
            } else {
                revert("TransparentUpgradeableProxy: admin cannot fallback to proxy target");
            }
            assembly {
                return(add(ret, 0x20), mload(ret))
            }
        } else {
            super._fallback();
        }
    }

    /**
     * @dev Returns the current admin.
     */
    function _getAdmin() internal view virtual returns (address) {
        return ERC1967Utils.getAdmin();
    }

    /**
     * @dev Stores a new address in the EIP1967 admin slot.
     */
    function _setAdmin(address newAdmin) private {
        if (newAdmin == address(0)) {
            revert("TransparentUpgradeableProxy: new admin is the zero address");
        }
        ERC1967Utils.changeAdmin(newAdmin);
    }

    /**
     * @dev Changes the admin of the proxy.
     * Emits an {AdminChanged} event.
     */
    function _changeAdmin(address newAdmin) internal virtual {
        emit AdminChanged(_getAdmin(), newAdmin);
        _setAdmin(newAdmin);
    }

    /**
     * @dev Upgrade the implementation of the proxy.
     */
    function _dispatchUpgradeToAndCall() private returns (bytes memory) {
        (address newImplementation, bytes memory data) = abi.decode(msg.data[4:], (address, bytes));
        ERC1967Utils.upgradeToAndCall(newImplementation, data);
        return "";
    }

    /**
     * @dev Constructor
     * @param _logic Address of the initial implementation.
     * @param admin_ Address of the proxy admin.
     * @param _data Data to send as msg.data to the implementation to initialize the proxied contract.
     */
    constructor(
        address _logic,
        address admin_,
        bytes memory _data
    ) payable ERC1967Proxy(_logic, _data) {
        _changeAdmin(admin_);
    }

    /**
     * @dev Returns the current implementation address.
     * @return implementation The current implementation address
     */
    function implementation() public view returns (address) {
        return _implementation();
    }

    /**
     * @dev Returns the current admin address.
     * @return admin The current admin address
     */
    function admin() public view returns (address) {
        return _getAdmin();
    }

    /**
     * @dev Upgrade the implementation of the proxy, and then call a function from the new implementation as specified
     * by `data`, which should be an encoded function call. This is useful to initialize new storage variables in the
     * proxied contract.
     */
    function upgradeToAndCall(address newImplementation, bytes calldata data) external payable ifAdmin {
        ERC1967Utils.upgradeToAndCall(newImplementation, data);
    }
}

