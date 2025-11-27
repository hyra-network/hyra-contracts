/**
 * Script to setup Security Council members in HyraGovernor
 * Security Council members can reject/cancel any proposal
 * 
 * Usage:
 *   npx hardhat run scripts/setup-security-council.ts --network <network>
 * 
 * Required env vars:
 *   - GOVERNOR_ADDRESS: Address of HyraGovernor contract
 *   - SECURITY_COUNCIL_1: First Security Council multisig wallet address
 *   - SECURITY_COUNCIL_2: Second Security Council multisig wallet address
 *   - SECURITY_COUNCIL_3: Third Security Council multisig wallet address
 *   - PRIVATE_KEY: Private key for signing transactions
 */

import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

async function main() {
  // Load environment variables
  const envFile = process.env.ENV_FILE || ".env";
  dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  // Get Governor address
  const governorAddress = process.env.GOVERNOR_ADDRESS;
  if (!governorAddress) {
    throw new Error("GOVERNOR_ADDRESS not set in .env");
  }
  if (!ethers.isAddress(governorAddress)) {
    throw new Error(`Invalid GOVERNOR_ADDRESS: ${governorAddress}`);
  }

  // Get Security Council addresses
  const securityCouncil1 = process.env.SECURITY_COUNCIL_1;
  const securityCouncil2 = process.env.SECURITY_COUNCIL_2;
  const securityCouncil3 = process.env.SECURITY_COUNCIL_3;

  if (!securityCouncil1 || !securityCouncil2 || !securityCouncil3) {
    throw new Error("SECURITY_COUNCIL_1, SECURITY_COUNCIL_2, and SECURITY_COUNCIL_3 must be set in .env");
  }

  const councilMembers = [securityCouncil1, securityCouncil2, securityCouncil3];

  // Validate addresses
  for (let i = 0; i < councilMembers.length; i++) {
    if (!ethers.isAddress(councilMembers[i])) {
      throw new Error(`Invalid SECURITY_COUNCIL_${i + 1} address: ${councilMembers[i]}`);
    }
    // Verify it's a contract (multisig wallet)
    const code = await ethers.provider.getCode(councilMembers[i]);
    if (code === "0x") {
      throw new Error(`SECURITY_COUNCIL_${i + 1} (${councilMembers[i]}) is not a contract. Must be a multisig wallet.`);
    }
  }

  console.log("\n=== Setting up Security Council ===");
  console.log(`Governor: ${governorAddress}`);
  console.log("Security Council Members:");
  councilMembers.forEach((addr, idx) => {
    console.log(`  ${idx + 1}. ${addr}`);
  });

  // Get Governor contract
  const governor = await ethers.getContractAt("HyraGovernor", governorAddress);

  // Check current Security Council members
  console.log("\n=== Current Security Council Status ===");
  for (let i = 0; i < councilMembers.length; i++) {
    const isMember = await governor.isSecurityCouncilMember(councilMembers[i]);
    console.log(`  ${councilMembers[i]}: ${isMember ? "✅ Member" : "❌ Not a member"}`);
  }

  const currentCount = await governor.securityCouncilMemberCount();
  console.log(`Current Security Council count: ${currentCount}`);

  // Add Security Council members via governance proposal
  // Note: Security Council members can only be added via governance proposal
  // that requires GOVERNANCE_ROLE through DAO role manager
  console.log("\n=== Adding Security Council Members ===");
  console.log("⚠️  NOTE: Security Council members must be added via governance proposal.");
  console.log("⚠️  This script will prepare the proposal data for you to submit.");

  const targets: string[] = [];
  const values: bigint[] = [];
  const calldatas: string[] = [];
  const descriptions: string[] = [];

  for (let i = 0; i < councilMembers.length; i++) {
    const isMember = await governor.isSecurityCouncilMember(councilMembers[i]);
    if (!isMember) {
      targets.push(governorAddress);
      values.push(0n);
      calldatas.push(
        governor.interface.encodeFunctionData("addSecurityCouncilMember", [councilMembers[i]])
      );
      descriptions.push(`Add Security Council Member ${i + 1}: ${councilMembers[i]}`);
      console.log(`  Preparing proposal to add: ${councilMembers[i]}`);
    } else {
      console.log(`  Skipping (already a member): ${councilMembers[i]}`);
    }
  }

  if (targets.length === 0) {
    console.log("\n✅ All Security Council members are already added!");
    return;
  }

  // Create governance proposal
  console.log("\n=== Creating Governance Proposal ===");
  console.log(`Proposal will add ${targets.length} Security Council member(s)`);

  // Combine all calldatas into a single proposal
  const combinedDescription = `Add Security Council Members\n\n${descriptions.join("\n")}`;

  try {
    const tx = await governor.proposeWithType(
      targets,
      values,
      calldatas,
      combinedDescription,
      0 // STANDARD proposal type
    );
    const receipt = await tx.wait();

    // Extract proposal ID from events
    const proposalCreatedEvent = receipt?.logs?.find((log: any) => {
      try {
        const parsed = governor.interface.parseLog(log);
        return parsed?.name === "ProposalCreated" || parsed?.name === "ProposalCreatedWithType";
      } catch {
        return false;
      }
    });

    if (proposalCreatedEvent) {
      const parsed = governor.interface.parseLog(proposalCreatedEvent);
      const proposalId = parsed?.args?.proposalId || parsed?.args?.[0];
      console.log(`\n✅ Proposal created successfully!`);
      console.log(`   Proposal ID: ${proposalId}`);
      console.log(`   Transaction: ${receipt?.hash}`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. Wait for voting period to start`);
      console.log(`   2. Vote on the proposal`);
      console.log(`   3. Queue the proposal after voting succeeds`);
      console.log(`   4. Execute the proposal after timelock delay`);
    } else {
      console.log(`\n✅ Proposal transaction submitted!`);
      console.log(`   Transaction: ${receipt?.hash}`);
      console.log(`   Check the transaction to get the proposal ID`);
    }
  } catch (error: any) {
    console.error("\n❌ Error creating proposal:");
    if (error.message?.includes("InsufficientVotingPowerForStandardProposal")) {
      console.error("   You need at least 3% total supply voting power to create STANDARD proposals.");
      console.error("   Consider using Privileged Multisig Wallet or getting more voting power.");
    } else {
      console.error(`   ${error.message}`);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

