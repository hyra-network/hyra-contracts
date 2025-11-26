"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const withArgs_1 = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
describe("TokenVesting", function () {
    let tokenVesting;
    let token;
    let owner;
    let beneficiary1;
    let beneficiary2;
    let other;
    const INITIAL_SUPPLY = hardhat_1.ethers.parseEther("1000000"); // 1M tokens
    const VESTING_AMOUNT = hardhat_1.ethers.parseEther("100000"); // 100K tokens
    const VESTING_DURATION = 365 * 24 * 60 * 60; // 1 year
    const CLIFF_DURATION = 30 * 24 * 60 * 60; // 30 days
    async function deployTokenVestingFixture() {
        const [deployer, ownerAddr, beneficiary1Addr, beneficiary2Addr, otherAddr] = await hardhat_1.ethers.getSigners();
        // Deploy mock ERC20 token
        const Token = await hardhat_1.ethers.getContractFactory("HyraToken");
        const tokenImpl = await Token.deploy();
        await tokenImpl.waitForDeployment();
        // Deploy token proxy
        const ProxyDeployer = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await ProxyDeployer.deploy();
        await proxyDeployer.waitForDeployment();
        const ProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy(await ownerAddr.getAddress());
        await proxyAdmin.waitForDeployment();
        // Deploy proxy with empty init data first (to set distribution config before initialize)
        const tokenProxy = await proxyDeployer.deployProxy.staticCall(await tokenImpl.getAddress(), await proxyAdmin.getAddress(), "0x", "TEST");
        await (await proxyDeployer.deployProxy(await tokenImpl.getAddress(), await proxyAdmin.getAddress(), "0x", "TEST")).wait();
        const tokenContract = await hardhat_1.ethers.getContractAt("HyraToken", tokenProxy);

        // Deploy mock distribution wallets for setDistributionConfig
        const MockDistributionWallet = await hardhat_1.ethers.getContractFactory("MockDistributionWallet");
        const distributionWallets = [];
        for (let i = 0; i < 6; i++) {
            const wallet = await MockDistributionWallet.deploy(await ownerAddr.getAddress());
            await wallet.waitForDeployment();
            distributionWallets.push(await wallet.getAddress());
        }

        // Set distribution config BEFORE initialize
        await tokenContract.setDistributionConfig(
            distributionWallets[0],
            distributionWallets[1],
            distributionWallets[2],
            distributionWallets[3],
            distributionWallets[4],
            distributionWallets[5]
        );

        // Deploy mock contract for privilegedMultisigWallet (must be contract, not EOA)
        const privilegedMultisig = await MockDistributionWallet.deploy(await ownerAddr.getAddress());
        await privilegedMultisig.waitForDeployment();

        // Now initialize token
        await tokenContract.initialize(
            "Test Token",
            "TEST",
            INITIAL_SUPPLY,
            await deployer.getAddress(), // initial holder
            await ownerAddr.getAddress(), // governance
            0, // yearStartTime
            await privilegedMultisig.getAddress() // privilegedMultisigWallet
        );
        // Deploy TokenVesting
        const TokenVesting = await hardhat_1.ethers.getContractFactory("TokenVesting");
        const vestingImpl = await TokenVesting.deploy();
        await vestingImpl.waitForDeployment();
        const vestingInit = TokenVesting.interface.encodeFunctionData("initialize", [
            tokenProxy,
            await ownerAddr.getAddress()
        ]);
        const vestingProxy = await proxyDeployer.deployProxy.staticCall(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING");
        await (await proxyDeployer.deployProxy(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING")).wait();
        const vestingContract = await hardhat_1.ethers.getContractAt("TokenVesting", vestingProxy);
        // Transfer tokens to vesting contract
        await (await tokenContract.transfer(vestingProxy, VESTING_AMOUNT * 2n)).wait();
        return {
            token: tokenContract,
            vesting: vestingContract,
            owner: ownerAddr,
            beneficiary1: beneficiary1Addr,
            beneficiary2: beneficiary2Addr,
            other: otherAddr
        };
    }
    beforeEach(async function () {
        const fixture = await (0, hardhat_network_helpers_1.loadFixture)(deployTokenVestingFixture);
        tokenVesting = fixture.vesting;
        token = fixture.token;
        owner = fixture.owner;
        beneficiary1 = fixture.beneficiary1;
        beneficiary2 = fixture.beneficiary2;
        other = fixture.other;
    });
    describe("Initialization", function () {
        it("should initialize correctly", async function () {
            (0, chai_1.expect)(await tokenVesting.owner()).to.equal(await owner.getAddress());
            (0, chai_1.expect)(await tokenVesting.token()).to.equal(await token.getAddress());
        });
        it("should revert if initialized with zero address", async function () {
            const TokenVesting = await hardhat_1.ethers.getContractFactory("TokenVesting");
            const vesting = await TokenVesting.deploy();
            await (0, chai_1.expect)(vesting.initialize(hardhat_1.ethers.ZeroAddress, await owner.getAddress())).to.be.revertedWithCustomError(vesting, "InvalidInitialization");
            await (0, chai_1.expect)(vesting.initialize(await token.getAddress(), hardhat_1.ethers.ZeroAddress)).to.be.revertedWithCustomError(vesting, "InvalidInitialization");
        });
    });
    describe("createVestingSchedule", function () {
        it("should create vesting schedule successfully", async function () {
            const latest = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest.timestamp + 1000;
            const tx = await tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, false, "Test vesting");
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            const vestingScheduleId = hardhat_1.ethers.keccak256(hardhat_1.ethers.solidityPacked(["address", "uint256", "uint256", "uint256", "uint256", "string", "uint256"], [await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting", block.timestamp]));
            await (0, chai_1.expect)(tx)
                .to.emit(tokenVesting, "VestingScheduleCreated")
                .withArgs(vestingScheduleId, await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting");
            (0, chai_1.expect)(await tokenVesting.totalVestedAmount(await beneficiary1.getAddress())).to.equal(VESTING_AMOUNT);
        });
        it("should revert if not owner", async function () {
            const latest = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest.timestamp + 1000;
            await (0, chai_1.expect)(tokenVesting.connect(beneficiary1).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, false, "Test vesting")).to.be.revertedWithCustomError(tokenVesting, "OwnableUnauthorizedAccount");
        });
        it("should revert with invalid parameters", async function () {
            const latest = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest.timestamp + 1000;
            // Zero amount
            await (0, chai_1.expect)(tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), 0, startTime, VESTING_DURATION, CLIFF_DURATION, false, "Test vesting")).to.be.revertedWithCustomError(tokenVesting, "InvalidAmount");
            // Zero address beneficiary
            await (0, chai_1.expect)(tokenVesting.connect(owner).createVestingSchedule(hardhat_1.ethers.ZeroAddress, VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, false, "Test vesting")).to.be.revertedWithCustomError(tokenVesting, "InvalidAddress");
            // Invalid duration (too short)
            await (0, chai_1.expect)(tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, 29 * 24 * 60 * 60, // 29 days (less than minimum)
            CLIFF_DURATION, false, "Test vesting")).to.be.revertedWithCustomError(tokenVesting, "InvalidDuration");
            // Invalid duration (too long)
            await (0, chai_1.expect)(tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, 11 * 365 * 24 * 60 * 60, // 11 years (more than maximum)
            CLIFF_DURATION, false, "Test vesting")).to.be.revertedWithCustomError(tokenVesting, "InvalidDuration");
            // Cliff longer than duration
            await (0, chai_1.expect)(tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, VESTING_DURATION + 1, // Cliff longer than duration
            false, "Test vesting")).to.be.revertedWithCustomError(tokenVesting, "InvalidCliff");
        });
        it("should revert if insufficient token balance", async function () {
            const latest = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest.timestamp + 1000;
            const hugeAmount = hardhat_1.ethers.parseEther("10000000"); // More than contract balance
            await (0, chai_1.expect)(tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), hugeAmount, startTime, VESTING_DURATION, CLIFF_DURATION, false, "Test vesting")).to.be.revertedWithCustomError(tokenVesting, "InsufficientTokenBalance");
        });
    });
    describe("Vesting Calculations", function () {
        let vestingScheduleId;
        let startTime;
        beforeEach(async function () {
            {
                const latest = await hardhat_1.ethers.provider.getBlock("latest");
                startTime = latest.timestamp + 1000;
            }
            const tx = await tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, false, "Test vesting");
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            vestingScheduleId = hardhat_1.ethers.keccak256(hardhat_1.ethers.solidityPacked(["address", "uint256", "uint256", "uint256", "uint256", "string", "uint256"], [await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting", block.timestamp]));
        });
        it("should calculate vested amount correctly", async function () {
            // Before start time - should be 0
            (0, chai_1.expect)(await tokenVesting.getVestedAmount(vestingScheduleId)).to.equal(0);
            // After cliff but before full duration - should be proportional
            await hardhat_network_helpers_1.time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
            const vestedAmount = await tokenVesting.getVestedAmount(vestingScheduleId);
            const timeElapsed = BigInt(CLIFF_DURATION) + BigInt(VESTING_DURATION / 2);
            const expectedAmount = (VESTING_AMOUNT * timeElapsed) / BigInt(VESTING_DURATION);
            // Allow for small time differences
            (0, chai_1.expect)(vestedAmount).to.be.closeTo(expectedAmount, hardhat_1.ethers.parseEther("100"));
            // After full duration - should be full amount
            await hardhat_network_helpers_1.time.increaseTo(startTime + VESTING_DURATION + 1000);
            (0, chai_1.expect)(await tokenVesting.getVestedAmount(vestingScheduleId)).to.equal(VESTING_AMOUNT);
        });
        it("should calculate releasable amount correctly", async function () {
            // Before start time
            (0, chai_1.expect)(await tokenVesting.getReleasableAmount(vestingScheduleId)).to.equal(0);
            // After cliff
            await hardhat_network_helpers_1.time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
            const releasableAmount = await tokenVesting.getReleasableAmount(vestingScheduleId);
            const timeElapsed = BigInt(CLIFF_DURATION) + BigInt(VESTING_DURATION / 2);
            const expectedAmount = (VESTING_AMOUNT * timeElapsed) / BigInt(VESTING_DURATION);
            (0, chai_1.expect)(releasableAmount).to.be.closeTo(expectedAmount, hardhat_1.ethers.parseEther("100"));
        });
    });
    describe("Release Tokens", function () {
        let vestingScheduleId;
        let startTime;
        beforeEach(async function () {
            {
                const latest = await hardhat_1.ethers.provider.getBlock("latest");
                startTime = latest.timestamp + 1000;
            }
            const tx = await tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, false, "Test vesting");
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            vestingScheduleId = hardhat_1.ethers.keccak256(hardhat_1.ethers.solidityPacked(["address", "uint256", "uint256", "uint256", "uint256", "string", "uint256"], [await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting", block.timestamp]));
        });
        it("should release tokens successfully", async function () {
            // Wait for cliff to pass
            await hardhat_network_helpers_1.time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
            const balanceBefore = await token.balanceOf(await beneficiary1.getAddress());
            const releasableAmount = await tokenVesting.getReleasableAmount(vestingScheduleId);
            const tx = await tokenVesting.release(vestingScheduleId);
            const releasedReceipt = await tx.wait();
            const releasedBlock = await hardhat_1.ethers.provider.getBlock(releasedReceipt.blockNumber);
            await (0, chai_1.expect)(tx)
                .to.emit(tokenVesting, "TokensReleased")
                .withArgs(vestingScheduleId, await beneficiary1.getAddress(), withArgs_1.anyValue, withArgs_1.anyValue);
            const balanceAfter = await token.balanceOf(await beneficiary1.getAddress());
            const releasedDelta = balanceAfter - balanceBefore;
            const expectedAtBlock = await tokenVesting.getVestedAmount(vestingScheduleId, { blockTag: releasedReceipt.blockNumber });
            (0, chai_1.expect)(releasedDelta).to.equal(expectedAtBlock);
        });
        it("should revert if no tokens to release", async function () {
            // Before cliff
            await (0, chai_1.expect)(tokenVesting.release(vestingScheduleId)).to.be.revertedWithCustomError(tokenVesting, "NoTokensToRelease");
        });
        it("should revert if vesting schedule not found", async function () {
            const fakeId = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("fake"));
            await (0, chai_1.expect)(tokenVesting.release(fakeId)).to.be.revertedWithCustomError(tokenVesting, "VestingScheduleNotFound");
        });
    });
    describe("Revoke Vesting", function () {
        let vestingScheduleId;
        let startTime;
        beforeEach(async function () {
            {
                const latest = await hardhat_1.ethers.provider.getBlock("latest");
                startTime = latest.timestamp + 1000;
            }
            const tx = await tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, true, // revocable
            "Test vesting");
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            vestingScheduleId = hardhat_1.ethers.keccak256(hardhat_1.ethers.solidityPacked(["address", "uint256", "uint256", "uint256", "uint256", "string", "uint256"], [await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting", block.timestamp]));
        });
        it("should revoke vesting schedule successfully", async function () {
            // Wait for some time but not full duration
            await hardhat_network_helpers_1.time.increaseTo(startTime + (VESTING_DURATION / 2));
            const tx = await tokenVesting.connect(owner).revoke(vestingScheduleId);
            await (0, chai_1.expect)(tx)
                .to.emit(tokenVesting, "VestingScheduleRevoked")
                .withArgs(vestingScheduleId, await beneficiary1.getAddress(), withArgs_1.anyValue, withArgs_1.anyValue);
        });
        it("should revert if not revocable", async function () {
            // Create non-revocable vesting
            const tx2 = await tokenVesting.connect(owner).createVestingSchedule(await beneficiary2.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, false, // not revocable
            "Test vesting 2");
            const receipt2 = await tx2.wait();
            const block2 = await hardhat_1.ethers.provider.getBlock(receipt2.blockNumber);
            const vestingScheduleId2 = hardhat_1.ethers.keccak256(hardhat_1.ethers.solidityPacked(["address", "uint256", "uint256", "uint256", "uint256", "string", "uint256"], [await beneficiary2.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting 2", block2.timestamp]));
            await (0, chai_1.expect)(tokenVesting.connect(owner).revoke(vestingScheduleId2)).to.be.revertedWithCustomError(tokenVesting, "NotRevocable");
        });
        it("should revert if not owner", async function () {
            await (0, chai_1.expect)(tokenVesting.connect(beneficiary1).revoke(vestingScheduleId)).to.be.revertedWithCustomError(tokenVesting, "OwnableUnauthorizedAccount");
        });
    });
    describe("Emergency Withdraw", function () {
        it("should allow emergency withdraw by owner", async function () {
            const withdrawAmount = hardhat_1.ethers.parseEther("1000");
            const balanceBefore = await token.balanceOf(await owner.getAddress());
            const tx = await tokenVesting.connect(owner).emergencyWithdraw(withdrawAmount);
            const ewReceipt = await tx.wait();
            const ewBlock = await hardhat_1.ethers.provider.getBlock(ewReceipt.blockNumber);
            await (0, chai_1.expect)(tx)
                .to.emit(tokenVesting, "EmergencyWithdraw")
                .withArgs(await token.getAddress(), withdrawAmount, ewBlock.timestamp);
            const balanceAfter = await token.balanceOf(await owner.getAddress());
            (0, chai_1.expect)(balanceAfter - balanceBefore).to.equal(withdrawAmount);
        });
        it("should revert if not owner", async function () {
            const withdrawAmount = hardhat_1.ethers.parseEther("1000");
            await (0, chai_1.expect)(tokenVesting.connect(beneficiary1).emergencyWithdraw(withdrawAmount)).to.be.revertedWithCustomError(tokenVesting, "OwnableUnauthorizedAccount");
        });
    });
    describe("View Functions", function () {
        let vestingScheduleId;
        let startTime;
        beforeEach(async function () {
            {
                const latest = await hardhat_1.ethers.provider.getBlock("latest");
                startTime = latest.timestamp + 1000;
            }
            const tx = await tokenVesting.connect(owner).createVestingSchedule(await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, true, "Test vesting");
            const receipt = await tx.wait();
            const block = await hardhat_1.ethers.provider.getBlock(receipt.blockNumber);
            vestingScheduleId = hardhat_1.ethers.keccak256(hardhat_1.ethers.solidityPacked(["address", "uint256", "uint256", "uint256", "uint256", "string", "uint256"], [await beneficiary1.getAddress(), VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting", block.timestamp]));
        });
        it("should return correct vesting schedule details", async function () {
            const schedule = await tokenVesting.getVestingSchedule(vestingScheduleId);
            (0, chai_1.expect)(schedule.initialized).to.be.true;
            (0, chai_1.expect)(schedule.revocable).to.be.true;
            (0, chai_1.expect)(schedule.totalAmount).to.equal(VESTING_AMOUNT);
            (0, chai_1.expect)(schedule.releasedAmount).to.equal(0);
            (0, chai_1.expect)(schedule.startTime).to.equal(startTime);
            (0, chai_1.expect)(schedule.duration).to.equal(VESTING_DURATION);
            (0, chai_1.expect)(schedule.cliff).to.equal(CLIFF_DURATION);
            (0, chai_1.expect)(schedule.beneficiary).to.equal(await beneficiary1.getAddress());
            (0, chai_1.expect)(schedule.purpose).to.equal("Test vesting");
        });
        it("should return correct total amounts", async function () {
            (0, chai_1.expect)(await tokenVesting.totalVestedAmount(await beneficiary1.getAddress())).to.equal(VESTING_AMOUNT);
            (0, chai_1.expect)(await tokenVesting.totalReleasedAmount(await beneficiary1.getAddress())).to.equal(0);
        });
    });
});
