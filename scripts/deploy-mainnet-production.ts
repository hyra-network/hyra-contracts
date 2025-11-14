import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy HyraToken to Ethereum Mainnet for PRODUCTION
 * Year 1 starts: January 1, 2025 00:00:00 UTC
 * YEAR_DURATION = 365 days (production setting)
 * MINT_EXECUTION_DELAY = 2 days (production setting)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  console.log("\nDeploying PRODUCTION contracts to Ethereum Mainnet...\n");
  console.log("WARNING: This is PRODUCTION deployment!");
  console.log("   MINT_EXECUTION_DELAY = 2 DAYS");
  console.log("   YEAR_DURATION = 365 DAYS");
  console.log("   Year 1 starts: January 1, 2025 00:00:00 UTC\n");

  // 1. Deploy Infrastructure Contracts
  console.log("=== Deploying Infrastructure Contracts ===\n");

  console.log("1.1. Deploying SecureProxyAdmin...");
  const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
  const proxyAdmin = await SecureProxyAdmin.deploy(await deployer.getAddress(), 1, { gasLimit: 8_000_000 });
  await proxyAdmin.waitForDeployment();
  console.log(`   SecureProxyAdmin: ${await proxyAdmin.getAddress()}`);

  console.log("\n1.2. Deploying HyraProxyDeployer...");
  const HyraProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
  const proxyDeployer = await HyraProxyDeployer.deploy({ gasLimit: 8_000_000 });
  await proxyDeployer.waitForDeployment();
  console.log(`   HyraProxyDeployer: ${await proxyDeployer.getAddress()}`);

  console.log("\n1.3. Deploying SecureExecutorManager...");
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

  console.log("\n1.4. Deploying ProxyAdminValidator...");
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

  console.log("\n=== Deploying Core Contracts ===\n");

  // 2. Deploy HyraTimelock with production delay (2 days)
  console.log("1. Deploying HyraTimelock with 2 day delay...");
  const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
  const timelockImpl = await HyraTimelock.deploy({ gasLimit: 8_000_000 });
  await timelockImpl.waitForDeployment();
  console.log(`   Implementation: ${await timelockImpl.getAddress()}`);

  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
  
  const timelockInit = HyraTimelock.interface.encodeFunctionData("initialize", [
    172800, // minDelay = 2 days for production
    [await deployer.getAddress()], // proposers
    [await deployer.getAddress()], // executors
    await deployer.getAddress() // admin
  ]);
  
  const timelockProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), timelockInit, { gasLimit: 8_000_000 });
  await timelockProxy.waitForDeployment();
  console.log(`   Proxy: ${await timelockProxy.getAddress()}`);
  console.log(`   Timelock deployed with 2 day delay`);

  // 3. Deploy TokenVesting
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

  // 4. Deploy HyraToken with Year 1 starting Jan 1, 2025
  console.log("\n3. Deploying HyraToken (PRODUCTION - 365 days per year)...");
  const HyraToken = await ethers.getContractFactory("HyraToken");
  const tokenImpl = await HyraToken.deploy({ gasLimit: 8_000_000 });
  await tokenImpl.waitForDeployment();
  console.log(`   Implementation: ${await tokenImpl.getAddress()}`);

  const safeAddress = process.env.SAFE_ADDRESS || await deployer.getAddress();
  console.log(`   Safe Multisig Address: ${safeAddress}`);
  console.log(`   Owner will be: ${safeAddress}`);
  if (!process.env.SAFE_ADDRESS) {
    console.log(`   WARNING: SAFE_ADDRESS not set, using deployer address as fallback!`);
  }

  // Initial supply: 2.5B tokens (5% of 50B max supply)
  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5 billion
  console.log(`   Initial Supply: 2.5B tokens (5% of total supply)`);
  console.log(`   Initial tokens will be minted to: Safe Multisig`);
  console.log(`   WARNING: Year 1 quota will be FULL - cannot mint more until Year 2`);

  // Year 1 starts: January 1, 2025 00:00:00 UTC
  const YEAR_START_TIME = 1735689600; // Jan 1, 2025 00:00:00 UTC
  const yearStartDate = new Date(YEAR_START_TIME * 1000);
  console.log(`   Year 1 Start: ${yearStartDate.toISOString()} (${YEAR_START_TIME})`);
  console.log(`   Year 2 Start: ${new Date((YEAR_START_TIME + 365 * 24 * 60 * 60) * 1000).toISOString()}`);

  const tokenInit = HyraToken.interface.encodeFunctionData("initialize", [
    "HYRA",
    "HYRA",
    INITIAL_SUPPLY,     // 2.5B initial supply
    safeAddress,        // MINT TO SAFE MULTISIG
    await deployer.getAddress(),  // Temporary owner (deployer)
    YEAR_START_TIME     // Year 1 starts Jan 1, 2025
  ]);
  
  const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), tokenInit, { gasLimit: 8_000_000 });
  await tokenProxy.waitForDeployment();
  console.log(`   Proxy: ${await tokenProxy.getAddress()}`);
  console.log(`   Token deployed with PRODUCTION settings!`);
  console.log(`   Initial supply minted: 2.5B HYRA to Safe Multisig`);
  console.log(`   Year 1 starts: ${yearStartDate.toISOString()}`);
  console.log(`   Temporary owner: Deployer (will transfer to DAO later)`);

  // 5. Initialize TokenVesting
  console.log("\n4. Initializing TokenVesting...");
  const vesting = await ethers.getContractAt("TokenVesting", await vestingProxy.getAddress());
  await (await vesting.initialize(await tokenProxy.getAddress(), await timelockProxy.getAddress(), { gasLimit: 8_000_000 })).wait();
  console.log("   TokenVesting initialized");

  // 6. Deploy HyraGovernor
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

  // 7. Transfer HyraToken ownership to DAO (Timelock)
  console.log("\n6. Transferring HyraToken ownership to DAO...");
  const token = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());
  await (await token.transferOwnership(await timelockProxy.getAddress(), { gasLimit: 8_000_000 })).wait();
  console.log(`   HyraToken ownership transferred to Timelock (DAO)`);
  console.log(`   New owner: ${await timelockProxy.getAddress()}`);
  console.log(`   All mint requests must now go through DAO governance!`);

  // Save deployment
  const deployment = {
    network: "mainnet",
    deployedAt: new Date().toISOString(),
    deployer: await deployer.getAddress(),
    WARNING: "PRODUCTION DEPLOYMENT - ETHEREUM MAINNET",
    initialSupply: "2500000000", // 2.5B tokens (5% of max supply)
    initialSupplyNote: "FULL Year 1 quota - cannot mint more until Year 2",
    initialSupplyRecipient: safeAddress,
    safeMultisig: safeAddress,
    tokenOwner: await timelockProxy.getAddress(), // Ownership transferred to DAO
    ownershipNote: "HyraToken owner = HyraTimelock (DAO). All mint requests must go through governance.",
    yearStartTime: YEAR_START_TIME,
    yearStartDate: yearStartDate.toISOString(),
    year2StartDate: new Date((YEAR_START_TIME + 365 * 24 * 60 * 60) * 1000).toISOString(),
    delays: {
      MINT_EXECUTION_DELAY: "2 days",
      TIMELOCK_MIN_DELAY: "2 days",
      REQUEST_EXPIRY_PERIOD: "365 days",
      YEAR_DURATION: "365 days"
    },
    tokenomics: {
      maxSupply: "50000000000", // 50B
      initialSupply: "2500000000", // 2.5B (5%)
      year1Remaining: "0", // FULL
      nextMintAvailable: "Year 2 (after Jan 1, 2026)",
      initialSupplyRecipient: "Safe Multisig",
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
    governorProxy: await governorProxy.getAddress()
  };

  const deploymentPath = path.join(__dirname, "..", "deployments", `production-mainnet-${Date.now()}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n=== Deployment Complete ===");
  console.log(`Deployment file: ${deploymentPath}`);
  
  console.log("\nInfrastructure Contracts:");
  console.log(`SecureProxyAdmin: ${await proxyAdmin.getAddress()}`);
  console.log(`HyraProxyDeployer: ${await proxyDeployer.getAddress()}`);
  console.log(`SecureExecutorManager: ${await executorManager.getAddress()}`);
  console.log(`ProxyAdminValidator: ${await proxyAdminValidator.getAddress()}`);
  
  console.log("\nCore Contract Addresses:");
  console.log(`TokenVesting (proxy): ${await vestingProxy.getAddress()}`);
  console.log(`HyraToken (proxy): ${await tokenProxy.getAddress()}`);
  console.log(`HyraTimelock (proxy): ${await timelockProxy.getAddress()}`);
  console.log(`HyraGovernor (proxy): ${await governorProxy.getAddress()}`);
  
  console.log("\nOWNERSHIP:");
  console.log(`   - HyraToken Owner: ${await timelockProxy.getAddress()} (DAO)`);
  console.log(`   - Initial Supply Recipient: ${safeAddress} (Safe Multisig)`);
  console.log(`   - All mint requests must go through DAO governance`);

  console.log("\nTOKENOMICS:");
  console.log(`   - Initial Supply: 2.5B HYRA (5%)`);
  console.log(`   - Minted to: ${safeAddress} (Safe Multisig)`);
  console.log(`   - Year 1 Remaining: 0 (FULL)`);
  console.log(`   WARNING: Cannot mint more until Year 2!`);

  console.log("\nYEAR SCHEDULE:");
  console.log(`   - Year 1 Start: ${yearStartDate.toISOString()}`);
  console.log(`   - Year 2 Start: ${new Date((YEAR_START_TIME + 365 * 24 * 60 * 60) * 1000).toISOString()}`);
  console.log(`   - Mint delay: 2 DAYS`);
  console.log(`   - Timelock delay: 2 DAYS`);
  console.log(`   - Year duration: 365 DAYS`);

  console.log("\nNext steps:");
  console.log("1. Verify contracts on Etherscan");
  console.log("2. Setup Timelock roles and permissions (proposers, executors)");
  console.log("3. Setup multisig roles for ProxyAdmin");
  console.log("4. Configure vesting schedules");
  console.log("5. Test governance by creating a proposal");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

