/**
 * ============================================================================
 * BỘ TEST CASE ĐẦY ĐỦ CHO HYRA TOKEN MINT SCHEDULE
 * ============================================================================
 * 
 * Hệ thống: Mini-DAO mint token theo thời gian (25 năm: 2025-2049)
 * 
 * THÔNG SỐ HỆ THỐNG:
 * - Tổng cung: 50 tỷ HYRA (MAX_SUPPLY)
 * - Mint tối đa: 80% = 40 tỷ HYRA (qua DAO)
 * - Không mint: 20% = 10 tỷ HYRA (bị khóa)
 * 
 * PHÂN PHỐI MINT THEO GIAI ĐOẠN:
 * 
 * Phase 1 (Năm 1-10: 2025-2034):
 *   - Tổng: 50% = 25 tỷ HYRA
 *   - Năm 2025: Pre-mint 5% = 2.5 tỷ HYRA (ngay lập tức)
 *   - Năm 2026-2034: Mint qua DAO, mỗi năm tối đa 5% = 2.5 tỷ HYRA
 * 
 * Phase 2 (Năm 11-15: 2035-2039):
 *   - Tổng: 15% = 7.5 tỷ HYRA
 *   - Mỗi năm tối đa: 3% = 1.5 tỷ HYRA
 * 
 * Phase 3 (Năm 16-25: 2040-2049):
 *   - Tổng: 15% = 7.5 tỷ HYRA
 *   - Mỗi năm tối đa: 1.5% = 750 triệu HYRA
 * 
 * TỔNG MINT TỐI ĐA: 2.5B (pre-mint) + 25B + 7.5B + 7.5B = 42.5B (85% của MAX_SUPPLY)
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HYRA TOKEN", function () {
  // ============ Constants ============
  const MAX_SUPPLY = ethers.parseEther("50000000000"); // 50 tỷ
  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5 tỷ (5% pre-mint năm 2025)
  
  // Annual caps theo từng phase
  const TIER1_ANNUAL_CAP = ethers.parseEther("2500000000"); // 2.5B (5%)
  const TIER2_ANNUAL_CAP = ethers.parseEther("1500000000"); // 1.5B (3%)
  const TIER3_ANNUAL_CAP = ethers.parseEther("750000000");  // 750M (1.5%)
  
  const YEAR_DURATION = 365 * 24 * 60 * 60; // 365 ngày
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60; // 2 ngày

  // ============ Test Variables ============
  let token: HyraToken;
  let owner: SignerWithAddress;
  let dao: SignerWithAddress;
  let recipient: SignerWithAddress;
  let vesting: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  // ============ Helper Functions ============
  
  /**
   * Deploy token với proxy pattern
   */
  async function deployToken() {
    [owner, dao, recipient, vesting, user1, user2] = await ethers.getSigners();

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
      "HYRA",
      "HYRA",
      INITIAL_SUPPLY,
      await vesting.getAddress(),
      await owner.getAddress(),
      0, // yearStartTime
      await privilegedMultisig.getAddress() // privilegedMultisigWallet
    );

    return token;
  }

  /**
   * Tạo và execute mint request
   */
  async function createAndExecuteMint(
    amount: bigint,
    purpose: string = "Test mint"
  ): Promise<number> {
    const tx = await token.connect(owner).createMintRequest(
      await recipient.getAddress(),
      amount,
      purpose
    );
    await tx.wait();
    
    const requestId = (await token.mintRequestCount()) - 1n;
    
    // Fast forward qua delay
    await time.increase(MINT_EXECUTION_DELAY);
    
    // Execute
    await token.executeMintRequest(requestId);
    
    return Number(requestId);
  }

  /**
   * Fast forward đến năm cụ thể
   */
  async function fastForwardToYear(targetYear: number) {
    const currentYear = await token.currentMintYear();
    const yearsToAdvance = targetYear - Number(currentYear);
    
    if (yearsToAdvance > 0) {
      await time.increase(yearsToAdvance * YEAR_DURATION);
    }
  }

  /**
   * Kiểm tra remaining capacity
   */
  async function checkRemainingCapacity(expectedCap: bigint) {
    const remaining = await token.getRemainingMintCapacity();
    expect(remaining).to.equal(expectedCap);
  }

  // ============ Setup ============
  beforeEach(async function () {
    token = await deployToken();
  });

  // ============================================================================
  // 📋 TEST SUITE 1: KIỂM TRA PRE-MINT NĂM 2025
  // ============================================================================
  describe("Suite 1: Pre-mint năm 2025 (5% = 2.5 tỷ HYRA)", function () {
    
    it("1.1: Năm 2025 phải pre-mint đúng 5% tổng cung", async function () {
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(INITIAL_SUPPLY);
      const vestingBalance = await token.balanceOf(await vesting.getAddress());
      expect(vestingBalance).to.equal(INITIAL_SUPPLY);
    });

    it("1.2: Năm 2025 đã mint 5%, remaining capacity phải = 0", async function () {
      // Năm 1 đã mint 2.5B (pre-mint), còn lại 0
      const remaining = await token.getRemainingMintCapacityForYear(1);
      expect(remaining).to.equal(0n);
    });

    it("1.3: Không được mint thêm trong năm 2025 (năm 1)", async function () {
      const mintAmount = ethers.parseEther("1"); // Chỉ 1 HYRA
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          mintAmount,
          "Try mint in year 1"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("1.4: Kiểm tra totalMintedSupply = INITIAL_SUPPLY", async function () {
      const totalMinted = await token.totalMintedSupply();
      expect(totalMinted).to.equal(INITIAL_SUPPLY);
    });

    it("1.5: Kiểm tra mintedByYear[1] = INITIAL_SUPPLY", async function () {
      const mintedYear1 = await token.getMintedAmountForYear(1);
      expect(mintedYear1).to.equal(INITIAL_SUPPLY);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 2: PHASE 1 - NĂM 2-10 (2026-2034)
  // ============================================================================
  describe("Suite 2: Phase 1 - Năm 2-10 (mỗi năm tối đa 5% = 2.5 tỷ)", function () {
    
    it("2.1: Mint đúng limit năm 2 (2.5 tỷ)", async function () {
      // Fast forward sang năm 2
      await fastForwardToYear(2);
      
      // Mint đúng 2.5B
      await createAndExecuteMint(TIER1_ANNUAL_CAP, "Year 2 full mint");
      
      const mintedYear2 = await token.getMintedAmountForYear(2);
      expect(mintedYear2).to.equal(TIER1_ANNUAL_CAP);
    });

    it("❌ 2.2: Mint vượt limit năm 2 phải revert", async function () {
      await fastForwardToYear(2);
      
      const excessAmount = TIER1_ANNUAL_CAP + ethers.parseEther("1");
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          excessAmount,
          "Exceed year 2 cap"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("✅ 2.3: Mint từng phần trong năm 2 (tổng = 2.5B)", async function () {
      await fastForwardToYear(2);
      
      const part1 = ethers.parseEther("1000000000"); // 1B
      const part2 = ethers.parseEther("1000000000"); // 1B
      const part3 = ethers.parseEther("500000000");  // 500M
      
      await createAndExecuteMint(part1, "Part 1");
      await createAndExecuteMint(part2, "Part 2");
      await createAndExecuteMint(part3, "Part 3");
      
      const mintedYear2 = await token.getMintedAmountForYear(2);
      expect(mintedYear2).to.equal(TIER1_ANNUAL_CAP);
    });

    it("❌ 2.4: Mint double trong cùng năm 2 vượt limit → revert", async function () {
      await fastForwardToYear(2);
      
      // Mint lần 1: 2B
      await createAndExecuteMint(ethers.parseEther("2000000000"), "First mint");
      
      // Mint lần 2: 1B → tổng 3B > 2.5B → revert
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          ethers.parseEther("1000000000"),
          "Second mint exceeds"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("✅ 2.5: Loop mint tất cả năm 2-10 (9 năm x 2.5B)", async function () {
      let totalMinted = INITIAL_SUPPLY; // Bắt đầu từ pre-mint
      
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        
        await createAndExecuteMint(TIER1_ANNUAL_CAP, `Year ${year} mint`);
        
        totalMinted += TIER1_ANNUAL_CAP;
        
        const mintedThisYear = await token.getMintedAmountForYear(year);
        expect(mintedThisYear).to.equal(TIER1_ANNUAL_CAP);
      }
      
      // Tổng: 2.5B (pre-mint) + 9 x 2.5B = 25B
      const expectedTotal = INITIAL_SUPPLY + (TIER1_ANNUAL_CAP * 9n);
      expect(totalMinted).to.equal(expectedTotal);
      
      const actualTotal = await token.totalMintedSupply();
      expect(actualTotal).to.equal(expectedTotal);
    });

    it("✅ 2.6: Kiểm tra remaining capacity giảm dần trong năm", async function () {
      await fastForwardToYear(3);
      
      // Ban đầu: 2.5B
      let remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(TIER1_ANNUAL_CAP);
      
      // Mint 1B
      await createAndExecuteMint(ethers.parseEther("1000000000"), "Mint 1B");
      remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(ethers.parseEther("1500000000")); // Còn 1.5B
      
      // Mint thêm 500M
      await createAndExecuteMint(ethers.parseEther("500000000"), "Mint 500M");
      remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(ethers.parseEther("1000000000")); // Còn 1B
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 3: PHASE 2 - NĂM 11-15 (2035-2039)
  // ============================================================================
  describe("📋 Suite 3: Phase 2 - Năm 11-15 (mỗi năm tối đa 3% = 1.5 tỷ)", function () {
    
    it("✅ 3.1: Mint đúng limit năm 11 (1.5 tỷ)", async function () {
      await fastForwardToYear(11);
      
      await createAndExecuteMint(TIER2_ANNUAL_CAP, "Year 11 full mint");
      
      const mintedYear11 = await token.getMintedAmountForYear(11);
      expect(mintedYear11).to.equal(TIER2_ANNUAL_CAP);
    });

    it("❌ 3.2: Mint vượt limit năm 11 phải revert", async function () {
      await fastForwardToYear(11);
      
      const excessAmount = TIER2_ANNUAL_CAP + ethers.parseEther("1");
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          excessAmount,
          "Exceed year 11 cap"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("✅ 3.3: Loop mint tất cả năm 11-15 (5 năm x 1.5B)", async function () {
      for (let year = 11; year <= 15; year++) {
        await fastForwardToYear(year);
        
        await createAndExecuteMint(TIER2_ANNUAL_CAP, `Year ${year} mint`);
        
        const mintedThisYear = await token.getMintedAmountForYear(year);
        expect(mintedThisYear).to.equal(TIER2_ANNUAL_CAP);
      }
    });

    it("✅ 3.4: Kiểm tra tier transition từ năm 10 → 11", async function () {
      // Năm 10: cap = 2.5B
      await fastForwardToYear(10);
      let remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(TIER1_ANNUAL_CAP);
      
      // Năm 11: cap = 1.5B
      await fastForwardToYear(11);
      remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(TIER2_ANNUAL_CAP);
    });

    it("❌ 3.5: Không thể mint 2.5B trong năm 11 (chỉ được 1.5B)", async function () {
      await fastForwardToYear(11);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          TIER1_ANNUAL_CAP, // 2.5B > 1.5B cap
          "Try tier1 cap in tier2"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("✅ 3.6: Mint từng phần trong năm 12 (tổng = 1.5B)", async function () {
      await fastForwardToYear(12);
      
      const part1 = ethers.parseEther("500000000");  // 500M
      const part2 = ethers.parseEther("500000000");  // 500M
      const part3 = ethers.parseEther("500000000");  // 500M
      
      await createAndExecuteMint(part1, "Part 1");
      await createAndExecuteMint(part2, "Part 2");
      await createAndExecuteMint(part3, "Part 3");
      
      const mintedYear12 = await token.getMintedAmountForYear(12);
      expect(mintedYear12).to.equal(TIER2_ANNUAL_CAP);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 4: PHASE 3 - NĂM 16-25 (2040-2049)
  // ============================================================================
  describe("📋 Suite 4: Phase 3 - Năm 16-25 (mỗi năm tối đa 1.5% = 750M)", function () {
    
    it("✅ 4.1: Mint đúng limit năm 16 (750M)", async function () {
      await fastForwardToYear(16);
      
      await createAndExecuteMint(TIER3_ANNUAL_CAP, "Year 16 full mint");
      
      const mintedYear16 = await token.getMintedAmountForYear(16);
      expect(mintedYear16).to.equal(TIER3_ANNUAL_CAP);
    });

    it("❌ 4.2: Mint vượt limit năm 16 phải revert", async function () {
      await fastForwardToYear(16);
      
      const excessAmount = TIER3_ANNUAL_CAP + ethers.parseEther("1");
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          excessAmount,
          "Exceed year 16 cap"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("✅ 4.3: Loop mint tất cả năm 16-25 (10 năm x 750M)", async function () {
      for (let year = 16; year <= 25; year++) {
        await fastForwardToYear(year);
        
        await createAndExecuteMint(TIER3_ANNUAL_CAP, `Year ${year} mint`);
        
        const mintedThisYear = await token.getMintedAmountForYear(year);
        expect(mintedThisYear).to.equal(TIER3_ANNUAL_CAP);
      }
    });

    it("✅ 4.4: Kiểm tra tier transition từ năm 15 → 16", async function () {
      // Năm 15: cap = 1.5B
      await fastForwardToYear(15);
      let remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(TIER2_ANNUAL_CAP);
      
      // Năm 16: cap = 750M
      await fastForwardToYear(16);
      remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(TIER3_ANNUAL_CAP);
    });

    it("❌ 4.5: Không thể mint 1.5B trong năm 16 (chỉ được 750M)", async function () {
      await fastForwardToYear(16);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          TIER2_ANNUAL_CAP, // 1.5B > 750M cap
          "Try tier2 cap in tier3"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });

    it("✅ 4.6: Mint từng phần trong năm 20 (tổng = 750M)", async function () {
      await fastForwardToYear(20);
      
      const part1 = ethers.parseEther("250000000");  // 250M
      const part2 = ethers.parseEther("250000000");  // 250M
      const part3 = ethers.parseEther("250000000");  // 250M
      
      await createAndExecuteMint(part1, "Part 1");
      await createAndExecuteMint(part2, "Part 2");
      await createAndExecuteMint(part3, "Part 3");
      
      const mintedYear20 = await token.getMintedAmountForYear(20);
      expect(mintedYear20).to.equal(TIER3_ANNUAL_CAP);
    });

    it("❌ 4.7: Năm 25 là năm cuối, năm 26 không được mint", async function () {
      await fastForwardToYear(26);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          ethers.parseEther("1"),
          "Try mint in year 26"
        )
      ).to.be.revertedWithCustomError(token, "MintingPeriodEnded");
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 5: KIỂM TRA TỔNG LƯỢNG MINT (80% CAP)
  // ============================================================================
  describe("📋 Suite 5: Kiểm tra tổng lượng mint không vượt 80% cung", function () {
    
    it("✅ 5.1: Tổng mint tối đa = 42.5B (85% của 50B)", async function () {
      // Pre-mint: 2.5B
      // Phase 1 (năm 2-10): 9 x 2.5B = 22.5B
      // Phase 2 (năm 11-15): 5 x 1.5B = 7.5B
      // Phase 3 (năm 16-25): 10 x 750M = 7.5B
      // Tổng: 2.5 + 22.5 + 7.5 + 7.5 = 40B
      
      const maxMintable = await token.getMaxMintableSupply();
      const expected = ethers.parseEther("42500000000"); // 42.5B
      expect(maxMintable).to.equal(expected);
    });

    it("✅ 5.2: Mint full tất cả 25 năm = 40B", async function () {
      this.timeout(300000); // 5 phút timeout cho test dài
      
      let totalMinted = INITIAL_SUPPLY; // 2.5B pre-mint
      
      // Phase 1: Năm 2-10 (9 năm)
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER1_ANNUAL_CAP, `Year ${year}`);
        totalMinted += TIER1_ANNUAL_CAP;
      }
      
      // Phase 2: Năm 11-15 (5 năm)
      for (let year = 11; year <= 15; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER2_ANNUAL_CAP, `Year ${year}`);
        totalMinted += TIER2_ANNUAL_CAP;
      }
      
      // Phase 3: Năm 16-25 (10 năm)
      for (let year = 16; year <= 25; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER3_ANNUAL_CAP, `Year ${year}`);
        totalMinted += TIER3_ANNUAL_CAP;
      }
      
      // Tổng = 2.5B + 22.5B + 7.5B + 7.5B = 40B
      const expectedTotal = ethers.parseEther("40000000000"); // 40B
      expect(totalMinted).to.equal(expectedTotal);
      
      const actualTotal = await token.totalMintedSupply();
      expect(actualTotal).to.equal(expectedTotal);
    });

    it("❌ 5.3: Không thể mint vượt MAX_SUPPLY (50B)", async function () {
      // Giả sử đã mint gần hết, thử mint vượt MAX_SUPPLY
      await fastForwardToYear(2);
      
      // Tính toán: MAX_SUPPLY - totalSupply hiện tại
      const currentSupply = await token.totalSupply();
      const remaining = MAX_SUPPLY - currentSupply;
      
      // Thử mint nhiều hơn remaining
      const excessAmount = remaining + ethers.parseEther("1");
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          excessAmount,
          "Exceed MAX_SUPPLY"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsMaxSupply");
    });

    it("✅ 5.4: 20% cung (10B) không bao giờ được mint", async function () {
      this.timeout(300000);
      
      // Mint full 25 năm
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER1_ANNUAL_CAP, `Year ${year}`);
      }
      for (let year = 11; year <= 15; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER2_ANNUAL_CAP, `Year ${year}`);
      }
      for (let year = 16; year <= 25; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER3_ANNUAL_CAP, `Year ${year}`);
      }
      
      const totalMinted = await token.totalMintedSupply();
      const reserved = MAX_SUPPLY - totalMinted;
      
      // Reserved phải >= 10B (20% của 50B)
      const minReserved = ethers.parseEther("10000000000"); // 10B
      expect(reserved).to.be.gte(minReserved);
    });

    it("✅ 5.5: Kiểm tra totalSupply không vượt MAX_SUPPLY", async function () {
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.be.lte(MAX_SUPPLY);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 6: KIỂM TRA QUYỀN DAO (OWNER)
  // ============================================================================
  describe("📋 Suite 6: Kiểm tra quyền DAO (chỉ owner mới mint được)", function () {
    
    it("❌ 6.1: User thường không thể tạo mint request", async function () {
      await fastForwardToYear(2);
      
      await expect(
        token.connect(user1).createMintRequest(
          await recipient.getAddress(),
          ethers.parseEther("1000000"),
          "Unauthorized mint"
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("✅ 6.2: Owner (DAO) có thể tạo mint request", async function () {
      await fastForwardToYear(2);
      
      const tx = await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Authorized mint"
      );
      
      await expect(tx).to.emit(token, "MintRequestCreated");
    });

    it("❌ 6.3: User thường không thể cancel mint request", async function () {
      await fastForwardToYear(2);
      
      // Owner tạo request
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      // User thử cancel
      await expect(
        token.connect(user1).cancelMintRequest(0)
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
    });

    it("✅ 6.4: Owner có thể cancel mint request", async function () {
      await fastForwardToYear(2);
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      const tx = await token.connect(owner).cancelMintRequest(0);
      await expect(tx).to.emit(token, "MintRequestCancelled");
    });

    it("✅ 6.5: Bất kỳ ai cũng có thể execute mint request sau delay", async function () {
      await fastForwardToYear(2);
      
      // Owner tạo request
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      // Fast forward
      await time.increase(MINT_EXECUTION_DELAY);
      
      // User1 execute (không cần quyền owner)
      const tx = await token.connect(user1).executeMintRequest(0);
      await expect(tx).to.emit(token, "MintRequestExecuted");
    });

    it("✅ 6.6: Transfer ownership và test quyền mint", async function () {
      // Transfer ownership sang dao
      await token.connect(owner).transferGovernance(await dao.getAddress());
      
      await fastForwardToYear(2);
      
      // Owner cũ không thể mint
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          ethers.parseEther("1000000"),
          "Old owner"
        )
      ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
      
      // Owner mới (dao) có thể mint
      const tx = await token.connect(dao).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "New owner"
      );
      
      await expect(tx).to.emit(token, "MintRequestCreated");
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 7: EDGE CASES - BOUNDARY TESTING
  // ============================================================================
  describe("📋 Suite 7: Edge cases - Kiểm tra boundary của năm", function () {
    
    it("✅ 7.1: Mint ở giây đầu tiên của năm mới", async function () {
      // Fast forward đúng 365 ngày (giây đầu năm 2)
      await time.increase(YEAR_DURATION);
      
      const currentYear = await token.currentMintYear();
      expect(currentYear).to.equal(2n);
      
      // Mint ngay lập tức
      await createAndExecuteMint(ethers.parseEther("1000000"), "First second of year 2");
      
      const minted = await token.getMintedAmountForYear(2);
      expect(minted).to.equal(ethers.parseEther("1000000"));
    });

    it("✅ 7.2: Mint ở giây cuối cùng của năm", async function () {
      // Fast forward gần hết năm 2 (còn 1 giây)
      await time.increase(YEAR_DURATION + YEAR_DURATION - 1);
      
      const currentYear = await token.currentMintYear();
      expect(currentYear).to.equal(2n);
      
      // Mint ở giây cuối
      await createAndExecuteMint(ethers.parseEther("1000000"), "Last second of year 2");
      
      const minted = await token.getMintedAmountForYear(2);
      expect(minted).to.equal(ethers.parseEther("1000000"));
    });

    it("✅ 7.3: Mint đúng 00:00:00 của năm mới", async function () {
      const startTime = await token.mintYearStartTime();
      
      // Set time đúng bằng startTime + 365 days
      await time.increaseTo(Number(startTime) + YEAR_DURATION);
      
      const currentYear = await token.currentMintYear();
      expect(currentYear).to.equal(2n);
      
      await createAndExecuteMint(ethers.parseEther("1000000"), "Exactly 00:00:00");
    });

    it("✅ 7.4: Mint đúng 23:59:59 của năm", async function () {
      const startTime = await token.mintYearStartTime();
      
      // Set time = startTime + 365 days - 1 second
      await time.increaseTo(Number(startTime) + YEAR_DURATION + YEAR_DURATION - 1);
      
      const currentYear = await token.currentMintYear();
      expect(currentYear).to.equal(2n);
      
      await createAndExecuteMint(ethers.parseEther("1000000"), "23:59:59 of year");
    });

    it("✅ 7.5: Kiểm tra year transition chính xác", async function () {
      // Năm 1
      let year = await token.currentMintYear();
      expect(year).to.equal(1n);
      
      // Sang năm 2
      await time.increase(YEAR_DURATION);
      year = await token.currentMintYear();
      expect(year).to.equal(2n);
      
      // Sang năm 3
      await time.increase(YEAR_DURATION);
      year = await token.currentMintYear();
      expect(year).to.equal(3n);
    });

    it("✅ 7.6: Fast forward nhiều năm cùng lúc", async function () {
      // Jump từ năm 1 → năm 10
      await time.increase(YEAR_DURATION * 9);
      
      const year = await token.currentMintYear();
      expect(year).to.equal(10n);
      
      // Vẫn mint được với cap của năm 10
      const remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(TIER1_ANNUAL_CAP);
    });

    it("✅ 7.7: Mint amount = 0 phải revert", async function () {
      await fastForwardToYear(2);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          0,
          "Zero amount"
        )
      ).to.be.revertedWithCustomError(token, "InvalidAmount");
    });

    it("✅ 7.8: Mint amount = 1 wei (minimum)", async function () {
      await fastForwardToYear(2);
      
      await createAndExecuteMint(1n, "1 wei mint");
      
      const minted = await token.getMintedAmountForYear(2);
      expect(minted).to.equal(1n);
    });

    it("✅ 7.9: Mint amount = exact cap", async function () {
      await fastForwardToYear(2);
      
      await createAndExecuteMint(TIER1_ANNUAL_CAP, "Exact cap");
      
      const remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(0n);
    });

    it("✅ 7.10: Mint amount = cap + 1 wei phải revert", async function () {
      await fastForwardToYear(2);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          TIER1_ANNUAL_CAP + 1n,
          "Cap + 1 wei"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 8: MINT REQUEST LIFECYCLE
  // ============================================================================
  describe("📋 Suite 8: Mint request lifecycle (create → execute → cancel)", function () {
    
    it("❌ 8.1: Execute trước khi đủ delay phải revert", async function () {
      await fastForwardToYear(2);
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      // Thử execute ngay
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "MintDelayNotMet");
    });

    it("✅ 8.2: Execute sau đúng 2 ngày delay", async function () {
      await fastForwardToYear(2);
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      // Fast forward đúng 2 ngày
      await time.increase(MINT_EXECUTION_DELAY);
      
      const tx = await token.executeMintRequest(0);
      await expect(tx).to.emit(token, "MintRequestExecuted");
    });

    it("❌ 8.3: Execute request đã executed phải revert", async function () {
      await fastForwardToYear(2);
      
      await createAndExecuteMint(ethers.parseEther("1000000"), "Test");
      
      // Thử execute lại
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "AlreadyExecuted");
    });

    it("❌ 8.4: Execute request đã cancelled phải revert", async function () {
      await fastForwardToYear(2);
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      // Cancel
      await token.connect(owner).cancelMintRequest(0);
      
      // Thử execute
      await time.increase(MINT_EXECUTION_DELAY);
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "InvalidAmount");
    });

    it("❌ 8.5: Execute request expired (> 365 ngày) phải revert", async function () {
      await fastForwardToYear(2);
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      // Fast forward > 365 ngày
      await time.increase(366 * 24 * 60 * 60);
      
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "RequestExpired");
    });

    it("✅ 8.6: Cancel request trước khi execute", async function () {
      await fastForwardToYear(2);
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test"
      );
      
      const tx = await token.connect(owner).cancelMintRequest(0);
      await expect(tx).to.emit(token, "MintRequestCancelled");
      
      // Pending amount phải giảm
      const pending = await token.getPendingMintAmountForYear(2);
      expect(pending).to.equal(0n);
    });

    it("❌ 8.7: Cancel request không tồn tại phải revert", async function () {
      await expect(
        token.connect(owner).cancelMintRequest(999)
      ).to.be.revertedWithCustomError(token, "InvalidAmount");
    });

    it("✅ 8.8: Multiple requests trong cùng năm", async function () {
      await fastForwardToYear(2);
      
      // Tạo 3 requests
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("500000000"),
        "Request 1"
      );
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("500000000"),
        "Request 2"
      );
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("500000000"),
        "Request 3"
      );
      
      // Pending = 1.5B
      const pending = await token.getPendingMintAmountForYear(2);
      expect(pending).to.equal(ethers.parseEther("1500000000"));
      
      // Execute tất cả
      await time.increase(MINT_EXECUTION_DELAY);
      await token.executeMintRequest(0);
      await token.executeMintRequest(1);
      await token.executeMintRequest(2);
      
      // Minted = 1.5B, pending = 0
      const minted = await token.getMintedAmountForYear(2);
      expect(minted).to.equal(ethers.parseEther("1500000000"));
      
      const pendingAfter = await token.getPendingMintAmountForYear(2);
      expect(pendingAfter).to.equal(0n);
    });

    it("✅ 8.9: Kiểm tra request data integrity", async function () {
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000");
      const purpose = "Test purpose";
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        amount,
        purpose
      );
      
      const request = await token.mintRequests(0);
      expect(request.recipient).to.equal(await recipient.getAddress());
      expect(request.amount).to.equal(amount);
      expect(request.executed).to.equal(false);
      expect(request.purpose).to.equal(purpose);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 9: STRESS TESTS
  // ============================================================================
  describe("📋 Suite 9: Stress tests - Loop nhiều năm liên tiếp", function () {
    
    it("✅ 9.1: Mint full capacity tất cả 25 năm", async function () {
      this.timeout(600000); // 10 phút
      
      let totalMinted = INITIAL_SUPPLY;
      
      // Năm 2-10: Phase 1
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER1_ANNUAL_CAP, `Year ${year} full`);
        totalMinted += TIER1_ANNUAL_CAP;
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(TIER1_ANNUAL_CAP);
      }
      
      // Năm 11-15: Phase 2
      for (let year = 11; year <= 15; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER2_ANNUAL_CAP, `Year ${year} full`);
        totalMinted += TIER2_ANNUAL_CAP;
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(TIER2_ANNUAL_CAP);
      }
      
      // Năm 16-25: Phase 3
      for (let year = 16; year <= 25; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER3_ANNUAL_CAP, `Year ${year} full`);
        totalMinted += TIER3_ANNUAL_CAP;
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(TIER3_ANNUAL_CAP);
      }
      
      // Verify tổng = 40B
      const expectedTotal = ethers.parseEther("40000000000");
      expect(totalMinted).to.equal(expectedTotal);
      
      const actualTotal = await token.totalMintedSupply();
      expect(actualTotal).to.equal(expectedTotal);
      
      console.log("✅ Đã mint full 25 năm = 40B HYRA");
    });

    it("✅ 9.2: Mint 50% capacity mỗi năm trong 25 năm", async function () {
      this.timeout(600000);
      
      let totalMinted = INITIAL_SUPPLY;
      
      // Phase 1: 50% của 2.5B = 1.25B
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        const halfCap = TIER1_ANNUAL_CAP / 2n;
        await createAndExecuteMint(halfCap, `Year ${year} half`);
        totalMinted += halfCap;
      }
      
      // Phase 2: 50% của 1.5B = 750M
      for (let year = 11; year <= 15; year++) {
        await fastForwardToYear(year);
        const halfCap = TIER2_ANNUAL_CAP / 2n;
        await createAndExecuteMint(halfCap, `Year ${year} half`);
        totalMinted += halfCap;
      }
      
      // Phase 3: 50% của 750M = 375M
      for (let year = 16; year <= 25; year++) {
        await fastForwardToYear(year);
        const halfCap = TIER3_ANNUAL_CAP / 2n;
        await createAndExecuteMint(halfCap, `Year ${year} half`);
        totalMinted += halfCap;
      }
      
      // Verify tổng = 20B (50% của 40B)
      const expectedTotal = ethers.parseEther("22500000000"); // 2.5B + 50% của 40B
      expect(totalMinted).to.equal(expectedTotal);
      
      console.log("✅ Đã mint 50% capacity 25 năm = 22.5B HYRA");
    });

    it("✅ 9.3: Random mint amounts trong 10 năm", async function () {
      this.timeout(300000);
      
      for (let year = 2; year <= 11; year++) {
        await fastForwardToYear(year);
        
        const cap = year <= 10 ? TIER1_ANNUAL_CAP : TIER2_ANNUAL_CAP;
        
        // Random 10-90% của cap
        const randomPercent = BigInt(10 + Math.floor(Math.random() * 80));
        const amount = (cap * randomPercent) / 100n;
        
        await createAndExecuteMint(amount, `Year ${year} random ${randomPercent}%`);
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(amount);
      }
      
      console.log("✅ Đã mint random amounts 10 năm");
    });

    it("✅ 9.4: Multiple small mints mỗi năm", async function () {
      this.timeout(300000);
      
      for (let year = 2; year <= 5; year++) {
        await fastForwardToYear(year);
        
        // Mint 10 lần, mỗi lần 100M
        const smallAmount = ethers.parseEther("100000000");
        
        for (let i = 0; i < 10; i++) {
          await createAndExecuteMint(smallAmount, `Year ${year} part ${i + 1}`);
        }
        
        // Tổng = 1B
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(ethers.parseEther("1000000000"));
      }
      
      console.log("✅ Đã mint 10 lần/năm trong 4 năm");
    });

    it("✅ 9.5: Verify remaining capacity sau mỗi năm", async function () {
      this.timeout(300000);
      
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        
        // Check initial capacity
        let remaining = await token.getRemainingMintCapacity();
        expect(remaining).to.equal(TIER1_ANNUAL_CAP);
        
        // Mint 1B
        await createAndExecuteMint(ethers.parseEther("1000000000"), `Year ${year}`);
        
        // Check remaining
        remaining = await token.getRemainingMintCapacity();
        expect(remaining).to.equal(ethers.parseEther("1500000000"));
      }
      
      console.log("✅ Verified remaining capacity 9 năm");
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 10: VIEW FUNCTIONS & GETTERS
  // ============================================================================
  describe("📋 Suite 10: View functions - Kiểm tra các getter", function () {
    
    it("✅ 10.1: getRemainingMintCapacity() chính xác", async function () {
      await fastForwardToYear(2);
      
      let remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(TIER1_ANNUAL_CAP);
      
      // Mint 1B
      await createAndExecuteMint(ethers.parseEther("1000000000"), "Test");
      
      remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(ethers.parseEther("1500000000"));
    });

    it("✅ 10.2: getRemainingMintCapacityForYear() cho từng năm", async function () {
      // Năm 1: đã mint full
      let remaining = await token.getRemainingMintCapacityForYear(1);
      expect(remaining).to.equal(0n);
      
      // Năm 2: chưa mint
      remaining = await token.getRemainingMintCapacityForYear(2);
      expect(remaining).to.equal(TIER1_ANNUAL_CAP);
      
      // Năm 11: chưa mint
      remaining = await token.getRemainingMintCapacityForYear(11);
      expect(remaining).to.equal(TIER2_ANNUAL_CAP);
      
      // Năm 16: chưa mint
      remaining = await token.getRemainingMintCapacityForYear(16);
      expect(remaining).to.equal(TIER3_ANNUAL_CAP);
      
      // Năm 26: không hợp lệ
      remaining = await token.getRemainingMintCapacityForYear(26);
      expect(remaining).to.equal(0n);
    });

    it("✅ 10.3: getMintedAmountForYear() chính xác", async function () {
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000");
      await createAndExecuteMint(amount, "Test");
      
      const minted = await token.getMintedAmountForYear(2);
      expect(minted).to.equal(amount);
    });

    it("✅ 10.4: getPendingMintAmountForYear() chính xác", async function () {
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000");
      
      // Tạo request nhưng chưa execute
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        amount,
        "Test"
      );
      
      const pending = await token.getPendingMintAmountForYear(2);
      expect(pending).to.equal(amount);
      
      // Execute
      await time.increase(MINT_EXECUTION_DELAY);
      await token.executeMintRequest(0);
      
      // Pending = 0
      const pendingAfter = await token.getPendingMintAmountForYear(2);
      expect(pendingAfter).to.equal(0n);
    });

    it("✅ 10.5: getCurrentMintTier() đúng cho từng phase", async function () {
      // Năm 1-10: Tier 1
      let tier = await token.getCurrentMintTier();
      expect(tier).to.equal(1n);
      
      // Năm 11: Tier 2
      // getCurrentMintTier() tính toán dựa trên block.timestamp, không cần trigger
      await time.increase(YEAR_DURATION * 10); // Jump to year 11
      tier = await token.getCurrentMintTier();
      expect(tier).to.equal(2n);
      
      // Năm 16: Tier 3
      await time.increase(YEAR_DURATION * 5); // Jump to year 16
      tier = await token.getCurrentMintTier();
      expect(tier).to.equal(3n);
      
      // Năm 26: Tier 0 (ended)
      await time.increase(YEAR_DURATION * 10); // Jump to year 26
      tier = await token.getCurrentMintTier();
      expect(tier).to.equal(0n);
    });

    it("✅ 10.6: getMintedThisYear() chính xác", async function () {
      await fastForwardToYear(2);
      
      let minted = await token.getMintedThisYear();
      expect(minted).to.equal(0n);
      
      await createAndExecuteMint(ethers.parseEther("1000000000"), "Test");
      
      minted = await token.getMintedThisYear();
      expect(minted).to.equal(ethers.parseEther("1000000000"));
    });

    it("✅ 10.7: getTimeUntilNextMintYear() giảm dần", async function () {
      const time1 = await token.getTimeUntilNextMintYear();
      
      await time.increase(100);
      
      const time2 = await token.getTimeUntilNextMintYear();
      
      expect(time2).to.be.lt(time1);
    });

    it("✅ 10.8: getMaxMintableSupply() = 42.5B", async function () {
      const maxMintable = await token.getMaxMintableSupply();
      expect(maxMintable).to.equal(ethers.parseEther("42500000000"));
    });

    it("✅ 10.9: currentMintYear chỉ update khi gọi function trigger", async function () {
      // currentMintYear là state variable, chỉ update khi _checkAndResetMintYear() được gọi
      let year = await token.currentMintYear();
      expect(year).to.equal(1n);
      
      await time.increase(YEAR_DURATION);
      // Chưa update vì chưa trigger
      year = await token.currentMintYear();
      expect(year).to.equal(1n);
      
      // Trigger update bằng createMintRequest (non-view function)
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Trigger year update"
      );
      year = await token.currentMintYear();
      expect(year).to.equal(2n);
      
      await time.increase(YEAR_DURATION * 5);
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Trigger year update 2"
      );
      year = await token.currentMintYear();
      expect(year).to.equal(7n);
    });

    it("✅ 10.10: totalMintedSupply tăng sau mỗi mint", async function () {
      await fastForwardToYear(2);
      
      const before = await token.totalMintedSupply();
      
      const amount = ethers.parseEther("1000000000");
      await createAndExecuteMint(amount, "Test");
      
      const after = await token.totalMintedSupply();
      expect(after - before).to.equal(amount);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 11: INVALID INPUTS & ERROR HANDLING
  // ============================================================================
  describe("📋 Suite 11: Invalid inputs - Kiểm tra xử lý lỗi", function () {
    
    it("❌ 11.1: Recipient = address(0) phải revert", async function () {
      await fastForwardToYear(2);
      
      await expect(
        token.connect(owner).createMintRequest(
          ethers.ZeroAddress,
          ethers.parseEther("1000000"),
          "Zero address"
        )
      ).to.be.revertedWithCustomError(token, "ZeroAddress");
    });

    it("❌ 11.2: Amount = 0 phải revert", async function () {
      await fastForwardToYear(2);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          0,
          "Zero amount"
        )
      ).to.be.revertedWithCustomError(token, "InvalidAmount");
    });

    it("❌ 11.3: Execute request ID không tồn tại phải revert", async function () {
      await expect(
        token.executeMintRequest(999)
      ).to.be.revertedWithCustomError(token, "InvalidAmount");
    });

    it("❌ 11.4: Cancel request ID không tồn tại phải revert", async function () {
      await expect(
        token.connect(owner).cancelMintRequest(999)
      ).to.be.revertedWithCustomError(token, "InvalidAmount");
    });

    it("❌ 11.5: Mint sau năm 25 phải revert", async function () {
      await fastForwardToYear(26);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          ethers.parseEther("1"),
          "After year 25"
        )
      ).to.be.revertedWithCustomError(token, "MintingPeriodEnded");
    });

    it("❌ 11.6: Mint năm 50 phải revert", async function () {
      await fastForwardToYear(50);
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          ethers.parseEther("1"),
          "Year 50"
        )
      ).to.be.revertedWithCustomError(token, "MintingPeriodEnded");
    });

    it("❌ 11.7: getRemainingMintCapacityForYear(0) = 0", async function () {
      const remaining = await token.getRemainingMintCapacityForYear(0);
      expect(remaining).to.equal(0n);
    });

    it("❌ 11.8: getRemainingMintCapacityForYear(26) = 0", async function () {
      const remaining = await token.getRemainingMintCapacityForYear(26);
      expect(remaining).to.equal(0n);
    });

    it("❌ 11.9: getMintedAmountForYear(0) = 0", async function () {
      const minted = await token.getMintedAmountForYear(0);
      expect(minted).to.equal(0n);
    });

    it("❌ 11.10: getPendingMintAmountForYear(100) = 0", async function () {
      const pending = await token.getPendingMintAmountForYear(100);
      expect(pending).to.equal(0n);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 12: INTEGRATION TESTS
  // ============================================================================
  describe("📋 Suite 12: Integration tests - Kịch bản thực tế", function () {
    
    it("✅ 12.1: Kịch bản: DAO mint đều đặn mỗi năm 50% capacity", async function () {
      this.timeout(300000);
      
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        
        const halfCap = TIER1_ANNUAL_CAP / 2n;
        await createAndExecuteMint(halfCap, `Year ${year} regular mint`);
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(halfCap);
      }
      
      console.log("✅ DAO đã mint đều 50% capacity 9 năm");
    });

    it("✅ 12.2: Kịch bản: Mint nhiều trong năm đầu, ít dần về sau", async function () {
      // Năm 2: 100% cap
      await fastForwardToYear(2);
      await createAndExecuteMint(TIER1_ANNUAL_CAP, "Year 2 full");
      
      // Năm 3: 80% cap
      await fastForwardToYear(3);
      await createAndExecuteMint((TIER1_ANNUAL_CAP * 80n) / 100n, "Year 3 80%");
      
      // Năm 4: 60% cap
      await fastForwardToYear(4);
      await createAndExecuteMint((TIER1_ANNUAL_CAP * 60n) / 100n, "Year 4 60%");
      
      // Năm 5: 40% cap
      await fastForwardToYear(5);
      await createAndExecuteMint((TIER1_ANNUAL_CAP * 40n) / 100n, "Year 5 40%");
      
      console.log("✅ Mint giảm dần theo năm");
    });

    it("✅ 12.3: Kịch bản: Multiple recipients trong cùng năm", async function () {
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("500000000"); // 500M mỗi người
      
      // Mint cho 3 recipients khác nhau
      await token.connect(owner).createMintRequest(
        await user1.getAddress(),
        amount,
        "User 1"
      );
      
      await token.connect(owner).createMintRequest(
        await user2.getAddress(),
        amount,
        "User 2"
      );
      
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        amount,
        "Recipient"
      );
      
      // Execute tất cả
      await time.increase(MINT_EXECUTION_DELAY);
      await token.executeMintRequest(0);
      await token.executeMintRequest(1);
      await token.executeMintRequest(2);
      
      // Verify balances
      expect(await token.balanceOf(await user1.getAddress())).to.equal(amount);
      expect(await token.balanceOf(await user2.getAddress())).to.equal(amount);
      expect(await token.balanceOf(await recipient.getAddress())).to.equal(amount);
      
      console.log("✅ Mint cho 3 recipients thành công");
    });

    it("✅ 12.4: Kịch bản: Cancel một số requests, execute một số khác", async function () {
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("500000000");
      
      // Tạo 4 requests
      for (let i = 0; i < 4; i++) {
        await token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          amount,
          `Request ${i}`
        );
      }
      
      // Cancel request 1 và 3
      await token.connect(owner).cancelMintRequest(1);
      await token.connect(owner).cancelMintRequest(3);
      
      // Execute request 0 và 2
      await time.increase(MINT_EXECUTION_DELAY);
      await token.executeMintRequest(0);
      await token.executeMintRequest(2);
      
      // Verify: chỉ mint 2 requests = 1B
      const minted = await token.getMintedAmountForYear(2);
      expect(minted).to.equal(ethers.parseEther("1000000000"));
      
      console.log("✅ Cancel và execute selective requests");
    });

    it("✅ 12.5: Kịch bản: Mint gần hết capacity, thử mint thêm", async function () {
      await fastForwardToYear(2);
      
      // Mint 2.4B (gần hết 2.5B cap)
      await createAndExecuteMint(ethers.parseEther("2400000000"), "Almost full");
      
      // Còn 100M
      const remaining = await token.getRemainingMintCapacity();
      expect(remaining).to.equal(ethers.parseEther("100000000"));
      
      // Mint đúng 100M → OK
      await createAndExecuteMint(ethers.parseEther("100000000"), "Exact remaining");
      
      // Thử mint thêm 1 wei → revert
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          1n,
          "Exceed by 1 wei"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");
      
      console.log("✅ Mint đúng remaining capacity");
    });

    it("❌ 12.6: Kịch bản: Pause token sẽ block mint execution", async function () {
      await fastForwardToYear(2);
      
      // Tạo request
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Test pause"
      );
      
      // Pause token
      await token.connect(owner).pause();
      
      // Execute sẽ revert vì token bị pause
      await time.increase(MINT_EXECUTION_DELAY);
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "EnforcedPause");
      
      // Unpause và execute thành công
      await token.connect(owner).unpause();
      await token.executeMintRequest(0);
      
      console.log("✅ Pause block mint, unpause cho phép mint");
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 13: COMPREHENSIVE SUMMARY TEST
  // ============================================================================
  describe("📋 Suite 13: Comprehensive summary - Tổng hợp toàn bộ hệ thống", function () {
    
    it("✅ 13.1: FULL SYSTEM TEST - Mint toàn bộ 25 năm với verification", async function () {
      this.timeout(600000); // 10 phút
      
      console.log("\n========================================");
      console.log("🚀 BẮT ĐẦU FULL SYSTEM TEST");
      console.log("========================================\n");
      
      let totalMinted = INITIAL_SUPPLY;
      
      // ===== PHASE 1: NĂM 1-10 =====
      console.log("📊 PHASE 1: Năm 1-10 (2025-2034)");
      console.log("   Cap mỗi năm: 2.5B HYRA");
      
      // Năm 1: Pre-mint
      console.log("   ✅ Năm 1 (2025): Pre-mint 2.5B");
      const year1Minted = await token.getMintedAmountForYear(1);
      expect(year1Minted).to.equal(INITIAL_SUPPLY);
      
      // Năm 2-10: Mint qua DAO
      for (let year = 2; year <= 10; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER1_ANNUAL_CAP, `Year ${year}`);
        totalMinted += TIER1_ANNUAL_CAP;
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(TIER1_ANNUAL_CAP);
        
        console.log(`   ✅ Năm ${year}: Mint 2.5B`);
      }
      
      console.log(`   📈 Tổng Phase 1: ${ethers.formatEther(totalMinted)} HYRA\n`);
      
      // ===== PHASE 2: NĂM 11-15 =====
      console.log("📊 PHASE 2: Năm 11-15 (2035-2039)");
      console.log("   Cap mỗi năm: 1.5B HYRA");
      
      for (let year = 11; year <= 15; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER2_ANNUAL_CAP, `Year ${year}`);
        totalMinted += TIER2_ANNUAL_CAP;
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(TIER2_ANNUAL_CAP);
        
        console.log(`   ✅ Năm ${year}: Mint 1.5B`);
      }
      
      console.log(`   📈 Tổng Phase 2: ${ethers.formatEther(totalMinted)} HYRA\n`);
      
      // ===== PHASE 3: NĂM 16-25 =====
      console.log("📊 PHASE 3: Năm 16-25 (2040-2049)");
      console.log("   Cap mỗi năm: 750M HYRA");
      
      for (let year = 16; year <= 25; year++) {
        await fastForwardToYear(year);
        await createAndExecuteMint(TIER3_ANNUAL_CAP, `Year ${year}`);
        totalMinted += TIER3_ANNUAL_CAP;
        
        const minted = await token.getMintedAmountForYear(year);
        expect(minted).to.equal(TIER3_ANNUAL_CAP);
        
        console.log(`   ✅ Năm ${year}: Mint 750M`);
      }
      
      console.log(`   📈 Tổng Phase 3: ${ethers.formatEther(totalMinted)} HYRA\n`);
      
      // ===== FINAL VERIFICATION =====
      console.log("========================================");
      console.log("🎯 FINAL VERIFICATION");
      console.log("========================================");
      
      const expectedTotal = ethers.parseEther("40000000000"); // 40B
      expect(totalMinted).to.equal(expectedTotal);
      
      const actualTotal = await token.totalMintedSupply();
      expect(actualTotal).to.equal(expectedTotal);
      
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(expectedTotal);
      
      const reserved = MAX_SUPPLY - totalSupply;
      const minReserved = ethers.parseEther("10000000000"); // 10B
      expect(reserved).to.be.gte(minReserved);
      
      console.log(`✅ Tổng mint: ${ethers.formatEther(totalMinted)} HYRA`);
      console.log(`✅ Total supply: ${ethers.formatEther(totalSupply)} HYRA`);
      console.log(`✅ Reserved (không mint): ${ethers.formatEther(reserved)} HYRA`);
      console.log(`✅ Percentage minted: ${(Number(totalSupply) / Number(MAX_SUPPLY) * 100).toFixed(2)}%`);
      
      // Verify không thể mint thêm
      await fastForwardToYear(26);
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          1n,
          "After completion"
        )
      ).to.be.revertedWithCustomError(token, "MintingPeriodEnded");
      
      console.log("✅ Không thể mint sau năm 25");
      console.log("\n========================================");
      console.log("🎉 FULL SYSTEM TEST HOÀN THÀNH");
      console.log("========================================\n");
    });
  });

  // ============================================================================
  // 🏁 KẾT THÚC BỘ TEST
  // ============================================================================
});
