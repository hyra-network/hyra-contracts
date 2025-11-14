# 🏛️ CƠ CHẾ MINT DAO 25 NĂM (2025-2049)

## 📋 Tóm Tắt

HYRA Token có cơ chế mint phân tầng qua DAO trong 25 năm, từ **01/01/2025** đến **31/12/2049**.

---

## 🗓️ Lịch Trình Mint

### **Bảng Tổng Hợp**

| Năm | Giai Đoạn | Mint/Năm | Tổng Mint | Thời Gian |
|-----|-----------|----------|-----------|-----------|
| 1 | Pre-mint | 2.5 tỷ | 2.5 tỷ | 2025 |
| 2-10 | Tier 1 | 2.5 tỷ | 22.5 tỷ | 2026-2034 |
| 11-15 | Tier 2 | 1.5 tỷ | 7.5 tỷ | 2035-2039 |
| 16-25 | Tier 3 | 750 triệu | 7.5 tỷ | 2040-2049 |
| **TỔNG** | - | - | **40 tỷ** | **25 năm** |

### **Chi Tiết Từng Giai Đoạn**

#### **Năm 1 (2025): Pre-mint**
- ✅ Mint ngay khi deploy: **2.5 tỷ HYRA**
- 📦 Vào Vesting Contract
- 🎯 Mục đích: Team, investors, community

#### **Năm 2-10 (2026-2034): Giai Đoạn Tăng Trưởng**
- 📈 **2.5 tỷ HYRA/năm** × 9 năm = **22.5 tỷ HYRA**
- 🚀 Giai đoạn phát triển mạnh ecosystem
- 🏛️ Mint qua DAO governance

#### **Năm 11-15 (2035-2039): Giai Đoạn Ổn Định**
- 📊 **1.5 tỷ HYRA/năm** × 5 năm = **7.5 tỷ HYRA**
- ⚖️ Giảm tốc độ mint, ecosystem ổn định
- 🏛️ Mint qua DAO governance

#### **Năm 16-25 (2040-2049): Giai Đoạn Bền Vững**
- 🌱 **750 triệu HYRA/năm** × 10 năm = **7.5 tỷ HYRA**
- 🎯 Mint tối thiểu, tập trung bền vững
- 🏛️ Mint qua DAO governance

---

## 🔄 Quy Trình Mint

### **Timeline: ~11 Ngày**

```
1. Tạo Proposal (DAO Member)
   ↓
2. Voting Delay: 1 block
   ↓
3. Voting Period: ~7 ngày (50,400 blocks)
   ↓
4. Queue vào Timelock
   ↓
5. Timelock Delay: 2 ngày
   ↓
6. Execute → Tạo Mint Request
   ↓
7. Mint Delay: 2 ngày
   ↓
8. Execute Mint → Nhận Tokens
```

### **Các Bước Chi Tiết**

#### **Bước 1: Tạo Proposal**

**Loại Proposal (ProposalType):**

Mint request thường dùng **STANDARD** hoặc **UPGRADE** proposal:

| Loại | Quorum | Mô Tả | Sử Dụng Cho |
|------|--------|-------|-------------|
| **STANDARD** | 10% | Proposal thông thường | Mint thường xuyên, operations |
| **EMERGENCY** | 20% | Khẩn cấp (chỉ Security Council) | Emergency situations |
| **UPGRADE** | 25% | Nâng cấp contract | Contract upgrades, major changes |
| **CONSTITUTIONAL** | 30% | Thay đổi cơ bản | Governance changes, tokenomics |

**Tạo Proposal:**
```solidity
// Tạo STANDARD proposal (mint thông thường)
governor.proposeWithType(
    targets,      // [tokenAddress]
    values,       // [0]
    calldatas,    // [createMintRequest(...)]
    description,  // "Mint 2.5B HYRA for Q1 2026"
    ProposalType.STANDARD  // Type = 0
);

// Tạo UPGRADE proposal (mint cho major milestone)
governor.proposeWithType(
    targets,
    values,
    calldatas,
    description,  // "Mint 2.5B HYRA for Mainnet Launch"
    ProposalType.UPGRADE  // Type = 3
);
```

**Yêu cầu:**
- Proposer phải có đủ tokens (proposal threshold)
- EMERGENCY proposals chỉ Security Council tạo được
- Ghi rõ: recipient, amount, purpose

#### **Bước 2: Vote**

**Quorum Requirements:**
- **STANDARD**: Cần đạt **10%** total supply
- **EMERGENCY**: Cần đạt **20%** total supply
- **UPGRADE**: Cần đạt **25%** total supply
- **CONSTITUTIONAL**: Cần đạt **30%** total supply

**Voting Process:**
- **Voting Period**: ~7 ngày (50,400 blocks)
- **Vote Options**: For (1), Against (0), Abstain (2)
- **Majority Rule**: > 50% of votes cast phải agree
- **Quorum Check**: Total votes ≥ quorum requirement

**Ví dụ:**
```
STANDARD Proposal (10% quorum):
- Total Supply: 5B HYRA
- Quorum Required: 500M HYRA
- Votes Cast: 600M HYRA
  ├─ For: 400M (66.7%) ✅
  ├─ Against: 150M (25%)
  └─ Abstain: 50M (8.3%)
- Result: PASS (quorum met + majority for)

UPGRADE Proposal (25% quorum):
- Total Supply: 5B HYRA
- Quorum Required: 1.25B HYRA
- Votes Cast: 1.5B HYRA
  ├─ For: 1B (66.7%) ✅
  ├─ Against: 400M (26.7%)
  └─ Abstain: 100M (6.6%)
- Result: PASS (quorum met + majority for)
```

#### **Bước 3: Execute**
- **Queue**: Proposal được queue vào Timelock
- **Timelock Delay**: Chờ 2 ngày (security delay)
- **Execute Governor**: Tạo mint request
- **Mint Delay**: Chờ 2 ngày (mint security delay)
- **Execute Mint**: Mint tokens vào recipient

---

## 🏗️ Architecture & Standards

### **OpenZeppelin Standards**

HYRA DAO sử dụng các OpenZeppelin standards sau:

#### **1. Token Standards (HyraToken)**
```solidity
├─ ERC20Upgradeable          // Standard ERC20 token
├─ ERC20BurnableUpgradeable  // Burn mechanism
├─ ERC20PermitUpgradeable    // Gasless approvals (EIP-2612)
├─ ERC20VotesUpgradeable     // Voting power tracking
├─ OwnableUpgradeable        // Ownership management
├─ PausableUpgradeable       // Emergency pause
└─ ReentrancyGuardUpgradeable // Reentrancy protection
```

**Key Features:**
- ✅ **ERC20**: Standard token interface
- ✅ **ERC20Votes**: Checkpoint-based voting power
- ✅ **ERC20Permit**: Gasless approvals via signatures
- ✅ **Burnable**: Deflationary mechanism
- ✅ **Pausable**: Emergency stop mechanism
- ✅ **Upgradeable**: Proxy pattern for upgrades

#### **2. Governance Standards (HyraGovernor)**
```solidity
├─ GovernorUpgradeable                      // Core governance
├─ GovernorSettingsUpgradeable              // Configurable parameters
├─ GovernorCountingSimpleUpgradeable        // Simple vote counting
├─ GovernorVotesUpgradeable                 // Token-based voting
├─ GovernorVotesQuorumFractionUpgradeable   // Percentage-based quorum
├─ GovernorTimelockControlUpgradeable       // Timelock integration
└─ ReentrancyGuardUpgradeable               // Reentrancy protection
```

**Key Features:**
- ✅ **Governor**: OpenZeppelin Governor standard
- ✅ **Timelock**: 2-day delay for security
- ✅ **Quorum**: Dynamic quorum based on proposal type
- ✅ **Votes**: Checkpoint-based voting from ERC20Votes
- ✅ **Upgradeable**: Can upgrade governance logic

#### **3. Timelock Standards (HyraTimelock)**
```solidity
├─ TimelockControllerUpgradeable  // Timelock with role-based access
├─ AccessControlUpgradeable       // Role management
└─ ReentrancyGuardUpgradeable     // Reentrancy protection
```

**Key Features:**
- ✅ **Timelock**: Delay execution for security
- ✅ **Roles**: PROPOSER_ROLE, EXECUTOR_ROLE, ADMIN_ROLE
- ✅ **Batch Operations**: Execute multiple calls atomically
- ✅ **Upgradeable**: Can upgrade timelock logic

### **Upgradeable Pattern**

HYRA sử dụng **UUPS (Universal Upgradeable Proxy Standard)** pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                    UUPS PROXY PATTERN                       │
└─────────────────────────────────────────────────────────────┘

User
  │
  ▼
┌──────────────────┐
│  ERC1967Proxy    │  ← Proxy contract (immutable)
│  (Storage)       │     Stores all state variables
└────────┬─────────┘
         │ delegatecall
         ▼
┌──────────────────┐
│  Implementation  │  ← Logic contract (upgradeable)
│  (Logic)         │     Contains all functions
└──────────────────┘
```

**Upgrade Process:**
1. Deploy new implementation contract
2. Create DAO proposal to upgrade
3. Vote and execute through Timelock
4. Proxy points to new implementation
5. All state preserved, new logic active

**Security:**
- ✅ Only governance can upgrade
- ✅ 2-day timelock delay
- ✅ Storage layout compatibility checked
- ✅ Initializers protected with `_disableInitializers()`

### **Security Features**

#### **1. Access Control**
```solidity
// Token ownership
HyraToken.owner() = HyraTimelock address

// Timelock roles
PROPOSER_ROLE  → HyraGovernor (can propose)
EXECUTOR_ROLE  → Anyone (can execute after delay)
ADMIN_ROLE     → Timelock itself (can manage roles)
```

#### **2. Multiple Delays**
```
Proposal → Vote → Queue → Timelock (2d) → Execute → Mint Delay (2d) → Mint
                                ↑                           ↑
                          Security Layer 1          Security Layer 2
```

#### **3. Reentrancy Protection**
- Tất cả external functions có `nonReentrant` modifier
- Prevents reentrancy attacks

#### **4. Pausable**
- Owner có thể pause token transfers trong emergency
- Mint vẫn hoạt động (chỉ transfers bị pause)

#### **5. Request Expiry**
- Mint requests expire sau 1 năm
- Prevents stale requests from being executed

---

## 📊 Tokenomics

### **Supply Distribution**

```
Max Supply: 50 tỷ HYRA (100%)
├─ Mintable: 40 tỷ HYRA (80%)
│  ├─ Year 1: 2.5 tỷ (5%)
│  ├─ Year 2-10: 22.5 tỷ (45%)
│  ├─ Year 11-15: 7.5 tỷ (15%)
│  └─ Year 16-25: 7.5 tỷ (15%)
└─ Reserved: 10 tỷ HYRA (20%) - Không bao giờ mint
```

### **Mint Rate Giảm Dần**

```
📈 Year 1:     2.5 tỷ/năm (5% max supply)
📈 Year 2-10:  2.5 tỷ/năm (5% max supply)
📊 Year 11-15: 1.5 tỷ/năm (3% max supply)
📉 Year 16-25: 750M/năm (1.5% max supply)
```

**Lý do**: Giảm inflation theo thời gian, tạo scarcity

---

## ⚠️ Vấn Đề Quorum

### **Vấn Đề**

Khi supply tăng → quorum tăng → có thể không đủ voting power để vote!

**Ví dụ:**
```
Year 1:  Supply = 2.5 tỷ  → Quorum = 250M  → VP = 2.4 tỷ ✅
Year 10: Supply = 25 tỷ   → Quorum = 2.5 tỷ → VP = 2.4 tỷ ❌
Year 11: Không thể vote được! ❌
```

### **Giải Pháp: Burn Mechanism** ✅

**Burn 50% tokens sau mỗi lần mint:**

```typescript
// Sau khi mint
const burnAmount = (mintAmount * 50n) / 100n;
await token.burn(burnAmount);
```

**Kết quả:**
```
Year 1:  Mint 2.5 tỷ, Burn 0      → Supply = 2.5 tỷ
Year 2:  Mint 2.5 tỷ, Burn 1.25 tỷ → Supply = 3.75 tỷ
Year 3:  Mint 2.5 tỷ, Burn 1.25 tỷ → Supply = 5 tỷ
...
Year 25: Mint 750M, Burn 375M    → Supply = 21.25 tỷ

Final: Supply = 21.25 tỷ → Quorum = 2.125 tỷ < VP = 2.4 tỷ ✅
```

### **Test Results**

#### **Scenario A: KHÔNG Burn**
```
✅ Year 1-10: Thành công (25 tỷ minted)
❌ Year 11: FAIL - Quorum quá cao!
```

#### **Scenario B: CÓ Burn 50%**
```
✅ Year 1-25: TẤT CẢ THÀNH CÔNG!
✅ Total Minted: 40 tỷ HYRA
✅ Total Burned: 18.75 tỷ HYRA
✅ Final Supply: 21.25 tỷ HYRA
✅ Quorum: 2.125 tỷ < Voting Power: 2.4 tỷ ✅
```

---

## 🔒 Bảo Mật

### **1. Annual Cap**
- Mỗi năm có giới hạn riêng
- Không thể mint vượt quá cap
- Tracking: `mintedByYear[year]` + `pendingByYear[year]`

### **2. Pending Tracking**
- Tạo request: Reserve capacity
- Execute: Clear pending, update minted
- Cancel: Clear pending

### **3. Year Tracking**
- Mỗi request lưu `yearCreated`
- Đảm bảo tracking đúng năm
- Không bị lỗi khi year transition

### **4. Multiple Delays**
- Timelock delay: 2 ngày
- Mint delay: 2 ngày
- **Total: 4 ngày** từ vote đến mint

### **5. Request Expiry**
- Mỗi request có hạn 1 năm
- Tự động expire sau 1 năm
- Owner có thể cleanup

---

## 📝 Các Hàm Quan Trọng

### **Check Capacity**
```solidity
// Capacity còn lại năm hiện tại
token.getRemainingMintCapacity()

// Capacity của năm cụ thể
token.getRemainingMintCapacityForYear(year)
```

### **Check Minted**
```solidity
// Đã mint năm hiện tại
token.getMintedThisYear()

// Đã mint năm cụ thể
token.getMintedAmountForYear(year)
```

### **Check State**
```solidity
// Năm hiện tại (1-25)
token.currentMintYear()

// Tier hiện tại (1, 2, 3)
token.getCurrentMintTier()

// Thời gian đến năm sau
token.getTimeUntilNextMintYear()
```

---

## 🚨 Lỗi Thường Gặp

```solidity
// Trước 01/01/2025
MintingPeriodNotStarted()

// Sau 31/12/2049
MintingPeriodEnded()

// Vượt annual cap
ExceedsAnnualMintCap(requested, available)

// Vượt max supply
ExceedsMaxSupply(resultingSupply, maxSupply)

// Request đã execute
AlreadyExecuted()

// Chưa đủ delay
MintDelayNotMet()

// Request expire
RequestExpired()
```

---

## 💡 Best Practices

### **Cho DAO Members**

1. ⏰ **Plan trước**: Mint cần ~11 ngày
2. 📊 **Check capacity**: Xem còn bao nhiêu trước khi propose
3. 📝 **Ghi rõ mục đích**: Purpose phải clear
4. 👀 **Monitor quorum**: Theo dõi quorum vs voting power

### **Cho Developers**

1. 🔧 **Dùng yearCreated**: Track requests đúng năm
2. 🧹 **Cleanup expired**: Dọn dẹp requests cũ
3. 🧪 **Test kỹ**: Test edge cases
4. 📡 **Monitor events**: Listen mint events

### **Cho Governance**

1. 📅 **Annual planning**: Plan mint cho cả năm
2. 🔥 **Burn strategy**: Quyết định burn rate
3. 🚨 **Emergency plan**: Có plan cho emergency
4. 🔍 **Transparency**: Public tất cả decisions

---

## 📈 Ví Dụ Thực Tế

### **Năm 2026 (Year 2)**

```
1. Ngày 15/01/2026: DAO member tạo proposal
   - Mint 2.5 tỷ HYRA
   - Recipient: Treasury
   - Purpose: "Ecosystem development Q1 2026"

2. Ngày 15-22/01: Voting period
   - Total votes: 3 tỷ HYRA
   - Quorum: 375M HYRA (10% of 3.75 tỷ)
   - Result: 85% agree ✅

3. Ngày 22/01: Queue vào Timelock

4. Ngày 24/01: Execute Governor
   - Tạo mint request #1
   - yearCreated = 2

5. Ngày 26/01: Execute Mint
   - Mint 2.5 tỷ HYRA vào Treasury
   - Burn 1.25 tỷ HYRA (50%)
   - Net: +1.25 tỷ supply

6. Tracking:
   - mintedByYear[2] = 2.5 tỷ
   - pendingByYear[2] = 0
   - Remaining capacity: 0
```

---

## 📚 Tài Liệu Tham Khảo

### **Smart Contracts**

| Contract | Path | Description |
|----------|------|-------------|
| **HyraToken** | `contracts/core/HyraToken.sol` | ERC20 token with mint mechanism |
| **HyraGovernor** | `contracts/core/HyraGovernor.sol` | DAO governance contract |
| **HyraTimelock** | `contracts/core/HyraTimelock.sol` | Timelock controller |
| **IHyraToken** | `contracts/interfaces/IHyraToken.sol` | Token interface |
| **IHyraGovernor** | `contracts/interfaces/IHyraGovernor.sol` | Governor interface |

### **Tests**

| Test File | Description |
|-----------|-------------|
| `test/HyraToken.DAO.25Years.Full.test.ts` | Full 25-year mint test with burn |
| `test/HyraToken.test.ts` | Token unit tests |
| `test/HyraGovernor.test.ts` | Governor unit tests |

### **Documentation**

| Document | Language | Description |
|----------|----------|-------------|
| `docs/DAO_MINT_MECHANISM_2025-2049.md` | English | Full technical documentation |
| `docs/DAO_MINT_MECHANISM_VI.md` | Tiếng Việt | Vietnamese summary |
| `docs/DAO_MINT_VISUAL_GUIDE.md` | Visual | ASCII art diagrams |

### **OpenZeppelin References**

- **Governor**: https://docs.openzeppelin.com/contracts/4.x/governance
- **ERC20Votes**: https://docs.openzeppelin.com/contracts/4.x/api/token/erc20#ERC20Votes
- **Timelock**: https://docs.openzeppelin.com/contracts/4.x/api/governance#TimelockController
- **Upgradeable**: https://docs.openzeppelin.com/upgrades-plugins/1.x/
- **UUPS**: https://eips.ethereum.org/EIPS/eip-1822

---
