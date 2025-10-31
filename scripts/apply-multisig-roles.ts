// scripts/apply-multisig-roles.ts
import { isAddress } from "ethers";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ethers } = require("hardhat");

/**
 * Grants multisig wallet roles on HyraTimelock to satisfy Centralization Risk recommendations.
 * - Adds multisig as PROPOSER_ROLE and CANCELLER_ROLE (Governor remains proposer as well).
 * - Optional: revoke deployer from PROPOSER/CANCELLER if present.
 *
 * Usage:
 *   npx hardhat run scripts/apply-multisig-roles.ts --network sepolia \
 *     --timelock 0xTimelockAddress \
 *     --multisig 0xSafeAddress \
 *     [--revokeDeployer]
 */

function getArg(name: string): string | undefined {
  const flag = `--${name}`;
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return process.env[name.toUpperCase()];
}

async function main() {
  const timelockAddr = getArg("timelock");
  const multisigAddr = getArg("multisig");
  const revokeDeployer = (
    (process.env.REVOKE_DEPLOYER || "").toLowerCase() === "true" ||
    process.env.REVOKE_DEPLOYER === "1" ||
    process.argv.includes("--revokedeployer")
  );

  if (!timelockAddr || !isAddress(timelockAddr)) {
    throw new Error("Missing or invalid --timelock address");
  }
  if (!multisigAddr || !isAddress(multisigAddr)) {
    throw new Error("Missing or invalid --multisig address");
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Network: ${await deployer.provider?.getNetwork().then((n) => n.name)}`);
  console.log(`Deployer: ${await deployer.getAddress()}`);
  console.log(`Timelock: ${timelockAddr}`);
  console.log(`Multisig : ${multisigAddr}`);

  const timelock = await ethers.getContractAt("HyraTimelock", timelockAddr);

  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

  // Grant roles to multisig
  console.log("Granting PROPOSER_ROLE to multisig...");
  const tx1 = await timelock.grantRole(PROPOSER_ROLE, multisigAddr);
  console.log(`  tx: ${tx1.hash}`);
  await tx1.wait();

  console.log("Granting CANCELLER_ROLE to multisig...");
  const tx2 = await timelock.grantRole(CANCELLER_ROLE, multisigAddr);
  console.log(`  tx: ${tx2.hash}`);
  await tx2.wait();

  if (revokeDeployer) {
    const deployerAddr = await deployer.getAddress();
    console.log("Revoking deployer roles (if any)...");
    try {
      const rx1 = await timelock.revokeRole(PROPOSER_ROLE, deployerAddr);
      console.log(`  revoke proposer tx: ${rx1.hash}`);
      await rx1.wait();
    } catch {}
    try {
      const rx2 = await timelock.revokeRole(CANCELLER_ROLE, deployerAddr);
      console.log(`  revoke canceller tx: ${rx2.hash}`);
      await rx2.wait();
    } catch {}
  }

  // Verify
  const hasProposer = await timelock.hasRole(PROPOSER_ROLE, multisigAddr);
  const hasCanceller = await timelock.hasRole(CANCELLER_ROLE, multisigAddr);
  console.log(`Done. Multisig PROPOSER=${hasProposer}, CANCELLER=${hasCanceller}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export {};


