import { run } from "hardhat";

async function main() {
  console.log("\n🔍 Verifying Deployed Contracts on Sepolia...\n");

  const contracts = [
    {
      name: "HyraToken",
      address: "0x66b3e1Cd2Fbe590DfBf4F7C0E56050D7b48Bd08c",
      args: [],
    },
    {
      name: "SecureProxyAdmin",
      address: "0x47022e7D4401B46fB3C2352624708304BbC0c58C",
      args: ["0x424af7536BED1201D67eC27b6849419BAE68070b", "1"],
    },
    {
      name: "HyraTimelock",
      address: "0xCc92Aff279cab261155d3166efC9bF2f7613A6D7",
      args: [],
    },
    {
      name: "HyraGovernor",
      address: "0x6328B778fA8D4A5f6Dbf3d74651c5BB496a20147",
      args: [],
    },
    {
      name: "HyraProxyDeployer",
      address: "0x6762Ca001cA824F3e7525d0aa840c65d05125C64",
      args: [],
    },
    {
      name: "TokenVesting",
      address: "0x41464D8Dec85D44c353AC5EFE24ecdD113eec937",
      args: [],
    },
    {
      name: "SecureExecutorManager",
      address: "0x9bcD528265707F5d2769a688322b6eD72518491e",
      args: [],
    },
    {
      name: "ProxyAdminValidator",
      address: "0xaeFe878C561e80c8967B0962eB0203DD3dE86d1f",
      args: [],
    },
  ];

  let successCount = 0;
  let failCount = 0;

  for (const contract of contracts) {
    try {
      console.log(`📝 Verifying ${contract.name}...`);
      console.log(`   Address: ${contract.address}`);

      await run("verify:verify", {
        address: contract.address,
        constructorArguments: contract.args,
      });

      console.log(`✅ ${contract.name} verified!\n`);
      successCount++;
    } catch (error: any) {
      if (error.message?.includes("Already Verified")) {
        console.log(`✅ ${contract.name} already verified\n`);
        successCount++;
      } else {
        console.log(`❌ ${contract.name} verification failed:`);
        console.log(`   ${error.message}\n`);
        failCount++;
      }
    }
  }

  console.log("=".repeat(60));
  console.log("📊 Verification Summary");
  console.log("=".repeat(60));
  console.log(`✅ Successful: ${successCount}/${contracts.length}`);
  console.log(`❌ Failed: ${failCount}/${contracts.length}`);
  console.log("=".repeat(60));

  if (failCount > 0) {
    console.log("\n💡 Some contracts failed to verify.");
    console.log("   They may already be verified or need manual verification.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
