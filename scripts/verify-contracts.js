"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContractVerifier = void 0;
exports.verifyContracts = verifyContracts;
const hardhat_1 = require("hardhat");
class ContractVerifier {
    constructor(config) {
        this.config = config;
    }
    async verifyAll() {
        console.log(` Verifying contracts on ${this.config.network}...\n`);
        for (const contract of this.config.contracts) {
            await this.verifyContract(contract);
        }
        console.log("\n All contracts verified successfully!");
    }
    async verifyContract(contract) {
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
        }
        catch (error) {
            console.error(` Failed to verify ${contract.name}:`, error);
        }
    }
    async isContractVerified(address) {
        try {
            // This would check if the contract is already verified on the block explorer
            // Implementation depends on the specific block explorer API
            return false; // Assume not verified for now
        }
        catch (error) {
            return false;
        }
    }
    async runVerification(contract) {
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
            if (stdout)
                console.log(`  Output: ${stdout}`);
            if (stderr)
                console.log(`  Error: ${stderr}`);
        }
        catch (error) {
            console.error(`  Verification failed: ${error}`);
            throw error;
        }
    }
}
exports.ContractVerifier = ContractVerifier;
// Main verification function
async function verifyContracts() {
    try {
        const network = hardhat_1.ethers.provider._networkName || "localhost";
        console.log(` Starting contract verification on ${network}...\n`);
        // Load deployment information
        const deploymentInfo = await loadDeploymentInfo(network);
        if (!deploymentInfo) {
            throw new Error("No deployment information found for this network");
        }
        // Prepare verification config
        const config = {
            network,
            contracts: [
                // {
                //   name: "HyraDAOInitializer",
                //   address: deploymentInfo.daoInitializer,
                //   constructorArgs: []
                // }, // Contract moved to backup
                {
                    name: "HyraToken",
                    address: deploymentInfo.result.tokenProxy,
                    constructorArgs: []
                },
                {
                    name: "HyraGovernor",
                    address: deploymentInfo.result.governorProxy,
                    constructorArgs: []
                },
                {
                    name: "HyraTimelock",
                    address: deploymentInfo.result.timelockProxy,
                    constructorArgs: []
                },
                {
                    name: "TokenVesting",
                    address: deploymentInfo.result.vestingProxy,
                    constructorArgs: []
                },
                {
                    name: "SecureProxyAdmin",
                    address: deploymentInfo.result.proxyAdmin,
                    constructorArgs: []
                },
                {
                    name: "HyraProxyDeployer",
                    address: deploymentInfo.result.proxyDeployer,
                    constructorArgs: []
                },
                {
                    name: "SecureExecutorManager",
                    address: deploymentInfo.result.executorManager,
                    constructorArgs: []
                },
                {
                    name: "ProxyAdminValidator",
                    address: deploymentInfo.result.proxyAdminValidator,
                    constructorArgs: []
                }
            ]
        };
        // Verify contracts
        const verifier = new ContractVerifier(config);
        await verifier.verifyAll();
        console.log("\n🎉 Contract verification completed successfully!");
    }
    catch (error) {
        console.error(" Contract verification failed:", error);
        throw error;
    }
}
// Load deployment information
async function loadDeploymentInfo(network) {
    const fs = require("fs");
    const path = require("path");
    const deploymentDir = path.join(__dirname, "..", "deployments");
    if (!fs.existsSync(deploymentDir)) {
        throw new Error("Deployments directory not found");
    }
    const files = fs.readdirSync(deploymentDir);
    const networkFiles = files.filter((file) => file.includes(network));
    if (networkFiles.length === 0) {
        throw new Error(`No deployment files found for network: ${network}`);
    }
    // Get the most recent deployment file
    const latestFile = networkFiles.sort().pop();
    const filepath = path.join(deploymentDir, latestFile);
    const deploymentInfo = JSON.parse(fs.readFileSync(filepath, "utf8"));
    console.log(`📁 Loaded deployment info from: ${filepath}`);
    return deploymentInfo;
}
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
