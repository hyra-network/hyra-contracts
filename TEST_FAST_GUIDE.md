# 🚀 Hướng dẫn Test Nhanh (Bỏ qua Delays)

## 📋 Tổng quan

Tất cả các delays trong contracts Hyra:

| Contract | Delay | Giá trị | Mục đích |
|----------|-------|---------|----------|
| **HyraToken** | `MINT_EXECUTION_DELAY` | 2 days | Mint request phải chờ 2 ngày |
| **HyraToken** | `REQUEST_EXPIRY_PERIOD` | 365 days | Request hết hạn sau 1 năm |
| **HyraTimelock** | `minDelay` | 2 days (default) | Operations phải chờ |
| **HyraTimelock** | `UPGRADE_DELAY` | 7 days | Upgrade thường |
| **HyraTimelock** | `EMERGENCY_UPGRADE_DELAY` | 2 days | Emergency upgrade |
| **SecureProxyAdmin** | `UPGRADE_DELAY` | 48 hours | Upgrade proxy |
| **SecureProxyAdmin** | `EMERGENCY_DELAY` | 2 hours | Emergency |
| **TokenVesting** | `MIN_VESTING_DURATION` | 30 days | Vesting tối thiểu |
| **SecureExecutorManager** | `executorCooldownPeriod` | 1 hour | Executor cooldown |
| **MultiSigRoleManager** | `ACTION_TIMEOUT` | 7 days | Action timeout |
| **TimeLockActions** | `DEFAULT_DELAY` | 48 hours | Default delay |

---

## ✅ Giải pháp 1: Hardhat Time Manipulation (Khuyến nghị)

### Cách dùng trong test:

```typescript
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Fast Mint Test", function () {
  it("Should mint after fast-forwarding time", async function () {
    // 1. Create mint request
    await token.createMintRequest(recipient, amount, "Test");
    
    // 2. Fast forward 2 days
    await time.increase(2 * 24 * 60 * 60); // 2 days in seconds
    
    // 3. Execute immediately
    await token.executeMintRequest(0);
    
    // ✅ Done! No need to wait 2 days in real time
  });
});
```

### Các helper functions:

```typescript
// Fast forward time
await time.increase(seconds);

// Fast forward to specific timestamp
await time.increaseTo(timestamp);

// Get latest block timestamp
const currentTime = await time.latest();

// Mine new block
await ethers.provider.send("evm_mine", []);
```

---

## ✅ Giải pháp 2: Deploy với Hardhat Network (Local)

Hardhat local network cho phép manipulate time tùy ý:

```bash
# 1. Start local node
npx hardhat node

# 2. Deploy contracts (terminal khác)
npx hardhat run scripts/deploy-proxy-sepolia.ts --network localhost

# 3. Run tests với time manipulation
npx hardhat test test/FastMintTest.test.ts --network localhost
```

---

## ✅ Giải pháp 3: Test Script với Time Helpers

File: `test/FastMintTest.test.ts`

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Fast Mint Test", function () {
  let token, owner, recipient;
  const MINT_AMOUNT = ethers.parseEther("1000");

  beforeEach(async function () {
    [owner, recipient] = await ethers.getSigners();
    
    // Deploy token
    const HyraToken = await ethers.getContractFactory("HyraToken");
    token = await HyraToken.deploy();
    await token.initialize(
      "HYRA",
      "HYRA",
      ethers.parseEther("1000000"),
      owner.address,
      owner.address
    );
  });

  it("Test 1: Create mint request", async function () {
    await token.connect(owner).createMintRequest(
      recipient.address,
      MINT_AMOUNT,
      "Test mint"
    );
    
    const request = await token.mintRequests(0);
    expect(request.executed).to.equal(false);
  });

  it("Test 2: Execute after fast-forward", async function () {
    // Create request
    await token.connect(owner).createMintRequest(
      recipient.address,
      MINT_AMOUNT,
      "Test mint"
    );
    
    // Fast forward 2 days
    await time.increase(2 * 24 * 60 * 60);
    
    // Execute
    await token.executeMintRequest(0);
    
    // Verify
    const balance = await token.balanceOf(recipient.address);
    expect(balance).to.equal(MINT_AMOUNT);
  });

  it("Test 3: Multiple mints in sequence", async function () {
    for (let i = 0; i < 3; i++) {
      // Create
      await token.connect(owner).createMintRequest(
        recipient.address,
        MINT_AMOUNT,
        `Test mint ${i}`
      );
      
      // Fast forward
      await time.increase(2 * 24 * 60 * 60);
      
      // Execute
      await token.executeMintRequest(i);
    }
    
    const balance = await token.balanceOf(recipient.address);
    expect(balance).to.equal(MINT_AMOUNT * 3n);
  });
});
```

---

## ✅ Giải pháp 4: Script Test Nhanh

File: `scripts/test-fast-mint.ts`

```typescript
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

async function main() {
  console.log("=== Fast Mint Test ===\n");

  const [owner, recipient] = await ethers.getSigners();
  
  // Load deployed contract
  const tokenAddress = "0x4722887361ccaCB6A122331C9BFc24dDC6cd0890";
  const token = await ethers.getContractAt("HyraToken", tokenAddress);

  // 1. Create mint request
  console.log("1. Creating mint request...");
  await (await token.createMintRequest(
    recipient.address,
    ethers.parseEther("1000"),
    "Test fast mint"
  )).wait();
  console.log("   ✅ Created");

  // 2. Fast forward 2 days
  console.log("\n2. Fast forwarding 2 days...");
  await time.increase(2 * 24 * 60 * 60);
  console.log("   ✅ Time advanced");

  // 3. Execute
  console.log("\n3. Executing mint...");
  await (await token.executeMintRequest(0)).wait();
  console.log("   ✅ Executed");

  // 4. Check balance
  const balance = await token.balanceOf(recipient.address);
  console.log(`\n✅ Final balance: ${ethers.formatEther(balance)} HYRA`);
}

main().catch(console.error);
```

**Chạy:**
```bash
npx hardhat run scripts/test-fast-mint.ts --network localhost
```

---

## ✅ Giải pháp 5: Anvil (Foundry) - Nhanh nhất

Nếu bạn dùng Foundry:

```bash
# Start anvil with auto-mining
anvil --block-time 0

# In test:
vm.warp(block.timestamp + 2 days);
```

---

## 🎯 So sánh các phương án

| Phương án | Tốc độ | Độ khó | Khuyến nghị |
|-----------|--------|--------|-------------|
| **Time Manipulation** | ⚡⚡⚡ Nhanh nhất | ⭐ Dễ | ✅ Dùng cho test |
| **Hardhat Localhost** | ⚡⚡ Nhanh | ⭐⭐ Trung bình | ✅ Dùng cho dev |
| **Mock Contracts** | ⚡ Chậm hơn | ⭐⭐⭐ Khó | ❌ Không cần thiết |
| **Testnet** | 🐌 Rất chậm | ⭐ Dễ | ❌ Chỉ dùng staging |

---

## 📝 Lệnh chạy test

### Test toàn bộ:
```bash
npx hardhat test
```

### Test file cụ thể:
```bash
npx hardhat test test/FastMintTest.test.ts
```

### Test với gas report:
```bash
REPORT_GAS=true npx hardhat test
```

### Test với coverage:
```bash
npx hardhat coverage
```

---

## ⚠️ Lưu ý quan trọng

1. **Time manipulation chỉ hoạt động trên Hardhat/Anvil local network**
   - ❌ Không dùng được trên Sepolia, Base Sepolia
   - ✅ Dùng được trên `localhost`, `hardhat` network

2. **Không thể thay đổi delay trên mainnet/testnet**
   - Delays là `constant`, hard-coded
   - Chỉ có thể upgrade contract để thay đổi

3. **Time manipulation không ảnh hưởng real time**
   - Chỉ thay đổi `block.timestamp` trong EVM
   - Không làm máy tính của bạn chạy nhanh hơn 😄

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install --save-dev @nomicfoundation/hardhat-network-helpers

# 2. Run test
npx hardhat test test/FastMintTest.test.ts

# 3. Xem kết quả ngay lập tức!
```

---

## 📚 Tài liệu tham khảo

- [Hardhat Network Helpers](https://hardhat.org/hardhat-network-helpers/docs/overview)
- [Time Manipulation Guide](https://hardhat.org/hardhat-network-helpers/docs/reference#time)
- [Hardhat Testing Guide](https://hardhat.org/tutorial/testing-contracts)

---

## ✅ Kết luận

**Để test nhanh mà không chờ delays:**
1. ✅ Dùng `@nomicfoundation/hardhat-network-helpers`
2. ✅ Gọi `time.increase(seconds)` để fast-forward
3. ✅ Chạy test trên `localhost` hoặc `hardhat` network
4. ✅ Tất cả tests chạy trong vài giây thay vì vài ngày!

**Không cần:**
- ❌ Tạo mock contracts
- ❌ Modify source code
- ❌ Đợi thật 2 ngày trên testnet

🎉 **Happy Testing!**

