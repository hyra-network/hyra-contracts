# ⚡ Fast Test On-Chain (Base Sepolia)

## 🎯 Mục đích

Deploy contracts với **delays rất ngắn** lên Base Sepolia để test nhanh qua UI (Safe, BaseScan).

**Thay đổi:**
- ✅ `MINT_EXECUTION_DELAY` = **2 MINUTES** (thay vì 2 days)
- ✅ `TIMELOCK_MIN_DELAY` = **1 MINUTE** (thay vì 2 days)
- ✅ `REQUEST_EXPIRY_PERIOD` = **7 days** (thay vì 365 days)

---

## 📋 Deployed Contracts (Base Sepolia)

### Contract Addresses:

| Contract | Address | Link |
|----------|---------|------|
| **HyraTokenFastTest (proxy)** | `0x9e09C627bD42CE541ECA764849e8Ee9584077D9c` | [View](https://sepolia.basescan.org/address/0x9e09C627bD42CE541ECA764849e8Ee9584077D9c#code) |
| **HyraTimelock (proxy)** | `0x18BA2ee2e77A66E9fDaC35eaE6CfB92F9d66cf2e` | [View](https://sepolia.basescan.org/address/0x18BA2ee2e77A66E9fDaC35eaE6CfB92F9d66cf2e#code) |
| **HyraGovernor (proxy)** | `0x9CB4C7c83F7001f72D72E7A30002D913f021E189` | [View](https://sepolia.basescan.org/address/0x9CB4C7c83F7001f72D72E7A30002D913f021E189#code) |
| **TokenVesting (proxy)** | `0x4F50966Cc72C33521FAcD195a2d6bc6b13012663` | [View](https://sepolia.basescan.org/address/0x4F50966Cc72C33521FAcD195a2d6bc6b13012663#code) |

**Owner:** `0xa6154bF0334Db14F5f5CB02B3524AF4ABCaE6fF2` (Safe)

---

## 🚀 Hướng dẫn test mint qua Safe UI

### Bước 1: Mở Safe trên Base Sepolia

1. Vào: https://app.safe.global/home
2. Kết nối ví (owner của Safe)
3. Chọn network: **Base Sepolia**
4. Chọn Safe: `0xa6154bF0334Db14F5f5CB02B3524AF4ABCaE6fF2`

### Bước 2: Tạo mint request

1. Click **"New Transaction"**
2. Chọn **"Contract Interaction"**
3. Điền:
   - **To**: `0x9e09C627bD42CE541ECA764849e8Ee9584077D9c`
   - **Value**: `0`
4. Bật **"Custom data"** toggle
5. Paste ABI (minimal):

```json
[{"type":"function","name":"createMintRequest","stateMutability":"nonpayable","inputs":[{"type":"address","name":"_recipient"},{"type":"uint256","name":"_amount"},{"type":"string","name":"_purpose"}],"outputs":[{"type":"uint256","name":"requestId"}]},{"type":"function","name":"executeMintRequest","stateMutability":"nonpayable","inputs":[{"type":"uint256","name":"_requestId"}],"outputs":[]},{"type":"function","name":"cancelMintRequest","stateMutability":"nonpayable","inputs":[{"type":"uint256","name":"_requestId"}],"outputs":[]},{"type":"function","name":"getRemainingMintCapacity","stateMutability":"view","inputs":[],"outputs":[{"type":"uint256"}]},{"type":"function","name":"mintRequests","stateMutability":"view","inputs":[{"type":"uint256"}],"outputs":[{"type":"address","name":"recipient"},{"type":"uint256","name":"amount"},{"type":"uint256","name":"approvedAt"},{"type":"bool","name":"executed"},{"type":"string","name":"purpose"}]}]
```

6. Chọn function: **createMintRequest**
7. Điền parameters:
   - `_recipient`: địa chỉ nhận token (ví dụ: Safe hoặc ví test)
   - `_amount`: `1000000000000000000000` (1000 HYRA)
   - `_purpose`: `"Fast test mint"`
8. Submit → ký → execute

### Bước 3: Đợi 2 phút ⏱️

**Chỉ cần đợi 2 PHÚT** (không phải 2 ngày!)

Kiểm tra thời gian:
- Vào transaction hash → Logs → event `MintRequestApproved`
- Lấy `executionTime` (timestamp)
- Hoặc dùng script:

```bash
npx hardhat run scripts/check-mint-status.ts --network baseSepolia
```

### Bước 4: Execute mint request

Sau 2 phút:

1. Safe → New Transaction → Contract Interaction
2. To: `0x9e09C627bD42CE541ECA764849e8Ee9584077D9c`
3. Paste ABI (same as above)
4. Function: **executeMintRequest**
5. Parameter: `_requestId = 0` (hoặc ID từ bước 2)
6. Submit → ký → execute

### Bước 5: Kiểm tra kết quả

**Qua BaseScan:**
- Token balance: https://sepolia.basescan.org/token/0x9e09C627bD42CE541ECA764849e8Ee9584077D9c?a=YOUR_ADDRESS

**Qua script:**
```bash
npx hardhat run scripts/check-mint-status.ts --network baseSepolia
```

---

## 📊 So sánh Production vs Fast Test

| Feature | Production | Fast Test |
|---------|------------|-----------|
| MINT_EXECUTION_DELAY | 2 days | **2 MINUTES** ⚡ |
| TIMELOCK_MIN_DELAY | 2 days | **1 MINUTE** ⚡ |
| REQUEST_EXPIRY_PERIOD | 365 days | 7 days |
| Network | Mainnet | Base Sepolia Testnet |
| Purpose | Real usage | Quick testing |

---

## 🛠️ Scripts

### Deploy fast test contracts:
```bash
SAFE_ADDRESS=0xa6154bF0334Db14F5f5CB02B3524AF4ABCaE6fF2 \
npx hardhat run scripts/deploy-fast-test-base-sepolia-dev.ts --network baseSepolia
```

### Verify contracts:
```bash
npx hardhat run scripts/verify-fast-test-base-sepolia-dev.ts --network baseSepolia
```

### Check mint status:
```bash
npx hardhat run scripts/check-mint-status.ts --network baseSepolia
```

---

## ⚠️ Lưu ý quan trọng

1. **CHỈ DÙNG CHO TESTING**
   - Contracts này có delays rất ngắn
   - KHÔNG deploy lên mainnet
   - Chỉ dùng cho Base Sepolia testnet

2. **Bảo mật**
   - Owner là Safe multisig
   - Tất cả logic khác giống production
   - Chỉ thay đổi constants về time

3. **Test flow**
   - ✅ Test mint qua Safe UI
   - ✅ Test cancel request
   - ✅ Test request expiry
   - ✅ Test annual cap
   - ✅ Test all functions nhanh chóng

---

## 📝 Timeline test

```
00:00  →  Create mint request
          ↓
00:02  →  Execute mint request (sau 2 phút!)
          ↓
00:02  →  Token được mint ✅
```

**Tổng thời gian:** ~2 phút (thay vì 2 ngày!)

---

## 🎉 Kết luận

Với **HyraTokenFastTest**, bạn có thể:
- ✅ Test toàn bộ mint flow trong **2 phút**
- ✅ Test qua Safe UI trên Base Sepolia
- ✅ Verify tất cả functions hoạt động đúng
- ✅ Không cần đợi 2 ngày như production

**Perfect for rapid iteration and testing!** 🚀

