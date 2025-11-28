# Step-by-Step Deployment Guide

Hướng dẫn deploy từng bước cho **Dev (Base Sepolia Testnet)** và **Prod (Ethereum Mainnet)**.

---

## 📋 Mục lục

1. [Tổng quan](#tổng-quan)
2. [Môi trường Dev (Base Sepolia)](#môi-trường-dev-base-sepolia)
3. [Môi trường Prod (Mainnet)](#môi-trường-prod-mainnet)
4. [Deployment Steps (Chi tiết)](#deployment-steps-chi-tiết)
5. [Networks & Environment Files](#networks--environment-files)
6. [Deployment Files](#deployment-files)

---

## Tổng quan

### So sánh Dev vs Prod

| Feature | Dev (Base Sepolia) | Prod (Mainnet) |
|---------|-------------------|----------------|
| **Network** | Base Sepolia Testnet | Ethereum Mainnet |
| **Environment File** | `.env.dev` | `.env.prod` |
| **Purpose** | Testing, Development | Production |
| **Gas Cost** | Free (testnet) | Real ETH |
| **Block Explorer** | https://sepolia.basescan.org | https://etherscan.io |
| **Deployment Speed** | Fast (testnet) | Slower (mainnet) |
| **Risk Level** | Low (testnet) | ⚠️ High (real money) |

### Scripts tự động detect network

Các scripts sau tự động detect network và load đúng env file:
- `04-deploy-token.ts` → `.env.dev` (baseSepolia) hoặc `.env.prod` (mainnet)
- `06-deploy-governor.ts` → `.env.dev` (baseSepolia) hoặc `.env.prod` (mainnet)

Các scripts khác không cần env variables.

---

## Môi trường Dev (Base Sepolia)

### 🎯 Mục đích
- Testing và development
- Kiểm tra logic trước khi deploy lên mainnet
- Test integration với frontend/UI
- Không tốn phí gas (testnet)

### ✅ Prerequisites

1. **Environment File**: `.env.dev` phải có các biến sau:
   ```bash
   # Required for Step 4 (deploy-token.ts)
   PRIVILEGED_MULTISIG_WALLET=0x...  # Multisig wallet address (must be contract)
   TOKEN_MINT_FEED_ADDRESS=0x...     # TokenMintFeed oracle (optional but recommended)
   
   # Required for Step 6 (deploy-governor.ts)
   PRIVILEGED_MULTISIG_WALLET=0x...  # Same as above
   
   # Distribution wallets (6 multisig wallets)
   DISTRIBUTION_WALLET_1=0x...
   DISTRIBUTION_WALLET_2=0x...
   DISTRIBUTION_WALLET_3=0x...
   DISTRIBUTION_WALLET_4=0x...
   DISTRIBUTION_WALLET_5=0x...
   DISTRIBUTION_WALLET_6=0x...
   ```

2. **Network Setup**: 
   - RPC URL: `BASE_SEPOLIA_RPC_URL` trong `.env.dev`
   - Private Key: `PRIVATE_KEY` trong `.env.dev`
   - Chain ID: `84532` (Base Sepolia)

3. **Testnet ETH**: 
   - Cần testnet ETH để deploy (có thể lấy từ faucet)
   - Base Sepolia Faucet: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### 📝 Deployment Steps cho Dev

#### Step 1: Deploy Infrastructure
```bash
npx hardhat run scripts/step-by-step/01-deploy-infrastructure.ts --network baseSepolia
```
**Output**: `deployments/step-by-step/01-infrastructure-{timestamp}.json`

**Lưu lại**:
- `secureProxyAdmin`: ProxyAdmin address
- `hyraProxyDeployer`: ProxyDeployer address
- `secureExecutorManager`: ExecutorManager address
- `proxyAdminValidator`: ProxyAdminValidator address

---

#### Step 2: Deploy Timelock
```bash
npx hardhat run scripts/step-by-step/02-deploy-timelock.ts --network baseSepolia
```
**Output**: `deployments/step-by-step/02-timelock-{timestamp}.json`

**Lưu lại**: `timelockProxy` address

---

#### Step 3: Deploy TokenVesting
```bash
npx hardhat run scripts/step-by-step/03-deploy-vesting.ts --network baseSepolia
```
**Input**: Nhập `timelockProxy` address từ Step 2

**Output**: `deployments/step-by-step/03-vesting-{timestamp}.json`

**Lưu lại**: `vestingProxy` address

---

#### Step 4: Deploy HyraToken ⚠️
```bash
npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia
```

**Auto-loads**: `.env.dev` (tự động detect network)

**Prerequisites**:
- ✅ `.env.dev` phải có `PRIVILEGED_MULTISIG_WALLET`
- ✅ `PRIVILEGED_MULTISIG_WALLET` phải là contract address (multisig wallet)
- ✅ Optional: `TOKEN_MINT_FEED_ADDRESS` (nếu có)

**Input**: Script sẽ hỏi:
- Vesting Proxy address (từ Step 3)
- Safe Multisig address (cho initial supply)

**Config**:
- Initial Supply: 2.5B HYRA
- Year 1 Start: January 1, 2025 00:00:00 UTC
- Year Duration: 365 days
- Distribution: 6 multisig wallets (từ `.env.dev`)

**Output**: `deployments/step-by-step/04-token-{timestamp}.json`

**Lưu lại**: `tokenProxy` address

**Sau khi deploy**:
- Nếu có `TOKEN_MINT_FEED_ADDRESS` trong `.env.dev`, script sẽ tự động gọi `setTokenMintFeed()`
- Nếu không có, cần gọi thủ công sau:
  ```bash
  npx hardhat run scripts/set-token-mint-feed.ts --network baseSepolia
  ```

---

#### Step 5: Initialize TokenVesting
```bash
npx hardhat run scripts/step-by-step/05-initialize-vesting.ts --network baseSepolia
```
**Input**: 
- Vesting Proxy address (từ Step 3)
- Token Proxy address (từ Step 4)
- Timelock Proxy address (từ Step 2)

**Output**: `deployments/step-by-step/05-vesting-init-{timestamp}.json`

---

#### Step 6: Deploy HyraGovernor ⚠️
```bash
npx hardhat run scripts/step-by-step/06-deploy-governor.ts --network baseSepolia
```

**Auto-loads**: `.env.dev` (tự động detect network)

**Prerequisites**:
- ✅ `.env.dev` phải có `PRIVILEGED_MULTISIG_WALLET`
- ✅ `PRIVILEGED_MULTISIG_WALLET` phải là contract address

**Input**: 
- Token Proxy address (từ Step 4)
- Timelock Proxy address (từ Step 2)

**Output**: `deployments/step-by-step/06-governor-{timestamp}.json`

**Lưu lại**: `governorProxy` address

---

#### Step 7: Transfer Ownership
```bash
npx hardhat run scripts/step-by-step/07-transfer-ownership.ts --network baseSepolia
```
**Input**: 
- Token Proxy address (từ Step 4)
- Timelock Proxy address (từ Step 2)

**Output**: `deployments/step-by-step/07-ownership-transfer-{timestamp}.json`

**Result**: Token ownership chuyển sang Timelock (DAO)

---

#### Step 8: Verify Contracts
```bash
npx hardhat run scripts/step-by-step/08-verify-all.ts --network baseSepolia
```

**Block Explorer**: https://sepolia.basescan.org

---

### 🔍 Verification sau khi deploy

1. **Check contracts trên BaseScan**:
   - Tìm addresses trong deployment files
   - Verify trên: https://sepolia.basescan.org

2. **Check mint status**:
   ```bash
   npx hardhat run scripts/check-mint-status.ts --network baseSepolia
   ```

3. **Check proxy admin**:
   ```bash
   npx hardhat run scripts/check-proxy-admin-status.ts --network baseSepolia
   ```

4. **Validate addresses**:
   ```bash
   npx hardhat run scripts/validate-addresses.ts --network baseSepolia
   ```

---

## Môi trường Prod (Mainnet)

### 🎯 Mục đích
- Production deployment
- Real tokens, real money
- ⚠️ **KHÔNG THỂ HOÀN TÁC** sau khi deploy

### ⚠️ CRITICAL WARNINGS

1. **Double-check everything**: Kiểm tra kỹ tất cả addresses và config trước khi deploy
2. **Test on testnet first**: Luôn test đầy đủ trên testnet trước
3. **Backup**: Lưu tất cả deployment files và private keys an toàn
4. **Gas costs**: Mainnet deployment tốn phí gas thật (có thể hàng trăm USD)
5. **No rollback**: Một khi deploy lên mainnet, không thể rollback

### ✅ Prerequisites

1. **Environment File**: `.env.prod` phải có các biến sau:
   ```bash
   # Required for Step 4 (deploy-token.ts)
   PRIVILEGED_MULTISIG_WALLET=0x...  # Production multisig wallet (MUST be verified contract)
   TOKEN_MINT_FEED_ADDRESS=0x...     # Production TokenMintFeed oracle (REQUIRED)
   
   # Required for Step 6 (deploy-governor.ts)
   PRIVILEGED_MULTISIG_WALLET=0x...  # Same as above
   
   # Distribution wallets (6 production multisig wallets - VERIFIED)
   DISTRIBUTION_WALLET_1=0x...  # Production wallet 1
   DISTRIBUTION_WALLET_2=0x...  # Production wallet 2
   DISTRIBUTION_WALLET_3=0x...  # Production wallet 3
   DISTRIBUTION_WALLET_4=0x...  # Production wallet 4
   DISTRIBUTION_WALLET_5=0x...  # Production wallet 5
   DISTRIBUTION_WALLET_6=0x...  # Production wallet 6
   
   # Network config
   MAINNET_RPC_URL=https://...  # Mainnet RPC endpoint
   PRIVATE_KEY=0x...            # Deployer private key (KEEP SECURE!)
   ```

2. **Network Setup**: 
   - RPC URL: `MAINNET_RPC_URL` trong `.env.prod` (Infura, Alchemy, etc.)
   - Private Key: `PRIVATE_KEY` trong `.env.prod` (phải có đủ ETH)
   - Chain ID: `1` (Ethereum Mainnet)

3. **Mainnet ETH**: 
   - Cần đủ ETH để deploy (ước tính: 0.5-2 ETH tùy gas price)
   - Kiểm tra gas price trước khi deploy: https://etherscan.io/gastracker

4. **Address Verification**:
   - ✅ Tất cả addresses phải được verify trên Etherscan
   - ✅ Multisig wallets phải là production-ready contracts
   - ✅ TokenMintFeed oracle phải đã deploy và hoạt động trên mainnet

### 📝 Deployment Steps cho Prod

#### Pre-Deployment Checklist

- [ ] Đã test đầy đủ trên testnet
- [ ] Tất cả addresses trong `.env.prod` đã được verify
- [ ] Multisig wallets đã được setup và test
- [ ] TokenMintFeed oracle đã deploy và hoạt động trên mainnet
- [ ] Có đủ ETH trong deployer wallet
- [ ] Gas price hợp lý (check https://etherscan.io/gastracker)
- [ ] Đã backup tất cả private keys và addresses
- [ ] Team đã review và approve deployment

---

#### Step 1: Deploy Infrastructure
```bash
npx hardhat run scripts/step-by-step/01-deploy-infrastructure.ts --network mainnet
```
**Output**: `deployments/step-by-step/01-infrastructure-{timestamp}.json`

**⚠️ Lưu lại ngay**: Tất cả addresses (sẽ cần cho các bước sau)

**Gas estimate**: ~2-5M gas

---

#### Step 2: Deploy Timelock
```bash
npx hardhat run scripts/step-by-step/02-deploy-timelock.ts --network mainnet
```
**Output**: `deployments/step-by-step/02-timelock-{timestamp}.json`

**⚠️ Lưu lại**: `timelockProxy` address

**Gas estimate**: ~3-6M gas

---

#### Step 3: Deploy TokenVesting
```bash
npx hardhat run scripts/step-by-step/03-deploy-vesting.ts --network mainnet
```
**Input**: Nhập `timelockProxy` address từ Step 2

**Output**: `deployments/step-by-step/03-vesting-{timestamp}.json`

**⚠️ Lưu lại**: `vestingProxy` address

**Gas estimate**: ~2-4M gas

---

#### Step 4: Deploy HyraToken ⚠️⚠️⚠️
```bash
npx hardhat run scripts/step-by-step/04-deploy-token.ts --network mainnet
```

**Auto-loads**: `.env.prod` (tự động detect network)

**Prerequisites**:
- ✅ `.env.prod` phải có `PRIVILEGED_MULTISIG_WALLET` (production multisig)
- ✅ `PRIVILEGED_MULTISIG_WALLET` phải là verified contract trên mainnet
- ✅ **REQUIRED**: `TOKEN_MINT_FEED_ADDRESS` (production oracle)
- ✅ 6 distribution wallets phải là production multisig wallets

**Input**: Script sẽ hỏi:
- Vesting Proxy address (từ Step 3)
- Safe Multisig address (cho initial supply - production Safe)

**Config**:
- Initial Supply: 2.5B HYRA (5% of max supply)
- Year 1 Start: January 1, 2025 00:00:00 UTC
- Year Duration: 365 days
- Distribution: 6 production multisig wallets (từ `.env.prod`)

**Output**: `deployments/step-by-step/04-token-{timestamp}.json`

**⚠️ Lưu lại**: `tokenProxy` address (QUAN TRỌNG!)

**Gas estimate**: ~5-10M gas

**Sau khi deploy**:
- Script sẽ tự động gọi `setTokenMintFeed()` nếu có `TOKEN_MINT_FEED_ADDRESS`
- Verify contract trên Etherscan ngay sau khi deploy

---

#### Step 5: Initialize TokenVesting
```bash
npx hardhat run scripts/step-by-step/05-initialize-vesting.ts --network mainnet
```
**Input**: 
- Vesting Proxy address (từ Step 3)
- Token Proxy address (từ Step 4)
- Timelock Proxy address (từ Step 2)

**Output**: `deployments/step-by-step/05-vesting-init-{timestamp}.json`

**Gas estimate**: ~200K-500K gas

---

#### Step 6: Deploy HyraGovernor ⚠️⚠️
```bash
npx hardhat run scripts/step-by-step/06-deploy-governor.ts --network mainnet
```

**Auto-loads**: `.env.prod` (tự động detect network)

**Prerequisites**:
- ✅ `.env.prod` phải có `PRIVILEGED_MULTISIG_WALLET` (production multisig)
- ✅ `PRIVILEGED_MULTISIG_WALLET` phải là verified contract

**Input**: 
- Token Proxy address (từ Step 4)
- Timelock Proxy address (từ Step 2)

**Output**: `deployments/step-by-step/06-governor-{timestamp}.json`

**⚠️ Lưu lại**: `governorProxy` address

**Gas estimate**: ~3-6M gas

---

#### Step 7: Transfer Ownership ⚠️⚠️⚠️
```bash
npx hardhat run scripts/step-by-step/07-transfer-ownership.ts --network mainnet
```
**Input**: 
- Token Proxy address (từ Step 4)
- Timelock Proxy address (từ Step 2)

**Output**: `deployments/step-by-step/07-ownership-transfer-{timestamp}.json`

**Result**: Token ownership chuyển sang Timelock (DAO)

**⚠️ CRITICAL**: Sau bước này, deployer không còn quyền kiểm soát token!

**Gas estimate**: ~100K-300K gas

---

#### Step 8: Verify Contracts
```bash
npx hardhat run scripts/step-by-step/08-verify-all.ts --network mainnet
```

**Block Explorer**: https://etherscan.io

**⚠️ Verify tất cả contracts trước khi công bố**

---

### 🔍 Post-Deployment Checklist

- [ ] Tất cả contracts đã được verify trên Etherscan
- [ ] Token ownership đã chuyển sang Timelock
- [ ] Distribution wallets đã nhận đúng số lượng tokens
- [ ] TokenMintFeed oracle đã được set
- [ ] Governor có thể tạo proposals
- [ ] Timelock có thể execute proposals
- [ ] Đã test mint request flow (nếu cần)
- [ ] Đã backup tất cả deployment files
- [ ] Đã document tất cả addresses

---

### 🔍 Verification sau khi deploy

1. **Check contracts trên Etherscan**:
   - Verify tất cả contracts: https://etherscan.io
   - Check source code matches deployed bytecode

2. **Check token distribution**:
   ```bash
   npx hardhat run scripts/check-mint-status.ts --network mainnet
   ```

3. **Check proxy admin**:
   ```bash
   npx hardhat run scripts/check-proxy-admin-status.ts --network mainnet
   ```

4. **Validate addresses**:
   ```bash
   npx hardhat run scripts/validate-addresses.ts --network mainnet
   ```

5. **Test governance**:
   - Tạo test proposal
   - Vote và execute proposal
   - Verify timelock delay hoạt động đúng

---

## Deployment Steps (Chi tiết)

### Step 1: Deploy Infrastructure Contracts

Deploy các infrastructure contracts:
- SecureProxyAdmin
- HyraProxyDeployer
- SecureExecutorManager
- ProxyAdminValidator

```bash
npx hardhat run scripts/step-by-step/01-deploy-infrastructure.ts --network baseSepolia
```

**Output**: `deployments/step-by-step/01-infrastructure-{timestamp}.json`

---

### Step 2: Deploy HyraTimelock

Deploy Timelock contract (DAO governance timelock).

```bash
npx hardhat run scripts/step-by-step/02-deploy-timelock.ts --network baseSepolia
```

**Prerequisites**: None

**Output**: `deployments/step-by-step/02-timelock-{timestamp}.json`

**Save**: Timelock Proxy address

---

### Step 3: Deploy TokenVesting

Deploy TokenVesting contract (chưa initialize).

```bash
npx hardhat run scripts/step-by-step/03-deploy-vesting.ts --network baseSepolia
```

**Prerequisites**: 
- Timelock Proxy address (from Step 2)

**Input**: Script sẽ hỏi Timelock address

**Output**: `deployments/step-by-step/03-vesting-{timestamp}.json`

**Save**: Vesting Proxy address

---

### Step 4: Deploy HyraToken

Deploy HyraToken và mint initial supply.

```bash
npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia
```

**Prerequisites**:
- Vesting Proxy address (from Step 3)
- Safe Multisig address (for initial supply)

**Input**: Script sẽ hỏi:
- Vesting Proxy address
- Safe Multisig address

**Output**: `deployments/step-by-step/04-token-{timestamp}.json`

**Config**:
- Initial Supply: 2.5B HYRA
- Year 1 Start: January 1, 2025 00:00:00 UTC
- Year Duration: 365 days

**Save**: Token Proxy address

---

### Step 5: Initialize TokenVesting

Initialize TokenVesting với Token address.

```bash
npx hardhat run scripts/step-by-step/05-initialize-vesting.ts --network baseSepolia
```

**Prerequisites**:
- Vesting Proxy address (from Step 3)
- Token Proxy address (from Step 4)
- Timelock Proxy address (from Step 2)

**Input**: Script sẽ hỏi các addresses

**Output**: `deployments/step-by-step/05-vesting-init-{timestamp}.json`

---

### Step 6: Deploy HyraGovernor

Deploy HyraGovernor contract.

```bash
npx hardhat run scripts/step-by-step/06-deploy-governor.ts --network baseSepolia
```

**Prerequisites**:
- Token Proxy address (from Step 4)
- Timelock Proxy address (from Step 2)

**Input**: Script sẽ hỏi các addresses

**Output**: `deployments/step-by-step/06-governor-{timestamp}.json`

**Save**: Governor Proxy address

---

### Step 7: Transfer Token Ownership to DAO

Transfer ownership của HyraToken sang HyraTimelock (DAO).

```bash
npx hardhat run scripts/step-by-step/07-transfer-ownership.ts --network baseSepolia
```

**Prerequisites**:
- Token Proxy address (from Step 4)
- Timelock Proxy address (from Step 2)

**Input**: Script sẽ hỏi các addresses

**Output**: `deployments/step-by-step/07-ownership-transfer-{timestamp}.json`

**Result**: Token ownership = Timelock (DAO)

---

## Complete Deployment Example

```bash
# Step 1: Infrastructure
npx hardhat run scripts/step-by-step/01-deploy-infrastructure.ts --network baseSepolia
# Save: ProxyAdmin, ProxyDeployer, ExecutorManager, ProxyAdminValidator addresses

# Step 2: Timelock
npx hardhat run scripts/step-by-step/02-deploy-timelock.ts --network baseSepolia
# Save: Timelock Proxy address

# Step 3: Vesting
npx hardhat run scripts/step-by-step/03-deploy-vesting.ts --network baseSepolia
# Input: Timelock address
# Save: Vesting Proxy address

# Step 4: Token
npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia
# Input: Vesting address, Safe Multisig address
# Save: Token Proxy address

# Step 5: Initialize Vesting
npx hardhat run scripts/step-by-step/05-initialize-vesting.ts --network baseSepolia
# Input: Vesting address, Token address, Timelock address

# Step 6: Governor
npx hardhat run scripts/step-by-step/06-deploy-governor.ts --network baseSepolia
# Input: Token address, Timelock address
# Save: Governor Proxy address

# Step 7: Transfer Ownership
npx hardhat run scripts/step-by-step/07-transfer-ownership.ts --network baseSepolia
# Input: Token address, Timelock address

npx hardhat run scripts/step-by-step/08-verify-all.ts --network baseSepolia
```

---

## Networks & Environment Files

Các scripts này có thể dùng với nhiều network và tự động load đúng env file:

| Network | Environment File | Purpose |
|---------|------------------|---------|
| `baseSepolia` | `.env.dev` | Testnet (Base Sepolia) |
| `mainnet` | `.env.prod` | Production (Ethereum Mainnet) |
| `sepolia` | `.env` | Testnet (Ethereum Sepolia) |
| Other networks | `.env` | Default/local development |

**Auto-detection**: Scripts `04-deploy-token.ts` và `06-deploy-governor.ts` tự động detect network và load đúng env file.

**Override**: Có thể override bằng biến môi trường `DOTENV_CONFIG_PATH`:
```bash
DOTENV_CONFIG_PATH=.env.prod npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia
```

---

## Deployment Files

Tất cả deployment info được lưu tại:
```
deployments/step-by-step/
├── 01-infrastructure-{timestamp}.json
├── 02-timelock-{timestamp}.json
├── 03-vesting-{timestamp}.json
├── 04-token-{timestamp}.json
├── 05-vesting-init-{timestamp}.json
├── 06-governor-{timestamp}.json
└── 07-ownership-transfer-{timestamp}.json
```
