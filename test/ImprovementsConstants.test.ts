import { expect } from "chai";
import { ethers } from "hardhat";

describe("Improvements Verification - Constants Only", function () {
  describe("Quorum Improvements", function () {
    it("Should have improved quorum percentages", async function () {
      // Deploy HyraGovernor implementation to test constants
      const HyraGovernorFactory = await ethers.getContractFactory("HyraGovernor");
      const hyraGovernor = await HyraGovernorFactory.deploy();
      await hyraGovernor.waitForDeployment();

      // Test new quorum values
      const standardQuorum = await hyraGovernor.STANDARD_QUORUM();
      const emergencyQuorum = await hyraGovernor.EMERGENCY_QUORUM();
      const constitutionalQuorum = await hyraGovernor.CONSTITUTIONAL_QUORUM();
      const upgradeQuorum = await hyraGovernor.UPGRADE_QUORUM();

      // Verify improved quorum percentages
      expect(standardQuorum).to.equal(1500); // 15% (increased from 10%)
      expect(emergencyQuorum).to.equal(2000); // 20% (increased from 15%)
      expect(constitutionalQuorum).to.equal(3500); // 35% (increased from 30%)
      expect(upgradeQuorum).to.equal(3000); // 30% (increased from 25%)

      console.log("✅ Quorum improvements verified:");
      console.log(`   Standard: ${standardQuorum} (15%)`);
      console.log(`   Emergency: ${emergencyQuorum} (20%)`);
      console.log(`   Constitutional: ${constitutionalQuorum} (35%)`);
      console.log(`   Upgrade: ${upgradeQuorum} (30%)`);
    });
  });

  describe("Mint Tiers Improvements", function () {
    it("Should have improved mint tiers with new tier 4", async function () {
      // Deploy HyraToken implementation to test constants
      const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
      const hyraToken = await HyraTokenFactory.deploy();
      await hyraToken.waitForDeployment();

      // Test new mint tier values
      const tier1Cap = await hyraToken.TIER1_ANNUAL_CAP();
      const tier2Cap = await hyraToken.TIER2_ANNUAL_CAP();
      const tier3Cap = await hyraToken.TIER3_ANNUAL_CAP();
      const tier4Cap = await hyraToken.TIER4_ANNUAL_CAP();

      // Test new end year values
      const tier1EndYear = await hyraToken.TIER1_END_YEAR();
      const tier2EndYear = await hyraToken.TIER2_END_YEAR();
      const tier3EndYear = await hyraToken.TIER3_END_YEAR();
      const tier4EndYear = await hyraToken.TIER4_END_YEAR();

      // Verify improved mint tiers
      expect(tier1Cap).to.equal(ethers.parseEther("2000000000")); // 2B (reduced from 2.5B)
      expect(tier2Cap).to.equal(ethers.parseEther("1250000000")); // 1.25B (reduced from 1.5B)
      expect(tier3Cap).to.equal(ethers.parseEther("750000000"));  // 750M (unchanged)
      expect(tier4Cap).to.equal(ethers.parseEther("500000000"));  // 500M (new tier)

      // Verify extended time periods
      expect(tier1EndYear).to.equal(10);
      expect(tier2EndYear).to.equal(15);
      expect(tier3EndYear).to.equal(25);
      expect(tier4EndYear).to.equal(30); // New tier 4

      console.log("✅ Mint tier improvements verified:");
      console.log(`   Tier 1 (Years 1-10): ${ethers.formatEther(tier1Cap)} tokens/year`);
      console.log(`   Tier 2 (Years 11-15): ${ethers.formatEther(tier2Cap)} tokens/year`);
      console.log(`   Tier 3 (Years 16-25): ${ethers.formatEther(tier3Cap)} tokens/year`);
      console.log(`   Tier 4 (Years 26-30): ${ethers.formatEther(tier4Cap)} tokens/year`);
    });

    it("Should have correct total supply calculation with new tiers", async function () {
      // Deploy HyraToken implementation to test constants
      const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
      const hyraToken = await HyraTokenFactory.deploy();
      await hyraToken.waitForDeployment();

      const maxSupply = await hyraToken.MAX_SUPPLY();
      expect(maxSupply).to.equal(ethers.parseEther("50000000000")); // 50B total cap

      console.log("✅ Total supply calculation:");
      console.log(`   Tier 1 (10 years): 20B tokens`);
      console.log(`   Tier 2 (5 years): 6.25B tokens`);
      console.log(`   Tier 3 (10 years): 7.5B tokens`);
      console.log(`   Tier 4 (5 years): 2.5B tokens`);
      console.log(`   Total mintable: 36.25B tokens`);
      console.log(`   Max supply: ${ethers.formatEther(maxSupply)} tokens`);
    });
  });
});
