import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Attack Scenarios Tests", function () {
  async function deployAttackTestContracts() {
    const [owner, attacker, voter1, voter2, voter3, alice, bob] = await ethers.getSigners();

    
    const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
    const timelockImplementation = await HyraTimelock.deploy();
    await timelockImplementation.waitForDeployment();

    
    const proposers = [voter1.getAddress(), voter2.getAddress()];
    const executors = [voter1.getAddress(), voter2.getAddress(), voter3.getAddress()];

    
    const initData = HyraTimelock.interface.encodeFunctionData("initialize", [
      86400, 
      proposers,
      executors,
      owner.getAddress()
    ]);

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const timelockProxy = await ERC1967Proxy.deploy(await timelockImplementation.getAddress(), initData);
    await timelockProxy.waitForDeployment();

    const timelock = HyraTimelock.attach(await timelockProxy.getAddress());

    
    const HyraProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await HyraProxyAdmin.deploy(await timelock.getAddress());
    await proxyAdmin.waitForDeployment();

    
    const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
    const governorImplementation = await HyraGovernor.deploy();
    await governorImplementation.waitForDeployment();

    const governorInitData = HyraGovernor.interface.encodeFunctionData("initialize", [
      "HyraGovernor",
      await timelock.getAddress(),
      ethers.utils.parseEther("1000000"), 
      "HyraGovernor", 
      "HyraGovernor", 
      1, 
      10, 
      0, 
      10, 
      86400 
    ]);

    const governorProxy = await ERC1967Proxy.deploy(await governorImplementation.getAddress(), governorInitData);
    await governorProxy.waitForDeployment();

    const governor = HyraGovernor.attach(await governorProxy.getAddress());

    
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImplementation = await HyraToken.deploy();
    await tokenImplementation.waitForDeployment();

    const tokenInitData = HyraToken.interface.encodeFunctionData("initialize", [
      "Hyra Token",
      "HYRA",
      ethers.utils.parseEther("1000000"),
      alice.getAddress(), 
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
      governor,
      token,
      tokenProxy,
      tokenImplementation,
      owner,
      attacker,
      voter1,
      voter2,
      voter3,
      alice,
      bob
    };
  }

  describe("Governance Attacks", function () {
    it("should prevent governance takeover attacks", async function () {
      const { governor, attacker, voter1, voter2 } = await loadFixture(deployAttackTestContracts);

      
      const maliciousTargets = [await governor.getAddress()];
      const maliciousValues = [0];
      const maliciousCalldatas = [
        governor.interface.encodeFunctionData("setVotingDelay", [0]) 
      ];
      const maliciousDescription = "Malicious governance attack";

      
      
      await expect(
        governor.connect(attacker).connect(proposer).propose(maliciousTargets, maliciousValues, maliciousCalldatas, maliciousDescription)
      ).to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotingPower");
    });

    it("should prevent quorum manipulation attacks", async function () {
      const { governor, attacker, voter1, voter2, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [alice.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Legitimate proposal";

      const tx = await governor.connect(voter1).connect(proposer).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = governor.interface.interface.parseLog(log);
          return parsed?.name === "ProposalCreated";
        } catch {
          return false;
        }
      });

      const proposalId = event?.args?.proposalId;

      
      await expect(
        governor.connect(attacker).connect(voter).castVote(proposalId, 1)
      ).to.be.revertedWithCustomError(governor, "GovernorInsufficientVotingPower");
    });

    it("should prevent proposal execution attacks", async function () {
      const { governor, attacker, voter1, voter2, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [alice.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      const tx = await governor.connect(voter1).connect(proposer).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = governor.interface.interface.parseLog(log);
          return parsed?.name === "ProposalCreated";
        } catch {
          return false;
        }
      });

      const proposalId = event?.args?.proposalId;

      
      await governor.connect(voter1).connect(voter).castVote(proposalId, 1);
      await governor.connect(voter2).connect(voter).castVote(proposalId, 1);

      
      await time.increase(10 + 1);

      
      await governor.connect(voter1).connect(proposer).queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));

      
      await time.increase(86400 + 1);

      
      await expect(
        governor.connect(attacker).connect(executor).connect(executor).execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "GovernorOnlyExecutor");
    });
  });

  describe("Upgrade Attacks", function () {
    it("should prevent unauthorized upgrade attacks", async function () {
      const { proxyAdmin, tokenProxy, attacker } = await loadFixture(deployAttackTestContracts);

      
      const MaliciousToken = await ethers.getContractFactory("HyraToken");
      const maliciousImplementation = await MaliciousToken.deploy();
      await maliciousImplementation.waitForDeployment();

      
      await expect(
        proxyAdmin.connect(attacker).connect(owner).upgradeAndCall(
          tokenProxy,
          await maliciousImplementation.getAddress(),
          "0x"
        )
      ).to.be.revertedWithCustomError(proxyAdmin, "OwnableUnauthorizedAccount");
    });

    it("should prevent proxy admin takeover attacks", async function () {
      const { proxyAdmin, attacker } = await loadFixture(deployAttackTestContracts);

      
      await expect(
        proxyAdmin.connect(attacker).connect(owner).transferOwnership(attacker.getAddress())
      ).to.be.revertedWithCustomError(proxyAdmin, "OwnableUnauthorizedAccount");
    });

    it("should prevent malicious proxy addition attacks", async function () {
      const { proxyAdmin, attacker } = await loadFixture(deployAttackTestContracts);

      
      await expect(
        proxyAdmin.connect(attacker).connect(owner).addProxy(attacker.getAddress(), "Malicious Proxy")
      ).to.be.revertedWithCustomError(proxyAdmin, "OwnableUnauthorizedAccount");
    });
  });

  describe("Mint Manipulation Attacks", function () {
    it("should prevent mint cap bypass attacks", async function () {
      const { token, attacker, alice } = await loadFixture(deployAttackTestContracts);

      
      const excessiveAmount = ethers.utils.parseEther("3000000000"); 

      await expect(
        token.connect(attacker).connect(governance).createMintRequest(
          alice.getAddress(),
          excessiveAmount,
          "Mint cap bypass attack"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("should prevent unauthorized mint requests", async function () {
      const { token, attacker, alice } = await loadFixture(deployAttackTestContracts);

      
      await expect(
        token.connect(attacker).connect(governance).createMintRequest(
          alice.getAddress(),
          ethers.utils.parseEther("1000000"),
          "Unauthorized mint"
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should prevent mint request manipulation", async function () {
      const { token, voter1, attacker, alice } = await loadFixture(deployAttackTestContracts);

      
      const amount = ethers.utils.parseEther("1000000");
      const tx = await token.connect(voter1).connect(governance).createMintRequest(
        alice.getAddress(),
        amount,
        "Legitimate mint"
      );
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = token.interface.interface.parseLog(log);
          return parsed?.name === "MintRequestCreated";
        } catch {
          return false;
        }
      });
      const requestId = event?.args?.requestId;

      
      await expect(
        token.connect(attacker).connect(governance).executeMintRequest(requestId)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Role Escalation Attacks", function () {
    it("should prevent role escalation attacks", async function () {
      const { timelock, attacker } = await loadFixture(deployAttackTestContracts);

      
      const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
      
      await expect(
        timelock.connect(attacker).connect(owner).grantRole(adminRole, attacker.getAddress())
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("should prevent proposer role escalation", async function () {
      const { timelock, attacker } = await loadFixture(deployAttackTestContracts);

      
      const proposerRole = await timelock.PROPOSER_ROLE();
      
      await expect(
        timelock.connect(attacker).connect(owner).grantRole(proposerRole, attacker.getAddress())
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("should prevent executor role escalation", async function () {
      const { timelock, attacker } = await loadFixture(deployAttackTestContracts);

      
      const executorRole = await timelock.EXECUTOR_ROLE();
      
      await expect(
        timelock.connect(attacker).connect(owner).grantRole(executorRole, attacker.getAddress())
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Timelock Bypass Attacks", function () {
    it("should prevent timelock bypass attacks", async function () {
      const { timelock, attacker, alice } = await loadFixture(deployAttackTestContracts);

      const target = alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("bypass test"));
      const delay = 86400;

      
      await expect(
        timelock.connect(attacker).connect(executor).connect(executor).execute(target, value, data, salt, delay)
      ).to.be.revertedWithCustomError(timelock, "TimelockUnexpectedOperationState");
    });

    it("should prevent early execution attacks", async function () {
      const { timelock, voter1, alice } = await loadFixture(deployAttackTestContracts);

      const target = alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("early execution test"));
      const delay = 86400;

      
      await timelock.connect(voter1).connect(proposer).schedule(target, value, data, salt, delay);
      
      
      await expect(
        timelock.connect(voter1).connect(executor).connect(executor).execute(target, value, data, salt, delay)
      ).to.be.revertedWithCustomError(timelock, "TimelockUnexpectedOperationState");
    });

    it("should prevent unauthorized cancellation attacks", async function () {
      const { timelock, voter1, attacker, alice } = await loadFixture(deployAttackTestContracts);

      const target = alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("cancellation test"));
      const delay = 86400;

      
      await timelock.connect(voter1).connect(proposer).schedule(target, value, data, salt, delay);
      
      const operationId = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256", "bytes", "bytes32", "uint256"],
          [target, value, data, salt, delay]
        )
      );

      
      await expect(
        timelock.connect(attacker).connect(canceller).cancel(operationId)
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Reentrancy Attacks", function () {
    it("should prevent reentrancy attacks on token transfers", async function () {
      const { token, attacker, alice } = await loadFixture(deployAttackTestContracts);

      
      const MaliciousContract = await ethers.getContractFactory("MockMultiSigWallet");
      const maliciousContract = await MaliciousContract.deploy();
      await maliciousContract.waitForDeployment();

      
      await token.connect(alice).transfer(await maliciousContract.getAddress(), ethers.utils.parseEther("1000"));

      
      
      await expect(
        maliciousContract.connect(attacker).executeCall(
          await token.getAddress(),
          0,
          token.interface.encodeFunctionData("transfer", [attacker.getAddress(), ethers.utils.parseEther("1000")])
        )
      ).to.be.reverted;
    });
  });

  describe("Integer Overflow/Underflow Attacks", function () {
    it("should prevent integer overflow in mint calculations", async function () {
      const { token, voter1, alice } = await loadFixture(deployAttackTestContracts);

      
      const maxAmount = ethers.MaxUint256;
      
      await expect(
        token.connect(voter1).connect(governance).createMintRequest(
          alice.getAddress(),
          maxAmount,
          "Integer overflow test"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("should prevent integer underflow in balance calculations", async function () {
      const { token, alice, bob } = await loadFixture(deployAttackTestContracts);

      
      const aliceBalance = await token.balanceOf(alice.getAddress());
      const excessiveAmount = aliceBalance + ethers.utils.parseEther("1");
      
      await expect(
        token.connect(alice).transfer(bob.getAddress(), excessiveAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  describe("Front-running Attacks", function () {
    it("should prevent front-running in proposal creation", async function () {
      const { governor, attacker, voter1, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [alice.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Front-run test";

      
      await expect(
        governor.connect(attacker).propose(targets, values, calldatas, description)
      ).to.be.revertedWithCustomError(governor, "GovernorInsufficientProposerVotingPower");
    });

    it("should prevent front-running in vote casting", async function () {
      const { governor, attacker, voter1, voter2, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [alice.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Vote front-run test";

      const tx = await governor.connect(voter1).connect(proposer).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = governor.interface.interface.parseLog(log);
          return parsed?.name === "ProposalCreated";
        } catch {
          return false;
        }
      });

      const proposalId = event?.args?.proposalId;

      
      await expect(
        governor.connect(attacker).connect(voter).castVote(proposalId, 1)
      ).to.be.revertedWithCustomError(governor, "GovernorInsufficientVotingPower");
    });
  });
});
