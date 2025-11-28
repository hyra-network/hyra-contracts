import { ethers, network } from "hardhat";
import * as dotenv from "dotenv";

// Load .env.dev for Base Sepolia testnet, fallback to .env for other networks
// Can override with DOTENV_CONFIG_PATH environment variable
const envFile = process.env.DOTENV_CONFIG_PATH || (network.name === "baseSepolia" ? ".env.dev" : ".env");
dotenv.config({ path: envFile });

/**
 * Script to set TokenMintFeed address on HyraToken
 * This must be called by PRIVILEGED_MULTISIG_WALLET
 * 
 * Usage:
 *   npx hardhat run scripts/set-token-mint-feed.ts --network <network>
 * 
 * Environment variables required:
 *   - TOKEN_MINT_FEED_ADDRESS: Address of TokenMintFeed contract
 *   - TOKEN_PROXY_ADDRESS: Address of HyraToken proxy (or load from deployments)
 */

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(await deployer.getAddress())), "ETH");

  // Load TokenMintFeed address from .env
  const tokenMintFeedAddress = process.env.TOKEN_MINT_FEED_ADDRESS;
  if (!tokenMintFeedAddress) {
    throw new Error(`TOKEN_MINT_FEED_ADDRESS not set in ${envFile}`);
  }
  if (!ethers.isAddress(tokenMintFeedAddress)) {
    throw new Error(`Invalid TOKEN_MINT_FEED_ADDRESS format: ${tokenMintFeedAddress}`);
  }
  console.log(`\nTokenMintFeed Address: ${tokenMintFeedAddress}`);

  // Validate it's a contract
  const feedCode = await ethers.provider.getCode(tokenMintFeedAddress);
  if (feedCode === "0x") {
    throw new Error(`TOKEN_MINT_FEED_ADDRESS (${tokenMintFeedAddress}) is not a contract.`);
  }
  console.log(`   ✓ Verified as contract`);

  // Load Token proxy address
  const tokenProxyAddress = process.env.TOKEN_PROXY_ADDRESS;
  if (!tokenProxyAddress) {
    throw new Error("TOKEN_PROXY_ADDRESS not set in .env. Please set it or load from deployments.");
  }
  if (!ethers.isAddress(tokenProxyAddress)) {
    throw new Error(`Invalid TOKEN_PROXY_ADDRESS format: ${tokenProxyAddress}`);
  }
  console.log(`\nToken Proxy Address: ${tokenProxyAddress}`);

  // Get token contract instance
  const token = await ethers.getContractAt("HyraToken", tokenProxyAddress);
  
  // Check current tokenMintFeed
  const currentFeed = await token.tokenMintFeed();
  console.log(`\nCurrent TokenMintFeed: ${currentFeed}`);
  
  if (currentFeed.toLowerCase() === tokenMintFeedAddress.toLowerCase()) {
    console.log(`   ✓ TokenMintFeed is already set to this address. No action needed.`);
    return;
  }

  // Check privilegedMultisigWallet
  const privilegedMultisigWallet = await token.privilegedMultisigWallet();
  console.log(`\nPrivileged Multisig Wallet: ${privilegedMultisigWallet}`);
  console.log(`Current Signer: ${await deployer.getAddress()}`);
  
  if (deployer.address.toLowerCase() !== privilegedMultisigWallet.toLowerCase()) {
    console.warn(`\n⚠️  WARNING: Current signer is not the privilegedMultisigWallet!`);
    console.warn(`   This transaction will fail unless you are using the privilegedMultisigWallet.`);
    console.warn(`   Please use the privilegedMultisigWallet to sign this transaction.`);
    console.warn(`\n   To proceed, you can:`);
    console.warn(`   1. Use --impersonate flag with hardhat (for testing)`);
    console.warn(`   2. Use the privilegedMultisigWallet private key in .env`);
    console.warn(`   3. Call this function directly from the multisig wallet`);
    
    const proceed = process.env.FORCE_SET_TOKEN_MINT_FEED === "true";
    if (!proceed) {
      throw new Error("Transaction will fail. Set FORCE_SET_TOKEN_MINT_FEED=true to proceed anyway (for testing only).");
    }
  }

  // Set TokenMintFeed
  console.log(`\nSetting TokenMintFeed to ${tokenMintFeedAddress}...`);
  const tx = await token.setTokenMintFeed(tokenMintFeedAddress);
  console.log(`   Transaction hash: ${tx.hash}`);
  
  await tx.wait();
  console.log(`   ✓ Transaction confirmed`);

  // Verify
  const newFeed = await token.tokenMintFeed();
  console.log(`\nNew TokenMintFeed: ${newFeed}`);
  
  if (newFeed.toLowerCase() === tokenMintFeedAddress.toLowerCase()) {
    console.log(`   ✓ Successfully set TokenMintFeed address`);
  } else {
    throw new Error("Failed to set TokenMintFeed address");
  }

  console.log(`\n=== TokenMintFeed Setup Complete ===`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

