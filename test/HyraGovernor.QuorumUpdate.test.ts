import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { deployCore, ProposalType, proposeVoteQueueExecute } from "./helpers/fixtures";

// Helper function to update quorum via governance proposal
async function updateQuorumViaProposal(
  governor: any,
  functionName: string,
  newValue: bigint,
  voter1: any,
  voter2: any
) {
  const targets = [await governor.getAddress()];
  const values = [0n];
  const calldatas = [governor.interface.encodeFunctionData(functionName, [newValue])];
  const description = `Update ${functionName} to ${newValue}`;

  await proposeVoteQueueExecute(
    governor,
    targets,
    values,
    calldatas,
    description,
    ProposalType.STANDARD,
    { voter1, voter2 }
  );
}

// Helper function to update all quorums via governance proposal
async function updateAllQuorumsViaProposal(
  governor: any,
  standard: bigint,
  emergency: bigint,
  upgrade: bigint,
  constitutional: bigint,
  voter1: any,
  voter2: any
) {
  const targets = [await governor.getAddress()];
  const values = [0n];
  const calldatas = [governor.interface.encodeFunctionData("setAllQuorums", [standard, emergency, upgrade, constitutional])];
  const description = `Update all quorums`;

  await proposeVoteQueueExecute(
    governor,
    targets,
    values,
    calldatas,
    description,
    ProposalType.STANDARD,
    { voter1, voter2 }
  );
}

describe("HyraGovernor - Quorum Update Tests", function () {
  describe("Initial Quorum Values", function () {
    it("should initialize with default quorum values", async function () {
      const { governor } = await loadFixture(deployCore);

      // Check default values
      expect(await governor.standardQuorum()).to.equal(1000n); // 10%
      expect(await governor.emergencyQuorum()).to.equal(2000n); // 20%
      expect(await governor.upgradeQuorum()).to.equal(2500n); // 25%
      expect(await governor.constitutionalQuorum()).to.equal(3000n); // 30%
    });

    it("should validate quorum hierarchy on initialization", async function () {
      const { governor } = await loadFixture(deployCore);

      const isValid = await governor.validateQuorumHierarchy();
      expect(isValid).to.be.true;
    });

    it("should return correct quorum percentage for each proposal type", async function () {
      const { governor } = await loadFixture(deployCore);

      expect(await governor.getQuorumPercentage(ProposalType.STANDARD)).to.equal(1000n);
      expect(await governor.getQuorumPercentage(ProposalType.EMERGENCY)).to.equal(2000n);
      expect(await governor.getQuorumPercentage(ProposalType.UPGRADE)).to.equal(2500n);
      expect(await governor.getQuorumPercentage(ProposalType.CONSTITUTIONAL)).to.equal(3000n);
    });
  });

  describe("Update Standard Quorum", function () {
    it("should allow governance to update standard quorum via proposal", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const newQuorum = 1200n; // 12%
      const oldQuorum = await governor.standardQuorum();

      // Update via governance proposal
      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setStandardQuorum", [newQuorum])];
      const description = "Update standard quorum to 12%";

      // Use helper function to propose, vote, queue, and execute
      await expect(
        proposeVoteQueueExecute(
          governor,
          targets,
          values,
          calldatas,
          description,
          ProposalType.STANDARD,
          { voter1, voter2 }
        )
      ).to.not.be.reverted;

      expect(await governor.standardQuorum()).to.equal(newQuorum);
    });

    it("should revert if non-governance tries to update standard quorum", async function () {
      const { governor, voter1 } = await loadFixture(deployCore);

      const newQuorum = 1200n;

      await expect(
        governor.connect(voter1).setStandardQuorum(newQuorum)
      ).to.be.reverted;
    });

    it("should revert if standard quorum violates hierarchy (>= emergency)", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const emergencyQuorum = await governor.emergencyQuorum();
      const invalidQuorum = emergencyQuorum; // Equal to emergency

      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setStandardQuorum", [invalidQuorum])];
      const description = "Invalid quorum update";

      // Try to propose and execute - should fail during execution
      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(10);
      await governor.queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      // Execution should revert
      await expect(
        governor.execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "QuorumHierarchyViolated");
    });

    it("should revert if standard quorum is below minimum", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const invalidQuorum = 50n; // Below MINIMUM_QUORUM (100)

      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setStandardQuorum", [invalidQuorum])];
      const description = "Invalid quorum below minimum";

      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(10);
      await governor.queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        governor.execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "InvalidQuorumValue");
    });

    it("should revert if standard quorum exceeds 100%", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const invalidQuorum = 10001n; // Above 100%

      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setStandardQuorum", [invalidQuorum])];
      const description = "Invalid quorum above 100%";

      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(10);
      await governor.queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        governor.execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "InvalidQuorumValue");
    });
  });

  describe("Update Emergency Quorum", function () {
    it("should allow governance to update emergency quorum", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const newQuorum = 2200n; // 22%
      const oldQuorum = await governor.emergencyQuorum();

      await updateQuorumViaProposal(governor, "setEmergencyQuorum", newQuorum, voter1, voter2);

      expect(await governor.emergencyQuorum()).to.equal(newQuorum);
    });

    it("should revert if emergency quorum violates hierarchy", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const standardQuorum = await governor.standardQuorum();
      const upgradeQuorum = await governor.upgradeQuorum();

      // Try to set equal to standard - should fail during execution
      const targets1 = [await governor.getAddress()];
      const values1 = [0n];
      const calldatas1 = [governor.interface.encodeFunctionData("setEmergencyQuorum", [standardQuorum])];
      const description1 = "Invalid emergency quorum";

      await governor.proposeWithType(targets1, values1, calldatas1, description1, ProposalType.STANDARD);
      const proposalId1 = await governor.hashProposal(targets1, values1, calldatas1, ethers.keccak256(ethers.toUtf8Bytes(description1)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId1, 1);
      await governor.connect(voter2).castVote(proposalId1, 1);
      await mine(10);
      await governor.queue(targets1, values1, calldatas1, ethers.keccak256(ethers.toUtf8Bytes(description1)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        governor.execute(targets1, values1, calldatas1, ethers.keccak256(ethers.toUtf8Bytes(description1)))
      ).to.be.revertedWithCustomError(governor, "QuorumHierarchyViolated");
    });

    it("should allow emergency quorum between standard and upgrade", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const standardQuorum = await governor.standardQuorum();
      const upgradeQuorum = await governor.upgradeQuorum();
      const validQuorum = (standardQuorum + upgradeQuorum) / 2n;

      await updateQuorumViaProposal(governor, "setEmergencyQuorum", validQuorum, voter1, voter2);

      expect(await governor.emergencyQuorum()).to.equal(validQuorum);
    });
  });

  describe("Update Upgrade Quorum", function () {
    it("should allow governance to update upgrade quorum", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const newQuorum = 2700n; // 27%

      await updateQuorumViaProposal(governor, "setUpgradeQuorum", newQuorum, voter1, voter2);

      expect(await governor.upgradeQuorum()).to.equal(newQuorum);
    });

    it("should revert if upgrade quorum violates hierarchy", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const emergencyQuorum = await governor.emergencyQuorum();

      // Try to set equal to emergency - should fail during execution
      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setUpgradeQuorum", [emergencyQuorum])];
      const description = "Invalid upgrade quorum";

      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(10);
      await governor.queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        governor.execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "QuorumHierarchyViolated");
    });
  });

  describe("Update Constitutional Quorum", function () {
    it("should allow governance to update constitutional quorum", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const newQuorum = 3200n; // 32%

      await updateQuorumViaProposal(governor, "setConstitutionalQuorum", newQuorum, voter1, voter2);

      expect(await governor.constitutionalQuorum()).to.equal(newQuorum);
    });

    it("should revert if constitutional quorum violates hierarchy", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const upgradeQuorum = await governor.upgradeQuorum();

      // Try to set equal to upgrade - should fail during execution
      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setConstitutionalQuorum", [upgradeQuorum])];
      const description = "Invalid constitutional quorum";

      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(10);
      await governor.queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        governor.execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "QuorumHierarchyViolated");
    });

    it("should allow constitutional quorum above upgrade", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const upgradeQuorum = await governor.upgradeQuorum();
      const validQuorum = upgradeQuorum + 100n;

      await updateQuorumViaProposal(governor, "setConstitutionalQuorum", validQuorum, voter1, voter2);

      expect(await governor.constitutionalQuorum()).to.equal(validQuorum);
    });
  });

  describe("Update All Quorums", function () {
    it("should allow governance to update all quorums at once", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const newStandard = 1200n;
      const newEmergency = 2200n;
      const newUpgrade = 2700n;
      const newConstitutional = 3200n;

      await updateAllQuorumsViaProposal(
        governor,
        newStandard,
        newEmergency,
        newUpgrade,
        newConstitutional,
        voter1,
        voter2
      );

      // Verify all values updated
      expect(await governor.standardQuorum()).to.equal(newStandard);
      expect(await governor.emergencyQuorum()).to.equal(newEmergency);
      expect(await governor.upgradeQuorum()).to.equal(newUpgrade);
      expect(await governor.constitutionalQuorum()).to.equal(newConstitutional);
    });

    it("should revert if hierarchy is violated in setAllQuorums", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      // Try to set invalid hierarchy (standard >= emergency) - should fail during execution
      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setAllQuorums", [2000n, 2000n, 2500n, 3000n])];
      const description = "Invalid quorum hierarchy";

      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(10);
      await governor.queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        governor.execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "QuorumHierarchyViolated");
    });

    it("should revert if any quorum value is invalid in setAllQuorums", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      // Try with value below minimum - should fail during execution
      const targets = [await governor.getAddress()];
      const values = [0n];
      const calldatas = [governor.interface.encodeFunctionData("setAllQuorums", [50n, 2000n, 2500n, 3000n])];
      const description = "Invalid quorum value";

      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      
      await mine(1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(10);
      await governor.queue(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(
        governor.execute(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)))
      ).to.be.revertedWithCustomError(governor, "InvalidQuorumValue");
    });

    it("should revert if non-governance tries to update all quorums", async function () {
      const { governor, voter1 } = await loadFixture(deployCore);

      await expect(
        governor.connect(voter1).setAllQuorums(1200n, 2200n, 2700n, 3200n)
      ).to.be.reverted;
    });
  });

  describe("Quorum Usage in Proposals", function () {
    it("should use updated quorum values for proposals", async function () {
      const { governor, token, voter1, voter2 } = await loadFixture(deployCore);

      // Update standard quorum
      const newStandardQuorum = 1500n; // 15%
      await updateQuorumViaProposal(governor, "setStandardQuorum", newStandardQuorum, voter1, voter2);

      // Wait a few blocks to ensure snapshot is in the past
      await mine(5);

      // Create a standard proposal
      const targets = [await token.getAddress()];
      const values = [0n];
      const calldatas = [token.interface.encodeFunctionData("pause", [])];
      const description = "Test proposal with updated quorum";

      await governor.proposeWithType(targets, values, calldatas, description, ProposalType.STANDARD);
      const proposalId = await governor.hashProposal(targets, values, calldatas, ethers.keccak256(ethers.toUtf8Bytes(description)));

      // Wait for voting delay + 1 block to ensure snapshot is in the past
      // Voting delay is 1 block, so we need at least 2 blocks after proposal
      await mine(2);

      // Get proposal quorum
      const proposalQuorum = await governor.getProposalQuorum(proposalId);
      const snapshot = await governor.proposalSnapshot(proposalId);
      
      // Get current block to ensure snapshot is in the past
      const currentBlock = await ethers.provider.getBlockNumber();
      if (snapshot >= currentBlock) {
        // If snapshot is still in future, wait more
        await mine(snapshot - currentBlock + 1);
      }
      
      const supply = await token.getPastTotalSupply(snapshot);
      const expectedQuorum = (supply * newStandardQuorum) / 10000n;

      expect(proposalQuorum).to.equal(expectedQuorum);
    });

    it("should use updated quorum values for different proposal types", async function () {
      const { governor, token, voter1, voter2 } = await loadFixture(deployCore);

      // Update all quorums
      await updateAllQuorumsViaProposal(governor, 1200n, 2200n, 2700n, 3200n, voter1, voter2);

      // Verify getQuorumPercentage returns updated values
      expect(await governor.getQuorumPercentage(ProposalType.STANDARD)).to.equal(1200n);
      expect(await governor.getQuorumPercentage(ProposalType.EMERGENCY)).to.equal(2200n);
      expect(await governor.getQuorumPercentage(ProposalType.UPGRADE)).to.equal(2700n);
      expect(await governor.getQuorumPercentage(ProposalType.CONSTITUTIONAL)).to.equal(3200n);
    });
  });

  describe("Edge Cases", function () {
    it("should maintain hierarchy after multiple updates", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      // Update standard quorum
      await updateQuorumViaProposal(governor, "setStandardQuorum", 1100n, voter1, voter2);
      expect(await governor.validateQuorumHierarchy()).to.be.true;

      // Update emergency quorum
      await updateQuorumViaProposal(governor, "setEmergencyQuorum", 2100n, voter1, voter2);
      expect(await governor.validateQuorumHierarchy()).to.be.true;

      // Update upgrade quorum
      await updateQuorumViaProposal(governor, "setUpgradeQuorum", 2600n, voter1, voter2);
      expect(await governor.validateQuorumHierarchy()).to.be.true;

      // Update constitutional quorum
      await updateQuorumViaProposal(governor, "setConstitutionalQuorum", 3100n, voter1, voter2);
      expect(await governor.validateQuorumHierarchy()).to.be.true;

      // Final verification
      expect(await governor.standardQuorum()).to.equal(1100n);
      expect(await governor.emergencyQuorum()).to.equal(2100n);
      expect(await governor.upgradeQuorum()).to.equal(2600n);
      expect(await governor.constitutionalQuorum()).to.equal(3100n);
    });

    it("should allow setting quorum to minimum value", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      const MINIMUM_QUORUM = 100n; // 1%

      // Set standard to minimum (but need to ensure hierarchy)
      // We need to set others higher first
      await updateAllQuorumsViaProposal(
        governor,
        MINIMUM_QUORUM,
        MINIMUM_QUORUM + 100n,
        MINIMUM_QUORUM + 200n,
        MINIMUM_QUORUM + 300n,
        voter1,
        voter2
      );

      expect(await governor.standardQuorum()).to.equal(MINIMUM_QUORUM);
    });

    it("should allow setting quorum close to maximum", async function () {
      const { governor, voter1, voter2 } = await loadFixture(deployCore);

      // Set constitutional to high value (but still maintain hierarchy)
      await updateAllQuorumsViaProposal(
        governor,
        5000n, // 50%
        6000n, // 60%
        7000n, // 70%
        8000n, // 80%
        voter1,
        voter2
      );

      expect(await governor.constitutionalQuorum()).to.equal(8000n);
      expect(await governor.validateQuorumHierarchy()).to.be.true;
    });
  });
});

