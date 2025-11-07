import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function loadLatestDeployment(prefix: string) {
  const dir = path.join(__dirname, "..", "deployments");
  // Try baseSepolia first, fallback to sepolia
  let files = fs.readdirSync(dir).filter((f) => f.startsWith(`${prefix}-baseSepolia-`));
  if (!files.length) {
    files = fs.readdirSync(dir).filter((f) => f.startsWith(`${prefix}-sepolia-`));
  }
  if (!files.length) throw new Error(`No ${prefix} deployment file found for ${network.name}`);
  const latest = files.sort().pop()!;
  return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

async function main() {
  const proxyDeployment = await loadLatestDeployment("proxy");
  const tokenProxy = proxyDeployment.tokenProxy as string;

  console.log(`Network: ${network.name}`);
  console.log(`HyraToken (proxy): ${tokenProxy}\n`);

  const token = await ethers.getContractAt("HyraToken", tokenProxy);

  console.log("=== Token Supply Info ===");
  const totalSupply = await token.totalSupply();
  console.log(`Total Supply: ${ethers.formatEther(totalSupply)} HYRA`);

  const totalMinted = await token.totalMintedSupply();
  console.log(`Total Minted (after deploy): ${ethers.formatEther(totalMinted)} HYRA`);

  console.log("\n=== Current Year Mint Info ===");
  const currentYear = await token.currentMintYear();
  console.log(`Current Mint Year: ${currentYear.toString()}`);

  const tier = await token.getCurrentMintTier();
  console.log(`Current Tier: ${tier.toString()}`);

  const mintedThisYear = await token.getMintedThisYear();
  console.log(`Minted This Year: ${ethers.formatEther(mintedThisYear)} HYRA`);

  const remaining = await token.getRemainingMintCapacity();
  console.log(`Remaining Capacity: ${ethers.formatEther(remaining)} HYRA`);

  console.log("\n=== Mint Request Info ===");
  const requestCount = await token.mintRequestCount();
  console.log(`Total Mint Requests: ${requestCount.toString()}`);

  if (requestCount > 0n) {
    console.log("\nRecent Mint Requests:");
    const start = requestCount > 5n ? requestCount - 5n : 0n;
    for (let i = start; i < requestCount; i++) {
      const req = await token.mintRequests(i);
      console.log(`\nRequest #${i}:`);
      console.log(`  Recipient: ${req.recipient}`);
      console.log(`  Amount: ${ethers.formatEther(req.amount)} HYRA`);
      console.log(`  Approved At: ${new Date(Number(req.approvedAt) * 1000).toLocaleString()}`);
      console.log(`  Executed: ${req.executed ? "✅ YES" : "❌ NO"}`);
      console.log(`  Purpose: ${req.purpose}`);
    }
  }

  console.log("\n=== Owner Info ===");
  const owner = await token.owner();
  console.log(`Current Owner: ${owner}`);

  // Check Safe balance if SAFE_ADDRESS is set
  const safeAddress = process.env.SAFE_ADDRESS || "0xa6154bF0334Db14F5f5CB02B3524AF4ABCaE6fF2";
  console.log("\n=== Safe Balance ===");
  const safeBalance = await token.balanceOf(safeAddress);
  console.log(`Safe (${safeAddress}): ${ethers.formatEther(safeBalance)} HYRA`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

