import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { TokenVesting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TokenVesting", function () {
  let tokenVesting: TokenVesting;
  let token: any;
  let owner: SignerWithAddress;
  let beneficiary1: SignerWithAddress;
  let beneficiary2: SignerWithAddress;
  let other: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const VESTING_AMOUNT = ethers.parseEther("100000"); // 100K tokens
  const VESTING_DURATION = 365 * 24 * 60 * 60; // 1 year
  const CLIFF_DURATION = 30 * 24 * 60 * 60; // 30 days

  async function deployTokenVestingFixture() {
    const [deployer, ownerAddr, beneficiary1Addr, beneficiary2Addr, otherAddr] = await ethers.getSigners();
    
    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await Token.deploy();
    await tokenImpl.waitForDeployment();
    
    // Deploy token proxy
    const ProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await ProxyDeployer.deploy();
    await proxyDeployer.waitForDeployment();
    
    const ProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(ownerAddr.address);
    await proxyAdmin.waitForDeployment();
    
    const tokenInit = Token.interface.encodeFunctionData("initialize", [
      "Test Token",
      "TEST",
      INITIAL_SUPPLY,
      deployer.address, // initial holder
      ownerAddr.address // governance
    ]);
    
    const tokenProxy = await proxyDeployer.deployProxy.staticCall(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      tokenInit,
      "TEST"
    );
    
    await (await proxyDeployer.deployProxy(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      tokenInit,
      "TEST"
    )).wait();
    
    const tokenContract = await ethers.getContractAt("HyraToken", tokenProxy);
    
    // Deploy TokenVesting
    const TokenVesting = await ethers.getContractFactory("TokenVesting");
    const vestingImpl = await TokenVesting.deploy();
    await vestingImpl.waitForDeployment();
    
    const vestingInit = TokenVesting.interface.encodeFunctionData("initialize", [
      tokenProxy,
      ownerAddr.address
    ]);
    
    const vestingProxy = await proxyDeployer.deployProxy.staticCall(
      await vestingImpl.getAddress(),
      await proxyAdmin.getAddress(),
      vestingInit,
      "VESTING"
    );
    
    await (await proxyDeployer.deployProxy(
      await vestingImpl.getAddress(),
      await proxyAdmin.getAddress(),
      vestingInit,
      "VESTING"
    )).wait();
    
    const vestingContract = await ethers.getContractAt("TokenVesting", vestingProxy);
    
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
    const fixture = await loadFixture(deployTokenVestingFixture);
    tokenVesting = fixture.vesting;
    token = fixture.token;
    owner = fixture.owner;
    beneficiary1 = fixture.beneficiary1;
    beneficiary2 = fixture.beneficiary2;
    other = fixture.other;
  });

  describe("Initialization", function () {
    it("should initialize correctly", async function () {
      expect(await tokenVesting.owner()).to.equal(owner.address);
      expect(await tokenVesting.token()).to.equal(await token.getAddress());
    });

    it("should revert if initialized with zero address", async function () {
      const TokenVesting = await ethers.getContractFactory("TokenVesting");
      const vesting = await TokenVesting.deploy();
      
      await expect(
        vesting.initialize(ethers.ZeroAddress, owner.address)
      ).to.be.revertedWithCustomError(vesting, "InvalidInitialization");
      
      await expect(
        vesting.initialize(await token.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(vesting, "InvalidAddress");
    });
  });

  describe("createVestingSchedule", function () {
    it("should create vesting schedule successfully", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 1000;
      
      const tx = await tokenVesting.connect(owner).createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        false,
        "Test vesting"
      );
      
      const receipt = await tx.wait();
      const vestingScheduleId = ethers.keccak256(
        ethers.solidityPacked(
          ["address", "uint256", "uint256", "uint256", "uint256", "string", "uint256"],
          [beneficiary1.address, VESTING_AMOUNT, startTime, VESTING_DURATION, CLIFF_DURATION, "Test vesting", receipt!.blockNumber]
        )
      );
      
      await expect(tx)
        .to.emit(tokenVesting, "VestingScheduleCreated")
        .withArgs(
          vestingScheduleId,
          beneficiary1.address,
          VESTING_AMOUNT,
          startTime,
          VESTING_DURATION,
          CLIFF_DURATION,
          "Test vesting"
        );
      
      expect(await tokenVesting.totalVestedAmount(beneficiary1.address)).to.equal(VESTING_AMOUNT);
    });

    it("should revert if not owner", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 1000;
      
      await expect(
        tokenVesting.connect(beneficiary1).createVestingSchedule(
          beneficiary1.address,
          VESTING_AMOUNT,
          startTime,
          VESTING_DURATION,
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWithCustomError(tokenVesting, "OwnableUnauthorizedAccount");
    });

    it("should revert with invalid parameters", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 1000;
      
      // Zero amount
      await expect(
        tokenVesting.connect(owner).createVestingSchedule(
          beneficiary1.address,
          0,
          startTime,
          VESTING_DURATION,
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWithCustomError(tokenVesting, "InvalidAmount");
      
      // Zero address beneficiary
      await expect(
        tokenVesting.connect(owner).createVestingSchedule(
          ethers.ZeroAddress,
          VESTING_AMOUNT,
          startTime,
          VESTING_DURATION,
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWith("InvalidAddress");
      
      // Invalid duration (too short)
      await expect(
        tokenVesting.connect(owner).createVestingSchedule(
          beneficiary1.address,
          VESTING_AMOUNT,
          startTime,
          29 * 24 * 60 * 60, // 29 days (less than minimum)
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWith("InvalidDuration");
      
      // Invalid duration (too long)
      await expect(
        tokenVesting.connect(owner).createVestingSchedule(
          beneficiary1.address,
          VESTING_AMOUNT,
          startTime,
          11 * 365 * 24 * 60 * 60, // 11 years (more than maximum)
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWith("InvalidDuration");
      
      // Cliff longer than duration
      await expect(
        tokenVesting.connect(owner).createVestingSchedule(
          beneficiary1.address,
          VESTING_AMOUNT,
          startTime,
          VESTING_DURATION,
          VESTING_DURATION + 1, // Cliff longer than duration
          false,
          "Test vesting"
        )
      ).to.be.revertedWith("InvalidCliff");
    });

    it("should revert if insufficient token balance", async function () {
      const startTime = Math.floor(Date.now() / 1000) + 1000;
      const hugeAmount = ethers.parseEther("10000000"); // More than contract balance
      
      await expect(
        tokenVesting.connect(owner).createVestingSchedule(
          beneficiary1.address,
          hugeAmount,
          startTime,
          VESTING_DURATION,
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWithCustomError(tokenVesting, "InsufficientTokenBalance");
    });
  });

  describe("Vesting Calculations", function () {
    let vestingScheduleId: string;
    let startTime: number;

    beforeEach(async function () {
      startTime = Math.floor(Date.now() / 1000) + 1000;
      
      const tx = await tokenVesting.connect(owner).createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        false,
        "Test vesting"
      );
      
      const receipt = await tx.wait();
      vestingScheduleId = receipt.hash;
    });

    it("should calculate vested amount correctly", async function () {
      // Before start time - should be 0
      expect(await tokenVesting.getVestedAmount(vestingScheduleId)).to.equal(0);
      
      // After cliff but before full duration - should be proportional
      await time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
      
      const vestedAmount = await tokenVesting.getVestedAmount(vestingScheduleId);
      const expectedAmount = VESTING_AMOUNT / 2n;
      
      // Allow for small time differences
      expect(vestedAmount).to.be.closeTo(expectedAmount, ethers.parseEther("100"));
      
      // After full duration - should be full amount
      await time.increaseTo(startTime + VESTING_DURATION + 1000);
      expect(await tokenVesting.getVestedAmount(vestingScheduleId)).to.equal(VESTING_AMOUNT);
    });

    it("should calculate releasable amount correctly", async function () {
      // Before start time
      expect(await tokenVesting.getReleasableAmount(vestingScheduleId)).to.equal(0);
      
      // After cliff
      await time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
      
      const releasableAmount = await tokenVesting.getReleasableAmount(vestingScheduleId);
      const expectedAmount = VESTING_AMOUNT / 2n;
      
      expect(releasableAmount).to.be.closeTo(expectedAmount, ethers.parseEther("100"));
    });
  });

  describe("Release Tokens", function () {
    let vestingScheduleId: string;
    let startTime: number;

    beforeEach(async function () {
      startTime = Math.floor(Date.now() / 1000) + 1000;
      
      const tx = await tokenVesting.connect(owner).createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        false,
        "Test vesting"
      );
      
      const receipt = await tx.wait();
      vestingScheduleId = receipt.hash;
    });

    it("should release tokens successfully", async function () {
      // Wait for cliff to pass
      await time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
      
      const balanceBefore = await token.balanceOf(beneficiary1.address);
      const releasableAmount = await tokenVesting.getReleasableAmount(vestingScheduleId);
      
      const tx = await tokenVesting.release(vestingScheduleId);
      
      await expect(tx)
        .to.emit(tokenVesting, "TokensReleased")
        .withArgs(vestingScheduleId, beneficiary1.address, releasableAmount, await tx.then(t => t.timestamp));
      
      const balanceAfter = await token.balanceOf(beneficiary1.address);
      expect(balanceAfter - balanceBefore).to.equal(releasableAmount);
    });

    it("should revert if no tokens to release", async function () {
      // Before cliff
      await expect(
        tokenVesting.release(vestingScheduleId)
      ).to.be.revertedWith("NoTokensToRelease");
    });

    it("should revert if vesting schedule not found", async function () {
      const fakeId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
      
      await expect(
        tokenVesting.release(fakeId)
      ).to.be.revertedWith("VestingScheduleNotFound");
    });
  });

  describe("Revoke Vesting", function () {
    let vestingScheduleId: string;
    let startTime: number;

    beforeEach(async function () {
      startTime = Math.floor(Date.now() / 1000) + 1000;
      
      const tx = await tokenVesting.connect(owner).createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        true, // revocable
        "Test vesting"
      );
      
      const receipt = await tx.wait();
      vestingScheduleId = receipt.hash;
    });

    it("should revoke vesting schedule successfully", async function () {
      // Wait for some time but not full duration
      await time.increaseTo(startTime + (VESTING_DURATION / 2));
      
      const tx = await tokenVesting.connect(owner).revoke(vestingScheduleId);
      
      await expect(tx)
        .to.emit(tokenVesting, "VestingScheduleRevoked")
        .withArgs(vestingScheduleId, beneficiary1.address, await tx.then(t => t.value), await tx.then(t => t.timestamp));
    });

    it("should revert if not revocable", async function () {
      // Create non-revocable vesting
      const tx2 = await tokenVesting.connect(owner).createVestingSchedule(
        beneficiary2.address,
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        false, // not revocable
        "Test vesting 2"
      );
      
      const vestingScheduleId2 = await tx2.then(t => t.hash);
      
      await expect(
        tokenVesting.connect(owner).revoke(vestingScheduleId2)
      ).to.be.revertedWith("NotRevocable");
    });

    it("should revert if not owner", async function () {
      await expect(
        tokenVesting.connect(beneficiary1).revoke(vestingScheduleId)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Emergency Withdraw", function () {
    it("should allow emergency withdraw by owner", async function () {
      const withdrawAmount = ethers.parseEther("1000");
      const balanceBefore = await token.balanceOf(owner.address);
      
      const tx = await tokenVesting.connect(owner).emergencyWithdraw(withdrawAmount);
      
      const receipt = await tx.wait();
      await expect(tx)
        .to.emit(tokenVesting, "EmergencyWithdraw")
        .withArgs(await token.getAddress(), withdrawAmount, receipt.timestamp);
      
      const balanceAfter = await token.balanceOf(owner.address);
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
    });

    it("should revert if not owner", async function () {
      const withdrawAmount = ethers.parseEther("1000");
      
      await expect(
        tokenVesting.connect(beneficiary1).emergencyWithdraw(withdrawAmount)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("View Functions", function () {
    let vestingScheduleId: string;
    let startTime: number;

    beforeEach(async function () {
      startTime = Math.floor(Date.now() / 1000) + 1000;
      
      const tx = await tokenVesting.connect(owner).createVestingSchedule(
        beneficiary1.address,
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        true,
        "Test vesting"
      );
      
      const receipt = await tx.wait();
      vestingScheduleId = receipt.hash;
    });

    it("should return correct vesting schedule details", async function () {
      const schedule = await tokenVesting.getVestingSchedule(vestingScheduleId);
      
      expect(schedule.initialized).to.be.true;
      expect(schedule.revocable).to.be.true;
      expect(schedule.totalAmount).to.equal(VESTING_AMOUNT);
      expect(schedule.releasedAmount).to.equal(0);
      expect(schedule.startTime).to.equal(startTime);
      expect(schedule.duration).to.equal(VESTING_DURATION);
      expect(schedule.cliff).to.equal(CLIFF_DURATION);
      expect(schedule.beneficiary).to.equal(beneficiary1.address);
      expect(schedule.purpose).to.equal("Test vesting");
    });

    it("should return correct total amounts", async function () {
      expect(await tokenVesting.totalVestedAmount(beneficiary1.address)).to.equal(VESTING_AMOUNT);
      expect(await tokenVesting.totalReleasedAmount(beneficiary1.address)).to.equal(0);
    });
  });
});
