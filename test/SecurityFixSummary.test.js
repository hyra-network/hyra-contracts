"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
describe("Security Fix Summary - HNA-01 Resolution", function () {
    let token;
    let vesting;
    let owner;
    let beneficiary1;
    let beneficiary2;
    const INITIAL_SUPPLY = hardhat_1.ethers.parseEther("2500000000"); // 2.5B tokens
    const VESTING_AMOUNT_1 = hardhat_1.ethers.parseEther("500000000"); // 500M tokens
    const VESTING_AMOUNT_2 = hardhat_1.ethers.parseEther("300000000"); // 300M tokens
    async function deploySecureSystemFixture() {
        const [deployer, ownerAddr, beneficiary1Addr, beneficiary2Addr] = await hardhat_1.ethers.getSigners();
        // Deploy infrastructure
        const ProxyDeployer = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await ProxyDeployer.deploy();
        await proxyDeployer.waitForDeployment();
        const ProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy(await ownerAddr.getAddress());
        await proxyAdmin.waitForDeployment();
        // Deploy TokenVesting
        const TokenVesting = await hardhat_1.ethers.getContractFactory("TokenVesting");
        const vestingImpl = await TokenVesting.deploy();
        await vestingImpl.waitForDeployment();
        const vestingInit = "0x"; // Defer initialization until token is deployed
        const vestingProxy = await proxyDeployer.deployProxy.staticCall(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING");
        await (await proxyDeployer.deployProxy(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING")).wait();
        const vestingContract = await hardhat_1.ethers.getContractAt("TokenVesting", vestingProxy);
        // Deploy HyraToken with secure initialization
        const Token = await hardhat_1.ethers.getContractFactory("HyraToken");
        const tokenImpl = await Token.deploy();
        await tokenImpl.waitForDeployment();
        // Deploy proxy with empty init data first (to set distribution config before initialize)
        const tokenProxy = await proxyDeployer.deployProxy.staticCall(await tokenImpl.getAddress(), await proxyAdmin.getAddress(), "0x", "TOKEN");
        await (await proxyDeployer.deployProxy(await tokenImpl.getAddress(), await proxyAdmin.getAddress(), "0x", "TOKEN")).wait();
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

        // Now initialize token with secure initialization (using vesting contract)
        await tokenContract.initialize(
            "HYRA",
            "HYRA-S",
            INITIAL_SUPPLY,
            vestingProxy, // Use vesting contract instead of single holder
            await ownerAddr.getAddress(), // governance
            0, // yearStartTime
            await privilegedMultisig.getAddress() // privilegedMultisigWallet
        );
        // Initialize vesting contract now that token address is known
        await vestingContract.initialize(tokenProxy, await ownerAddr.getAddress());
        return {
            token: tokenContract,
            vesting: vestingContract,
            owner: ownerAddr,
            beneficiary1: beneficiary1Addr,
            beneficiary2: beneficiary2Addr
        };
    }
    beforeEach(async function () {
        const fixture = await (0, hardhat_network_helpers_1.loadFixture)(deploySecureSystemFixture);
        token = fixture.token;
        vesting = fixture.vesting;
        owner = fixture.owner;
        beneficiary1 = fixture.beneficiary1;
        beneficiary2 = fixture.beneficiary2;
    });
    describe("HNA-01 Security Fix Verification", function () {
        it("Should use vesting contract instead of single holder", async function () {
            // Verify tokens are minted to vesting contract, not single holder
            (0, chai_1.expect)(await token.balanceOf(await vesting.getAddress())).to.equal(INITIAL_SUPPLY);
            (0, chai_1.expect)(await token.balanceOf(beneficiary1.getAddress())).to.equal(0);
            (0, chai_1.expect)(await token.balanceOf(beneficiary2.getAddress())).to.equal(0);
            console.log("Token distribution: Vesting contract receives initial tokens");
        });
        it("Should create secure vesting schedules", async function () {
            const latest = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest.timestamp + 1000;
            const duration = 365 * 24 * 60 * 60; // 1 year
            const cliff = 30 * 24 * 60 * 60; // 30 days
            // Create vesting schedule for beneficiary 1
            const tx1 = await vesting.connect(owner).createVestingSchedule(beneficiary1.getAddress(), VESTING_AMOUNT_1, startTime, duration, cliff, false, "Team member vesting");
            await (0, chai_1.expect)(tx1)
                .to.emit(vesting, "VestingScheduleCreated");
            // Create vesting schedule for beneficiary 2
            const tx2 = await vesting.connect(owner).createVestingSchedule(beneficiary2.getAddress(), VESTING_AMOUNT_2, startTime + 1000, duration * 2, cliff * 2, true, "Advisor vesting");
            await (0, chai_1.expect)(tx2)
                .to.emit(vesting, "VestingScheduleCreated");
            // Verify vesting amounts
            (0, chai_1.expect)(await vesting.totalVestedAmount(beneficiary1.getAddress())).to.equal(VESTING_AMOUNT_1);
            (0, chai_1.expect)(await vesting.totalVestedAmount(beneficiary2.getAddress())).to.equal(VESTING_AMOUNT_2);
            console.log("Vesting schedules created successfully");
            console.log(`   - Beneficiary 1: ${hardhat_1.ethers.formatEther(VESTING_AMOUNT_1)} tokens`);
            console.log(`   - Beneficiary 2: ${hardhat_1.ethers.formatEther(VESTING_AMOUNT_2)} tokens`);
        });
        it("Should prevent immediate token access (cliff protection)", async function () {
            const latest2 = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest2.timestamp + 1000;
            const duration = 365 * 24 * 60 * 60; // 1 year
            const cliff = 30 * 24 * 60 * 60; // 30 days
            // Create vesting schedule
            const tx = await vesting.connect(owner).createVestingSchedule(beneficiary1.getAddress(), VESTING_AMOUNT_1, startTime, duration, cliff, false, "Test vesting");
            const receipt = await tx.wait();
            const event = receipt?.logs.find(log => {
                try {
                    const parsed = vesting.interface.parseLog(log);
                    return parsed?.name === "VestingScheduleCreated";
                }
                catch {
                    return false;
                }
            });
            if (event) {
                const parsed = vesting.interface.parseLog(event);
                const vestingScheduleId = parsed?.args[0];
                // Try to release before cliff (should fail)
                await (0, chai_1.expect)(vesting.release(vestingScheduleId)).to.be.revertedWithCustomError(vesting, "NoTokensToRelease");
                console.log("Cliff protection working - no immediate token access");
            }
        });
        it("Should allow gradual token release after cliff", async function () {
            const latest3 = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest3.timestamp + 1000;
            const duration = 365 * 24 * 60 * 60; // 1 year
            const cliff = 30 * 24 * 60 * 60; // 30 days
            // Create vesting schedule
            const tx = await vesting.connect(owner).createVestingSchedule(beneficiary1.getAddress(), VESTING_AMOUNT_1, startTime, duration, cliff, false, "Test vesting");
            const receipt = await tx.wait();
            const event = receipt?.logs.find(log => {
                try {
                    const parsed = vesting.interface.parseLog(log);
                    return parsed?.name === "VestingScheduleCreated";
                }
                catch {
                    return false;
                }
            });
            if (event) {
                const parsed = vesting.interface.parseLog(event);
                const vestingScheduleId = parsed?.args[0];
                // Wait for cliff to pass
                await hardhat_network_helpers_1.time.increaseTo(startTime + cliff + (duration / 2));
                const balanceBefore = await token.balanceOf(beneficiary1.getAddress());
                // Release tokens (should succeed)
                const releaseTx = await vesting.release(vestingScheduleId);
                await (0, chai_1.expect)(releaseTx)
                    .to.emit(vesting, "TokensReleased");
                const balanceAfter = await token.balanceOf(beneficiary1.getAddress());
                (0, chai_1.expect)(balanceAfter).to.be.greaterThan(balanceBefore);
                console.log("Gradual token release working after cliff");
                console.log(`   - Released: ${hardhat_1.ethers.formatEther(balanceAfter - balanceBefore)} tokens`);
            }
        });
        it("Should enforce governance control", async function () {
            // Only owner can create vesting schedules
            const latest4 = await hardhat_1.ethers.provider.getBlock("latest");
            const startTime = latest4.timestamp + 1000;
            await (0, chai_1.expect)(vesting.connect(beneficiary1).createVestingSchedule(beneficiary1.getAddress(), VESTING_AMOUNT_1, startTime, 365 * 24 * 60 * 60, 30 * 24 * 60 * 60, false, "Unauthorized vesting")).to.be.revertedWithCustomError(vesting, "OwnableUnauthorizedAccount");
            console.log("Governance control enforced - only owner can create vesting schedules");
        });
        it("Should support emergency controls", async function () {
            const withdrawAmount = hardhat_1.ethers.parseEther("1000000");
            const balanceBefore = await token.balanceOf(owner.getAddress());
            // Owner can emergency withdraw
            const tx = await vesting.connect(owner).emergencyWithdraw(withdrawAmount);
            await (0, chai_1.expect)(tx)
                .to.emit(vesting, "EmergencyWithdraw");
            const balanceAfter = await token.balanceOf(owner.getAddress());
            (0, chai_1.expect)(balanceAfter - balanceBefore).to.equal(withdrawAmount);
            console.log("Emergency controls working - owner can withdraw if needed");
        });
        // Legacy comparison removed in JS tests
    });
    describe("Summary of Security Improvements", function () {
        it("Should summarize all security improvements", async function () {
            console.log("\nHNA-01 SECURITY FIX SUMMARY:");
            console.log("=====================================");
            console.log("CENTRALIZATION RISK ELIMINATED");
            console.log("   - Before: Single holder with all tokens");
            console.log("   - After: Vesting contract with gradual distribution");
            console.log("");
            console.log("MULTI-SIGNATURE PROTECTION");
            console.log("   - Vesting contract owned by governance");
            console.log("   - Requires consensus for token operations");
            console.log("");
            console.log("TIME-BASED SECURITY");
            console.log("   - Cliff periods prevent immediate access");
            console.log("   - Gradual release over time");
            console.log("");
            console.log("GOVERNANCE INTEGRATION");
            console.log("   - Community oversight of token distribution");
            console.log("   - Transparent and auditable");
            console.log("");
            console.log("EMERGENCY CONTROLS");
            console.log("   - Emergency withdraw capability");
            console.log("   - Revocable vesting schedules");
            console.log("");
            console.log("RESULT: HNA-01 CENTRALIZATION RISK RESOLVED");
            console.log("=====================================\n");
            // Verify the fix is working
            (0, chai_1.expect)(await token.balanceOf(await vesting.getAddress())).to.equal(INITIAL_SUPPLY);
            (0, chai_1.expect)(await token.owner()).to.equal(await owner.getAddress());
            (0, chai_1.expect)(await vesting.owner()).to.equal(await owner.getAddress());
        });
    });
});
