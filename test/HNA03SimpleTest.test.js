"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
describe("HNA-03 Simple Security Test", function () {
    let owner;
    let signer1;
    let signer2;
    let attacker;
    beforeEach(async function () {
        [owner, signer1, signer2, attacker] = await hardhat_1.ethers.getSigners();
    });
    describe("MultiSigRoleManager Basic Functionality", function () {
        it("Should deploy MultiSigRoleManager successfully", async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            const roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
            // Check that owner has admin role
            const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
            (0, chai_1.expect)(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, owner.getAddress())).to.be.true;
        });
        it("Should configure role with multi-signature requirements", async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            const roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            await (0, chai_1.expect)(roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, // Require 2 signatures
            [await signer1.getAddress(), await signer2.getAddress()])).to.not.be.reverted;
            // Check that signers have the role
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, await signer1.getAddress())).to.be.true;
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, await signer2.getAddress())).to.be.true;
        });
        it("Should prevent unauthorized role configuration", async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            const roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            await (0, chai_1.expect)(roleManager.connect(attacker).configureRoleMultiSig(GOVERNANCE_ROLE, 1, [await attacker.getAddress()])).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });
    });
    describe("TimeLockActions Basic Functionality", function () {
        let roleManager;
        let timeLockActions;
        beforeEach(async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
            const TimeLockActionsFactory = await hardhat_1.ethers.getContractFactory("TimeLockActions");
            const tlaImpl = await TimeLockActionsFactory.deploy();
            await tlaImpl.waitForDeployment();
            const tlaInit = TimeLockActionsFactory.interface.encodeFunctionData("initialize", [await roleManager.getAddress()]);
            const tlaProxy = await ERC1967Proxy.deploy(await tlaImpl.getAddress(), tlaInit);
            await tlaProxy.waitForDeployment();
            timeLockActions = TimeLockActionsFactory.attach(await tlaProxy.getAddress());
        });
        it("Should deploy TimeLockActions successfully", async function () {
            (0, chai_1.expect)(await timeLockActions.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
        });
        it("Should enforce minimum delay requirements", async function () {
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role first
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Try to schedule with delay below minimum
            await (0, chai_1.expect)(timeLockActions.connect(signer1).scheduleAction(await roleManager.getAddress(), actionData, GOVERNANCE_ROLE, 1 // 1 second - below minimum
            )).to.be.revertedWithCustomError(timeLockActions, "InvalidDelay");
        });
        it("Should prevent unauthorized action scheduling", async function () {
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Try to schedule action without proper role
            await (0, chai_1.expect)(timeLockActions.connect(attacker).scheduleAction(await roleManager.getAddress(), actionData, GOVERNANCE_ROLE, 3600 // 1 hour
            )).to.be.reverted;
        });
    });
    describe("Security Benefits Verification", function () {
        it("Should demonstrate multi-signature security", async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            const roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
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
            // After enough signatures, action auto-executes; a manual execute should revert
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.reverted;
        });
        it("Should demonstrate time delay security", async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            const roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
            const TimeLockActionsFactory = await hardhat_1.ethers.getContractFactory("TimeLockActions");
            const tlaImpl = await TimeLockActionsFactory.deploy();
            await tlaImpl.waitForDeployment();
            const tlaInit = TimeLockActionsFactory.interface.encodeFunctionData("initialize", [await roleManager.getAddress()]);
            const tlaProxy = await ERC1967Proxy.deploy(await tlaImpl.getAddress(), tlaInit);
            await tlaProxy.waitForDeployment();
            const timeLockActions = TimeLockActionsFactory.attach(await tlaProxy.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Schedule action with minimum delay (48 hours)
            await timeLockActions.connect(signer1).scheduleAction(await roleManager.getAddress(), actionData, GOVERNANCE_ROLE, 48 * 3600);
            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];
            // Try to execute immediately
            await (0, chai_1.expect)(timeLockActions.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");
            // Fast forward time to surpass delay
            await hardhat_1.ethers.provider.send("evm_increaseTime", [48 * 3600 + 1]);
            await hardhat_1.ethers.provider.send("evm_mine", []);
            // Now should be able to execute
            await (0, chai_1.expect)(timeLockActions.connect(signer1).executeAction(actionHash)).to.not.be.reverted;
        });
    });
    describe("Attack Scenarios", function () {
        it("Should prevent single point of failure attacks", async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            const roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            // Simulate attacker trying to take control
            const maliciousActionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Attacker cannot propose action without proper role
            await (0, chai_1.expect)(roleManager.connect(attacker).proposeAction(GOVERNANCE_ROLE, maliciousActionData)).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });
        it("Should prevent compromised signer from acting alone", async function () {
            const MultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("MultiSigRoleManager");
            const impl = await MultiSigRoleManagerFactory.deploy();
            await impl.waitForDeployment();
            const initData = MultiSigRoleManagerFactory.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
            const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
            const proxy = await ERC1967Proxy.deploy(await impl.getAddress(), initData);
            await proxy.waitForDeployment();
            const roleManager = MultiSigRoleManagerFactory.attach(await proxy.getAddress());
            const GOVERNANCE_ROLE = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const maliciousActionData = (await hardhat_1.ethers.getContractAt("MultiSigRoleManager", await roleManager.getAddress())).interface.encodeFunctionData("getRoleSigners", [GOVERNANCE_ROLE]);
            // Even if signer1 is compromised, they can propose action
            await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, maliciousActionData);
            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];
            // But cannot execute without other signatures
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");
            // Other signers can prevent execution by not signing
            // This demonstrates the security of multi-signature requirements
        });
    });
});
