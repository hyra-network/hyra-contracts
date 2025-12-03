/**
 * npx hardhat test test/MintRequestProposalThreshold.test.ts
 * ============================================================================
 * TEST: MINT REQUEST PROPOSAL THRESHOLD
 * ============================================================================
 * 
 * Test cases để verify implementation của mint request proposal threshold:
 * - Privileged Multisig Wallet có thể tạo mint request proposal
 * - User có >= 3% voting power có thể tạo mint request proposal
 * - User có < 3% voting power KHÔNG thể tạo mint request proposal
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("Mint Request Proposal Threshold", function () {
    let deployer: any;
    let voter1: any;
    let voter2: any;
    let alice: any;
    let bob: any;

    let token: any;
    let governor: any;
    let privilegedMultisig: any;
    let communityWallet: any;

    const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M tokens
    const THREE_PERCENT = ethers.parseEther("300000"); // 3% of 10M = 300K

    beforeEach(async function () {
        [deployer, voter1, voter2, alice, bob] = await ethers.getSigners();

        // Deploy infrastructure
        const ProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy(deployer.address);

        const ProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await ProxyDeployer.deploy();

        // Deploy Timelock
        const TimelockImpl = await ethers.getContractFactory("HyraTimelock");
        const timelockImpl = await TimelockImpl.deploy();

        const tlInit = TimelockImpl.interface.encodeFunctionData("initialize", [
            7 * 24 * 60 * 60,
            [],
            [ethers.ZeroAddress],
            deployer.address,
        ]);

        const timelockAddr = await proxyDeployer.deployProxy.staticCall(
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
        const timelock = await ethers.getContractAt("HyraTimelock", timelockAddr);

        // Deploy Token
        const TokenImpl = await ethers.getContractFactory("HyraToken");
        const tokenImpl = await TokenImpl.deploy();

        const tokenAddr = await proxyDeployer.deployProxy.staticCall(
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
        token = await ethers.getContractAt("HyraToken", tokenAddr);

        // Deploy 6 distribution wallets
        const MockWallet = await ethers.getContractFactory("MockDistributionWallet");
        const wallets = [];
        for (let i = 0; i < 6; i++) {
            const w = await MockWallet.deploy(deployer.address);
            wallets.push(await w.getAddress());
        }

        await token.setDistributionConfig(wallets[0], wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]);

        // Deploy privileged multisig
        privilegedMultisig = await MockWallet.deploy(deployer.address);

        // Initialize token
        await token.initialize("HYRA", "HYRA", INITIAL_SUPPLY, voter1.address, timelockAddr, await privilegedMultisig.getAddress());

        await proxyAdmin.transferOwnership(timelockAddr);

        // Deploy Governor
        const GovernorImpl = await ethers.getContractFactory("HyraGovernor");
        const governorImpl = await GovernorImpl.deploy();

        const govInit = GovernorImpl.interface.encodeFunctionData("initialize", [
            tokenAddr,
            timelockAddr,
            1,
            10,
            0n,
            10,
            await privilegedMultisig.getAddress(),
        ]);

        const governorAddr = await proxyDeployer.deployProxy.staticCall(
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
        governor = await ethers.getContractAt("HyraGovernor", governorAddr);

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
        await timelock.grantRole(PROPOSER_ROLE, governorAddr);
        await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress);
        await timelock.revokeRole(ADMIN_ROLE, deployer.address);

        // Get community wallet and distribute tokens
        communityWallet = await ethers.getContractAt("MockDistributionWallet", wallets[0]);

        // Transfer tokens from community wallet (60% = 6M)
        await communityWallet.forwardTokens(tokenAddr, voter1.address, ethers.parseEther("3000000"));
        await token.connect(voter1).delegate(voter1.address);

        await communityWallet.forwardTokens(tokenAddr, voter2.address, ethers.parseEther("400000"));
        await token.connect(voter2).delegate(voter2.address);

        await communityWallet.forwardTokens(tokenAddr, alice.address, ethers.parseEther("200000"));
        await token.connect(alice).delegate(alice.address);

        await communityWallet.forwardTokens(tokenAddr, bob.address, THREE_PERCENT);
        await token.connect(bob).delegate(bob.address);

        await mine(1);
    });

    describe("Mint Request Proposals", function () {
        it("✅ Should allow user with exactly 3% voting power to create mint request", async function () {
            const calldata = token.interface.encodeFunctionData("createMintRequest", [
                voter1.address,
                ethers.parseEther("1000000"),
                "Test mint"
            ]);

            const bobPower = await token.getVotes(bob.address);
            expect(bobPower).to.equal(THREE_PERCENT);

            await expect(
                governor.connect(bob).propose([await token.getAddress()], [0n], [calldata], "Mint from bob")
            ).to.not.be.reverted;
        });

        it("✅ Should allow user with > 3% voting power to create mint request", async function () {
            const calldata = token.interface.encodeFunctionData("createMintRequest", [
                voter1.address,
                ethers.parseEther("1000000"),
                "Test mint"
            ]);

            const voter2Power = await token.getVotes(voter2.address);
            expect(voter2Power).to.be.gt(THREE_PERCENT);

            await expect(
                governor.connect(voter2).propose([await token.getAddress()], [0n], [calldata], "Mint from voter2")
            ).to.not.be.reverted;
        });

        it("❌ Should reject user with < 3% voting power from creating mint request", async function () {
            const calldata = token.interface.encodeFunctionData("createMintRequest", [
                voter1.address,
                ethers.parseEther("1000000"),
                "Test mint"
            ]);

            const alicePower = await token.getVotes(alice.address);
            expect(alicePower).to.be.lt(THREE_PERCENT);

            await expect(
                governor.connect(alice).propose([await token.getAddress()], [0n], [calldata], "Mint from alice")
            ).to.be.revertedWithCustomError(governor, "InsufficientVotingPowerForMintRequest");
        });
    });

    describe("Standard Proposals", function () {
        it("✅ Should allow user with >= 3% to create standard proposal", async function () {
            const calldata = governor.interface.encodeFunctionData("votingDelay", []);

            await expect(
                governor.connect(voter2).propose([await governor.getAddress()], [0n], [calldata], "Standard proposal")
            ).to.not.be.reverted;
        });

        it("❌ Should reject user with < 3% from creating standard proposal", async function () {
            const calldata = governor.interface.encodeFunctionData("votingDelay", []);

            await expect(
                governor.connect(alice).propose([await governor.getAddress()], [0n], [calldata], "Standard proposal")
            ).to.be.revertedWithCustomError(governor, "InsufficientVotingPowerForStandardProposal");
        });
    });

    describe("Threshold Calculation", function () {
        it("Should calculate 3% threshold correctly", async function () {
            const threshold = await governor.calculateMintRequestThreshold();
            const expected = (INITIAL_SUPPLY * 300n) / 10000n;
            expect(threshold).to.equal(expected);
        });
    });
});
