import { ethers, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.dev for Base Sepolia testnet
dotenv.config({ path: ".env.dev" });

async function main() {
  console.log("Verifying Ultra Fast Test contracts on Base Sepolia...\n");

  // Find latest deployment file
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs.readdirSync(deploymentsDir)
    .filter(f => f.startsWith("ultra-fast-baseSepolia-"))
    .sort()
    .reverse();

  if (files.length === 0) {
    console.error("❌ No ultra-fast deployment file found!");
    process.exit(1);
  }

  const deploymentFile = files[0];
  console.log(`Using deployment: ${deploymentFile}\n`);

  const deployment = JSON.parse(
    fs.readFileSync(path.join(deploymentsDir, deploymentFile), "utf-8")
  );

  console.log("=== Verifying Implementations ===\n");

  // Verify TokenVesting
  console.log("Verifying TokenVesting...");
  try {
    await run("verify:verify", {
      address: deployment.vestingImpl,
      constructorArguments: [],
    });
    console.log("✅ TokenVesting verified\n");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ TokenVesting already verified\n");
    } else {
      console.log(`⚠️  TokenVesting verification error: ${e.message}\n`);
    }
  }

  // Verify HyraTokenUltraFastTest
  console.log("Verifying HyraTokenUltraFastTest...");
  try {
    await run("verify:verify", {
      address: deployment.tokenImpl,
      constructorArguments: [],
    });
    console.log("✅ HyraTokenUltraFastTest verified\n");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ HyraTokenUltraFastTest already verified\n");
    } else {
      console.log(`⚠️  HyraTokenUltraFastTest verification error: ${e.message}\n`);
    }
  }

  // Verify HyraTimelock
  console.log("Verifying HyraTimelock...");
  try {
    await run("verify:verify", {
      address: deployment.timelockImpl,
      constructorArguments: [],
    });
    console.log("✅ HyraTimelock verified\n");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ HyraTimelock already verified\n");
    } else {
      console.log(`⚠️  HyraTimelock verification error: ${e.message}\n`);
    }
  }

  // Verify HyraGovernor
  console.log("Verifying HyraGovernor...");
  try {
    await run("verify:verify", {
      address: deployment.governorImpl,
      constructorArguments: [],
    });
    console.log("✅ HyraGovernor verified\n");
  } catch (e: any) {
    if (e.message.includes("Already Verified")) {
      console.log("✅ HyraGovernor already verified\n");
    } else {
      console.log(`⚠️  HyraGovernor verification error: ${e.message}\n`);
    }
  }

  console.log("\n=== Verifying Proxies ===\n");

  // Verify proxies
  const proxies = [
    { name: "TokenVesting", address: deployment.vestingProxy },
    { name: "HyraTokenUltraFastTest", address: deployment.tokenProxy },
    { name: "HyraTimelock", address: deployment.timelockProxy },
    { name: "HyraGovernor", address: deployment.governorProxy },
  ];

  for (const proxy of proxies) {
    console.log(`Verifying ${proxy.name} proxy...`);
    try {
      await run("verify:verify", {
        address: proxy.address,
        constructorArguments: [],
      });
      console.log(`✅ ${proxy.name} proxy verified\n`);
    } catch (e: any) {
      if (e.message.includes("Already Verified")) {
        console.log(`✅ ${proxy.name} proxy already verified\n`);
      } else {
        console.log(`⚠️  ${proxy.name} proxy verification error: ${e.message}\n`);
      }
    }
  }

  console.log("\n=== Verification Complete ===\n");

  console.log("📋 Contract Links:");
  console.log(`HyraTokenUltraFastTest (proxy): https://sepolia.basescan.org/address/${deployment.tokenProxy}#code`);
  console.log(`HyraTimelock (proxy): https://sepolia.basescan.org/address/${deployment.timelockProxy}#code`);
  console.log(`HyraGovernor (proxy): https://sepolia.basescan.org/address/${deployment.governorProxy}#code`);
  console.log(`TokenVesting (proxy): https://sepolia.basescan.org/address/${deployment.vestingProxy}#code`);

  console.log("\n⚡⚡⚡ ULTRA FAST TEST MODE:");
  console.log(`   - Mint delay: 2 MINUTES`);
  console.log(`   - Year duration: 1 HOUR ⚡⚡⚡`);
  console.log(`   - Test Year 2 after just 1 hour!`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});


