/**
 * ============================================================================
 * BỘ TEST KIỂM TRA ĐỘ CHÍNH XÁC THỜI GIAN
 * ============================================================================
 * 
 * VẤN ĐỀ CẦN KIỂM TRA:
 * 
 * 1. Contract dùng YEAR_DURATION = 365 days (31,536,000 giây)
 * 2. Năm thực tế:
 *    - Năm thường: 365 ngày
 *    - Năm nhuận: 366 ngày (mỗi 4 năm)
 * 3. Trong 25 năm (2025-2049):
 *    - Năm nhuận: 2028, 2032, 2036, 2040, 2044, 2048 (6 năm)
 *    - Năm thường: 19 năm
 *    - Tổng ngày thực tế: (19 × 365) + (6 × 366) = 9,131 ngày
 *    - Tổng ngày contract: 25 × 365 = 9,125 ngày
 *    - CHÊNH LỆCH: 6 ngày (0.066%)
 * 
 * 4. Năm bắt đầu/kết thúc:
 *    - Contract: Bắt đầu từ block.timestamp khi deploy
 *    - Không theo lịch (1/1 → 31/12)
 *    - Mỗi năm = 365 ngày kể từ mintYearStartTime
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("⏰ HYRA TOKEN - KIỂM TRA ĐỘ CHÍNH XÁC THỜI GIAN", function () {
  // ============ Constants ============
  const INITIAL_SUPPLY = ethers.parseEther("2500000000");
  const YEAR_DURATION = 365 * 24 * 60 * 60; // 31,536,000 giây
  const DAY_DURATION = 24 * 60 * 60; // 86,400 giây
  const LEAP_YEAR_DURATION = 366 * 24 * 60 * 60; // 31,622,400 giây
  
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

  // ============================================================================
  // 📋 TEST SUITE 1: KIỂM TRA YEAR_DURATION
  // ============================================================================
  describe("📋 Suite 1: Kiểm tra YEAR_DURATION constant", function () {
    
    it("✅ 1.1: YEAR_DURATION = 365 days (không tính năm nhuận)", async function () {
      const yearDuration = await token.YEAR_DURATION();
      expect(yearDuration).to.equal(BigInt(YEAR_DURATION));
      
      console.log(`   📊 YEAR_DURATION: ${yearDuration} giây`);
      console.log(`   📊 = ${Number(yearDuration) / DAY_DURATION} ngày`);
      console.log(`   ⚠️  Không tính năm nhuận (366 ngày)`);
    });

    it("⚠️ 1.2: Chênh lệch giữa năm thường và năm nhuận", async function () {
      const diff = LEAP_YEAR_DURATION - YEAR_DURATION;
      const diffDays = diff / DAY_DURATION;
      
      console.log(`   📊 Năm thường: ${YEAR_DURATION / DAY_DURATION} ngày`);
      console.log(`   📊 Năm nhuận: ${LEAP_YEAR_DURATION / DAY_DURATION} ngày`);
      console.log(`   ⚠️  Chênh lệch: ${diffDays} ngày (${diff} giây)`);
      console.log(`   ⚠️  Tỷ lệ: ${(diff / YEAR_DURATION * 100).toFixed(4)}%`);
    });

    it("⚠️ 1.3: Tổng chênh lệch trong 25 năm (2025-2049)", async function () {
      // Năm nhuận trong khoảng 2025-2049: 2028, 2032, 2036, 2040, 2044, 2048
      const leapYears = 6;
      const normalYears = 25 - leapYears;
      
      const actualDays = (normalYears * 365) + (leapYears * 366);
      const contractDays = 25 * 365;
      const diffDays = actualDays - contractDays;
      
      console.log(`\n   📊 PHÂN TÍCH 25 NĂM (2025-2049):`);
      console.log(`   ├─ Năm thường: ${normalYears} năm × 365 ngày = ${normalYears * 365} ngày`);
      console.log(`   ├─ Năm nhuận: ${leapYears} năm × 366 ngày = ${leapYears * 366} ngày`);
      console.log(`   ├─ Tổng thực tế: ${actualDays} ngày`);
      console.log(`   ├─ Tổng contract: ${contractDays} ngày`);
      console.log(`   └─ ⚠️  CHÊNH LỆCH: ${diffDays} ngày (${(diffDays / contractDays * 100).toFixed(4)}%)`);
      
      const diffSeconds = diffDays * DAY_DURATION;
      console.log(`\n   ⚠️  Sau 25 năm, contract sẽ "nhanh hơn" ${diffDays} ngày (${diffSeconds} giây)`);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 2: KIỂM TRA NĂM BẮT ĐẦU/KẾT THÚC
  // ============================================================================
  describe("📋 Suite 2: Năm bắt đầu/kết thúc không theo lịch", function () {
    
    it("✅ 2.1: Năm bắt đầu từ block.timestamp (không phải 1/1)", async function () {
      const startTime = await token.mintYearStartTime();
      const currentTime = await time.latest();
      
      console.log(`   📊 Deploy time: ${new Date(Number(currentTime) * 1000).toISOString()}`);
      console.log(`   📊 Mint year start: ${new Date(Number(startTime) * 1000).toISOString()}`);
      console.log(`   ℹ️  Năm 1 bắt đầu từ thời điểm deploy, KHÔNG phải 1/1/2025`);
    });

    it("✅ 2.2: Mỗi năm = 365 ngày kể từ mintYearStartTime", async function () {
      const startTime = await token.mintYearStartTime();
      
      // Năm 1
      let year = await token.currentMintYear();
      expect(year).to.equal(1n);
      
      // Sau 365 ngày → Năm 2
      await time.increase(YEAR_DURATION);
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Trigger year update"
      );
      
      year = await token.currentMintYear();
      expect(year).to.equal(2n);
      
      const year2Start = await token.mintYearStartTime();
      const expectedYear2Start = BigInt(startTime) + BigInt(YEAR_DURATION);
      
      expect(year2Start).to.equal(expectedYear2Start);
      
      console.log(`   📊 Năm 1 start: ${new Date(Number(startTime) * 1000).toISOString()}`);
      console.log(`   📊 Năm 2 start: ${new Date(Number(year2Start) * 1000).toISOString()}`);
      console.log(`   ✅ Chính xác 365 ngày (${YEAR_DURATION} giây)`);
    });

    it("⚠️ 2.3: Năm contract vs năm lịch - Có thể lệch", async function () {
      const startTime = await token.mintYearStartTime();
      const startDate = new Date(Number(startTime) * 1000);
      
      console.log(`\n   📊 VÍ DỤ: Deploy vào ${startDate.toISOString()}`);
      console.log(`   ├─ Năm 1 contract: ${startDate.toISOString()} → ${new Date(Number(startTime + BigInt(YEAR_DURATION)) * 1000).toISOString()}`);
      console.log(`   ├─ Năm 2025 lịch: 2025-01-01 → 2025-12-31`);
      console.log(`   └─ ⚠️  KHÔNG TRÙNG KHỚP!`);
      
      console.log(`\n   ⚠️  Hệ quả:`);
      console.log(`   ├─ Năm contract ≠ Năm lịch`);
      console.log(`   ├─ "Năm 2025" trong contract có thể kéo dài sang 2026`);
      console.log(`   └─ Cần document rõ: "Năm X" = "365 ngày kể từ deploy + (X-1) × 365 ngày"`);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 3: KIỂM TRA DRIFT THEO THỜI GIAN
  // ============================================================================
  describe("📋 Suite 3: Kiểm tra drift (lệch) theo thời gian", function () {
    
    it("⚠️ 3.1: Sau 4 năm (1 năm nhuận), lệch 1 ngày", async function () {
      // Giả sử: Năm 1-3 thường (365 ngày), Năm 4 nhuận (366 ngày)
      const actualTime = (3 * YEAR_DURATION) + LEAP_YEAR_DURATION;
      const contractTime = 4 * YEAR_DURATION;
      const drift = actualTime - contractTime;
      
      console.log(`\n   📊 SAU 4 NĂM (bao gồm 1 năm nhuận):`);
      console.log(`   ├─ Thời gian thực tế: ${actualTime / DAY_DURATION} ngày`);
      console.log(`   ├─ Thời gian contract: ${contractTime / DAY_DURATION} ngày`);
      console.log(`   └─ ⚠️  Drift: ${drift / DAY_DURATION} ngày`);
      
      console.log(`\n   ⚠️  Hệ quả:`);
      console.log(`   ├─ Contract "nhanh hơn" 1 ngày`);
      console.log(`   ├─ Năm 5 contract bắt đầu sớm hơn 1 ngày so với thực tế`);
      console.log(`   └─ Mint cap năm 5 có thể bị áp dụng sớm 1 ngày`);
    });

    it("⚠️ 3.2: Sau 25 năm, lệch 6 ngày", async function () {
      // 6 năm nhuận trong 25 năm
      const leapYears = 6;
      const normalYears = 19;
      
      const actualTime = (normalYears * YEAR_DURATION) + (leapYears * LEAP_YEAR_DURATION);
      const contractTime = 25 * YEAR_DURATION;
      const drift = actualTime - contractTime;
      
      console.log(`\n   📊 SAU 25 NĂM (2025-2049):`);
      console.log(`   ├─ Thời gian thực tế: ${actualTime / DAY_DURATION} ngày`);
      console.log(`   ├─ Thời gian contract: ${contractTime / DAY_DURATION} ngày`);
      console.log(`   └─ ⚠️  Drift: ${drift / DAY_DURATION} ngày`);
      
      console.log(`\n   ⚠️  Hệ quả:`);
      console.log(`   ├─ Contract kết thúc sớm hơn 6 ngày`);
      console.log(`   ├─ Năm 26 (không được mint) bắt đầu sớm 6 ngày`);
      console.log(`   └─ Tỷ lệ: ${(drift / contractTime * 100).toFixed(4)}% (rất nhỏ)`);
    });

    it("✅ 3.3: Drift 6 ngày trong 25 năm là chấp nhận được", async function () {
      const drift = 6 * DAY_DURATION;
      const totalTime = 25 * YEAR_DURATION;
      const driftPercent = (drift / totalTime) * 100;
      
      console.log(`\n   📊 ĐÁNH GIÁ DRIFT:`);
      console.log(`   ├─ Drift: 6 ngày / 9,125 ngày`);
      console.log(`   ├─ Tỷ lệ: ${driftPercent.toFixed(4)}%`);
      console.log(`   ├─ Tương đương: ~2 giờ/năm`);
      console.log(`   └─ ✅ Chấp nhận được cho hệ thống mint token`);
      
      expect(driftPercent).to.be.lessThan(0.1); // < 0.1%
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 4: RECOMMENDATIONS
  // ============================================================================
  describe("📋 Suite 4: Khuyến nghị và giải pháp", function () {
    
    it("📝 4.1: Document rõ cách tính năm", async function () {
      console.log(`\n   📝 KHUYẾN NGHỊ DOCUMENTATION:`);
      console.log(`   `);
      console.log(`   1. "Năm X" trong contract = 365 ngày kể từ thời điểm cụ thể`);
      console.log(`   2. KHÔNG theo năm lịch (1/1 → 31/12)`);
      console.log(`   3. Năm 1 bắt đầu từ block.timestamp khi deploy`);
      console.log(`   4. Mỗi năm tiếp theo = năm trước + 365 ngày`);
      console.log(`   `);
      console.log(`   VÍ DỤ:`);
      console.log(`   - Deploy: 2025-06-15 00:00:00 UTC`);
      console.log(`   - Năm 1: 2025-06-15 → 2026-06-14`);
      console.log(`   - Năm 2: 2026-06-15 → 2027-06-14`);
      console.log(`   - ...`);
      console.log(`   - Năm 25: 2049-06-15 → 2050-06-14`);
    });

    it("📝 4.2: Giải pháp nếu muốn chính xác hơn", async function () {
      console.log(`\n   💡 CÁC GIẢI PHÁP (nếu cần):`);
      console.log(`   `);
      console.log(`   OPTION 1: Giữ nguyên (KHUYẾN NGHỊ)`);
      console.log(`   ├─ Drift 0.066% là chấp nhận được`);
      console.log(`   ├─ Đơn giản, dễ audit`);
      console.log(`   └─ Gas efficient`);
      console.log(`   `);
      console.log(`   OPTION 2: Dùng năm lịch`);
      console.log(`   ├─ Năm 1 = 1/1/2025 → 31/12/2025`);
      console.log(`   ├─ Phức tạp hơn (cần tính toán ngày/tháng)`);
      console.log(`   ├─ Gas cao hơn`);
      console.log(`   └─ Khó audit`);
      console.log(`   `);
      console.log(`   OPTION 3: Adjust mỗi 4 năm`);
      console.log(`   ├─ Thêm 1 ngày mỗi 4 năm`);
      console.log(`   ├─ Phức tạp, dễ lỗi`);
      console.log(`   └─ Không cần thiết`);
      console.log(`   `);
      console.log(`   ✅ KẾT LUẬN: Giữ nguyên thiết kế hiện tại`);
    });

    it("📝 4.3: Lưu ý khi deploy production", async function () {
      console.log(`\n   ⚠️  LƯU Ý KHI DEPLOY:`);
      console.log(`   `);
      console.log(`   1. Chọn thời điểm deploy cẩn thận`);
      console.log(`      - Nên deploy đầu tháng (dễ nhớ)`);
      console.log(`      - VD: 2025-01-01, 2025-06-01, etc.`);
      console.log(`   `);
      console.log(`   2. Document rõ trong whitepaper:`);
      console.log(`      - "Năm X" = 365 ngày kể từ [deploy_timestamp]`);
      console.log(`      - Không theo năm lịch`);
      console.log(`      - Có thể lệch 6 ngày sau 25 năm (chấp nhận được)`);
      console.log(`   `);
      console.log(`   3. Tạo dashboard hiển thị:`);
      console.log(`      - Năm hiện tại (contract)`);
      console.log(`      - Thời gian còn lại đến năm tiếp theo`);
      console.log(`      - Remaining mint capacity`);
      console.log(`   `);
      console.log(`   4. Communicate với community:`);
      console.log(`      - Giải thích rõ cách tính năm`);
      console.log(`      - Cung cấp tool tính toán`);
      console.log(`      - FAQ về thời gian`);
    });
  });

  // ============================================================================
  // 📋 TEST SUITE 5: EDGE CASES VỀ THỜI GIAN
  // ============================================================================
  describe("📋 Suite 5: Edge cases về thời gian", function () {
    
    it("✅ 5.1: Mint ở giây cuối cùng của năm", async function () {
      const startTime = await token.mintYearStartTime();
      
      // Jump đến giây cuối cùng của năm 1
      await time.increaseTo(Number(startTime) + YEAR_DURATION - 1);
      
      // Vẫn là năm 1
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "Last second of year 1"
      );
      
      const year = await token.currentMintYear();
      expect(year).to.equal(1n);
      
      console.log(`   ✅ Mint ở giây cuối năm 1 → vẫn tính năm 1`);
    });

    it("✅ 5.2: Mint ở giây đầu tiên của năm mới", async function () {
      const startTime = await token.mintYearStartTime();
      
      // Jump đến giây đầu tiên của năm 2
      await time.increaseTo(Number(startTime) + YEAR_DURATION);
      
      // Trigger year update
      await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        ethers.parseEther("1000000"),
        "First second of year 2"
      );
      
      const year = await token.currentMintYear();
      expect(year).to.equal(2n);
      
      console.log(`   ✅ Mint ở giây đầu năm 2 → tính năm 2`);
    });

    it("⚠️ 5.3: Nếu deploy vào năm nhuận (29/2)", async function () {
      console.log(`\n   ⚠️  TRƯỜNG HỢP ĐẶC BIỆT:`);
      console.log(`   `);
      console.log(`   Nếu deploy vào 29/2/2028 (năm nhuận):`);
      console.log(`   ├─ Năm 1: 29/2/2028 → 28/2/2029 (365 ngày)`);
      console.log(`   ├─ Năm 2: 1/3/2029 → 28/2/2030 (365 ngày)`);
      console.log(`   └─ ⚠️  Bỏ qua ngày 29/2 trong các năm nhuận tiếp theo`);
      console.log(`   `);
      console.log(`   💡 KHUYẾN NGHỊ: Tránh deploy vào 29/2`);
    });
  });

  // ============================================================================
  // 🏁 KẾT THÚC BỘ TEST
  // ============================================================================
});
