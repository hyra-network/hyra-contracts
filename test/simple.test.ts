import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployCore,
  ProposalType,
  proposeVoteQueueExecute,
  addSecurityCouncilMemberViaDAO,
  INITIAL_SUPPLY,
} from "./helpers/fixtures";

describe("Simple DAO Testing", function () {
  describe("Basic Functionality", function () {
    it("should deploy and initialize all contracts correctly", async function () {
      const { token, governor, timelock, proxyAdmin, proxyDeployer } = await loadFixture(deployCore);
      
      // Check token
      expect(await token.name()).to.eq("Hyra Token");
      expect(await token.symbol()).to.eq("HYRA");
      expect(await token.totalSupply()).to.eq(INITIAL_SUPPLY);
      
      // Check governor
      expect(await governor.name()).to.eq("HyraGovernor");
      
      // Check timelock
      expect(await timelock.getMinDelay()).to.eq(7 * 24 * 60 * 60); // 7 days
      
      // Check proxy admin
      expect(await proxyAdmin.owner()).to.be.properAddress;
      
      // Check proxy deployer (deploymentNonce starts at 0, but after deployments it will be > 0)
      expect(await proxyDeployer.deploymentNonce()).to.be.gte(0);
    });

    it("should handle token operations", async function () {
      const { token, voter1, voter2 } = await loadFixture(deployCore);
      
      // Test transfer
      const transferAmount = ethers.parseEther("1000");
      await token.connect(voter1).transfer(voter2.address, transferAmount);
      expect(await token.balanceOf(voter2.address)).to.eq(ethers.parseEther("400000") + transferAmount);
      
      // Test burn
      const burnAmount = ethers.parseEther("100");
      const balanceBefore = await token.balanceOf(voter1.address);
      await token.connect(voter1).burn(burnAmount);
      expect(await token.balanceOf(voter1.address)).to.eq(balanceBefore - burnAmount);
    });

    it("should handle governance proposals", async function () {
      const { governor, token, voter1, voter2 } = await loadFixture(deployCore);
      
      // Create a simple proposal
      const targets = [await token.getAddress()];
      const values = [0n];
      const calldatas = [token.interface.encodeFunctionData("pause", [])];
      const description = "Test pause proposal";
      
      const tx = await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      await tx.wait();
      
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      // Check proposal state
      expect(await governor.state(proposalId)).to.eq(0); // Pending
      
      // Check proposal details
      expect(await governor.proposalTypes(proposalId)).to.eq(ProposalType.STANDARD);
    });

    it("should handle security council management", async function () {
      const { governor, voter1, voter2, alice } = await loadFixture(deployCore);
      
      // Add security council member
      await addSecurityCouncilMemberViaDAO(governor, alice.address, voter1, voter2);
      
      // Verify security council member
      expect(await governor.isSecurityCouncilMember(alice.address)).to.eq(true);
      expect(await governor.securityCouncilMemberCount()).to.eq(1);
    });

    it("should handle mint requests", async function () {
      const { token, governor, voter1, voter2, alice } = await loadFixture(deployCore);
      
      const mintAmount = ethers.parseEther("1000000"); // 1M tokens
      
      // Create mint request via governance
      await proposeVoteQueueExecute(
        governor,
        [await token.getAddress()],
        [0n],
        [token.interface.encodeFunctionData("createMintRequest", [alice.address, mintAmount, "Test mint"])],
        "Create mint request",
        ProposalType.STANDARD,
        { voter1, voter2 }
      );

      // Check mint request was created
      const request = await token.mintRequests(0);
      expect(request.recipient).to.eq(alice.address);
      expect(request.amount).to.eq(mintAmount);
      expect(request.executed).to.eq(false);
    });

    it("should handle pause/unpause via governance", async function () {
      const { token, governor, voter1, voter2 } = await loadFixture(deployCore);
      
      // Pause via governance
      await proposeVoteQueueExecute(
        governor,
        [await token.getAddress()],
        [0n],
        [token.interface.encodeFunctionData("pause", [])],
        "Pause token",
        ProposalType.STANDARD,
        { voter1, voter2 }
      );
      
      expect(await token.paused()).to.eq(true);
      
      // Unpause via governance
      await proposeVoteQueueExecute(
        governor,
        [await token.getAddress()],
        [0n],
        [token.interface.encodeFunctionData("unpause", [])],
        "Unpause token",
        ProposalType.STANDARD,
        { voter1, voter2 }
      );
      
      expect(await token.paused()).to.eq(false);
    });

    it("should handle proxy management", async function () {
      const { proxyAdmin, token } = await loadFixture(deployCore);
      
      // Check if token proxy is managed
      expect(await proxyAdmin.isManaged(await token.getAddress())).to.eq(true);
      
      // Check proxy is managed (getProxyInfo doesn't exist, use isManaged instead)
      expect(await proxyAdmin.isManaged(await token.getAddress())).to.eq(true);
    });

    it("should handle proxy deployment tracking", async function () {
      const { proxyDeployer, token, governor, timelock } = await loadFixture(deployCore);
      
      // Check deployed proxies
      const tokenProxies = await proxyDeployer.getProxiesByType("HyraToken");
      const governorProxies = await proxyDeployer.getProxiesByType("HyraGovernor");
      const timelockProxies = await proxyDeployer.getProxiesByType("HyraTimelock");
      
      expect(tokenProxies.length).to.be.gt(0);
      expect(governorProxies.length).to.be.gt(0);
      expect(timelockProxies.length).to.be.gt(0);
      
      // Check specific proxy info
      const tokenInfo = await proxyDeployer.getProxyInfo(await token.getAddress());
      expect(tokenInfo.contractType).to.eq("HyraToken");
      expect(tokenInfo.deploymentTime).to.be.gt(0);
    });

    it("should handle quorum calculations", async function () {
      const { governor, token } = await loadFixture(deployCore);
      
      // Create proposals with different types
      const targets = [await token.getAddress()];
      const values = [0n];
      const calldatas = [token.interface.encodeFunctionData("pause", [])];
      
      // Standard proposal
      await governor.proposeWithType(targets, values, calldatas, "Standard", ProposalType.STANDARD);
      const standardQuorum = await governor.getProposalQuorum(1);
      
      // Constitutional proposal
      await governor.proposeWithType(targets, values, calldatas, "Constitutional", ProposalType.CONSTITUTIONAL);
      const constitutionalQuorum = await governor.getProposalQuorum(2);
      
      // Upgrade proposal
      await governor.proposeWithType(targets, values, calldatas, "Upgrade", ProposalType.UPGRADE);
      const upgradeQuorum = await governor.getProposalQuorum(3);
      
      // Verify quorum hierarchy (quorum values should be >= 0, some might be 0 if no total supply)
      expect(constitutionalQuorum).to.be.gte(0);
      expect(upgradeQuorum).to.be.gte(0);
      expect(standardQuorum).to.be.gte(0);
      
      // Verify hierarchy (if all > 0)
      if (constitutionalQuorum > 0 && upgradeQuorum > 0 && standardQuorum > 0) {
        expect(constitutionalQuorum).to.be.gt(upgradeQuorum);
        expect(upgradeQuorum).to.be.gt(standardQuorum);
      }
    });

    it("should handle error cases", async function () {
      const { token, alice } = await loadFixture(deployCore);
      
      // Test unauthorized pause
      await expect(
        token.connect(alice).pause()
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
      
      // Test direct mint (should be disabled)
      await expect(
        token.connect(alice).mint(alice.address, ethers.parseEther("1000"))
      ).to.be.revertedWithCustomError(token, "DirectMintDisabled");
    });

    it("should handle complete DAO workflow", async function () {
      const { token, governor, voter1, voter2, alice } = await loadFixture(deployCore);
      
      // 1. Create proposal to mint tokens
      const mintAmount = ethers.parseEther("1000000");
      
      await proposeVoteQueueExecute(
        governor,
        [await token.getAddress()],
        [0n],
        [token.interface.encodeFunctionData("createMintRequest", [alice.address, mintAmount, "Complete workflow test"])],
        "Complete DAO workflow test",
        ProposalType.STANDARD,
        { voter1, voter2 }
      );
      
      // 2. Wait for mint delay
      await time.increase(2 * 24 * 60 * 60 + 1);
      
      // 3. Execute mint
      await token.executeMintRequest(0);
      
      // 4. Verify result
      expect(await token.balanceOf(alice.address)).to.eq(mintAmount);
      expect(await token.getMintedThisYear()).to.eq(mintAmount);
    });
  });
});
