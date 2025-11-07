import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy HyraTokenFastTest to Base Sepolia for quick UI testing
 * ⚠️ MINT_EXECUTION_DELAY = 2 MINUTES (not 2 days!)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  console.log("\n⚡ Deploying FAST TEST contracts (2 minute delay) to Base Sepolia...\n");
  console.log("⚠️  WARNING: These contracts are for TESTING ONLY!");
  console.log("   MINT_EXECUTION_DELAY = 2 MINUTES (not 2 days)\n");

  // 1. Deploy Infrastructure Contracts
  console.log("=== Deploying Infrastructure Contracts ===\n");

  console.log("1.1. Deploying SecureProxyAdmin...");
  const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
  const proxyAdmin = await SecureProxyAdmin.deploy(await deployer.getAddress(), 1, { gasLimit: 8_000_000 });
  await proxyAdmin.waitForDeployment();
  console.log(`   ✅ SecureProxyAdmin: ${await proxyAdmin.getAddress()}`);

  console.log("\n1.2. Deploying HyraProxyDeployer...");
  const HyraProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
  const proxyDeployer = await HyraProxyDeployer.deploy({ gasLimit: 8_000_000 });
  await proxyDeployer.waitForDeployment();
  console.log(`   ✅ HyraProxyDeployer: ${await proxyDeployer.getAddress()}`);

  console.log("\n1.3. Deploying SecureExecutorManager...");
  const SecureExecutorManager = await ethers.getContractFactory("SecureExecutorManager");
  const executorManager = await SecureExecutorManager.deploy({ gasLimit: 8_000_000 });
  await executorManager.waitForDeployment();
  console.log(`   ✅ SecureExecutorManager: ${await executorManager.getAddress()}`);
  
  try {
    await (await executorManager.initialize(await deployer.getAddress(), [await deployer.getAddress()], { gasLimit: 8_000_000 })).wait();
    console.log(`   ✅ SecureExecutorManager initialized`);
  } catch (e) {
    console.log(`   ⚠️  SecureExecutorManager.initialize failed (may need manual init)`);
  }

  console.log("\n1.4. Deploying ProxyAdminValidator...");
  const ProxyAdminValidator = await ethers.getContractFactory("ProxyAdminValidator");
  const proxyAdminValidator = await ProxyAdminValidator.deploy({ gasLimit: 8_000_000 });
  await proxyAdminValidator.waitForDeployment();
  console.log(`   ✅ ProxyAdminValidator: ${await proxyAdminValidator.getAddress()}`);

  try {
    await (await proxyAdminValidator.initialize(await deployer.getAddress(), { gasLimit: 8_000_000 })).wait();
    console.log(`   ✅ ProxyAdminValidator initialized`);
  } catch (e) {
    console.log(`   ⚠️  ProxyAdminValidator.initialize failed (may need manual init)`);
  }

  console.log("\n=== Deploying Core Contracts ===\n");

  // 2. Deploy HyraTimelockTestable with minimal delay
  console.log("1. Deploying HyraTimelock with 1 minute delay...");
  const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
  const timelockImpl = await HyraTimelock.deploy({ gasLimit: 8_000_000 });
  await timelockImpl.waitForDeployment();
  console.log(`   Implementation: ${await timelockImpl.getAddress()}`);

  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  
  const timelockInit = HyraTimelock.interface.encodeFunctionData("initialize", [
    60, // minDelay = 1 minute for fast testing
    [await deployer.getAddress()], // proposers
    [await deployer.getAddress()], // executors
    await deployer.getAddress() // admin
  ]);
  
  const timelockProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), timelockInit, { gasLimit: 8_000_000 });
  await timelockProxy.waitForDeployment();
  console.log(`   Proxy: ${await timelockProxy.getAddress()}`);
  console.log(`   ✅ Timelock deployed with 1 minute delay`);

  // 2. Deploy TokenVesting
  console.log("\n2. Deploying TokenVesting...");
  const TokenVesting = await ethers.getContractFactory("TokenVesting");
  const vestingImpl = await TokenVesting.deploy({ gasLimit: 8_000_000 });
  await vestingImpl.waitForDeployment();
  console.log(`   Implementation: ${await vestingImpl.getAddress()}`);

  const vestingProxy = await ERC1967Proxy.deploy(
    await vestingImpl.getAddress(),
    "0x",
    { gasLimit: 8_000_000 }
  );
  await vestingProxy.waitForDeployment();
  console.log(`   Proxy: ${await vestingProxy.getAddress()}`);

  // 3. Deploy HyraTokenFastTest
  console.log("\n3. Deploying HyraTokenFastTest (2 minute delay)...");
  const HyraTokenFastTest = await ethers.getContractFactory("HyraTokenFastTest");
  const tokenImpl = await HyraTokenFastTest.deploy({ gasLimit: 8_000_000 });
  await tokenImpl.waitForDeployment();
  console.log(`   Implementation: ${await tokenImpl.getAddress()}`);

  const safeAddress = process.env.SAFE_ADDRESS || await deployer.getAddress();
  console.log(`   Owner will be: ${safeAddress}`);

  const tokenInit = HyraTokenFastTest.interface.encodeFunctionData("initialize", [
    "Hyra Token Fast Test",
    "HYRA",
    ethers.parseEther("1000000"), // 1M initial supply
    await vestingProxy.getAddress(),
    safeAddress // owner = Safe or deployer
  ]);
  
  const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), tokenInit, { gasLimit: 8_000_000 });
  await tokenProxy.waitForDeployment();
  console.log(`   Proxy: ${await tokenProxy.getAddress()}`);
  console.log(`   ✅ Token deployed with 2 MINUTE delay!`);

  // 4. Initialize TokenVesting
  console.log("\n4. Initializing TokenVesting...");
  const vesting = await ethers.getContractAt("TokenVesting", await vestingProxy.getAddress());
  await (await vesting.initialize(await tokenProxy.getAddress(), await timelockProxy.getAddress(), { gasLimit: 8_000_000 })).wait();
  console.log("   ✅ TokenVesting initialized");

  // 5. Deploy HyraGovernor
  console.log("\n5. Deploying HyraGovernor...");
  const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
  const governorImpl = await HyraGovernor.deploy({ gasLimit: 8_000_000 });
  await governorImpl.waitForDeployment();
  console.log(`   Implementation: ${await governorImpl.getAddress()}`);

  const governorInit = HyraGovernor.interface.encodeFunctionData("initialize", [
    await tokenProxy.getAddress(),
    await timelockProxy.getAddress(),
    1, // votingDelay = 1 block
    50400, // votingPeriod = 1 week in blocks
    ethers.parseEther("1000000"), // proposalThreshold = 1M tokens
    4 // quorumPercentage = 4%
  ]);
  
  const governorProxy = await ERC1967Proxy.deploy(await governorImpl.getAddress(), governorInit, { gasLimit: 8_000_000 });
  await governorProxy.waitForDeployment();
  console.log(`   Proxy: ${await governorProxy.getAddress()}`);

  // Save deployment
  const deployment = {
    network: "baseSepolia",
    deployedAt: new Date().toISOString(),
    deployer: await deployer.getAddress(),
    WARNING: "FAST TEST CONTRACTS - 2 MINUTE DELAY - DO NOT USE IN PRODUCTION",
    delays: {
      MINT_EXECUTION_DELAY: "2 minutes",
      TIMELOCK_MIN_DELAY: "1 minute",
      REQUEST_EXPIRY_PERIOD: "7 days"
    },
    infra: {
      secureProxyAdmin: await proxyAdmin.getAddress(),
      hyraProxyDeployer: await proxyDeployer.getAddress(),
      secureExecutorManager: await executorManager.getAddress(),
      proxyAdminValidator: await proxyAdminValidator.getAddress()
    },
    vestingImpl: await vestingImpl.getAddress(),
    vestingProxy: await vestingProxy.getAddress(),
    tokenImpl: await tokenImpl.getAddress(),
    tokenProxy: await tokenProxy.getAddress(),
    timelockImpl: await timelockImpl.getAddress(),
    timelockProxy: await timelockProxy.getAddress(),
    governorImpl: await governorImpl.getAddress(),
    governorProxy: await governorProxy.getAddress(),
    owner: safeAddress
  };

  const deploymentPath = path.join(__dirname, "..", "deployments", `fast-test-baseSepolia-${Date.now()}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n=== Deployment Complete ===");
  console.log(`Deployment file: ${deploymentPath}`);
  
  console.log("\n📋 Infrastructure Contracts:");
  console.log(`SecureProxyAdmin: ${await proxyAdmin.getAddress()}`);
  console.log(`HyraProxyDeployer: ${await proxyDeployer.getAddress()}`);
  console.log(`SecureExecutorManager: ${await executorManager.getAddress()}`);
  console.log(`ProxyAdminValidator: ${await proxyAdminValidator.getAddress()}`);
  
  console.log("\n📋 Core Contract Addresses:");
  console.log(`TokenVesting (proxy): ${await vestingProxy.getAddress()}`);
  console.log(`HyraTokenFastTest (proxy): ${await tokenProxy.getAddress()}`);
  console.log(`HyraTimelock (proxy): ${await timelockProxy.getAddress()}`);
  console.log(`HyraGovernor (proxy): ${await governorProxy.getAddress()}`);
  console.log(`Owner: ${safeAddress}`);

  console.log("\n⚡ FAST TEST MODE:");
  console.log(`   - Mint delay: 2 MINUTES (not 2 days!)`);
  console.log(`   - Timelock delay: 1 MINUTE`);
  console.log(`   - Request expiry: 7 days`);

  console.log("\n📝 Next steps:");
  console.log("1. Verify contracts: npx hardhat run scripts/verify-base-sepolia.ts --network baseSepolia");
  console.log("2. Test mint via Safe:");
  console.log(`   - Create mint request`);
  console.log(`   - Wait 2 MINUTES`);
  console.log(`   - Execute mint request`);
  console.log("3. Check status: npx hardhat run scripts/check-mint-status.ts --network baseSepolia");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

