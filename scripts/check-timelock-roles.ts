// scripts/check-timelock-roles.ts
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  const fs = require("fs");
  const path = require("path");
  const files = fs.readdirSync(path.join(__dirname, "..", "deployments")).filter((f: string) => f.startsWith("proxy-sepolia-"));
  const latest = files.sort().pop();
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", latest), "utf8"));

  const timelockProxy = info.timelockProxy as string;
  const tokenProxy = info.tokenProxy as string;

  console.log("TimelockProxy:", timelockProxy);
  console.log("TokenProxy:", tokenProxy);

  const timelock = await ethers.getContractAt("HyraTimelock", timelockProxy);
  const token = await ethers.getContractAt("HyraToken", tokenProxy);

  const TIMELOCK_ADMIN = await timelock.DEFAULT_ADMIN_ROLE();
  const PROPOSER = await timelock.PROPOSER_ROLE();
  const EXECUTOR = await timelock.EXECUTOR_ROLE();
  const CANCELLER = await timelock.CANCELLER_ROLE();

  console.log("\n=== Timelock Roles ===");
  console.log("TIMELOCK_ADMIN_ROLE:", await timelock.hasRole(TIMELOCK_ADMIN, await deployer.getAddress()) ? "✅ YES" : "❌ NO");
  console.log("PROPOSER_ROLE:", await timelock.hasRole(PROPOSER, await deployer.getAddress()) ? "✅ YES" : "❌ NO");
  console.log("EXECUTOR_ROLE:", await timelock.hasRole(EXECUTOR, await deployer.getAddress()) ? "✅ YES" : "❌ NO");
  console.log("CANCELLER_ROLE:", await timelock.hasRole(CANCELLER, await deployer.getAddress()) ? "✅ YES" : "❌ NO");

  console.log("\n=== Token Owner ===");
  const owner = await token.owner();
  console.log("Current owner:", owner);
  console.log("Is Timelock?", owner.toLowerCase() === timelockProxy.toLowerCase() ? "✅ YES" : "❌ NO");

  console.log("\n=== Timelock Config ===");
  const minDelay = await timelock.getMinDelay();
  console.log("Min delay:", minDelay.toString(), "seconds");
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

