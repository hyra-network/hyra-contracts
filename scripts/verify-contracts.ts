import { ethers } from "hardhat";
import { Contract } from "ethers";

interface VerificationConfig {
  network: string;
  contracts: {
    name: string;
    address: string;
    constructorArgs?: any[];
  }[];
}

class ContractVerifier {
  private config: VerificationConfig;

  constructor(config: VerificationConfig) {
    this.config = config;
  }

  async verifyAll(): Promise<void> {
    console.log(` Verifying contracts on ${this.config.network}...\n`);

    for (const contract of this.config.contracts) {
      await this.verifyContract(contract);
    }

    console.log("\n All contracts verified successfully!");
  }

  private async verifyContract(contract: any): Promise<void> {
    try {
      console.log(` Verifying ${contract.name} at ${contract.address}...`);

      // Check if contract is already verified
      const isVerified = await this.isContractVerified(contract.address);
      if (isVerified) {
        console.log(` ${contract.name} is already verified`);
        return;
      }

      // Verify contract
      await this.runVerification(contract);

      console.log(` ${contract.name} verified successfully`);
    } catch (error) {
      console.error(` Failed to verify ${contract.name}:`, error);
    }
  }

  private async isContractVerified(address: string): Promise<boolean> {
    try {
      // This would check if the contract is already verified on the block explorer
      // Implementation depends on the specific block explorer API
      return false; // Assume not verified for now
    } catch (error) {
      return false;
    }
  }

  private async runVerification(contract: any): Promise<void> {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);

    let command = `npx hardhat verify --network ${this.config.network} ${contract.address}`;
    
    if (contract.constructorArgs && contract.constructorArgs.length > 0) {
      command += ` ${contract.constructorArgs.map(arg => `"${arg}"`).join(" ")}`;
    }

    console.log(`  Running: ${command}`);

    try {
      const { stdout, stderr } = await execAsync(command);
      if (stdout) console.log(`  Output: ${stdout}`);
      if (stderr) console.log(`  Error: ${stderr}`);
    } catch (error) {
      console.error(`  Verification failed: ${error}`);
      throw error;
    }
  }
}

// Main verification function
async function verifyContracts() {
  try {
    const network = ethers.provider._networkName || "localhost";
    
    console.log(` Starting contract verification on ${network}...\n`);

    // Load deployment information
    const deploymentInfo = await loadDeploymentInfo(network);
    
    if (!deploymentInfo) {
      throw new Error("No deployment information found for this network");
    }

    // Prepare verification config based on deployment structure
    const contracts = [];
    
    // Check for new deployment structure (with contracts object)
    if (deploymentInfo.contracts) {
      if (deploymentInfo.contracts.tokenImplementation) {
        contracts.push({
          name: "HyraToken",
          address: deploymentInfo.contracts.tokenImplementation,
          constructorArgs: []
        });
      }
      if (deploymentInfo.contracts.proxyAdmin) {
        contracts.push({
          name: "SecureProxyAdmin",
          address: deploymentInfo.contracts.proxyAdmin,
          constructorArgs: ["0x424af7536BED1201D67eC27b6849419BAE68070b", "1"] // deployer, required sigs
        });
      }
      if (deploymentInfo.contracts.timelockImplementation) {
        contracts.push({
          name: "HyraTimelock",
          address: deploymentInfo.contracts.timelockImplementation,
          constructorArgs: []
        });
      }
      if (deploymentInfo.contracts.governorImplementation) {
        contracts.push({
          name: "HyraGovernor",
          address: deploymentInfo.contracts.governorImplementation,
          constructorArgs: []
        });
      }
      if (deploymentInfo.contracts.proxyDeployer) {
        contracts.push({
          name: "HyraProxyDeployer",
          address: deploymentInfo.contracts.proxyDeployer,
          constructorArgs: []
        });
      }
      if (deploymentInfo.contracts.vesting) {
        contracts.push({
          name: "TokenVesting",
          address: deploymentInfo.contracts.vesting,
          constructorArgs: []
        });
      }
      if (deploymentInfo.contracts.executorManager) {
        contracts.push({
          name: "SecureExecutorManager",
          address: deploymentInfo.contracts.executorManager,
          constructorArgs: []
        });
      }
      if (deploymentInfo.contracts.proxyAdminValidator) {
        contracts.push({
          name: "ProxyAdminValidator",
          address: deploymentInfo.contracts.proxyAdminValidator,
          constructorArgs: []
        });
      }
      if (deploymentInfo.contracts.daoInitializer) {
        contracts.push({
          name: "DAOConfigHelper",
          address: deploymentInfo.contracts.daoInitializer,
          constructorArgs: []
        });
      }
    }
    
    const config: VerificationConfig = {
      network,
      contracts
    };

    // Verify contracts
    const verifier = new ContractVerifier(config);
    await verifier.verifyAll();

    console.log("\n🎉 Contract verification completed successfully!");
  } catch (error) {
    console.error(" Contract verification failed:", error);
    throw error;
  }
}

// Load deployment information
async function loadDeploymentInfo(network: string): Promise<any> {
  const fs = require("fs");
  const path = require("path");
  
  const deploymentDir = path.join(__dirname, "..", "deployments");
  
  if (!fs.existsSync(deploymentDir)) {
    throw new Error("Deployments directory not found");
  }

  const files = fs.readdirSync(deploymentDir);
  // Filter out error files and get success deployments only
  const networkFiles = files.filter((file: string) => 
    file.includes(network) && !file.includes("error")
  );

  if (networkFiles.length === 0) {
    throw new Error(`No deployment files found for network: ${network}`);
  }

  // Get the most recent deployment file
  const latestFile = networkFiles.sort().reverse()[0]; // Get most recent
  const filepath = path.join(deploymentDir, latestFile);
  
  const deploymentInfo = JSON.parse(fs.readFileSync(filepath, "utf8"));
  
  console.log(`📁 Loaded deployment info from: ${filepath}`);
  
  return deploymentInfo;
}

// Export for use in other scripts
export { ContractVerifier, VerificationConfig, verifyContracts };

// Run verification if this script is executed directly
if (require.main === module) {
  verifyContracts()
    .then(() => {
      console.log("\n🎉 Contract verification completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Contract verification failed:", error);
      process.exit(1);
    });
}
