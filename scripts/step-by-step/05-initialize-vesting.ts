import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Step 5: Initialize TokenVesting
 * Prerequisites: Token proxy address, Timelock proxy address, Vesting proxy address
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

  console.log("\n=== Step 5: Initialize TokenVesting ===\n");

  // Get prerequisite addresses
  const vestingAddress = await question("Enter TokenVesting Proxy address (from Step 3): ");
  if (!ethers.isAddress(vestingAddress)) {
    throw new Error("Invalid Vesting address");
  }

  const tokenAddress = await question("Enter HyraToken Proxy address (from Step 4): ");
  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("Invalid Token address");
  }

  const timelockAddress = await question("Enter HyraTimelock Proxy address (from Step 2): ");
  if (!ethers.isAddress(timelockAddress)) {
    throw new Error("Invalid Timelock address");
  }

  // Initialize Vesting
  console.log("\nInitializing TokenVesting...");
  const vesting = await ethers.getContractAt("TokenVesting", vestingAddress);
  const tx = await vesting.initialize(tokenAddress, timelockAddress, { gasLimit: 8_000_000 });
  await tx.wait();
  console.log("   TokenVesting initialized");

  // Save info
  const info = {
    step: "05-initialize-vesting",
    network: (await ethers.provider.getNetwork()).name,
    initializedAt: new Date().toISOString(),
    contracts: {
      vestingProxy: vestingAddress,
      tokenProxy: tokenAddress,
      timelockProxy: timelockAddress
    },
    transactionHash: tx.hash
  };

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");
  const infoPath = path.join(deploymentsDir, `05-vesting-init-${Date.now()}.json`);
  fs.writeFileSync(infoPath, JSON.stringify(info, null, 2));

  console.log("\n=== Vesting Initialization Complete ===");
  console.log(`Info saved to: ${infoPath}`);

  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  rl.close();
});

