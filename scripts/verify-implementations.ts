import { run } from "hardhat";

/**
 * Verify HyraTimelock Implementation and HyraToken Implementation
 * These are implementation contracts (not proxies)
 */

async function main() {
  const network = process.env.HARDHAT_NETWORK || "baseSepolia";
  
  console.log(`\n🔍 Verifying Implementation Contracts on ${network}...\n`);

  // Contract addresses (update these with your deployed addresses)
  const timelockImplAddress = "0x825ed4C29F243B1ce25E085c68d9Df7ed0A210D6";
  const tokenImplAddress = "0xfb1736e7291E053bD4714e3E4A98abbb339eC643";

  console.log("⚠️  IMPORTANT: Make sure you've compiled with --force after changing compiler settings!");
  console.log("   Run: npx hardhat compile --force\n");

  // Verify HyraTimelock Implementation
  console.log(`Verifying HyraTimelock Implementation at ${timelockImplAddress}...`);
  try {
    await run("verify:verify", {
      address: timelockImplAddress,
      contract: "contracts/core/HyraTimelock.sol:HyraTimelock",
      constructorArguments: [],
    });
    console.log("   ✅ HyraTimelock Implementation verified successfully!\n");
  } catch (error: any) {
    if (error.message?.includes("Already Verified")) {
      console.log("   ✅ HyraTimelock Implementation already verified!\n");
    } else {
      console.error("   ❌ HyraTimelock Implementation verification failed:", error.message);
      console.log("   💡 Try running: npx hardhat compile --force\n");
    }
  }

  // Verify HyraToken Implementation
  console.log(`Verifying HyraToken Implementation at ${tokenImplAddress}...`);
  try {
    await run("verify:verify", {
      address: tokenImplAddress,
      contract: "contracts/core/HyraToken.sol:HyraToken",
      constructorArguments: [],
    });
    console.log("   ✅ HyraToken Implementation verified successfully!\n");
  } catch (error: any) {
    if (error.message?.includes("Already Verified")) {
      console.log("   ✅ HyraToken Implementation already verified!\n");
    } else {
      console.error("   ❌ HyraToken Implementation verification failed:", error.message);
      console.log("   💡 Try running: npx hardhat compile --force\n");
    }
  }

  console.log("\n📊 Verification Summary:");
  console.log(`   HyraTimelock Implementation: ${timelockImplAddress}`);
  console.log(`   HyraToken Implementation: ${tokenImplAddress}`);
  console.log("\n🔗 Basescan Links:");
  console.log(`   Timelock: https://sepolia.basescan.org/address/${timelockImplAddress}`);
  console.log(`   Token: https://sepolia.basescan.org/address/${tokenImplAddress}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

