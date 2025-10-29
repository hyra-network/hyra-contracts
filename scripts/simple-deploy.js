"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simpleDeploy = simpleDeploy;
const hardhat_1 = require("hardhat");
async function simpleDeploy() {
    try {
        const [deployer] = await hardhat_1.ethers.getSigners();
        console.log(` Simple deployment test...`);
        console.log(` Deployer: ${deployer.address}`);
        console.log(` Balance: ${hardhat_1.ethers.formatEther(await hardhat_1.ethers.provider.getBalance(deployer.address))} ETH\n`);
        // Deploy individual contracts first
        console.log(" Deploying individual contracts...");
        // 1. Deploy HyraToken
        console.log("1. Deploying HyraToken...");
        const HyraTokenFactory = await hardhat_1.ethers.getContractFactory("HyraToken");
        const token = await HyraTokenFactory.deploy();
        console.log(`   HyraToken deployed at: ${await token.getAddress()}`);
        // 2. Deploy HyraTimelock
        console.log("2. Deploying HyraTimelock...");
        const HyraTimelockFactory = await hardhat_1.ethers.getContractFactory("HyraTimelock");
        const timelock = await HyraTimelockFactory.deploy();
        console.log(`   HyraTimelock deployed at: ${await timelock.getAddress()}`);
        // 3. Deploy HyraGovernor
        console.log("3. Deploying HyraGovernor...");
        const HyraGovernorFactory = await hardhat_1.ethers.getContractFactory("HyraGovernor");
        const governor = await HyraGovernorFactory.deploy();
        console.log(`   HyraGovernor deployed at: ${await governor.getAddress()}`);
        // 4. Deploy SecureProxyAdmin
        console.log("4. Deploying SecureProxyAdmin...");
        const SecureProxyAdminFactory = await hardhat_1.ethers.getContractFactory("SecureProxyAdmin");
        const proxyAdmin = await SecureProxyAdminFactory.deploy(deployer.address, 1);
        console.log(`   SecureProxyAdmin deployed at: ${await proxyAdmin.getAddress()}`);
        // 5. Deploy HyraProxyDeployer
        console.log("5. Deploying HyraProxyDeployer...");
        const HyraProxyDeployerFactory = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await HyraProxyDeployerFactory.deploy();
        console.log(`   HyraProxyDeployer deployed at: ${await proxyDeployer.getAddress()}`);
        // 6. Deploy TokenVesting
        console.log("6. Deploying TokenVesting...");
        const TokenVestingFactory = await hardhat_1.ethers.getContractFactory("TokenVesting");
        const vesting = await TokenVestingFactory.deploy();
        console.log(`   TokenVesting deployed at: ${await vesting.getAddress()}`);
        // 7. Deploy SecureExecutorManager
        console.log("7. Deploying SecureExecutorManager...");
        const SecureExecutorManagerFactory = await hardhat_1.ethers.getContractFactory("SecureExecutorManager");
        const executorManager = await SecureExecutorManagerFactory.deploy();
        console.log(`   SecureExecutorManager deployed at: ${await executorManager.getAddress()}`);
        // 8. Deploy ProxyAdminValidator
        console.log("8. Deploying ProxyAdminValidator...");
        const ProxyAdminValidatorFactory = await hardhat_1.ethers.getContractFactory("ProxyAdminValidator");
        const proxyAdminValidator = await ProxyAdminValidatorFactory.deploy();
        console.log(`   ProxyAdminValidator deployed at: ${await proxyAdminValidator.getAddress()}`);
        // 9. Deploy HyraDAOInitializer
        console.log("9. Deploying HyraDAOInitializer...");
        const HyraDAOInitializerFactory = await hardhat_1.ethers.getContractFactory("HyraDAOInitializer");
        const daoInitializer = await HyraDAOInitializerFactory.deploy();
        console.log(`   HyraDAOInitializer deployed at: ${await daoInitializer.getAddress()}`);
        console.log("\n DEPLOYMENT SUMMARY");
        console.log("=".repeat(50));
        console.log(`Token: ${await token.getAddress()}`);
        console.log(`Timelock: ${await timelock.getAddress()}`);
        console.log(`Governor: ${await governor.getAddress()}`);
        console.log(`ProxyAdmin: ${await proxyAdmin.getAddress()}`);
        console.log(`ProxyDeployer: ${await proxyDeployer.getAddress()}`);
        console.log(`Vesting: ${await vesting.getAddress()}`);
        console.log(`ExecutorManager: ${await executorManager.getAddress()}`);
        console.log(`ProxyAdminValidator: ${await proxyAdminValidator.getAddress()}`);
        console.log(`DAOInitializer: ${await daoInitializer.getAddress()}`);
        console.log("\ All contracts deployed successfully!");
        // Test basic functionality
        console.log("\n Testing basic functionality...");
        // Test token initialization
        console.log("Testing token initialization...");
        await token.initialize("Hyra Test Token", "HYRA-TEST", hardhat_1.ethers.parseEther("1000000"), deployer.address, deployer.address);
        console.log("   Token initialized");
        // Test timelock initialization
        console.log("Testing timelock initialization...");
        await timelock.initialize(86400, // 1 day delay
        [deployer.address], // proposers
        [deployer.address], // executors
        deployer.address // admin
        );
        console.log("   Timelock initialized");
        // Test governor initialization
        console.log("Testing governor initialization...");
        await governor.initialize(await token.getAddress(), timelock, 1, // voting delay
        100, // voting period
        hardhat_1.ethers.parseEther("1000"), // proposal threshold
        1000 // quorum percentage
        );
        console.log("   Governor initialized");
        // Test executor manager initialization
        console.log("Testing executor manager initialization...");
        await executorManager.initialize(deployer.address, [deployer.address], 1);
        console.log("   Executor manager initialized");
        // Test proxy admin validator initialization
        console.log("Testing proxy admin validator initialization...");
        await proxyAdminValidator.initialize(deployer.address);
        console.log("   Proxy admin validator initialized");
        console.log("\n All tests passed! Deployment successful!");
        // Save deployment info
        const deploymentInfo = {
            network: "localhost",
            timestamp: new Date().toISOString(),
            deployer: deployer.address,
            contracts: {
                token: await token.getAddress(),
                timelock: await timelock.getAddress(),
                governor: await governor.getAddress(),
                proxyAdmin: await proxyAdmin.getAddress(),
                proxyDeployer: await proxyDeployer.getAddress(),
                vesting: await vesting.getAddress(),
                executorManager: await executorManager.getAddress(),
                proxyAdminValidator: await proxyAdminValidator.getAddress(),
                daoInitializer: await daoInitializer.getAddress()
            }
        };
        const fs = require("fs");
        const path = require("path");
        const deploymentDir = path.join(__dirname, "..", "deployments");
        if (!fs.existsSync(deploymentDir)) {
            fs.mkdirSync(deploymentDir, { recursive: true });
        }
        const filename = `simple-deployment-localhost-${Date.now()}.json`;
        const filepath = path.join(deploymentDir, filename);
        fs.writeFileSync(filepath, JSON.stringify(deploymentInfo, null, 2));
        console.log(`\n💾 Deployment info saved to: ${filepath}`);
    }
    catch (error) {
        console.error("❌ Deployment failed:", error);
        throw error;
    }
}
// Run deployment if this script is executed directly
if (require.main === module) {
    simpleDeploy()
        .then(() => {
        console.log("\n Simple deployment completed successfully!");
        process.exit(0);
    })
        .catch((error) => {
        console.error("\nSimple deployment failed:", error);
        process.exit(1);
    });
}
