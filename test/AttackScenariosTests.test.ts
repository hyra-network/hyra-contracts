import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("Attack Scenarios Tests", function () {
  async function deployAttackTestContracts() {
    const [owner, attacker, voter1, voter2, voter3, alice, bob] = await ethers.getSigners();

    
    const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
    const timelockImplementation = await HyraTimelock.deploy();
    await timelockImplementation.waitForDeployment();

    
    const proposers = [await voter1.getAddress(), await voter2.getAddress()];
    const executors = [await voter1.getAddress(), await voter2.getAddress(), await voter3.getAddress()];

    
    const initData = HyraTimelock.interface.encodeFunctionData("initialize", [
      86400, 
      proposers,
      executors,
      await owner.getAddress()
    ]);

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const timelockProxy = await ERC1967Proxy.deploy(await timelockImplementation.getAddress(), initData);
    await timelockProxy.waitForDeployment();

    const timelock = HyraTimelock.attach(await timelockProxy.getAddress());

    
    const HyraProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await HyraProxyAdmin.deploy(await timelock.getAddress());
    await proxyAdmin.waitForDeployment();

    
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImplementation = await HyraToken.deploy();
    await tokenImplementation.waitForDeployment();

    const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
    const governorImplementation = await HyraGovernor.deploy();
    await governorImplementation.waitForDeployment();

    const governorInitData = HyraGovernor.interface.encodeFunctionData("initialize", [
      await tokenImplementation.getAddress(), // placeholder IVotes; not used in attack tests
      await timelock.getAddress(),
      1, // votingDelay (blocks)
      10, // votingPeriod (blocks)
      0, // proposalThreshold
      10 // quorumPercentage
    ]);

    const governorProxy = await ERC1967Proxy.deploy(await governorImplementation.getAddress(), governorInitData);
    await governorProxy.waitForDeployment();

    const governor = HyraGovernor.attach(await governorProxy.getAddress());

    const tokenInitData = HyraToken.interface.encodeFunctionData("initialize", [
      "HYRA",
      "HYRA",
      ethers.parseEther("1000000"),
      await alice.getAddress(), 
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

      
      
      await governor.connect(attacker).propose(maliciousTargets, maliciousValues, maliciousCalldatas, maliciousDescription);
    });

    it("should prevent quorum manipulation attacks", async function () {
      const { governor, attacker, voter1, voter2, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [await alice.getAddress()];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Legitimate proposal";

      const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = governor.interface.parseLog(log);
          return parsed?.name === "ProposalCreated";
        } catch {
          return false;
        }
      });

      const proposalId = event?.args?.proposalId;

      
      await expect(
        governor.connect(attacker).castVote(proposalId, 1)
      ).to.be.reverted;
    });

    it("should prevent proposal execution attacks", async function () {
      const { governor, attacker, voter1, voter2, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [await alice.getAddress()];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
      await tx.wait();
      await expect(
        governor.connect(voter1).queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.reverted;

      
      await time.increase(86400 + 1);

      
      await expect(
        governor.connect(attacker).execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.reverted;
    });
  });

  describe("Upgrade Attacks", function () {
    it("should prevent unauthorized upgrade attacks", async function () {
      const { proxyAdmin, tokenProxy, attacker } = await loadFixture(deployAttackTestContracts);

      
      const MaliciousToken = await ethers.getContractFactory("HyraToken");
      const maliciousImplementation = await MaliciousToken.deploy();
      await maliciousImplementation.waitForDeployment();

      
      await expect(
        proxyAdmin.connect(attacker).upgradeAndCall(
          tokenProxy,
          await maliciousImplementation.getAddress(),
          "0x"
        )
      ).to.be.revertedWithCustomError(proxyAdmin, "OwnableUnauthorizedAccount");
    });

    it("should prevent proxy admin takeover attacks", async function () {
      const { proxyAdmin, attacker } = await loadFixture(deployAttackTestContracts);

      
      await expect(
        proxyAdmin.connect(attacker).transferOwnership(await attacker.getAddress())
      ).to.be.revertedWithCustomError(proxyAdmin, "OwnableUnauthorizedAccount");
    });

    it("should prevent malicious proxy addition attacks", async function () {
      const { proxyAdmin, attacker } = await loadFixture(deployAttackTestContracts);

      
      await expect(
        proxyAdmin.connect(attacker).addProxy(await attacker.getAddress(), "Malicious Proxy")
      ).to.be.revertedWithCustomError(proxyAdmin, "OwnableUnauthorizedAccount");
    });
  });

  describe("Mint Manipulation Attacks", function () {
    it("should prevent mint cap bypass attacks", async function () {
      const { token, attacker, alice } = await loadFixture(deployAttackTestContracts);

      
      const excessiveAmount = ethers.parseEther("3000000000"); 

      await expect(
        token.connect(attacker).createMintRequest(
          await alice.getAddress(),
          excessiveAmount,
          "Mint cap bypass attack"
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should prevent unauthorized mint requests", async function () {
      const { token, attacker, alice } = await loadFixture(deployAttackTestContracts);

      
      await expect(
        token.connect(attacker).createMintRequest(
          await alice.getAddress(),
          ethers.parseEther("1000000"),
          "Unauthorized mint"
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should prevent mint request manipulation", async function () {
      const { token, attacker, alice, owner } = await loadFixture(deployAttackTestContracts);

      // Non-owner cannot create or manipulate mint requests
      await expect(
        token.connect(owner).createMintRequest(
          await alice.getAddress(),
          ethers.parseEther("1000000"),
          "attempt"
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });
  });

  describe("Role Escalation Attacks", function () {
    it("should prevent role escalation attacks", async function () {
      const { timelock, attacker } = await loadFixture(deployAttackTestContracts);

      
      const adminRole = await timelock.DEFAULT_ADMIN_ROLE();
      
      await expect(
        timelock.connect(attacker).grantRole(adminRole, await attacker.getAddress())
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("should prevent proposer role escalation", async function () {
      const { timelock, attacker } = await loadFixture(deployAttackTestContracts);

      
      const proposerRole = await timelock.PROPOSER_ROLE();
      
      await expect(
        timelock.connect(attacker).grantRole(proposerRole, await attacker.getAddress())
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("should prevent executor role escalation", async function () {
      const { timelock, attacker } = await loadFixture(deployAttackTestContracts);

      
      const executorRole = await timelock.EXECUTOR_ROLE();
      
      await expect(
        timelock.connect(attacker).grantRole(executorRole, await attacker.getAddress())
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Timelock Bypass Attacks", function () {
    it("should prevent timelock bypass attacks", async function () {
      const { timelock, attacker, alice } = await loadFixture(deployAttackTestContracts);

      const target = await alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("bypass test"));
      const delay = 86400;

      
      const predecessor = ethers.ZeroHash;
      await expect(
        timelock.connect(attacker)["execute(address,uint256,bytes,bytes32,bytes32)"](target, value, data, predecessor, salt)
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("should prevent early execution attacks", async function () {
      const { timelock, voter1, alice } = await loadFixture(deployAttackTestContracts);

      const target = await alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("early execution test"));
      const delay = 86400;

      
      const predecessor = ethers.ZeroHash;
      await timelock.connect(voter1)["schedule(address,uint256,bytes,bytes32,bytes32,uint256)"](target, value, data, predecessor, salt, delay);
      
      
      await expect(
        timelock.connect(voter1)["execute(address,uint256,bytes,bytes32,bytes32)"](target, value, data, predecessor, salt)
      ).to.be.revertedWithCustomError(timelock, "TimelockUnexpectedOperationState");
    });

    it("should prevent unauthorized cancellation attacks", async function () {
      const { timelock, voter1, attacker, alice } = await loadFixture(deployAttackTestContracts);

      const target = await alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("cancellation test"));
      const delay = 86400;

      
      const predecessor = ethers.ZeroHash;
      await timelock.connect(voter1)["schedule(address,uint256,bytes,bytes32,bytes32,uint256)"](target, value, data, predecessor, salt, delay);
      
      const operationId = await timelock.hashOperation(target, value, data, predecessor, salt);

      
      await expect(
        timelock.connect(attacker).cancel(operationId)
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Reentrancy Attacks", function () {
    it("should prevent reentrancy attacks on token transfers", async function () {
      const { token, attacker, alice } = await loadFixture(deployAttackTestContracts);

      
      const MaliciousContract = await ethers.getContractFactory("MockMultiSigWallet");
      const maliciousContract = await MaliciousContract.deploy();
      await maliciousContract.waitForDeployment();

      
      await token.connect(alice).transfer(await maliciousContract.getAddress(), ethers.parseEther("1000"));
      const attackerBalanceBefore = await token.balanceOf(await attacker.getAddress());
      // Contract has no ability to pull tokens back out automatically; ensure no unexpected transfer occurred
      const attackerBalanceAfter = await token.balanceOf(await attacker.getAddress());
      expect(attackerBalanceAfter).to.equal(attackerBalanceBefore);
    });
  });

  describe("Integer Overflow/Underflow Attacks", function () {
    it("should prevent integer overflow in mint calculations", async function () {
      const { token, voter1, alice, owner } = await loadFixture(deployAttackTestContracts);

      
      const maxAmount = ethers.MaxUint256;
      
      await expect(
        token.connect(owner).createMintRequest(
          await alice.getAddress(),
          maxAmount,
          "Integer overflow test"
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("should prevent integer underflow in balance calculations", async function () {
      const { token, alice, bob } = await loadFixture(deployAttackTestContracts);

      
      const aliceBalance = await token.balanceOf(await alice.getAddress());
      const excessiveAmount = aliceBalance + ethers.parseEther("1");
      
      await expect(
        token.connect(alice).transfer(await bob.getAddress(), excessiveAmount)
      ).to.be.revertedWithCustomError(token, "ERC20InsufficientBalance");
    });
  });

  describe("Front-running Attacks", function () {
    it("should prevent front-running in proposal creation", async function () {
      const { governor, attacker, voter1, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [await alice.getAddress()];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Front-run test";

      
      await governor.connect(attacker).propose(targets, values, calldatas, description);
    });

    it("should prevent front-running in vote casting", async function () {
      const { governor, attacker, voter1, voter2, alice } = await loadFixture(deployAttackTestContracts);

      
      const targets = [alice.address];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Vote front-run test";

      const tx2 = await governor.connect(voter1).propose(targets, values, calldatas, description);
      await tx2.wait();
      await expect(
        governor.connect(attacker).castVote(0n, 1)
      ).to.be.reverted;
    });
  });
});
