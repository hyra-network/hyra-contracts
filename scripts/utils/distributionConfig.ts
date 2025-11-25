import { ethers } from "hardhat";
import type { Contract } from "ethers";

export interface DistributionAddresses {
  communityEcosystem: string;
  liquidityBuybackReserve: string;
  marketingPartnerships: string;
  teamFounders: string;
  strategicAdvisors: string;
  seedStrategicVC: string;
}

const ENV_KEYS: Record<keyof DistributionAddresses, string> = {
  communityEcosystem: "COMMUNITY_ECOSYSTEM_WALLET",
  liquidityBuybackReserve: "LIQUIDITY_BUYBACK_RESERVE_WALLET",
  marketingPartnerships: "MARKETING_PARTNERSHIPS_WALLET",
  teamFounders: "TEAM_FOUNDERS_WALLET",
  strategicAdvisors: "STRATEGIC_ADVISORS_WALLET",
  seedStrategicVC: "SEED_STRATEGIC_VC_WALLET",
};

export async function loadDistributionAddresses(): Promise<DistributionAddresses> {
  const addresses = {} as DistributionAddresses;

  for (const [key, envKey] of Object.entries(ENV_KEYS) as Array<
    [keyof DistributionAddresses, string]
  >) {
    const value = process.env[envKey];
    if (!value || value === "0x0000000000000000000000000000000000000000") {
      throw new Error(`Missing environment variable ${envKey}`);
    }
    if (!ethers.isAddress(value)) {
      throw new Error(`Invalid address format for ${envKey}: ${value}`);
    }
    addresses[key] = ethers.getAddress(value);
  }

  const addressList = Object.values(addresses);
  const unique = new Set(addressList);
  if (unique.size !== addressList.length) {
    throw new Error("Duplicate addresses detected in distribution config");
  }

  for (const [key, address] of Object.entries(addresses) as Array<
    [keyof DistributionAddresses, string]
  >) {
    const code = await ethers.provider.getCode(address);
    if (code === "0x") {
      throw new Error(`${key} (${address}) is not a contract. All wallets must be multisig contracts.`);
    }
  }

  return addresses;
}

export function logDistributionAddresses(addresses: DistributionAddresses): void {
  console.log("   Community & Ecosystem (60%):", addresses.communityEcosystem);
  console.log("   Liquidity, Buyback & Reserve (12%):", addresses.liquidityBuybackReserve);
  console.log("   Marketing & Partnerships (10%):", addresses.marketingPartnerships);
  console.log("   Team & Founders (8%):", addresses.teamFounders);
  console.log("   Strategic Advisors (5%):", addresses.strategicAdvisors);
  console.log("   Seed & Strategic VC (5%):", addresses.seedStrategicVC);
}

export async function verifyDistributionBalances(
  token: Contract,
  addresses: DistributionAddresses,
  expectedTotal?: bigint
): Promise<void> {
  const balances: Record<keyof DistributionAddresses, bigint> = {
    communityEcosystem: (await token.balanceOf(addresses.communityEcosystem)) as bigint,
    liquidityBuybackReserve: (await token.balanceOf(addresses.liquidityBuybackReserve)) as bigint,
    marketingPartnerships: (await token.balanceOf(addresses.marketingPartnerships)) as bigint,
    teamFounders: (await token.balanceOf(addresses.teamFounders)) as bigint,
    strategicAdvisors: (await token.balanceOf(addresses.strategicAdvisors)) as bigint,
    seedStrategicVC: (await token.balanceOf(addresses.seedStrategicVC)) as bigint,
  };

  const total = (Object.values(balances) as bigint[]).reduce((acc, value) => acc + value, 0n);

  console.log("   --- Distribution Balances ---");
  console.log("   Community & Ecosystem:", ethers.formatEther(balances.communityEcosystem), "HYRA");
  console.log("   Liquidity, Buyback & Reserve:", ethers.formatEther(balances.liquidityBuybackReserve), "HYRA");
  console.log("   Marketing & Partnerships:", ethers.formatEther(balances.marketingPartnerships), "HYRA");
  console.log("   Team & Founders:", ethers.formatEther(balances.teamFounders), "HYRA");
  console.log("   Strategic Advisors:", ethers.formatEther(balances.strategicAdvisors), "HYRA");
  console.log("   Seed & Strategic VC:", ethers.formatEther(balances.seedStrategicVC), "HYRA");
  console.log("   Total Distributed:", ethers.formatEther(total), "HYRA");

  if (expectedTotal !== undefined && total !== expectedTotal) {
    throw new Error(
      `Distribution mismatch: expected ${ethers.formatEther(expectedTotal)} HYRA but distributed ${ethers.formatEther(
        total
      )} HYRA`
    );
  }
}

