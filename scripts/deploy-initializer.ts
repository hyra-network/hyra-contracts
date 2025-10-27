import { ethers } from "hardhat";

/**
 * Standalone script to deploy HyraDAOInitializer
 * This contract is large (93KB) but can sometimes deploy on testnet
 */

async function main() {
  console.log("\n🚀 Deploying HyraDAOInitializer...\n");
  
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  
  console.log(`📋 Deployer: ${deployer.address}`);
  console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH\n`);
  
  if (balance < ethers.parseEther("0.1")) {
    console.warn("⚠️  Low balance - may not have enough for large contract deployment");
  }
  
  try {
    console.log("📦 Deploying HyraDAOInitializer (large contract ~93KB)...\n");
    
    const HyraDAOInitializerFactory = await ethers.getContractFactory("HyraDAOInitializer");
    
    // Try with higher gas limit for large contract
    const daoInitializer = await HyraDAOInitializerFactory.deploy({
      gasLimit: 10000000, // 10M gas
    });
    
    await daoInitializer.waitForDeployment();
    const address = await daoInitializer.getAddress();
    
    console.log(`✅ HyraDAOInitializer deployed successfully!`);
    console.log(`📍 Address: ${address}`);
    
    // Save to deployments folder
    const fs = require("fs");
    const path = require("path");
    const deploymentDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentDir)) {
      fs.mkdirSync(deploymentDir, { recursive: true });
    }
    
    const info = {
      contract: "HyraDAOInitializer",
      address: address,
      network: "sepolia",
      timestamp: new Date().toISOString(),
      deployer: deployer.address
    };
    
    fs.writeFileSync(
      path.join(deploymentDir, `initializer-sepolia-${Date.now()}.json`),
      JSON.stringify(info, null, 2)
    );
    
    console.log(`\n💾 Deployment info saved`);
    
  } catch (error: any) {
    console.error("\n❌ Deployment failed!");
    
    if (error.message?.includes("max initcode size")) {
      console.error("⚠️  Contract too large for deployment!");
      console.error("\n💡 Solutions:");
      console.error("1. Deploy without HyraDAOInitializer and use deploy() functions directly");
      console.error("2. Split HyraDAOInitializer into smaller contracts");
      console.error("3. Use a factory pattern with minimal code");
    } else {
      console.error("Error:", error.message);
    }
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

