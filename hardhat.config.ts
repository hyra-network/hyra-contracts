import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load .env first (default)
dotenv.config();

// Also load .env.dev if it exists (for Base Sepolia testnet)
const envDevPath = path.resolve(__dirname, ".env.dev");
if (fs.existsSync(envDevPath)) {
  dotenv.config({ path: envDevPath, override: false }); // Don't override existing vars
}

// Also load .env.prod if it exists (for Mainnet)
const envProdPath = path.resolve(__dirname, ".env.prod");
if (fs.existsSync(envProdPath)) {
  dotenv.config({ path: envProdPath, override: false }); // Don't override existing vars
}

import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Lower runs = smaller contract size (for new deployments like HyraGovernor)
      },
      evmVersion: "cancun",
      viaIR: true, // Enable viaIR to reduce contract size (for new deployments)
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    localhost: {
      allowUnlimitedContractSize: true,
    },
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
      gasPrice: 20000000000, // 20 gwei
      gas: 8000000, // 8M gas limit
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 20000000000, // 20 gwei
      gas: 8000000, // 8M gas limit
    },
    goerli: {
      url: process.env.GOERLI_RPC_URL || "https://goerli.infura.io/v3/YOUR_INFURA_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 20000000000, // 20 gwei
      gas: 8000000, // 8M gas limit
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "https://mainnet.infura.io/v3/YOUR_INFURA_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 30000000000, // 30 gwei
      gas: 8000000, // 8M gas limit
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
    ],
  },
};

export default config;
