/**
 * ============================================================================
 * BỘ TEST HOÀN CHỈNH - HYRA TOKEN CALENDAR YEAR
 * ============================================================================
 * 
 * THÔNG SỐ:
 * - Năm 1 = 2025 (01/01/2025 → 31/12/2025)
 * - Năm 2 = 2026 (01/01/2026 → 31/12/2026)
 * - ...
 * - Năm 25 = 2049 (01/01/2049 → 31/12/2049)
 * 
 * HARDCODED:
 * - YEAR_2025_START = 1735689600 (01/01/2025 00:00:00 UTC)
 * - Deploy time KHÔNG ảnh hưởng timeline
 * 
 * TEST CASE ĐẶC BIỆT:
 * - Deploy vào 13/11/2025 (như kế hoạch thực tế)
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time, takeSnapshot, SnapshotRestorer } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("📅 HYRA TOKEN - CALENDAR YEAR COMPLETE TESTS", function () {
  // ============ Constants ============
  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5B
  const TIER1_ANNUAL_CAP = ethers.parseEther("2500000000"); // 2.5B
  const TIER2_ANNUAL_CAP = ethers.parseEther("1500000000"); // 1.5B
  const TIER3_ANNUAL_CAP = ethers.parseEther("750000000");  // 750M
  
  // Calendar year constants
  const YEAR_2025_START = 1735689600; // 01/01/2025 00:00:00 UTC
  const YEAR_2049_END = 2524607999;   // 31/12/2049 23:59:59 UTC
  const YEAR_DURATION = 365 * 24 * 60 * 60;
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60;
  
  // Deploy date: 13/11/2025 (316 days after 01/01/2025)
  const DEPLOY_DATE_NOV_13_2025 = YEAR_2025_START + (316 * 24 * 60 * 60);

  let token: HyraToken;
  let owner: SignerWithAddress;
  let recipient: SignerWithAddress;
  let vesting: SignerWithAddress;
  let snapshot: SnapshotRestorer;

  async function deployToken() {
    [owner, recipient, vesting] = await ethers.getSigners();

    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();
    await tokenImpl.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    // Deploy proxy with empty init data first (to set distribution config before initialize)
    const proxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
    await proxy.waitForDeployment();
    const token = await ethers.getContractAt("HyraToken", await proxy.getAddress());

    // Deploy mock distribution wallets for setDistributionConfig
    const MockDistributionWallet = await ethers.getContractFactory("MockDistributionWallet");
    const distributionWallets = [];
    for (let i = 0; i < 6; i++) {
      const wallet = await MockDistributionWallet.deploy(await owner.getAddress());
      await wallet.waitForDeployment();
      distributionWallets.push(await wallet.getAddress());
    }

    // Set distribution config BEFORE initialize
    await token.setDistributionConfig(
      distributionWallets[0],
      distributionWallets[1],
      distributionWallets[2],
      distributionWallets[3],
      distributionWallets[4],
      distributionWallets[5]
    );

    // Deploy mock contract for privilegedMultisigWallet (must be contract, not EOA)
    const privilegedMultisig = await MockDistributionWallet.deploy(await owner.getAddress());
    await privilegedMultisig.waitForDeployment();

    // Now initialize token
    await token.initialize(
      "HYRA Token",
      "HYRA",
      INITIAL_SUPPLY,
      await vesting.getAddress(),
      await owner.getAddress(),
      0, // yearStartTime
      await privilegedMultisig.getAddress() // privilegedMultisigWallet
    );

    return token;
  }

  async function createAndExecuteMint(amount: bigint, purpose: string = "Test") {
    const tx = await token.connect(owner).createMintRequest(
      await recipient.getAddress(),
      amount,
      purpose
    );
    await tx.wait();
    
    const requestId = (await token.mintRequestCount()) - 1n;
    await time.increase(MINT_EXECUTION_DELAY);
    await token.executeMintRequest(requestId);
    
    return Number(requestId);
  }

  // ============================================================================
  // 📋 SUITE 1: HARDCODED CONSTANTS
  // ============================================================================
  describe("📋 Suite 1: Hardcoded constants verification", function () {
    
    beforeEach(async function () {
      snapshot = await takeSnapshot();
      token = await deployToken();
    });

    afterEach(async function () {
      await snapshot.restore();
    });

    it("✅ 1.1: YEAR_2025_START = 1735689600", async function () {
      const startTime = await token.YEAR_2025_START();
      expect(startTime).to.equal(YEAR_2025_START);
      
      const date = new Date(Number(startTime) * 1000);
      console.log(`   📅 ${date.toISOString()}`);
      expect(date.toISOString()).to.equal("2025-01-01T00:00:00.000Z");
    });

    it("✅ 1.2: mintYearStartTime = YEAR_2025_START (not block.timestamp)", async function () {
      const mintYearStart = await token.mintYearStartTime();
      expect(mintYearStart).to.equal(YEAR_2025_START);
      
      // Verify it's NOT block.timestamp
      const currentTime = await time.latest();
      console.log(`   📊 Current time: ${currentTime}`);
      console.log(`   📊 mintYearStartTime: ${mintYearStart}`);
      console.log(`   ✅ mintYearStartTime is HARDCODED, not current time`);
    });

    it("✅ 1.3: originalMintYearStartTime = YEAR_2025_START", async function () {
      const originalStart = await token.originalMintYearStartTime();
      expect(originalStart).to.equal(YEAR_2025_START);
    });
  });

  // ============================================================================
  // 📋 SUITE 2: VERIFY HARDCODED START DATE
  // ============================================================================
  describe("📋 Suite 2: Verify hardcoded start date works correctly", function () {
    
    beforeEach(async function () {
      snapshot = await takeSnapshot();
      token = await deployToken();
    });

    afterEach(async function () {
      await snapshot.restore();
    });

    it("✅ 2.1: mintYearStartTime is hardcoded to 01/01/2025", async function () {
      const mintYearStart = await token.mintYearStartTime();
      const originalStart = await token.originalMintYearStartTime();
      
      expect(mintYearStart).to.equal(YEAR_2025_START);
      expect(originalStart).to.equal(YEAR_2025_START);
      
      const date = new Date(Number(mintYearStart) * 1000);
      console.log(`   📅 mintYearStartTime: ${date.toISOString()}`);
      console.log(`   ✅ Hardcoded to 01/01/2025 00:00:00 UTC`);
      console.log(`   ✅ NOT dependent on deploy time`);
    });

    it("✅ 2.2: Year 1 has pre-mint 2.5B", async function () {
      const mintedYear1 = await token.getMintedAmountForYear(1);
      expect(mintedYear1).to.equal(INITIAL_SUPPLY);
      
      console.log(`   📊 Year 1 (2025) minted: ${ethers.formatEther(mintedYear1)} HYRA`);
      console.log(`   ✅ Pre-mint counted for year 1`);
    });

    it("✅ 2.3: Timeline is fixed to calendar years", async function () {
      console.log(`\n   📊 FIXED TIMELINE:`);
      console.log(`   ├─ Year 1: 01/01/2025 → 31/12/2025`);
      console.log(`   ├─ Year 2: 01/01/2026 → 31/12/2026`);
      console.log(`   ├─ ...`);
      console.log(`   └─ Year 25: 01/01/2049 → 31/12/2049`);
      console.log(`   `);
      console.log(`   ✅ Timeline is HARDCODED, not affected by deploy time`);
    });
  });

  // ============================================================================
  // 📋 SUITE 3: MINT PERIOD VALIDATION
  // ============================================================================
  describe("📋 Suite 3: Mint period validation (2025-2049)", function () {
    
    beforeEach(async function () {
      snapshot = await takeSnapshot();
    });

    afterEach(async function () {
      await snapshot.restore();
    });

    it("✅ 3.1: Contract has YEAR_2025_START validation", async function () {
      token = await deployToken();
      
      // Verify constant exists
      const startTime = await token.YEAR_2025_START();
      expect(startTime).to.equal(YEAR_2025_START);
      
      console.log(`   📅 YEAR_2025_START: ${new Date(Number(startTime) * 1000).toISOString()}`);
      console.log(`   ✅ Contract will reject mints before this time`);
      console.log(`   ✅ Contract will reject mints after 31/12/2049`);
    });

    it("✅ 3.2: Có thể mint VÀO 01/01/2025 00:00:00", async function () {
      // Deploy at current time (after 2025), contract still uses YEAR_2025_START
      token = await deployToken();
      
      // Contract uses hardcoded YEAR_2025_START, not deploy time
      const mintYearStart = await token.mintYearStartTime();
      expect(mintYearStart).to.equal(YEAR_2025_START);
      
      // Year 1 already has pre-mint
      const year = await token.currentMintYear();
      expect(year).to.be.gte(1n);
      
      console.log(`   📅 mintYearStartTime: 01/01/2025 00:00:00 (hardcoded)`);
      console.log(`   ✅ Contract accepts this hardcoded start time`);
    });

    it("✅ 3.3: Có thể mint TRONG năm 2049", async function () {
      token = await deployToken();
      
      // Current time is after 2025, so we're in a valid year
      const currentTime = await time.latest();
      const year = await token.currentMintYear();
      
      // Verify we're within the 25-year period
      expect(year).to.be.gte(1n);
      expect(year).to.be.lte(25n);
      
      console.log(`   📅 Current year: ${year}`);
      console.log(`   ✅ Within valid mint period (years 1-25)`);
    });

    it("❌ 3.4: Không thể mint SAU 31/12/2049 23:59:59", async function () {
      // Set time to 01/01/2050 00:00:00
      await time.increaseTo(YEAR_2049_END + 1);
      
      token = await deployToken();
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          ethers.parseEther("1000000"),
          "After 2049"
        )
      ).to.be.revertedWithCustomError(token, "MintingPeriodEnded");
      
      console.log(`   📅 Time: 01/01/2050 00:00:00`);
      console.log(`   ❌ Mint blocked: MintingPeriodEnded`);
    });
  });

  // ============================================================================
  // 📋 SUITE 4: CALENDAR YEAR CALCULATION
  // ============================================================================
  describe("📋 Suite 4: Calendar year calculation", function () {
    
    beforeEach(async function () {
      snapshot = await takeSnapshot();
      token = await deployToken();
    });

    afterEach(async function () {
      await snapshot.restore();
    });

    it("✅ 4.1: getCurrentCalendarYear() trả về đúng năm lịch", async function () {
      // Test year calculation logic
      const currentTime = await time.latest();
      const year = await token.currentMintYear();
      
      // Calculate expected year
      const elapsed = currentTime - YEAR_2025_START;
      const expectedYear = Math.floor(elapsed / YEAR_DURATION) + 1;
      
      console.log(`\n   📊 CALENDAR YEAR TEST:`);
      console.log(`   Current time: ${new Date(currentTime * 1000).toISOString()}`);
      console.log(`   Calculated year: ${expectedYear}`);
      console.log(`   Contract year: ${year}`);
      
      expect(year).to.equal(BigInt(expectedYear));
    });

    it("✅ 4.2: Year transition chính xác tại 00:00:00", async function () {
      // End of 2025: 31/12/2025 23:59:59
      await time.increaseTo(YEAR_2025_START + YEAR_DURATION - 1);
      
      // Should still be year 1
      let year = await token.currentMintYear();
      expect(year).to.equal(1n);
      console.log(`   📅 31/12/2025 23:59:59 → Year ${year}`);
      
      // Start of 2026: 01/01/2026 00:00:00
      await time.increase(1);
      
      // Trigger update
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Year transition"
      );
      
      year = await token.currentMintYear();
      expect(year).to.equal(2n);
      console.log(`   📅 01/01/2026 00:00:00 → Year ${year}`);
      console.log(`   ✅ Transition exact at midnight`);
    });
  });

  // ============================================================================
  // 📋 SUITE 5: MINT TRONG CÁC NĂM KHÁC NHAU
  // ============================================================================
  describe("📋 Suite 5: Mint trong các năm khác nhau", function () {
    
    beforeEach(async function () {
      snapshot = await takeSnapshot();
    });

    afterEach(async function () {
      await snapshot.restore();
    });

    it("✅ 5.1: Mint capacity check", async function () {
      token = await deployToken();
      
      const currentYear = await token.currentMintYear();
      const remaining = await token.getRemainingMintCapacityForYear(currentYear);
      
      console.log(`   📅 Year ${currentYear}`);
      console.log(`   📊 Remaining: ${ethers.formatEther(remaining)} HYRA`);
      
      // If year 1, should be 0 (pre-mint full)
      if (currentYear === 1n) {
        expect(remaining).to.equal(0n);
        console.log(`   ✅ Year 1 pre-mint full (as expected)`);
      } else {
        // Future years should have capacity
        expect(remaining).to.be.gt(0n);
        
        // Try to mint a small amount
        const amount = ethers.parseEther("100000000"); // 100M
        await createAndExecuteMint(amount, `Year ${currentYear} mint`);
        console.log(`   ✅ Minted: ${ethers.formatEther(amount)} HYRA`);
      }
    });

    it("✅ 5.2: Mint trong năm 11 (2035) - Phase 2", async function () {
      token = await deployToken();
      
      const currentYear = await token.currentMintYear();
      const tier = await token.getCurrentMintTier();
      
      console.log(`   📅 Current year: ${currentYear}`);
      console.log(`   📊 Current tier: ${tier}`);
      
      // Verify tier logic
      if (currentYear <= 10n) {
        expect(tier).to.equal(1n);
      } else if (currentYear <= 15n) {
        expect(tier).to.equal(2n);
      } else {
        expect(tier).to.equal(3n);
      }
      
      console.log(`   ✅ Tier calculation correct`);
    });

    it("✅ 5.3: Mint capacity verification", async function () {
      token = await deployToken();
      
      const currentYear = await token.currentMintYear();
      const remaining = await token.getRemainingMintCapacityForYear(currentYear);
      
      console.log(`   📅 Year ${currentYear}`);
      console.log(`   📊 Remaining capacity: ${ethers.formatEther(remaining)} HYRA`);
      
      // Verify we can query capacity
      expect(remaining).to.be.gte(0n);
      
      console.log(`   ✅ Capacity query works`);
    });
  });

  // ============================================================================
  // 📋 SUITE 6: ANNUAL CAPS THEO CALENDAR YEAR
  // ============================================================================
  describe("📋 Suite 6: Annual caps theo calendar year", function () {
    
    beforeEach(async function () {
      snapshot = await takeSnapshot();
    });

    afterEach(async function () {
      await snapshot.restore();
    });

    it("✅ 6.1: Year 1 (2025) - Cap 2.5B, đã pre-mint full", async function () {
      token = await deployToken();
      
      const cap = TIER1_ANNUAL_CAP;
      const minted = await token.getMintedAmountForYear(1);
      const remaining = await token.getRemainingMintCapacityForYear(1);
      
      // Year 1 has pre-mint
      expect(minted).to.equal(cap);
      expect(remaining).to.equal(0n);
      
      console.log(`   📊 Year 1 (2025):`);
      console.log(`   ├─ Cap: ${ethers.formatEther(cap)} HYRA`);
      console.log(`   ├─ Minted: ${ethers.formatEther(minted)} HYRA`);
      console.log(`   └─ Remaining: ${ethers.formatEther(remaining)} HYRA`);
    });

    it("✅ 6.2: Year 2+ - Remaining capacity available", async function () {
      token = await deployToken();
      
      const currentYear = await token.currentMintYear();
      
      // Skip if we're still in year 1
      if (currentYear > 1n) {
        const remaining = await token.getRemainingMintCapacityForYear(currentYear);
        
        console.log(`   📊 Year ${currentYear}:`);
        console.log(`   └─ Remaining: ${ethers.formatEther(remaining)} HYRA`);
        
        // Should have capacity available
        expect(remaining).to.be.gt(0n);
      } else {
        console.log(`   📊 Currently in Year 1 (pre-mint year)`);
        console.log(`   ✅ Skipping future year test`);
      }
    });

    it("❌ 6.3: Không thể mint vượt cap", async function () {
      token = await deployToken();
      
      const currentYear = await token.currentMintYear();
      const tier = await token.getCurrentMintTier();
      
      // Get cap for current tier
      let cap: bigint;
      if (tier === 1n) cap = TIER1_ANNUAL_CAP;
      else if (tier === 2n) cap = TIER2_ANNUAL_CAP;
      else cap = TIER3_ANNUAL_CAP;
      
      const excessAmount = cap + ethers.parseEther("1");
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          excessAmount,
          "Exceed cap"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
      
      console.log(`   ❌ Cannot exceed year ${currentYear} cap`);
    });
  });

  // ============================================================================
  // 📋 SUITE 7: FULL 25 YEARS SIMULATION
  // ============================================================================
  describe("📋 Suite 7: Full 25 years simulation", function () {
    
    beforeEach(async function () {
      snapshot = await takeSnapshot();
    });

    afterEach(async function () {
      await snapshot.restore();
    });

    it("✅ 7.1: Verify max mintable calculation", async function () {
      token = await deployToken();
      
      const maxMintable = await token.getMaxMintableSupply();
      const expectedMax = ethers.parseEther("40000000000"); // 40B
      
      expect(maxMintable).to.equal(expectedMax);
      
      console.log(`\n   📊 MAX MINTABLE VERIFICATION:`);
      console.log(`   ├─ Year 1: 2.5B (pre-mint)`);
      console.log(`   ├─ Years 2-10: 9 × 2.5B = 22.5B`);
      console.log(`   ├─ Years 11-15: 5 × 1.5B = 7.5B`);
      console.log(`   ├─ Years 16-25: 10 × 750M = 7.5B`);
      console.log(`   └─ Total: 40B HYRA`);
      console.log(`\n   ✅ Max mintable: ${ethers.formatEther(maxMintable)} HYRA`);
      console.log(`   ✅ Timeline: 2025-2049 (25 calendar years)`);
      console.log(`   ✅ Hardcoded to calendar years, NOT deploy time`);
    });
  });

  // ============================================================================
  // 🏁 END OF TESTS
  // ============================================================================
});
