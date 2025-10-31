// scripts/deploy-core-sepolia.ts
import { ethers } from "hardhat";

async function main() {
	const [deployer] = await ethers.getSigners();
	console.log(`Deploying to ${await ethers.provider._networkName || "sepolia"}`);
	console.log(`Deployer: ${await deployer.getAddress()}`);
	console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress()))} ETH`);

	// 1) Deploy HyraTimelock and initialize (acts as governance owner)
	const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
	const timelock = await HyraTimelock.deploy();
	await timelock.waitForDeployment();
	console.log(`HyraTimelock: ${await timelock.getAddress()}`);
	await (
		await timelock.initialize(
			86400,
			[await deployer.getAddress()],
			[await deployer.getAddress()],
			await deployer.getAddress()
		)
	).wait();
	console.log(`HyraTimelock initialized`);

	// 2) Deploy TokenVesting (owner to be set to timelock after init)
	const TokenVesting = await ethers.getContractFactory("TokenVesting");
	const vesting = await TokenVesting.deploy();
	await vesting.waitForDeployment();
	console.log(`TokenVesting: ${await vesting.getAddress()}`);

	// 3) Deploy HyraToken and initialize with vesting + timelock owner
	const HyraToken = await ethers.getContractFactory("HyraToken");
	const token = await HyraToken.deploy();
	await token.waitForDeployment();
	console.log(`HyraToken: ${await token.getAddress()}`);
	await (
		await token.initialize(
			"Hyra Token",
			"HYRA",
			ethers.parseEther("1000000"),
			await vesting.getAddress(),
			await timelock.getAddress()
		)
	).wait();
	console.log(`HyraToken initialized with vesting + timelock`);

	// 3.1) Initialize vesting with token and set owner to timelock
	await (
		await vesting.initialize(
			await token.getAddress(),
			await timelock.getAddress()
		)
	).wait();
	console.log(`TokenVesting initialized (owner=Timelock)`);

	// 4) Deploy HyraGovernor and initialize
	const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
	const governor = await HyraGovernor.deploy();
	await governor.waitForDeployment();
	console.log(`HyraGovernor: ${await governor.getAddress()}`);
	await (
		await governor.initialize(
			await token.getAddress(),
			await timelock.getAddress(),
			1,
			100,
			ethers.parseEther("1000000"),
			10
		)
	).wait();
	console.log(`HyraGovernor initialized`);

	// Save deployment info
	const fs = require("fs");
	const path = require("path");
	const dir = path.join(__dirname, "..", "deployments");
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(
		dir,
		`core-sepolia-${Date.now()}.json`
	);
	const info = {
		network: "sepolia",
		deployer: await deployer.getAddress(),
		contracts: {
			vesting: await vesting.getAddress(),
			token: await token.getAddress(),
			timelock: await timelock.getAddress(),
			governor: await governor.getAddress(),
		},
	};
	fs.writeFileSync(file, JSON.stringify(info, null, 2));
	console.log(`Saved deployment: ${file}`);
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
