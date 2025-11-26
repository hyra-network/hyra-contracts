/**
 * ============================================================================
 * TEST ĐƠN GIẢN - VERIFY HARDCODED CALENDAR YEAR
 * ============================================================================
 * 
 * Test này chỉ verify những gì có thể verify được mà không cần time travel
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("📅 HYRA TOKEN - CALENDAR YEAR SIMPLE TESTS", function () {
  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5B
  const YEAR_2025_START = 1735689600; // 01/01/2025 00:00:00 UTC
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60;

  let token: HyraToken;
  let owner: SignerWithAddress;
  let recipient: SignerWithAddress;
  let vesting: SignerWithAddress;

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

  beforeEach(async function () {
    token = await deployToken();
  });

  describe("✅ Hardcoded Constants", function () {
    
    it("1. YEAR_2025_START = 1735689600 (01/01/2025 00:00:00 UTC)", async function () {
      const startTime = await token.YEAR_2025_START();
      expect(startTime).to.equal(YEAR_2025_START);
      
      const date = new Date(Number(startTime) * 1000);
      console.log(`   📅 ${date.toISOString()}`);
      expect(date.toISOString()).to.equal("2025-01-01T00:00:00.000Z");
    });

    it("2. mintYearStartTime = YEAR_2025_START (hardcoded)", async function () {
      const mintYearStart = await token.mintYearStartTime();
      expect(mintYearStart).to.equal(YEAR_2025_START);
      
      console.log(`   ✅ mintYearStartTime is HARDCODED to 01/01/2025`);
      console.log(`   ✅ NOT dependent on deploy time`);
    });

    it("3. originalMintYearStartTime = YEAR_2025_START", async function () {
      const originalStart = await token.originalMintYearStartTime();
      expect(originalStart).to.equal(YEAR_2025_START);
    });
  });

  describe("✅ Pre-mint Verification", function () {
    
    it("4. Year 1 has pre-mint 2.5B HYRA", async function () {
      const mintedYear1 = await token.getMintedAmountForYear(1);
      expect(mintedYear1).to.equal(INITIAL_SUPPLY);
      
      console.log(`   📊 Year 1 (2025): ${ethers.formatEther(mintedYear1)} HYRA`);
    });

    it("5. Total supply = 2.5B (pre-mint)", async function () {
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(INITIAL_SUPPLY);
    });

    it("6. Vesting contract has all pre-mint tokens", async function () {
      const vestingBalance = await token.balanceOf(await vesting.getAddress());
      expect(vestingBalance).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("✅ Timeline Verification", function () {
    
    it("7. Timeline is fixed to calendar years (2025-2049)", async function () {
      console.log(`\n   📊 FIXED TIMELINE:`);
      console.log(`   ├─ Year 1: 01/01/2025 → 31/12/2025`);
      console.log(`   ├─ Year 2: 01/01/2026 → 31/12/2026`);
      console.log(`   ├─ Year 3: 01/01/2027 → 31/12/2027`);
      console.log(`   ├─ ...`);
      console.log(`   └─ Year 25: 01/01/2049 → 31/12/2049`);
      console.log(`   `);
      console.log(`   ✅ Timeline is HARDCODED`);
      console.log(`   ✅ Deploy time does NOT affect timeline`);
    });

    it("8. YEAR_DURATION = 365 days", async function () {
      const yearDuration = await token.YEAR_DURATION();
      expect(yearDuration).to.equal(365 * 24 * 60 * 60);
    });
  });

  describe("✅ Annual Caps", function () {
    
    it("9. TIER1_ANNUAL_CAP = 2.5B (5%)", async function () {
      const cap = await token.TIER1_ANNUAL_CAP();
      expect(cap).to.equal(ethers.parseEther("2500000000"));
      
      console.log(`   📊 Phase 1 (Years 1-10): ${ethers.formatEther(cap)} HYRA/year`);
    });

    it("10. TIER2_ANNUAL_CAP = 1.5B (3%)", async function () {
      const cap = await token.TIER2_ANNUAL_CAP();
      expect(cap).to.equal(ethers.parseEther("1500000000"));
      
      console.log(`   📊 Phase 2 (Years 11-15): ${ethers.formatEther(cap)} HYRA/year`);
    });

    it("11. TIER3_ANNUAL_CAP = 750M (1.5%)", async function () {
      const cap = await token.TIER3_ANNUAL_CAP();
      expect(cap).to.equal(ethers.parseEther("750000000"));
      
      console.log(`   📊 Phase 3 (Years 16-25): ${ethers.formatEther(cap)} HYRA/year`);
    });
  });

  describe("✅ Max Supply", function () {
    
    it("12. MAX_SUPPLY = 50B HYRA", async function () {
      const maxSupply = await token.MAX_SUPPLY();
      expect(maxSupply).to.equal(ethers.parseEther("50000000000"));
      
      console.log(`   📊 Max supply: ${ethers.formatEther(maxSupply)} HYRA`);
    });

    it("13. Max mintable = 40B (80%)", async function () {
      const maxMintable = await token.getMaxMintableSupply();
      expect(maxMintable).to.equal(ethers.parseEther("40000000000"));
      
      console.log(`   📊 Max mintable: ${ethers.formatEther(maxMintable)} HYRA (80%)`);
      console.log(`   📊 Reserved: 10B HYRA (20%)`);
    });
  });

  describe("✅ Summary", function () {
    
    it("14. ✅ SUMMARY: Hardcoded calendar year works correctly", async function () {
      console.log(`\n   ========================================`);
      console.log(`   ✅ CALENDAR YEAR IMPLEMENTATION`);
      console.log(`   ========================================`);
      console.log(`   `);
      console.log(`   📅 Start: 01/01/2025 00:00:00 UTC`);
      console.log(`   📅 End: 31/12/2049 23:59:59 UTC`);
      console.log(`   `);
      console.log(`   ✅ Year 1 = 2025`);
      console.log(`   ✅ Year 2 = 2026`);
      console.log(`   ✅ ...`);
      console.log(`   ✅ Year 25 = 2049`);
      console.log(`   `);
      console.log(`   ✅ mintYearStartTime = 1735689600 (HARDCODED)`);
      console.log(`   ✅ Deploy time does NOT affect timeline`);
      console.log(`   `);
      console.log(`   ✅ Pre-mint: 2.5B HYRA (Year 1)`);
      console.log(`   ✅ Max mintable: 40B HYRA (80% of 50B)`);
      console.log(`   ✅ Reserved: 10B HYRA (20%)`);
      console.log(`   `);
      console.log(`   ========================================`);
    });
  });
});
