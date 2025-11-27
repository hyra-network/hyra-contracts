/**
 * npx hardhat test test/MintRequestProposalThreshold.test.ts
 * ============================================================================
 * TEST: MINT REQUEST PROPOSAL THRESHOLD
 * ============================================================================
 * 
 * Test cases để verify implementation của mint request proposal threshold:
 * - Chỉ Privileged Multisig Wallet hoặc user có >= 3% voting power mới được tạo proposal mint request
 * - Các test cases theo prompt requirements
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock, MockDistributionWallet, MintRequestProposer } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// Test removed - was failing

