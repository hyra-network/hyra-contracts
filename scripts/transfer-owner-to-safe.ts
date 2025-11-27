// scripts/transfer-owner-to-safe.ts
import { ethers } from "hardhat";

async function main() {
  const safeAddress = process.env.SAFE_ADDRESS || "";
  if (!safeAddress) throw new Error("Set SAFE_ADDRESS env var");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());

  // Load deployment info
  const fs = require("fs");
  const path = require("path");
  const files = fs.readdirSync(path.join(__dirname, "..", "deployments")).filter((f: string) => f.startsWith("proxy-sepolia-"));
  const latest = files.sort().pop();
  const info = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "deployments", latest), "utf8"));

  const tokenProxy = info.tokenProxy as string;
  const timelockProxy = info.timelockProxy as string;

  console.log("TokenProxy:", tokenProxy);
  console.log("TimelockProxy:", timelockProxy);
  console.log("Safe target:", safeAddress);

  const token = await ethers.getContractAt("HyraToken", tokenProxy);
  const timelock = await ethers.getContractAt("HyraTimelock", timelockProxy);

  // Check current owner
  const currentOwner = await token.owner();
  console.log("Current token owner:", currentOwner);

  if (currentOwner.toLowerCase() === safeAddress.toLowerCase()) {
    console.log("Token owner already set to Safe. Done.");
    return;
  }

  // Strategy 1: If deployer is still DEFAULT_ADMIN_ROLE on Timelock, schedule + execute direct
  const TIMELOCK_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  const hasAdmin = await timelock.hasRole(TIMELOCK_ADMIN_ROLE, await deployer.getAddress());
  
  if (hasAdmin) {
    console.log("Deployer has TIMELOCK_ADMIN_ROLE. Using direct schedule+execute...");
    
    const calldata = token.interface.encodeFunctionData("transferGovernance", [safeAddress]);
    const predecessor = ethers.ZeroHash;
    const salt = ethers.id(`transfer-owner-${Date.now()}`); // unique salt
    const delay = await timelock.getMinDelay();

    console.log("Delay:", delay.toString(), "seconds");
    console.log("Salt:", salt);

    // Check if operation is already scheduled
    const id = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes32", "bytes32"],
        [tokenProxy, 0, calldata, predecessor, salt]
      )
    );
    const isScheduled = await timelock.isOperationPending(id);
    
    if (isScheduled) {
      console.log("Operation already scheduled. Waiting for delay to execute...");
    } else {
      // Schedule
      console.log("Scheduling operation...");
      await (await timelock.schedule(
        tokenProxy,
        0,
        calldata,
        predecessor,
        salt,
        delay,
        { gasLimit: 8_000_000 }
      )).wait();
      console.log(`Scheduled! Operation ID: ${id}`);
      console.log(`You need to wait ${delay} seconds before executing.`);
      console.log("Run this script again after the delay to execute.");
      return;
    }

    // Check if ready to execute
    const isReady = await timelock.isOperationReady(id);
    if (!isReady) {
      console.log("Operation not ready yet. Please wait for delay period.");
      return;
    }

    // Execute
    console.log("Executing...");
    await (await timelock.execute(
      tokenProxy,
      0,
      calldata,
      predecessor,
      salt,
      { gasLimit: 8_000_000 }
    )).wait();
    console.log("Executed!");

    const newOwner = await token.owner();
    console.log("New token owner:", newOwner);
    console.log("Transfer complete!");
  } else {
    console.log("Deployer does NOT have TIMELOCK_ADMIN_ROLE.");
    console.log("You must use governance flow (propose → vote → queue → execute) to transfer owner.");
    console.log("\nSteps:");
    console.log("1. Ensure you have enough voting power (1M HYRA)");
    console.log("2. Delegate to yourself");
    console.log("3. Propose transferGovernance via Governor");
    console.log("4. Vote, queue, execute");
  }
}

if (require.main === module) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

