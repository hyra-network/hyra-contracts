# Centralization Mitigation Evidence (Public)

Provide these links to auditors (e.g., CertiK) to reflect remediation status.

## On-chain Addresses
- Token (proxy): 0x...
- TokenVesting (proxy): 0x...
- Timelock (proxy): 0x... (delay: 24h)
- Governor (proxy): 0x...
- Multisig Safe: 0x... (threshold: X/Y)

## Transactions
- Token initialize (vesting, owner = timelock): 0x...
- Vesting initialize (token, owner = timelock): 0x...
- Governor initialize (token, timelock): 0x...
- Timelock initialization (delay): 0x...
- Multisig role grants (proposer/canceller): 0x..., 0x...
- (If applicable) Deployer role revocations: 0x...

## Code References
- Removal of single-holder initializer: `contracts/core/HyraToken.sol`
- Deploy script (vesting + timelock): `scripts/deploy-core-sepolia.ts`
- Multisig role script: `scripts/apply-multisig-roles.ts`

## Publication Links
- `docs/TOKEN_DISTRIBUTION.md`
- `docs/KEY_MANAGEMENT.md`
- `docs/KYC_READINESS.md`

## Target Report Status
- Removed (single-holder path eliminated)
- [X]/[Y] Multi-sig (when live Safe is configured and proven)
- [24]h Timelock
