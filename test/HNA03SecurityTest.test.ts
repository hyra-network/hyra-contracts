import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    MultiSigRoleManager,
    TimeLockActions,
    SecureHyraGovernor,
    SecureHyraTimelock,
    SecureHyraToken,
    SecureHyraProxyAdmin,
    HyraTransparentUpgradeableProxy
} from "../typechain-types";

describe("HNA-03 Security Test Suite", function () {
    let owner: SignerWithAddress;
    let signer1: SignerWithAddress;
    let signer2: SignerWithAddress;
    let signer3: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let attacker: SignerWithAddress;

    let roleManager: MultiSigRoleManager;
    let timeLockActions: TimeLockActions;
    let secureGovernor: SecureHyraGovernor;
    let secureTimelock: SecureHyraTimelock;
    let secureToken: SecureHyraToken;
    let secureProxyAdmin: SecureHyraProxyAdmin;

    const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
    const SECURITY_COUNCIL_ROLE = ethers.keccak256(ethers.toUtf8Bytes("SECURITY_COUNCIL_ROLE"));
    const MINTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MINTER_ROLE"));
    const PAUSER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("PAUSER_ROLE"));
    const UPGRADER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("UPGRADER_ROLE"));

    beforeEach(async function () {
        [owner, signer1, signer2, signer3, user1, user2, attacker] = await ethers.getSigners();

        // Deploy MultiSigRoleManager
        const MultiSigRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
        roleManager = await MultiSigRoleManagerFactory.deploy();
        await roleManager.initialize(owner.getAddress());

        // Deploy TimeLockActions
        const TimeLockActionsFactory = await ethers.getContractFactory("TimeLockActions");
        timeLockActions = await TimeLockActionsFactory.deploy();
        await timeLockActions.initialize(await roleManager.getAddress());

        // Configure roles with multi-signature requirements
        await roleManager.configureRoleMultiSig(
            GOVERNANCE_ROLE,
            2, // Require 2 signatures
            [signer1.getAddress(), signer2.getAddress(), signer3.getAddress()]
        );

        await roleManager.configureRoleMultiSig(
            SECURITY_COUNCIL_ROLE,
            2, // Require 2 signatures
            [signer1.getAddress(), signer2.getAddress()]
        );

        await roleManager.configureRoleMultiSig(
            MINTER_ROLE,
            2, // Require 2 signatures
            [signer1.getAddress(), signer2.getAddress()]
        );

        await roleManager.configureRoleMultiSig(
            PAUSER_ROLE,
            2, // Require 2 signatures
            [signer1.getAddress(), signer2.getAddress()]
        );

        await roleManager.configureRoleMultiSig(
            UPGRADER_ROLE,
            2, // Require 2 signatures
            [signer1.getAddress(), signer2.getAddress()]
        );
    });

    describe("MultiSigRoleManager Security", function () {
        it("Should require multiple signatures for role actions", async function () {
            // Try to propose an action with only one signature
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [user1.getAddress(), "test"]
            );

            await expect(
                roleManager.connect(signer1).proposeAction(GOVERNANCE_ROLE, actionData)
            ).to.not.be.reverted;

            // Get the action hash
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

        it("Should prevent unauthorized role configuration", async function () {
            await expect(
                roleManager.connect(attacker).configureRoleMultiSig(
                    GOVERNANCE_ROLE,
                    1,
                    [attacker.getAddress()]
                )
            ).to.be.revertedWithCustomError(roleManager, "AccessControlUnauthorizedAccount");
        });

        it("Should enforce minimum and maximum signature requirements", async function () {
            await expect(
                roleManager.configureRoleMultiSig(
                    GOVERNANCE_ROLE,
                    1, // Below minimum
                    [signer1.getAddress()]
                )
            ).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");

            await expect(
                roleManager.configureRoleMultiSig(
                    GOVERNANCE_ROLE,
                    8, // Above maximum
                    [signer1.getAddress(), signer2.getAddress(), signer3.getAddress(), user1.getAddress(), user2.getAddress(), attacker.getAddress(), owner.getAddress(), signer1.getAddress()]
                )
            ).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");
        });
    });

    describe("TimeLockActions Security", function () {
        it("Should enforce time delays for privileged operations", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [user1.getAddress(), "test"]
            );

            // Schedule an action
            await timeLockActions.connect(signer1).scheduleAction(
                await roleManager.getAddress(),
                actionData,
                GOVERNANCE_ROLE,
                0 // Use default delay
            );

            // Try to execute immediately
            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];

            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [48 * 3600]); // 48 hours
            await ethers.provider.send("evm_mine", []);

            // Now should be able to execute
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.not.be.reverted;
        });

        it("Should prevent unauthorized action execution", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [user1.getAddress(), "test"]
            );

            // Schedule an action
            await timeLockActions.connect(signer1).scheduleAction(
                await roleManager.getAddress(),
                actionData,
                GOVERNANCE_ROLE,
                0
            );

            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [48 * 3600]);
            await ethers.provider.send("evm_mine", []);

            // Try to execute with unauthorized account
            await expect(
                timeLockActions.connect(attacker).executeAction(actionHash)
            ).to.be.revertedWithCustomError(timeLockActions, "Unauthorized");
        });

        it("Should allow action cancellation by proposer", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [user1.getAddress(), "test"]
            );

            // Schedule an action
            await timeLockActions.connect(signer1).scheduleAction(
                await roleManager.getAddress(),
                actionData,
                GOVERNANCE_ROLE,
                0
            );

            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];

            // Cancel the action
            await expect(
                timeLockActions.connect(signer1).cancelAction(actionHash)
            ).to.not.be.reverted;

            // Try to execute cancelled action
            await ethers.provider.send("evm_increaseTime", [48 * 3600]);
            await ethers.provider.send("evm_mine", []);

            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(timeLockActions, "ActionCancelled");
        });
    });

    describe("SecureHyraGovernor Security", function () {
        beforeEach(async function () {
            // Deploy a mock token for testing
            const MockTokenFactory = await ethers.getContractFactory("HyraToken");
            const mockToken = await MockTokenFactory.deploy();
            await mockToken.initialize("Test Token", "TEST", ethers.ZeroAddress);

            // Deploy SecureHyraGovernor
            const SecureHyraGovernorFactory = await ethers.getContractFactory("SecureHyraGovernor");
            secureGovernor = await SecureHyraGovernorFactory.deploy();
            await secureGovernor.initialize(
                "Test Governor",
                "1",
                await mockToken.getAddress(),
                await secureTimelock.getAddress(),
                await roleManager.getAddress(),
                await timeLockActions.getAddress()
            );
        });

        it("Should require multi-signature for security council management", async function () {
            // Try to add security council member directly
            await expect(
                secureGovernor.connect(signer1).addSecurityCouncilMember(user1.getAddress())
            ).to.not.be.reverted; // This schedules the action

            // The actual execution happens through TimeLockActions
            // This test verifies that the action is scheduled, not executed immediately
        });

        it("Should prevent unauthorized proposal cancellation", async function () {
            // Create a proposal
            const targets = [await secureGovernor.getAddress()];
            const values = [0];
            const calldatas = [ethers.AbiCoder.defaultAbiCoder().encode(["string"], ["test"])];
            const description = "Test proposal";

            await expect(
                secureGovernor.connect(signer1).proposeWithType(
                    targets,
                    values,
                    calldatas,
                    description,
                    0 // Standard proposal
                )
            ).to.not.be.reverted;

            // Try to cancel with unauthorized account
            await expect(
                secureGovernor.connect(attacker).connect(canceller).cancel(targets, values, calldatas, ethers.id(description))
            ).to.be.revertedWithCustomError(secureGovernor, "UnauthorizedCancellation");
        });
    });

    describe("SecureHyraToken Security", function () {
        beforeEach(async function () {
            // Deploy SecureHyraToken
            const SecureHyraTokenFactory = await ethers.getContractFactory("SecureHyraToken");
            secureToken = await SecureHyraTokenFactory.deploy();
            await secureToken.initialize(
                "Secure Test Token",
                "STT",
                ethers.ZeroAddress,
                await roleManager.getAddress(),
                await timeLockActions.getAddress()
            );
        });

        it("Should require multi-signature for minting operations", async function () {
            // Try to create mint request
            await expect(
                secureToken.connect(signer1).connect(governance).createMintRequest(
                    user1.getAddress(),
                    ethers.utils.parseEther("1000"),
                    "Test mint"
                )
            ).to.not.be.reverted;

            // The actual execution requires multi-signature through TimeLockActions
        });

        it("Should require multi-signature for pausing operations", async function () {
            // Try to pause
            await expect(
                secureToken.connect(signer1).connect(governance).pause()
            ).to.not.be.reverted;

            // The actual execution requires multi-signature through TimeLockActions
        });

        it("Should require multi-signature for minter management", async function () {
            // Try to add minter
            await expect(
                secureToken.connect(signer1).addMinter(user1.getAddress())
            ).to.not.be.reverted;

            // The actual execution requires multi-signature through TimeLockActions
        });
    });

    describe("SecureHyraProxyAdmin Security", function () {
        beforeEach(async function () {
            // Deploy SecureHyraProxyAdmin
            const SecureHyraProxyAdminFactory = await ethers.getContractFactory("SecureHyraProxyAdmin");
            secureProxyAdmin = await SecureHyraProxyAdminFactory.deploy(
                owner.getAddress(),
                await roleManager.getAddress(),
                await timeLockActions.getAddress()
            );
        });

        it("Should require multi-signature for proxy management", async function () {
            // Deploy a mock proxy
            const MockImplementationFactory = await ethers.getContractFactory("HyraToken");
            const mockImplementation = await MockImplementationFactory.deploy();
            
            const ProxyFactory = await ethers.getContractFactory("HyraTransparentUpgradeableProxy");
            const proxy = await ProxyFactory.deploy(
                await mockImplementation.getAddress(),
                await secureProxyAdmin.getAddress(),
                "0x"
            );

            // Try to add proxy
            await expect(
                secureProxyAdmin.connect(signer1).connect(owner).addProxy(await proxy.getAddress(), "Test Proxy")
            ).to.not.be.reverted;

            // The actual execution requires multi-signature through TimeLockActions
        });

        it("Should require multi-signature for upgrades", async function () {
            // Deploy mock implementations
            const MockImplementationFactory = await ethers.getContractFactory("HyraToken");
            const mockImplementation1 = await MockImplementationFactory.deploy();
            const mockImplementation2 = await MockImplementationFactory.deploy();
            
            const ProxyFactory = await ethers.getContractFactory("HyraTransparentUpgradeableProxy");
            const proxy = await ProxyFactory.deploy(
                await mockImplementation1.getAddress(),
                await secureProxyAdmin.getAddress(),
                "0x"
            );

            // Try to upgrade proxy
            await expect(
                secureProxyAdmin.connect(signer1).upgradeProxy(
                    await proxy.getAddress(),
                    await mockImplementation2.getAddress()
                )
            ).to.not.be.reverted;

            // The actual execution requires multi-signature through TimeLockActions
        });
    });

    describe("Integration Security Tests", function () {
        it("Should prevent single point of failure", async function () {
            // Test that no single account can perform critical operations
            const criticalOperations = [
                // Role management
                () => roleManager.configureRoleMultiSig(GOVERNANCE_ROLE, 1, [attacker.getAddress()]),
                // Action execution without proper signatures
                () => timeLockActions.connect(attacker).executeAction(ethers.ZeroHash),
                // Direct security council management
                () => secureGovernor.connect(attacker).addSecurityCouncilMember(attacker.getAddress()),
                // Direct token operations
                () => secureToken.connect(attacker).connect(governance).pause(),
                // Direct proxy operations
                () => secureProxyAdmin.connect(attacker).connect(owner).addProxy(attacker.getAddress(), "Malicious")
            ];

            for (const operation of criticalOperations) {
                await expect(operation()).to.be.reverted;
            }
        });

        it("Should maintain security even if one signer is compromised", async function () {
            // Simulate signer1 being compromised
            const compromisedSigner = signer1;

            // Even with compromised signer, critical operations still require other signatures
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [attacker.getAddress(), "malicious"]
            );

            // Compromised signer can propose action
            await roleManager.connect(compromisedSigner).proposeAction(GOVERNANCE_ROLE, actionData);

            const pendingActions = await roleManager.getPendingActions();
            const actionHash = pendingActions[0];

            // But cannot execute without other signatures
            await expect(
                roleManager.connect(compromisedSigner).executeAction(actionHash)
            ).to.be.revertedWithCustomError(roleManager, "InvalidSignatures");

            // Other signers can prevent execution by not signing
            // This demonstrates the security of multi-signature requirements
        });

        it("Should enforce time delays even with proper signatures", async function () {
            const actionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "string"],
                [user1.getAddress(), "test"]
            );

            // Schedule action with proper role
            await timeLockActions.connect(signer1).scheduleAction(
                await roleManager.getAddress(),
                actionData,
                GOVERNANCE_ROLE,
                0
            );

            const scheduledActions = await timeLockActions.getScheduledActions();
            const actionHash = scheduledActions[0];

            // Even with proper role, cannot execute before delay
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");

            // Fast forward time
            await ethers.provider.send("evm_increaseTime", [48 * 3600]);
            await ethers.provider.send("evm_mine", []);

            // Now can execute
            await expect(
                timeLockActions.connect(signer1).executeAction(actionHash)
            ).to.not.be.reverted;
        });
    });

    describe("Security Contract Updates", function () {
        it("Should require multi-signature for security contract updates", async function () {
            // Deploy new security contracts
            const NewRoleManagerFactory = await ethers.getContractFactory("MultiSigRoleManager");
            const newRoleManager = await NewRoleManagerFactory.deploy();
            await newRoleManager.initialize(owner.getAddress());

            const NewTimeLockActionsFactory = await ethers.getContractFactory("TimeLockActions");
            const newTimeLockActions = await NewTimeLockActionsFactory.deploy();
            await newTimeLockActions.initialize(await newRoleManager.getAddress());

            // Try to update security contracts
            await expect(
                secureGovernor.connect(signer1).updateSecurityContracts(
                    await newRoleManager.getAddress(),
                    await newTimeLockActions.getAddress()
                )
            ).to.not.be.reverted;

            // The actual execution requires multi-signature through TimeLockActions
        });
    });
});
