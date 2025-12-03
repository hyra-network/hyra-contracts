/**
 * npx hardhat test test/HyraGovernor.StandardProposal.PrivilegedMultisig.test.ts
 * ============================================================================
 * TEST: STANDARD PROPOSAL - PRIVILEGED MULTISIG WALLET
 * ============================================================================
 * 
 * Test cases để verify Privileged Multisig Wallet có thể tạo STANDARD proposals
 * mà không cần 3% voting power threshold.
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { HyraGovernor, HyraToken, HyraTimelock } from "../typechain-types";
import { ProposalType } from "./helpers/fixtures";

describe("HyraGovernor - Standard Proposal Privileged Multisig", function () {
    const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M tokens
    const VOTING_DELAY = 1;
    const VOTING_PERIOD = 10;
    const TL_MIN_DELAY = 7 * 24 * 60 * 60;

    async function deployWithPrivilegedMultisig() {
        const [deployer, voter1, voter2, alice] = await ethers.getSigners();

        // Deploy ProposalForwarder to act as privileged multisig wallet
        const ProposalForwarder = await ethers.getContractFactory("ProposalForwarder");
        const privilegedMultisig = await ProposalForwarder.deploy(deployer.address);
        await privilegedMultisig.waitForDeployment();
        const privilegedMultisigAddress = await privilegedMultisig.getAddress();

        // Deploy infrastructure
        const ProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy(deployer.address);
        await proxyAdmin.waitForDeployment();

        const ProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await ProxyDeployer.deploy();
        await proxyDeployer.waitForDeployment();

        // Deploy Timelock
        const TimelockImpl = await ethers.getContractFactory("HyraTimelock");
        const timelockImpl = await TimelockImpl.deploy();
        await timelockImpl.waitForDeployment();

        const tlInit = TimelockImpl.interface.encodeFunctionData("initialize", [
            TL_MIN_DELAY,
            [],
            [ethers.ZeroAddress],
            deployer.address,
        ]);

        const timelockProxyAddr = await proxyDeployer.deployProxy.staticCall(
            await timelockImpl.getAddress(),
            await proxyAdmin.getAddress(),
            tlInit,
            "HyraTimelock"
        );
        await proxyDeployer.deployProxy(
            await timelockImpl.getAddress(),
            await proxyAdmin.getAddress(),
            tlInit,
            "HyraTimelock"
        );
        const timelock = await ethers.getContractAt("HyraTimelock", timelockProxyAddr);

        // Deploy Token
        const TokenImpl = await ethers.getContractFactory("HyraToken");
        const tokenImpl = await TokenImpl.deploy();
        await tokenImpl.waitForDeployment();

        const tokenProxy = await proxyDeployer.deployProxy.staticCall(
            await tokenImpl.getAddress(),
            await proxyAdmin.getAddress(),
            "0x",
            "HyraToken"
        );
        await proxyDeployer.deployProxy(
            await tokenImpl.getAddress(),
            await proxyAdmin.getAddress(),
            "0x",
            "HyraToken"
        );
        const token = await ethers.getContractAt("HyraToken", tokenProxy);

        // Deploy distribution wallets
        const MockWallet = await ethers.getContractFactory("MockDistributionWallet");
        const wallets = [];
        for (let i = 0; i < 6; i++) {
            const w = await MockWallet.deploy(deployer.address);
            await w.waitForDeployment();
            wallets.push(await w.getAddress());
        }

        await token.setDistributionConfig(wallets[0], wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]);

        // Initialize token with ProposalForwarder as privileged multisig
        await token.initialize("HYRA", "HYRA", INITIAL_SUPPLY, voter1.address, timelockProxyAddr, privilegedMultisigAddress);

        await proxyAdmin.transferOwnership(timelockProxyAddr);

        // Deploy Governor
        const GovernorImpl = await ethers.getContractFactory("HyraGovernor");
        const governorImpl = await GovernorImpl.deploy();
        await governorImpl.waitForDeployment();

        const govInit = GovernorImpl.interface.encodeFunctionData("initialize", [
            tokenProxy,
            timelockProxyAddr,
            VOTING_DELAY,
            VOTING_PERIOD,
            0n,
            10,
            privilegedMultisigAddress, // privilegedMultisigWallet
        ]);

        const governorProxy = await proxyDeployer.deployProxy.staticCall(
            await governorImpl.getAddress(),
            await proxyAdmin.getAddress(),
            govInit,
            "HyraGovernor"
        );
        await proxyDeployer.deployProxy(
            await governorImpl.getAddress(),
            await proxyAdmin.getAddress(),
            govInit,
            "HyraGovernor"
        );
        const governor = await ethers.getContractAt("HyraGovernor", governorProxy);

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
        await timelock.grantRole(PROPOSER_ROLE, governorProxy);
        await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress);
        await timelock.revokeRole(ADMIN_ROLE, deployer.address);

        // Distribute tokens to voters (but NOT to privileged multisig)
        const communityWallet = await ethers.getContractAt("MockDistributionWallet", wallets[0]);
        await communityWallet.forwardTokens(tokenProxy, voter1.address, ethers.parseEther("3000000"));
        await token.connect(voter1).delegate(voter1.address);
        await communityWallet.forwardTokens(tokenProxy, voter2.address, ethers.parseEther("400000"));
        await token.connect(voter2).delegate(voter2.address);
        await communityWallet.forwardTokens(tokenProxy, alice.address, ethers.parseEther("200000")); // < 3%
        await token.connect(alice).delegate(alice.address);

        await mine(1);

        return {
            deployer,
            voter1,
            voter2,
            alice,
            token,
            governor,
            timelock,
            privilegedMultisig,
            privilegedMultisigAddress,
        };
    }

    describe("Privileged Multisig Wallet - STANDARD Proposals", function () {
        it("✅ Should allow Privileged Multisig Wallet to create STANDARD proposal via proposeWithType() without 3% voting power", async function () {
            const { governor, token, privilegedMultisig, privilegedMultisigAddress, deployer } = await loadFixture(deployWithPrivilegedMultisig);

            // Verify privileged multisig is recognized
            const isPrivileged = await governor.isPrivilegedMultisig(privilegedMultisigAddress);
            expect(isPrivileged).to.be.true;

            // Verify privileged multisig has 0 voting power (no tokens)
            const multisigVotingPower = await token.getVotes(privilegedMultisigAddress);
            expect(multisigVotingPower).to.equal(0n);

            // Verify 3% threshold is much higher than 0
            const requiredThreshold = await governor.calculateMintRequestThreshold();
            const threePercent = (INITIAL_SUPPLY * 300n) / 10000n;
            expect(requiredThreshold).to.equal(threePercent);
            expect(multisigVotingPower).to.be.lt(requiredThreshold);

            // Create STANDARD proposal via proposeWithType() using ProposalForwarder
            const calldata = governor.interface.encodeFunctionData("votingDelay", []);
            const targets = [await governor.getAddress()];
            const values = [0n];
            const calldatas = [calldata];
            const description = "Standard proposal from privileged multisig";

            // Call proposeWithType via ProposalForwarder (privileged multisig)
            await expect(
                privilegedMultisig.connect(deployer).proposeWithType(
                    await governor.getAddress(),
                    targets,
                    values,
                    calldatas,
                    description,
                    ProposalType.STANDARD
                )
            ).to.emit(governor, "ProposalCreated");

            // Verify proposal was created
            const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));
            const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
            expect(proposalId).to.be.gt(0n);

            // Verify proposal type is STANDARD
            const proposalType = await governor.proposalTypes(proposalId);
            expect(proposalType).to.equal(ProposalType.STANDARD);
        });

        it("✅ Should allow Privileged Multisig Wallet to create STANDARD proposal via propose() without 3% voting power", async function () {
            const { governor, token, privilegedMultisig, privilegedMultisigAddress, deployer } = await loadFixture(deployWithPrivilegedMultisig);

            // Verify privileged multisig is recognized
            const isPrivileged = await governor.isPrivilegedMultisig(privilegedMultisigAddress);
            expect(isPrivileged).to.be.true;

            // Verify privileged multisig has 0 voting power (no tokens)
            const multisigVotingPower = await token.getVotes(privilegedMultisigAddress);
            expect(multisigVotingPower).to.equal(0n);

            // Verify 3% threshold is much higher than 0
            const requiredThreshold = await governor.calculateMintRequestThreshold();
            expect(multisigVotingPower).to.be.lt(requiredThreshold);

            // Create STANDARD proposal via propose() using ProposalForwarder
            // propose() will automatically set type as STANDARD
            const calldata = governor.interface.encodeFunctionData("votingDelay", []);
            const targets = [await governor.getAddress()];
            const values = [0n];
            const calldatas = [calldata];
            const description = "Standard proposal via propose() from privileged multisig";

            // Call propose() via ProposalForwarder (privileged multisig)
            await expect(
                privilegedMultisig.connect(deployer).propose(
                    await governor.getAddress(),
                    targets,
                    values,
                    calldatas,
                    description
                )
            ).to.emit(governor, "ProposalCreated");

            // Verify proposal was created with STANDARD type
            const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));
            const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
            expect(proposalId).to.be.gt(0n);

            // Verify proposal type is STANDARD (default when using propose())
            const proposalType = await governor.proposalTypes(proposalId);
            expect(proposalType).to.equal(ProposalType.STANDARD);
        });

        it("❌ Should reject regular user with < 3% voting power from creating STANDARD proposal", async function () {
            const { governor, token, alice } = await loadFixture(deployWithPrivilegedMultisig);

            // Verify alice has < 3% voting power
            const aliceVotingPower = await token.getVotes(alice.address);
            const requiredThreshold = await governor.calculateMintRequestThreshold();
            expect(aliceVotingPower).to.be.lt(requiredThreshold);

            // Verify alice is NOT privileged multisig
            const isPrivileged = await governor.isPrivilegedMultisig(alice.address);
            expect(isPrivileged).to.be.false;

            // Try to create STANDARD proposal - should fail
            const calldata = governor.interface.encodeFunctionData("votingDelay", []);

            await expect(
                governor.connect(alice).proposeWithType(
                    [await governor.getAddress()],
                    [0n],
                    [calldata],
                    "Standard proposal from alice",
                    ProposalType.STANDARD
                )
            ).to.be.revertedWithCustomError(governor, "InsufficientVotingPowerForStandardProposal");
        });

        it("✅ Should allow regular user with >= 3% voting power to create STANDARD proposal", async function () {
            const { governor, token, voter2 } = await loadFixture(deployWithPrivilegedMultisig);

            // Verify voter2 has >= 3% voting power
            const voter2VotingPower = await token.getVotes(voter2.address);
            const requiredThreshold = await governor.calculateMintRequestThreshold();
            expect(voter2VotingPower).to.be.gte(requiredThreshold);

            // Create STANDARD proposal - should succeed
            const calldata = governor.interface.encodeFunctionData("votingDelay", []);

            await expect(
                governor.connect(voter2).proposeWithType(
                    [await governor.getAddress()],
                    [0n],
                    [calldata],
                    "Standard proposal from voter2",
                    ProposalType.STANDARD
                )
            ).to.emit(governor, "ProposalCreated");
        });
    });
});

