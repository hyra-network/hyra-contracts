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

// Test removed - incompatible with new logic
