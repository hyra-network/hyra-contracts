# Mainnet Deployment Guide for Certik Audit

## ⚠️ CRITICAL: Compiler Settings Must Be Fixed

### Why Fixed Settings Are Required

1. **Audit Consistency**
   - Certik audits specific bytecode generated from specific compiler settings
   - Changing settings = different bytecode = different contract = not audited
   - Must use **exact same settings** as audit

2. **Reproducibility**
   - Same source code + same settings = same bytecode
   - Allows verification that deployed contract matches audited code
   - Enables deterministic deployments

3. **Verification Requirements**
   - Etherscan/Basescan verification requires matching bytecode
   - Different compiler settings = verification failure
   - Must match deployed bytecode exactly

4. **Security Best Practices**
   - Tested bytecode = audited bytecode
   - No surprises in production
   - Community can verify deployed code matches audited code

## Production Compiler Settings

### ✅ FIXED SETTINGS (DO NOT CHANGE)

```typescript
solidity: {
  version: "0.8.25",
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,  // FIXED: Optimized for gas efficiency
    },
    evmVersion: "cancun",
    viaIR: false, // FIXED: Standard compilation (well-tested)
  },
}
```

### Why `viaIR: false` for Production?

1. **Standard & Well-Tested**
   - Most widely used compilation method
   - Better tested in production environments
   - More predictable bytecode size

2. **Audit Compatibility**
   - Certik typically audits with standard settings
   - Easier to verify bytecode matches audit
   - Industry standard for production

3. **Gas Efficiency**
   - `runs: 200` + `viaIR: false` = optimal gas for frequently called contracts
   - Better for production contracts (Token, Governor, etc.)
   - Lower gas costs for users

4. **Size Management**
   - If contracts are under 24KB with `viaIR: false`, no need for `viaIR: true`
   - Only use `viaIR: true` if contract exceeds 24KB limit
   - Production contracts should be optimized to fit standard settings

## Deployment Process

### Step 1: Use Production Config

```bash
# Use production config file
cp hardhat.config.production.ts hardhat.config.ts

# Or use environment variable
HARDHAT_CONFIG=hardhat.config.production.ts npx hardhat compile
```

### Step 2: Verify Settings Before Deploy

```bash
# Check compiler settings
npx hardhat compile --force

# Verify bytecode size
npx hardhat run scripts/check-contract-sizes.ts
```

### Step 3: Deploy with Fixed Settings

```bash
# Deploy to mainnet
npx hardhat run scripts/deploy-mainnet-production-prod.ts --network mainnet
```

### Step 4: Verify Contracts

```bash
# Verify all contracts
npx hardhat run scripts/verify-contracts.ts --network mainnet
```

## Pre-Deployment Checklist

- [ ] Compiler settings match audit settings exactly
- [ ] All contracts compile successfully
- [ ] Contract sizes are under 24KB limit
- [ ] All tests pass with production settings
- [ ] Gas estimates are acceptable
- [ ] Verification scripts work correctly
- [ ] Documentation updated with final settings

## Post-Deployment Verification

1. **Verify Bytecode Matches**
   ```bash
   # Compare deployed bytecode with local compilation
   npx hardhat run scripts/verify-bytecode-match.ts --network mainnet
   ```

2. **Verify on Etherscan**
   ```bash
   # Verify all contracts
   npx hardhat verify --network mainnet CONTRACT_ADDRESS
   ```

3. **Document Settings**
   - Record exact compiler settings used
   - Save compilation artifacts
   - Document any deviations from audit

## Important Notes

### ⚠️ DO NOT CHANGE SETTINGS AFTER AUDIT

- Changing `viaIR` or `runs` after audit = different bytecode
- Different bytecode = not audited = security risk
- Always use same settings as audit

### ✅ When to Use `viaIR: true`

Only use `viaIR: true` if:
- Contract exceeds 24KB with `viaIR: false`
- AND audit was done with `viaIR: true`
- AND you have explicit approval from audit team

### 📝 Best Practice

1. **Before Audit**: Optimize contracts to fit standard settings
2. **During Audit**: Use production settings
3. **After Audit**: NEVER change settings
4. **Deployment**: Use exact same settings as audit

## Contract Size Management

If contracts are too large with `viaIR: false`:

1. **Optimize Code**
   - Use libraries for common functionality
   - Split large contracts into smaller modules
   - Remove unused code

2. **Consider viaIR: true**
   - Only if absolutely necessary
   - Must be audited with this setting
   - Document why it's needed

3. **Alternative: Proxy Pattern**
   - Use implementation contracts (already using)
   - Implementation can be larger
   - Proxy stays small

## Summary

**For Certik Audit & Mainnet Deployment:**

✅ **USE**: `viaIR: false, runs: 200` (standard production settings)
❌ **DON'T USE**: `viaIR: true` unless contract exceeds 24KB AND audit approved it
🔒 **FIXED**: Settings must match audit exactly
📝 **DOCUMENT**: All settings used for audit and deployment

