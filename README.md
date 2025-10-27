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

## **Hyra Token**
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

### Install Dependencies
```bash
npm install
# hoặc
yarn install
```

### Compile Contracts
```bash
npm run compile
# hoặc
npx hardhat compile
```

### Run Tests
```bash
npm test
# hoặc
npx hardhat test
```

---

## ** Deployment**

### Deploy to Testnet (Sepolia)

1. **Setup Environment:**
   ```bash
   # Copy .env.example to .env
   cp .env.example .env
   
   # Edit .env với your API keys
   nano .env
   ```

2. **Get Testnet ETH:**
   - Sepolia Faucet: https://sepoliafaucet.com
   - Alchemy Faucet: https://www.alchemy.com/faucets/ethereum-sepolia

3. **Deploy:**
   ```bash
   npm run deploy:sepolia
   ```

4. **Verify Contracts:**
   ```bash
   npm run verify:sepolia
   ```

### Development & Testing

**Run local node:**
```bash
npx hardhat node
```

**Deploy to localhost:**
```bash
npm run deploy:localhost
```

### 📚 More Documentation

- **[Deployment Summary](./DEPLOY_README.md)** - 🚀 Quick deploy guide
- **[Quick Start Guide](./QUICK_START.md)** - Hướng dẫn deploy nhanh (5 phút)
- **[Full Deployment Guide](./DEPLOYMENT_GUIDE.md)** - Hướng dẫn deploy chi tiết
- **[RPC Providers](./RPC_PROVIDERS.md)** - So sánh các RPC providers
- **[Audit Reports](./docs/audit/)** - Security audit reports

---

## Documentation

- **[Documentation Overview](./docs/README.md)** - Complete documentation guide
- **[Audit Reports](./docs/audit/)** - Security audit reports and fixes
- **[Security Implementation](./docs/HNA03_SECURITY_IMPLEMENTATION.md)** - Security implementation details

### Security Status
All CertiK audit findings have been resolved (22/22 - 100% resolution rate). The codebase is production-ready with enhanced security measures.

---
