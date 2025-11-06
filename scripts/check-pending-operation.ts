// scripts/check-pending-operation.ts
import { ethers } from "hardhat";

async function main() {
  const operationId = process.env.OP_ID || "0x341b89aca77c566cd968c0136e6a3730441a6c09751b8dad67e77b6913d764b5";
  
  const fs = require("fs");
  const path = require("path");
  const files = fs.readdirSync(path.join(__dirname, "..", "deployments")).filter((f: string) => f.startsWith("proxy-sepolia-"));
  const latest = files.sort().pop();
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", latest), "utf8"));
  
  const timelockProxy = info.timelockProxy as string;
  const timelock = await ethers.getContractAt("HyraTimelock", timelockProxy);

  console.log("Timelock:", timelockProxy);
  console.log("Operation ID:", operationId);
  console.log("");

  // Check operation status
  const isPending = await timelock.isOperationPending(operationId);
  const isReady = await timelock.isOperationReady(operationId);
  const isDone = await timelock.isOperationDone(operationId);
  const timestamp = await timelock.getTimestamp(operationId);

  console.log("=== Operation Status ===");
  console.log("isPending:", isPending ? "✅ YES (scheduled)" : "❌ NO");
  console.log("isReady:", isReady ? "✅ YES (can execute now)" : "❌ NO (still waiting)");
  console.log("isDone:", isDone ? "✅ YES (already executed)" : "❌ NO");
  
  console.log("\n=== Timing ===");
  const execTimestamp = Number(timestamp);
  const now = Math.floor(Date.now() / 1000);
  
  if (execTimestamp > 0) {
    const execDate = new Date(execTimestamp * 1000);
    console.log("Can execute at:", execDate.toISOString());
    console.log("Can execute at (local):", execDate.toLocaleString());
    
    if (now < execTimestamp) {
      const remaining = execTimestamp - now;
      const hours = Math.floor(remaining / 3600);
      const minutes = Math.floor((remaining % 3600) / 60);
      console.log("Time remaining:", `${hours}h ${minutes}m (${remaining}s)`);
    } else {
      console.log("Time remaining: 0 (ready to execute!)");
    }
  } else {
    console.log("Not scheduled or already executed");
  }

  console.log("\n=== Current Time ===");
  console.log("Now (UTC):", new Date().toISOString());
  console.log("Now (local):", new Date().toLocaleString());
  console.log("Unix timestamp:", now);
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

