# **Hyra Contracts**

**Hyra Contracts** is the smart contract backbone of the **Hyra DAO** — delivering a fully upgradeable, DAO-controlled architecture for governance, token management, and secure protocol upgrades.  
Built with **Hardhat** and **OpenZeppelin** upgradeable libraries, it empowers communities to own and evolve their protocol without compromising security.

---

## **✨ Highlights**
- **DAO-First Design** – Every critical action (minting, pausing, upgrading) is gated by on-chain governance.  
- **Upgradeable Architecture** – Safe, scheduled upgrades via `HyraGovernor` + `HyraTimelock` + `HyraProxyAdmin`.  
- **Time-Locked Security** – Sensitive actions delayed to give the community time to react.  
- **Modular System** – Core contracts, proxy administration, and mocks for testing all separated for clarity.  

---

## **💎 Hyra Token**
The heart of the ecosystem — **HyraToken** — is a governance-ready, upgradeable ERC20 with built-in safeguards:

- **2.5B HYRA** initial supply at launch.  
- **Delegated Voting** for DAO proposals.  
- **DAO-Controlled Minting** with annual caps & per-minter quotas.  
- **Pause/Unpause** capability for emergency stops.  
- **Burnable** by any holder.  
- Fully upgradeable via DAO-controlled proxy flow.  

---

## **🗂 Structure**
```
contracts/
  core/                # Main DAO logic (Governor, Timelock, Token)
  mocks/               # Mocks for testing upgrades (e.g., HyraTokenV2)
  interfaces/          # Interfaces
  proxy/
  utils/
```

---

## **⚡ Quick Start**
```shell
yarn install
npx hardhat compile
npx hardhat test
```


---

## **🚀 Development & Deployment**
Run local node:
```shell
npx hardhat node
```

Deploy:
```shell
npx hardhat run scripts/deploy.ts --network localhost
```

---
