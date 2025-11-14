# 🧪 HƯỚNG DẪN CHẠY BỘ TEST MINT SCHEDULE

## 📋 Tổng quan

Bộ test case đầy đủ cho hệ thống mint token HYRA theo thời gian (25 năm: 2025-2049).

**File test:** `test/HyraToken.MintSchedule.Complete.test.ts`

## 🎯 Thông số hệ thống được test

### Tổng quan
- **Tổng cung:** 50 tỷ HYRA (MAX_SUPPLY)
- **Mint tối đa:** 80% = 40 tỷ HYRA (qua DAO)
- **Không mint:** 20% = 10 tỷ HYRA (bị khóa vĩnh viễn)

### Phase 1 (Năm 1-10: 2025-2034)
- **Tổng:** 50% = 25 tỷ HYRA
- **Năm 2025:** Pre-mint 5% = 2.5 tỷ HYRA (ngay lập tức)
- **Năm 2026-2034:** Mint qua DAO, mỗi năm tối đa 5% = 2.5 tỷ HYRA

### Phase 2 (Năm 11-15: 2035-2039)
- **Tổng:** 15% = 7.5 tỷ HYRA
- **Mỗi năm tối đa:** 3% = 1.5 tỷ HYRA

### Phase 3 (Năm 16-25: 2040-2049)
- **Tổng:** 15% = 7.5 tỷ HYRA
- **Mỗi năm tối đa:** 1.5% = 750 triệu HYRA

## 🚀 Cách chạy test

### Chạy toàn bộ test suite
```bash
npx hardhat test test/HyraToken.MintSchedule.Complete.test.ts
```

### Chạy một suite cụ thể
```bash
# Suite 1: Pre-mint năm 2025
npx hardhat test test/HyraToken.MintSchedule.Complete.test.ts --grep "Suite 1"

# Suite 2: Phase 1
npx hardhat test test/HyraToken.MintSchedule.Complete.test.ts --grep "Suite 2"

# Suite 5: Tổng lượng mint
npx hardhat test test/HyraToken.MintSchedule.Complete.test.ts --grep "Suite 5"

# Suite 9: Stress tests
npx hardhat test test/HyraToken.MintSchedule.Complete.test.ts --grep "Suite 9"

# Suite 13: Full system test
npx hardhat test test/HyraToken.MintSchedule.Complete.test.ts --grep "Suite 13"
```

### Chạy một test case cụ thể
```bash
# Test mint full 25 năm
npx hardhat test test/HyraToken.MintSchedule.Complete.test.ts --grep "13.1"
```

## 📊 Cấu trúc bộ test

### Suite 1: Pre-mint năm 2025 (5 test cases)
- ✅ Kiểm tra pre-mint đúng 5%
- ✅ Remaining capacity = 0
- ❌ Không mint thêm trong năm 2025
- ✅ Verify totalMintedSupply
- ✅ Verify mintedByYear[1]

### Suite 2: Phase 1 - Năm 2-10 (6 test cases)
- ✅ Mint đúng limit mỗi năm (2.5B)
- ❌ Mint vượt limit → revert
- ✅ Mint từng phần trong năm
- ❌ Mint double vượt limit → revert
- ✅ Loop mint tất cả năm 2-10
- ✅ Remaining capacity giảm dần

### Suite 3: Phase 2 - Năm 11-15 (6 test cases)
- ✅ Mint đúng limit mỗi năm (1.5B)
- ❌ Mint vượt limit → revert
- ✅ Loop mint tất cả năm 11-15
- ✅ Tier transition 10 → 11
- ❌ Không mint 2.5B trong năm 11
- ✅ Mint từng phần trong năm

### Suite 4: Phase 3 - Năm 16-25 (7 test cases)
- ✅ Mint đúng limit mỗi năm (750M)
- ❌ Mint vượt limit → revert
- ✅ Loop mint tất cả năm 16-25
- ✅ Tier transition 15 → 16
- ❌ Không mint 1.5B trong năm 16
- ✅ Mint từng phần trong năm
- ❌ Năm 26 không được mint

### Suite 5: Tổng lượng mint (5 test cases)
- ✅ Tổng mint tối đa = 42.5B
- ✅ Mint full 25 năm = 40B
- ❌ Không vượt MAX_SUPPLY
- ✅ 20% (10B) không được mint
- ✅ TotalSupply ≤ MAX_SUPPLY

### Suite 6: Quyền DAO (6 test cases)
- ❌ User không thể tạo mint request
- ✅ Owner có thể tạo mint request
- ❌ User không thể cancel request
- ✅ Owner có thể cancel request
- ✅ Ai cũng execute được sau delay
- ✅ Transfer ownership test

### Suite 7: Edge cases (10 test cases)
- ✅ Mint giây đầu tiên của năm
- ✅ Mint giây cuối cùng của năm
- ✅ Mint đúng 00:00:00
- ✅ Mint đúng 23:59:59
- ✅ Year transition chính xác
- ✅ Fast forward nhiều năm
- ✅ Amount = 0 → revert
- ✅ Amount = 1 wei (minimum)
- ✅ Amount = exact cap
- ✅ Amount = cap + 1 wei → revert

### Suite 8: Mint request lifecycle (9 test cases)
- ❌ Execute trước delay → revert
- ✅ Execute sau đúng 2 ngày
- ❌ Execute đã executed → revert
- ❌ Execute đã cancelled → revert
- ❌ Execute expired → revert
- ✅ Cancel trước execute
- ❌ Cancel không tồn tại → revert
- ✅ Multiple requests cùng năm
- ✅ Request data integrity

### Suite 9: Stress tests (5 test cases)
- ✅ Mint full 25 năm
- ✅ Mint 50% capacity 25 năm
- ✅ Random mint 10 năm
- ✅ Multiple small mints mỗi năm
- ✅ Verify remaining capacity

### Suite 10: View functions (10 test cases)
- ✅ getRemainingMintCapacity()
- ✅ getRemainingMintCapacityForYear()
- ✅ getMintedAmountForYear()
- ✅ getPendingMintAmountForYear()
- ✅ getCurrentMintTier()
- ✅ getMintedThisYear()
- ✅ getTimeUntilNextMintYear()
- ✅ getMaxMintableSupply()
- ✅ currentMintYear
- ✅ totalMintedSupply

### Suite 11: Invalid inputs (10 test cases)
- ❌ Recipient = address(0)
- ❌ Amount = 0
- ❌ Execute request không tồn tại
- ❌ Cancel request không tồn tại
- ❌ Mint sau năm 25
- ❌ Mint năm 50
- ❌ getRemainingMintCapacityForYear(0)
- ❌ getRemainingMintCapacityForYear(26)
- ❌ getMintedAmountForYear(0)
- ❌ getPendingMintAmountForYear(100)

### Suite 12: Integration tests (6 test cases)
- ✅ Mint đều đặn 50% capacity
- ✅ Mint giảm dần theo năm
- ✅ Multiple recipients
- ✅ Cancel selective requests
- ✅ Mint gần hết capacity
- ✅ Pause không ảnh hưởng mint

### Suite 13: Comprehensive summary (1 test case)
- ✅ **FULL SYSTEM TEST** - Mint toàn bộ 25 năm với verification chi tiết

## 📈 Tổng số test cases

- **Tổng cộng:** 81 test cases
- **Positive tests (✅):** 56 cases
- **Negative tests (❌):** 25 cases

## ⏱️ Thời gian chạy

- **Suite nhỏ (1-4, 6-8, 10-11):** ~10-30 giây mỗi suite
- **Suite 5 (Tổng lượng mint):** ~2-3 phút
- **Suite 9 (Stress tests):** ~5-10 phút
- **Suite 13 (Full system):** ~10-15 phút
- **Toàn bộ test:** ~30-45 phút

## 🎯 Coverage

Bộ test này bao phủ:

### ✅ Logic mint từng năm
- Mint đúng limit mỗi năm
- Mint vượt limit → revert
- Mint đúng theo từng phase

### ✅ Pre-mint 2025
- 2025 mint đúng 5%
- Không mint thêm trong 2025

### ✅ Tổng lượng mint
- Không vượt 80% cung
- 20% bị khóa vĩnh viễn

### ✅ Quyền DAO
- Chỉ owner mint được
- User thường → revert

### ✅ Edge cases
- Boundary của năm (00:00:00 / 23:59:59)
- Mint double cùng năm → revert
- Mint sai năm → revert
- Amount = 0, 1 wei, exact cap, cap+1

### ✅ Stress tests
- Loop 25 năm liên tiếp
- Mint full capacity
- Random amounts
- Multiple requests

## 🐛 Debug

Nếu test fail, kiểm tra:

1. **Contract đã compile chưa:**
   ```bash
   npx hardhat compile
   ```

2. **Hardhat network config:**
   - Đảm bảo `hardhat.config.ts` có network config đúng
   - Mining mode: auto

3. **Gas limit:**
   - Một số test cần gas cao (stress tests)
   - Tăng gas limit nếu cần

4. **Timeout:**
   - Stress tests có timeout 5-10 phút
   - Full system test có timeout 10 phút

## 📝 Notes

- **KHÔNG chỉnh sửa contract:** Bộ test này chỉ test, không sửa code Solidity
- **Time manipulation:** Sử dụng `@nomicfoundation/hardhat-network-helpers` để fast-forward time
- **Proxy pattern:** Test sử dụng ERC1967Proxy để deploy contract
- **Verbose output:** Suite 13 có console.log chi tiết để theo dõi progress

## 🎉 Kết quả mong đợi

Khi chạy thành công, bạn sẽ thấy:

```
  🧪 HYRA TOKEN - BỘ TEST MINT SCHEDULE ĐẦY ĐỦ
    📋 Suite 1: Pre-mint năm 2025
      ✓ 1.1: Năm 2025 phải pre-mint đúng 5%
      ✓ 1.2: Năm 2025 đã mint 5%, remaining = 0
      ...
    📋 Suite 13: Comprehensive summary
      ✓ 13.1: FULL SYSTEM TEST
      
  81 passing (45m)
```

## 🔗 Liên quan

- Contract: `contracts/core/HyraToken.sol`
- Interface: `contracts/interfaces/IHyraToken.sol`
- Deployment: `scripts/deploy/`

---

**Tác giả:** Kiro AI Assistant  
**Ngày tạo:** 2025-01-13  
**Version:** 1.0.0
