# Scripts Documentation

Tài liệu đầy đủ về tất cả các scripts trong thư mục `scripts/`.

---

## 📋 Mục lục

1. [Naming Convention](#naming-convention)
2. [Environment Files](#environment-files)
3. [Dev Scripts (Base Sepolia Testnet)](#dev-scripts-base-sepolia-testnet)
4. [Prod Scripts (Mainnet)](#prod-scripts-mainnet)
5. [Step-by-Step Scripts](#step-by-step-scripts)
6. [Helper Scripts (Auto-Detect)](#helper-scripts-auto-detect)
7. [Deployment Scripts (Other Networks)](#deployment-scripts-other-networks)
8. [Verification Scripts](#verification-scripts)
9. [Check/Status Scripts](#checkstatus-scripts)
10. [Setup/Configuration Scripts](#setupconfiguration-scripts)
11. [Utility Scripts](#utility-scripts)
12. [Legacy Scripts](#legacy-scripts)

---

## Naming Convention

Scripts được tổ chức theo môi trường sử dụng suffix:
- **`-dev.ts`**: Scripts cho development/testnet (dùng `.env.dev`)
- **`-prod.ts`**: Scripts cho production/mainnet (dùng `.env.prod`)
- **Không có suffix**: Scripts đa mục đích hoặc tự động detect network

---

## Environment Files

| File | Network | Purpose |
|------|---------|---------|
| `.env.dev` | Base Sepolia | Testnet deployment và testing |
| `.env.prod` | Ethereum Mainnet | Production deployment |
| `.env` | Local/Other networks | Development hoặc networks khác |

**Auto-detection**: Một số scripts tự động detect network và load đúng env file.

**Override**: Có thể override bằng biến môi trường `DOTENV_CONFIG_PATH`:
```bash
DOTENV_CONFIG_PATH=.env.prod npx hardhat run scripts/xxx.ts --network baseSepolia
```

---

## Dev Scripts (Base Sepolia Testnet)

Các scripts này dùng `.env.dev` và dành cho testing trên Base Sepolia.

### Deployment Scripts

#### `deploy-ultra-fast-base-sepolia-dev.ts`
**Mục đích**: Deploy contracts với delays cực ngắn cho testing nhanh qua UI.

**Thông số**:
- `MINT_EXECUTION_DELAY` = **2 MINUTES** (thay vì 2 days)
- `YEAR_DURATION` = **1 HOUR** (thay vì 365 days)
- `TIMELOCK_MIN_DELAY` = **1 MINUTE**

**Usage**:
```bash
npx hardhat run scripts/deploy-ultra-fast-base-sepolia-dev.ts --network baseSepolia
```

**Output**: `deployments/ultra-fast-baseSepolia-{timestamp}.json`

**Lưu ý**: ⚠️ CHỈ DÙNG CHO TESTING! Không deploy lên mainnet.

---

#### `deploy-fast-test-base-sepolia-dev.ts`
**Mục đích**: Deploy contracts với delays ngắn cho testing.

**Thông số**:
- `MINT_EXECUTION_DELAY` = **2 MINUTES** (thay vì 2 days)
- `YEAR_DURATION` = **365 days** (production setting)
- `TIMELOCK_MIN_DELAY` = **1 MINUTE**

**Usage**:
```bash
npx hardhat run scripts/deploy-fast-test-base-sepolia-dev.ts --network baseSepolia
```

**Output**: `deployments/fast-test-baseSepolia-{timestamp}.json`

**Lưu ý**: ⚠️ CHỈ DÙNG CHO TESTING!

---

### Verification Scripts

#### `verify-ultra-fast-base-sepolia-dev.ts`
**Mục đích**: Verify ultra fast test contracts trên BaseScan.

**Usage**:
```bash
npx hardhat run scripts/verify-ultra-fast-base-sepolia-dev.ts --network baseSepolia
```

**Tự động**: Load deployment file mới nhất từ `deployments/ultra-fast-baseSepolia-*.json`

---

#### `verify-fast-test-base-sepolia-dev.ts`
**Mục đích**: Verify fast test contracts trên BaseScan.

**Usage**:
```bash
npx hardhat run scripts/verify-fast-test-base-sepolia-dev.ts --network baseSepolia
```

**Tự động**: Load deployment file mới nhất từ `deployments/fast-test-baseSepolia-*.json`

---

#### `verify-base-sepolia-dev.ts`
**Mục đích**: Verify Base Sepolia contracts (general).

**Usage**:
```bash
npx hardhat run scripts/verify-base-sepolia-dev.ts --network baseSepolia
```

---

## Prod Scripts (Mainnet)

Các scripts này dùng `.env.prod` và dành cho production deployment.

### Deployment Scripts

#### `deploy-mainnet-production-prod.ts`
**Mục đích**: Deploy contracts lên Ethereum Mainnet cho production.

**Thông số**:
- `MINT_EXECUTION_DELAY` = **2 days** (production setting)
- `YEAR_DURATION` = **365 days** (production setting)
- `TIMELOCK_MIN_DELAY` = **2 days** (production setting)
- Year 1 starts: **January 1, 2025 00:00:00 UTC**

**Usage**:
```bash
npx hardhat run scripts/deploy-mainnet-production-prod.ts --network mainnet
```

**Output**: `deployments/mainnet-production-{timestamp}.json`

**Lưu ý**: ⚠️ PRODUCTION DEPLOYMENT! Kiểm tra kỹ trước khi chạy.

**Environment**: Luôn dùng `.env.prod` (không thể override).

---

## Step-by-Step Scripts

Các scripts này tự động detect network và load đúng env file. Có thể dùng cho cả dev và prod.

**Location**: `scripts/step-by-step/`

**Documentation**: Xem `scripts/step-by-step/README.md` để biết chi tiết.

### Scripts List

| Script | Env Vars | Description |
|--------|----------|-------------|
| `01-deploy-infrastructure.ts` | ❌ | Deploy infrastructure contracts (ProxyAdmin, ProxyDeployer, etc.) |
| `02-deploy-timelock.ts` | ❌ | Deploy HyraTimelock |
| `03-deploy-vesting.ts` | ❌ | Deploy TokenVesting |
| `04-deploy-token.ts` | ✅ | Deploy HyraToken (auto-detects: `.env.dev` for baseSepolia, `.env.prod` for mainnet) |
| `05-initialize-vesting.ts` | ❌ | Initialize TokenVesting |
| `06-deploy-governor.ts` | ✅ | Deploy HyraGovernor (auto-detects: `.env.dev` for baseSepolia, `.env.prod` for mainnet) |
| `07-transfer-ownership.ts` | ❌ | Transfer token ownership to DAO |
| `08-verify-all.ts` | ❌ | Verify all deployed contracts |

### Usage Examples

```bash
# Deploy cho Base Sepolia (tự động dùng .env.dev)
npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia

# Deploy cho Mainnet (tự động dùng .env.prod)
npx hardhat run scripts/step-by-step/04-deploy-token.ts --network mainnet

# Override env file nếu cần
DOTENV_CONFIG_PATH=.env.prod npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia
```

---

## Helper Scripts (Auto-Detect)

Các scripts này tự động detect network và load đúng env file.

### `set-token-mint-feed.ts`
**Mục đích**: Set TokenMintFeed oracle address trên HyraToken contract.

**Auto-detection**:
- `baseSepolia` → `.env.dev`
- `mainnet` → `.env.prod`
- Other networks → `.env`

**Usage**:
```bash
npx hardhat run scripts/set-token-mint-feed.ts --network baseSepolia
```

**Required env vars**:
- `TOKEN_MINT_FEED_ADDRESS`: Oracle contract address
- `TOKEN_PROXY_ADDRESS`: HyraToken proxy address (hoặc load từ deployments)

**Lưu ý**: Phải được gọi bởi `PRIVILEGED_MULTISIG_WALLET`.

---

### `validate-addresses.ts`
**Mục đích**: Validate addresses trong `.env` file theo logic của contracts.

**Auto-detection**:
- `baseSepolia` → `.env.dev`
- `mainnet` → `.env.prod`
- Other networks → `.env`

**Usage**:
```bash
npx hardhat run scripts/validate-addresses.ts --network baseSepolia
```

**Checks**:
- Zero address validation
- Contract code size validation
- Address format validation

---

### `check-token-mint-feed.ts`
**Mục đích**: Check TokenMintFeed contract trên Base Sepolia.

**Default**: Loads `.env.dev` (có thể override với `DOTENV_CONFIG_PATH`)

**Usage**:
```bash
npx hardhat run scripts/check-token-mint-feed.ts --network baseSepolia
```

**Checks**:
- Contract code size
- Interface implementation (`ITokenMintFeed`)
- Function signature
- Return values structure

---

## Deployment Scripts (Other Networks)

### `deploy-core-sepolia.ts`
**Mục đích**: Deploy core contracts lên Ethereum Sepolia.

**Env file**: `.env` (có thể override với `ENV_FILE`)

**Usage**:
```bash
ENV_FILE=.env npx hardhat run scripts/deploy-core-sepolia.ts --network sepolia
```

---

### `deploy-infra-sepolia.ts`
**Mục đích**: Deploy infrastructure contracts lên Ethereum Sepolia.

**Usage**:
```bash
npx hardhat run scripts/deploy-infra-sepolia.ts --network sepolia
```

---

### `deploy-proxy-sepolia.ts`
**Mục đích**: Deploy proxy contracts lên Ethereum Sepolia.

**Env file**: `.env` (có thể override với `ENV_FILE`)

**Usage**:
```bash
ENV_FILE=.env npx hardhat run scripts/deploy-proxy-sepolia.ts --network sepolia
```

---

### `deploy-testnet-sepolia.ts`
**Mục đích**: Deploy testnet contracts lên Ethereum Sepolia.

**Env file**: `.env` (có thể override với `ENV_FILE`)

**Usage**:
```bash
ENV_FILE=.env npx hardhat run scripts/deploy-testnet-sepolia.ts --network sepolia
```

---

## Verification Scripts

### `verify-contracts.ts` / `verify-contracts.js`
**Mục đích**: Verify contracts trên block explorer (general).

**Usage**:
```bash
npx hardhat run scripts/verify-contracts.ts --network <network>
```

---

### `verify-sepolia-all.ts`
**Mục đích**: Verify tất cả contracts trên Ethereum Sepolia.

**Usage**:
```bash
npx hardhat run scripts/verify-sepolia-all.ts --network sepolia
```

---

## Check/Status Scripts

### `check-mint-status.ts`
**Mục đích**: Check trạng thái mint requests.

**Usage**:
```bash
npx hardhat run scripts/check-mint-status.ts --network baseSepolia
```

**Tự động**: Load deployment file mới nhất (ưu tiên `baseSepolia`, fallback `sepolia`)

---

### `check-pending-operation.ts`
**Mục đích**: Check pending operations trong Timelock.

**Usage**:
```bash
npx hardhat run scripts/check-pending-operation.ts --network <network>
```

---

### `check-proxy-admin-status.ts`
**Mục đích**: Check trạng thái ProxyAdmin và các proxies được quản lý.

**Usage**:
```bash
npx hardhat run scripts/check-proxy-admin-status.ts --network <network>
```

---

### `check-timelock-roles.ts`
**Mục đích**: Check roles trong HyraTimelock.

**Usage**:
```bash
npx hardhat run scripts/check-timelock-roles.ts --network <network>
```

---

## Setup/Configuration Scripts

### `set-distribution-config.ts`
**Mục đích**: Set token distribution configuration (6 multisig wallets).

**Env file**: `.env` (có thể override với `ENV_FILE`)

**Usage**:
```bash
ENV_FILE=.env.prod npx hardhat run scripts/set-distribution-config.ts --network mainnet
```

**Required env vars**: 6 distribution wallet addresses từ `.env`

---

### `setup-multisig.ts` / `setup-multisig.js`
**Mục đích**: Setup multisig wallet configuration.

**Usage**:
```bash
npx hardhat run scripts/setup-multisig.ts --network <network>
```

---

### `setup-multisig-upgrade.ts` / `setup-multisig-upgrade.js`
**Mục đích**: Setup multisig upgrade configuration.

**Usage**:
```bash
npx hardhat run scripts/setup-multisig-upgrade.ts --network <network>
```

---

### `setup-security-council.ts`
**Mục đích**: Setup Security Council members.

**Env file**: `.env` (có thể override với `ENV_FILE`)

**Usage**:
```bash
ENV_FILE=.env npx hardhat run scripts/setup-security-council.ts --network <network>
```

---

### `apply-multisig-roles.ts`
**Mục đích**: Apply roles cho multisig wallets.

**Usage**:
```bash
npx hardhat run scripts/apply-multisig-roles.ts --network <network>
```

---

### `finalize-governance-sepolia.ts`
**Mục đích**: Finalize governance setup trên Sepolia.

**Usage**:
```bash
npx hardhat run scripts/finalize-governance-sepolia.ts --network sepolia
```

---

## Utility Scripts

### `add-proxies-to-admin.ts`
**Mục đích**: Thêm proxies vào ProxyAdmin.

**Usage**:
```bash
npx hardhat run scripts/add-proxies-to-admin.ts --network <network>
```

---

### `transfer-owner-to-safe.ts`
**Mục đích**: Transfer ownership đến Safe multisig.

**Usage**:
```bash
npx hardhat run scripts/transfer-owner-to-safe.ts --network <network>
```

---

### `transfer-proxyadmin-to-safe.ts`
**Mục đích**: Transfer ProxyAdmin ownership đến Safe multisig.

**Usage**:
```bash
npx hardhat run scripts/transfer-proxyadmin-to-safe.ts --network <network>
```

---

### `revoke-deployer-roles-proxyadmin.ts`
**Mục đích**: Revoke deployer roles từ ProxyAdmin.

**Usage**:
```bash
npx hardhat run scripts/revoke-deployer-roles-proxyadmin.ts --network <network>
```

---

### `calculate-role-hashes.ts`
**Mục đích**: Calculate role hashes cho testing/debugging.

**Usage**:
```bash
npx hardhat run scripts/calculate-role-hashes.ts
```

---

### `calculate-year-start-timestamp.ts`
**Mục đích**: Calculate year start timestamp.

**Usage**:
```bash
npx hardhat run scripts/calculate-year-start-timestamp.ts
```

---

### `test-prod-config.ts`
**Mục đích**: Test và verify `.env.prod` configuration.

**Usage**:
```bash
npx hardhat run scripts/test-prod-config.ts
```

---

## Legacy Scripts

### `simple-deploy.ts` / `simple-deploy.js`
**Mục đích**: Simple deployment script (legacy).

**Status**: ⚠️ Có thể đã deprecated, kiểm tra trước khi dùng.

---

### `run-enhanced-tests.js`
**Mục đích**: Run enhanced test suite.

**Usage**:
```bash
node scripts/run-enhanced-tests.js
```

---

## Quick Reference

### Deploy to Base Sepolia (Testnet)
```bash
# Ultra fast test (2 min delay, 1 hour year)
npx hardhat run scripts/deploy-ultra-fast-base-sepolia-dev.ts --network baseSepolia

# Fast test (2 min delay)
npx hardhat run scripts/deploy-fast-test-base-sepolia-dev.ts --network baseSepolia

# Step-by-step
npx hardhat run scripts/step-by-step/01-deploy-infrastructure.ts --network baseSepolia
# ... continue with other steps
```

### Deploy to Mainnet (Production)
```bash
# Production deployment
npx hardhat run scripts/deploy-mainnet-production-prod.ts --network mainnet

# Step-by-step
npx hardhat run scripts/step-by-step/01-deploy-infrastructure.ts --network mainnet
# ... continue with other steps
```

### Verify Contracts
```bash
# Base Sepolia
npx hardhat run scripts/verify-ultra-fast-base-sepolia-dev.ts --network baseSepolia
npx hardhat run scripts/verify-fast-test-base-sepolia-dev.ts --network baseSepolia
npx hardhat run scripts/verify-base-sepolia-dev.ts --network baseSepolia

# Step-by-step verify all
npx hardhat run scripts/step-by-step/08-verify-all.ts --network baseSepolia
```

### Check Status
```bash
# Check mint status
npx hardhat run scripts/check-mint-status.ts --network baseSepolia

# Check proxy admin
npx hardhat run scripts/check-proxy-admin-status.ts --network baseSepolia

# Check timelock roles
npx hardhat run scripts/check-timelock-roles.ts --network baseSepolia
```

### Configuration
```bash
# Set token mint feed
npx hardhat run scripts/set-token-mint-feed.ts --network baseSepolia

# Set distribution config
ENV_FILE=.env.prod npx hardhat run scripts/set-distribution-config.ts --network mainnet

# Validate addresses
npx hardhat run scripts/validate-addresses.ts --network baseSepolia
```

---

## Best Practices

1. **Always check network**: Đảm bảo bạn đang chạy trên đúng network trước khi deploy.

2. **Verify env file**: Kiểm tra env file có đúng addresses và config trước khi deploy.

3. **Test first**: Luôn test trên testnet trước khi deploy lên mainnet.

4. **Backup**: Lưu deployment files và addresses sau mỗi deployment.

5. **Documentation**: Cập nhật documentation sau mỗi thay đổi.

6. **Security**: Không commit `.env.dev` hoặc `.env.prod` vào git.

---

## Troubleshooting

### Script không tìm thấy env file
- Kiểm tra file `.env.dev` hoặc `.env.prod` có tồn tại
- Sử dụng `DOTENV_CONFIG_PATH` để override

### Script không detect đúng network
- Kiểm tra `hardhat.config.ts` có đúng network config
- Sử dụng `--network` flag khi chạy script

### Address validation fails
- Kiểm tra address format (phải là valid Ethereum address)
- Kiểm tra contract đã được deploy chưa (code size > 0)

---

## Related Documentation

- `SCRIPTS_NAMING_CONVENTION.md` - Naming convention chi tiết
- `scripts/step-by-step/README.md` - Step-by-step deployment guide
- `FAST_TEST_ONCHAIN.md` - Fast test deployment guide

---

**Last Updated**: 2025-01-28

====================

Dev Scripts (Base Sepolia Testnet):
deploy-ultra-fast-base-sepolia-dev.ts
deploy-fast-test-base-sepolia-dev.ts
verify-ultra-fast-base-sepolia-dev.ts
verify-fast-test-base-sepolia-dev.ts
verify-base-sepolia-dev.ts

Prod Scripts (Mainnet):
deploy-mainnet-production-prod.ts

Step-by-Step Scripts — Tất cả 8 scripts với mô tả

Helper Scripts (Auto-Detect):
set-token-mint-feed.ts
validate-addresses.ts
check-token-mint-feed.ts

Deployment Scripts (Other Networks):
deploy-core-sepolia.ts
deploy-infra-sepolia.ts
deploy-proxy-sepolia.ts
deploy-testnet-sepolia.ts



### Scripts that use environment variables:
- 04-deploy-token.ts: Auto-detects network → loads .env.dev (baseSepolia) or .env.prod (mainnet) or .env (others)
- 06-deploy-governor.ts: Auto-detects network → loads .env.dev (baseSepolia) or .env.prod (mainnet) or .env (others)

### Scripts that don't need environment variables:
- 01-deploy-infrastructure.ts: No env vars needed
- 02-deploy-timelock.ts: No env vars needed
- 03-deploy-vesting.ts: No env vars needed
- 05-initialize-vesting.ts: No env vars needed
- 07-transfer-ownership.ts: No env vars needed
- 08-verify-all.ts: No env vars needed

### Conclusion:
Step-by-step scripts can be used for BOTH dev and prod:
- For baseSepolia (dev): Automatically uses .env.dev
- For mainnet (prod): Automatically uses .env.prod
- For other networks: Uses .env (default)

