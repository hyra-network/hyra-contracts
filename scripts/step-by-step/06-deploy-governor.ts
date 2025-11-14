import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

/**
 * Step 6: Deploy HyraGovernor
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
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  console.log("\n=== Step 6: Deploying HyraGovernor ===\n");

  // Get prerequisite addresses
  const tokenAddress = await question("Enter HyraToken Proxy address (from Step 4): ");
  if (!ethers.isAddress(tokenAddress)) {
    throw new Error("Invalid Token address");
  }

  const timelockAddress = await question("Enter HyraTimelock Proxy address (from Step 2): ");
  if (!ethers.isAddress(timelockAddress)) {
    throw new Error("Invalid Timelock address");
  }

  // 1. Deploy HyraGovernor Implementation
  console.log("\n1. Deploying HyraGovernor Implementation...");
  const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
  const governorImpl = await HyraGovernor.deploy({ gasLimit: 8_000_000 });
  await governorImpl.waitForDeployment();
  console.log(`   Implementation: ${await governorImpl.getAddress()}`);

  // 2. Deploy ERC1967Proxy for Governor
  console.log("\n2. Deploying Governor Proxy...");
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");

  const governorInit = HyraGovernor.interface.encodeFunctionData("initialize", [
    tokenAddress,
    timelockAddress,
    1,                              // votingDelay = 1 block
    50400,                          // votingPeriod = 1 week
    ethers.parseEther("1000000"),   // proposalThreshold = 1M tokens
    4                               // quorumPercentage = 4%
  ]);
  
  const governorProxy = await ERC1967Proxy.deploy(await governorImpl.getAddress(), governorInit, { gasLimit: 8_000_000 });
  await governorProxy.waitForDeployment();
  console.log(`   Proxy: ${await governorProxy.getAddress()}`);

  // Save deployment info
  const deployment = {
    step: "06-governor",
    network: (await ethers.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    deployer: await deployer.getAddress(),
    contracts: {
      governorImpl: await governorImpl.getAddress(),
      governorProxy: await governorProxy.getAddress()
    },
    config: {
      votingDelay: "1 block",
      votingPeriod: "50400 blocks (~1 week)",
      proposalThreshold: "1000000 HYRA",
      quorumPercentage: "4%"
    },
    prerequisites: {
      tokenProxy: tokenAddress,
      timelockProxy: timelockAddress
    }
  };

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentPath = path.join(deploymentsDir, `06-governor-${Date.now()}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n=== Governor Deployment Complete ===");
  console.log(`\nDeployment saved to: ${deploymentPath}`);
  
  console.log("\nDeployed Contracts:");
  console.log(`Governor Implementation: ${await governorImpl.getAddress()}`);
  console.log(`Governor Proxy:          ${await governorProxy.getAddress()}`);

  console.log("\n*** SAVE GOVERNOR PROXY ADDRESS FOR NEXT STEP ***");

  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  rl.close();
});

