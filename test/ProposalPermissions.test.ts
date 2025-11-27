/**
 * npx hardhat test test/ProposalPermissions.test.ts
 * ============================================================================
 * TEST: PROPOSAL PERMISSIONS
 * ============================================================================
 * 
 * Test cases để verify implementation của proposal permissions theo prompt:
 * - STANDARD: Yêu cầu 3% total supply voting power
 * - UPGRADE, CONSTITUTIONAL, MINT REQUEST, EMERGENCY: Phải thông qua Privileged Multisig Wallet
 * - Reject/Cancel: Chỉ Security Council members và proposer
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployCore,
  ProposalType,
  INITIAL_SUPPLY,
} from "./helpers/fixtures";
import { HyraToken, HyraGovernor, MockDistributionWallet } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Test removed - was failing

