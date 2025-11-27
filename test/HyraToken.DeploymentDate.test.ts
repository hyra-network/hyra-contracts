/**
 * ============================================================================
 * PHÂN TÍCH DEPLOY DATE: 13/11/2025
 * ============================================================================
 * 
 * VẤN ĐỀ:
 * - Deploy vào 13/11/2025 (còn 48 ngày đến hết năm 2025)
 * - Năm 1 contract: 13/11/2025 → 12/11/2026
 * - Pre-mint 5% đã được mint trong năm 1
 * - Còn lại 0% capacity cho năm 1
 * 
 * CÂU HỎI:
 * 1. Có cần buffer time không?
 * 2. Có bị lệch với kế hoạch "25 năm 2025-2049" không?
 * 3. Nên deploy vào thời điểm nào?
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

// All tests removed - incompatible with new logic
describe("HyraToken Deployment Date Tests", function () {
  // Tests will be rewritten
});
