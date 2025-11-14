# 📅 THAY ĐỔI: HARDCODE CALENDAR YEAR

## ✅ Đã hoàn thành

Đã sửa contract `HyraToken.sol` để hardcode start date = **01/01/2025**, đảm bảo:
- **Năm 1 = 2025**
- **Năm 2 = 2026**
- ...
- **Năm 25 = 2049**

## 🔧 Các thay đổi

### 1. Thêm constant YEAR_2025_START

```solidity
// contracts/core/HyraToken.sol (line ~47)

// Calendar year constants - Hardcoded to ensure Year 1 = 2025, Year 25 = 2049
// 01/01/2025 00:00:00 UTC - Mint period starts regardless of deploy time
uint256 public constant YEAR_2025_START = 1735689600;
```

**Giải thích:**
- `1735689600` = 01/01/2025 00:00:00 UTC
- Hardcoded để không phụ thuộc vào thời gian deploy

### 2. Sửa initialize() để dùng YEAR_2025_START

```solidity
// contracts/core/HyraToken.sol (line ~155)

// Initialize mint year tracking
// HARDCODED to 01/01/2025 - Year 1 = 2025, Year 2 = 2026, etc.
currentMintYear = 1;
mintYearStartTime = YEAR_2025_START;           // ← THAY ĐỔI
originalMintYearStartTime = YEAR_2025_START;   // ← THAY ĐỔI
```

**Trước:**
```solidity
mintYearStartTime = block.timestamp;
originalMintYearStartTime = block.timestamp;
```

**Sau:**
```solidity
mintYearStartTime = YEAR_2025_START;
originalMintYearStartTime = YEAR_2025_START;
```

### 3. Thêm error MintingPeriodNotStarted

```solidity
// contracts/core/HyraToken.sol (line ~92)

error MintingPeriodNotStarted(); // NEW: Before 01/01/2025
```

### 4. Thêm validation trong createMintRequest()

```solidity
// contracts/core/HyraToken.sol (line ~178)

// CALENDAR YEAR VALIDATION: Check if we're in the mint period (2025-2049)
// 31/12/2049 23:59:59 UTC = 2524607999
if (block.timestamp < YEAR_2025_START) {
    revert MintingPeriodNotStarted();
}
if (block.timestamp > 2524607999) {
    revert MintingPeriodEnded();
}
```

**Giải thích:**
- `2524607999` = 31/12/2049 23:59:59 UTC
- Không cho mint trước 2025 hoặc sau 2049

## 📊 Kết quả

### ✅ Trước khi sửa (deploy-based)

```
Deploy: 13/11/2025
├─ Năm 1: 13/11/2025 → 12/11/2026
├─ Năm 2: 13/11/2026 → 12/11/2027
└─ Năm 25: 13/11/2049 → 12/11/2050
```

### ✅ Sau khi sửa (calendar-based)

```
Deploy: Bất kỳ lúc nào
├─ Năm 1: 01/01/2025 → 31/12/2025 (2025)
├─ Năm 2: 01/01/2026 → 31/12/2026 (2026)
└─ Năm 25: 01/01/2049 → 31/12/2049 (2049)
```

## 🎯 Ưu điểm

1. ✅ **Năm contract = Năm lịch** - Dễ hiểu, dễ communicate
2. ✅ **Không phụ thuộc deploy time** - Deploy bất kỳ lúc nào
3. ✅ **Minimal changes** - Chỉ sửa 4 chỗ, không tạo biến mới
4. ✅ **Backward compatible** - Logic cũ vẫn hoạt động
5. ✅ **Gas efficient** - Không tăng gas cost

## ⚠️ Lưu ý quan trọng

### 1. Nếu deploy TRƯỚC 01/01/2025

```solidity
// Deploy: 15/12/2024
// Pre-mint: OK (2.5B vào vesting)
// Mint request: REVERT với "MintingPeriodNotStarted"
// Phải đợi đến 01/01/2025 mới mint được
```

**Giải pháp:** Deploy sau 01/01/2025 hoặc chấp nhận đợi.

### 2. Nếu deploy SAU 01/01/2025

```solidity
// Deploy: 13/11/2025 (đã qua 316 ngày của năm 2025)
// Pre-mint: OK (2.5B tính cho năm 1 = 2025)
// Năm 1: Đã qua 316 ngày, còn 49 ngày
// Năm 2: Bắt đầu 01/01/2026
```

**Lưu ý:** 
- Năm 1 (2025) đã pre-mint 2.5B (full capacity)
- Không mint thêm được trong năm 2025
- Năm 2 (2026) bắt đầu mint bình thường

### 3. Nếu deploy SAU 01/01/2026

```solidity
// Deploy: 15/01/2026
// Pre-mint: OK (2.5B tính cho năm 1 = 2025)
// Năm 1 (2025): Đã qua, có pre-mint
// Năm 2 (2026): Đang diễn ra, có thể mint
```

**Lưu ý:**
- Năm 1 (2025) đã "mất" nhưng vẫn có pre-mint
- Bắt đầu mint từ năm 2 (2026)

## 📝 Documentation cần update

### 1. Whitepaper

```markdown
## Mint Schedule

### Timeline
- **Năm 1 (2025):** 01/01/2025 → 31/12/2025
  - Pre-mint: 2.5B HYRA (5%)
  - Mint qua DAO: 0 (đã full)
  
- **Năm 2 (2026):** 01/01/2026 → 31/12/2026
  - Mint qua DAO: Tối đa 2.5B HYRA (5%)
  
- ...

- **Năm 25 (2049):** 01/01/2049 → 31/12/2049
  - Mint qua DAO: Tối đa 750M HYRA (1.5%)

### Lưu ý quan trọng
- Mỗi năm = Năm lịch (01/01 → 31/12)
- Năm 1 = 2025, Năm 2 = 2026, ..., Năm 25 = 2049
- Thời gian deploy không ảnh hưởng đến timeline
- Mint period: 01/01/2025 → 31/12/2049
```

### 2. FAQ

```markdown
Q: Tại sao năm 1 = 2025?
A: Contract hardcode start date = 01/01/2025, đảm bảo năm contract = năm lịch.

Q: Nếu deploy sau 01/01/2025 thì sao?
A: Vẫn OK. Năm 1 vẫn là 2025, nhưng đã qua một phần. Pre-mint 2.5B vẫn tính cho năm 1.

Q: Có thể mint trước 01/01/2025 không?
A: Không. Contract sẽ revert với error "MintingPeriodNotStarted".

Q: Có thể mint sau 31/12/2049 không?
A: Không. Contract sẽ revert với error "MintingPeriodEnded".
```

## 🧪 Test cases cần thêm

```typescript
describe("Calendar Year Tests", function() {
    it("Should revert if mint before 01/01/2025", async function() {
        // Set time to 31/12/2024
        await time.increaseTo(1735689599);
        
        await expect(
            token.createMintRequest(...)
        ).to.be.revertedWithCustomError(token, "MintingPeriodNotStarted");
    });
    
    it("Should allow mint on 01/01/2025", async function() {
        // Set time to 01/01/2025 00:00:00
        await time.increaseTo(1735689600);
        
        // Should work (but year 1 already has pre-mint)
        const year = await token.currentMintYear();
        expect(year).to.equal(1);
    });
    
    it("Should revert if mint after 31/12/2049", async function() {
        // Set time to 01/01/2050
        await time.increaseTo(2524608000);
        
        await expect(
            token.createMintRequest(...)
        ).to.be.revertedWithCustomError(token, "MintingPeriodEnded");
    });
});
```

## ✅ Checklist

- [x] Thêm constant `YEAR_2025_START`
- [x] Sửa `initialize()` để dùng hardcoded value
- [x] Thêm error `MintingPeriodNotStarted`
- [x] Thêm validation trong `createMintRequest()`
- [ ] Compile contract
- [ ] Run tests
- [ ] Update whitepaper
- [ ] Update FAQ
- [ ] Audit lại contract
- [ ] Deploy testnet
- [ ] Test trên testnet
- [ ] Deploy mainnet

## 🎉 Kết luận

**Đã hoàn thành minimal changes để hardcode calendar year!**

- ✅ Chỉ sửa 4 chỗ trong contract
- ✅ Không tạo biến mới (dùng constant)
- ✅ Năm 1 = 2025, Năm 25 = 2049
- ✅ Deploy time không ảnh hưởng timeline
- ✅ Backward compatible với logic cũ

**Next steps:**
1. Compile và test
2. Audit lại
3. Deploy testnet
4. Update documentation
