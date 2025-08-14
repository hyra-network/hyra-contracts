// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../core/HyraToken.sol";

// Mock contract for testing upgrade
contract HyraTokenV2 is HyraToken {
    function version() external pure returns (string memory) { return "test_upgrade"; }
}
