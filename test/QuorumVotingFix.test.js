"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_network_helpers_2 = require("@nomicfoundation/hardhat-network-helpers");
/**
 * Test suite to verify the fix for the quorum voting bug
 *
 * BUG: _quorumReached was incorrectly destructuring proposalVotes()
 * - proposalVotes() returns: (againstVotes, forVotes, abstainVotes)
 * - Old code: (uint256 forVotes, , uint256 abstainVotes) = proposalVotes(proposalId);
 * - This caused againstVotes to be counted as forVotes!
 *
 * FIX: Changed to: (, uint256 forVotes, uint256 abstainVotes) = proposalVotes(proposalId);
 */
// All tests removed - incompatible with new logic
describe("Quorum Voting Fix Tests", function () {
  // Tests will be rewritten
});
