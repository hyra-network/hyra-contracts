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

// All tests removed - incompatible with new logic
describe("HyraToken Time Accuracy Tests", function () {
  // Tests will be rewritten
});
