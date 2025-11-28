# Scripts Naming Convention

## Overview

Scripts are now organized by environment using suffix naming:
- **`-dev.ts`**: Scripts for development/testnet (use `.env.dev`)
- **`-prod.ts`**: Scripts for production/mainnet (use `.env.prod`)

## Dev Scripts (Base Sepolia Testnet)

These scripts use `.env.dev` and are for testing on Base Sepolia:

### Deployment Scripts
- `deploy-ultra-fast-base-sepolia-dev.ts` - Ultra fast test deployment (2 min delay, 1 hour year)
- `deploy-fast-test-base-sepolia-dev.ts` - Fast test deployment (2 min delay)

### Verification Scripts
- `verify-ultra-fast-base-sepolia-dev.ts` - Verify ultra fast test contracts
- `verify-fast-test-base-sepolia-dev.ts` - Verify fast test contracts
- `verify-base-sepolia-dev.ts` - Verify Base Sepolia contracts

### Usage
```bash
# Deploy ultra fast test
npx hardhat run scripts/deploy-ultra-fast-base-sepolia-dev.ts --network baseSepolia

# Deploy fast test
npx hardhat run scripts/deploy-fast-test-base-sepolia-dev.ts --network baseSepolia

# Verify contracts
npx hardhat run scripts/verify-ultra-fast-base-sepolia-dev.ts --network baseSepolia
npx hardhat run scripts/verify-fast-test-base-sepolia-dev.ts --network baseSepolia
npx hardhat run scripts/verify-base-sepolia-dev.ts --network baseSepolia
```

## Prod Scripts (Mainnet)

These scripts use `.env.prod` and are for production deployment:

### Deployment Scripts
- `deploy-mainnet-production-prod.ts` - Production deployment to Ethereum Mainnet

### Usage
```bash
# Deploy to mainnet (PRODUCTION)
npx hardhat run scripts/deploy-mainnet-production-prod.ts --network mainnet
```

## Step-by-Step Scripts

Step-by-step scripts automatically detect network and load appropriate env file:
- For `baseSepolia`: Loads `.env.dev` (can override with `DOTENV_CONFIG_PATH`)
- For other networks: Loads `.env` (can override with `DOTENV_CONFIG_PATH`)

### Scripts
- `step-by-step/01-deploy-infrastructure.ts`
- `step-by-step/02-deploy-timelock.ts`
- `step-by-step/03-deploy-vesting.ts`
- `step-by-step/04-deploy-token.ts`
- `step-by-step/05-initialize-vesting.ts`
- `step-by-step/06-deploy-governor.ts`
- `step-by-step/07-transfer-ownership.ts`
- `step-by-step/08-verify-all.ts`

### Usage
```bash
# For Base Sepolia (auto-loads .env.dev)
npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia

# Override env file if needed
DOTENV_CONFIG_PATH=.env npx hardhat run scripts/step-by-step/04-deploy-token.ts --network baseSepolia
```

## Helper Scripts (Auto-Detect)

These scripts automatically detect the network and load the appropriate env file:
- For `baseSepolia`: Loads `.env.dev`
- For other networks: Loads `.env`

### Scripts
- `set-token-mint-feed.ts` - Set TokenMintFeed address
- `validate-addresses.ts` - Validate addresses against contract logic
- `check-token-mint-feed.ts` - Check TokenMintFeed contract (defaults to `.env.dev`)

### Usage
```bash
# Auto-detects network and loads correct env file
npx hardhat run scripts/set-token-mint-feed.ts --network baseSepolia
npx hardhat run scripts/validate-addresses.ts --network baseSepolia
npx hardhat run scripts/check-token-mint-feed.ts --network baseSepolia
```

## Environment Files

- **`.env.dev`**: Environment variables for Base Sepolia testnet
- **`.env.prod`**: Environment variables for Ethereum Mainnet production
- **`.env`**: Default environment variables (for local development or other networks)

## Migration Summary

### Renamed Files
1. `deploy-ultra-fast-base-sepolia.ts` → `deploy-ultra-fast-base-sepolia-dev.ts`
2. `deploy-fast-test-base-sepolia.ts` → `deploy-fast-test-base-sepolia-dev.ts`
3. `verify-ultra-fast-base-sepolia.ts` → `verify-ultra-fast-base-sepolia-dev.ts`
4. `verify-fast-test-base-sepolia.ts` → `verify-fast-test-base-sepolia-dev.ts`
5. `verify-base-sepolia.ts` → `verify-base-sepolia-dev.ts`
6. `deploy-mainnet-production.ts` → `deploy-mainnet-production-prod.ts`

### Updated References
- `FAST_TEST_ONCHAIN.md` - Updated script references
- Internal script references (deploy scripts reference verify scripts)

## Benefits

1. **Clear Environment Separation**: Easy to identify which scripts are for dev vs prod
2. **Prevent Accidents**: Naming convention makes it harder to accidentally use wrong env file
3. **Better Organization**: Scripts are clearly categorized by purpose
4. **Maintainability**: Easier to find and update scripts for specific environments

