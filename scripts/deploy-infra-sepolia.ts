// scripts/deploy-infra-sepolia.ts
import { ethers } from "hardhat";

async function main() {
	const [deployer] = await ethers.getSigners();
	console.log(`Deployer: ${await deployer.getAddress()}`);

	// SecureProxyAdmin (constructor)
	const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
	const proxyAdmin = await SecureProxyAdmin.deploy(await deployer.getAddress(), 1);
	await proxyAdmin.waitForDeployment();
	console.log(`SecureProxyAdmin: ${await proxyAdmin.getAddress()}`);

	// HyraProxyDeployer (no init)
	const HyraProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
	const proxyDeployer = await HyraProxyDeployer.deploy();
	await proxyDeployer.waitForDeployment();
	console.log(`HyraProxyDeployer: ${await proxyDeployer.getAddress()}`);

	// SecureExecutorManager (initialize)
	const SecureExecutorManager = await ethers.getContractFactory("SecureExecutorManager");
	const execMgr = await SecureExecutorManager.deploy();
	await execMgr.waitForDeployment();
	await (await execMgr.initialize(await deployer.getAddress(), [await deployer.getAddress()])).wait();
	console.log(`SecureExecutorManager: ${await execMgr.getAddress()}`);

	// ProxyAdminValidator (initialize)
	const ProxyAdminValidator = await ethers.getContractFactory("ProxyAdminValidator");
	const pav = await ProxyAdminValidator.deploy();
	await pav.waitForDeployment();
	await (await pav.initialize(await deployer.getAddress())).wait();
	console.log(`ProxyAdminValidator: ${await pav.getAddress()}`);

	// Save
	const fs = require("fs");
	const path = require("path");
	const dir = path.join(__dirname, "..", "deployments");
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, `infra-sepolia-${Date.now()}.json`);
	fs.writeFileSync(
		file,
		JSON.stringify(
			{
				deployer: await deployer.getAddress(),
				secureProxyAdmin: await proxyAdmin.getAddress(),
				hyraProxyDeployer: await proxyDeployer.getAddress(),
				secureExecutorManager: await execMgr.getAddress(),
				proxyAdminValidator: await pav.getAddress(),
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
