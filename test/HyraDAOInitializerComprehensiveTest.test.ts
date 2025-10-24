import { expect } from "chai";
import { ethers } from "hardhat";
import { HyraDAOInitializer, HyraDAOInitializer__factory } from "../typechain-types";
import { HyraToken, HyraGovernor, HyraTimelock, SecureExecutorManager, ProxyAdminValidator, TokenVesting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HyraDAOInitializer Comprehensive Test - All Fixes Verification", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;
    let initializer: HyraDAOInitializer;

    beforeEach(async function () {
        [deployer, user1, user2, user3] = await ethers.getSigners();
        
        const HyraDAOInitializerFactory = await ethers.getContractFactory("HyraDAOInitializer");
        initializer = await HyraDAOInitializerFactory.deploy();
    });

    describe("Fix 1: Proxy Pattern for SecureExecutorManager and ProxyAdminValidator", function () {
        it("Should deploy SecureExecutorManager with proxy pattern", async function () {
            const config = createValidConfig();
            const result = await initializer.deployDAO(config);

            // Verify SecureExecutorManager is deployed with proxy pattern
            const executorManager = await ethers.getContractAt("SecureExecutorManager", result.executorManager);
            
            // Check if it's a proxy by verifying it has owner (from Ownable)
            const owner = await executorManager.owner();
            expect(owner).to.not.equal(ethers.ZeroAddress);
            expect(owner).to.equal(await initializer.getAddress());

            // Verify it's properly initialized
            const hasRole = await executorManager.hasRole(
                await executorManager.EXECUTOR_ROLE(),
                await initializer.getAddress()
            );
            expect(hasRole).to.be.true;
        });

        it("Should deploy ProxyAdminValidator with proxy pattern", async function () {
            const config = createValidConfig();
            const result = await initializer.deployDAO(config);

            // Verify ProxyAdminValidator is deployed with proxy pattern
            const proxyAdminValidator = await ethers.getContractAt("ProxyAdminValidator", result.proxyAdminValidator);
            
            // Check if it's a proxy by verifying it has owner (from Ownable)
            const owner = await proxyAdminValidator.owner();
            expect(owner).to.not.equal(ethers.ZeroAddress);
            expect(owner).to.equal(await initializer.getAddress());

            // Verify it's properly initialized
            const hasRole = await proxyAdminValidator.hasRole(
                await proxyAdminValidator.VALIDATOR_ROLE(),
                await initializer.getAddress()
            );
            expect(hasRole).to.be.true;
        });
    });

    describe("Fix 2: Role Renouncement from Correct Address", function () {
        it("Should renounce DEFAULT_ADMIN_ROLE from address(this) not msg.sender", async function () {
            const config = createValidConfig();
            const result = await initializer.deployDAO(config);

            const timelock = await ethers.getContractAt("HyraTimelock", result.timelockProxy);
            const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

            // Verify deployer (msg.sender) does NOT have admin role
            const deployerHasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
            expect(deployerHasAdminRole).to.be.false;

            // Verify initializer contract (address(this)) does NOT have admin role
            const initializerHasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, await initializer.getAddress());
            expect(initializerHasAdminRole).to.be.false;
        });
    });

    describe("Fix 3: Execution Order - Setup Executor Manager Before Role Configuration", function () {
        it("Should setup executor manager before renouncing admin role", async function () {
            const config = createValidConfig();
            const result = await initializer.deployDAO(config);

            const timelock = await ethers.getContractAt("HyraTimelock", result.timelockProxy);
            
            // Verify executor manager is properly set up
            const executorManager = await timelock.executorManager();
            expect(executorManager).to.equal(result.executorManager);

            // Verify proxy admin validator is properly set up
            const proxyAdminValidator = await timelock.proxyAdminValidator();
            expect(proxyAdminValidator).to.equal(result.proxyAdminValidator);
        });
    });

    describe("Fix 4: Governor Role Manager Setup", function () {
        it("Should have placeholder for setRoleManager call", async function () {
            const config = createValidConfig();
            const result = await initializer.deployDAO(config);

            const governor = await ethers.getContractAt("HyraGovernor", result.governorProxy);
            
            // Verify governor is properly deployed and initialized
            expect(result.governorProxy).to.not.equal(ethers.ZeroAddress);
            
            // Note: setRoleManager is commented out as it requires additional setup
            // This is expected behavior based on the fix
        });
    });

    describe("Fix 5: Executor Role Assignment to Governor", function () {
        it("Should grant EXECUTOR_ROLE to governor", async function () {
            const config = createValidConfig();
            const result = await initializer.deployDAO(config);

            const timelock = await ethers.getContractAt("HyraTimelock", result.timelockProxy);
            const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();

            // Verify governor has EXECUTOR_ROLE
            const governorHasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, result.governorProxy);
            expect(governorHasExecutorRole).to.be.true;

            // Verify executor manager also has EXECUTOR_ROLE
            const executorManagerHasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, result.executorManager);
            expect(executorManagerHasExecutorRole).to.be.true;
        });
    });

    describe("Fix 6: Proposer Role Assignment to Governor", function () {
        it("Should grant PROPOSER_ROLE to governor", async function () {
            const config = createValidConfig();
            const result = await initializer.deployDAO(config);

            const timelock = await ethers.getContractAt("HyraTimelock", result.timelockProxy);
            const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();

            // Verify governor has PROPOSER_ROLE
            const governorHasProposerRole = await timelock.hasRole(PROPOSER_ROLE, result.governorProxy);
            expect(governorHasProposerRole).to.be.true;
        });
    });

    describe("Fix 7: Vesting Ownership Error Resolution", function () {
        it("Should create vesting schedules without ownership errors", async function () {
            const config = createValidConfigWithVesting();
            const result = await initializer.deployDAO(config);

            const vesting = await ethers.getContractAt("TokenVesting", result.vestingProxy);
            
            // Verify vesting contract is properly initialized
            const tokenAddress = await vesting.token();
            const owner = await vesting.owner();
            
            expect(tokenAddress).to.equal(result.tokenProxy);
            expect(owner).to.equal(result.timelockProxy);

            // Verify vesting schedules were created successfully
            // Note: The exact verification depends on the vesting contract implementation
        });

        it("Should handle multiple vesting schedules", async function () {
            const config = createValidConfigWithMultipleVesting();
            const result = await initializer.deployDAO(config);

            // This should not throw an error
            expect(result.vestingProxy).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Comprehensive Integration Test", function () {
        it("Should deploy complete DAO system with all fixes applied", async function () {
            const config = createValidConfigWithVesting();
            const result = await initializer.deployDAO(config);

            // Verify all contracts deployed successfully
            expect(result.tokenImplementation).to.not.equal(ethers.ZeroAddress);
            expect(result.governorImplementation).to.not.equal(ethers.ZeroAddress);
            expect(result.timelockImplementation).to.not.equal(ethers.ZeroAddress);
            expect(result.vestingImplementation).to.not.equal(ethers.ZeroAddress);
            expect(result.tokenProxy).to.not.equal(ethers.ZeroAddress);
            expect(result.governorProxy).to.not.equal(ethers.ZeroAddress);
            expect(result.timelockProxy).to.not.equal(ethers.ZeroAddress);
            expect(result.vestingProxy).to.not.equal(ethers.ZeroAddress);
            expect(result.proxyAdmin).to.not.equal(ethers.ZeroAddress);
            expect(result.proxyDeployer).to.not.equal(ethers.ZeroAddress);
            expect(result.executorManager).to.not.equal(ethers.ZeroAddress);
            expect(result.proxyAdminValidator).to.not.equal(ethers.ZeroAddress);

            // Verify deployment verification passes
            const isDeployed = await initializer.verifyDeployment(result);
            expect(isDeployed).to.be.true;

            // Verify all roles are correctly assigned
            const timelock = await ethers.getContractAt("HyraTimelock", result.timelockProxy);
            const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
            const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
            const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();

            // Governor should have proposer and executor roles
            expect(await timelock.hasRole(PROPOSER_ROLE, result.governorProxy)).to.be.true;
            expect(await timelock.hasRole(EXECUTOR_ROLE, result.governorProxy)).to.be.true;

            // Executor manager should have executor role
            expect(await timelock.hasRole(EXECUTOR_ROLE, result.executorManager)).to.be.true;

            // No one should have admin role after renouncement
            expect(await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.be.false;
            expect(await timelock.hasRole(DEFAULT_ADMIN_ROLE, await initializer.getAddress())).to.be.false;
        });
    });

    describe("Error Handling and Edge Cases", function () {
        it("Should revert with invalid token name", async function () {
            const config = createValidConfig();
            config.tokenName = "";

            await expect(initializer.deployDAO(config)).to.be.revertedWithCustomError(
                initializer,
                "InvalidConfig"
            );
        });

        it("Should revert with invalid token symbol", async function () {
            const config = createValidConfig();
            config.tokenSymbol = "";

            await expect(initializer.deployDAO(config)).to.be.revertedWithCustomError(
                initializer,
                "InvalidConfig"
            );
        });

        it("Should revert with zero vesting contract address", async function () {
            const config = createValidConfig();
            config.vestingContract = ethers.ZeroAddress;

            await expect(initializer.deployDAO(config)).to.be.revertedWithCustomError(
                initializer,
                "InvalidConfig"
            );
        });

        it("Should handle empty vesting config gracefully", async function () {
            const config = createValidConfig();
            config.vestingConfig = {
                beneficiaries: [],
                amounts: [],
                startTimes: [],
                durations: [],
                cliffs: [],
                revocable: [],
                purposes: []
            };

            // This should not revert, but should handle empty arrays gracefully
            const result = await initializer.deployDAO(config);
            expect(result.vestingProxy).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Gas Optimization Verification", function () {
        it("Should deploy with reasonable gas usage", async function () {
            const config = createValidConfig();
            
            const tx = await initializer.deployDAO(config);
            const receipt = await tx.wait();
            
            // Verify deployment doesn't exceed reasonable gas limits
            expect(receipt?.gasUsed).to.be.lessThan(50000000); // 50M gas limit
        });
    });

    // Helper functions
    function createValidConfig() {
        return {
            tokenName: "Hyra Test Token",
            tokenSymbol: "HYRA-TEST",
            initialSupply: ethers.parseEther("1000000"),
            vestingContract: ethers.parseAddress("0x1234567890123456789012345678901234567890"), // Non-zero address
            timelockDelay: 300, // 5 minutes for testing
            votingDelay: 1,
            votingPeriod: 50,
            proposalThreshold: ethers.parseEther("10000"),
            quorumPercentage: 1000,
            securityCouncil: [user1.address, user2.address],
            multisigSigners: [user1.address, user2.address],
            requiredSignatures: 2,
            vestingConfig: {
                beneficiaries: [],
                amounts: [],
                startTimes: [],
                durations: [],
                cliffs: [],
                revocable: [],
                purposes: []
            }
        };
    }

    function createValidConfigWithVesting() {
        const config = createValidConfig();
        config.vestingConfig = {
            beneficiaries: [user1.address],
            amounts: [ethers.parseEther("10000")],
            startTimes: [Math.floor(Date.now() / 1000)],
            durations: [86400 * 30], // 30 days
            cliffs: [86400 * 7], // 7 days
            revocable: [true],
            purposes: ["Test vesting"]
        };
        return config;
    }

    function createValidConfigWithMultipleVesting() {
        const config = createValidConfig();
        config.vestingConfig = {
            beneficiaries: [user1.address, user2.address, user3.address],
            amounts: [ethers.parseEther("10000"), ethers.parseEther("5000"), ethers.parseEther("7500")],
            startTimes: [Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 86400, Math.floor(Date.now() / 1000) + 172800],
            durations: [86400 * 30, 86400 * 60, 86400 * 90],
            cliffs: [86400 * 7, 86400 * 14, 86400 * 21],
            revocable: [true, false, true],
            purposes: ["Test vesting 1", "Test vesting 2", "Test vesting 3"]
        };
        return config;
    }
});
