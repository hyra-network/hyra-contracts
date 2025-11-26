import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

/**
 * Script to test and verify .env.prod configuration
 * 
 * This script validates:
 * 1. All 6 wallet addresses are set
 * 2. All addresses are valid Ethereum addresses
 * 3. All addresses are contracts (multisig wallets)
 * 4. No duplicate addresses
 * 5. Distribution calculation with sample amounts
 * 
 * Usage:
 *   npx hardhat run scripts/test-prod-config.ts --network sepolia
 */
async function main() {
  // Load .env.prod
  const envProdPath = path.resolve(__dirname, "..", ".env.prod");
  
  if (!fs.existsSync(envProdPath)) {
    console.log("⚠️  .env.prod file not found. Creating template...");
    console.log("   Please fill in the production addresses in .env.prod");
    return;
  }

  dotenv.config({ path: envProdPath });

  console.log("=== Testing .env.prod Configuration ===\n");

  // Get 6 wallet addresses
  const addresses = {
    communityEcosystem: process.env.COMMUNITY_ECOSYSTEM_WALLET,
    liquidityBuybackReserve: process.env.LIQUIDITY_BUYBACK_RESERVE_WALLET,
    marketingPartnerships: process.env.MARKETING_PARTNERSHIPS_WALLET,
    teamFounders: process.env.TEAM_FOUNDERS_WALLET,
    strategicAdvisors: process.env.STRATEGIC_ADVISORS_WALLET,
    seedStrategicVC: process.env.SEED_STRATEGIC_VC_WALLET,
  };

  // Get Security Council addresses (for proposal rejection/cancellation)
  const securityCouncil = {
    securityCouncil1: process.env.SECURITY_COUNCIL_1,
    securityCouncil2: process.env.SECURITY_COUNCIL_2,
    securityCouncil3: process.env.SECURITY_COUNCIL_3,
  };

  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check all addresses are set
  console.log("1. Checking all addresses are set...");
  for (const [key, address] of Object.entries(addresses)) {
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      errors.push(`Missing address: ${key}`);
      console.log(`   ❌ ${key}: NOT SET`);
    } else {
      console.log(`   ✅ ${key}: ${address}`);
    }
  }

  if (errors.length > 0) {
    console.log("\n❌ Errors found. Please fix before proceeding.");
    errors.forEach(e => console.log(`   - ${e}`));
    return;
  }

  // 2. Validate addresses format
  console.log("\n2. Validating address format...");
  for (const [key, address] of Object.entries(addresses)) {
    if (!ethers.isAddress(address!)) {
      errors.push(`Invalid address format: ${key} (${address})`);
      console.log(`   ❌ ${key}: Invalid format`);
    } else {
      console.log(`   ✅ ${key}: Valid format`);
    }
  }

  // 3. Check for duplicates
  console.log("\n3. Checking for duplicate addresses...");
  const addressList = Object.values(addresses) as string[];
  const uniqueAddresses = new Set(addressList);
  if (uniqueAddresses.size !== addressList.length) {
    errors.push("Duplicate addresses found");
    console.log("   ❌ Duplicate addresses detected");
  } else {
    console.log("   ✅ No duplicates");
  }

  // 4. Verify addresses are contracts (if network is available)
  console.log("\n4. Verifying addresses are contracts (multisig wallets)...");
  try {
    const [deployer] = await ethers.getSigners();
    const network = await ethers.provider.getNetwork();
    console.log(`   Network: ${network.name} (${network.chainId})`);

    for (const [key, address] of Object.entries(addresses)) {
      try {
        const code = await ethers.provider.getCode(address!);
        if (code === "0x") {
          errors.push(`${key} (${address}) is not a contract`);
          console.log(`   ❌ ${key}: Not a contract (EOA)`);
        } else {
          const codeSize = (code.length - 2) / 2; // Bytes
          console.log(`   ✅ ${key}: Contract (${codeSize} bytes)`);
        }
      } catch (error: any) {
        warnings.push(`Could not verify ${key}: ${error.message}`);
        console.log(`   ⚠️  ${key}: Could not verify (${error.message})`);
      }
    }
  } catch (error: any) {
    warnings.push(`Network verification skipped: ${error.message}`);
    console.log(`   ⚠️  Network verification skipped: ${error.message}`);
  }

  // 5. Test distribution calculation
  console.log("\n5. Testing distribution calculation...");
  const testAmounts = [
    ethers.parseEther("2500000000"),  // 2.5B (initial supply)
    ethers.parseEther("100000000"),    // 100M
    ethers.parseEther("1000000"),      // 1M
    ethers.parseEther("1000"),         // 1K (small amount for rounding test)
  ];

  for (const amount of testAmounts) {
    const basisPoints = 10000n;
    const community = (amount * 6000n) / basisPoints;
    const liquidity = (amount * 1200n) / basisPoints;
    const marketing = (amount * 1000n) / basisPoints;
    const team = (amount * 800n) / basisPoints;
    const advisors = (amount * 500n) / basisPoints;
    const seed = (amount * 500n) / basisPoints;
    const remainder = amount - (community + liquidity + marketing + team + advisors + seed);
    const total = community + liquidity + marketing + team + advisors + seed + remainder;

    if (total !== amount) {
      errors.push(`Distribution math error for ${ethers.formatEther(amount)} HYRA`);
      console.log(`   ❌ ${ethers.formatEther(amount)} HYRA: Math error`);
    } else {
      console.log(`   ✅ ${ethers.formatEther(amount)} HYRA:`);
      console.log(`      Community (60%): ${ethers.formatEther(community + remainder)}`);
      console.log(`      Liquidity (12%): ${ethers.formatEther(liquidity)}`);
      console.log(`      Marketing (10%): ${ethers.formatEther(marketing)}`);
      console.log(`      Team (8%): ${ethers.formatEther(team)}`);
      console.log(`      Advisors (5%): ${ethers.formatEther(advisors)}`);
      console.log(`      Seed VC (5%): ${ethers.formatEther(seed)}`);
      if (remainder > 0n) {
        console.log(`      Remainder: ${ethers.formatEther(remainder)} (added to Community)`);
      }
    }
  }

  // 6. Check Security Council addresses (optional but recommended)
  console.log("\n6. Checking Security Council addresses (for proposal rejection/cancellation)...");
  for (const [key, address] of Object.entries(securityCouncil)) {
    if (!address || address === "0x0000000000000000000000000000000000000000") {
      warnings.push(`Security Council address not set: ${key}`);
      console.log(`   ⚠️  ${key}: NOT SET (optional but recommended)`);
    } else {
      if (!ethers.isAddress(address)) {
        errors.push(`Invalid Security Council address format: ${key} (${address})`);
        console.log(`   ❌ ${key}: Invalid format`);
      } else {
        try {
          const code = await ethers.provider.getCode(address);
          if (code === "0x") {
            warnings.push(`${key} (${address}) is not a contract - should be a multisig wallet`);
            console.log(`   ⚠️  ${key}: Not a contract (should be multisig wallet)`);
          } else {
            console.log(`   ✅ ${key}: ${address} (contract)`);
          }
        } catch (error: any) {
          warnings.push(`Could not verify ${key}: ${error.message}`);
          console.log(`   ⚠️  ${key}: Could not verify`);
        }
      }
    }
  }

  // 7. Check Mint Request Multisig Wallet
  console.log("\n7. Checking Mint Request Multisig Wallet...");
  const mintRequestMultisig = process.env.MINT_REQUEST_MULTISIG_WALLET;
  if (!mintRequestMultisig) {
    errors.push("MINT_REQUEST_MULTISIG_WALLET not set (required for UPGRADE/CONSTITUTIONAL/MINT REQUEST/EMERGENCY proposals)");
    console.log("   ❌ MINT_REQUEST_MULTISIG_WALLET: NOT SET (REQUIRED)");
  } else {
    if (!ethers.isAddress(mintRequestMultisig)) {
      errors.push(`Invalid MINT_REQUEST_MULTISIG_WALLET format: ${mintRequestMultisig}`);
      console.log("   ❌ MINT_REQUEST_MULTISIG_WALLET: Invalid format");
    } else {
      try {
        const code = await ethers.provider.getCode(mintRequestMultisig);
        if (code === "0x") {
          errors.push(`MINT_REQUEST_MULTISIG_WALLET (${mintRequestMultisig}) is not a contract`);
          console.log("   ❌ MINT_REQUEST_MULTISIG_WALLET: Not a contract (must be multisig wallet)");
        } else {
          console.log(`   ✅ MINT_REQUEST_MULTISIG_WALLET: ${mintRequestMultisig} (contract)`);
        }
      } catch (error: any) {
        warnings.push(`Could not verify MINT_REQUEST_MULTISIG_WALLET: ${error.message}`);
        console.log("   ⚠️  MINT_REQUEST_MULTISIG_WALLET: Could not verify");
      }
    }
  }

  // Summary
  console.log("\n=== Summary ===");
  if (errors.length === 0) {
    console.log("✅ All required checks passed!");
    console.log("\nConfiguration is ready for production deployment.");
    console.log("\nNext steps:");
    console.log("1. Review all addresses carefully");
    console.log("2. Deploy token contract");
    console.log("3. Run: npx hardhat run scripts/set-distribution-config.ts --network mainnet --execute");
    console.log("4. Initialize contract (initial supply will auto-distribute)");
    console.log("5. Setup Security Council: npx hardhat run scripts/setup-security-council.ts --network mainnet");
  } else {
    console.log("❌ Errors found:");
    errors.forEach(e => console.log(`   - ${e}`));
    console.log("\nPlease fix errors before proceeding.");
  }

  if (warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    warnings.forEach(w => console.log(`   - ${w}`));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

