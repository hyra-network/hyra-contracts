import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Step 2: Deploy HyraTimelock
 * Prerequisites: None
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  console.log("\n=== Step 2: Deploying HyraTimelock ===\n");

  // 1. Deploy HyraTimelock Implementation
  console.log("1. Deploying HyraTimelock Implementation...");
  const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
  const timelockImpl = await HyraTimelock.deploy({ gasLimit: 8_000_000 });
  await timelockImpl.waitForDeployment();
  console.log(`   Implementation: ${await timelockImpl.getAddress()}`);

  // 2. Deploy ERC1967Proxy for Timelock
  console.log("\n2. Deploying Timelock Proxy...");
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  
  const timelockInit = HyraTimelock.interface.encodeFunctionData("initialize", [
    172800, // minDelay = 2 days
    [await deployer.getAddress()], // proposers
    [await deployer.getAddress()], // executors
    await deployer.getAddress() // admin
  ]);
  
  const timelockProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), timelockInit, { gasLimit: 8_000_000 });
  await timelockProxy.waitForDeployment();
  console.log(`   Proxy: ${await timelockProxy.getAddress()}`);

  // Save deployment info
  const deployment = {
    step: "02-timelock",
    network: (await ethers.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    deployer: await deployer.getAddress(),
    contracts: {
      timelockImpl: await timelockImpl.getAddress(),
      timelockProxy: await timelockProxy.getAddress()
    },
    config: {
      minDelay: "2 days (172800 seconds)",
      proposers: [await deployer.getAddress()],
      executors: [await deployer.getAddress()],
      admin: await deployer.getAddress()
    }
  };

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentPath = path.join(deploymentsDir, `02-timelock-${Date.now()}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n=== Timelock Deployment Complete ===");
  console.log(`\nDeployment saved to: ${deploymentPath}`);
  
  console.log("\nDeployed Contracts:");
  console.log(`Timelock Implementation: ${await timelockImpl.getAddress()}`);
  console.log(`Timelock Proxy:          ${await timelockProxy.getAddress()}`);

  console.log("\n*** SAVE TIMELOCK PROXY ADDRESS FOR NEXT STEPS ***");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

