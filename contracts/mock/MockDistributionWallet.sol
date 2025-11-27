// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockDistributionWallet
 * @notice Minimal contract used in tests to hold initial token allocations and forward them to target addresses.
 */
contract MockDistributionWallet {
    address public owner;

    error NotOwner();
    error InvalidOwner();

    constructor(address owner_) {
        if (owner_ == address(0)) {
            revert InvalidOwner();
        }
        owner = owner_;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function forwardTokens(address token, address recipient, uint256 amount) external onlyOwner {
        IERC20(token).transfer(recipient, amount);
    }
}

