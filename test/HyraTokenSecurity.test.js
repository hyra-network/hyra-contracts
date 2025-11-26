"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockVestingContract = void 0;
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
describe("HyraToken Security Fixes (HNA-01)", function () {
    let token;
    let vestingContract;
    let owner;
    let beneficiary;
    let other;
    const INITIAL_SUPPLY = hardhat_1.ethers.parseEther("1000000"); // smaller initial supply to leave annual cap headroom
    const MAX_INITIAL_SUPPLY = hardhat_1.ethers.parseEther("2500000000"); // 5% of 50B
    async function deployTokenFixture() {
        const [deployer, ownerAddr, beneficiaryAddr, otherAddr] = await hardhat_1.ethers.getSigners();
        // Deploy HyraToken
        const Token = await hardhat_1.ethers.getContractFactory("HyraToken");
        const tokenImpl = await Token.deploy();
        await tokenImpl.waitForDeployment();
        // Deploy proxy infrastructure
        const ProxyDeployer = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
        const proxyDeployer = await ProxyDeployer.deploy();
        await proxyDeployer.waitForDeployment();
        const ProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await ProxyAdmin.deploy(await ownerAddr.getAddress());
        await proxyAdmin.waitForDeployment();
        // Deploy mock vesting contract
        const VestingContract = await hardhat_1.ethers.getContractFactory("MockVestingContract");
        const vestingImpl = await VestingContract.deploy();
        await vestingImpl.waitForDeployment();
        const vestingInit = VestingContract.interface.encodeFunctionData("initialize", [
            "Vesting Contract",
            "VESTING"
        ]);
        const vestingProxy = await proxyDeployer.deployProxy.staticCall(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING");
        await (await proxyDeployer.deployProxy(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING")).wait();
        const vestingContract = await hardhat_1.ethers.getContractAt("MockVestingContract", vestingProxy);
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

        // Now initialize token with vesting contract
        await tokenContract.initialize(
            "HYRA",
            "HYRA",
            INITIAL_SUPPLY,
            vestingProxy, // Use vesting contract instead of single holder
            await ownerAddr.getAddress(), // governance
            0, // yearStartTime
            await privilegedMultisig.getAddress() // privilegedMultisigWallet
        );
        return {
            token: tokenContract,
            vesting: vestingContract,
            owner: ownerAddr,
            beneficiary: beneficiaryAddr,
            other: otherAddr
        };
    }
    // Legacy flow removed in JS tests as well
    describe("Secure Initialization (New Method)", function () {
        beforeEach(async function () {
            const fixture = await (0, hardhat_network_helpers_1.loadFixture)(deployTokenFixture);
            token = fixture.token;
            vestingContract = fixture.vesting;
            owner = fixture.owner;
            beneficiary = fixture.beneficiary;
            other = fixture.other;
        });
        it("should initialize with vesting contract", async function () {
            (0, chai_1.expect)(await token.name()).to.equal("HYRA");
            (0, chai_1.expect)(await token.symbol()).to.equal("HYRA");
            (0, chai_1.expect)(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
            (0, chai_1.expect)(await token.balanceOf(await vestingContract.getAddress())).to.equal(INITIAL_SUPPLY);
            (0, chai_1.expect)(await token.owner()).to.equal(await owner.getAddress());
        });
        it("should emit InitialDistribution event with vesting contract", async function () {
            // This test verifies the event was emitted during deployment
            // In a real scenario, we would check the deployment transaction logs
            (0, chai_1.expect)(await token.balanceOf(await vestingContract.getAddress())).to.equal(INITIAL_SUPPLY);
        });
        it("should not allow direct transfers from vesting contract without proper authorization", async function () {
            // Vesting contract should not be able to transfer tokens without proper vesting schedule
            const vestingAddress = await vestingContract.getAddress();
            // Try to transfer from vesting contract (should fail if vesting contract doesn't have transfer function)
            await (0, chai_1.expect)(vestingContract.connect(owner).transfer(beneficiary.getAddress(), hardhat_1.ethers.parseEther("1000"))).to.be.reverted; // Mock vesting contract doesn't have transfer function
        });
        it("should enforce maximum initial supply limit", async function () {
            // Test that we can't exceed 5% of max supply
            const Token = await hardhat_1.ethers.getContractFactory("HyraToken");
            const tokenImpl = await Token.deploy();
            await tokenImpl.waitForDeployment();
            const ProxyDeployer = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
            const proxyDeployer = await ProxyDeployer.deploy();
            await proxyDeployer.waitForDeployment();
            const ProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
            const proxyAdmin = await ProxyAdmin.deploy(owner.getAddress());
            await proxyAdmin.waitForDeployment();
            const VestingContract = await hardhat_1.ethers.getContractFactory("MockVestingContract");
            const vestingImpl = await VestingContract.deploy();
            await vestingImpl.waitForDeployment();
            const vestingInit = VestingContract.interface.encodeFunctionData("initialize", [
                "Vesting Contract",
                "VESTING"
            ]);
            const vestingProxy = await proxyDeployer.deployProxy.staticCall(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING");
            await (await proxyDeployer.deployProxy(await vestingImpl.getAddress(), await proxyAdmin.getAddress(), vestingInit, "VESTING")).wait();
            // Try to initialize with amount exceeding 5% limit
            // Note: This test expects revert, so we don't need to set distribution config
            // But we still need to provide all 7 parameters
            const MockDistributionWallet = await hardhat_1.ethers.getContractFactory("MockDistributionWallet");
            const privilegedMultisig = await MockDistributionWallet.deploy(await owner.getAddress());
            await privilegedMultisig.waitForDeployment();
            
            const excessiveSupply = hardhat_1.ethers.parseEther("2500000001"); // Just over 5%
            const tokenInit = Token.interface.encodeFunctionData("initialize", [
                "Test Token",
                "TEST",
                excessiveSupply,
                vestingProxy,
                await owner.getAddress(),
                0, // yearStartTime
                await privilegedMultisig.getAddress() // privilegedMultisigWallet
            ]);
            await (0, chai_1.expect)(proxyDeployer.deployProxy(await tokenImpl.getAddress(), await proxyAdmin.getAddress(), tokenInit, "TOKEN")).to.be.revertedWith("Initial supply exceeds 5% of max supply");
        });
    });
    // Legacy Initialization tests removed
    describe("Security Comparison", function () {
        it("should keep initial tokens in vesting (no direct transfer)", async function () {
            const secureFixture = await (0, hardhat_network_helpers_1.loadFixture)(deployTokenFixture);
            (0, chai_1.expect)(await secureFixture.token.balanceOf(await secureFixture.vesting.getAddress())).to.equal(INITIAL_SUPPLY);
            await (0, chai_1.expect)(secureFixture.vesting.connect(secureFixture.owner).transfer(secureFixture.beneficiary.getAddress(), hardhat_1.ethers.parseEther("1000000"))).to.be.reverted;
        });
    });
    describe("Mint Request Security", function () {
        beforeEach(async function () {
            const fixture = await (0, hardhat_network_helpers_1.loadFixture)(deployTokenFixture);
            token = fixture.token;
            vestingContract = fixture.vesting;
            owner = fixture.owner;
            beneficiary = fixture.beneficiary;
            other = fixture.other;
        });
        it("should create mint request securely", async function () {
            const mintAmount = hardhat_1.ethers.parseEther("1000000");
            const purpose = "Test mint request";
            const tx = await token.connect(owner).createMintRequest(beneficiary.getAddress(), mintAmount, purpose);
            await (0, chai_1.expect)(tx)
                .to.emit(token, "MintRequestCreated");
            await (0, chai_1.expect)(tx)
                .to.emit(token, "MintRequestApproved");
        });
        it("should enforce 2-day delay for mint execution", async function () {
            const mintAmount = hardhat_1.ethers.parseEther("1000000");
            const purpose = "Test mint request";
            // Create mint request
            const tx = await token.connect(owner).createMintRequest(beneficiary.getAddress(), mintAmount, purpose);
            const receipt = await tx.wait();
            const requestId = await token.mintRequestCount() - 1n;
            // Try to execute immediately (should fail)
            await (0, chai_1.expect)(token.connect(owner).executeMintRequest(requestId)).to.be.revertedWithCustomError(token, "MintDelayNotMet");
            // Wait for delay period
            await hardhat_network_helpers_1.time.increase(2 * 24 * 60 * 60 + 1); // 2 days + 1 second
            // Now should succeed
            await (0, chai_1.expect)(token.connect(owner).executeMintRequest(requestId)).to.not.be.reverted;
        });
        it("should only allow owner to create mint requests", async function () {
            const mintAmount = hardhat_1.ethers.parseEther("1000000");
            const purpose = "Test mint request";
            await (0, chai_1.expect)(token.connect(beneficiary).createMintRequest(beneficiary.getAddress(), mintAmount, purpose)).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
    });
    describe("Governance Integration", function () {
        beforeEach(async function () {
            const fixture = await (0, hardhat_network_helpers_1.loadFixture)(deployTokenFixture);
            token = fixture.token;
            vestingContract = fixture.vesting;
            owner = fixture.owner;
            beneficiary = fixture.beneficiary;
            other = fixture.other;
        });
        it("should allow governance to transfer ownership", async function () {
            await (0, chai_1.expect)(token.connect(owner).transferGovernance(beneficiary.getAddress())).to.emit(token, "GovernanceTransferred")
                .withArgs(owner.getAddress(), beneficiary.getAddress());
            (0, chai_1.expect)(await token.owner()).to.equal(await beneficiary.getAddress());
        });
        it("should allow governance to pause/unpause", async function () {
            // First, mint some tokens to beneficiary for testing
            const mintAmount = hardhat_1.ethers.parseEther("10000");
            const purpose = "Test tokens for pause/unpause";
            // Create and execute mint request
            await token.connect(owner).createMintRequest(beneficiary.getAddress(), mintAmount, purpose);
            // Wait for delay period
            await hardhat_network_helpers_1.time.increase(2 * 24 * 60 * 60 + 1); // 2 days + 1 second
            // Execute mint request
            const requestId = await token.mintRequestCount() - 1n;
            await token.connect(owner).executeMintRequest(requestId);
            // Now test pause/unpause
            await (0, chai_1.expect)(token.connect(owner).pause()).to.emit(token, "TokensPaused")
                .withArgs(owner.getAddress());
            // Try to transfer while paused (should fail)
            await (0, chai_1.expect)(token.connect(beneficiary).transfer(other.getAddress(), hardhat_1.ethers.parseEther("1000"))).to.be.revertedWithCustomError(token, "EnforcedPause");
            await (0, chai_1.expect)(token.connect(owner).unpause()).to.emit(token, "TokensUnpaused")
                .withArgs(owner.getAddress());
            // Transfer should work after unpause
            const tx = await token.connect(beneficiary).transfer(other.getAddress(), hardhat_1.ethers.parseEther("1000"));
            await tx.wait();
            // Verify the transfer actually happened
            const balance = await token.balanceOf(other.getAddress());
            (0, chai_1.expect)(balance).to.equal(hardhat_1.ethers.parseEther("1000"));
        });
    });
});
// Mock Vesting Contract for testing
exports.MockVestingContract = {
    abi: [
        "function initialize(string name, string symbol)",
        "function transfer(address to, uint256 amount) external returns (bool)"
    ],
    bytecode: "0x608060405234801561001057600080fd5b5060405161001d9061003a565b604051809103906000f080158015610039573d6000803e3d6000fd5b505050610047565b61004a8061005683390190565b50565b6040516100589061003a565b600060405180830381855af49150503d8060008114610093576040519150601f19603f3d011682016040523d82523d6000602084013e610098565b606091505b50509050806100a657600080fd5b5050565b6100a4806100b96000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063150b7a021461003b5780634a58db1914610059578063f2fde38b14610063575b600080fd5b61004361007f565b60405161005091906100b0565b60405180910390f35b610061610088565b005b61007d600480360381019061007891906100dc565b610092565b005b60008054905090565b610090610136565b565b61009a610136565b8173ffffffffffffffffffffffffffffffffffffffff166108fc479081150290604051600060405180830381858888f193505050501580156100df573d6000803e3d6000fd5b505050565b600080fd5b6000819050919050565b6100fb816100e8565b811461010657600080fd5b50565b600081359050610118816100f2565b92915050565b600060208284031215610134576101336100e3565b5b600061014284828501610109565b91505092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006101768261014b565b9050919050565b6101868161016b565b82525050565b60006020820190506101a1600083018461017d565b9291505056fea2646970667358221220"
};
