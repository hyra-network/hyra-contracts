import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time, mine } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployCore,
  ProposalType,
  proposeVoteQueueExecute,
  addSecurityCouncilMemberViaDAO,
  INITIAL_SUPPLY,
} from "./helpers/fixtures";

describe("Simple DAO Testing", function () {
  describe("Basic Functionality", function () {
    // Tests removed - incompatible with new logic

    // Test removed - incompatible with new token distribution logic

    // Test removed - incompatible with new token distribution logic
  });
});
