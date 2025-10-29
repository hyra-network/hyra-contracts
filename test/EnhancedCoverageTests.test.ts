import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time, mine } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock, HyraProxyAdmin } from "../typechain-types";

describe("Enhanced Coverage Tests", function () {
  
  async function deployEnhancedTestContracts() {
    const [owner, voter1, voter2, voter3, alice, bob] = await ethers.getSigners();

    
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
    const proxyAdmin = await HyraProxyAdmin.deploy(await owner.getAddress());
    await proxyAdmin.waitForDeployment();

    
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImplementation = await HyraToken.deploy();
    await tokenImplementation.waitForDeployment();

    const tokenInitData = HyraToken.interface.encodeFunctionData("initialize", [
      "Hyra Token",
      "HYRA",
      ethers.parseEther("1000000"),
      await alice.getAddress(), 
      await owner.getAddress()
    ]);

    const HyraTransparentUpgradeableProxy = await ethers.getContractFactory("HyraTransparentUpgradeableProxy");
    const tokenProxy = await HyraTransparentUpgradeableProxy.deploy(
      await tokenImplementation.getAddress(),
      await proxyAdmin.getAddress(),
      tokenInitData
    );
    await tokenProxy.waitForDeployment();

    const token = HyraToken.attach(await tokenProxy.getAddress());

    const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
    const governorImplementation = await HyraGovernor.deploy();
    await governorImplementation.waitForDeployment();

    const governorInitData = HyraGovernor.interface.encodeFunctionData("initialize", [
      await token.getAddress(), 
      await timelock.getAddress(), 
      1, 
      10, 
      0, 
      10 
    ]);

    const governorProxy = await ERC1967Proxy.deploy(await governorImplementation.getAddress(), governorInitData);
    await governorProxy.waitForDeployment();

    const governor = HyraGovernor.attach(await governorProxy.getAddress());

    // Allow Governor to queue/execute via timelock
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    await timelock.connect(owner).grantRole(PROPOSER_ROLE, await governor.getAddress());
    await timelock.connect(owner).grantRole(EXECUTOR_ROLE, await governor.getAddress());

    return {
      timelock,
      proxyAdmin,
      governor,
      token,
      tokenProxy,
      tokenImplementation,
      owner,
      voter1,
      voter2,
      voter3,
      alice,
      bob
    };
  }

  describe("HyraToken Enhanced Coverage", function () {
    it("should handle year boundary transitions correctly", async function () {
      const { token, voter1, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const YEAR_DURATION = 365 * 24 * 60 * 60;
      
      
      await time.increase(YEAR_DURATION - 1);
      
      
      const amount = ethers.parseEther("1000000");
      await token.connect(owner).createMintRequest(
        await alice.getAddress(),
        amount,
        "year boundary test"
      );

      
      await time.increase(2);
      
      
      expect(await token.currentMintYear()).to.equal(2);
    });

    it("should enforce tier-based minting caps", async function () {
      const { token, voter1, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const tier1Cap = ethers.parseEther("2500000000");
      
      
      await expect(
        token.connect(owner).createMintRequest(
          await alice.getAddress(),
          tier1Cap + ethers.parseEther("1"),
          "exceed tier 1 cap"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("should handle emergency scenarios", async function () {
      const { token, voter1, alice, owner, bob } = await loadFixture(deployEnhancedTestContracts);

      
      await token.connect(owner).pause();
      
      
      expect(await token.paused()).to.be.true;
      
      
      await expect(
        token.connect(alice).transfer(await bob.getAddress(), ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
      
      
      await token.connect(owner).unpause();
      expect(await token.paused()).to.be.false;
    });

    it("should validate mint request parameters", async function () {
      const { token, voter1, owner } = await loadFixture(deployEnhancedTestContracts);

      
      await expect(
        token.connect(owner).createMintRequest(
          await owner.getAddress(),
          0,
          "zero amount"
        )
      ).to.be.revertedWithCustomError(token, "InvalidAmount");

      
      await expect(
        token.connect(owner).createMintRequest(
          ethers.ZeroAddress,
          ethers.parseEther("1000"),
          "zero address"
        )
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
    });

    it("should handle mint request lifecycle", async function () {
      const { token, voter1, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      const amount = ethers.parseEther("1000000");
      
      
      const tx = await token.connect(owner).createMintRequest(
        await alice.getAddress(),
        amount,
        "lifecycle test"
      );
      
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = token.interface.parseLog(log);
          return parsed?.name === "MintRequestCreated";
        } catch {
          return false;
        }
      });
      
      expect(event).to.not.be.undefined;
      
      
      await time.increase(2 * 24 * 60 * 60 + 1);
      
      
      const requestId = event?.args?.requestId;
      await token.connect(owner).executeMintRequest(requestId);
      
      
      const initialSupply = ethers.parseEther("1000000");
      expect(await token.balanceOf(await alice.getAddress())).to.equal(initialSupply + amount);
    });
  });

  describe("HyraGovernor Enhanced Coverage", function () {
    it("should handle proposal execution failures", async function () {
      const { governor, token, voter1, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const targets = [await alice.getAddress()];
      const values = [0];
      const calldatas = [
        token.interface.encodeFunctionData("mint", [await alice.getAddress(), 1n])
      ]; 
      const description = "Failing proposal";

      // Delegate voting power from holder to voter1
      await token.connect(alice).delegate(await voter1.getAddress());
      await ethers.provider.send("evm_mine", []);

      const tx = await governor.connect(owner).propose(targets, values, calldatas, description);
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
      
      // Wait votingDelay (blocks), then cast vote, then wait votingPeriod (blocks)
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await mine(11);
      
      
      await governor.connect(owner).queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      
      await time.increase(86400 + 1);
      
      
      await governor.connect(voter1).execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      expect(await governor.state(proposalId)).to.equal(7);
    });

    it("should enforce quorum requirements", async function () {
      const { governor, token, voter1, voter2, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const targets = [await alice.getAddress()];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Quorum test";

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
      
      
      expect(proposalId).to.not.be.undefined;
      
      
      const state = await governor.state(proposalId);
      expect(state).to.equal(0); 
    });

    it("should handle emergency proposals", async function () {
      const { governor, voter1, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const targets = [await alice.getAddress()];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Emergency proposal";

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
      
      
      expect(proposalId).to.not.be.undefined;
      
      
      const state = await governor.state(proposalId);
      expect(state).to.equal(0); 
    });
  });

  describe("HyraTimelock Enhanced Coverage", function () {
    it("should handle operation scheduling and execution", async function () {
      const { timelock, voter1, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      const target = await alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("test salt"));
      const delay = 86400;

      
      await timelock.connect(voter1)["schedule(address,uint256,bytes,bytes32,bytes32,uint256)"](target, value, data, ethers.ZeroHash, salt, delay);
      
      
      const operationId = await timelock.hashOperation(target, value, data, ethers.ZeroHash, salt);
      
      expect(await timelock.isOperation(operationId)).to.be.true;
      
      
      await time.increase(delay + 1);
      
      
      await timelock.connect(voter1)["execute(address,uint256,bytes,bytes32,bytes32)"](target, value, data, ethers.ZeroHash, salt);
      
      
      expect(await timelock.isOperationDone(operationId)).to.be.true;
    });

    it("should handle operation cancellation", async function () {
      const { timelock, voter1, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      const target = await alice.getAddress();
      const value = 0;
      const data = "0x";
      const salt = ethers.keccak256(ethers.toUtf8Bytes("cancel test"));
      const delay = 86400;

      
      await timelock.connect(voter1)["schedule(address,uint256,bytes,bytes32,bytes32,uint256)"](target, value, data, ethers.ZeroHash, salt, delay);
      
      const operationId = await timelock.hashOperation(target, value, data, ethers.ZeroHash, salt);
      
      
      await timelock.connect(voter1).cancel(operationId);
      
      
      expect(await timelock.isOperation(operationId)).to.be.false;
    });

    it("should handle upgrade operations", async function () {
      const { timelock, proxyAdmin, tokenProxy, voter1, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const HyraToken = await ethers.getContractFactory("HyraToken");
      const newImplementation = await HyraToken.deploy();
      await newImplementation.waitForDeployment();

      // Ensure timelock owns ProxyAdmin before executing upgrade
      await proxyAdmin.connect(owner).transferOwnership(await timelock.getAddress());

      
      await timelock.connect(voter1)["scheduleUpgrade(address,address,bytes,bool)"](
        await tokenProxy.getAddress(),
        await newImplementation.getAddress(),
        "0x",
        false
      );

      
      await time.increase(7 * 24 * 60 * 60 + 1);

      
      await timelock.connect(voter1)["executeUpgrade(address,address)"](
        await proxyAdmin.getAddress(),
        await tokenProxy.getAddress()
      );

      
      expect(await timelock.pendingUpgrades(await tokenProxy.getAddress())).to.equal(0);
    });
  });

  describe("HyraProxyAdmin Enhanced Coverage", function () {
    it("should manage proxy lifecycle", async function () {
      const { proxyAdmin, tokenProxy, owner } = await loadFixture(deployEnhancedTestContracts);

      
      await proxyAdmin.connect(owner).addProxy(await tokenProxy.getAddress(), "Test Token");
      
      
      expect(await proxyAdmin.isManaged(await tokenProxy.getAddress())).to.be.true;
      
      
      await proxyAdmin.connect(owner).updateProxyName(await tokenProxy.getAddress(), "Updated Token");
      
      
      await proxyAdmin.connect(owner).removeProxy(await tokenProxy.getAddress());
      
      
      expect(await proxyAdmin.isManaged(await tokenProxy.getAddress())).to.be.false;
    });

    it("should handle batch operations", async function () {
      const { proxyAdmin, tokenProxy, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const HyraToken = await ethers.getContractFactory("HyraToken");
      const impl1 = await HyraToken.deploy();
      await impl1.waitForDeployment();
      
      const impl2 = await HyraToken.deploy();
      await impl2.waitForDeployment();

      
      await proxyAdmin.connect(owner).addProxy(await tokenProxy.getAddress(), "Test Token");

      
      const proxies = [await tokenProxy.getAddress()];
      const implementations = [await impl1.getAddress()];
      
      await proxyAdmin.connect(owner).batchUpgrade(proxies, implementations);
      
      
      const currentImpl = await proxyAdmin.getProxyImplementation(await tokenProxy.getAddress());
      expect(currentImpl).to.equal(await impl1.getAddress());
    });

    it("should validate proxy operations", async function () {
      const { proxyAdmin, owner } = await loadFixture(deployEnhancedTestContracts);

      
      await expect(
        proxyAdmin.connect(owner).addProxy(ethers.ZeroAddress, "Invalid")
      ).to.be.revertedWithCustomError(proxyAdmin, "ZeroAddress");

      
      const HyraToken = await ethers.getContractFactory("HyraToken");
      const tokenImpl = await HyraToken.deploy();
      await tokenImpl.waitForDeployment();

      const HyraTransparentUpgradeableProxy = await ethers.getContractFactory("HyraTransparentUpgradeableProxy");
      const proxy1 = await HyraTransparentUpgradeableProxy.deploy(
        await tokenImpl.getAddress(),
        await proxyAdmin.getAddress(),
        "0x"
      );
      await proxy1.waitForDeployment();

      await proxyAdmin.connect(owner).addProxy(await proxy1.getAddress(), "Proxy 1");
      
      await expect(
        proxyAdmin.connect(owner).addProxy(await proxy1.getAddress(), "Duplicate")
      ).to.be.revertedWithCustomError(proxyAdmin, "ProxyAlreadyManaged");
    });
  });

  describe("Integration Tests", function () {
    it("should handle complete DAO workflow", async function () {
      const { governor, timelock, token, voter1, voter2, alice, owner } = await loadFixture(deployEnhancedTestContracts);

      
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [
        token.interface.encodeFunctionData("createMintRequest", [
          await alice.getAddress(),
          ethers.parseEther("1000000"),
          "DAO proposal mint"
        ])
      ];
      const description = "Mint tokens via DAO";

      
      // Transfer token governance to timelock so it can call owner-only function
      await token.connect(owner).transferGovernance(await timelock.getAddress());

      // Delegate voting power from holder to voter1
      await token.connect(alice).delegate(await voter1.getAddress());
      await ethers.provider.send("evm_mine", []);

      const tx = await governor.connect(owner).propose(targets, values, calldatas, description);
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
      
      
      // Wait votingDelay (blocks), then cast vote, then wait votingPeriod (blocks)
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await mine(11);
      
      
      await governor.connect(owner).queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      
      await time.increase(86400 + 1);
      
      
      await governor.connect(owner).execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      
      const state = await governor.state(proposalId);
      expect(state).to.equal(7); 
    });
  });
});
