import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Script to check environment setup before deployment
 */

interface EnvCheck {
  isSetup: boolean;
  issues: string[];
  warnings: string[];
}

async function checkEnvironment(): Promise<EnvCheck> {
  const result: EnvCheck = {
    isSetup: true,
    issues: [],
    warnings: []
  };

  console.log("🔍 Checking environment setup...\n");

  // Check .env file exists
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) {
    result.isSetup = false;
    result.issues.push("❌ .env file not found. Create it from .env.example");
    console.log("⚠️  .env file not found");
  } else {
    console.log("✅ .env file exists");
  }

  // Check network configuration
  const network = process.env.HARDHAT_NETWORK || "hardhat";
  console.log(`📡 Network: ${network}`);

  // Check RPC URL
  let rpcUrl = "";
  if (network === "sepolia") {
    rpcUrl = process.env.SEPOLIA_RPC_URL || "";
  } else if (network === "goerli") {
    rpcUrl = process.env.GOERLI_RPC_URL || "";
  } else if (network === "mainnet") {
    rpcUrl = process.env.MAINNET_RPC_URL || "";
  }

  if (!rpcUrl || rpcUrl.includes("YOUR_")) {
    result.warnings.push("⚠️  RPC URL not configured properly");
    console.log("⚠️  RPC URL may not be configured");
  } else {
    console.log("✅ RPC URL configured");
  }

  // Check private key
  const privateKey = process.env.PRIVATE_KEY || "";
  if (!privateKey || privateKey.includes("your_private_key")) {
    result.isSetup = false;
    result.issues.push("❌ PRIVATE_KEY not set in .env");
    console.log("❌ PRIVATE_KEY not set");
  } else {
    if (privateKey.startsWith("0x")) {
      result.warnings.push("⚠️  Private key has 0x prefix (should be removed)");
      console.log("⚠️  Private key has 0x prefix");
    } else {
      console.log("✅ Private key configured");
    }
  }

  // Check Etherscan API key
  const etherscanKey = process.env.ETHERSCAN_API_KEY || "";
  if (!etherscanKey || etherscanKey.includes("your_etherscan_api_key")) {
    result.warnings.push("⚠️  Etherscan API key not set (can't verify contracts)");
    console.log("⚠️  Etherscan API key not set");
  } else {
    console.log("✅ Etherscan API key configured");
  }

  // Check wallet balance
  if (result.isSetup && rpcUrl && privateKey) {
    try {
      const balance = await ethers.provider.getBalance(
        new ethers.Wallet(privateKey).address
      );
      const balanceEth = ethers.formatEther(balance);

      console.log(`\n💰 Wallet Balance: ${balanceEth} ETH`);

      if (network === "mainnet") {
        if (balance < ethers.parseEther("0.1")) {
          result.issues.push("❌ Low balance on mainnet! Need at least 0.1 ETH");
        }
      } else {
        if (balance < ethers.parseEther("0.01")) {
          result.warnings.push("⚠️  Low balance. Get testnet ETH from faucet");
        }
      }
    } catch (error) {
      result.warnings.push("⚠️  Could not check wallet balance");
      console.log("⚠️  Could not check balance");
    }
  }

  // Check dependencies
  console.log("\n📦 Checking dependencies...");
  const nodeModulesPath = path.join(__dirname, "..", "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    result.isSetup = false;
    result.issues.push("❌ node_modules not found. Run: npm install");
    console.log("❌ node_modules not found");
  } else {
    console.log("✅ Dependencies installed");
  }

  // Check compiled contracts
  const artifactsPath = path.join(__dirname, "..", "artifacts");
  if (!fs.existsSync(artifactsPath)) {
    result.warnings.push("⚠️  Contracts not compiled. Run: npm run compile");
    console.log("⚠️  Contracts not compiled");
  } else {
    console.log("✅ Contracts compiled");
  }

  return result;
}

async function main() {
  const result = await checkEnvironment();

  console.log("\n" + "=".repeat(60));
  console.log("📋 Environment Check Summary");
  console.log("=".repeat(60));

  if (result.issues.length === 0 && result.warnings.length === 0) {
    console.log("\n✅ All checks passed! Ready to deploy.\n");
  } else {
    if (result.issues.length > 0) {
      console.log("\n❌ Critical Issues:");
      result.issues.forEach(issue => console.log(`   ${issue}`));
    }

    if (result.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      result.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    console.log("\n💡 Fix the issues above before deploying.");
  }

  console.log("\n" + "=".repeat(60));

  // Exit with error code if there are critical issues
  if (result.issues.length > 0) {
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { checkEnvironment };

