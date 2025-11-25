import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

/**
 * Script to set distribution configuration for HyraToken
 * 
 * This script reads 6 multisig wallet addresses from .env or .env.prod
 * and calls setDistributionConfig() on the token contract.
 * 
 * IMPORTANT: This can only be called ONCE. Addresses are immutable after set.
 * 
 * Usage:
 *   npx hardhat run scripts/set-distribution-config.ts --network sepolia
 *   ENV_FILE=.env.prod npx hardhat run scripts/set-distribution-config.ts --network mainnet
 */
async function main() {
  // Load environment variables
  const envFile = process.env.ENV_FILE || ".env";
  dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH\n");

  // Get token address
  const tokenAddress = process.env.TOKEN_ADDRESS;
  if (!tokenAddress) {
    throw new Error("TOKEN_ADDRESS environment variable not set. Please set it to the deployed token proxy address.");
  }

  console.log("Token Address:", tokenAddress);

  // Get 6 wallet addresses from environment
  const addresses = {
    communityEcosystem: process.env.COMMUNITY_ECOSYSTEM_WALLET,
    liquidityBuybackReserve: process.env.LIQUIDITY_BUYBACK_RESERVE_WALLET,
    marketingPartnerships: process.env.MARKETING_PARTNERSHIPS_WALLET,
    teamFounders: process.env.TEAM_FOUNDERS_WALLET,
    strategicAdvisors: process.env.STRATEGIC_ADVISORS_WALLET,
    seedStrategicVC: process.env.SEED_STRATEGIC_VC_WALLET,
  };

  // Validate all addresses are set
  const missing = Object.entries(addresses)
    .filter(([_, address]) => !address || address === "0x0000000000000000000000000000000000000000")
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing wallet addresses in ${envFile}: ${missing.join(", ")}`);
  }

  // Validate all addresses are valid
  for (const [key, address] of Object.entries(addresses)) {
    if (!ethers.isAddress(address!)) {
      throw new Error(`Invalid address for ${key}: ${address}`);
    }
  }

  // Check for duplicates
  const addressList = Object.values(addresses) as string[];
  const uniqueAddresses = new Set(addressList);
  if (uniqueAddresses.size !== addressList.length) {
    throw new Error("Duplicate addresses found in configuration");
  }

  console.log("\n=== Distribution Configuration ===");
  console.log("Community & Ecosystem (60%):", addresses.communityEcosystem);
  console.log("Liquidity, Buyback & Reserve (12%):", addresses.liquidityBuybackReserve);
  console.log("Marketing & Partnerships (10%):", addresses.marketingPartnerships);
  console.log("Team & Founders (8%):", addresses.teamFounders);
  console.log("Strategic Advisors (5%):", addresses.strategicAdvisors);
  console.log("Seed & Strategic VC (5%):", addresses.seedStrategicVC);

  // Verify addresses are contracts (multisig wallets)
  console.log("\n=== Verifying Addresses are Contracts ===");
  for (const [key, address] of Object.entries(addresses)) {
    const code = await ethers.provider.getCode(address!);
    if (code === "0x") {
      throw new Error(`${key} (${address}) is not a contract. All addresses must be multisig wallets.`);
    }
    console.log(`✅ ${key}: ${address} (contract)`);
  }

  // Get token contract
  const token = await ethers.getContractAt("HyraToken", tokenAddress);

  // Check if config is already set
  const configSet = await token.configSet();
  if (configSet) {
    console.log("\n⚠️  WARNING: Distribution config is already set!");
    console.log("   This function can only be called once.");
    console.log("   Addresses are immutable after being set.");
    
    // Show current config
    const currentConfig = await token.distributionConfig();
    console.log("\nCurrent Configuration:");
    console.log("  Community & Ecosystem:", currentConfig.communityEcosystem);
    console.log("  Liquidity, Buyback & Reserve:", currentConfig.liquidityBuybackReserve);
    console.log("  Marketing & Partnerships:", currentConfig.marketingPartnerships);
    console.log("  Team & Founders:", currentConfig.teamFounders);
    console.log("  Strategic Advisors:", currentConfig.strategicAdvisors);
    console.log("  Seed & Strategic VC:", currentConfig.seedStrategicVC);
    
    throw new Error("Distribution config already set. Cannot update.");
  }

  console.log("\n=== Setting Distribution Config ===");
  console.log("⚠️  IMPORTANT: This can only be done ONCE. Addresses will be immutable after this.");
  
  if (!process.argv.includes("--execute")) {
    console.log("\n💡 To execute, run with --execute flag:");
    console.log("   npx hardhat run scripts/set-distribution-config.ts --network sepolia --execute");
    return;
  }

  // Set distribution config
  const tx = await token.setDistributionConfig(
    addresses.communityEcosystem!,
    addresses.liquidityBuybackReserve!,
    addresses.marketingPartnerships!,
    addresses.teamFounders!,
    addresses.strategicAdvisors!,
    addresses.seedStrategicVC!
  );

  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();
  console.log("✅ Distribution config set successfully!");
  console.log("   Block:", receipt?.blockNumber);
  console.log("   Gas used:", receipt?.gasUsed.toString());

  // Verify config
  const newConfig = await token.distributionConfig();
  const newConfigSet = await token.configSet();
  
  console.log("\n=== Verification ===");
  console.log("Config Set:", newConfigSet);
  console.log("Community & Ecosystem:", newConfig.communityEcosystem);
  console.log("Liquidity, Buyback & Reserve:", newConfig.liquidityBuybackReserve);
  console.log("Marketing & Partnerships:", newConfig.marketingPartnerships);
  console.log("Team & Founders:", newConfig.teamFounders);
  console.log("Strategic Advisors:", newConfig.strategicAdvisors);
  console.log("Seed & Strategic VC:", newConfig.seedStrategicVC);

  console.log("\n✅ Distribution configuration completed!");
  console.log("⚠️  REMEMBER: Addresses are now IMMUTABLE. Cannot be changed.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

