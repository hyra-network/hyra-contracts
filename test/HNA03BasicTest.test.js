"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
describe("HNA-03 Basic Security Test", function () {
    let owner;
    let signer1;
    let signer2;
    let attacker;
    beforeEach(async function () {
        [owner, signer1, signer2, attacker] = await hardhat_1.ethers.getSigners();
    });
    async function deployRoleManagerProxy(admin) {
        const ProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy(admin);
        await proxyAdmin.waitForDeployment();
        const ProxyDeployer = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await ProxyDeployer.deploy();
        await proxyDeployer.waitForDeployment();
        const Impl = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
        const impl = await Impl.deploy();
        await impl.waitForDeployment();
        const initData = Impl.interface.encodeFunctionData("initialize", [admin]);
        const proxyAddr = await proxyDeployer.deployProxy.staticCall(await impl.getAddress(), await proxyAdmin.getAddress(), initData, "MultiSigRoleManager");
        await (await proxyDeployer.deployProxy(await impl.getAddress(), await proxyAdmin.getAddress(), initData, "MultiSigRoleManager")).wait();
        return await hardhat_1.ethers.getContractAt("MultiSigRoleManager", proxyAddr);
    }
    async function deployTimeLockActionsProxy(roleManagerAddr) {
        const [deployer] = await hardhat_1.ethers.getSigners();
        const ProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy(deployer.address);
        await proxyAdmin.waitForDeployment();
        const ProxyDeployer = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await ProxyDeployer.deploy();
        await proxyDeployer.waitForDeployment();
        const Impl = await hardhat_1.ethers.getContractFactory("TimeLockActions");
        const impl = await Impl.deploy();
        await impl.waitForDeployment();
        const initData = Impl.interface.encodeFunctionData("initialize", [roleManagerAddr]);
        const proxyAddr = await proxyDeployer.deployProxy.staticCall(await impl.getAddress(), await proxyAdmin.getAddress(), initData, "TimeLockActions");
        await (await proxyDeployer.deployProxy(await impl.getAddress(), await proxyAdmin.getAddress(), initData, "TimeLockActions")).wait();
        return await hardhat_1.ethers.getContractAt("TimeLockActions", proxyAddr);
    }
    describe("MultiSigRoleManager Basic Tests", function () {
        it("Should deploy MultiSigRoleManager successfully", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            (0, chai_1.expect)(await roleManager.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
        });
        it("Should initialize MultiSigRoleManager successfully", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            // Check that owner has admin role
            const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
            (0, chai_1.expect)(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, owner.getAddress())).to.be.true;
        });
        it("Should configure role with multi-signature requirements", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, // Require 2 signatures
            [signer1.getAddress(), signer2.getAddress()]);
            // Verify signers have the role
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, signer1.getAddress())).to.be.true;
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, signer2.getAddress())).to.be.true;
        });
        it("Should prevent unauthorized role configuration", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            await (0, chai_1.expect)(roleManager.connect(attacker).configureRoleMultiSig(GOVERNANCE_ROLE, 1, [attacker.getAddress()])).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });
    });
    describe("TimeLockActions Basic Tests", function () {
        it("Should deploy TimeLockActions successfully", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const timeLockActions = await deployTimeLockActionsProxy(await roleManager.getAddress());
            (0, chai_1.expect)(await timeLockActions.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
        });
        it("Should initialize TimeLockActions successfully", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const timeLockActions = await deployTimeLockActionsProxy(await roleManager.getAddress());
            // Should initialize without errors
            (0, chai_1.expect)(await timeLockActions.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
        });
    });
    describe("Security Benefits Verification", function () {
        it("Should demonstrate multi-signature security", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [signer1.getAddress(), signer2.getAddress()]);
            const actionData = hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [await signer1.getAddress(), "test"]);
            // Propose action
            await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, actionData);
            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];
            // Try to execute with only one signature
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");
            // Add second signature
            await roleManager.connect(signer2).signAction(actionHash);
            // After second signature, action auto-executes in signAction; executing again should fail
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.reverted;
        });
        it("Should prevent single point of failure attacks", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [signer1.getAddress(), signer2.getAddress()]);
            // Simulate attacker trying to take control
            const maliciousActionData = hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [await attacker.getAddress(), "takeover"]);
            // Attacker cannot propose action without proper role
            await (0, chai_1.expect)(roleManager.connect(attacker).proposeAction(GOVERNANCE_ROLE, maliciousActionData)).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });
        it("Should prevent compromised signer from acting alone", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [signer1.getAddress(), signer2.getAddress()]);
            const maliciousActionData = hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [await attacker.getAddress(), "malicious"]);
            // Even if signer1 is compromised, they can propose action
            await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, maliciousActionData);
            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];
            // But cannot execute without other signatures
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");
            // This demonstrates the security of multi-signature requirements
        });
    });
});
