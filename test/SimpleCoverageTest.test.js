"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
describe("Simple Coverage Test", function () {
    async function deploySimpleContracts() {
        const [owner, voter1, voter2, alice, bob] = await hardhat_1.ethers.getSigners();
        const HyraToken = await hardhat_1.ethers.getContractFactory("HyraToken");
        const tokenImplementation = await HyraToken.deploy();
        await tokenImplementation.waitForDeployment();
        const HyraTimelock = await hardhat_1.ethers.getContractFactory("HyraTimelock");
        const timelockImplementation = await HyraTimelock.deploy();
        await timelockImplementation.waitForDeployment();
        const proposers = [voter1.address, voter2.address];
        const executors = [voter1.address, voter2.address];
        const initData = HyraTimelock.interface.encodeFunctionData("initialize", [
            86400,
            proposers,
            executors,
            owner.address
        ]);
        const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
        const timelockProxy = await ERC1967Proxy.deploy(await timelockImplementation.getAddress(), initData);
        await timelockProxy.waitForDeployment();
        const timelock = HyraTimelock.attach(await timelockProxy.getAddress());
        const HyraProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
        const proxyAdmin = await HyraProxyAdmin.deploy(owner.address);
        await proxyAdmin.waitForDeployment();
        // Deploy proxy with empty init data first (to set distribution config before initialize)
        const HyraTransparentUpgradeableProxy = await hardhat_1.ethers.getContractFactory("HyraTransparentUpgradeableProxy");
        const tokenProxy = await HyraTransparentUpgradeableProxy.deploy(await tokenImplementation.getAddress(), await proxyAdmin.getAddress(), "0x");
        await tokenProxy.waitForDeployment();
        const token = HyraToken.attach(await tokenProxy.getAddress());

        // Deploy mock distribution wallets for setDistributionConfig
        const MockDistributionWallet = await hardhat_1.ethers.getContractFactory("MockDistributionWallet");
        const distributionWallets = [];
        for (let i = 0; i < 6; i++) {
            const wallet = await MockDistributionWallet.deploy(owner.address);
            await wallet.waitForDeployment();
            distributionWallets.push(await wallet.getAddress());
        }

        // Set distribution config BEFORE initialize
        await token.setDistributionConfig(
            distributionWallets[0],
            distributionWallets[1],
            distributionWallets[2],
            distributionWallets[3],
            distributionWallets[4],
            distributionWallets[5]
        );

        // Deploy mock contract for privilegedMultisigWallet (must be contract, not EOA)
        const privilegedMultisig = await MockDistributionWallet.deploy(owner.address);
        await privilegedMultisig.waitForDeployment();

        // Now initialize token
        await token.initialize(
            "HYRA",
            "HYRA",
            hardhat_1.ethers.parseEther("1000000"),
            alice.address,
            owner.address,
            0, // yearStartTime
            await privilegedMultisig.getAddress() // privilegedMultisigWallet
        );
        return {
            timelock,
            proxyAdmin,
            token,
            tokenProxy,
            tokenImplementation,
            owner,
            voter1,
            voter2,
            alice,
            bob
        };
    }
    describe("Basic Functionality", function () {
        it("should deploy contracts successfully", async function () {
            const { timelock, proxyAdmin, token } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            (0, chai_1.expect)(await timelock.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
            (0, chai_1.expect)(await proxyAdmin.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
            (0, chai_1.expect)(await token.getAddress()).to.not.equal(hardhat_1.ethers.ZeroAddress);
        });
        it("should initialize token correctly", async function () {
            const { token } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            (0, chai_1.expect)(await token.name()).to.equal("HYRA");
            (0, chai_1.expect)(await token.symbol()).to.equal("HYRA");
            (0, chai_1.expect)(await token.totalSupply()).to.equal(hardhat_1.ethers.parseEther("1000000"));
        });
        it("should handle token transfers", async function () {
            const { token, alice, bob } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const transferAmount = hardhat_1.ethers.parseEther("1000");
            await token.connect(alice).transfer(bob.address, transferAmount);
            (0, chai_1.expect)(await token.balanceOf(bob.address)).to.equal(transferAmount);
        });
        it("should handle token burning", async function () {
            const { token, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const burnAmount = hardhat_1.ethers.parseEther("1000");
            const initialBalance = await token.balanceOf(alice.address);
            await token.connect(alice).burn(burnAmount);
            (0, chai_1.expect)(await token.balanceOf(alice.address)).to.equal(initialBalance - burnAmount);
        });
        it("should handle pause/unpause", async function () {
            const { token, owner } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            await token.connect(owner).pause();
            (0, chai_1.expect)(await token.paused()).to.be.true;
            await token.connect(owner).unpause();
            (0, chai_1.expect)(await token.paused()).to.be.false;
        });
        it("should handle mint requests", async function () {
            const { token, owner, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const mintAmount = hardhat_1.ethers.parseEther("1000000");
            const tx = await token.connect(owner).createMintRequest(alice.address, mintAmount, "Test mint request");
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt).to.not.be.null;
        });
        it("should handle year transitions", async function () {
            const { token, owner, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const YEAR_DURATION = 365 * 24 * 60 * 60;
            await hardhat_network_helpers_1.time.increase(YEAR_DURATION + 1);
            await token.connect(owner).createMintRequest(alice.address, hardhat_1.ethers.parseEther("1000"), "Year transition test");
            (0, chai_1.expect)(await token.currentMintYear()).to.equal(2);
        });
        it("should enforce mint caps", async function () {
            const { token, owner, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const excessiveAmount = hardhat_1.ethers.parseEther("3000000000");
            await (0, chai_1.expect)(token.connect(owner).createMintRequest(alice.address, excessiveAmount, "Excessive mint request")).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
        });
        it("should handle proxy admin operations", async function () {
            const { proxyAdmin, tokenProxy, owner } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            await proxyAdmin.connect(owner).addProxy(await tokenProxy.getAddress(), "Test Token");
            (0, chai_1.expect)(await proxyAdmin.isManaged(await tokenProxy.getAddress())).to.be.true;
        });
        it("should handle timelock operations", async function () {
            const { timelock, voter1, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const target = alice.address;
            const value = 0;
            const data = "0x";
            const salt = hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes("test salt"));
            const delay = 86400;
            await timelock.connect(voter1).schedule(target, value, data, hardhat_1.ethers.ZeroHash, salt, delay);
            const operationId = hardhat_1.ethers.keccak256(hardhat_1.ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256", "bytes", "bytes32", "bytes32"], [target, value, data, hardhat_1.ethers.ZeroHash, salt]));
            (0, chai_1.expect)(await timelock.isOperation(operationId)).to.be.true;
        });
    });
    describe("Error Handling", function () {
        it("should handle zero address transfers", async function () {
            const { token, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            await (0, chai_1.expect)(token.connect(alice).transfer(hardhat_1.ethers.ZeroAddress, hardhat_1.ethers.parseEther("1000"))).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
        });
        it("should handle insufficient balance transfers", async function () {
            const { token, alice, bob } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const aliceBalance = await token.balanceOf(alice.address);
            const excessiveAmount = aliceBalance + hardhat_1.ethers.parseEther("1");
            await (0, chai_1.expect)(token.connect(alice).transfer(bob.address, excessiveAmount)).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
        });
        it("should handle unauthorized operations", async function () {
            const { token, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            await (0, chai_1.expect)(token.connect(alice).pause()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
        });
        it("should handle invalid mint amounts", async function () {
            const { token, owner, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            await (0, chai_1.expect)(token.connect(owner).createMintRequest(alice.address, 0, "Zero amount mint")).to.be.revertedWithCustomError(token, "InvalidAmount");
        });
        it("should handle zero address mint requests", async function () {
            const { token, owner } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            await (0, chai_1.expect)(token.connect(owner).createMintRequest(hardhat_1.ethers.ZeroAddress, hardhat_1.ethers.parseEther("1000"), "Zero address mint")).to.be.revertedWithCustomError(token, "ZeroAddress");
        });
    });
    describe("Edge Cases", function () {
        it("should handle maximum token amounts", async function () {
            const { token, alice, bob } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const aliceBalance = await token.balanceOf(alice.address);
            await token.connect(alice).transfer(bob.address, aliceBalance);
            (0, chai_1.expect)(await token.balanceOf(alice.address)).to.equal(0);
            (0, chai_1.expect)(await token.balanceOf(bob.address)).to.equal(aliceBalance);
        });
        it("should handle multiple year transitions", async function () {
            const { token, owner, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const YEAR_DURATION = 365 * 24 * 60 * 60;
            await hardhat_network_helpers_1.time.increase(YEAR_DURATION * 2 + 1);
            await token.connect(owner).createMintRequest(alice.address, hardhat_1.ethers.parseEther("1000"), "Multiple year transition test");
            (0, chai_1.expect)(await token.currentMintYear()).to.equal(3);
        });
        it("should handle boundary conditions", async function () {
            const { token, owner, alice } = await (0, hardhat_network_helpers_1.loadFixture)(deploySimpleContracts);
            const annualCap = hardhat_1.ethers.parseEther("2500000000");
            // Remaining capacity in year 1 is annualCap - initialSupply (1,000,000)
            const requestAmount = annualCap - hardhat_1.ethers.parseEther("1000000");
            const tx = await token.connect(owner).createMintRequest(alice.address, requestAmount, "Full annual cap mint");
            const receipt = await tx.wait();
            (0, chai_1.expect)(receipt).to.not.be.null;
        });
    });
});
