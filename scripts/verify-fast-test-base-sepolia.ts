import { run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  console.log("Verifying Fast Test contracts on Base Sepolia...\n");

  // Load latest fast-test deployment
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  const files = fs.readdirSync(deploymentsDir).filter(f => f.startsWith("fast-test-baseSepolia-"));
  if (!files.length) {
    throw new Error("No fast-test deployment found!");
  }
  
  const latestFile = files.sort().pop()!;
  const deployment = JSON.parse(fs.readFileSync(path.join(deploymentsDir, latestFile), "utf8"));

  console.log(`Using deployment: ${latestFile}\n`);

  const {
    tokenImpl,
    tokenProxy,
    timelockImpl,
    timelockProxy,
    governorImpl,
    governorProxy,
    vestingImpl,
    vestingProxy
  } = deployment;

  // Verify implementations
  console.log("=== Verifying Implementations ===\n");

  const implementations = [
    { address: vestingImpl, name: "TokenVesting" },
    { address: tokenImpl, name: "HyraTokenFastTest", contract: "contracts/mock/HyraTokenFastTest.sol:HyraTokenFastTest" },
    { address: timelockImpl, name: "HyraTimelock" },
    { address: governorImpl, name: "HyraGovernor" }
  ];

  for (const impl of implementations) {
    try {
      console.log(`Verifying ${impl.name}...`);
      await run("verify:verify", {
        address: impl.address,
        contract: impl.contract
      });
      console.log(`✅ ${impl.name} verified\n`);
    } catch (e: any) {
      if (e.message.includes("Already Verified")) {
        console.log(`✅ ${impl.name} already verified\n`);
      } else {
        console.log(`⚠️  ${impl.name} verification failed: ${e.message}\n`);
      }
    }
  }

  // Verify proxies
  console.log("\n=== Verifying Proxies ===\n");

  const proxies = [
    { address: vestingProxy, impl: vestingImpl, name: "TokenVesting proxy" },
    { address: tokenProxy, impl: tokenImpl, name: "HyraTokenFastTest proxy" },
    { address: timelockProxy, impl: timelockImpl, name: "HyraTimelock proxy" },
    { address: governorProxy, impl: governorImpl, name: "HyraGovernor proxy" }
  ];

  for (const proxy of proxies) {
    try {
      console.log(`Verifying ${proxy.name}...`);
      await run("verify:verify", {
        address: proxy.address,
        constructorArguments: [proxy.impl, "0x"]
      });
      console.log(`✅ ${proxy.name} verified\n`);
    } catch (e: any) {
      if (e.message.includes("Already Verified")) {
        console.log(`✅ ${proxy.name} already verified\n`);
      } else {
        console.log(`⚠️  ${proxy.name} verification failed: ${e.message}\n`);
      }
    }
  }

  console.log("\n=== Verification Complete ===");
  console.log("\n📋 Contract Links:");
  console.log(`HyraTokenFastTest (proxy): https://sepolia.basescan.org/address/${tokenProxy}#code`);
  console.log(`HyraTimelock (proxy): https://sepolia.basescan.org/address/${timelockProxy}#code`);
  console.log(`HyraGovernor (proxy): https://sepolia.basescan.org/address/${governorProxy}#code`);
  console.log(`TokenVesting (proxy): https://sepolia.basescan.org/address/${vestingProxy}#code`);

  console.log("\n⚡ FAST TEST MODE:");
  console.log(`   - Mint delay: 2 MINUTES`);
  console.log(`   - Create mint request → wait 2 minutes → execute!`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

