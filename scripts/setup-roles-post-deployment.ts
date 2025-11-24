import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * # 1. Set Security Council addresses trong .env
 * export SECURITY_COUNCIL_ADDRESSES="0x123...,0x456...,0x789..."
 * # 2. Chạy script
 * npx hardhat run scripts/setup-roles-post-deployment.ts --network mainnet
 * Setup Roles After Deployment
 * 
 * This script sets up all roles after contracts have been deployed using deploy-mainnet-production.ts
 * It configures:
 * - Timelock roles (PROPOSER, EXECUTOR, CANCELLER)
 * - SecureProxyAdmin roles
 * - SecureExecutorManager roles
 * - ProxyAdminValidator roles
 * - Handover roles from deployer to Timelock
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");
  
  console.log("\n=== Setting Up Roles After Deployment ===\n");
  
  // Load deployment info
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    throw new Error("Deployments directory not found");
  }
  
  const deploymentFiles = fs.readdirSync(deploymentsDir)
    .filter(f => f.startsWith("production-mainnet-") && f.endsWith(".json"))
    .sort()
    .reverse();
  
  if (deploymentFiles.length === 0) {
    throw new Error("No production-mainnet deployment file found. Please run deploy-mainnet-production.ts first.");
  }
  
  const deploymentFile = deploymentFiles[0];
  console.log(`Loading deployment from: ${deploymentFile}`);
  
  const deployment = JSON.parse(
    fs.readFileSync(
      path.join(deploymentsDir, deploymentFile),
      "utf-8"
    )
  );
  
  // Extract addresses
  const timelockAddress = deployment.timelockProxy;
  const governorAddress = deployment.governorProxy;
  const executorManagerAddress = deployment.infra.secureExecutorManager;
  const proxyAdminAddress = deployment.infra.secureProxyAdmin;
  const proxyAdminValidatorAddress = deployment.infra.proxyAdminValidator;
  const tokenAddress = deployment.tokenProxy;
  const vestingAddress = deployment.vestingProxy;
  
  console.log("\nDeployment Addresses:");
  console.log(`  Timelock: ${timelockAddress}`);
  console.log(`  Governor: ${governorAddress}`);
  console.log(`  ExecutorManager: ${executorManagerAddress}`);
  console.log(`  ProxyAdmin: ${proxyAdminAddress}`);
  console.log(`  ProxyAdminValidator: ${proxyAdminValidatorAddress}`);
  console.log(`  Token: ${tokenAddress}`);
  console.log(`  Vesting: ${vestingAddress}`);
  
  // Get Security Council addresses from .env
  const securityCouncilAddresses = process.env.SECURITY_COUNCIL_ADDRESSES?.split(",")
    .map(addr => addr.trim())
    .filter(addr => addr.length > 0) || [];
  
  if (securityCouncilAddresses.length === 0) {
    console.log("\n⚠️  WARNING: SECURITY_COUNCIL_ADDRESSES not set in .env");
    console.log("   CANCELLER_ROLE will not be granted to Security Council members");
    console.log("   Set SECURITY_COUNCIL_ADDRESSES=addr1,addr2,addr3,... in .env file");
  } else {
    console.log(`\nSecurity Council Members (${securityCouncilAddresses.length}):`);
    securityCouncilAddresses.forEach((addr, i) => {
      console.log(`  ${i + 1}. ${addr}`);
    });
  }
  
  // ============ 1. Setup Timelock Roles ============
  console.log("\n=== 1. Setting up Timelock roles ===");
  const timelock = await ethers.getContractAt("HyraTimelock", timelockAddress);
  
  // Get role identifiers
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
  const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  
  // Grant PROPOSER_ROLE to Governor
  console.log("\n1.1. Granting PROPOSER_ROLE to Governor...");
  try {
    if (await timelock.hasRole(PROPOSER_ROLE, governorAddress)) {
      console.log("   ⚠️  PROPOSER_ROLE already granted to Governor");
    } else {
      const tx = await timelock.grantRole(PROPOSER_ROLE, governorAddress);
      await tx.wait();
      console.log(`   ✅ PROPOSER_ROLE granted to Governor: ${governorAddress}`);
      console.log(`      Tx: ${tx.hash}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant PROPOSER_ROLE: ${error.message}`);
    throw error;
  }
  
  // Grant EXECUTOR_ROLE to SecureExecutorManager
  console.log("\n1.2. Granting EXECUTOR_ROLE to SecureExecutorManager...");
  try {
    if (await timelock.hasRole(EXECUTOR_ROLE, executorManagerAddress)) {
      console.log("   ⚠️  EXECUTOR_ROLE already granted to SecureExecutorManager");
    } else {
      const tx = await timelock.grantRole(EXECUTOR_ROLE, executorManagerAddress);
      await tx.wait();
      console.log(`   ✅ EXECUTOR_ROLE granted to SecureExecutorManager: ${executorManagerAddress}`);
      console.log(`      Tx: ${tx.hash}`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant EXECUTOR_ROLE: ${error.message}`);
    throw error;
  }
  
  // Grant CANCELLER_ROLE to Security Council members
  if (securityCouncilAddresses.length > 0) {
    console.log("\n1.3. Granting CANCELLER_ROLE to Security Council members...");
    for (let i = 0; i < securityCouncilAddresses.length; i++) {
      const member = securityCouncilAddresses[i];
      try {
        if (await timelock.hasRole(CANCELLER_ROLE, member)) {
          console.log(`   ⚠️  CANCELLER_ROLE already granted to member ${i + 1}: ${member}`);
        } else {
          const tx = await timelock.grantRole(CANCELLER_ROLE, member);
          await tx.wait();
          console.log(`   ✅ CANCELLER_ROLE granted to Security Council member ${i + 1}: ${member}`);
          console.log(`      Tx: ${tx.hash}`);
        }
      } catch (error: any) {
        console.log(`   ❌ Failed to grant CANCELLER_ROLE to ${member}: ${error.message}`);
        // Continue with other members
      }
    }
  }
  
  // Revoke temporary roles from deployer
  console.log("\n1.4. Revoking temporary roles from deployer...");
  const deployerAddress = await deployer.getAddress();
  
  try {
    if (await timelock.hasRole(PROPOSER_ROLE, deployerAddress)) {
      const tx = await timelock.revokeRole(PROPOSER_ROLE, deployerAddress);
      await tx.wait();
      console.log(`   ✅ PROPOSER_ROLE revoked from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  Deployer does not have PROPOSER_ROLE`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not revoke PROPOSER_ROLE: ${error.message}`);
  }
  
  try {
    if (await timelock.hasRole(EXECUTOR_ROLE, deployerAddress)) {
      const tx = await timelock.revokeRole(EXECUTOR_ROLE, deployerAddress);
      await tx.wait();
      console.log(`   ✅ EXECUTOR_ROLE revoked from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  Deployer does not have EXECUTOR_ROLE`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not revoke EXECUTOR_ROLE: ${error.message}`);
  }
  
  // Renounce admin role (if deployer is admin)
  console.log("\n1.5. Renouncing admin role from deployer...");
  try {
    if (await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress)) {
      const tx = await timelock.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress);
      await tx.wait();
      console.log(`   ✅ Admin role renounced from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  Deployer does not have DEFAULT_ADMIN_ROLE`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not renounce admin role: ${error.message}`);
  }
  
  // ============ 2. Setup SecureProxyAdmin Roles ============
  console.log("\n=== 2. Setting up SecureProxyAdmin roles ===");
  const proxyAdmin = await ethers.getContractAt("SecureProxyAdmin", proxyAdminAddress);
  
  const SPA_ADMIN = await proxyAdmin.DEFAULT_ADMIN_ROLE();
  const SPA_GOV = await proxyAdmin.GOVERNANCE_ROLE();
  const SPA_MULTI = await proxyAdmin.MULTISIG_ROLE();
  
  // Grant roles to Timelock
  console.log("\n2.1. Granting SecureProxyAdmin roles to Timelock...");
  
  try {
    if (!(await proxyAdmin.hasRole(SPA_ADMIN, timelockAddress))) {
      const tx = await proxyAdmin.grantRole(SPA_ADMIN, timelockAddress);
      await tx.wait();
      console.log(`   ✅ DEFAULT_ADMIN_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  DEFAULT_ADMIN_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant DEFAULT_ADMIN_ROLE: ${error.message}`);
    throw error;
  }
  
  try {
    if (!(await proxyAdmin.hasRole(SPA_GOV, timelockAddress))) {
      const tx = await proxyAdmin.grantRole(SPA_GOV, timelockAddress);
      await tx.wait();
      console.log(`   ✅ GOVERNANCE_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  GOVERNANCE_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant GOVERNANCE_ROLE: ${error.message}`);
    throw error;
  }
  
  try {
    if (!(await proxyAdmin.hasRole(SPA_MULTI, timelockAddress))) {
      const tx = await proxyAdmin.grantRole(SPA_MULTI, timelockAddress);
      await tx.wait();
      console.log(`   ✅ MULTISIG_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  MULTISIG_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant MULTISIG_ROLE: ${error.message}`);
    throw error;
  }
  
  // Transfer ownership to Timelock
  console.log("\n2.2. Transferring SecureProxyAdmin ownership to Timelock...");
  try {
    const currentOwner = await proxyAdmin.owner();
    if (currentOwner.toLowerCase() !== timelockAddress.toLowerCase()) {
      const tx = await proxyAdmin.transferOwnership(timelockAddress);
      await tx.wait();
      console.log(`   ✅ SecureProxyAdmin ownership transferred to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  SecureProxyAdmin already owned by Timelock`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not transfer ownership: ${error.message}`);
  }
  
  // ============ 3. Setup SecureExecutorManager Roles ============
  console.log("\n=== 3. Setting up SecureExecutorManager roles ===");
  const executorManager = await ethers.getContractAt("SecureExecutorManager", executorManagerAddress);
  
  const SEM_ADMIN = await executorManager.DEFAULT_ADMIN_ROLE();
  const SEM_MANAGER = await executorManager.MANAGER_ROLE();
  const SEM_EMERGENCY = await executorManager.EMERGENCY_ROLE();
  
  // Grant roles to Timelock
  console.log("\n3.1. Granting SecureExecutorManager roles to Timelock...");
  
  try {
    if (!(await executorManager.hasRole(SEM_ADMIN, timelockAddress))) {
      const tx = await executorManager.grantRole(SEM_ADMIN, timelockAddress);
      await tx.wait();
      console.log(`   ✅ DEFAULT_ADMIN_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  DEFAULT_ADMIN_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant DEFAULT_ADMIN_ROLE: ${error.message}`);
    throw error;
  }
  
  try {
    if (!(await executorManager.hasRole(SEM_MANAGER, timelockAddress))) {
      const tx = await executorManager.grantRole(SEM_MANAGER, timelockAddress);
      await tx.wait();
      console.log(`   ✅ MANAGER_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  MANAGER_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant MANAGER_ROLE: ${error.message}`);
    throw error;
  }
  
  try {
    if (!(await executorManager.hasRole(SEM_EMERGENCY, timelockAddress))) {
      const tx = await executorManager.grantRole(SEM_EMERGENCY, timelockAddress);
      await tx.wait();
      console.log(`   ✅ EMERGENCY_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  EMERGENCY_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant EMERGENCY_ROLE: ${error.message}`);
    throw error;
  }
  
  // Renounce deployer roles
  console.log("\n3.2. Renouncing deployer roles from SecureExecutorManager...");
  try {
    if (await executorManager.hasRole(SEM_MANAGER, deployerAddress)) {
      const tx = await executorManager.renounceRole(SEM_MANAGER, deployerAddress);
      await tx.wait();
      console.log(`   ✅ MANAGER_ROLE renounced from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not renounce MANAGER_ROLE: ${error.message}`);
  }
  
  try {
    if (await executorManager.hasRole(SEM_EMERGENCY, deployerAddress)) {
      const tx = await executorManager.renounceRole(SEM_EMERGENCY, deployerAddress);
      await tx.wait();
      console.log(`   ✅ EMERGENCY_ROLE renounced from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not renounce EMERGENCY_ROLE: ${error.message}`);
  }
  
  try {
    if (await executorManager.hasRole(SEM_ADMIN, deployerAddress)) {
      const tx = await executorManager.renounceRole(SEM_ADMIN, deployerAddress);
      await tx.wait();
      console.log(`   ✅ DEFAULT_ADMIN_ROLE renounced from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not renounce DEFAULT_ADMIN_ROLE: ${error.message}`);
  }
  
  // ============ 4. Setup ProxyAdminValidator Roles ============
  console.log("\n=== 4. Setting up ProxyAdminValidator roles ===");
  const proxyAdminValidator = await ethers.getContractAt("ProxyAdminValidator", proxyAdminValidatorAddress);
  
  const PAV_ADMIN = await proxyAdminValidator.DEFAULT_ADMIN_ROLE();
  const PAV_VALIDATOR = await proxyAdminValidator.VALIDATOR_ROLE();
  
  // Grant roles to Timelock
  console.log("\n4.1. Granting ProxyAdminValidator roles to Timelock...");
  
  try {
    if (!(await proxyAdminValidator.hasRole(PAV_ADMIN, timelockAddress))) {
      const tx = await proxyAdminValidator.grantRole(PAV_ADMIN, timelockAddress);
      await tx.wait();
      console.log(`   ✅ DEFAULT_ADMIN_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  DEFAULT_ADMIN_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant DEFAULT_ADMIN_ROLE: ${error.message}`);
    throw error;
  }
  
  try {
    if (!(await proxyAdminValidator.hasRole(PAV_VALIDATOR, timelockAddress))) {
      const tx = await proxyAdminValidator.grantRole(PAV_VALIDATOR, timelockAddress);
      await tx.wait();
      console.log(`   ✅ VALIDATOR_ROLE granted to Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  VALIDATOR_ROLE already granted to Timelock`);
    }
  } catch (error: any) {
    console.log(`   ❌ Failed to grant VALIDATOR_ROLE: ${error.message}`);
    throw error;
  }
  
  // Renounce deployer roles
  console.log("\n4.2. Renouncing deployer roles from ProxyAdminValidator...");
  try {
    if (await proxyAdminValidator.hasRole(PAV_VALIDATOR, deployerAddress)) {
      const tx = await proxyAdminValidator.renounceRole(PAV_VALIDATOR, deployerAddress);
      await tx.wait();
      console.log(`   ✅ VALIDATOR_ROLE renounced from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not renounce VALIDATOR_ROLE: ${error.message}`);
  }
  
  try {
    if (await proxyAdminValidator.hasRole(PAV_ADMIN, deployerAddress)) {
      const tx = await proxyAdminValidator.renounceRole(PAV_ADMIN, deployerAddress);
      await tx.wait();
      console.log(`   ✅ DEFAULT_ADMIN_ROLE renounced from deployer`);
      console.log(`      Tx: ${tx.hash}`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not renounce DEFAULT_ADMIN_ROLE: ${error.message}`);
  }
  
  // ============ 5. Authorize ProxyAdmin in Validator ============
  console.log("\n=== 5. Authorizing ProxyAdmin in Validator ===");
  try {
    const tx = await proxyAdminValidator.authorizeProxyAdmin(
      proxyAdminAddress,
      "HyraDAO SecureProxyAdmin",
      timelockAddress,
      "Main proxy admin for Hyra DAO system"
    );
    await tx.wait();
    console.log(`   ✅ ProxyAdmin authorized in Validator`);
    console.log(`      Tx: ${tx.hash}`);
  } catch (error: any) {
    if (error.message.includes("already authorized") || error.message.includes("ProxyAdminAlreadyAuthorized")) {
      console.log(`   ⚠️  ProxyAdmin already authorized`);
    } else {
      console.log(`   ❌ Failed to authorize ProxyAdmin: ${error.message}`);
      throw error;
    }
  }
  
  // ============ 6. Setup Timelock Executor Manager and Validator ============
  console.log("\n=== 6. Configuring Timelock ===");
  try {
    const currentExecutorManager = await timelock.executorManager();
    if (currentExecutorManager.toLowerCase() !== executorManagerAddress.toLowerCase()) {
      const tx = await timelock.setExecutorManager(executorManager);
      await tx.wait();
      console.log(`   ✅ ExecutorManager set in Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  ExecutorManager already set`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not set ExecutorManager: ${error.message}`);
  }
  
  try {
    const currentValidator = await timelock.proxyAdminValidator();
    if (currentValidator.toLowerCase() !== proxyAdminValidatorAddress.toLowerCase()) {
      const tx = await timelock.setProxyAdminValidator(proxyAdminValidator);
      await tx.wait();
      console.log(`   ✅ ProxyAdminValidator set in Timelock`);
      console.log(`      Tx: ${tx.hash}`);
    } else {
      console.log(`   ⚠️  ProxyAdminValidator already set`);
    }
  } catch (error: any) {
    console.log(`   ⚠️  Could not set ProxyAdminValidator: ${error.message}`);
  }
  
  // ============ 7. Add Proxies to SecureProxyAdmin ============
  console.log("\n=== 7. Adding proxies to SecureProxyAdmin ===");
  
  const proxies = [
    { address: tokenAddress, name: "HyraToken" },
    { address: governorAddress, name: "HyraGovernor" },
    { address: timelockAddress, name: "HyraTimelock" },
    { address: vestingAddress, name: "TokenVesting" }
  ];
  
  for (const proxy of proxies) {
    try {
      const isManaged = await proxyAdmin._isManaged(proxy.address);
      if (!isManaged) {
        const tx = await proxyAdmin.addProxy(proxy.address, proxy.name);
        await tx.wait();
        console.log(`   ✅ Added ${proxy.name} (${proxy.address})`);
        console.log(`      Tx: ${tx.hash}`);
      } else {
        console.log(`   ⚠️  ${proxy.name} already added`);
      }
    } catch (error: any) {
      console.log(`   ⚠️  Could not add ${proxy.name}: ${error.message}`);
    }
  }
  
  // ============ Summary ============
  console.log("\n=== Role Setup Complete ===");
  console.log("\n✅ All roles have been configured!");
  console.log("\nSummary:");
  console.log(`  - Timelock roles: PROPOSER (Governor), EXECUTOR (ExecutorManager), CANCELLER (Security Council)`);
  console.log(`  - SecureProxyAdmin: All roles granted to Timelock`);
  console.log(`  - SecureExecutorManager: All roles granted to Timelock`);
  console.log(`  - ProxyAdminValidator: All roles granted to Timelock`);
  console.log(`  - Proxies added to SecureProxyAdmin`);
  
  console.log("\n⚠️  Next Steps:");
  console.log("1. Deploy DAORoleManager (if needed)");
  console.log("2. Set roleManager in Governor (via governance proposal)");
  console.log("3. Add Security Council members to Governor (via governance proposal)");
  console.log("4. Grant GOVERNANCE_ROLE (via governance proposal)");
  console.log("\n📝 Note: Some steps require governance proposals and cannot be done directly.");
}

main().catch((error) => {
  console.error("\n❌ Error during role setup:");
  console.error(error);
  process.exitCode = 1;
});

