import { HardhatUserConfig } from "hardhat/config";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load .env.prod for production
const envProdPath = path.resolve(__dirname, ".env.prod");
if (fs.existsSync(envProdPath)) {
  dotenv.config({ path: envProdPath, override: false });
}

import "@nomicfoundation/hardhat-toolbox";

/**
 * PRODUCTION CONFIGURATION FOR MAINNET DEPLOYMENT
 * 
 * This configuration is FIXED and should NOT be changed after audit:
 * - viaIR: false (standard, well-tested)
 * - runs: 200 (optimized for gas efficiency in production)
 * 
 * Why fixed settings?
 * 1. Audit consistency: Certik audits specific bytecode
 * 2. Reproducibility: Same settings = same bytecode
 * 3. Verification: Must match deployed bytecode exactly
 * 4. Security: Tested bytecode = audited bytecode
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.25",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // PRODUCTION: Optimized for gas efficiency (contracts called frequently)
      },
      evmVersion: "cancun",
      viaIR: false, // PRODUCTION: Standard compilation (well-tested, audited)
    },
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    localhost: {
      allowUnlimitedContractSize: true,
    },
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "https://mainnet.infura.io/v3/YOUR_INFURA_KEY",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      gasPrice: 30000000000, // 30 gwei
      gas: 8000000, // 8M gas limit
      chainId: 1,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};

export default config;

