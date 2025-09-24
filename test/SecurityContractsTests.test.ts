import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("Security Contracts Tests", function () {
  async function deploySecurityContracts() {
    const [owner, signer1, signer2, signer3, alice, bob] = await ethers.getSigners();

    
    const MultiSigRoleManager = await ethers.getContractFactory("MultiSigRoleManager");
    const multiSigRoleManager = await MultiSigRoleManager.deploy();
    await multiSigRoleManager.waitForDeployment();

    
    const DAORoleManager = await ethers.getContractFactory("DAORoleManager");
    const daoRoleManager = await DAORoleManager.deploy();
    await daoRoleManager.waitForDeployment();

    
    const ProxyAdminValidator = await ethers.getContractFactory("ProxyAdminValidator");
    const proxyAdminValidator = await ProxyAdminValidator.deploy();
    await proxyAdminValidator.waitForDeployment();

    
    const SecureExecutorManager = await ethers.getContractFactory("SecureExecutorManager");
    const secureExecutorManager = await SecureExecutorManager.deploy();
    await secureExecutorManager.waitForDeployment();

    
    const TimeLockActions = await ethers.getContractFactory("TimeLockActions");
    const timeLockActions = await TimeLockActions.deploy();
    await timeLockActions.waitForDeployment();

    
    const SimpleMultiSigRoleManager = await ethers.getContractFactory("SimpleMultiSigRoleManager");
    const simpleMultiSigRoleManager = await SimpleMultiSigRoleManager.deploy();
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
    it("should initialize with correct parameters", async function () {
      const { multiSigRoleManager, owner, signer1, signer2 } = await loadFixture(deploySecurityContracts);

      
      const signers = [signer1.getAddress(), signer2.getAddress()];
      const requiredSignatures = 2;
      const role = ethers.keccak256(ethers.toUtf8Bytes("TEST_ROLE"));

      await multiSigRoleManager.initialize(
        owner.getAddress(),
        signers,
        requiredSignatures,
        role
      );

      
      expect(await multiSigRoleManager.owner()).to.equal(owner.getAddress());
      expect(await multiSigRoleManager.getSignerCount()).to.equal(2);
      expect(await multiSigRoleManager.getRequiredSignatures()).to.equal(2);
    });

    it("should require multiple signatures for role changes", async function () {
      const { multiSigRoleManager, owner, signer1, signer2, alice } = await loadFixture(deploySecurityContracts);

      const signers = [signer1.getAddress(), signer2.getAddress()];
      const requiredSignatures = 2;
      const role = ethers.keccak256(ethers.toUtf8Bytes("TEST_ROLE"));

      await multiSigRoleManager.initialize(
        owner.getAddress(),
        signers,
        requiredSignatures,
        role
      );

      
      await expect(
        multiSigRoleManager.connect(signer1).proposeRoleChange(
          alice.getAddress(),
          role,
          true
        )
      ).to.be.revertedWithCustomError(multiSigRoleManager, "InsufficientSignatures");

      
      const tx1 = await multiSigRoleManager.connect(signer1).proposeRoleChange(
        alice.getAddress(),
        role,
        true
      );
      const receipt1 = await tx1.wait();
      const event1 = receipt1?.logs.find(log => {
        try {
          const parsed = multiSigRoleManager.interface.interface.parseLog(log);
          return parsed?.name === "RoleChangeProposed";
        } catch {
          return false;
        }
      });
      const proposalId = event1?.args?.proposalId;

      await multiSigRoleManager.connect(signer2).approveProposal(proposalId);

      
      await multiSigRoleManager.connect(owner).executeProposal(proposalId);

      
      expect(await multiSigRoleManager.hasRole(role, alice.getAddress())).to.be.true;
    });

    it("should prevent unauthorized role changes", async function () {
      const { multiSigRoleManager, owner, signer1, signer2, alice, bob } = await loadFixture(deploySecurityContracts);

      const signers = [signer1.getAddress(), signer2.getAddress()];
      const requiredSignatures = 2;
      const role = ethers.keccak256(ethers.toUtf8Bytes("TEST_ROLE"));

      await multiSigRoleManager.initialize(
        owner.getAddress(),
        signers,
        requiredSignatures,
        role
      );

      
      await expect(
        multiSigRoleManager.connect(bob).proposeRoleChange(
          alice.getAddress(),
          role,
          true
        )
      ).to.be.revertedWithCustomError(multiSigRoleManager, "UnauthorizedSigner");
    });

    it("should handle compromised signer scenarios", async function () {
      const { multiSigRoleManager, owner, signer1, signer2, alice } = await loadFixture(deploySecurityContracts);

      const signers = [signer1.getAddress(), signer2.getAddress()];
      const requiredSignatures = 2;
      const role = ethers.keccak256(ethers.toUtf8Bytes("TEST_ROLE"));

      await multiSigRoleManager.initialize(
        owner.getAddress(),
        signers,
        requiredSignatures,
        role
      );

      
      await expect(
        multiSigRoleManager.connect(signer1).proposeRoleChange(
          alice.getAddress(),
          role,
          true
        )
      ).to.be.revertedWithCustomError(multiSigRoleManager, "InsufficientSignatures");

      
      const tx = await multiSigRoleManager.connect(signer2).proposeRoleChange(
        alice.getAddress(),
        role,
        true
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = multiSigRoleManager.interface.interface.parseLog(log);
          return parsed?.name === "RoleChangeProposed";
        } catch {
          return false;
        }
      });
      const proposalId = event?.args?.proposalId;

      
      await multiSigRoleManager.connect(signer1).approveProposal(proposalId);
      await multiSigRoleManager.connect(owner).executeProposal(proposalId);

      expect(await multiSigRoleManager.hasRole(role, alice.getAddress())).to.be.true;
    });
  });

  describe("DAORoleManager", function () {
    it("should manage DAO roles correctly", async function () {
      const { daoRoleManager, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      const role = ethers.keccak256(ethers.toUtf8Bytes("DAO_ROLE"));

      
      await daoRoleManager.connect(owner).connect(owner).grantRole(role, alice.getAddress());
      expect(await daoRoleManager.hasRole(role, alice.getAddress())).to.be.true;

      
      await daoRoleManager.connect(owner).connect(owner).revokeRole(role, alice.getAddress());
      expect(await daoRoleManager.hasRole(role, alice.getAddress())).to.be.false;
    });

    it("should enforce role-based access control", async function () {
      const { daoRoleManager, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      const role = ethers.keccak256(ethers.toUtf8Bytes("DAO_ROLE"));

      
      await expect(
        daoRoleManager.connect(alice).connect(owner).grantRole(role, bob.getAddress())
      ).to.be.revertedWithCustomError(daoRoleManager, "AccessControlUnauthorizedAccount");
    });

    it("should handle role transitions", async function () {
      const { daoRoleManager, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      const role = ethers.keccak256(ethers.toUtf8Bytes("DAO_ROLE"));

      
      await daoRoleManager.connect(owner).connect(owner).grantRole(role, alice.getAddress());
      expect(await daoRoleManager.hasRole(role, alice.getAddress())).to.be.true;

      
      await daoRoleManager.connect(alice).transferRole(role, bob.getAddress());
      expect(await daoRoleManager.hasRole(role, alice.getAddress())).to.be.false;
      expect(await daoRoleManager.hasRole(role, bob.getAddress())).to.be.true;
    });
  });

  describe("ProxyAdminValidator", function () {
    it("should validate proxy admin addresses", async function () {
      const { proxyAdminValidator, owner, alice } = await loadFixture(deploySecurityContracts);

      
      await proxyAdminValidator.connect(owner).addAuthorizedProxyAdmin(alice.getAddress());
      expect(await proxyAdminValidator.isAuthorizedProxyAdmin(alice.getAddress())).to.be.true;

      
      await proxyAdminValidator.connect(owner).removeAuthorizedProxyAdmin(alice.getAddress());
      expect(await proxyAdminValidator.isAuthorizedProxyAdmin(alice.getAddress())).to.be.false;
    });

    it("should prevent unauthorized proxy admin changes", async function () {
      const { proxyAdminValidator, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      
      await expect(
        proxyAdminValidator.connect(alice).addAuthorizedProxyAdmin(bob.getAddress())
      ).to.be.revertedWithCustomError(proxyAdminValidator, "OwnableUnauthorizedAccount");
    });

    it("should maintain proxy admin whitelist", async function () {
      const { proxyAdminValidator, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      
      await proxyAdminValidator.connect(owner).addAuthorizedProxyAdmin(alice.getAddress());
      await proxyAdminValidator.connect(owner).addAuthorizedProxyAdmin(bob.getAddress());

      
      expect(await proxyAdminValidator.isAuthorizedProxyAdmin(alice.getAddress())).to.be.true;
      expect(await proxyAdminValidator.isAuthorizedProxyAdmin(bob.getAddress())).to.be.true;

      
      const count = await proxyAdminValidator.getAuthorizedProxyAdminCount();
      expect(count).to.equal(2);
    });
  });

  describe("SecureExecutorManager", function () {
    it("should manage secure executors", async function () {
      const { secureExecutorManager, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      
      await secureExecutorManager.connect(owner).addSecureExecutor(alice.getAddress());
      expect(await secureExecutorManager.isSecureExecutor(alice.getAddress())).to.be.true;

      
      await secureExecutorManager.connect(owner).removeSecureExecutor(alice.getAddress());
      expect(await secureExecutorManager.isSecureExecutor(alice.getAddress())).to.be.false;
    });

    it("should enforce executor permissions", async function () {
      const { secureExecutorManager, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      
      await expect(
        secureExecutorManager.connect(alice).addSecureExecutor(bob.getAddress())
      ).to.be.revertedWithCustomError(secureExecutorManager, "OwnableUnauthorizedAccount");
    });

    it("should handle executor lifecycle", async function () {
      const { secureExecutorManager, owner, alice, bob } = await loadFixture(deploySecurityContracts);

      
      await secureExecutorManager.connect(owner).addSecureExecutor(alice.getAddress());
      await secureExecutorManager.connect(owner).addSecureExecutor(bob.getAddress());

      
      expect(await secureExecutorManager.isSecureExecutor(alice.getAddress())).to.be.true;
      expect(await secureExecutorManager.isSecureExecutor(bob.getAddress())).to.be.true;

      
      const count = await secureExecutorManager.getSecureExecutorCount();
      expect(count).to.equal(2);
    });
  });

  describe("TimeLockActions", function () {
    it("should handle time-locked actions", async function () {
      const { timeLockActions, owner, alice } = await loadFixture(deploySecurityContracts);

      const action = ethers.keccak256(ethers.toUtf8Bytes("TEST_ACTION"));
      const delay = 86400; 

      
      await timeLockActions.connect(owner).scheduleAction(action, delay);
      
      
      expect(await timeLockActions.isActionScheduled(action)).to.be.true;
      
      
      await ethers.provider.send("evm_increaseTime", [delay + 1]);
      await ethers.provider.send("evm_mine", []);
      
      
      await timeLockActions.connect(owner).executeAction(action);
      
      
      expect(await timeLockActions.isActionExecuted(action)).to.be.true;
    });

    it("should enforce time delays", async function () {
      const { timeLockActions, owner } = await loadFixture(deploySecurityContracts);

      const action = ethers.keccak256(ethers.toUtf8Bytes("TEST_ACTION"));
      const delay = 86400; 

      
      await timeLockActions.connect(owner).scheduleAction(action, delay);
      
      
      await expect(
        timeLockActions.connect(owner).executeAction(action)
      ).to.be.revertedWithCustomError(timeLockActions, "ActionNotReady");
    });

    it("should handle action cancellation", async function () {
      const { timeLockActions, owner } = await loadFixture(deploySecurityContracts);

      const action = ethers.keccak256(ethers.toUtf8Bytes("TEST_ACTION"));
      const delay = 86400; 

      
      await timeLockActions.connect(owner).scheduleAction(action, delay);
      
      
      await timeLockActions.connect(owner).cancelAction(action);
      
      
      expect(await timeLockActions.isActionScheduled(action)).to.be.false;
    });
  });

  describe("SimpleMultiSigRoleManager", function () {
    it("should manage simple multi-sig roles", async function () {
      const { simpleMultiSigRoleManager, owner, signer1, signer2, alice } = await loadFixture(deploySecurityContracts);

      const signers = [signer1.getAddress(), signer2.getAddress()];
      const requiredSignatures = 2;
      const role = ethers.keccak256(ethers.toUtf8Bytes("SIMPLE_ROLE"));

      
      await simpleMultiSigRoleManager.initialize(
        owner.getAddress(),
        signers,
        requiredSignatures,
        role
      );

      
      const tx = await simpleMultiSigRoleManager.connect(signer1).proposeRoleChange(
        alice.getAddress(),
        role,
        true
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = simpleMultiSigRoleManager.interface.interface.parseLog(log);
          return parsed?.name === "RoleChangeProposed";
        } catch {
          return false;
        }
      });
      const proposalId = event?.args?.proposalId;

      
      await simpleMultiSigRoleManager.connect(signer2).approveProposal(proposalId);

      
      await simpleMultiSigRoleManager.connect(owner).executeProposal(proposalId);

      
      expect(await simpleMultiSigRoleManager.hasRole(role, alice.getAddress())).to.be.true;
    });

    it("should enforce signature requirements", async function () {
      const { simpleMultiSigRoleManager, owner, signer1, signer2, alice } = await loadFixture(deploySecurityContracts);

      const signers = [signer1.getAddress(), signer2.getAddress()];
      const requiredSignatures = 2;
      const role = ethers.keccak256(ethers.toUtf8Bytes("SIMPLE_ROLE"));

      await simpleMultiSigRoleManager.initialize(
        owner.getAddress(),
        signers,
        requiredSignatures,
        role
      );

      
      await expect(
        simpleMultiSigRoleManager.connect(signer1).proposeRoleChange(
          alice.getAddress(),
          role,
          true
        )
      ).to.be.revertedWithCustomError(simpleMultiSigRoleManager, "InsufficientSignatures");
    });

    it("should prevent unauthorized access", async function () {
      const { simpleMultiSigRoleManager, owner, signer1, signer2, alice, bob } = await loadFixture(deploySecurityContracts);

      const signers = [signer1.getAddress(), signer2.getAddress()];
      const requiredSignatures = 2;
      const role = ethers.keccak256(ethers.toUtf8Bytes("SIMPLE_ROLE"));

      await simpleMultiSigRoleManager.initialize(
        owner.getAddress(),
        signers,
        requiredSignatures,
        role
      );

      
      await expect(
        simpleMultiSigRoleManager.connect(bob).proposeRoleChange(
          alice.getAddress(),
          role,
          true
        )
      ).to.be.revertedWithCustomError(simpleMultiSigRoleManager, "UnauthorizedSigner");
    });
  });
});
