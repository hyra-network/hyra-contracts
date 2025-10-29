// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

contract MaliciousReentrancyContract {
    address public governor;
    bool public reentrancyAttempted = false;

    constructor(address _governor) {
        governor = _governor;
    }

    function attemptReentrancy() external {
        // Placeholder to simulate an attempt; does not actually reenter
        reentrancyAttempted = true;
    }
}

contract MaliciousTimelockReentrancy {
    address public timelock;
    bool public reentrancyAttempted = false;

    constructor(address _timelock) {
        timelock = _timelock;
    }

    function attemptReentrancy() external {
        // Placeholder to simulate an attempt; does not actually reenter
        reentrancyAttempted = true;
    }
}


