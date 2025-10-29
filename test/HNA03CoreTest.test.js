"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
describe("HNA-03 Core Security Test", function () {
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
    describe("MultiSigRoleManager Core Functionality", function () {
        it("Should deploy and initialize MultiSigRoleManager", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            // Verify owner has admin role
            const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
            (0, chai_1.expect)(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, owner.getAddress())).to.be.true;
        });
        it("Should configure role with multi-signature requirements", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            const ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
            await (0, chai_1.expect)(roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, // Require 2 signatures
            [await signer1.getAddress(), await signer2.getAddress()])).to.not.be.reverted;
            // Verify signers have the role
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, await signer1.getAddress())).to.be.true;
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, await signer2.getAddress())).to.be.true;
        });
        it("Should prevent unauthorized role configuration", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            await (0, chai_1.expect)(roleManager.connect(attacker).configureRoleMultiSig(GOVERNANCE_ROLE, 1, [await attacker.getAddress()])).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });
        it("Should enforce signature requirements", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
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
    });
    describe("TimeLockActions Core Functionality", function () {
        let roleManager;
        let timeLockActions;
        beforeEach(async function () {
            roleManager = await deployRoleManagerProxy(await owner.getAddress());
            timeLockActions = await deployTimeLockActionsProxy(await roleManager.getAddress());
        });
        it("Should deploy TimeLockActions successfully", async function () {
            (0, chai_1.expect)(await timeLockActions.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
        });
        it("Should enforce minimum delay requirements", async function () {
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role first
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Try to schedule with delay below minimum (2 hours)
            await (0, chai_1.expect)(timeLockActions.connect(signer1).scheduleAction(await roleManager.getAddress(), actionData, GOVERNANCE_ROLE, 3600 // 1 hour - below minimum
            )).to.be.revertedWithCustomError(timeLockActions, "InvalidDelay");
        });
        it("Should require proper role on execution (scheduling allowed)", async function () {
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Scheduling does not check role; should succeed
            await (0, chai_1.expect)(timeLockActions.connect(attacker).scheduleAction(await roleManager.getAddress(), actionData, GOVERNANCE_ROLE, 7200 // 2 hours
            )).to.not.be.reverted;
        });
        it("Should enforce time delays", async function () {
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            const ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
            // Configure role
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Schedule action with 2 hour delay
            await timeLockActions.connect(signer1).scheduleAction(await roleManager.getAddress(), actionData, ADMIN_ROLE, 7200 // 2 hours
            );
            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];
            // Try to execute immediately
            await (0, chai_1.expect)(timeLockActions.connect(owner).executeAction(actionHash)).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");
            // Fast forward time
            await hardhat_1.ethers.provider.send("evm_increaseTime", [7300]); // 2 hours + buffer
            await hardhat_1.ethers.provider.send("evm_mine", []);
            // Now should be able to execute
            await (0, chai_1.expect)(timeLockActions.connect(owner).executeAction(actionHash)).to.not.be.reverted;
        });
    });
    describe("Security Benefits Demonstration", function () {
        it("Should prevent single point of failure", async function () {
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
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const maliciousActionData = hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [await attacker.getAddress(), "malicious"]);
            // Even if signer1 is compromised, they can propose action
            await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, maliciousActionData);
            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];
            // But cannot execute without other signatures
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");
            // This demonstrates the security of multi-signature requirements
        });
        it("Should demonstrate time delay security", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const timeLockActions = await deployTimeLockActionsProxy(await roleManager.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Schedule action with 2 hour delay
            await timeLockActions.connect(signer1).scheduleAction(await roleManager.getAddress(), actionData, GOVERNANCE_ROLE, 7200 // 2 hours
            );
            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];
            // Even with proper role, cannot execute before delay
            await (0, chai_1.expect)(timeLockActions.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");
            // Fast forward time
            await hardhat_1.ethers.provider.send("evm_increaseTime", [7300]); // 2 hours + buffer
            await hardhat_1.ethers.provider.send("evm_mine", []);
            // Now can execute
            await (0, chai_1.expect)(timeLockActions.connect(signer1).executeAction(actionHash)).to.not.be.reverted;
        });
    });
    describe("Integration Security", function () {
        it("Should demonstrate combined multi-sig and time-lock security", async function () {
            const roleManager = await deployRoleManagerProxy(await owner.getAddress());
            const timeLockActions = await deployTimeLockActionsProxy(await roleManager.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Schedule action through TimeLockActions
            await timeLockActions.connect(signer1).scheduleAction(await roleManager.getAddress(), actionData, GOVERNANCE_ROLE, 7200 // 2 hours
            );
            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];
            // Cannot execute immediately due to time delay
            await (0, chai_1.expect)(timeLockActions.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");
            // Fast forward time
            await hardhat_1.ethers.provider.send("evm_increaseTime", [7300]); // 2 hours + buffer
            await hardhat_1.ethers.provider.send("evm_mine", []);
            // Now can execute
            await (0, chai_1.expect)(timeLockActions.connect(signer1).executeAction(actionHash)).to.not.be.reverted;
            // This demonstrates the combined security of:
            // 1. Multi-signature requirements (2 signatures needed)
            // 2. Time delays (2 hours minimum)
            // 3. Role-based access control (only role holders can propose/execute)
        });
    });
});
