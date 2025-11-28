import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.dev for Base Sepolia testnet, fallback to .env for other networks
// Can override with DOTENV_CONFIG_PATH environment variable
const envFile = process.env.DOTENV_CONFIG_PATH || 
  (network.name === "baseSepolia" ? ".env.dev" : 
   network.name === "mainnet" ? ".env.prod" : ".env");
dotenv.config({ path: envFile });

/**
 * Step 1: Deploy Infrastructure Contracts
 * - SecureProxyAdmin
 * - HyraProxyDeployer
 * - SecureExecutorManager
 * - ProxyAdminValidator
 */
async function main() {
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("No accounts found! Please set PRIVATE_KEY in .env.dev for baseSepolia network.");
  }
  const deployer = signers[0];
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  console.log("\n=== Step 1: Deploying Infrastructure Contracts ===\n");

  // 1. Deploy SecureProxyAdmin
  console.log("1. Deploying SecureProxyAdmin...");
  const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
  const proxyAdmin = await SecureProxyAdmin.deploy(await deployer.getAddress(), 1, { gasLimit: 8_000_000 });
  await proxyAdmin.waitForDeployment();
  console.log(`   SecureProxyAdmin: ${await proxyAdmin.getAddress()}`);

  // 2. Deploy HyraProxyDeployer
  console.log("\n2. Deploying HyraProxyDeployer...");
  const HyraProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
  const proxyDeployer = await HyraProxyDeployer.deploy({ gasLimit: 8_000_000 });
  await proxyDeployer.waitForDeployment();
  console.log(`   HyraProxyDeployer: ${await proxyDeployer.getAddress()}`);

  // 3. Deploy SecureExecutorManager
  console.log("\n3. Deploying SecureExecutorManager...");
  const SecureExecutorManager = await ethers.getContractFactory("SecureExecutorManager");
  const executorManager = await SecureExecutorManager.deploy({ gasLimit: 8_000_000 });
  await executorManager.waitForDeployment();
  console.log(`   SecureExecutorManager: ${await executorManager.getAddress()}`);
  
  try {
    await (await executorManager.initialize(await deployer.getAddress(), [await deployer.getAddress()], { gasLimit: 8_000_000 })).wait();
    console.log(`   SecureExecutorManager initialized`);
  } catch (e) {
    console.log(`   WARNING: SecureExecutorManager.initialize failed (may need manual init)`);
  }

  // 4. Deploy ProxyAdminValidator
  console.log("\n4. Deploying ProxyAdminValidator...");
  const ProxyAdminValidator = await ethers.getContractFactory("ProxyAdminValidator");
  const proxyAdminValidator = await ProxyAdminValidator.deploy({ gasLimit: 8_000_000 });
  await proxyAdminValidator.waitForDeployment();
  console.log(`   ProxyAdminValidator: ${await proxyAdminValidator.getAddress()}`);

  try {
    await (await proxyAdminValidator.initialize(await deployer.getAddress(), { gasLimit: 8_000_000 })).wait();
    console.log(`   ProxyAdminValidator initialized`);
  } catch (e) {
    console.log(`   WARNING: ProxyAdminValidator.initialize failed (may need manual init)`);
  }

  // Save deployment info
  const deployment = {
    step: "01-infrastructure",
    network: (await ethers.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    deployer: await deployer.getAddress(),
    contracts: {
      secureProxyAdmin: await proxyAdmin.getAddress(),
      hyraProxyDeployer: await proxyDeployer.getAddress(),
      secureExecutorManager: await executorManager.getAddress(),
      proxyAdminValidator: await proxyAdminValidator.getAddress()
    }
  };

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentPath = path.join(deploymentsDir, `01-infrastructure-${Date.now()}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n=== Infrastructure Deployment Complete ===");
  console.log(`\nDeployment saved to: ${deploymentPath}`);
  
  console.log("\nDeployed Contracts:");
  console.log(`SecureProxyAdmin:       ${await proxyAdmin.getAddress()}`);
  console.log(`HyraProxyDeployer:      ${await proxyDeployer.getAddress()}`);
  console.log(`SecureExecutorManager:  ${await executorManager.getAddress()}`);
  console.log(`ProxyAdminValidator:    ${await proxyAdminValidator.getAddress()}`);

  console.log("\n*** SAVE THESE ADDRESSES FOR NEXT STEP ***");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

