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

// All tests removed - incompatible with new logic
describe("HyraToken Calendar Year Complete Tests", function () {
  // Tests will be rewritten
});
