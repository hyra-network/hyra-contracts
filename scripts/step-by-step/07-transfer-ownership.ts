import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Step 7: Transfer HyraToken Ownership to DAO (Timelock)
 * Prerequisites: Token proxy address, Timelock proxy address
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  console.log("\n=== Step 7: Transfer Token Ownership to DAO ===\n");

  // Get prerequisite addresses
  const tokenAddress = await question("Enter HyraToken Proxy address (from Step 4): ");
  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("Invalid Token address");
  }

  const timelockAddress = await question("Enter HyraTimelock Proxy address (from Step 2): ");
  if (!ethers.isAddress(timelockAddress)) {
    throw new Error("Invalid Timelock address");
  }

  // Transfer ownership
  console.log("\nTransferring HyraToken ownership to DAO...");
  const token = await ethers.getContractAt("HyraToken", tokenAddress);
  const tx = await token.transferOwnership(timelockAddress, { gasLimit: 8_000_000 });
  await tx.wait();
  console.log("   Ownership transferred!");
  console.log(`   New owner: ${timelockAddress} (DAO)`);

  // Verify
  const currentOwner = await token.owner();
  console.log(`   Verified owner: ${currentOwner}`);

  // Save info
  const info = {
    step: "07-transfer-ownership",
    network: (await ethers.provider.getNetwork()).name,
    transferredAt: new Date().toISOString(),
    contracts: {
      tokenProxy: tokenAddress,
      newOwner: timelockAddress
    },
    transactionHash: tx.hash,
    note: "All mint requests must now go through DAO governance"
  };

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");
  const infoPath = path.join(deploymentsDir, `07-ownership-transfer-${Date.now()}.json`);
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));

  console.log("\n=== Ownership Transfer Complete ===");
  console.log(`Info saved to: ${infoPath}`);
  console.log("\n*** ALL DEPLOYMENT STEPS COMPLETE! ***");
  console.log("All mint requests must now go through DAO governance!");

  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  rl.close();
});

