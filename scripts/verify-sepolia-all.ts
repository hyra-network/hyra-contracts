// scripts/verify-sepolia-all.ts
import { ethers, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function loadProxyDeployment() {
	const dir = path.join(__dirname, "..", "deployments");
	const files = fs.readdirSync(dir).filter(f => f.startsWith("proxy-sepolia-"));
	if (!files.length) throw new Error("No proxy-sepolia deployment file found");
	const latest = files.sort().pop()!;
	return JSON.parse(fs.readFileSync(path.join(dir, latest), "utf8"));
}

async function main() {
	const info = await loadProxyDeployment();
	const deployer = info.deployer as string;

	const tokenImpl = info.tokenImpl as string;
	const tokenProxy = info.tokenProxy as string;
	const timelockImpl = info.timelockImpl as string;
	const timelockProxy = info.timelockProxy as string;
	const governorImpl = info.governorImpl as string;
	const governorProxy = info.governorProxy as string;

	// Addresses from user message for infra
	const secureProxyAdmin = process.env.SPA_ADDR || "0xC98332Febd0B116632A96Fafb34eF2344162ce56";
	const hyraProxyDeployer = process.env.PROXY_DEPLOYER_ADDR || "0xbD1C0C79f22f555AAb4A1C5e6aaB8fF1aC361f7A";
	const secureExecutorManager = process.env.EXEC_MGR_ADDR || "0xe15699aEA307bB19Aa6557848a62111906D4f740";
	const proxyAdminValidator = process.env.PAV_ADDR || "0x9Ae09f2868234353B1AD3540ED80C1c1b653935C";
    const vestingImpl = info.vestingImpl as string; // TokenVesting impl
    const vestingProxy = info.vestingProxy as string | undefined; // optional in older files

	console.log("Verifying implementations...");
    for (const v of [
        { address: tokenImpl, name: "HyraToken impl" },
        { address: timelockImpl, name: "HyraTimelock impl" },
        { address: governorImpl, name: "HyraGovernor impl" },
        { address: vestingImpl, name: "TokenVesting impl" },
        { address: hyraProxyDeployer, name: "HyraProxyDeployer" },
        { address: secureExecutorManager, name: "SecureExecutorManager" },
        { address: proxyAdminValidator, name: "ProxyAdminValidator" },
    ]) {
        try {
            await run("verify:verify", { address: v.address });
        } catch (e) {
            console.warn(`Skip/failed verify for ${v.name} at ${v.address}:`, (e as any)?.message || e);
        }
    }

	console.log("Verifying SecureProxyAdmin (with constructor args)...");
    try {
        await run("verify:verify", {
            address: secureProxyAdmin,
            constructorArguments: [deployer, 1],
        });
    } catch (e) {
        console.warn(`Skip/failed verify for SecureProxyAdmin at ${secureProxyAdmin}:`, (e as any)?.message || e);
    }

	console.log("Building proxy constructor init data...");
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenInit = HyraToken.interface.encodeFunctionData("initialize", [
        "Hyra Token",
        "HYRA",
        ethers.parseEther("1000000"),
        vestingProxy ?? deployer, // prefer vestingProxy if present
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

	console.log("Verifying proxies (ERC1967Proxy)...");
    for (const p of [
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
        } catch (e) {
            console.warn(`Skip/failed verify for ${p.name} at ${p.addr}:`, (e as any)?.message || e);
        }
    }

	console.log("All verifications attempted.");
}

if (require.main === module) {
	main().catch((e) => {
		console.error(e);
		process.exit(1);
	});
}
