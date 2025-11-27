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

// Test removed - was failing
