// scripts/verify-base-sepolia.ts
import { ethers, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

function loadLatest(prefix: string) {
	const dir = path.join(__dirname, "..", "deployments");
	const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix));
	if (!files.length) throw new Error(`No ${prefix} deployment file found`);
	const latest = files.sort().pop()!;
	return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

async function main() {
	const infra = loadLatest("infra-sepolia-");
	const info = loadLatest("proxy-sepolia-");

	const deployer = infra.deployer as string;

	const vestingImpl = info.vestingImpl as string;
	const vestingProxy = info.vestingProxy as string;
	const tokenImpl = info.tokenImpl as string;
	const tokenProxy = info.tokenProxy as string;
	const timelockImpl = info.timelockImpl as string;
	const timelockProxy = info.timelockProxy as string;
	const governorImpl = info.governorImpl as string;
	const governorProxy = info.governorProxy as string;

	const secureProxyAdmin = infra.secureProxyAdmin as string;
	const hyraProxyDeployer = infra.hyraProxyDeployer as string;
	const secureExecutorManager = infra.secureExecutorManager as string;
	const proxyAdminValidator = infra.proxyAdminValidator as string;

	console.log("Verifying implementations (Base Sepolia)...");
	for (const v of [
		{ address: vestingImpl, name: "TokenVesting impl" },
		{ address: tokenImpl, name: "HyraToken impl" },
		{ address: timelockImpl, name: "HyraTimelock impl" },
		{ address: governorImpl, name: "HyraGovernor impl", fq: "contracts/core/HyraGovernor.sol:HyraGovernor" },
		{ address: hyraProxyDeployer, name: "HyraProxyDeployer" },
		{ address: secureExecutorManager, name: "SecureExecutorManager" },
		{ address: proxyAdminValidator, name: "ProxyAdminValidator" },
	]) {
		try {
			if ((v as any).fq) {
				await run("verify:verify", { address: v.address, contract: (v as any).fq });
			} else {
				await run("verify:verify", { address: v.address });
			}
			console.log(`Verified: ${v.name} at ${v.address}`);
		} catch (e) {
			console.warn(`Skip/failed verify for ${v.name} at ${v.address}:`, (e as any)?.message || e);
		}
	}

	console.log("Verifying SecureProxyAdmin (constructor args)...");
	try {
		await run("verify:verify", {
			address: secureProxyAdmin,
			constructorArguments: [deployer, 1],
		});
		console.log(`Verified: SecureProxyAdmin at ${secureProxyAdmin}`);
	} catch (e) {
		console.warn(`Skip/failed verify for SecureProxyAdmin at ${secureProxyAdmin}:`, (e as any)?.message || e);
	}

	console.log("Building init data for proxies...");
	const HyraToken = await ethers.getContractFactory("HyraToken");
	const tokenInit = HyraToken.interface.encodeFunctionData("initialize", [
		"Hyra Token",
		"HYRA",
		ethers.parseEther("1000000"),
		vestingProxy,
		timelockProxy,
	]);
	const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
	const tlInit = HyraTimelock.interface.encodeFunctionData("initialize", [
		86400,
		[deployer],
		[deployer],
		deployer,
	]);
	const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
	const govInit = HyraGovernor.interface.encodeFunctionData("initialize", [
		tokenProxy,
		timelockProxy,
		1,
		100,
		ethers.parseEther("1000000"),
		10,
	]);

	console.log("Verifying ERC1967 proxies (Base Sepolia)...");
	for (const p of [
		{ addr: vestingProxy, impl: vestingImpl, data: "0x", name: "TokenVesting proxy" },
		{ addr: tokenProxy, impl: tokenImpl, data: tokenInit, name: "HyraToken proxy" },
		{ addr: timelockProxy, impl: timelockImpl, data: tlInit, name: "HyraTimelock proxy" },
		{ addr: governorProxy, impl: governorImpl, data: govInit, name: "HyraGovernor proxy" },
	]) {
		try {
			await run("verify:verify", {
				address: p.addr,
				constructorArguments: [p.impl, p.data],
				contract: "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol:ERC1967Proxy",
			});
			console.log(`Verified: ${p.name} at ${p.addr}`);
		} catch (e) {
			console.warn(`Skip/failed verify for ${p.name} at ${p.addr}:`, (e as any)?.message || e);
		}
	}

	console.log("All Base Sepolia verifications attempted.");
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
