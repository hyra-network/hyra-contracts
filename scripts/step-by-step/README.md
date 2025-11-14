# Step-by-Step Deployment Guide


## Deployment Steps

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

## Networks

Các scripts này có thể dùng với:

- `--network sepolia` (Ethereum Sepolia)
- `--network baseSepolia` (Base Sepolia)
- `--network mainnet` (Ethereum Mainnet)

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
