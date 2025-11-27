// scripts/deploy-core-sepolia.ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as path from "path";

async function main() {
	// Load environment variables
	const envFile = process.env.ENV_FILE || ".env";
	dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

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

	// 3) Deploy HyraToken (but don't initialize yet)
	const HyraToken = await ethers.getContractFactory("HyraToken");
	const token = await HyraToken.deploy();
	await token.waitForDeployment();
	console.log(`HyraToken: ${await token.getAddress()}`);
	
	// 3.1) Set Distribution Config BEFORE initialize
	console.log(`\n=== Setting Distribution Configuration ===`);
	const addresses = {
		communityEcosystem: process.env.COMMUNITY_ECOSYSTEM_WALLET,
		liquidityBuybackReserve: process.env.LIQUIDITY_BUYBACK_RESERVE_WALLET,
		marketingPartnerships: process.env.MARKETING_PARTNERSHIPS_WALLET,
		teamFounders: process.env.TEAM_FOUNDERS_WALLET,
		strategicAdvisors: process.env.STRATEGIC_ADVISORS_WALLET,
		seedStrategicVC: process.env.SEED_STRATEGIC_VC_WALLET,
	};

	// Validate all addresses are set
	const missing = Object.entries(addresses)
		.filter(([_, address]) => !address || address === "0x0000000000000000000000000000000000000000")
		.map(([key]) => key);

	if (missing.length > 0) {
		throw new Error(`Missing wallet addresses in ${envFile}: ${missing.join(", ")}`);
	}

	// Validate addresses format
	for (const [key, address] of Object.entries(addresses)) {
		if (!ethers.isAddress(address!)) {
			throw new Error(`Invalid address for ${key}: ${address}`);
		}
	}

	// Check for duplicates
	const addressList = Object.values(addresses) as string[];
	const uniqueAddresses = new Set(addressList);
	if (uniqueAddresses.size !== addressList.length) {
		throw new Error("Duplicate addresses found in configuration");
	}

	console.log(`   Community & Ecosystem (60%): ${addresses.communityEcosystem}`);
	console.log(`   Liquidity, Buyback & Reserve (12%): ${addresses.liquidityBuybackReserve}`);
	console.log(`   Marketing & Partnerships (10%): ${addresses.marketingPartnerships}`);
	console.log(`   Team & Founders (8%): ${addresses.teamFounders}`);
	console.log(`   Strategic Advisors (5%): ${addresses.strategicAdvisors}`);
	console.log(`   Seed & Strategic VC (5%): ${addresses.seedStrategicVC}`);

	// Verify addresses are contracts (multisig wallets)
	console.log(`\n   Verifying addresses are contracts...`);
	for (const [key, address] of Object.entries(addresses)) {
		const code = await ethers.provider.getCode(address!);
		if (code === "0x") {
			throw new Error(`${key} (${address}) is not a contract. All addresses must be multisig wallets.`);
		}
		console.log(`   ✅ ${key}: Contract verified`);
	}

	// Set distribution config
	console.log(`\n   Setting distribution config...`);
	await (
		await token.setDistributionConfig(
			addresses.communityEcosystem!,
			addresses.liquidityBuybackReserve!,
			addresses.marketingPartnerships!,
			addresses.teamFounders!,
			addresses.strategicAdvisors!,
			addresses.seedStrategicVC!
		)
	).wait();
	console.log(`   ✅ Distribution config set (immutable)`);
	
	// 3.2) Initialize token - will auto-distribute to 6 wallets
	const INITIAL_SUPPLY_MAX = ethers.parseEther("2500000000"); // 2.5 billion
	console.log(`\n=== Initializing Token ===`);
	console.log(`   Initial Supply: 2.5B tokens (MAX - 5% of total supply)`);
	console.log(`   💰 Initial tokens will be auto-distributed to 6 multisig wallets`);
	console.log(`   ⚠️  Year 1 quota will be FULL - cannot mint more until Year 2`);
	
	await (
		await token.initialize(
			"HYRA",
			"HYRA",
			INITIAL_SUPPLY_MAX,
			await vesting.getAddress(),  // vesting contract (not used when distributing)
			await timelock.getAddress(),
			await privilegedMultisig.getAddress()
		)
	).wait();
	console.log(`✅ HyraToken initialized - 2.5B HYRA distributed to 6 multisig wallets`);

	// Verify distribution
	console.log(`\n=== Verifying Distribution ===`);
	const config = await token.distributionConfig();
	const balance1 = await token.balanceOf(config.communityEcosystem);
	const balance2 = await token.balanceOf(config.liquidityBuybackReserve);
	const balance3 = await token.balanceOf(config.marketingPartnerships);
	const balance4 = await token.balanceOf(config.teamFounders);
	const balance5 = await token.balanceOf(config.strategicAdvisors);
	const balance6 = await token.balanceOf(config.seedStrategicVC);
	const total = balance1 + balance2 + balance3 + balance4 + balance5 + balance6;
	
	console.log(`   Community & Ecosystem: ${ethers.formatEther(balance1)} HYRA`);
	console.log(`   Liquidity, Buyback & Reserve: ${ethers.formatEther(balance2)} HYRA`);
	console.log(`   Marketing & Partnerships: ${ethers.formatEther(balance3)} HYRA`);
	console.log(`   Team & Founders: ${ethers.formatEther(balance4)} HYRA`);
	console.log(`   Strategic Advisors: ${ethers.formatEther(balance5)} HYRA`);
	console.log(`   Seed & Strategic VC: ${ethers.formatEther(balance6)} HYRA`);
	console.log(`   Total Distributed: ${ethers.formatEther(total)} HYRA`);
	
	if (total === INITIAL_SUPPLY_MAX) {
		console.log(`   ✅ Distribution verified: Total matches initial supply`);
	} else {
		throw new Error(`Distribution error: Total (${ethers.formatEther(total)}) != Initial Supply (${ethers.formatEther(INITIAL_SUPPLY_MAX)})`);
	}

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
	
	// Load and validate Privileged Multisig Wallet
	const privilegedMultisigWallet = process.env.PRIVILEGED_MULTISIG_WALLET;
	if (!privilegedMultisigWallet) {
		throw new Error(`PRIVILEGED_MULTISIG_WALLET not set in ${envFile}`);
	}
	if (!ethers.isAddress(privilegedMultisigWallet)) {
		throw new Error(`Invalid PRIVILEGED_MULTISIG_WALLET address: ${privilegedMultisigWallet}`);
	}
	
	// Validate it's a contract (multisig wallet)
	const code = await ethers.provider.getCode(privilegedMultisigWallet);
	if (code === "0x") {
		throw new Error(`PRIVILEGED_MULTISIG_WALLET (${privilegedMultisigWallet}) is not a contract. Must be a multisig wallet.`);
	}
	console.log(`   Privileged Multisig Wallet: ${privilegedMultisigWallet} (verified as contract)`);
	
	await (
		await governor.initialize(
			await token.getAddress(),
			await timelock.getAddress(),
			1,
			100,
			ethers.parseEther("1000000"),
			10,
			privilegedMultisigWallet
		)
	).wait();
	console.log(`HyraGovernor initialized with Privileged Multisig Wallet`);

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
		distributionConfig: {
			communityEcosystem: addresses.communityEcosystem,
			liquidityBuybackReserve: addresses.liquidityBuybackReserve,
			marketingPartnerships: addresses.marketingPartnerships,
			teamFounders: addresses.teamFounders,
			strategicAdvisors: addresses.strategicAdvisors,
			seedStrategicVC: addresses.seedStrategicVC,
		},
		distributionNote: "Tokens auto-distributed to 6 multisig wallets (60%, 12%, 10%, 8%, 5%, 5%)",
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
