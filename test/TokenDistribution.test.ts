import { expect } from "chai";
import { ethers } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * Test suite for token distribution to 6 multisig wallets
 * 
 * Tests:
 * - setDistributionConfig() can only be called once
 * - Initial supply distribution
 * - Mint request distribution
 * - Distribution percentages (60%, 12%, 10%, 8%, 5%, 5%)
 * - Rounding handling
 */
describe("Token Distribution to 6 Multisig Wallets", function () {
    let token: HyraToken;
    let governor: HyraGovernor;
    let timelock: HyraTimelock;
    let owner: SignerWithAddress;
    let wallet1: SignerWithAddress;  // Community & Ecosystem (60%)
    let wallet2: SignerWithAddress;  // Liquidity, Buyback & Reserve (12%)
    let wallet3: SignerWithAddress;  // Marketing & Partnerships (10%)
    let wallet4: SignerWithAddress;  // Team & Founders (8%)
    let wallet5: SignerWithAddress;  // Strategic Advisors (5%)
    let wallet6: SignerWithAddress;  // Seed & Strategic VC (5%)
    let voter1: SignerWithAddress;
    let voter2: SignerWithAddress;

    const VOTING_DELAY = 1;
    const VOTING_PERIOD = 100;
    const PROPOSAL_THRESHOLD = ethers.parseEther("1000000");
    const QUORUM_PERCENTAGE = 10;
    const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5B

    // Deploy mock multisig contracts (contracts with code)
    // We'll use a simple contract deployment to create addresses with code
    async function deployMockMultisig(): Promise<string> {
        // Deploy a simple contract to use as multisig mock
        const SimpleContract = await ethers.getContractFactory("HyraTimelock");
        const mockContract = await SimpleContract.deploy();
        await mockContract.waitForDeployment();
        return await mockContract.getAddress();
    }

    beforeEach(async function () {
        [owner, wallet1, wallet2, wallet3, wallet4, wallet5, wallet6, voter1, voter2] = await ethers.getSigners();

        // Deploy HyraTimelock
        const HyraTimelockFactory = await ethers.getContractFactory("HyraTimelock");
        const timelockImpl = await HyraTimelockFactory.deploy();
        await timelockImpl.waitForDeployment();
        const tlInit = HyraTimelockFactory.interface.encodeFunctionData("initialize", [
            2 * 24 * 60 * 60,
            [],
            [],
            await owner.getAddress(),
        ]);
        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const tlProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), tlInit);
        await tlProxy.waitForDeployment();
        timelock = await ethers.getContractAt("HyraTimelock", await tlProxy.getAddress());

        // Deploy HyraToken (but don't initialize yet)
        const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
        const tokenImpl = await HyraTokenFactory.deploy();
        await tokenImpl.waitForDeployment();
        
        // Deploy token proxy without initialization
        const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
        await tokenProxy.waitForDeployment();
        token = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

        // Deploy HyraGovernor
        const HyraGovernorFactory = await ethers.getContractFactory("HyraGovernor");
        const govImpl = await HyraGovernorFactory.deploy();
        await govImpl.waitForDeployment();
        const govInit = HyraGovernorFactory.interface.encodeFunctionData("initialize", [
            await token.getAddress(),
            await timelock.getAddress(),
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM_PERCENTAGE,
            await privilegedMultisig.getAddress() // privilegedMultisigWallet (already deployed above)
        ]);
        const govProxy = await ERC1967Proxy.deploy(await govImpl.getAddress(), govInit);
        await govProxy.waitForDeployment();
        governor = await ethers.getContractAt("HyraGovernor", await govProxy.getAddress());

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
        await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
        await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
        await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());

        // Deploy mock multisig wallets (contracts)
        const multisig1 = await deployMockMultisig();
        const multisig2 = await deployMockMultisig();
        const multisig3 = await deployMockMultisig();
        const multisig4 = await deployMockMultisig();
        const multisig5 = await deployMockMultisig();
        const multisig6 = await deployMockMultisig();

        // Set distribution config
        await token.setDistributionConfig(
            multisig1,  // Community & Ecosystem (60%)
            multisig2,  // Liquidity, Buyback & Reserve (12%)
            multisig3,  // Marketing & Partnerships (10%)
            multisig4,  // Team & Founders (8%)
            multisig5,  // Strategic Advisors (5%)
            multisig6   // Seed & Strategic VC (5%)
        );

        // Note: multisig addresses are contract addresses, we'll use them for balance checks

        await mine(1);
    });

    describe("setDistributionConfig()", function () {
        it("Should set distribution config successfully", async function () {
            const config = await token.distributionConfig();
            const configSet = await token.configSet();

            expect(configSet).to.be.true;
            expect(config.communityEcosystem).to.not.equal(ethers.ZeroAddress);
            expect(config.liquidityBuybackReserve).to.not.equal(ethers.ZeroAddress);
            expect(config.marketingPartnerships).to.not.equal(ethers.ZeroAddress);
            expect(config.teamFounders).to.not.equal(ethers.ZeroAddress);
            expect(config.strategicAdvisors).to.not.equal(ethers.ZeroAddress);
            expect(config.seedStrategicVC).to.not.equal(ethers.ZeroAddress);
        });

        it("Should revert if called twice", async function () {
            const config = await token.distributionConfig();
            
            await expect(
                token.setDistributionConfig(
                    config.communityEcosystem,
                    config.liquidityBuybackReserve,
                    config.marketingPartnerships,
                    config.teamFounders,
                    config.strategicAdvisors,
                    config.seedStrategicVC
                )
            ).to.be.revertedWithCustomError(token, "ConfigAlreadySet");
        });

        it("Should revert if address is zero", async function () {
            // Deploy new token to test
            const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
            const tokenImpl = await HyraTokenFactory.deploy();
            await tokenImpl.waitForDeployment();
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
            await tokenProxy.waitForDeployment();
            const newToken = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

            const multisig1 = await deployMockMultisig();
            
            await expect(
                newToken.setDistributionConfig(
                    ethers.ZeroAddress,  // Zero address
                    multisig1,
                    multisig1,
                    multisig1,
                    multisig1,
                    multisig1
                )
            ).to.be.revertedWithCustomError(newToken, "ZeroAddress");
        });

        it("Should revert if address is EOA (not contract)", async function () {
            const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
            const tokenImpl = await HyraTokenFactory.deploy();
            await tokenImpl.waitForDeployment();
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
            await tokenProxy.waitForDeployment();
            const newToken = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

            const multisig1 = await deployMockMultisig();
            const eoaAddress = await owner.getAddress();  // EOA address

            await expect(
                newToken.setDistributionConfig(
                    eoaAddress,  // EOA, not contract
                    multisig1,
                    multisig1,
                    multisig1,
                    multisig1,
                    multisig1
                )
            ).to.be.revertedWithCustomError(newToken, "NotContract");
        });

        it("Should revert if duplicate addresses", async function () {
            const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
            const tokenImpl = await HyraTokenFactory.deploy();
            await tokenImpl.waitForDeployment();
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
            await tokenProxy.waitForDeployment();
            const newToken = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

            const multisig1 = await deployMockMultisig();

            await expect(
                newToken.setDistributionConfig(
                    multisig1,
                    multisig1,  // Duplicate
                    multisig1,
                    multisig1,
                    multisig1,
                    multisig1
                )
            ).to.be.revertedWithCustomError(newToken, "DuplicateAddress");
        });
    });

    describe("Initial Supply Distribution", function () {
        it("Should distribute initial supply to 6 wallets with correct percentages", async function () {
            // Deploy new token instance
            const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
            const tokenImpl = await HyraTokenFactory.deploy();
            await tokenImpl.waitForDeployment();
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
            await tokenProxy.waitForDeployment();
            const initializedToken = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

            // Deploy mock multisig contracts
            const multisig1 = await deployMockMultisig();
            const multisig2 = await deployMockMultisig();
            const multisig3 = await deployMockMultisig();
            const multisig4 = await deployMockMultisig();
            const multisig5 = await deployMockMultisig();
            const multisig6 = await deployMockMultisig();

            // Set distribution config BEFORE initialize
            await initializedToken.setDistributionConfig(
                multisig1, multisig2, multisig3, multisig4, multisig5, multisig6
            );

            // Deploy mock contract for privilegedMultisigWallet
            const privilegedMultisig = await deployMockMultisig();

            // Initialize token (will auto-distribute)
            await initializedToken.initialize(
                "HYRA",
                "HYRA",
                INITIAL_SUPPLY,
                await owner.getAddress(),  // vesting (not used when distributing)
                await timelock.getAddress(),
                0,
                privilegedMultisig, // privilegedMultisigWallet
            );

            // Check balances
            const balance1 = await initializedToken.balanceOf(multisig1);
            const balance2 = await initializedToken.balanceOf(multisig2);
            const balance3 = await initializedToken.balanceOf(multisig3);
            const balance4 = await initializedToken.balanceOf(multisig4);
            const balance5 = await initializedToken.balanceOf(multisig5);
            const balance6 = await initializedToken.balanceOf(multisig6);

            const total = balance1 + balance2 + balance3 + balance4 + balance5 + balance6;
            expect(total).to.equal(INITIAL_SUPPLY);

            // Verify percentages (with small tolerance for rounding)
            const basisPoints = 10000n;
            expect(balance1 * basisPoints / INITIAL_SUPPLY).to.be.closeTo(6000n, 1n);  // 60%
            expect(balance2 * basisPoints / INITIAL_SUPPLY).to.be.closeTo(1200n, 1n);  // 12%
            expect(balance3 * basisPoints / INITIAL_SUPPLY).to.be.closeTo(1000n, 1n);  // 10%
            expect(balance4 * basisPoints / INITIAL_SUPPLY).to.be.closeTo(800n, 1n);   // 8%
            expect(balance5 * basisPoints / INITIAL_SUPPLY).to.be.closeTo(500n, 1n);   // 5%
            expect(balance6 * basisPoints / INITIAL_SUPPLY).to.be.closeTo(500n, 1n);   // 5%
        });

        it("Should revert initialize if config not set", async function () {
            const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
            const tokenImpl = await HyraTokenFactory.deploy();
            await tokenImpl.waitForDeployment();
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
            await tokenProxy.waitForDeployment();
            const newToken = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

            // Deploy mock contract for privilegedMultisigWallet
            const privilegedMultisig = await deployMockMultisig();

            // Try to initialize without setting config first
            await expect(
                newToken.initialize(
                    "HYRA",
                    "HYRA",
                    INITIAL_SUPPLY,
                    await owner.getAddress(),
                    await timelock.getAddress(),
                    0,
                    privilegedMultisig // privilegedMultisigWallet
                )
            ).to.be.revertedWithCustomError(newToken, "ConfigNotSet");
        });
    });

    describe("Mint Request Distribution", function () {
        let testToken: HyraToken;
        let testMultisig1: string;
        let testMultisig2: string;
        let testMultisig3: string;
        let testMultisig4: string;
        let testMultisig5: string;
        let testMultisig6: string;

        beforeEach(async function () {
            // Deploy new token instance
            const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
            const tokenImpl = await HyraTokenFactory.deploy();
            await tokenImpl.waitForDeployment();
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
            await tokenProxy.waitForDeployment();
            testToken = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

            // Deploy mock multisig wallets
            testMultisig1 = await deployMockMultisig();
            testMultisig2 = await deployMockMultisig();
            testMultisig3 = await deployMockMultisig();
            testMultisig4 = await deployMockMultisig();
            testMultisig5 = await deployMockMultisig();
            testMultisig6 = await deployMockMultisig();

            // Set distribution config BEFORE initialize
            await testToken.setDistributionConfig(
                testMultisig1, testMultisig2, testMultisig3, testMultisig4, testMultisig5, testMultisig6
            );

            // Initialize token (will auto-distribute initial supply)
            const privilegedMultisig = await deployMockMultisig();
            await testToken.initialize(
                "HYRA",
                "HYRA",
                INITIAL_SUPPLY,
                await owner.getAddress(),
                await timelock.getAddress(),
                0,
                privilegedMultisig // privilegedMultisigWallet
            );

            // Transfer ownership to timelock
            await testToken.transferOwnership(await timelock.getAddress());
        });

        it("Should distribute mint request to 6 wallets with correct percentages", async function () {
            const mintAmount = ethers.parseEther("100000000"); // 100M

            // Get initial balances
            const initialBalance1 = await testToken.balanceOf(testMultisig1);
            const initialBalance2 = await testToken.balanceOf(testMultisig2);
            const initialBalance3 = await testToken.balanceOf(testMultisig3);
            const initialBalance4 = await testToken.balanceOf(testMultisig4);
            const initialBalance5 = await testToken.balanceOf(testMultisig5);
            const initialBalance6 = await testToken.balanceOf(testMultisig6);

            // Create mint request (need to be owner)
            await testToken.connect(owner).createMintRequest(
                await owner.getAddress(),  // recipient (ignored when distributing)
                mintAmount,
                "Test mint"
            );

            // Wait for delay
            await time.increase(2 * 24 * 60 * 60 + 1);

            // Execute mint request
            await testToken.executeMintRequest(0);

            // Check new balances
            const newBalance1 = await testToken.balanceOf(testMultisig1);
            const newBalance2 = await testToken.balanceOf(testMultisig2);
            const newBalance3 = await testToken.balanceOf(testMultisig3);
            const newBalance4 = await testToken.balanceOf(testMultisig4);
            const newBalance5 = await testToken.balanceOf(testMultisig5);
            const newBalance6 = await testToken.balanceOf(testMultisig6);

            // Calculate distributed amounts from mint
            const distributed1 = newBalance1 - initialBalance1;
            const distributed2 = newBalance2 - initialBalance2;
            const distributed3 = newBalance3 - initialBalance3;
            const distributed4 = newBalance4 - initialBalance4;
            const distributed5 = newBalance5 - initialBalance5;
            const distributed6 = newBalance6 - initialBalance6;

            const distributedTotal = distributed1 + distributed2 + distributed3 + distributed4 + distributed5 + distributed6;
            expect(distributedTotal).to.equal(mintAmount);

            // Verify percentages
            const basisPoints = 10000n;
            expect(distributed1 * basisPoints / mintAmount).to.be.closeTo(6000n, 1n);  // 60%
            expect(distributed2 * basisPoints / mintAmount).to.be.closeTo(1200n, 1n);  // 12%
            expect(distributed3 * basisPoints / mintAmount).to.be.closeTo(1000n, 1n);  // 10%
            expect(distributed4 * basisPoints / mintAmount).to.be.closeTo(800n, 1n);   // 8%
            expect(distributed5 * basisPoints / mintAmount).to.be.closeTo(500n, 1n);   // 5%
            expect(distributed6 * basisPoints / mintAmount).to.be.closeTo(500n, 1n);   // 5%
        });

    });

    describe("Distribution Math and Rounding", function () {
        it("Should handle rounding correctly - remainder goes to Community", async function () {
            const testAmount = ethers.parseEther("1000"); // Small amount to test rounding

            const multisig1 = await deployMockMultisig();
            const multisig2 = await deployMockMultisig();
            const multisig3 = await deployMockMultisig();
            const multisig4 = await deployMockMultisig();
            const multisig5 = await deployMockMultisig();
            const multisig6 = await deployMockMultisig();

            // Deploy token
            const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
            const tokenImpl = await HyraTokenFactory.deploy();
            await tokenImpl.waitForDeployment();
            const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
            const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
            await tokenProxy.waitForDeployment();
            const testToken = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

            // Set distribution config BEFORE initialize
            await testToken.setDistributionConfig(
                multisig1, multisig2, multisig3, multisig4, multisig5, multisig6
            );

            // Initialize with test amount
            const privilegedMultisig = await deployMockMultisig();
            await testToken.initialize(
                "HYRA",
                "HYRA",
                testAmount,
                await owner.getAddress(),
                await timelock.getAddress(),
                0,
                privilegedMultisig // privilegedMultisigWallet
            );

            const balance1 = await testToken.balanceOf(multisig1);
            const balance2 = await testToken.balanceOf(multisig2);
            const balance3 = await testToken.balanceOf(multisig3);
            const balance4 = await testToken.balanceOf(multisig4);
            const balance5 = await testToken.balanceOf(multisig5);
            const balance6 = await testToken.balanceOf(multisig6);

            const total = balance1 + balance2 + balance3 + balance4 + balance5 + balance6;
            expect(total).to.equal(testAmount);

            // Verify remainder is in Community & Ecosystem
            const basisPoints = 10000n;
            const expectedCommunity = (testAmount * 6000n) / basisPoints;
            const expectedLiquidity = (testAmount * 1200n) / basisPoints;
            const expectedMarketing = (testAmount * 1000n) / basisPoints;
            const expectedTeam = (testAmount * 800n) / basisPoints;
            const expectedAdvisors = (testAmount * 500n) / basisPoints;
            const expectedSeed = (testAmount * 500n) / basisPoints;
            const remainder = testAmount - (
                expectedCommunity + expectedLiquidity + expectedMarketing + 
                expectedTeam + expectedAdvisors + expectedSeed
            );
            
            expect(balance1).to.equal(expectedCommunity + remainder);
            expect(balance2).to.equal(expectedLiquidity);
            expect(balance3).to.equal(expectedMarketing);
            expect(balance4).to.equal(expectedTeam);
            expect(balance5).to.equal(expectedAdvisors);
            expect(balance6).to.equal(expectedSeed);
        });
    });
});

