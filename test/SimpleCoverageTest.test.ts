import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Simple Coverage Test", function () {
  async function deploySimpleContracts() {
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
      "Hyra Token",
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
      const { timelock, proxyAdmin, token } = await loadFixture(deploySimpleContracts);

      expect(await timelock.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await proxyAdmin.getAddress()).to.not.equal(ethers.ZeroAddress);
      expect(await token.getAddress()).to.not.equal(ethers.ZeroAddress);
    });

    it("should initialize token correctly", async function () {
      const { token } = await loadFixture(deploySimpleContracts);

      expect(await token.name()).to.equal("Hyra Token");
      expect(await token.symbol()).to.equal("HYRA");
      expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
    });

    it("should handle token transfers", async function () {
      const { token, alice, bob } = await loadFixture(deploySimpleContracts);

      const transferAmount = ethers.parseEther("1000");
      await token.connect(alice).transfer(bob.address, transferAmount);

      expect(await token.balanceOf(bob.address)).to.equal(transferAmount);
    });

    it("should handle token burning", async function () {
      const { token, alice } = await loadFixture(deploySimpleContracts);

      const burnAmount = ethers.parseEther("1000");
      const initialBalance = await token.balanceOf(alice.address);
      
      await token.connect(alice).burn(burnAmount);
      
      expect(await token.balanceOf(alice.address)).to.equal(initialBalance - burnAmount);
    });

    it("should handle pause/unpause", async function () {
      const { token, timelock } = await loadFixture(deploySimpleContracts);

      
      await token.connect(timelock).pause();
      expect(await token.paused()).to.be.true;

      
      await token.connect(timelock).unpause();
      expect(await token.paused()).to.be.false;
    });

    it("should handle mint requests", async function () {
      const { token, timelock, alice } = await loadFixture(deploySimpleContracts);

      const mintAmount = ethers.parseEther("1000000");
      
      
      const tx = await token.connect(timelock).createMintRequest(
        alice.address,
        mintAmount,
        "Test mint request"
      );
      
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });

    it("should handle year transitions", async function () {
      const { token, timelock, alice } = await loadFixture(deploySimpleContracts);

      const YEAR_DURATION = 365 * 24 * 60 * 60;
      
      
      await time.increase(YEAR_DURATION + 1);
      
      
      await token.connect(timelock).createMintRequest(
        alice.address,
        ethers.parseEther("1000"),
        "Year transition test"
      );
      
      
      expect(await token.currentMintYear()).to.equal(2);
    });

    it("should enforce mint caps", async function () {
      const { token, timelock, alice } = await loadFixture(deploySimpleContracts);

      const excessiveAmount = ethers.parseEther("3000000000"); 

      await expect(
        token.connect(timelock).createMintRequest(
          alice.address,
          excessiveAmount,
          "Excessive mint request"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("should handle proxy admin operations", async function () {
      const { proxyAdmin, tokenProxy, owner } = await loadFixture(deploySimpleContracts);

      
      await proxyAdmin.connect(owner).addProxy(await tokenProxy.getAddress(), "Test Token");
      
      
      expect(await proxyAdmin.isManaged(await tokenProxy.getAddress())).to.be.true;
    });

    it("should handle timelock operations", async function () {
      const { timelock, voter1, alice } = await loadFixture(deploySimpleContracts);

      const target = alice.address;
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("test salt"));
      const delay = 86400;

      
      await timelock.connect(voter1).schedule(target, value, data, salt, delay);
      
      
      const operationId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256", "bytes", "bytes32", "uint256"],
          [target, value, data, salt, delay]
        )
      );
      
      expect(await timelock.isOperation(operationId)).to.be.true;
    });
  });

  describe("Error Handling", function () {
    it("should handle zero address transfers", async function () {
      const { token, alice } = await loadFixture(deploySimpleContracts);

      await expect(
        token.connect(alice).transfer(ethers.ZeroAddress, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(token, "ERC20InvalidReceiver");
    });

    it("should handle insufficient balance transfers", async function () {
      const { token, alice, bob } = await loadFixture(deploySimpleContracts);

      const aliceBalance = await token.balanceOf(alice.address);
      const excessiveAmount = aliceBalance + ethers.parseEther("1");
      
      await expect(
        token.connect(alice).transfer(bob.address, excessiveAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });

    it("should handle unauthorized operations", async function () {
      const { token, alice } = await loadFixture(deploySimpleContracts);

      await expect(
        token.connect(alice).pause()
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should handle invalid mint amounts", async function () {
      const { token, timelock, alice } = await loadFixture(deploySimpleContracts);

      await expect(
        token.connect(timelock).createMintRequest(
          alice.address,
          0,
          "Zero amount mint"
        )
      ).to.be.revertedWithCustomError(token, "InvalidAmount");
    });

    it("should handle zero address mint requests", async function () {
      const { token, timelock } = await loadFixture(deploySimpleContracts);

      await expect(
        token.connect(timelock).createMintRequest(
          ethers.ZeroAddress,
          ethers.parseEther("1000"),
          "Zero address mint"
        )
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
    });
  });

  describe("Edge Cases", function () {
    it("should handle maximum token amounts", async function () {
      const { token, alice, bob } = await loadFixture(deploySimpleContracts);

      const aliceBalance = await token.balanceOf(alice.address);
      
      
      await token.connect(alice).transfer(bob.address, aliceBalance);
      
      expect(await token.balanceOf(alice.address)).to.equal(0);
      expect(await token.balanceOf(bob.address)).to.equal(aliceBalance);
    });

    it("should handle multiple year transitions", async function () {
      const { token, timelock, alice } = await loadFixture(deploySimpleContracts);

      const YEAR_DURATION = 365 * 24 * 60 * 60;
      
      
      await time.increase(YEAR_DURATION * 2 + 1);
      
      
      await token.connect(timelock).createMintRequest(
        alice.address,
        ethers.parseEther("1000"),
        "Multiple year transition test"
      );
      
      
      expect(await token.currentMintYear()).to.equal(3);
    });

    it("should handle boundary conditions", async function () {
      const { token, timelock, alice } = await loadFixture(deploySimpleContracts);

      
      const annualCap = ethers.parseEther("2500000000"); 
      
      const tx = await token.connect(timelock).createMintRequest(
        alice.address,
        annualCap,
        "Full annual cap mint"
      );
      
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;
    });
  });
});
