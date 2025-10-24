import { expect } from "chai";
import { ethers } from "hardhat";
import { HyraDAOInitializer, HyraDAOInitializer__factory } from "../typechain-types";
import { HyraToken, HyraGovernor, HyraTimelock, SecureExecutorManager, ProxyAdminValidator } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HyraDAOInitializer Fixes", function () {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let initializer: HyraDAOInitializer;

    beforeEach(async function () {
        [deployer, user1, user2] = await ethers.getSigners();
        
        const HyraDAOInitializerFactory = await ethers.getContractFactory("HyraDAOInitializer");
        initializer = await HyraDAOInitializerFactory.deploy();
    });

    describe("DAO Deployment with Fixes", function () {
        it("Should deploy DAO with all fixes applied", async function () {
            const config = {
                tokenName: "Hyra Test Token",
                tokenSymbol: "HYRA-TEST",
                initialSupply: ethers.parseEther("1000000"),
                vestingContract: user1.address, // Temporary address for validation
                timelockDelay: 300, // 5 minutes for testing
                votingDelay: 1,
                votingPeriod: 50,
                proposalThreshold: ethers.parseEther("10000"),
                quorumPercentage: 10, // 10% quorum
                securityCouncil: [user1.address, user2.address],
                multisigSigners: [user1.address, user2.address],
                requiredSignatures: 2,
                vestingConfig: {
                    beneficiaries: [user1.address],
                    amounts: [ethers.parseEther("10000")],
                    startTimes: [Math.floor(Date.now() / 1000)],
                    durations: [86400 * 30], // 30 days
                    cliffs: [86400 * 7], // 7 days
                    revocable: [true],
                    purposes: ["Test vesting"]
                }
            };

            // Deploy DAO
            const result = await initializer.deployDAO(config);

            // Verify all contracts were deployed
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

            // Verify deployment
            const isDeployed = await initializer.verifyDeployment(result);
            expect(isDeployed).to.be.true;
        });

        it("Should have SecureExecutorManager and ProxyAdminValidator deployed with proxy pattern", async function () {
            const config = {
                tokenName: "Hyra Test Token",
                tokenSymbol: "HYRA-TEST",
                initialSupply: ethers.parseEther("1000000"),
                vestingContract: user1.address,
                timelockDelay: 300,
                votingDelay: 1,
                votingPeriod: 50,
                proposalThreshold: ethers.parseEther("10000"),
                quorumPercentage: 10, // 10% quorum
                securityCouncil: [user1.address],
                multisigSigners: [user1.address],
                requiredSignatures: 1,
                vestingConfig: {
                    beneficiaries: [user1.address],
                    amounts: [ethers.parseEther("10000")],
                    startTimes: [Math.floor(Date.now() / 1000)],
                    durations: [86400 * 30],
                    cliffs: [86400 * 7],
                    revocable: [true],
                    purposes: ["Test vesting"]
                }
            };

            const result = await initializer.deployDAO(config);

            // Verify SecureExecutorManager is deployed with proxy pattern
            const executorManager = await ethers.getContractAt("SecureExecutorManager", result.executorManager);
            const executorManagerOwner = await executorManager.owner();
            expect(executorManagerOwner).to.not.equal(ethers.ZeroAddress);

            // Verify ProxyAdminValidator is deployed with proxy pattern
            const proxyAdminValidator = await ethers.getContractAt("ProxyAdminValidator", result.proxyAdminValidator);
            const validatorOwner = await proxyAdminValidator.owner();
            expect(validatorOwner).to.not.equal(ethers.ZeroAddress);
        });

        it("Should have correct role assignments in timelock", async function () {
            const config = {
                tokenName: "Hyra Test Token",
                tokenSymbol: "HYRA-TEST",
                initialSupply: ethers.parseEther("1000000"),
                vestingContract: user1.address,
                timelockDelay: 300,
                votingDelay: 1,
                votingPeriod: 50,
                proposalThreshold: ethers.parseEther("10000"),
                quorumPercentage: 10, // 10% quorum
                securityCouncil: [user1.address],
                multisigSigners: [user1.address],
                requiredSignatures: 1,
                vestingConfig: {
                    beneficiaries: [user1.address],
                    amounts: [ethers.parseEther("10000")],
                    startTimes: [Math.floor(Date.now() / 1000)],
                    durations: [86400 * 30],
                    cliffs: [86400 * 7],
                    revocable: [true],
                    purposes: ["Test vesting"]
                }
            };

            const result = await initializer.deployDAO(config);

            const timelock = await ethers.getContractAt("HyraTimelock", result.timelockProxy);
            
            // Verify governor has PROPOSER_ROLE
            const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
            const hasProposerRole = await timelock.hasRole(PROPOSER_ROLE, result.governorProxy);
            expect(hasProposerRole).to.be.true;

            // Verify governor has EXECUTOR_ROLE
            const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
            const hasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, result.governorProxy);
            expect(hasExecutorRole).to.be.true;

            // Verify executor manager has EXECUTOR_ROLE
            const executorManagerHasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, result.executorManager);
            expect(executorManagerHasExecutorRole).to.be.true;

            // Verify deployer does NOT have DEFAULT_ADMIN_ROLE (should be renounced)
            const DEFAULT_ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
            const deployerHasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
            expect(deployerHasAdminRole).to.be.false;
        });

        it("Should have vesting contract properly configured", async function () {
            const config = {
                tokenName: "Hyra Test Token",
                tokenSymbol: "HYRA-TEST",
                initialSupply: ethers.parseEther("1000000"),
                vestingContract: user1.address,
                timelockDelay: 300,
                votingDelay: 1,
                votingPeriod: 50,
                proposalThreshold: ethers.parseEther("10000"),
                quorumPercentage: 10, // 10% quorum
                securityCouncil: [user1.address],
                multisigSigners: [user1.address],
                requiredSignatures: 1,
                vestingConfig: {
                    beneficiaries: [user1.address],
                    amounts: [ethers.parseEther("10000")],
                    startTimes: [Math.floor(Date.now() / 1000)],
                    durations: [86400 * 30],
                    cliffs: [86400 * 7],
                    revocable: [true],
                    purposes: ["Test vesting"]
                }
            };

            const result = await initializer.deployDAO(config);

            // Verify vesting contract is properly initialized
            const vesting = await ethers.getContractAt("TokenVesting", result.vestingProxy);
            const tokenAddress = await vesting.token();
            const owner = await vesting.owner();

            expect(tokenAddress).to.equal(result.tokenProxy);
            expect(owner).to.equal(result.timelockProxy);
        });

        it("Should handle vesting schedule creation without ownership errors", async function () {
            const config = {
                tokenName: "Hyra Test Token",
                tokenSymbol: "HYRA-TEST",
                initialSupply: ethers.parseEther("1000000"),
                vestingContract: user1.address,
                timelockDelay: 300,
                votingDelay: 1,
                votingPeriod: 50,
                proposalThreshold: ethers.parseEther("10000"),
                quorumPercentage: 10, // 10% quorum
                securityCouncil: [user1.address],
                multisigSigners: [user1.address],
                requiredSignatures: 1,
                vestingConfig: {
                    beneficiaries: [user1.address, user2.address],
                    amounts: [ethers.parseEther("10000"), ethers.parseEther("5000")],
                    startTimes: [Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 86400],
                    durations: [86400 * 30, 86400 * 60],
                    cliffs: [86400 * 7, 86400 * 14],
                    revocable: [true, false],
                    purposes: ["Test vesting 1", "Test vesting 2"]
                }
            };

            // This should not throw an error
            const result = await initializer.deployDAO(config);
            
            // Verify deployment was successful
            expect(result.vestingProxy).to.not.equal(ethers.ZeroAddress);
        });
    });

    describe("Error Handling", function () {
        it("Should revert with invalid config", async function () {
            const invalidConfig = {
                tokenName: "",
                tokenSymbol: "HYRA-TEST",
                initialSupply: ethers.parseEther("1000000"),
                vestingContract: user1.address,
                timelockDelay: 300,
                votingDelay: 1,
                votingPeriod: 50,
                proposalThreshold: ethers.parseEther("10000"),
                quorumPercentage: 10, // 10% quorum
                securityCouncil: [user1.address],
                multisigSigners: [user1.address],
                requiredSignatures: 1,
                vestingConfig: {
                    beneficiaries: [user1.address],
                    amounts: [ethers.parseEther("10000")],
                    startTimes: [Math.floor(Date.now() / 1000)],
                    durations: [86400 * 30],
                    cliffs: [86400 * 7],
                    revocable: [true],
                    purposes: ["Test vesting"]
                }
            };

            await expect(initializer.deployDAO(invalidConfig)).to.be.revertedWithCustomError(
                initializer,
                "InvalidConfig"
            );
        });
    });
});
