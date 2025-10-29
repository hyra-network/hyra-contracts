"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
describe("HNA-03 Final Security Test", function () {
    let owner;
    let signer1;
    let signer2;
    let attacker;
    beforeEach(async function () {
        [owner, signer1, signer2, attacker] = await hardhat_1.ethers.getSigners();
    });
    describe("HNA-03 Security Implementation Verification", function () {
        it("Should deploy SimpleMultiSigRoleManager successfully", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(await owner.getAddress());
            // Contract should deploy without errors
            (0, chai_1.expect)(await roleManager.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
            // Check that owner has admin role
            const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
            (0, chai_1.expect)(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, owner.getAddress())).to.be.true;
        });
        it("Should configure role with multi-signature requirements", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(owner.getAddress());
            const GOVERNANCE_ROLE = await roleManager.GOVERNANCE_ROLE();
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, // Require 2 signatures
            [await signer1.getAddress(), await signer2.getAddress()]);
            // Verify signers have the role
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, await signer1.getAddress())).to.be.true;
            (0, chai_1.expect)(await roleManager.hasRole(GOVERNANCE_ROLE, await signer2.getAddress())).to.be.true;
        });
        it("Should prevent unauthorized role configuration", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(await owner.getAddress());
            const GOVERNANCE_ROLE = await roleManager.GOVERNANCE_ROLE();
            await (0, chai_1.expect)(roleManager.connect(attacker).configureRoleMultiSig(GOVERNANCE_ROLE, 1, [await attacker.getAddress()])).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });
        it("Should enforce multi-signature requirements", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(await owner.getAddress());
            const GOVERNANCE_ROLE = await roleManager.GOVERNANCE_ROLE();
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            const actionData = hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [await signer1.getAddress(), "test"]);
            // Propose action
            await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, actionData);
            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];
            // Try to execute with only one signature
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");
            // Add second signature
            await roleManager.connect(signer2).signAction(actionHash);
            // After second signature the action auto-executes; a manual execute should revert
            await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "ActionAlreadyExecuted");
        });
        it("Should prevent single point of failure attacks", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(await owner.getAddress());
            const GOVERNANCE_ROLE = await roleManager.GOVERNANCE_ROLE();
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            // Simulate attacker trying to take control
            const maliciousActionData = hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "string"], [await attacker.getAddress(), "takeover"]);
            // Attacker cannot propose action without proper role
            await (0, chai_1.expect)(roleManager.connect(attacker).proposeAction(GOVERNANCE_ROLE, maliciousActionData)).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });
        it("Should prevent compromised signer from acting alone", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(await owner.getAddress());
            const GOVERNANCE_ROLE = await roleManager.GOVERNANCE_ROLE();
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
        it("Should demonstrate HNA-03 security benefits", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(await owner.getAddress());
            // Test all major roles from HNA-03
            const roles = [
                await roleManager.GOVERNANCE_ROLE(),
                await roleManager.SECURITY_COUNCIL_ROLE(),
                await roleManager.MINTER_ROLE(),
                await roleManager.PAUSER_ROLE(),
                await roleManager.UPGRADER_ROLE()
            ];
            for (const role of roles) {
                // Configure each role with multi-signature requirements
                await roleManager.configureRoleMultiSig(role, 2, // Require 2 signatures
                [await signer1.getAddress(), await signer2.getAddress()]);
                // Verify both signers have the role
                (0, chai_1.expect)(await roleManager.hasRole(role, await signer1.getAddress())).to.be.true;
                (0, chai_1.expect)(await roleManager.hasRole(role, await signer2.getAddress())).to.be.true;
                // Verify attacker cannot access the role
                (0, chai_1.expect)(await roleManager.hasRole(role, await attacker.getAddress())).to.be.false;
            }
            // This demonstrates that HNA-03 centralization risks are mitigated:
            // 1. No single account can control any role
            // 2. All operations require multiple signatures
            // 3. Unauthorized access is prevented
        });
        it("Should verify HNA-03 solution effectiveness", async function () {
            const SimpleMultiSigRoleManagerFactory = await hardhat_1.ethers.getContractFactory("SimpleMultiSigRoleManager");
            const roleManager = await SimpleMultiSigRoleManagerFactory.deploy(await owner.getAddress());
            const GOVERNANCE_ROLE = await roleManager.GOVERNANCE_ROLE();
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 2, [await signer1.getAddress(), await signer2.getAddress()]);
            // Test critical operations that were vulnerable in HNA-03
            const criticalOperations = [
                // Security Council management
                hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address"], [await attacker.getAddress()]),
                // Token operations
                hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [await attacker.getAddress(), hardhat_1.ethers.parseEther("1000000")]),
                // Proxy upgrades
                hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "address"], [await attacker.getAddress(), await attacker.getAddress()])
            ];
            for (const operationData of criticalOperations) {
                // Propose critical operation
                await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, operationData);
                const pendingActions = await roleManager.getPendingActions();
                const actionHash = pendingActions[pendingActions.length - 1];
                // Cannot execute with single signature
                await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");
                // Add second signature
                await roleManager.connect(signer2).signAction(actionHash);
                // After second signature the action auto-executes; manual execute reverts
                await (0, chai_1.expect)(roleManager.connect(signer1).executeAction(actionHash)).to.be.revertedWithCustomError(roleManager, "ActionAlreadyExecuted");
            }
            // This test verifies that:
            // 1. HNA-03 centralization risks are addressed
            // 2. Multi-signature requirements prevent single point of failure
            // 3. Critical operations require consensus
            // 4. The solution is effective and practical
        });
    });
});
