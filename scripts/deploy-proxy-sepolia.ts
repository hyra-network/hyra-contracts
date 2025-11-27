// scripts/deploy-proxy-sepolia.ts
import { ethers } from "hardhat";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import {
	loadDistributionAddresses,
	logDistributionAddresses,
	verifyDistributionBalances,
} from "./utils/distributionConfig";

async function main() {
	const envFile = process.env.ENV_FILE || ".env";
	dotenv.config({ path: path.resolve(__dirname, "..", envFile) });

	const [deployer] = await ethers.getSigners();
	console.log(`Deployer: ${await deployer.getAddress()}`);
	console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress()))} ETH`);

	const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");

	// TokenVesting implementation
	const TokenVesting = await ethers.getContractFactory("TokenVesting");
	const vestingImpl = await TokenVesting.deploy({ gasLimit: 8_000_000 });
	await vestingImpl.waitForDeployment();
	console.log(`TokenVesting impl: ${await vestingImpl.getAddress()}`);

	// HyraTimelock impl + proxy with initialize (used as governance/owner)
	const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
	const timelockImpl = await HyraTimelock.deploy({ gasLimit: 8_000_000 });
	await timelockImpl.waitForDeployment();
	const tlInit = HyraTimelock.interface.encodeFunctionData("initialize", [
		86400,
		[await deployer.getAddress()],
		[await deployer.getAddress()],
		await deployer.getAddress(),
	]);
	const timelockProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), tlInit, { gasLimit: 8_000_000 });
	await timelockProxy.waitForDeployment();
	console.log(`HyraTimelock proxy: ${await timelockProxy.getAddress()}`);

	// TokenVesting proxy (initialize after token is deployed)
	const vestingProxy = await ERC1967Proxy.deploy(await vestingImpl.getAddress(), "0x", { gasLimit: 8_000_000 });
	await vestingProxy.waitForDeployment();
	console.log(`TokenVesting proxy: ${await vestingProxy.getAddress()}`);

	// HyraToken impl + proxy (initialize later to allow distribution config)
	const safeAddress = process.env.SAFE_ADDRESS || "";
	const governanceOwner = safeAddress || (await timelockProxy.getAddress());
	console.log(`Token governance owner will be: ${governanceOwner}`);

	const HyraToken = await ethers.getContractFactory("HyraToken");
	const tokenImpl = await HyraToken.deploy({ gasLimit: 8_000_000 });
	await tokenImpl.waitForDeployment();
	const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x", { gasLimit: 8_000_000 });
	await tokenProxy.waitForDeployment();
	console.log(`HyraToken proxy: ${await tokenProxy.getAddress()}`);

	const token = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());
	console.log(`\n=== Configuring Token Distribution (env: ${envFile}) ===`);
	const distributionAddresses = await loadDistributionAddresses();
	logDistributionAddresses(distributionAddresses);
	await (
		await token.setDistributionConfig(
			distributionAddresses.communityEcosystem,
			distributionAddresses.liquidityBuybackReserve,
			distributionAddresses.marketingPartnerships,
			distributionAddresses.teamFounders,
			distributionAddresses.strategicAdvisors,
			distributionAddresses.seedStrategicVC
		)
	).wait();
	console.log("Distribution config set (immutable)");

	const INITIAL_SUPPLY = ethers.parseEther("1000000");
	await (
		await token.initialize(
			"HYRA",
			"HYRA",
			INITIAL_SUPPLY,
			await vestingProxy.getAddress(),
			governanceOwner,
			privilegedMultisigWallet
		)
	).wait();
	console.log("HyraToken initialized and initial supply distributed to 6 multisig wallets");
	await verifyDistributionBalances(token, distributionAddresses, INITIAL_SUPPLY);

	// Initialize TokenVesting now that tokenProxy exists (owner=Timelock)
	const vesting = await ethers.getContractAt("TokenVesting", await vestingProxy.getAddress());
	await (await vesting.initialize(await tokenProxy.getAddress(), await timelockProxy.getAddress())).wait();
	console.log(`TokenVesting initialized (owner=Timelock)`);

	// HyraGovernor impl + proxy with initialize
	const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
	const governorImpl = await HyraGovernor.deploy({ gasLimit: 8_000_000 });
	await governorImpl.waitForDeployment();
	// Load and validate Privileged Multisig Wallet
	const privilegedMultisigWallet = process.env.PRIVILEGED_MULTISIG_WALLET;
	if (!privilegedMultisigWallet) {
		throw new Error("PRIVILEGED_MULTISIG_WALLET not set in .env");
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

	const govInit = HyraGovernor.interface.encodeFunctionData("initialize", [
		await tokenProxy.getAddress(),
		await timelockProxy.getAddress(),
		1,
		100,
		ethers.parseEther("1000000"),
		10,
		privilegedMultisigWallet // Privileged Multisig Wallet
	]);
	const governorProxy = await ERC1967Proxy.deploy(await governorImpl.getAddress(), govInit, { gasLimit: 8_000_000 });
	await governorProxy.waitForDeployment();
	console.log(`HyraGovernor proxy: ${await governorProxy.getAddress()}`);

	// Save deployment
	const dir = path.join(__dirname, "..", "deployments");
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `proxy-sepolia-${Date.now()}.json`);
	fs.writeFileSync(
		file,
		JSON.stringify(
			{
				deployer: await deployer.getAddress(),
				vestingImpl: await vestingImpl.getAddress(),
				vestingProxy: await vestingProxy.getAddress(),
				tokenImpl: await tokenImpl.getAddress(),
				tokenProxy: await tokenProxy.getAddress(),
				timelockImpl: await timelockImpl.getAddress(),
				timelockProxy: await timelockProxy.getAddress(),
				governorImpl: await governorImpl.getAddress(),
				governorProxy: await governorProxy.getAddress(),
				distribution: distributionAddresses,
			},
			null,
			2
		)
	);
	console.log(`Saved deployment file: ${file}`);
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
