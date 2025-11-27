import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { HyraTimelock, ERC1967Proxy } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HyraTimelock - Upgrade Cleanup Tests", function () {
  async function deployTimelockFixture() {
    const [deployer, proposer, executor, alice] = await ethers.getSigners();

    // Deploy HyraTimelock implementation
    const HyraTimelockFactory = await ethers.getContractFactory("HyraTimelock");
    const timelockImplementation = await HyraTimelockFactory.deploy();

    // Deploy proxy
    const ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
    const initData = HyraTimelockFactory.interface.encodeFunctionData("initialize", [
      7 * 24 * 60 * 60, // 7 days delay
      [proposer.address], // proposers
      [executor.address], // executors
      deployer.address // admin
    ]);

    const timelockProxy = await ProxyFactory.deploy(
      await timelockImplementation.getAddress(),
      initData
    );

    const timelock = HyraTimelockFactory.attach(await timelockProxy.getAddress()) as HyraTimelock;

    // Deploy mock proxy and implementation for testing
    const MockImplementationFactory = await ethers.getContractFactory("ERC1967Proxy");
    const mockProxy = await MockImplementationFactory.deploy(
      await timelockImplementation.getAddress(),
      "0x"
    );

    const MockImplementationV2Factory = await ethers.getContractFactory("ERC1967Proxy");
    const mockImplementationV2 = await MockImplementationV2Factory.deploy(
      await timelockImplementation.getAddress(),
      "0x"
    );

    return {
      timelock,
      deployer,
      proposer,
      executor,
      alice,
      mockProxy: await mockProxy.getAddress(),
      mockImplementationV2: await mockImplementationV2.getAddress()
    };
  }

  describe("cleanupExpiredUpgrade", function () {
    it("should cleanup expired upgrade that was not executed within 48 hours", async function () {
      const { timelock, proposer, mockProxy, mockImplementationV2 } = await loadFixture(
        deployTimelockFixture
      );

      // Schedule an upgrade
      await timelock.connect(proposer).scheduleUpgrade(
        mockProxy,
        mockImplementationV2,
        "0x",
        false // not emergency
      );

      // Verify upgrade is scheduled
      const executeTime = await timelock.pendingUpgrades(mockProxy);
      expect(executeTime).to.be.gt(0);
      expect(await timelock.pendingImplementations(mockProxy)).to.eq(mockImplementationV2);

      // Fast forward past execute time + 48 hours
      const currentTime = await time.latest();
      const timeToExpire = Number(executeTime) + 48 * 60 * 60 + 1 - currentTime;
      await time.increase(timeToExpire);

      // Verify upgrade is expired
      const isReady = await timelock.isUpgradeReady(mockProxy);
      expect(isReady).to.be.false;

      // Cleanup expired upgrade
      await expect(timelock.cleanupExpiredUpgrade(mockProxy))
        .to.emit(timelock, "UpgradeExpiredCleaned")
        .withArgs(mockProxy, mockImplementationV2);

      // Verify upgrade is cleaned up
      expect(await timelock.pendingUpgrades(mockProxy)).to.eq(0);
      expect(await timelock.pendingImplementations(mockProxy)).to.eq(ethers.ZeroAddress);
    });

    it("should allow anyone to cleanup expired upgrade", async function () {
      const { timelock, proposer, alice, mockProxy, mockImplementationV2 } = await loadFixture(
        deployTimelockFixture
      );

      // Schedule an upgrade
      await timelock.connect(proposer).scheduleUpgrade(
        mockProxy,
        mockImplementationV2,
        "0x",
        false
      );

      const executeTime = await timelock.pendingUpgrades(mockProxy);

      // Fast forward past 48 hours
      const currentTime = await time.latest();
      const timeToExpire = Number(executeTime) + 48 * 60 * 60 + 1 - currentTime;
      await time.increase(timeToExpire);

      // Alice (not proposer/executor) can cleanup
      await expect(timelock.connect(alice).cleanupExpiredUpgrade(mockProxy))
        .to.emit(timelock, "UpgradeExpiredCleaned")
        .withArgs(mockProxy, mockImplementationV2);

      expect(await timelock.pendingUpgrades(mockProxy)).to.eq(0);
    });

    it("should not cleanup upgrade that is not expired", async function () {
      const { timelock, proposer, mockProxy, mockImplementationV2 } = await loadFixture(
        deployTimelockFixture
      );

      // Schedule an upgrade
      await timelock.connect(proposer).scheduleUpgrade(
        mockProxy,
        mockImplementationV2,
        "0x",
        false
      );

      const executeTime = await timelock.pendingUpgrades(mockProxy);

      // Fast forward to execute time (but not past 48 hours)
      const currentTime = await time.latest();
      const timeToExecute = Number(executeTime) - currentTime + 1;
      await time.increase(timeToExecute);

      // Verify upgrade is ready (not expired)
      const isReady = await timelock.isUpgradeReady(mockProxy);
      expect(isReady).to.be.true;

      // Try to cleanup - should not emit event or change state
      await expect(timelock.cleanupExpiredUpgrade(mockProxy)).to.not.emit(
        timelock,
        "UpgradeExpiredCleaned"
      );

      // Verify upgrade is still scheduled
      expect(await timelock.pendingUpgrades(mockProxy)).to.eq(executeTime);
      expect(await timelock.pendingImplementations(mockProxy)).to.eq(mockImplementationV2);
    });

    it("should not cleanup if no upgrade is scheduled", async function () {
      const { timelock, mockProxy } = await loadFixture(deployTimelockFixture);

      // Verify no upgrade is scheduled
      expect(await timelock.pendingUpgrades(mockProxy)).to.eq(0);

      // Cleanup should not revert but also not emit event
      await expect(timelock.cleanupExpiredUpgrade(mockProxy)).to.not.emit(
        timelock,
        "UpgradeExpiredCleaned"
      );
    });

    it("should cleanup expired upgrade before scheduling new one", async function () {
      const { timelock, proposer, mockProxy, mockImplementationV2 } = await loadFixture(
        deployTimelockFixture
      );

      const MockImplementationV3Factory = await ethers.getContractFactory("ERC1967Proxy");
      const mockImplementationV3 = await MockImplementationV3Factory.deploy(
        await timelock.getAddress(),
        "0x"
      );

      // Schedule first upgrade
      await timelock.connect(proposer).scheduleUpgrade(
        mockProxy,
        mockImplementationV2,
        "0x",
        false
      );

      const firstExecuteTime = await timelock.pendingUpgrades(mockProxy);

      // Fast forward past 48 hours
      const currentTime = await time.latest();
      const timeToExpire = Number(firstExecuteTime) + 48 * 60 * 60 + 1 - currentTime;
      await time.increase(timeToExpire);

      // Schedule new upgrade - should automatically cleanup expired one
      await expect(
        timelock.connect(proposer).scheduleUpgrade(
          mockProxy,
          await mockImplementationV3.getAddress(),
          "0x",
          false
        )
      ).to.emit(timelock, "UpgradeScheduled");

      // Verify new upgrade is scheduled (old one was cleaned up)
      const newExecuteTime = await timelock.pendingUpgrades(mockProxy);
      expect(newExecuteTime).to.be.gt(0);
      expect(newExecuteTime).to.not.eq(firstExecuteTime);
      expect(await timelock.pendingImplementations(mockProxy)).to.eq(
        await mockImplementationV3.getAddress()
      );
    });

    it("should cleanup multiple expired upgrades for different proxies", async function () {
      const { timelock, proposer, mockProxy, mockImplementationV2 } = await loadFixture(
        deployTimelockFixture
      );

      // Deploy second mock proxy
      const MockProxy2Factory = await ethers.getContractFactory("ERC1967Proxy");
      const mockProxy2 = await MockProxy2Factory.deploy(
        await timelock.getAddress(),
        "0x"
      );

      // Schedule upgrades for both proxies
      await timelock.connect(proposer).scheduleUpgrade(
        mockProxy,
        mockImplementationV2,
        "0x",
        false
      );

      await timelock.connect(proposer).scheduleUpgrade(
        await mockProxy2.getAddress(),
        mockImplementationV2,
        "0x",
        false
      );

      const executeTime1 = await timelock.pendingUpgrades(mockProxy);
      const executeTime2 = await timelock.pendingUpgrades(await mockProxy2.getAddress());

      // Fast forward past 48 hours for both
      const currentTime = await time.latest();
      const maxExecuteTime = Math.max(Number(executeTime1), Number(executeTime2));
      const timeToExpire = maxExecuteTime + 48 * 60 * 60 + 1 - currentTime;
      await time.increase(timeToExpire);

      // Cleanup both
      await expect(timelock.cleanupExpiredUpgrade(mockProxy))
        .to.emit(timelock, "UpgradeExpiredCleaned")
        .withArgs(mockProxy, mockImplementationV2);

      await expect(timelock.cleanupExpiredUpgrade(await mockProxy2.getAddress()))
        .to.emit(timelock, "UpgradeExpiredCleaned")
        .withArgs(await mockProxy2.getAddress(), mockImplementationV2);

      // Verify both are cleaned up
      expect(await timelock.pendingUpgrades(mockProxy)).to.eq(0);
      expect(await timelock.pendingUpgrades(await mockProxy2.getAddress())).to.eq(0);
    });
  });
});

