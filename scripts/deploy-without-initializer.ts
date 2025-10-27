import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy script WITHOUT HyraDAOInitializer (which is too large)
 * Use a separate helper script for initialization if needed
 */

interface DeploymentInfo {
  network: string;
  timestamp: string;
  deployer: string;
  contracts: {
    token?: string;
    tokenImplementation?: string;
    timelock?: string;
    timelockImplementation?: string;
    governor?: string;
    governorImplementation?: string;
    proxyAdmin?: string;
    proxyDeployer?: string;
    vesting?: string;
    executorManager?: string;
    proxyAdminValidator?: string;
  };
  deploymentHash: string;
}

async function main() {
  console.log("\n🚀 Starting Hyra Contracts Deployment (WITHOUT HyraDAOInitializer)...\n");
  
  let deploymentInfo: DeploymentInfo = {
    network: network.name,
    timestamp: new Date().toISOString(),
    deployer: "",
    contracts: {},
    deploymentHash: ""
  };
  
  try {
    const signers = await ethers.getSigners();
    
    if (!signers || signers.length === 0) {
      throw new Error("No signers found! Check your PRIVATE_KEY in .env file");
    }
    
    const deployer = signers[0];
    const balance = await ethers.provider.getBalance(deployer.address);
    
    console.log("📋 Deployment Information:");
    console.log(`   Network: ${network.name}`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Balance: ${ethers.formatEther(balance)} ${network.config.chainId === 1 ? "ETH" : "ETH (testnet)"}`);
    
    if (balance < ethers.parseEther("0.01")) {
      console.warn("\n⚠️  WARNING: Low balance! You might not have enough ETH for deployment.");
      if (network.name !== "mainnet") {
        console.log("💡 Get testnet ETH from faucets:");
        console.log("   Sepolia: https://sepoliafaucet.com");
      }
    }
    
    console.log("\n📦 Deploying contracts...\n");
    
    deploymentInfo.deployer = deployer.address;
    
    // 1. HyraToken
    console.log("1️⃣  Deploying HyraToken...");
    const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraTokenFactory.deploy();
    await tokenImpl.waitForDeployment();
    const tokenAddress = await tokenImpl.getAddress();
    console.log(`   ✅ HyraToken: ${tokenAddress}`);
    deploymentInfo.contracts.tokenImplementation = tokenAddress;

    // 2. SecureProxyAdmin
    console.log("\n2️⃣  Deploying SecureProxyAdmin...");
    const SecureProxyAdminFactory = await ethers.getContractFactory("SecureProxyAdmin");
    const proxyAdmin = await SecureProxyAdminFactory.deploy(deployer.address, 1);
    await proxyAdmin.waitForDeployment();
    const proxyAdminAddress = await proxyAdmin.getAddress();
    console.log(`   ✅ SecureProxyAdmin: ${proxyAdminAddress}`);
    deploymentInfo.contracts.proxyAdmin = proxyAdminAddress;

    // 3. HyraTimelock
    console.log("\n3️⃣  Deploying HyraTimelock...");
    const HyraTimelockFactory = await ethers.getContractFactory("HyraTimelock");
    const timelockImpl = await HyraTimelockFactory.deploy();
    await timelockImpl.waitForDeployment();
    const timelockAddress = await timelockImpl.getAddress();
    console.log(`   ✅ HyraTimelock: ${timelockAddress}`);
    deploymentInfo.contracts.timelockImplementation = timelockAddress;

    // 4. HyraGovernor
    console.log("\n4️⃣  Deploying HyraGovernor...");
    const HyraGovernorFactory = await ethers.getContractFactory("HyraGovernor");
    const governorImpl = await HyraGovernorFactory.deploy();
    await governorImpl.waitForDeployment();
    const governorAddress = await governorImpl.getAddress();
    console.log(`   ✅ HyraGovernor: ${governorAddress}`);
    deploymentInfo.contracts.governorImplementation = governorAddress;

    // 5. HyraProxyDeployer
    console.log("\n5️⃣  Deploying HyraProxyDeployer...");
    const HyraProxyDeployerFactory = await ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await HyraProxyDeployerFactory.deploy();
    await proxyDeployer.waitForDeployment();
    const proxyDeployerAddress = await proxyDeployer.getAddress();
    console.log(`   ✅ HyraProxyDeployer: ${proxyDeployerAddress}`);
    deploymentInfo.contracts.proxyDeployer = proxyDeployerAddress;

    // 6. TokenVesting
    console.log("\n6️⃣  Deploying TokenVesting...");
    const TokenVestingFactory = await ethers.getContractFactory("TokenVesting");
    const vesting = await TokenVestingFactory.deploy();
    await vesting.waitForDeployment();
    const vestingAddress = await vesting.getAddress();
    console.log(`   ✅ TokenVesting: ${vestingAddress}`);
    deploymentInfo.contracts.vesting = vestingAddress;

    // 7. SecureExecutorManager
    console.log("\n7️⃣  Deploying SecureExecutorManager...");
    const SecureExecutorManagerFactory = await ethers.getContractFactory("SecureExecutorManager");
    const executorManager = await SecureExecutorManagerFactory.deploy();
    await executorManager.waitForDeployment();
    const executorAddress = await executorManager.getAddress();
    console.log(`   ✅ SecureExecutorManager: ${executorAddress}`);
    deploymentInfo.contracts.executorManager = executorAddress;

    // 8. ProxyAdminValidator
    console.log("\n8️⃣  Deploying ProxyAdminValidator...");
    const ProxyAdminValidatorFactory = await ethers.getContractFactory("ProxyAdminValidator");
    const proxyAdminValidator = await ProxyAdminValidatorFactory.deploy();
    await proxyAdminValidator.waitForDeployment();
    const validatorAddress = await proxyAdminValidator.getAddress();
    console.log(`   ✅ ProxyAdminValidator: ${validatorAddress}`);
    deploymentInfo.contracts.proxyAdminValidator = validatorAddress;

    console.log("\n⚠️  HyraDAOInitializer SKIPPED (contract too large)");
    console.log("   ✅ All 8 core contracts deployed successfully!");

    const blockNumber = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNumber);
    deploymentInfo.deploymentHash = block?.hash || "";

    // Save deployment info
    const deploymentDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }

    const filename = `deployment-${network.name}-${Date.now()}.json`;
    const filepath = path.join(deploymentDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));

    console.log("\n" + "=".repeat(60));
    console.log("✅ DEPLOYMENT SUMMARY");
    console.log("=".repeat(60));
    console.log(`Network: ${network.name}`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Block: ${blockNumber}`);
    console.log(`Timestamp: ${deploymentInfo.timestamp}`);
    console.log("\n📄 Contract Addresses:");
    Object.entries(deploymentInfo.contracts).forEach(([key, address]) => {
      console.log(`   ${key}: ${address}`);
    });
    console.log(`\n💾 Deployment info saved: ${filepath}`);
    
    console.log("\n✅ Deployment completed successfully!\n");

  } catch (error) {
    console.error("\n❌ Deployment failed!");
    console.error(error);
    
    const errorInfo = {
      ...deploymentInfo,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    };
    
    const deploymentDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const filename = `deployment-${network.name}-error-${Date.now()}.json`;
    const filepath = path.join(deploymentDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(errorInfo, null, 2));
    
    console.log(`\n💾 Error info saved: ${filepath}`);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

