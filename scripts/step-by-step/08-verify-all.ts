import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Step 8: Verify All Deployed Contracts
 * Reads deployment files and verifies contracts on block explorer
 */

async function verifyContract(address: string, constructorArgs: any[], contractName: string) {
  console.log(`\nVerifying ${contractName} at ${address}...`);
  try {
    await run("verify:verify", {
      address: address,
      constructorArguments: constructorArgs,
    });
    console.log(`   ✓ ${contractName} verified`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log(`   ✓ ${contractName} already verified`);
    } else {
      console.log(`   ✗ ${contractName} verification failed: ${error.message}`);
    }
  }
}

async function main() {
  console.log("\n=== Step 8: Verifying All Contracts ===\n");

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");

  // Read all deployment files
  const files = fs.readdirSync(deploymentsDir).filter(f => f.endsWith('.json')).sort();
  
  if (files.length === 0) {
    throw new Error("No deployment files found in deployments/step-by-step/");
  }

  console.log(`Found ${files.length} deployment files\n`);

  // Get latest deployment of each step
  const latestDeployments: { [key: string]: any } = {};
  for (const file of files) {
    const content = JSON.parse(fs.readFileSync(path.join(deploymentsDir, file), 'utf-8'));
    const step = content.step;
    latestDeployments[step] = content;
  }

  const infra = latestDeployments['01-infrastructure'];
  const timelock = latestDeployments['02-timelock'];
  const vesting = latestDeployments['03-vesting'];
  const token = latestDeployments['04-token'];
  const governor = latestDeployments['06-governor'];

  console.log("=== Verifying Infrastructure Contracts ===\n");

  // 1. Verify SecureProxyAdmin
  await verifyContract(
    infra.contracts.secureProxyAdmin,
    [infra.deployer, 1], // constructor(address _admin, uint256 _requiredSignatures)
    "SecureProxyAdmin"
  );

  // 2. Verify HyraProxyDeployer
  await verifyContract(
    infra.contracts.hyraProxyDeployer,
    [], // no constructor args
    "HyraProxyDeployer"
  );

  // 3. Verify SecureExecutorManager
  await verifyContract(
    infra.contracts.secureExecutorManager,
    [], // no constructor args (uses initializer)
    "SecureExecutorManager"
  );

  // 4. Verify ProxyAdminValidator
  await verifyContract(
    infra.contracts.proxyAdminValidator,
    [], // no constructor args (uses initializer)
    "ProxyAdminValidator"
  );

  console.log("\n=== Verifying Timelock Contracts ===\n");

  // 5. Verify Timelock Implementation
  await verifyContract(
    timelock.contracts.timelockImpl,
    [], // no constructor args (uses initializer)
    "HyraTimelock Implementation"
  );

  // 6. Verify Timelock Proxy (ERC1967Proxy)
  await verifyContract(
    timelock.contracts.timelockProxy,
    [
      timelock.contracts.timelockImpl,
      "0x" // initialization data is encoded, just use 0x
    ],
    "Timelock Proxy (ERC1967Proxy)"
  );

  console.log("\n=== Verifying Vesting Contracts ===\n");

  // 7. Verify Vesting Implementation
  await verifyContract(
    vesting.contracts.vestingImpl,
    [], // no constructor args (uses initializer)
    "TokenVesting Implementation"
  );

  // 8. Verify Vesting Proxy
  await verifyContract(
    vesting.contracts.vestingProxy,
    [
      vesting.contracts.vestingImpl,
      "0x" // empty initialization data
    ],
    "Vesting Proxy (ERC1967Proxy)"
  );

  console.log("\n=== Verifying Token Contracts ===\n");

  // 9. Verify Token Implementation
  await verifyContract(
    token.contracts.tokenImpl,
    [], // no constructor args (uses initializer)
    "HyraToken Implementation"
  );

  // 10. Verify Token Proxy
  await verifyContract(
    token.contracts.tokenProxy,
    [
      token.contracts.tokenImpl,
      "0x" // initialization data is encoded
    ],
    "Token Proxy (ERC1967Proxy)"
  );

  console.log("\n=== Verifying Governor Contracts ===\n");

  // 11. Verify Governor Implementation
  await verifyContract(
    governor.contracts.governorImpl,
    [], // no constructor args (uses initializer)
    "HyraGovernor Implementation"
  );

  // 12. Verify Governor Proxy
  await verifyContract(
    governor.contracts.governorProxy,
    [
      governor.contracts.governorImpl,
      "0x" // initialization data is encoded
    ],
    "Governor Proxy (ERC1967Proxy)"
  );

  console.log("\n=== Verification Complete ===\n");

  console.log("Verified Contract Addresses:");
  console.log("\nInfrastructure:");
  console.log(`  SecureProxyAdmin:       ${infra.contracts.secureProxyAdmin}`);
  console.log(`  HyraProxyDeployer:      ${infra.contracts.hyraProxyDeployer}`);
  console.log(`  SecureExecutorManager:  ${infra.contracts.secureExecutorManager}`);
  console.log(`  ProxyAdminValidator:    ${infra.contracts.proxyAdminValidator}`);

  console.log("\nCore Contracts (Proxies):");
  console.log(`  HyraTimelock:  ${timelock.contracts.timelockProxy}`);
  console.log(`  TokenVesting:  ${vesting.contracts.vestingProxy}`);
  console.log(`  HyraToken:     ${token.contracts.tokenProxy}`);
  console.log(`  HyraGovernor:  ${governor.contracts.governorProxy}`);

  console.log("\nBlock Explorer Links:");
  const explorer = "https://sepolia.basescan.org/address";
  console.log(`  Token:     ${explorer}/${token.contracts.tokenProxy}#code`);
  console.log(`  Timelock:  ${explorer}/${timelock.contracts.timelockProxy}#code`);
  console.log(`  Governor:  ${explorer}/${governor.contracts.governorProxy}#code`);
  console.log(`  Vesting:   ${explorer}/${vesting.contracts.vestingProxy}#code`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

