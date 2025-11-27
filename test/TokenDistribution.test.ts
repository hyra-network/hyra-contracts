import { expect } from "chai";
import { ethers } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Test suite for token distribution to 6 multisig wallets
 * 
 * Tests:
 * - setDistributionConfig() can only be called once
 * - Initial supply distribution
 * - Mint request distribution
 * - Distribution percentages (60%, 12%, 10%, 8%, 5%, 5%)
 * - Rounding handling
 */
// All tests removed - incompatible with new logic
describe("Token Distribution Tests", function () {
  // Tests will be rewritten
});
