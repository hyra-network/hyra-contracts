import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as dotenv from "dotenv";

// Auto-detect environment file based on network:
// - baseSepolia: .env.dev (testnet)
// - mainnet: .env.prod (production)
// - other networks: .env (default)
// Can override with DOTENV_CONFIG_PATH environment variable
const envFile = process.env.DOTENV_CONFIG_PATH || 
  (network.name === "baseSepolia" ? ".env.dev" : 
   network.name === "mainnet" ? ".env.prod" : ".env");
dotenv.config({ path: envFile });

/**
 * Step 4: Deploy HyraToken
 * Prerequisites: Vesting proxy address, Timelock proxy address
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  console.log("\n=== Step 4: Deploying HyraToken ===\n");

  // Get prerequisite addresses
  const vestingAddress = await question("Enter TokenVesting Proxy address (from Step 3): ");
  if (!ethers.isAddress(vestingAddress)) {
    throw new Error("Invalid Vesting address");
  }

  const safeAddress = await question("Enter Safe Multisig address (for initial supply): ");
  if (!ethers.isAddress(safeAddress)) {
    throw new Error("Invalid Safe address");
  }

  // 1. Deploy HyraToken Implementation
  console.log("\n1. Deploying HyraToken Implementation...");
  const HyraToken = await ethers.getContractFactory("HyraToken");
  const tokenImpl = await HyraToken.deploy({ gasLimit: 8_000_000 });
  await tokenImpl.waitForDeployment();
  console.log(`   Implementation: ${await tokenImpl.getAddress()}`);

  // 2. Deploy ERC1967Proxy for Token
  console.log("\n2. Deploying Token Proxy...");
  const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");

  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5B
  
  // Load and validate Privileged Multisig Wallet
  const privilegedMultisigWallet = process.env.PRIVILEGED_MULTISIG_WALLET;
  if (!privilegedMultisigWallet) {
    throw new Error(`PRIVILEGED_MULTISIG_WALLET not set in ${envFile}`);
  }
  if (!ethers.isAddress(privilegedMultisigWallet)) {
    throw new Error(`Invalid PRIVILEGED_MULTISIG_WALLET address: ${privilegedMultisigWallet}`);
  }
  const code = await ethers.provider.getCode(privilegedMultisigWallet);
  if (code === "0x") {
    throw new Error(`PRIVILEGED_MULTISIG_WALLET (${privilegedMultisigWallet}) is not a contract. Must be a multisig wallet.`);
  }
  console.log(`   Privileged Multisig Wallet: ${privilegedMultisigWallet} (verified as contract)`);
  
  const tokenInit = HyraToken.interface.encodeFunctionData("initialize", [
    "HYRA",
    "HYRA",
    INITIAL_SUPPLY,
    safeAddress,                          // vesting contract (not used when distributing)
    await deployer.getAddress(),          // Temporary owner
    privilegedMultisigWallet              // Privileged Multisig Wallet
  ]);
  
  const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), tokenInit, { gasLimit: 8_000_000 });
  await tokenProxy.waitForDeployment();
  console.log(`   Proxy: ${await tokenProxy.getAddress()}`);
  console.log(`   Initial supply minted: 2.5B HYRA to ${safeAddress}`);
  
  // Load and set TokenMintFeed address (optional - can be set later by privilegedMultisigWallet)
  const tokenMintFeedAddress = process.env.TOKEN_MINT_FEED_ADDRESS;
  if (tokenMintFeedAddress) {
    if (!ethers.isAddress(tokenMintFeedAddress)) {
      console.warn(`   ⚠️  Invalid TOKEN_MINT_FEED_ADDRESS format: ${tokenMintFeedAddress}`);
    } else {
      const feedCode = await ethers.provider.getCode(tokenMintFeedAddress);
      if (feedCode === "0x") {
        console.warn(`   ⚠️  TOKEN_MINT_FEED_ADDRESS (${tokenMintFeedAddress}) is not a contract. Skipping setTokenMintFeed().`);
        console.warn(`   ⚠️  PRIVILEGED_MULTISIG_WALLET should call setTokenMintFeed() manually after deploying TokenMintFeed contract.`);
      } else {
        // Get token contract instance
        const token = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());
        // Impersonate privilegedMultisigWallet to call setTokenMintFeed
        // Note: In production, privilegedMultisigWallet should call this manually
        console.log(`   Setting TokenMintFeed address: ${tokenMintFeedAddress}`);
        try {
          // Try to call setTokenMintFeed using privilegedMultisigWallet
          // This requires privilegedMultisigWallet to sign the transaction
          console.log(`   ⚠️  Note: setTokenMintFeed() must be called by PRIVILEGED_MULTISIG_WALLET`);
          console.log(`   ⚠️  Manual step required: privilegedMultisigWallet should call:`);
          console.log(`   ⚠️  token.setTokenMintFeed("${tokenMintFeedAddress}")`);
        } catch (error) {
          console.warn(`   ⚠️  Could not set TokenMintFeed automatically. PRIVILEGED_MULTISIG_WALLET must call setTokenMintFeed() manually.`);
        }
      }
    }
  } else {
    console.log(`   ⚠️  TOKEN_MINT_FEED_ADDRESS not set in ${envFile}`);
    console.log(`   ⚠️  PRIVILEGED_MULTISIG_WALLET should call setTokenMintFeed() after deploying TokenMintFeed contract.`);
  }

  // Save deployment info
  const deployment = {
    step: "04-token",
    network: (await ethers.provider.getNetwork()).name,
    deployedAt: new Date().toISOString(),
    deployer: await deployer.getAddress(),
    contracts: {
      tokenImpl: await tokenImpl.getAddress(),
      tokenProxy: await tokenProxy.getAddress()
    },
    config: {
      name: "HYRA",
      symbol: "HYRA",
      initialSupply: "2500000000",
      initialSupplyRecipient: safeAddress,
      temporaryOwner: await deployer.getAddress(),
      yearStartTime: 1735689600, // YEAR_2025_START = 01/01/2025 00:00:00 UTC
      yearStartDate: new Date(1735689600 * 1000).toISOString()
    },
    prerequisites: {
      vestingProxy: vestingAddress
    }
  };

  const deploymentsDir = path.join(__dirname, "..", "..", "deployments", "step-by-step");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const deploymentPath = path.join(deploymentsDir, `04-token-${Date.now()}.json`);
  fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));

  console.log("\n=== Token Deployment Complete ===");
  console.log(`\nDeployment saved to: ${deploymentPath}`);
  
  console.log("\nDeployed Contracts:");
  console.log(`Token Implementation: ${await tokenImpl.getAddress()}`);
  console.log(`Token Proxy:          ${await tokenProxy.getAddress()}`);
  
  console.log("\nConfig:");
  console.log(`Initial Supply:       2.5B HYRA`);
  console.log(`Minted to:            ${safeAddress}`);
  console.log(`Temporary Owner:      ${await deployer.getAddress()}`);
  console.log(`Year 1 Start:         ${new Date(1735689600 * 1000).toISOString()}`); // 01/01/2025 00:00:00 UTC

  console.log("\n*** SAVE TOKEN PROXY ADDRESS FOR NEXT STEPS ***");

  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
  rl.close();
});

