# 📊 Tổng hợp tất cả Delays trong Hyra Contracts

## 🔍 Danh sách đầy đủ các delays

### 1. **HyraToken.sol** ⭐ (Quan trọng nhất)

| Constant | Giá trị | Mục đích |
|----------|---------|----------|
| `MINT_EXECUTION_DELAY` | **2 days** | Mint request phải chờ 2 ngày mới execute được |
| `REQUEST_EXPIRY_PERIOD` | 365 days | Mint request hết hạn sau 1 năm |
| `YEAR_DURATION` | 365 days | Chu kỳ mint year (reset annual cap) |

**Code:**
```solidity
uint256 public constant MINT_EXECUTION_DELAY = 2 days;
uint256 public constant REQUEST_EXPIRY_PERIOD = 365 days;
uint256 public constant YEAR_DURATION = 365 days;
```

**Kiểm tra:**
```solidity
// Line 230-232
if (block.timestamp < request.approvedAt + MINT_EXECUTION_DELAY) {
    revert MintDelayNotMet();
}
```

---

### 2. **HyraTimelock.sol**

| Constant | Giá trị | Mục đích |
|----------|---------|----------|
| `minDelay` (constructor) | 2 days (default) | Delay cho tất cả operations |
| `UPGRADE_DELAY` | 7 days | Upgrade contract thường |
| `EMERGENCY_UPGRADE_DELAY` | 2 days | Emergency upgrade |

**Code:**
```solidity
uint256 public constant UPGRADE_DELAY = 7 days;
uint256 public constant EMERGENCY_UPGRADE_DELAY = 2 days;
```

---

### 3. **SecureProxyAdmin.sol**

| Constant | Giá trị | Mục đích |
|----------|---------|----------|
| `UPGRADE_DELAY` | 48 hours | Upgrade proxy |
| `EMERGENCY_DELAY` | 2 hours | Emergency upgrade |

**Code:**
```solidity
uint256 public constant UPGRADE_DELAY = 48 hours;
uint256 public constant EMERGENCY_DELAY = 2 hours;
```

---

### 4. **TokenVesting.sol**

| Constant | Giá trị | Mục đích |
|----------|---------|----------|
| `MIN_VESTING_DURATION` | 30 days | Vesting tối thiểu |
| `MAX_VESTING_DURATION` | 10 * 365 days | Vesting tối đa (10 năm) |

**Code:**
```solidity
uint256 public constant MIN_VESTING_DURATION = 30 days;
uint256 public constant MAX_VESTING_DURATION = 10 * 365 days;
```

---

### 5. **SecureExecutorManager.sol**

| Variable | Giá trị | Mục đích |
|----------|---------|----------|
| `executorCooldownPeriod` | 1 hour | Cooldown khi thay executor |

**Code:**
```solidity
uint256 public executorCooldownPeriod = 1 hours;
```

---

### 6. **MultiSigRoleManager.sol & SimpleMultiSigRoleManager.sol**

| Constant | Giá trị | Mục đích |
|----------|---------|----------|
| `ACTION_TIMEOUT` | 7 days | Action hết hạn sau 7 ngày |

**Code:**
```solidity
uint256 public constant ACTION_TIMEOUT = 7 days;
```

---

### 7. **TimeLockActions.sol**

| Constant | Giá trị | Mục đích |
|----------|---------|----------|
| `MIN_DELAY` | 2 hours | Delay tối thiểu |
| `MAX_DELAY` | 30 days | Delay tối đa |
| `DEFAULT_DELAY` | 48 hours | Delay mặc định |

**Code:**
```solidity
uint256 public constant MIN_DELAY = 2 hours;
uint256 public constant MAX_DELAY = 30 days;
uint256 public constant DEFAULT_DELAY = 48 hours;
```

---

## 🚀 Cách test nhanh (bỏ qua delays)

### ✅ Phương án: Hardhat Time Manipulation

**Không cần:**
- ❌ Tạo mock contracts
- ❌ Modify source code
- ❌ Đợi thật 2 ngày

**Chỉ cần:**
- ✅ Dùng `@nomicfoundation/hardhat-network-helpers`
- ✅ Gọi `time.increase(seconds)`
- ✅ Test chạy trong vài giây!

### Ví dụ:

```typescript
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Create mint request
await token.createMintRequest(recipient, amount, "Test");

// Fast forward 2 days
await time.increase(2 * 24 * 60 * 60);

// Execute immediately
await token.executeMintRequest(0);

// ✅ Done! No waiting!
```

### Chạy test:

```bash
# Test file cụ thể
npx hardhat test test/FastMintTest.test.ts

# Test toàn bộ
npx hardhat test

# Với gas report
REPORT_GAS=true npx hardhat test
```

---

## 📊 Kết quả test

```
Fast Mint Test (Time Manipulation)
  Fast Mint with Time Manipulation
    ✔ Should create and execute mint request after fast-forward
    ✔ Should handle multiple mint requests in sequence
    ✔ Should respect annual mint cap
    ✔ Should allow owner to cancel pending request
    ✔ Should handle request expiry
  Token Stats
    ✔ Should track minted amounts correctly

6 passing (306ms)
```

**Gas Report:**
- `createMintRequest`: ~175,580 gas
- `executeMintRequest`: ~139,430 gas
- `cancelMintRequest`: ~50,168 gas

---

## 📝 Files tạo ra

1. **TEST_FAST_GUIDE.md** - Hướng dẫn chi tiết test nhanh
2. **test/FastMintTest.test.ts** - Test suite với time manipulation
3. **DELAYS_SUMMARY.md** (file này) - Tổng hợp tất cả delays

---

## 🎯 Tóm tắt

| Delay quan trọng nhất | Giá trị | Cách bypass trong test |
|----------------------|---------|------------------------|
| **MINT_EXECUTION_DELAY** | 2 days | `time.increase(2 * 24 * 60 * 60)` |
| **Timelock minDelay** | 2 days | `time.increase(2 * 24 * 60 * 60)` |
| **UPGRADE_DELAY** | 7 days | `time.increase(7 * 24 * 60 * 60)` |

**Tất cả delays đều có thể bypass bằng time manipulation trong Hardhat!**

---

## 🔗 Tài liệu tham khảo

- [Hardhat Network Helpers](https://hardhat.org/hardhat-network-helpers/docs/overview)
- [Time Manipulation Guide](https://hardhat.org/hardhat-network-helpers/docs/reference#time)
- [TEST_FAST_GUIDE.md](./TEST_FAST_GUIDE.md) - Hướng dẫn chi tiết

---

✅ **Kết luận**: Tất cả delays đã được tìm ra và có giải pháp test nhanh!

