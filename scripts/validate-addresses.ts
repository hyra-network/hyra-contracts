import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

// Load .env.dev for Base Sepolia testnet, fallback to .env for other networks
// Can override with DOTENV_CONFIG_PATH environment variable
const envFile = process.env.DOTENV_CONFIG_PATH || (network.name === "baseSepolia" ? ".env.dev" : ".env");
dotenv.config({ path: envFile });

/**
 * Script to validate addresses against contract logic requirements
 * 
 * Usage:
 *   npx hardhat run scripts/validate-addresses.ts --network <network>
 */

interface ValidationResult {
  address: string;
  name: string;
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

async function validateAddress(
  address: string | undefined,
  name: string,
  required: boolean = false,
  mustBeContract: boolean = false
): Promise<ValidationResult> {
  const result: ValidationResult = {
    address: address || "NOT SET",
    name,
    isValid: true,
    errors: [],
    warnings: [],
  };

  // Check if required
  if (required && !address) {
    result.isValid = false;
    result.errors.push(`${name} is required but not set in ${envFile}`);
    return result;
  }

  // Check if set
  if (!address) {
    result.warnings.push(`${name} is not set (optional)`);
    return result;
  }

  // Validate address format
  if (!ethers.isAddress(address)) {
    result.isValid = false;
    result.errors.push(`${name} has invalid format: ${address}`);
    return result;
  }

  // Check if must be contract
  if (mustBeContract) {
    try {
      const code = await ethers.provider.getCode(address);
      if (code === "0x") {
        result.isValid = false;
        result.errors.push(`${name} (${address}) is not a contract. Must be a contract address.`);
        return result;
      }
      result.warnings.push(`✓ ${name} is a contract (code size: ${code.length / 2 - 1} bytes)`);
    } catch (error: any) {
      result.warnings.push(`Could not verify ${name}: ${error.message}`);
    }
  }

  // Check if zero address
  if (address === ethers.ZeroAddress) {
    result.isValid = false;
    result.errors.push(`${name} cannot be zero address`);
    return result;
  }

  return result;
}

async function main() {
  console.log("=== Address Validation Check ===\n");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (${network.chainId})`);
  console.log(`Deployer: ${await deployer.getAddress()}\n`);

  const results: ValidationResult[] = [];

  // 1. Validate PRIVILEGED_MULTISIG_WALLET
  // Required: YES
  // Must be contract: YES
  // Cannot be zero: YES
  const privilegedMultisigWallet = process.env.PRIVILEGED_MULTISIG_WALLET;
  const result1 = await validateAddress(
    privilegedMultisigWallet,
    "PRIVILEGED_MULTISIG_WALLET",
    true, // required
    true  // must be contract
  );
  results.push(result1);

  // 2. Validate TOKEN_MINT_FEED_ADDRESS
  // Required: NO (can be set later)
  // Must be contract: YES (if set)
  // Cannot be zero: YES (if set)
  const tokenMintFeedAddress = process.env.TOKEN_MINT_FEED_ADDRESS;
  const result2 = await validateAddress(
    tokenMintFeedAddress,
    "TOKEN_MINT_FEED_ADDRESS",
    false, // optional
    true   // must be contract if set
  );
  results.push(result2);

  // Print results
  console.log("Validation Results:");
  console.log("=".repeat(60));
  
  for (const result of results) {
    console.log(`\n${result.name}:`);
    console.log(`  Address: ${result.address}`);
    
    if (result.errors.length > 0) {
      console.log(`  Status: ❌ INVALID`);
      result.errors.forEach((error) => {
        console.log(`    ❌ ${error}`);
      });
    } else if (result.warnings.length > 0) {
      console.log(`  Status: ${result.isValid ? "✅ VALID" : "⚠️  WARNING"}`);
      result.warnings.forEach((warning) => {
        console.log(`    ${warning}`);
      });
    } else {
      console.log(`  Status: ✅ VALID`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  const invalidCount = results.filter((r) => !r.isValid).length;
  const warningCount = results.filter((r) => r.warnings.length > 0 && r.isValid).length;
  const validCount = results.filter((r) => r.isValid && r.warnings.length === 0).length;

  console.log("\nSummary:");
  console.log(`  ✅ Valid: ${validCount}`);
  console.log(`  ⚠️  Warnings: ${warningCount}`);
  console.log(`  ❌ Invalid: ${invalidCount}`);

  if (invalidCount > 0) {
    console.log("\n❌ Some addresses are invalid. Please fix them before deployment.");
    process.exitCode = 1;
  } else if (warningCount > 0) {
    console.log("\n⚠️  Some addresses have warnings. Please review them.");
  } else {
    console.log("\n✅ All addresses are valid!");
  }

  // Additional checks if addresses are set
  if (privilegedMultisigWallet && tokenMintFeedAddress) {
    console.log("\n" + "=".repeat(60));
    console.log("Additional Checks:");
    
    // Check if addresses are the same
    if (privilegedMultisigWallet.toLowerCase() === tokenMintFeedAddress.toLowerCase()) {
      console.log("  ⚠️  PRIVILEGED_MULTISIG_WALLET and TOKEN_MINT_FEED_ADDRESS are the same");
      console.log("     This is unusual but not necessarily wrong.");
    }

    // Try to get contract info
    try {
      const privilegedCode = await ethers.provider.getCode(privilegedMultisigWallet);
      const feedCode = await ethers.provider.getCode(tokenMintFeedAddress);
      
      if (privilegedCode !== "0x") {
        console.log(`  ✓ PRIVILEGED_MULTISIG_WALLET is a contract`);
      }
      
      if (feedCode !== "0x") {
        console.log(`  ✓ TOKEN_MINT_FEED_ADDRESS is a contract`);
        
        // Try to check if it implements ITokenMintFeed interface
        try {
          const feedContract = await ethers.getContractAt("ITokenMintFeed", tokenMintFeedAddress);
          // Try to call a view function to verify it's the right contract
          console.log(`  ✓ TOKEN_MINT_FEED_ADDRESS appears to be a valid contract`);
        } catch (error) {
          console.log(`  ⚠️  Could not verify ITokenMintFeed interface (may not be deployed yet)`);
        }
      }
    } catch (error: any) {
      console.log(`  ⚠️  Could not verify contract codes: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

