import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Basic Coverage Test", function () {
  async function deployBasicContracts() {
    const [owner, voter1, voter2, alice, bob] = await ethers.getSigners();

    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImplementation = await HyraToken.deploy();
    await tokenImplementation.waitForDeployment();

    const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
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

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const timelockProxy = await ERC1967Proxy.deploy(await timelockImplementation.getAddress(), initData);
    await timelockProxy.waitForDeployment();

    const timelock = HyraTimelock.attach(await timelockProxy.getAddress());

    const HyraProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await HyraProxyAdmin.deploy(await timelock.getAddress());
    await proxyAdmin.waitForDeployment();

    const tokenInitData = HyraToken.interface.encodeFunctionData("initialize", [
      "HYRA",
      "HYRA",
      ethers.parseEther("1000000"),
      alice.address,
      await timelock.getAddress()
    ]);

    const HyraTransparentUpgradeableProxy = await ethers.getContractFactory("HyraTransparentUpgradeableProxy");
    const tokenProxy = await HyraTransparentUpgradeableProxy.deploy(
      await tokenImplementation.getAddress(),
      await proxyAdmin.getAddress(),
      tokenInitData
    );
    await tokenProxy.waitForDeployment();

    const token = HyraToken.attach(await tokenProxy.getAddress());

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
      const { timelock, proxyAdmin, token } = await loadFixture(deployBasicContracts);

      expect(await timelock.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await proxyAdmin.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await token.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("should initialize token correctly", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.name()).to.equal("HYRA");
      expect(await token.symbol()).to.equal("HYRA");
      expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
    });

    it("should handle token transfers", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const transferAmount = ethers.parseEther("1000");
      await token.connect(alice).transfer(bob.address, transferAmount);

      expect(await token.balanceOf(bob.address)).to.equal(transferAmount);
    });

    it("should handle token burning", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      const burnAmount = ethers.parseEther("1000");
      const initialBalance = await token.balanceOf(alice.address);
      
      await token.connect(alice).burn(burnAmount);
      
      expect(await token.balanceOf(alice.address)).to.equal(initialBalance - burnAmount);
    });

    it("should handle token approvals", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const approveAmount = ethers.parseEther("1000");
      await token.connect(alice).approve(bob.address, approveAmount);

      expect(await token.allowance(alice.address, bob.address)).to.equal(approveAmount);
    });

    it("should handle token transfers from", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const transferAmount = ethers.parseEther("1000");
      
      
      await token.connect(alice).approve(bob.address, transferAmount);
      
      
      await token.connect(bob).transferFrom(alice.address, bob.address, transferAmount);

      expect(await token.balanceOf(bob.address)).to.equal(transferAmount);
    });

    it("should handle delegation", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      await token.connect(alice).delegate(bob.address);
      expect(await token.delegates(alice.address)).to.equal(bob.address);
    });

    it("should handle self delegation", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      await token.connect(alice).delegate(alice.address);
      expect(await token.delegates(alice.address)).to.equal(alice.address);
    });

    it("should handle voting power", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      await token.connect(alice).delegate(alice.address);
      const aliceBalance = await token.balanceOf(alice.address);
      expect(await token.getVotes(alice.address)).to.equal(aliceBalance);
    });

    it("should handle historical voting power", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      await token.connect(alice).delegate(alice.address);
      await ethers.provider.send("evm_mine", []);
      const aliceBalance = await token.balanceOf(alice.address);
      const currentBlock = await ethers.provider.getBlockNumber();
      
      expect(await token.getPastVotes(alice.address, currentBlock - 1)).to.equal(aliceBalance);
    });

    it("should handle mint year tracking", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.currentMintYear()).to.equal(1);
      expect(await token.getMintedThisYear()).to.equal(ethers.parseEther("1000000"));
    });

    it("should handle mint capacity calculations", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      const remainingCapacity = await token.getRemainingMintCapacity();
      expect(remainingCapacity).to.be.greaterThan(0);
    });

    it("should handle tier calculations", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      const currentTier = await token.getCurrentMintTier();
      expect(currentTier).to.be.greaterThanOrEqual(1);
    });

    it("should handle annual cap calculations", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      const remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.be.greaterThan(0);
    });

    it("should handle pause state", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.paused()).to.be.false;
    });

    it("should handle owner information", async function () {
      const { token, timelock } = await loadFixture(deployBasicContracts);

      expect(await token.owner()).to.equal(await timelock.getAddress());
    });

    it("should handle proxy admin information", async function () {
      const { proxyAdmin, timelock } = await loadFixture(deployBasicContracts);

      expect(await proxyAdmin.owner()).to.equal(await timelock.getAddress());
    });

    it("should handle timelock information", async function () {
      const { timelock, owner } = await loadFixture(deployBasicContracts);

      expect(await timelock.getMinDelay()).to.equal(86400);
      expect(await timelock.hasRole(await timelock.PROPOSER_ROLE(), owner.address)).to.be.false;
    });
  });

  describe("Error Handling", function () {
    it("should handle zero address transfers", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      await expect(
        token.connect(alice).transfer(ethers.ZeroAddress, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
    });

    it("should handle insufficient balance transfers", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const aliceBalance = await token.balanceOf(alice.address);
      const excessiveAmount = aliceBalance + ethers.parseEther("1");
      
      await expect(
        token.connect(alice).transfer(bob.address, excessiveAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("should handle insufficient allowance", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const transferAmount = ethers.parseEther("1000");
      
      await expect(
        token.connect(bob).transferFrom(alice.address, bob.address, transferAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientAllowance");
    });

    it("should handle unauthorized operations", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      await expect(
        token.connect(alice).pause()
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should handle zero address approvals", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      await expect(
        token.connect(alice).approve(ethers.ZeroAddress, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(token, "ERC20InvalidSpender");
    });
  });

  describe("Edge Cases", function () {
    it("should handle maximum token amounts", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const aliceBalance = await token.balanceOf(alice.address);
      
      
      await token.connect(alice).transfer(bob.address, aliceBalance);
      
      expect(await token.balanceOf(alice.address)).to.equal(0);
      expect(await token.balanceOf(bob.address)).to.equal(aliceBalance);
    });

    it("should handle zero amount transfers", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const beforeAlice = await token.balanceOf(alice.address);
      const beforeBob = await token.balanceOf(bob.address);
      await token.connect(alice).transfer(bob.address, 0);
      
      const afterAlice = await token.balanceOf(alice.address);
      const afterBob = await token.balanceOf(bob.address);
      
      expect(afterAlice).to.equal(beforeAlice);
      expect(afterBob).to.equal(beforeBob);
    });

    it("should handle zero amount approvals", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      await token.connect(alice).approve(bob.address, 0);
      expect(await token.allowance(alice.address, bob.address)).to.equal(0);
    });

    it("should handle zero amount burns", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      const initialBalance = await token.balanceOf(alice.address);
      await token.connect(alice).burn(0);
      
      expect(await token.balanceOf(alice.address)).to.equal(initialBalance);
    });

    it("should handle self transfers", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      const initialBalance = await token.balanceOf(alice.address);
      await token.connect(alice).transfer(alice.address, ethers.parseEther("1000"));
      
      expect(await token.balanceOf(alice.address)).to.equal(initialBalance);
    });

    it("should handle self approvals", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      const approveAmount = ethers.parseEther("1000");
      await token.connect(alice).approve(alice.address, approveAmount);
      
      expect(await token.allowance(alice.address, alice.address)).to.equal(approveAmount);
    });

    it("should handle self burns", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      const burnAmount = ethers.parseEther("1000");
      const initialBalance = await token.balanceOf(alice.address);
      
      await token.connect(alice).burn(burnAmount);
      
      expect(await token.balanceOf(alice.address)).to.equal(initialBalance - burnAmount);
    });

    it("should handle delegation to zero address", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      await expect(
        token.connect(alice).delegate(ethers.ZeroAddress)
      ).to.not.be.reverted;
    });

    it("should handle voting power at zero address", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.getVotes(ethers.ZeroAddress)).to.equal(0);
    });

    it("should handle historical voting power at zero address", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      const currentBlock = await ethers.provider.getBlockNumber();
      expect(await token.getPastVotes(ethers.ZeroAddress, currentBlock - 1)).to.equal(0);
    });
  });

  describe("View Functions", function () {
    it("should return correct token information", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.name()).to.equal("HYRA");
      expect(await token.symbol()).to.equal("HYRA");
      expect(await token.decimals()).to.equal(18);
    });

    it("should return correct total supply", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
    });

    it("should return correct balances", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      const aliceBalance = await token.balanceOf(alice.address);
      const bobBalance = await token.balanceOf(bob.address);
      
      expect(aliceBalance).to.be.greaterThan(0);
      expect(bobBalance).to.equal(0);
    });

    it("should return correct allowances", async function () {
      const { token, alice, bob } = await loadFixture(deployBasicContracts);

      expect(await token.allowance(alice.address, bob.address)).to.equal(0);
    });

    it("should return correct delegates", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      expect(await token.delegates(alice.address)).to.equal(ethers.ZeroAddress);
    });

    it("should return correct voting power", async function () {
      const { token, alice } = await loadFixture(deployBasicContracts);

      const aliceBalance = await token.balanceOf(alice.address);
      await token.connect(alice).delegate(alice.address);
      expect(await token.getVotes(alice.address)).to.equal(aliceBalance);
    });

    it("should return correct mint information", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.currentMintYear()).to.equal(1);
      expect(await token.getMintedThisYear()).to.equal(ethers.parseEther("1000000"));
    });

    it("should return correct tier information", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.getCurrentMintTier()).to.be.greaterThanOrEqual(1);
    });

    it("should return correct capacity information", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      const remainingCapacity = await token.getRemainingMintCapacity();
      expect(remainingCapacity).to.be.greaterThan(0);
    });

    it("should return correct pause information", async function () {
      const { token } = await loadFixture(deployBasicContracts);

      expect(await token.paused()).to.be.false;
    });

    it("should return correct owner information", async function () {
      const { token, timelock } = await loadFixture(deployBasicContracts);

      expect(await token.owner()).to.equal(await timelock.getAddress());
    });
  });
});
