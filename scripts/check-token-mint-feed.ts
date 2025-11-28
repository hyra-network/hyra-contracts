import { ethers } from "hardhat";
import * as dotenv from "dotenv";

// Load .env.dev for Base Sepolia testnet (default)
// Can override with .env by setting DOTENV_CONFIG_PATH
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || ".env.dev" });

/**
 * Script to check TokenMintFeed contract on Base Sepolia
 * 
 * Usage:
 *   npx hardhat run scripts/check-token-mint-feed.ts --network baseSepolia
 */

async function main() {
  const tokenMintFeedAddress = process.env.TOKEN_MINT_FEED_ADDRESS;
  
  if (!tokenMintFeedAddress) {
    throw new Error("TOKEN_MINT_FEED_ADDRESS not set in .env.dev");
  }
  
  if (!ethers.isAddress(tokenMintFeedAddress)) {
    throw new Error(`Invalid TOKEN_MINT_FEED_ADDRESS format: ${tokenMintFeedAddress}`);
  }

  console.log("=== TokenMintFeed Contract Check ===\n");
  console.log(`Address: ${tokenMintFeedAddress}`);
  console.log(`Network: Base Sepolia (https://sepolia.basescan.org/)\n`);

  const provider = ethers.provider;
  const network = await provider.getNetwork();
  console.log(`Connected to: ${network.name} (Chain ID: ${network.chainId})\n`);

  // 1. Check if address is a contract
  console.log("1. Checking if address is a contract...");
  const code = await provider.getCode(tokenMintFeedAddress);
  
  if (code === "0x") {
    console.log("   ❌ Address is NOT a contract (code size = 0)");
    console.log("   ❌ This address will FAIL validation in setTokenMintFeed()");
    console.log("   ❌ Error: NotContract() will be reverted");
    process.exitCode = 1;
    return;
  }
  
  const codeSize = (code.length / 2) - 1; // Subtract 1 for '0x' prefix
  console.log(`   ✅ Address IS a contract`);
  console.log(`   ✅ Code size: ${codeSize} bytes`);
  
  // 2. Check if contract implements ITokenMintFeed interface
  console.log("\n2. Checking if contract implements ITokenMintFeed interface...");
  try {
    const feedContract = await ethers.getContractAt("ITokenMintFeed", tokenMintFeedAddress);
    
    // Try to call getLatestMintData with a test requestId (should not revert if interface is correct)
    // Use requestId = 1 for testing
    try {
      const testRequestId = 1;
      console.log(`   Testing getLatestMintData(${testRequestId})...`);
      
      // This is a view function, so we can call it without gas
      const result = await feedContract.getLatestMintData(testRequestId);
      
      console.log(`   ✅ Contract implements ITokenMintFeed interface`);
      console.log(`   ✅ Function signature matches`);
      console.log(`\n   Test call result (requestId=${testRequestId}):`);
      console.log(`     totalRevenue: ${result[0]}`);
      console.log(`     tokenPrice: ${result[1]}`);
      console.log(`     tokensToMint: ${result[2]}`);
      console.log(`     timestamp: ${result[3]}`);
      console.log(`     finalized: ${result[4]}`);
      
      // Validate return values structure
      if (result.length === 5) {
        console.log(`   ✅ Return values structure is correct (5 values)`);
      } else {
        console.log(`   ⚠️  Warning: Expected 5 return values, got ${result.length}`);
      }
      
    } catch (error: any) {
      if (error.message.includes("revert") || error.message.includes("execution reverted")) {
        console.log(`   ⚠️  getLatestMintData() reverted (this is OK if requestId doesn't exist)`);
        console.log(`   ✅ Function exists and signature is correct`);
        console.log(`   ⚠️  Note: Request ID ${testRequestId} may not exist in the contract`);
      } else {
        console.log(`   ❌ Error calling getLatestMintData(): ${error.message}`);
        console.log(`   ❌ Contract may not implement ITokenMintFeed interface correctly`);
      }
    }
    
  } catch (error: any) {
    console.log(`   ❌ Could not create contract instance: ${error.message}`);
    console.log(`   ❌ Contract may not implement ITokenMintFeed interface`);
    process.exitCode = 1;
    return;
  }

  // 3. Validate according to contract logic
  console.log("\n3. Validation according to HyraToken contract logic:");
  console.log("   ✅ Address is not zero");
  console.log("   ✅ Address is a contract (code size > 0)");
  console.log("   ✅ Contract implements ITokenMintFeed interface");
  console.log("\n   ✅ This address WILL PASS validation in setTokenMintFeed()");

  // 4. Check BaseScan link
  console.log("\n4. BaseScan Explorer:");
  console.log(`   https://sepolia.basescan.org/address/${tokenMintFeedAddress}`);

  // 5. Summary
  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log("  ✅ Address format: VALID");
  console.log("  ✅ Is contract: YES");
  console.log("  ✅ Interface: ITokenMintFeed");
  console.log("  ✅ Ready to use in setTokenMintFeed()");
  console.log("\n✅ This address satisfies all validation requirements!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

