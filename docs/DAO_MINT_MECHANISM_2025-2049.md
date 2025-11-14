# 🏛️ HYRA DAO - Cơ Chế Mint 25 Năm (2025-2049)

## 📋 Tổng Quan

HYRA Token sử dụng cơ chế mint phân tầng qua DAO governance trong 25 năm, từ **01/01/2025** đến **31/12/2049**. Mỗi năm có giới hạn mint khác nhau dựa trên 3 giai đoạn (tiers).

---

## 🗓️ Lịch Trình Mint

### **Năm 1 (2025): Pre-mint**
- **Thời gian**: 01/01/2025 00:00:00 UTC
- **Số lượng**: 2.5 tỷ HYRA (2,500,000,000 HYRA)
- **Phương thức**: Mint trực tiếp vào Vesting Contract khi deploy
- **Mục đích**: Phân phối ban đầu cho team, investors, community

### **Năm 2-10 (2026-2034): Tier 1 - Giai Đoạn Tăng Trưởng**
- **Thời gian**: 9 năm
- **Giới hạn mỗi năm**: 2.5 tỷ HYRA/năm
- **Tổng cộng**: 22.5 tỷ HYRA
- **Phương thức**: Mint qua DAO governance
- **Đặc điểm**: Giai đoạn tăng trưởng mạnh, cần nhiều token cho ecosystem

### **Năm 11-15 (2035-2039): Tier 2 - Giai Đoạn Ổn Định**
- **Thời gian**: 5 năm
- **Giới hạn mỗi năm**: 1.5 tỷ HYRA/năm
- **Tổng cộng**: 7.5 tỷ HYRA
- **Phương thức**: Mint qua DAO governance
- **Đặc điểm**: Giảm tốc độ mint, ecosystem đã ổn định

### **Năm 16-25 (2040-2049): Tier 3 - Giai Đoạn Bền Vững**
- **Thời gian**: 10 năm
- **Giới hạn mỗi năm**: 750 triệu HYRA/năm
- **Tổng cộng**: 7.5 tỷ HYRA
- **Phương thức**: Mint qua DAO governance
- **Đặc điểm**: Mint tối thiểu, tập trung vào bền vững

### **Sau năm 2049**
- **Trạng thái**: Minting period ended
- **Hành động**: Không thể mint thêm token mới
- **Supply**: Cố định tại mức đã mint

---

## 📊 Bảng Tổng Hợp

| Giai Đoạn | Năm | Thời Gian | Mint/Năm | Tổng Mint | % Max Supply |
|-----------|-----|-----------|----------|-----------|--------------|
| Pre-mint | 1 | 2025 | 2.5B | 2.5B | 5% |
| Tier 1 | 2-10 | 2026-2034 | 2.5B | 22.5B | 45% |
| Tier 2 | 11-15 | 2035-2039 | 1.5B | 7.5B | 15% |
| Tier 3 | 16-25 | 2040-2049 | 750M | 7.5B | 15% |
| **TỔNG** | **1-25** | **2025-2049** | - | **40B** | **80%** |
| Reserved | - | - | - | 10B | 20% |
| **MAX SUPPLY** | - | - | - | **50B** | **100%** |

---

## 🔄 Quy Trình Mint Qua DAO

### **Bước 1: Tạo Proposal**
```solidity
// Chỉ có governance (Timelock) có thể tạo mint request
function createMintRequest(
    address recipient,
    uint256 amount,
    string memory purpose
) external onlyOwner returns (uint256 requestId)
```

**Yêu cầu:**
- Caller phải là owner (Timelock contract)
- Amount phải > 0
- Recipient không được là zero address
- Phải trong mint period (2025-2049)
- Amount không vượt quá annual cap của năm hiện tại

### **Bước 2: DAO Vote**
1. **Propose**: Voter tạo proposal mint tokens
2. **Voting Delay**: Chờ 1 block
3. **Voting Period**: Vote trong 50,400 blocks (~7 days)
4. **Quorum**: Cần đạt 10% total supply
5. **Queue**: Proposal được queue vào Timelock
6. **Timelock Delay**: Chờ 2 days
7. **Execute**: Execute proposal → tạo mint request

### **Bước 3: Execute Mint Request**
```solidity
// Sau 2 days delay, bất kỳ ai cũng có thể execute
function executeMintRequest(uint256 requestId) external nonReentrant
```

**Yêu cầu:**
- Request phải tồn tại và chưa được execute
- Đã qua mint execution delay (2 days)
- Chưa hết hạn (1 year expiry)

### **Bước 4: Tokens Được Mint**
- Tokens được mint vào địa chỉ recipient
- Cập nhật tracking: `mintedByYear[year]`, `totalMintedSupply`
- Clear pending: `pendingByYear[year]`
- Emit events: `MintRequestExecuted`, `TokensMinted`

---

## ⏱️ Timeline Chi Tiết

### **Thời Gian Xử Lý Một Proposal**

| Bước | Thời Gian | Mô Tả |
|------|-----------|-------|
| Propose | Instant | Tạo proposal |
| Voting Delay | 1 block | Chờ trước khi vote |
| Voting Period | 50,400 blocks | ~7 days voting |
| Queue | Instant | Queue vào Timelock |
| Timelock Delay | 2 days | Security delay |
| Execute Governor | Instant | Tạo mint request |
| Mint Delay | 2 days | Security delay |
| Execute Mint | Instant | Mint tokens |
| **TỔNG** | **~11 days** | **Từ propose đến mint** |

### **Năm Mint (Calendar Year)**

Mỗi năm mint bắt đầu từ **01/01 00:00:00 UTC** và kết thúc **31/12 23:59:59 UTC**:

```
Year 1:  01/01/2025 00:00:00 UTC → 31/12/2025 23:59:59 UTC
Year 2:  01/01/2026 00:00:00 UTC → 31/12/2026 23:59:59 UTC
...
Year 25: 01/01/2049 00:00:00 UTC → 31/12/2049 23:59:59 UTC
```

**Lưu ý**: Mint request được track theo năm mà nó được **tạo** (yearCreated), không phải năm execute.

---

## 🔒 Cơ Chế Bảo Mật

### **1. Annual Cap Enforcement**
```solidity
// Mỗi năm có giới hạn riêng
uint256 annualCap = _getAnnualMintCap(currentMintYear);
uint256 remainingCapacity = annualCap - (mintedByYear[year] + pendingByYear[year]);

if (amount > remainingCapacity) {
    revert ExceedsAnnualMintCap(amount, remainingCapacity);
}
```

### **2. Pending Tracking**
- Khi tạo request: `pendingByYear[year] += amount`
- Khi execute: `pendingByYear[year] -= amount`, `mintedByYear[year] += amount`
- Khi cancel: `pendingByYear[year] -= amount`

### **3. Year Tracking**
```solidity
struct MintRequest {
    address recipient;
    uint256 amount;
    uint256 approvedAt;
    bool executed;
    string purpose;
    uint256 yearCreated; // Track năm tạo request
}
```

### **4. Request Expiry**
- Mỗi request có thời hạn 1 năm (365 days)
- Sau 1 năm, request tự động expire
- Owner có thể cleanup expired requests

### **5. Multiple Delays**
- **Timelock Delay**: 2 days (DAO governance)
- **Mint Execution Delay**: 2 days (mint request)
- **Total**: 4 days minimum từ vote đến mint

---

## 📈 Tokenomics

### **Supply Distribution**

```
Total Max Supply: 50,000,000,000 HYRA (50B)

Mintable (80%):   40,000,000,000 HYRA (40B)
├─ Year 1:         2,500,000,000 HYRA (2.5B) - Pre-mint
├─ Year 2-10:     22,500,000,000 HYRA (22.5B) - Tier 1
├─ Year 11-15:     7,500,000,000 HYRA (7.5B) - Tier 2
└─ Year 16-25:     7,500,000,000 HYRA (7.5B) - Tier 3

Reserved (20%):   10,000,000,000 HYRA (10B) - Never minted
```

### **Mint Rate Giảm Dần**

```
Year 1:    2.5B HYRA (5% of max supply)
Year 2-10: 2.5B HYRA/year (5% of max supply/year)
Year 11-15: 1.5B HYRA/year (3% of max supply/year)
Year 16-25: 750M HYRA/year (1.5% of max supply/year)
```

**Lý do**: Giảm inflation rate theo thời gian, tạo scarcity

---

## ⚠️ Vấn Đề Quorum

### **Vấn Đề**
Khi supply tăng, quorum (10% of total supply) cũng tăng. Nếu voting power không tăng theo, DAO sẽ không thể vote được.

**Ví dụ:**
- Year 1: Supply = 2.5B → Quorum = 250M → Voting Power = 2.4B ✅
- Year 10: Supply = 25B → Quorum = 2.5B → Voting Power = 2.4B ❌

### **Giải Pháp 1: Burn Mechanism** ✅ (Recommended)

Burn một phần tokens sau mỗi lần mint để giữ supply thấp:

```typescript
// Burn 50% of minted amount
const burnAmount = (mintAmount * 50n) / 100n;
await token.burn(burnAmount);
```

**Kết quả với 50% burn rate:**
- Year 25: Supply = 21.25B → Quorum = 2.125B → Voting Power = 2.4B ✅

### **Giải Pháp 2: Dynamic Quorum** (Alternative)

Thay đổi cách tính quorum để không tăng quá nhanh:

```solidity
// Thay vì: quorum = 10% of total supply
// Dùng: quorum = 10% of (initial supply + 50% of new minted)
function quorum(uint256 blockNumber) public view override returns (uint256) {
    uint256 currentSupply = token.getPastTotalSupply(blockNumber);
    uint256 effectiveSupply = INITIAL_SUPPLY + ((currentSupply - INITIAL_SUPPLY) / 2);
    return (effectiveSupply * quorumNumerator()) / quorumDenominator();
}
```

### **Giải Pháp 3: Distribute More Voting Power** (Alternative)

Phân phối nhiều tokens hơn cho voters hoặc mint thêm cho voters theo thời gian.

---

## 🧪 Test Results

### **Scenario A: WITHOUT BURN**
```
✅ Years 1-10: Success (25B minted)
❌ Year 11: FAIL - Quorum (2.5B) > Voting Power (2.4B)
```

### **Scenario B: WITH 50% BURN**
```
✅ Years 1-25: ALL SUCCESS (40B minted, 18.75B burned)
✅ Final Supply: 21.25B
✅ Final Quorum: 2.125B < Voting Power: 2.4B ✅
```

---

## 📝 Best Practices

### **Cho DAO Members**

1. **Plan Ahead**: Mint proposals cần ~11 days để complete
2. **Check Capacity**: Verify remaining mint capacity trước khi propose
3. **Purpose Clear**: Luôn ghi rõ mục đích mint trong proposal
4. **Monitor Quorum**: Theo dõi quorum vs voting power

### **Cho Developers**

1. **Use yearCreated**: Luôn dùng `yearCreated` field để track requests
2. **Handle Expiry**: Cleanup expired requests định kỳ
3. **Test Thoroughly**: Test cả edge cases (year transitions, phase changes)
4. **Monitor Events**: Listen to mint events để track activity

### **Cho Governance**

1. **Annual Planning**: Plan mint schedule cho cả năm
2. **Burn Strategy**: Quyết định burn rate phù hợp
3. **Emergency Response**: Có plan cho emergency situations
4. **Transparency**: Public tất cả mint decisions

---

## 🔍 View Functions

### **Check Remaining Capacity**
```solidity
// Capacity còn lại của năm hiện tại
function getRemainingMintCapacity() external view returns (uint256)

// Capacity của năm cụ thể
function getRemainingMintCapacityForYear(uint256 year) external view returns (uint256)
```

### **Check Minted Amount**
```solidity
// Đã mint trong năm hiện tại
function getMintedThisYear() external view returns (uint256)

// Đã mint trong năm cụ thể
function getMintedAmountForYear(uint256 year) external view returns (uint256)
```

### **Check Pending Amount**
```solidity
// Pending của năm cụ thể
function getPendingMintAmountForYear(uint256 year) external view returns (uint256)

// Tổng pending tất cả các năm
function getTotalPendingMintAmount() external view returns (uint256)
```

### **Check Current State**
```solidity
// Năm mint hiện tại (1-25)
uint256 currentMintYear = token.currentMintYear();

// Tier hiện tại (1, 2, 3, hoặc 0 nếu ended)
uint256 tier = token.getCurrentMintTier();

// Thời gian đến năm tiếp theo
uint256 timeLeft = token.getTimeUntilNextMintYear();

// Max mintable supply (40B)
uint256 maxMintable = token.getMaxMintableSupply();
```

---

## 🚨 Error Handling

### **Common Errors**

```solidity
// Trước 01/01/2025
error MintingPeriodNotStarted();

// Sau 31/12/2049
error MintingPeriodEnded();

// Vượt quá annual cap
error ExceedsAnnualMintCap(uint256 requested, uint256 available);

// Vượt quá max supply (50B)
error ExceedsMaxSupply(uint256 resultingSupply, uint256 maxSupply);

// Request đã execute
error AlreadyExecuted();

// Chưa đủ delay
error MintDelayNotMet();

// Request đã expire
error RequestExpired();

// Direct mint disabled
error DirectMintDisabled();
```

---

## 📚 References

- **Contract**: `contracts/core/HyraToken.sol`
- **Governor**: `contracts/core/HyraGovernor.sol`
- **Timelock**: `contracts/core/HyraTimelock.sol`
- **Tests**: `test/HyraToken.DAO.25Years.Full.test.ts`

---

## 📞 Support

Nếu có câu hỏi về cơ chế mint, vui lòng liên hệ:
- **Documentation**: `docs/`
- **Tests**: `test/`
- **GitHub Issues**: [Create an issue]

---

**Last Updated**: 2024
**Version**: 1.0.0
**Status**: ✅ Production Ready
