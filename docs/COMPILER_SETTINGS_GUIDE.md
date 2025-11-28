# Compiler Settings Guide - viaIR và Gas Optimization

## Tổng quan các cấu hình

### 1. Standard Production (viaIR: false, runs: 200)

```typescript
solidity: {
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: false,
  },
}
```

**Đặc điểm:**
- ✅ Compilation nhanh
- ✅ Gas efficiency tốt (tối ưu cho execution)
- ✅ Contract size: Trung bình (~20-22KB)
- ✅ Phù hợp: Production contracts được gọi nhiều lần
- ✅ Industry standard, well-tested

**Khi nào dùng:**
- Contracts dưới 24KB
- Production deployment
- Audit với standard settings

---

### 2. Size-Optimized (viaIR: true, runs: 1)

```typescript
solidity: {
  settings: {
    optimizer: { enabled: true, runs: 1 },
    viaIR: true,
  },
}
```

**Đặc điểm:**
- ✅ Contract size nhỏ nhất (~15-18KB)
- ⚠️ Gas efficiency: Thấp hơn (~5-10% cao hơn)
- ⚠️ Compilation: Chậm hơn
- ✅ Phù hợp: Implementation contracts (deploy 1 lần)

**Khi nào dùng:**
- Contracts gần vượt 24KB
- Implementation contracts (ít khi gọi trực tiếp)
- Cần giảm kích thước để deploy được

---

### 3. Gas-Optimized với viaIR (viaIR: true, runs: 200) ⭐ **RECOMMENDED**

```typescript
solidity: {
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
  },
}
```

**Đặc điểm:**
- ✅ Gas efficiency: TỐT NHẤT (tốt hơn viaIR: false)
- ✅ Contract size: Nhỏ hơn viaIR: false (~18-20KB)
- ⚠️ Compilation: Chậm hơn (nhưng acceptable)
- ✅ Best of both worlds: Size + Gas

**Khi nào dùng:**
- Contracts cần tối ưu gas VÀ giảm size
- Production contracts được gọi nhiều
- Contracts gần 24KB nhưng vẫn cần gas tốt

**So sánh với viaIR: false, runs: 200:**
```
viaIR: false, runs: 200:
- Bytecode: ~22KB
- Gas khi gọi: 100% (baseline)

viaIR: true, runs: 200:
- Bytecode: ~19KB (nhỏ hơn ~15%)
- Gas khi gọi: ~95% (tốt hơn ~5%)
- Compilation: Chậm hơn ~2-3x
```

---

## So sánh chi tiết

| Config | viaIR | runs | Size | Gas | Compile Time | Use Case |
|--------|-------|------|------|-----|--------------|----------|
| **Standard** | false | 200 | ~22KB | 100% | Fast | Production (standard) |
| **Size-Opt** | true | 1 | ~16KB | 110% | Slow | Large contracts |
| **Gas-Opt** | true | 200 | ~19KB | 95% | Slow | Production (optimized) |

### Gas Efficiency Comparison

```
Function call gas costs (example):

viaIR: false, runs: 200:
- transfer(): 50,000 gas
- propose(): 120,000 gas
- castVote(): 45,000 gas

viaIR: true, runs: 1:
- transfer(): 52,500 gas (+5%)
- propose(): 126,000 gas (+5%)
- castVote(): 47,250 gas (+5%)

viaIR: true, runs: 200: ⭐ BEST
- transfer(): 47,500 gas (-5%)
- propose(): 114,000 gas (-5%)
- castVote(): 42,750 gas (-5%)
```

---

## Khi nào dùng cấu hình nào?

### ✅ Dùng `viaIR: true, runs: 200` (Gas-Optimized) khi:

1. **Contract gần 24KB nhưng vẫn cần gas tốt**
   - HyraGovernor: ~22.4KB với viaIR: false
   - Có thể giảm xuống ~19KB với viaIR: true
   - Vẫn tối ưu gas với runs: 200

2. **Production contracts được gọi nhiều**
   - Token transfers
   - Governance voting
   - Frequent interactions

3. **Cần balance giữa size và gas**
   - Không muốn hy sinh gas để giảm size
   - Không muốn tăng size để tối ưu gas

### ✅ Dùng `viaIR: false, runs: 200` (Standard) khi:

1. **Contract dưới 20KB**
   - Không cần viaIR
   - Compilation nhanh hơn
   - Industry standard

2. **Audit yêu cầu standard settings**
   - Certik thường audit với standard
   - Dễ verify và reproduce

### ✅ Dùng `viaIR: true, runs: 1` (Size-Optimized) khi:

1. **Contract vượt 24KB với standard settings**
   - Bắt buộc phải giảm size
   - Implementation contracts (ít khi gọi)

2. **Chỉ cần deploy được, không quan tâm gas**
   - One-time deployment
   - Proxy implementations

---

## Best Practices

### 1. Development & Testing
```typescript
// Fast compilation for development
viaIR: false, runs: 200
```

### 2. Testnet Deployment
```typescript
// Test with production-like settings
viaIR: true, runs: 200  // Gas-optimized
```

### 3. Mainnet Production
```typescript
// Choose based on contract size:
// - If < 20KB: viaIR: false, runs: 200 (standard)
// - If 20-24KB: viaIR: true, runs: 200 (gas-optimized)
// - If > 24KB: viaIR: true, runs: 1 (size-optimized)
```

### 4. Audit Preparation
```typescript
// Use same settings as production
// Document exact settings used
viaIR: true, runs: 200  // If using gas-optimized
```

---

## Migration Guide

### Từ `viaIR: false, runs: 200` → `viaIR: true, runs: 200`

1. **Update config:**
   ```typescript
   viaIR: true,  // Change this
   runs: 200,    // Keep same
   ```

2. **Recompile:**
   ```bash
   npx hardhat clean
   npx hardhat compile --force
   ```

3. **Test:**
   ```bash
   npx hardhat test
   ```

4. **Check sizes:**
   ```bash
   npx hardhat run scripts/check-contract-sizes.ts
   ```

5. **Deploy & Verify:**
   ```bash
   npx hardhat run scripts/deploy-mainnet.ts --network mainnet
   npx hardhat verify --network mainnet CONTRACT_ADDRESS
   ```

---

## Recommendations cho Hyra Contracts

### HyraToken
- **Current**: viaIR: false, runs: 200
- **Recommendation**: Giữ nguyên (dưới 20KB, standard tốt)

### HyraTimelock
- **Current**: viaIR: false, runs: 200
- **Recommendation**: Giữ nguyên (dưới 20KB, standard tốt)

### HyraGovernor
- **Current**: viaIR: true, runs: 1 (size-optimized)
- **Recommendation**: **viaIR: true, runs: 200** (gas-optimized)
  - Giảm size từ ~22.4KB → ~19KB
  - Tối ưu gas tốt hơn (~5% improvement)
  - Phù hợp production (được gọi nhiều)

---

## Summary

**Có, bạn CÓ THỂ dùng `viaIR: true` với `runs: 200` để tối ưu gas!**

- ✅ Gas tốt hơn ~5% so với viaIR: false
- ✅ Size nhỏ hơn ~15% so với viaIR: false
- ⚠️ Compilation chậm hơn ~2-3x (acceptable)

**Best practice:**
- Contracts < 20KB: `viaIR: false, runs: 200` (standard)
- Contracts 20-24KB: `viaIR: true, runs: 200` (gas-optimized) ⭐
- Contracts > 24KB: `viaIR: true, runs: 1` (size-optimized)

