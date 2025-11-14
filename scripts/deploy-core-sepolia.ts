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

	// 3) Deploy HyraToken and initialize with SAFE MULTISIG as initial recipient
	const HyraToken = await ethers.getContractFactory("HyraToken");
	const token = await HyraToken.deploy();
	await token.waitForDeployment();
	console.log(`HyraToken: ${await token.getAddress()}`);
	
	// Get Safe Multisig address from environment or use deployer as fallback
	const safeAddress = process.env.SAFE_ADDRESS || await deployer.getAddress();
	console.log(`   Safe Multisig Address: ${safeAddress}`);
	if (!process.env.SAFE_ADDRESS) {
		console.log(`   ⚠️  WARNING: SAFE_ADDRESS not set, using deployer address as fallback!`);
	}
	
	// MINT MAX INITIAL SUPPLY: 2.5B tokens (5% of 50B max supply)
	const INITIAL_SUPPLY_MAX = ethers.parseEther("2500000000"); // 2.5 billion
	console.log(`   Initial Supply: 2.5B tokens (MAX - 5% of total supply)`);
	console.log(`   💰 Initial tokens will be minted to: Safe Multisig`);
	console.log(`   ⚠️  Year 1 quota will be FULL - cannot mint more until Year 2`);
	
	await (
		await token.initialize(
			"HYRA",
			"HYRA",
			INITIAL_SUPPLY_MAX,
			safeAddress,                    // 👈 MINT TO SAFE MULTISIG!
			await timelock.getAddress()
		)
	).wait();
	console.log(`✅ HyraToken initialized - 2.5B HYRA minted to Safe Multisig`);

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
		initialSupply: "2500000000", // 2.5B tokens (5% of max supply)
		initialSupplyNote: "FULL Year 1 quota - cannot mint more until Year 2",
		initialSupplyRecipient: safeAddress, // Safe Multisig receives initial supply
		safeMultisig: safeAddress,
		contracts: {
			vesting: await vesting.getAddress(),
			token: await token.getAddress(),
			timelock: await timelock.getAddress(),
			governor: await governor.getAddress(),
		},
		tokenomics: {
			maxSupply: "50000000000", // 50B
			initialSupply: "2500000000", // 2.5B (5%)
			year1Remaining: "0", // FULL
			nextMintAvailable: "Year 2 (2026)",
			initialSupplyRecipient: "Safe Multisig (NOT Vesting)",
		},
	};
	fs.writeFileSync(file, JSON.stringify(info, null, 2));
	console.log(`Saved deployment: ${file}`);
	
	console.log("\n🎉 DEPLOYMENT COMPLETE!");
	console.log(`✅ Initial Supply: 2.5B HYRA (MAX 5%)`);
	console.log(`💰 Tokens minted to: ${safeAddress} (Safe Multisig)`);
	console.log(`🔐 Token owner: ${await timelock.getAddress()} (Timelock)`);
	console.log(`⚠️  Year 1 quota FULL - Next mint available in Year 2`);
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
