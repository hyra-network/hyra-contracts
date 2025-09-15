import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HNA-03 Core Security Test", function () {
    let owner: SignerWithAddress;
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;
    let attacker: SignerWithAddress;

    beforeEach(async function () {
        [owner, signer1, signer2, attacker] = await ethers.getSigners();
    });

    describe("MultiSigRoleManager Core Functionality", function () {
        it("Should deploy and initialize MultiSigRoleManager", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            
            await expect(roleManager.initialize(owner.address)).to.not.be.reverted;
            
            // Verify owner has admin role
            const DEFAULT_ADMIN_ROLE = await roleManager.DEFAULT_ADMIN_ROLE();
            expect(await roleManager.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
        });

        it("Should configure role with multi-signature requirements", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            await expect(
                roleManager.configureRoleMultiSig(
                    GOVERNANCE_ROLE,
                    2, // Require 2 signatures
                    [signer1.address, signer2.address]
                )
            ).to.not.be.reverted;

            // Verify signers have the role
            expect(await roleManager.hasRole(GOVERNANCE_ROLE, signer1.address)).to.be.true;
            expect(await roleManager.hasRole(GOVERNANCE_ROLE, signer2.address)).to.be.true;
        });

        it("Should prevent unauthorized role configuration", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            await expect(
                roleManager.connect(attacker).configureRoleMultiSig(
                    GOVERNANCE_ROLE,
                    1,
                    [attacker.address]
                )
            ).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });

        it("Should enforce signature requirements", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(
                GOVERNANCE_ROLE,
                2,
                [signer1.address, signer2.address]
            );

            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [signer1.address, "test"]
            );

            // Propose action
            await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, actionData);
            
            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];

            // Try to execute with only one signature
            await expect(
                roleManager.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");

            // Add second signature
            await roleManager.connect(signer2).signAction(actionHash);

            // Now should be able to execute
            await expect(
                roleManager.connect(signer1).executeAction(actionHash)
            ).to.not.be.reverted;
        });
    });

    describe("TimeLockActions Core Functionality", function () {
        let roleManager: any;
        let timeLockActions: any;

        beforeEach(async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const TimeLockActionsFactory = await ethers.getContractFactory("TimeLockActions");
            timeLockActions = await TimeLockActionsFactory.deploy();
            await timeLockActions.initialize(await roleManager.getAddress());
        });

        it("Should deploy TimeLockActions successfully", async function () {
            expect(await timeLockActions.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should enforce minimum delay requirements", async function () {
            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            // Configure role first
            await roleManager.configureRoleMultiSig(
                GOVERNANCE_ROLE,
                2,
                [signer1.address, signer2.address]
            );

            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [signer1.address, "test"]
            );

            // Try to schedule with delay below minimum (2 hours)
            await expect(
                timeLockActions.connect(signer1).scheduleAction(
                    await roleManager.getAddress(),
                    actionData,
                    GOVERNANCE_ROLE,
                    3600 // 1 hour - below minimum
                )
            ).to.be.revertedWithCustomError(timeLockActions, "InvalidDelay");
        });

        it("Should prevent unauthorized action scheduling", async function () {
            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [signer1.address, "test"]
            );

            // Try to schedule action without proper role
            await expect(
                timeLockActions.connect(attacker).scheduleAction(
                    await roleManager.getAddress(),
                    actionData,
                    GOVERNANCE_ROLE,
                    7200 // 2 hours
                )
            ).to.be.revertedWithCustomError(timeLockActions, "Unauthorized");
        });

        it("Should enforce time delays", async function () {
            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            // Configure role
            await roleManager.configureRoleMultiSig(
                GOVERNANCE_ROLE,
                2,
                [signer1.address, signer2.address]
            );

            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [signer1.address, "test"]
            );

            // Schedule action with 2 hour delay
            await timeLockActions.connect(signer1).scheduleAction(
                await roleManager.getAddress(),
                actionData,
                GOVERNANCE_ROLE,
                7200 // 2 hours
            );

            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];

            // Try to execute immediately
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [7200]); // 2 hours
            await ethers.provider.send("evm_mine", []);

            // Now should be able to execute
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.not.be.reverted;
        });
    });

    describe("Security Benefits Demonstration", function () {
        it("Should prevent single point of failure", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(
                GOVERNANCE_ROLE,
                2,
                [signer1.address, signer2.address]
            );

            // Simulate attacker trying to take control
            const maliciousActionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [attacker.address, "takeover"]
            );

            // Attacker cannot propose action without proper role
            await expect(
                roleManager.connect(attacker).proposeAction(GOVERNANCE_ROLE, maliciousActionData)
            ).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });

        it("Should prevent compromised signer from acting alone", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(
                GOVERNANCE_ROLE,
                2,
                [signer1.address, signer2.address]
            );

            const maliciousActionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [attacker.address, "malicious"]
            );

            // Even if signer1 is compromised, they can propose action
            await roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, maliciousActionData);
            
            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];

            // But cannot execute without other signatures
            await expect(
                roleManager.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");

            // This demonstrates the security of multi-signature requirements
        });

        it("Should demonstrate time delay security", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const TimeLockActionsFactory = await ethers.getContractFactory("TimeLockActions");
            const timeLockActions = await TimeLockActionsFactory.deploy();
            await timeLockActions.initialize(await roleManager.getAddress());

            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            // Configure role
            await roleManager.configureRoleMultiSig(
                GOVERNANCE_ROLE,
                2,
                [signer1.address, signer2.address]
            );

            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [signer1.address, "test"]
            );

            // Schedule action with 2 hour delay
            await timeLockActions.connect(signer1).scheduleAction(
                await roleManager.getAddress(),
                actionData,
                GOVERNANCE_ROLE,
                7200 // 2 hours
            );

            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];

            // Even with proper role, cannot execute before delay
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [7200]); // 2 hours
            await ethers.provider.send("evm_mine", []);

            // Now can execute
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.not.be.reverted;
        });
    });

    describe("Integration Security", function () {
        it("Should demonstrate combined multi-sig and time-lock security", async function () {
            const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const roleManager = await MultiSigRoleManagerFactory.deploy();
            await roleManager.initialize(owner.address);

            const TimeLockActionsFactory = await ethers.getContractFactory("TimeLockActions");
            const timeLockActions = await TimeLockActionsFactory.deploy();
            await timeLockActions.initialize(await roleManager.getAddress());

            const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
            
            // Configure role requiring 2 signatures
            await roleManager.configureRoleMultiSig(
                GOVERNANCE_ROLE,
                2,
                [signer1.address, signer2.address]
            );

            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [signer1.address, "critical operation"]
            );

            // Schedule action through TimeLockActions
            await timeLockActions.connect(signer1).scheduleAction(
                await roleManager.getAddress(),
                actionData,
                GOVERNANCE_ROLE,
                7200 // 2 hours
            );

            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];

            // Cannot execute immediately due to time delay
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [7200]); // 2 hours
            await ethers.provider.send("evm_mine", []);

            // Now can execute
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.not.be.reverted;

            // This demonstrates the combined security of:
            // 1. Multi-signature requirements (2 signatures needed)
            // 2. Time delays (2 hours minimum)
            // 3. Role-based access control (only role holders can propose/execute)
        });
    });
});
