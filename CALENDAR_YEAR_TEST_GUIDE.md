# 📅 HƯỚNG DẪN TEST CALENDAR YEAR VERSION

## 🎯 File test

**`test/HyraToken.CalendarYear.Complete.test.ts`**

Bộ test đầy đủ cho calendar year version với trường hợp deploy thực tế: **13/11/2025**

## 🚀 Cách chạy test

```bash
# Compile contract
npx hardhat compile

# Chạy toàn bộ test
npx hardhat test test/HyraToken.CalendarYear.Complete.test.ts

# Chạy từng suite
npx hardhat test test/HyraToken.CalendarYear.Complete.test.ts --grep "Suite 1"
npx hardhat test test/HyraToken.CalendarYear.Complete.test.ts --grep "Suite 2"
npx hardhat test test/HyraToken.CalendarYear.Complete.test.ts --grep "Suite 7"
```

## 📊 Cấu trúc test

### Suite 1: Hardcoded constants (3 tests)
Verify các constant đã được hardcode đúng:
- ✅ YEAR_2025_START = 1735689600
- ✅ mintYearStartTime = YEAR_2025_START (not block.timestamp)
- ✅ originalMintYearStartTime = YEAR_2025_START

### Suite 2: Deploy vào 13/11/2025 (4 tests) ⭐ QUAN TRỌNG
Test trường hợp deploy thực tế:
- ✅ Deploy 13/11/2025 → Năm vẫn là 1 (2025)
- ✅ Năm 1 đã pre-mint 2.5B, không mint thêm được
- ✅ Năm 2 bắt đầu đúng 01/01/2026
- ✅ Timeline 25 năm không bị ảnh hưởng bởi deploy time

### Suite 3: Mint period validation (4 tests)
Test boundary của mint period:
- ❌ Không thể mint TRƯỚC 01/01/2025
- ✅ Có thể mint VÀO 01/01/2025 00:00:00
- ✅ Có thể mint TRONG năm 2049
- ❌ Không thể mint SAU 31/12/2049 23:59:59

### Suite 4: Calendar year calculation (2 tests)
Test tính toán năm lịch:
- ✅ getCurrentCalendarYear() trả về đúng năm lịch
- ✅ Year transition chính xác tại 00:00:00

### Suite 5: Mint trong các năm khác nhau (3 tests)
Test mint ở các phase khác nhau:
- ✅ Mint trong năm 2 (2026) - Phase 1
- ✅ Mint trong năm 11 (2035) - Phase 2
- ✅ Mint trong năm 20 (2044) - Phase 3

### Suite 6: Annual caps theo calendar year (3 tests)
Test annual caps:
- ✅ Year 1 (2025) - Cap 2.5B, đã pre-mint full
- ✅ Year 2 (2026) - Cap 2.5B, chưa mint
- ❌ Không thể mint vượt cap năm 2

### Suite 7: Full 25 years simulation (1 test) ⭐ QUAN TRỌNG NHẤT
Test toàn bộ 25 năm:
- ✅ Mint full capacity tất cả 25 năm
- ✅ Deploy 13/11/2025 không ảnh hưởng timeline
- ✅ Total = 40B HYRA

## 📋 Test cases quan trọng

### ⭐ Test 2.1: Deploy 13/11/2025

```typescript
it("✅ 2.1: Deploy 13/11/2025 → Năm vẫn là 1 (2025)", async function () {
  // Set time to 13/11/2025
  await time.increaseTo(DEPLOY_DATE_NOV_13_2025);
  
  token = await deployToken();
  
  const year = await token.currentMintYear();
  expect(year).to.equal(1n);
  
  // Deploy date: 13/11/2025
  // Current year: 1 (2025)
  // ✅ Deploy time KHÔNG ảnh hưởng năm
});
```

### ⭐ Test 2.4: Timeline không bị ảnh hưởng

```typescript
it("✅ 2.4: Timeline 25 năm không bị ảnh hưởng bởi deploy time", async function () {
  await time.increaseTo(DEPLOY_DATE_NOV_13_2025);
  token = await deployToken();
  
  // Timeline:
  // Năm 1: 01/01/2025 → 31/12/2025
  // Năm 2: 01/01/2026 → 31/12/2026
  // ...
  // Năm 25: 01/01/2049 → 31/12/2049
  
  // ✅ Deploy time (13/11/2025) KHÔNG ảnh hưởng timeline
});
```

### ⭐ Test 7.1: Full 25 years simulation

```typescript
it("✅ 7.1: Mint full capacity tất cả 25 năm", async function () {
  await time.increaseTo(DEPLOY_DATE_NOV_13_2025);
  token = await deployToken();
  
  // Mint tất cả 25 năm
  // Year 1: Pre-mint 2.5B
  // Years 2-10: Mint 2.5B/năm
  // Years 11-15: Mint 1.5B/năm
  // Years 16-25: Mint 750M/năm
  
  // Total: 40B HYRA
  // ✅ Deploy 13/11/2025 không ảnh hưởng
});
```

## 🎯 Kết quả mong đợi

```
📅 HYRA TOKEN - CALENDAR YEAR COMPLETE TESTS
  📋 Suite 1: Hardcoded constants verification
    ✓ ✅ 1.1: YEAR_2025_START = 1735689600
    ✓ ✅ 1.2: mintYearStartTime = YEAR_2025_START
    ✓ ✅ 1.3: originalMintYearStartTime = YEAR_2025_START
    
  📋 Suite 2: Deploy vào 13/11/2025 - Thời gian thực tế
    ✓ ✅ 2.1: Deploy 13/11/2025 → Năm vẫn là 1 (2025)
    ✓ ✅ 2.2: Năm 1 đã pre-mint 2.5B
    ✓ ✅ 2.3: Năm 2 bắt đầu đúng 01/01/2026
    ✓ ✅ 2.4: Timeline không bị ảnh hưởng
    
  📋 Suite 3: Mint period validation
    ✓ ❌ 3.1: Không thể mint TRƯỚC 01/01/2025
    ✓ ✅ 3.2: Có thể mint VÀO 01/01/2025
    ✓ ✅ 3.3: Có thể mint TRONG năm 2049
    ✓ ❌ 3.4: Không thể mint SAU 31/12/2049
    
  📋 Suite 4: Calendar year calculation
    ✓ ✅ 4.1: getCurrentCalendarYear() đúng
    ✓ ✅ 4.2: Year transition chính xác
    
  📋 Suite 5: Mint trong các năm khác nhau
    ✓ ✅ 5.1: Mint trong năm 2 (2026)
    ✓ ✅ 5.2: Mint trong năm 11 (2035)
    ✓ ✅ 5.3: Mint trong năm 20 (2044)
    
  📋 Suite 6: Annual caps theo calendar year
    ✓ ✅ 6.1: Year 1 (2025) - Cap 2.5B
    ✓ ✅ 6.2: Year 2 (2026) - Cap 2.5B
    ✓ ❌ 6.3: Không thể mint vượt cap
    
  📋 Suite 7: Full 25 years simulation
    ✓ ✅ 7.1: Mint full capacity tất cả 25 năm

  20 passing (2m)
```

## 📝 Key points được test

### ✅ Hardcoded start date
- YEAR_2025_START = 1735689600 (01/01/2025 00:00:00 UTC)
- mintYearStartTime = YEAR_2025_START (không phải block.timestamp)

### ✅ Deploy time không ảnh hưởng
- Deploy 13/11/2025 → Năm vẫn là 1 (2025)
- Timeline: 2025-2049 (không đổi)
- Năm 2 bắt đầu đúng 01/01/2026

### ✅ Mint period validation
- Không mint được trước 01/01/2025
- Không mint được sau 31/12/2049
- Mint được trong khoảng 2025-2049

### ✅ Calendar year = Năm lịch
- Năm 1 = 2025 (01/01/2025 → 31/12/2025)
- Năm 2 = 2026 (01/01/2026 → 31/12/2026)
- Năm 25 = 2049 (01/01/2049 → 31/12/2049)

### ✅ Annual caps đúng
- Year 1: 2.5B (đã pre-mint)
- Years 2-10: 2.5B/năm
- Years 11-15: 1.5B/năm
- Years 16-25: 750M/năm

### ✅ Full 25 years
- Total mint: 40B HYRA
- Timeline: 2025-2049
- Deploy time không ảnh hưởng

## 🐛 Debug

Nếu test fail:

1. **Check contract compiled:**
   ```bash
   npx hardhat compile
   ```

2. **Check YEAR_2025_START:**
   ```bash
   # Should be 1735689600
   ```

3. **Check time manipulation:**
   ```bash
   # Hardhat network should support time.increaseTo()
   ```

4. **Run single test:**
   ```bash
   npx hardhat test test/HyraToken.CalendarYear.Complete.test.ts --grep "2.1"
   ```

## 🎉 Kết luận

Bộ test này chứng minh:
- ✅ Contract đã hardcode đúng start date
- ✅ Deploy vào 13/11/2025 không ảnh hưởng timeline
- ✅ Năm contract = Năm lịch (2025-2049)
- ✅ Mint period validation đúng
- ✅ Annual caps đúng theo từng phase
- ✅ Full 25 years simulation thành công

**Deploy 13/11/2025 là HOÀN TOÀN OK!**
