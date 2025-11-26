# **Hyra Contracts**

**Hyra Contracts** is the smart contract backbone of the **Hyra DAO** - delivering a fully upgradeable, DAO-controlled architecture for governance, token management, and secure protocol upgrades.  
Built with **Hardhat** and **OpenZeppelin** upgradeable libraries, it empowers communities to own and evolve their protocol without compromising security.

---

## **Highlights**
- **DAO-First Design** - Every critical action (minting, pausing, upgrading) is gated by on-chain governance.  
- **Upgradeable Architecture** - Safe, scheduled upgrades via `HyraGovernor` + `HyraTimelock` + `HyraProxyAdmin`.  
- **Time-Locked Security** - Sensitive actions delayed to give the community time to react.  
- **Modular System** - Core contracts, proxy administration, and mocks for testing all separated for clarity.  

---

## **HYRA Token**
The heart of the ecosystem - **HyraToken** - is a governance-ready, upgradeable ERC20 with built-in safeguards:

- **2.5B HYRA** initial supply at launch.  
- **Delegated Voting** for DAO proposals.  
- **DAO-Controlled Minting** with annual caps & per-minter quotas.  
- **Pause/Unpause** capability for emergency stops.  
- **Burnable** by any holder.  
- Fully upgradeable via DAO-controlled proxy flow.  

---

## ** Structure**
```
contracts/
  core/                # Main DAO logic (Governor, Timelock, Token)
  security/            # Security contracts (DAORoleManager, SecureExecutorManager, etc.)
  mocks/               # Mocks for testing upgrades (e.g., HyraTokenV2)
  interfaces/          # Interfaces
  proxy/               # Proxy contracts and admin
  utils/               # Utility contracts
docs/                  # Documentation and audit reports
  audit/               # Audit reports and security analysis
```

---

## ** Quick Start**
```shell
yarn install
npx hardhat compile
npx hardhat test
```


---

## ** Development & Deployment**

### Environment Variables
Before deploying, create a `.env` or `.env.prod` file with the required configuration. See [ENV_TEMPLATE.md](./ENV_TEMPLATE.md) for the complete template.

**Required Variables:**
- `MINT_REQUEST_MULTISIG_WALLET` - Multisig wallet that can create mint request proposals without 3% voting power (must be a contract address)
- `COMMUNITY_ECOSYSTEM_WALLET` - Distribution wallet (60%)
- `LIQUIDITY_BUYBACK_RESERVE_WALLET` - Distribution wallet (12%)
- `MARKETING_PARTNERSHIPS_WALLET` - Distribution wallet (10%)
- `TEAM_FOUNDERS_WALLET` - Distribution wallet (8%)
- `STRATEGIC_ADVISORS_WALLET` - Distribution wallet (5%)
- `SEED_STRATEGIC_VC_WALLET` - Distribution wallet (5%)
- `SAFE_ADDRESS` - Safe Multisig Wallet for governance

**Important:** All wallet addresses must be contract addresses (multisig wallets), not EOA addresses.

Run local node:
```shell
npx hardhat node
```

Deploy:
```shell
npx hardhat run scripts/deploy-core-sepolia.ts --network sepolia
```

---

## Documentation

- **[Documentation Overview](./docs/README.md)** - Complete documentation guide
- **[Audit Reports](./docs/audit/)** - Security audit reports and fixes
- **[Security Implementation](./docs/HNA03_SECURITY_IMPLEMENTATION.md)** - Security implementation details

### Security Status
All CertiK audit findings have been resolved (22/22 - 100% resolution rate). The codebase is production-ready with enhanced security measures.

---
