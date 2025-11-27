import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Step 3: Deploy TokenVesting
 * Prerequisites: Timelock address
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
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  console.log("\n=== Step 3: Deploying TokenVesting ===\n");

  // Get Timelock address
  const timelockAddress = await question("Enter HyraTimelock Proxy address (from Step 2): ");
  if (!ethers.isAddress(timelockAddress)) {
    throw new Error("Invalid Timelock address");
  }

  // 1. Deploy TokenVesting Implementation
  console.log("\n1. Deploying TokenVesting Implementation...");
  const TokenVesting = await ethers.getContractFactory("TokenVesting");
  const vestingImpl = await TokenVesting.deploy({ gasLimit: 8_000_000 });
  await vestingImpl.waitForDeployment();
  console.log(`   Implementation: ${await vestingImpl.getAddress()}`);

  // 2. Deploy ERC1967Proxy for Vesting (without initialization)
  console.log("\n2. Deploying Vesting Proxy...");
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  const vestingProxy = await ERC1967Proxy.deploy(
    await vestingImpl.getAddress(),
    "0x", // No initialization data yet
    { gasLimit: 8_000_000 }
  );
  await vestingProxy.waitForDeployment();
  console.log(`   Proxy: ${await vestingProxy.getAddress()}`);

  // Save deployment info
  const deployment = {
    step: "03-vesting",
    network: (await ethers.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    deployer: await deployer.getAddress(),
    contracts: {
      vestingImpl: await vestingImpl.getAddress(),
      vestingProxy: await vestingProxy.getAddress()
    },
    prerequisites: {
      timelockProxy: timelockAddress
    },
    note: "Vesting will be initialized after Token deployment (Step 4)"
  };

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentPath = path.join(deploymentsDir, `03-vesting-${Date.now()}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n=== Vesting Deployment Complete ===");
  console.log(`\nDeployment saved to: ${deploymentPath}`);
  
  console.log("\nDeployed Contracts:");
  console.log(`Vesting Implementation: ${await vestingImpl.getAddress()}`);
  console.log(`Vesting Proxy:          ${await vestingProxy.getAddress()}`);

  console.log("\n*** SAVE VESTING PROXY ADDRESS FOR NEXT STEP ***");
  console.log("NOTE: Vesting will be initialized in Step 5");

  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  rl.close();
});

