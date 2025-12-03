/**
 * npx hardhat test test/HyraGovernor.Quorum.test.ts
 * ============================================================================
 * TEST SUITE ĐẦY ĐỦ CHO QUORUM IMPLEMENTATION - HyraGovernor Contract
 * ============================================================================
 * 
 * Test cases verify:
 * 1. Quorum constants: 500, 1000, 1500, 2500, 100
 * 2. Quorum hierarchy validation
 * 3. Quorum calculation for each proposal type
 * 4. Helper functions (getQuorumPercentage, getProposalQuorum)
 * 
 * Total: 15 test cases
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine } from "@nomicfoundation/hardhat-network-helpers";
import { HyraGovernor, HyraToken, HyraTimelock } from "../typechain-types";
import {
  deployCore,
  ProposalType,
  INITIAL_SUPPLY,
  VOTING_DELAY,
  VOTING_PERIOD,
  TL_MIN_DELAY,
  BASE_QUORUM_PERCENT,
} from "./helpers/fixtures";

describe("HyraGovernor - Quorum Implementation", function () {
  // Helper function to deploy with privileged multisig wallet set in governor
  async function deployCoreWithPrivilegedMultisig() {
    const [deployer, voter1, voter2] = await ethers.getSigners();

    // Deploy ProposalForwarder to act as privileged multisig wallet
    const ProposalForwarder = await ethers.getContractFactory("ProposalForwarder");
    const privilegedMultisig = await ProposalForwarder.deploy(deployer.address);
    await privilegedMultisig.waitForDeployment();
    const privilegedMultisigAddress = await privilegedMultisig.getAddress();

    // Deploy infrastructure using similar pattern as deployCore
    const ProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(deployer.address);
    await proxyAdmin.waitForDeployment();

    const ProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await ProxyDeployer.deploy();
    await proxyDeployer.waitForDeployment();

    // Deploy Timelock
    const TimelockImpl = await ethers.getContractFactory("HyraTimelock");
    const timelockImpl = await TimelockImpl.deploy();
    await timelockImpl.waitForDeployment();

    const tlInit = TimelockImpl.interface.encodeFunctionData("initialize", [
      TL_MIN_DELAY,
      [],
      [ethers.ZeroAddress],
      deployer.address,
    ]);

    const timelockProxyAddr = await proxyDeployer.deployProxy.staticCall(
      await timelockImpl.getAddress(),
      await proxyAdmin.getAddress(),
      tlInit,
      "HyraTimelock"
    );
    await (await proxyDeployer.deployProxy(
      await timelockImpl.getAddress(),
      await proxyAdmin.getAddress(),
      tlInit,
      "HyraTimelock"
    )).wait();
    const timelock = await ethers.getContractAt("HyraTimelock", timelockProxyAddr);

    // Deploy Token
    const TokenImpl = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await TokenImpl.deploy();
    await tokenImpl.waitForDeployment();

    const tokenProxy = await proxyDeployer.deployProxy.staticCall(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      "0x",
      "HyraToken"
    );
    await (await proxyDeployer.deployProxy(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      "0x",
      "HyraToken"
    )).wait();
    const token = await ethers.getContractAt("HyraToken", tokenProxy);

    // Deploy distribution wallets
    const MockDistributionWallet = await ethers.getContractFactory("MockDistributionWallet");
    const distributionWallets = [];
    for (let i = 0; i < 6; i++) {
      const wallet = await MockDistributionWallet.deploy(deployer.address);
      await wallet.waitForDeployment();
      distributionWallets.push(await wallet.getAddress());
    }

    await token.setDistributionConfig(
      distributionWallets[0],
      distributionWallets[1],
      distributionWallets[2],
      distributionWallets[3],
      distributionWallets[4],
      distributionWallets[5]
    );

    await token.initialize(
      "HYRA",
      "HYRA",
      INITIAL_SUPPLY,
      voter1.address,
      timelockProxyAddr,
      privilegedMultisigAddress
    );

    await (await proxyAdmin.addProxy(tokenProxy, "HyraToken")).wait();
    await (await proxyAdmin.transferOwnership(timelockProxyAddr)).wait();

    // Deploy Governor WITH privileged multisig wallet
    const GovernorImpl = await ethers.getContractFactory("HyraGovernor");
    const governorImpl = await GovernorImpl.deploy();
    await governorImpl.waitForDeployment();

    const govInit = GovernorImpl.interface.encodeFunctionData("initialize", [
      tokenProxy,
      timelockProxyAddr,
      VOTING_DELAY,
      VOTING_PERIOD,
      0n,
      BASE_QUORUM_PERCENT,
      privilegedMultisigAddress, // privilegedMultisigWallet set in governor
    ]);

    const governorProxy = await proxyDeployer.deployProxy.staticCall(
      await governorImpl.getAddress(),
      await proxyAdmin.getAddress(),
      govInit,
      "HyraGovernor"
    );
    await (await proxyDeployer.deployProxy(
      await governorImpl.getAddress(),
      await proxyAdmin.getAddress(),
      govInit,
      "HyraGovernor"
    )).wait();
    const governor = await ethers.getContractAt("HyraGovernor", governorProxy);

    // Setup roles
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
    await (await timelock.grantRole(PROPOSER_ROLE, governorProxy)).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress)).wait();
    await (await timelock.grantRole(PROPOSER_ROLE, timelockProxyAddr)).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, timelockProxyAddr)).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, deployer.address)).wait();
    await (await timelock.revokeRole(ADMIN_ROLE, deployer.address)).wait();

    // Setup voting power
    const distributionWallet1 = await ethers.getContractAt("MockDistributionWallet", distributionWallets[0]);
    await (await distributionWallet1.connect(deployer).forwardTokens(tokenProxy, voter1.address, ethers.parseEther("300000"))).wait();
    await (await distributionWallet1.connect(deployer).forwardTokens(tokenProxy, voter2.address, ethers.parseEther("200000"))).wait();
    
    await (await token.connect(voter1).delegate(voter1.address)).wait();
    await (await token.connect(voter2).delegate(voter2.address)).wait();
    await mine(1);

    return {
      deployer,
      voter1,
      voter2,
      timelock,
      governor,
      token,
      privilegedMultisig,
      privilegedMultisigAddress,
    };
  }

  describe("Quorum Constants", function () {
    it("1. Should have STANDARD_QUORUM = 500 (5%)", async function () {
      const { governor } = await loadFixture(deployCore);
      expect(await governor.STANDARD_QUORUM()).to.equal(500);
    });

    it("2. Should have EMERGENCY_QUORUM = 1000 (10%)", async function () {
      const { governor } = await loadFixture(deployCore);
      expect(await governor.EMERGENCY_QUORUM()).to.equal(1000);
    });

    it("3. Should have UPGRADE_QUORUM = 1500 (15%)", async function () {
      const { governor } = await loadFixture(deployCore);
      expect(await governor.UPGRADE_QUORUM()).to.equal(1500);
    });

    it("4. Should have CONSTITUTIONAL_QUORUM = 2500 (25%)", async function () {
      const { governor } = await loadFixture(deployCore);
      expect(await governor.CONSTITUTIONAL_QUORUM()).to.equal(2500);
    });

    it("5. Should have MINIMUM_QUORUM = 100 (1%)", async function () {
      const { governor } = await loadFixture(deployCore);
      expect(await governor.MINIMUM_QUORUM()).to.equal(100);
    });
  });

  describe("Quorum Hierarchy Validation", function () {
    it("6. Should validate quorum hierarchy correctly", async function () {
      const { governor } = await loadFixture(deployCore);
      expect(await governor.validateQuorumHierarchy()).to.be.true;
    });

    it("7. Should have STANDARD < EMERGENCY < UPGRADE < CONSTITUTIONAL", async function () {
      const { governor } = await loadFixture(deployCore);
      const standard = await governor.STANDARD_QUORUM();
      const emergency = await governor.EMERGENCY_QUORUM();
      const upgrade = await governor.UPGRADE_QUORUM();
      const constitutional = await governor.CONSTITUTIONAL_QUORUM();

      expect(standard).to.be.lt(emergency);
      expect(emergency).to.be.lt(upgrade);
      expect(upgrade).to.be.lt(constitutional);
    });

    it("8. Should have MINIMUM_QUORUM < STANDARD_QUORUM", async function () {
      const { governor } = await loadFixture(deployCore);
      const minimum = await governor.MINIMUM_QUORUM();
      const standard = await governor.STANDARD_QUORUM();

      expect(minimum).to.be.lt(standard);
    });
  });

  describe("getQuorumPercentage()", function () {
    it("9. Should return correct percentage for STANDARD (500)", async function () {
      const { governor } = await loadFixture(deployCore);
      const percentage = await governor.getQuorumPercentage(ProposalType.STANDARD);
      expect(percentage).to.equal(500);
    });

    it("10. Should return correct percentage for EMERGENCY (1000)", async function () {
      const { governor } = await loadFixture(deployCore);
      const percentage = await governor.getQuorumPercentage(ProposalType.EMERGENCY);
      expect(percentage).to.equal(1000);
    });

    it("11. Should return correct percentage for CONSTITUTIONAL (2500)", async function () {
      const { governor } = await loadFixture(deployCore);
      const percentage = await governor.getQuorumPercentage(ProposalType.CONSTITUTIONAL);
      expect(percentage).to.equal(2500);
    });

    it("12. Should return correct percentage for UPGRADE (1500)", async function () {
      const { governor } = await loadFixture(deployCore);
      const percentage = await governor.getQuorumPercentage(ProposalType.UPGRADE);
      expect(percentage).to.equal(1500);
    });
  });

  describe("getProposalQuorum() - Quorum Calculation", function () {
    it("13. Should calculate correct quorum for STANDARD proposal", async function () {
      const { governor, token, voter1 } = await loadFixture(deployCore);

      // Create a STANDARD proposal
      const targets = [await token.getAddress()];
      const values = [0n];
      const calldatas = [token.interface.encodeFunctionData("transfer", [voter1.address, 0n])];
      const description = "Test STANDARD proposal";

      await governor.connect(voter1).proposeWithType(
        targets,
        values,
        calldatas,
        description,
        ProposalType.STANDARD
      );

      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      // Wait for voting delay to ensure proposal snapshot is set
      await mine(VOTING_DELAY + 1);

      // Get proposal quorum
      const requiredQuorum = await governor.getProposalQuorum(proposalId);

      // Calculate expected quorum: (totalSupply * STANDARD_QUORUM) / 10000
      const snapshot = await governor.proposalSnapshot(proposalId);
      const totalSupply = await token.getPastTotalSupply(snapshot);
      const expectedQuorum = (totalSupply * 500n) / 10000n;

      expect(requiredQuorum).to.equal(expectedQuorum);
    });

    it("14. Should calculate correct quorum for EMERGENCY proposal (first privileged type)", async function () {
      const { governor, token, deployer, privilegedMultisig } = await loadFixture(deployCoreWithPrivilegedMultisig);

      // Create an EMERGENCY proposal via ProposalForwarder
      const targets = [await token.getAddress()];
      const values = [0n];
      const calldatas = [token.interface.encodeFunctionData("transfer", [deployer.address, 0n])];
      const description = "Test EMERGENCY proposal";

      await privilegedMultisig.connect(deployer).proposeWithType(
        await governor.getAddress(),
        targets,
        values,
        calldatas,
        description,
        ProposalType.EMERGENCY
      );

      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(VOTING_DELAY + 1);

      // Get proposal quorum
      const requiredQuorum = await governor.getProposalQuorum(proposalId);

      // Calculate expected quorum: (totalSupply * EMERGENCY_QUORUM) / 10000
      const snapshot = await governor.proposalSnapshot(proposalId);
      const totalSupply = await token.getPastTotalSupply(snapshot);
      const expectedQuorum = (totalSupply * 1000n) / 10000n; // EMERGENCY = 10%

      expect(requiredQuorum).to.equal(expectedQuorum);
    });

    it("15. Should calculate correct quorum for UPGRADE proposal and apply MINIMUM_QUORUM protection", async function () {
      const { governor, token, deployer, privilegedMultisig } = await loadFixture(deployCoreWithPrivilegedMultisig);

      // Create an UPGRADE proposal via ProposalForwarder
      const targets = [await token.getAddress()];
      const values = [0n];
      const calldatas = [token.interface.encodeFunctionData("transfer", [deployer.address, 0n])];
      const description = "Test UPGRADE proposal";

      await privilegedMultisig.connect(deployer).proposeWithType(
        await governor.getAddress(),
        targets,
        values,
        calldatas,
        description,
        ProposalType.UPGRADE
      );

      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(VOTING_DELAY + 1);

      // Get proposal quorum
      const requiredQuorum = await governor.getProposalQuorum(proposalId);

      // Calculate expected quorum: (totalSupply * UPGRADE_QUORUM) / 10000
      const snapshot = await governor.proposalSnapshot(proposalId);
      const totalSupply = await token.getPastTotalSupply(snapshot);
      const expectedQuorum = (totalSupply * 1500n) / 10000n; // UPGRADE = 15%

      expect(requiredQuorum).to.equal(expectedQuorum);
      
      // Verify MINIMUM_QUORUM protection: quorum should be >= minimum
      const minimumQuorum = (totalSupply * 100n) / 10000n; // MINIMUM = 1%
      expect(requiredQuorum).to.be.gte(minimumQuorum);
    });
  });
});
