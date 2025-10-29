// scripts/deploy-proxy-sepolia.ts
import { ethers } from "hardhat";

async function main() {
	const [deployer] = await ethers.getSigners();
	console.log(`Deployer: ${await deployer.getAddress()}`);
	console.log(`Balance: ${ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress()))} ETH`);

	const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");

	// TokenVesting implementation + init later if needed
	const TokenVesting = await ethers.getContractFactory("TokenVesting");
	const vestingImpl = await TokenVesting.deploy();
	await vestingImpl.waitForDeployment();
	console.log(`TokenVesting impl: ${await vestingImpl.getAddress()}`);

	// HyraToken impl + proxy with initialize
	const HyraToken = await ethers.getContractFactory("HyraToken");
	const tokenImpl = await HyraToken.deploy();
	await tokenImpl.waitForDeployment();
    const tokenInit = HyraToken.interface.encodeFunctionData("initializeLegacy", [
        "Hyra Token",
        "HYRA",
        ethers.parseEther("1000000"),
        await deployer.getAddress(),
        await deployer.getAddress(),
    ]);
	const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), tokenInit);
	await tokenProxy.waitForDeployment();
	console.log(`HyraToken proxy: ${await tokenProxy.getAddress()}`);

    // Optionally initialize vesting later if needed

	// HyraTimelock impl + proxy with initialize
	const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
	const timelockImpl = await HyraTimelock.deploy();
	await timelockImpl.waitForDeployment();
	const tlInit = HyraTimelock.interface.encodeFunctionData("initialize", [
		86400,
		[await deployer.getAddress()],
		[await deployer.getAddress()],
		await deployer.getAddress(),
	]);
	const timelockProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), tlInit);
	await timelockProxy.waitForDeployment();
	console.log(`HyraTimelock proxy: ${await timelockProxy.getAddress()}`);

	// HyraGovernor impl + proxy with initialize
	const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
	const governorImpl = await HyraGovernor.deploy();
	await governorImpl.waitForDeployment();
	const govInit = HyraGovernor.interface.encodeFunctionData("initialize", [
		await tokenProxy.getAddress(),
		await timelockProxy.getAddress(),
		1,
		100,
		ethers.parseEther("1000000"),
		10,
	]);
	const governorProxy = await ERC1967Proxy.deploy(await governorImpl.getAddress(), govInit);
	await governorProxy.waitForDeployment();
	console.log(`HyraGovernor proxy: ${await governorProxy.getAddress()}`);

	// Save deployment
	const fs = require("fs");
	const path = require("path");
	const dir = path.join(__dirname, "..", "deployments");
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `proxy-sepolia-${Date.now()}.json`);
	fs.writeFileSync(
		file,
		JSON.stringify(
			{
				deployer: await deployer.getAddress(),
				vestingImpl: await vestingImpl.getAddress(),
				tokenImpl: await tokenImpl.getAddress(),
				tokenProxy: await tokenProxy.getAddress(),
				timelockImpl: await timelockImpl.getAddress(),
				timelockProxy: await timelockProxy.getAddress(),
				governorImpl: await governorImpl.getAddress(),
				governorProxy: await governorProxy.getAddress(),
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
