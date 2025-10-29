import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Security Contracts Tests", function () {
  async function deploySecurityContracts() {
    const [owner, signer1, signer2, signer3, alice, bob] = await ethers.getSigners();

    
    const MultiSigRoleManager = await ethers.getContractFactory("MultiSigRoleManager");
    const msrmImpl = await MultiSigRoleManager.deploy();
    await msrmImpl.waitForDeployment();
    const initMsrm = MultiSigRoleManager.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const msrmProxy = await ERC1967Proxy.deploy(await msrmImpl.getAddress(), initMsrm);
    await msrmProxy.waitForDeployment();
    const multiSigRoleManager = MultiSigRoleManager.attach(await msrmProxy.getAddress());

    
    const DAORoleManager = await ethers.getContractFactory("DAORoleManager");
    const daoRoleManager = await DAORoleManager.deploy();
    await daoRoleManager.waitForDeployment();

    
    const ProxyAdminValidator = await ethers.getContractFactory("ProxyAdminValidator");
    const pavImpl = await ProxyAdminValidator.deploy();
    await pavImpl.waitForDeployment();
    const initPav = ProxyAdminValidator.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
    const pavProxy = await ERC1967Proxy.deploy(await pavImpl.getAddress(), initPav);
    await pavProxy.waitForDeployment();
    const proxyAdminValidator = ProxyAdminValidator.attach(await pavProxy.getAddress());

    
    const SecureExecutorManager = await ethers.getContractFactory("SecureExecutorManager");
    const semImpl = await SecureExecutorManager.deploy();
    await semImpl.waitForDeployment();
    const initSem = SecureExecutorManager.interface.encodeFunctionData("initialize", [await owner.getAddress(), [await owner.getAddress()]]);
    const semProxy = await ERC1967Proxy.deploy(await semImpl.getAddress(), initSem);
    await semProxy.waitForDeployment();
    const secureExecutorManager = SecureExecutorManager.attach(await semProxy.getAddress());

    
    const TimeLockActions = await ethers.getContractFactory("TimeLockActions");
    const tlaImpl = await TimeLockActions.deploy();
    await tlaImpl.waitForDeployment();
    const initTla = TimeLockActions.interface.encodeFunctionData("initialize", [await multiSigRoleManager.getAddress()]);
    const tlaProxy = await ERC1967Proxy.deploy(await tlaImpl.getAddress(), initTla);
    await tlaProxy.waitForDeployment();
    const timeLockActions = TimeLockActions.attach(await tlaProxy.getAddress());

    
    const SimpleMultiSigRoleManager = await ethers.getContractFactory("SimpleMultiSigRoleManager");
    const simpleMultiSigRoleManager = await SimpleMultiSigRoleManager.deploy(await owner.getAddress());
    await simpleMultiSigRoleManager.waitForDeployment();

    return {
      multiSigRoleManager,
      daoRoleManager,
      proxyAdminValidator,
      secureExecutorManager,
      timeLockActions,
      simpleMultiSigRoleManager,
      owner,
      signer1,
      signer2,
      signer3,
      alice,
      bob
    };
  }

  describe("MultiSigRoleManager", function () {
    it("should configure role and require multiple signatures", async function () {
      const { multiSigRoleManager, owner, signer1, signer2 } = await loadFixture(deploySecurityContracts);

      const role = await multiSigRoleManager.GOVERNANCE_ROLE();
      const signers = [await signer1.getAddress(), await signer2.getAddress()];
      const required = 2;

      await multiSigRoleManager.connect(owner).configureRoleMultiSig(role, required, signers);
      const signerList = await multiSigRoleManager.getRoleSigners(role);
      expect(signerList.length).to.equal(2);

      const actionData = multiSigRoleManager.interface.encodeFunctionData("getRoleSigners", [role]);
      const tx = await multiSigRoleManager.connect(signer1).proposeAction(role, actionData);
      const receipt = await tx.wait();
      const proposed = receipt!.logs.find(l => {
        try { return multiSigRoleManager.interface.parseLog(l).name === "ActionProposed"; } catch { return false; }
      });
      const parsed = multiSigRoleManager.interface.parseLog(proposed!);
      const actionHash = parsed.args.actionHash as string;
      await expect(multiSigRoleManager.connect(signer2).signAction(actionHash)).to.not.be.reverted;
      await expect(multiSigRoleManager.executeAction(actionHash)).to.be.revertedWithCustomError(multiSigRoleManager, "ActionAlreadyExecuted");
    });
  });

  describe("DAORoleManager", function () {
    it("should revert role changes without governance admin", async function () {
      const { daoRoleManager, alice, bob } = await loadFixture(deploySecurityContracts);
      const role = ethers.keccak256(ethers.toUtf8Bytes("DAO_ROLE"));
      await expect(daoRoleManager.connect(alice).grantRole(role, await bob.getAddress())).to.be.reverted;
    });
  });

  describe("ProxyAdminValidator", function () {
    it("should authorize and deauthorize proxy admins", async function () {
      const { proxyAdminValidator, owner, simpleMultiSigRoleManager } = await loadFixture(deploySecurityContracts);
      const targetProxyAdmin = await simpleMultiSigRoleManager.getAddress();

      await proxyAdminValidator.connect(owner).authorizeProxyAdmin(targetProxyAdmin, "Test", await owner.getAddress(), "desc");
      expect(await proxyAdminValidator.isAuthorizedProxyAdmin(targetProxyAdmin)).to.be.true;
      await proxyAdminValidator.connect(owner).deauthorizeProxyAdmin(targetProxyAdmin);
      expect(await proxyAdminValidator.isAuthorizedProxyAdmin(targetProxyAdmin)).to.be.false;
    });

    it("should prevent unauthorized changes", async function () {
      const { proxyAdminValidator, alice, simpleMultiSigRoleManager } = await loadFixture(deploySecurityContracts);
      await expect(
        proxyAdminValidator.connect(alice).authorizeProxyAdmin(await simpleMultiSigRoleManager.getAddress(), "N", await alice.getAddress(), "d")
      ).to.be.revertedWithCustomError(proxyAdminValidator, "AccessControlUnauthorizedAccount");
    });
  });

  describe("SecureExecutorManager", function () {
    it("should manage executors with manager role", async function () {
      const { secureExecutorManager, owner, alice, bob } = await loadFixture(deploySecurityContracts);
      await expect(secureExecutorManager.connect(owner).addExecutor(await alice.getAddress())).to.not.be.reverted;
      expect(await secureExecutorManager.isAuthorizedExecutor(await alice.getAddress())).to.be.true;
      await expect(secureExecutorManager.connect(owner).removeExecutor(await alice.getAddress())).to.not.be.reverted;
      expect(await secureExecutorManager.isAuthorizedExecutor(await alice.getAddress())).to.be.false;
      await expect(secureExecutorManager.connect(alice).addExecutor(await bob.getAddress())).to.be.revertedWithCustomError(secureExecutorManager, "AccessControlUnauthorizedAccount");
    });
  });

  describe("TimeLockActions", function () {
    it("should schedule, enforce delay, execute, and cancel actions", async function () {
      const { timeLockActions, multiSigRoleManager, owner, signer1 } = await loadFixture(deploySecurityContracts);
      const role = await multiSigRoleManager.GOVERNANCE_ROLE();
      await multiSigRoleManager.connect(owner).configureRoleMultiSig(role, 2, [await owner.getAddress(), await signer1.getAddress()]);

      const target = await multiSigRoleManager.getAddress();
      const data = multiSigRoleManager.interface.encodeFunctionData("getRoleSigners", [role]);
      const delay = 2 * 60 * 60; // 2 hours (MIN_DELAY)

      const tx = await timeLockActions.connect(owner).scheduleAction(target, data, role, delay);
      const rcpt = await tx.wait();
      const schedLog = rcpt!.logs.find(l => { try { return timeLockActions.interface.parseLog(l).name === "ActionScheduled"; } catch { return false; } });
      const parsed = timeLockActions.interface.parseLog(schedLog!);
      const actionHash = parsed.args.actionHash as string;
      const before = await timeLockActions.canExecuteAction(actionHash);
      expect(before).to.equal(false);

      await ethers.provider.send("evm_increaseTime", [delay + 1]);
      await ethers.provider.send("evm_mine", []);

      await expect(timeLockActions.connect(owner).executeAction(actionHash)).to.not.be.reverted;

      // Schedule and cancel another
      const tx2 = await timeLockActions.connect(owner).scheduleAction(target, data, role, delay);
      const rcpt2 = await tx2.wait();
      const schedLog2 = rcpt2!.logs.find(l => { try { return timeLockActions.interface.parseLog(l).name === "ActionScheduled"; } catch { return false; } });
      const parsed2 = timeLockActions.interface.parseLog(schedLog2!);
      const actionHash2 = parsed2.args.actionHash as string;
      await expect(timeLockActions.connect(owner).cancelAction(actionHash2)).to.not.be.reverted;
    });
  });

  describe("SimpleMultiSigRoleManager", function () {
    it("should manage simple multi-sig roles", async function () {
      const { simpleMultiSigRoleManager, owner, signer1, signer2 } = await loadFixture(deploySecurityContracts);
      const role = await simpleMultiSigRoleManager.GOVERNANCE_ROLE();
      const signers = [await signer1.getAddress(), await signer2.getAddress()];
      await simpleMultiSigRoleManager.connect(owner).configureRoleMultiSig(role, 2, signers);
      const signerList = await simpleMultiSigRoleManager.getRoleSigners(role);
      expect(signerList.length).to.equal(2);
    });

    it("should enforce signature requirements", async function () {
      const { simpleMultiSigRoleManager, owner, signer1, signer2, alice } = await loadFixture(deploySecurityContracts);
      const role = await simpleMultiSigRoleManager.GOVERNANCE_ROLE();
      await simpleMultiSigRoleManager.connect(owner).configureRoleMultiSig(role, 2, [await signer1.getAddress(), await signer2.getAddress()]);
      const actionData = simpleMultiSigRoleManager.interface.encodeFunctionData("getRoleSigners", [role]);
      await expect(simpleMultiSigRoleManager.connect(signer1).proposeAction(role, actionData)).to.not.be.reverted;
    });

    it("should prevent unauthorized access", async function () {
      const { simpleMultiSigRoleManager, owner, alice } = await loadFixture(deploySecurityContracts);
      const role = await simpleMultiSigRoleManager.GOVERNANCE_ROLE();
      // Not configured; alice doesn't have role
      const actionData = simpleMultiSigRoleManager.interface.encodeFunctionData("getRoleSigners", [role]);
      await expect(simpleMultiSigRoleManager.connect(alice).proposeAction(role, actionData)).to.be.reverted;
    });
  });
});
