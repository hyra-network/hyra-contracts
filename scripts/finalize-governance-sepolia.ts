// scripts/finalize-governance-sepolia.ts
import { ethers } from "hardhat";

async function loadLatestDeployment() {
	const fs = require("fs");
	const path = require("path");
	const dir = path.join(__dirname, "..", "deployments");
	const files = fs.readdirSync(dir).filter((f: string) => f.startsWith("proxy-sepolia-"));
	if (!files.length) throw new Error("No proxy-sepolia deployment files found");
	const latest = files.sort().pop();
	const data = JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
	return data;
}

async function main() {
	const [deployer] = await ethers.getSigners();
	const info = await loadLatestDeployment();
	const tokenAddr = info.tokenProxy;
	const timelockAddr = info.timelockProxy;
	const governorAddr = info.governorProxy;

	console.log("Using:");
	console.log(`  Token:    ${tokenAddr}`);
	console.log(`  Timelock: ${timelockAddr}`);
	console.log(`  Governor: ${governorAddr}`);

	const token = await ethers.getContractAt("HyraToken", tokenAddr);
	const timelock = await ethers.getContractAt("HyraTimelock", timelockAddr);

	// Transfer token governance (owner) to Timelock
	try {
		const currentOwner = await token.owner();
		if (currentOwner.toLowerCase() === timelockAddr.toLowerCase()) {
			console.log("Token governance already set to Timelock. Skipping transfer.");
		} else {
			console.log("Transferring token governance to Timelock...");
			await (await token.transferGovernance(timelockAddr)).wait();
			console.log("Token governance transferred");
		}
	} catch (e) {
		console.log("Skipping transferGovernance due to error (likely already owned by Timelock):", e);
	}

	// Grant roles on Timelock
	const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
	const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
	const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

	console.log("Granting PROPOSER_ROLE to Governor...");
	await (await timelock.grantRole(PROPOSER_ROLE, governorAddr)).wait();
	console.log("Granting EXECUTOR_ROLE to everyone (address(0))...");
	await (await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress)).wait();
	console.log("Granting CANCELLER_ROLE to deployer (maintenance)...");
	await (await timelock.grantRole(CANCELLER_ROLE, await deployer.getAddress())).wait();

	// Optionally revoke deployer as proposer
	console.log("Revoking deployer PROPOSER_ROLE...");
	try {
		await (await timelock.revokeRole(PROPOSER_ROLE, await deployer.getAddress())).wait();
	} catch (_) {}

	console.log("Finalize done.");
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
