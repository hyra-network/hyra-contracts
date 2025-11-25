import { expect } from "chai";
import { ethers } from "hardhat";
import {
  loadDistributionAddresses,
  verifyDistributionBalances,
  DistributionAddresses,
} from "../scripts/utils/distributionConfig";

const ENV_KEYS = [
  "COMMUNITY_ECOSYSTEM_WALLET",
  "LIQUIDITY_BUYBACK_RESERVE_WALLET",
  "MARKETING_PARTNERSHIPS_WALLET",
  "TEAM_FOUNDERS_WALLET",
  "STRATEGIC_ADVISORS_WALLET",
  "SEED_STRATEGIC_VC_WALLET",
] as const;

type EnvBackup = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

describe("DistributionConfig utilities", function () {
  let multisigContracts: string[] = [];
  let ownerEOA: string;
  let envBackup: EnvBackup = {};

  before(async function () {
    const [owner] = await ethers.getSigners();
    ownerEOA = await owner.getAddress();

    const DummyContract = await ethers.getContractFactory("HyraTimelock");
    // Deploy six dummy multisig contracts (any contract address is acceptable)
    for (let i = 0; i < 6; i++) {
      const instance = await DummyContract.deploy();
      await instance.waitForDeployment();
      multisigContracts.push(await instance.getAddress());
    }
  });

  beforeEach(function () {
    envBackup = {};
    for (const key of ENV_KEYS) {
      envBackup[key] = process.env[key];
    }
    setEnvWithMultisigs();
  });

  afterEach(function () {
    for (const key of ENV_KEYS) {
      const value = envBackup[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  function setEnvWithMultisigs(overrides?: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
    ENV_KEYS.forEach((key, idx) => {
      const overrideValue = overrides?.[key];
      process.env[key] = overrideValue ?? multisigContracts[idx];
    });
  }

  async function getDistributionAddresses(): Promise<DistributionAddresses> {
    return {
      communityEcosystem: multisigContracts[0],
      liquidityBuybackReserve: multisigContracts[1],
      marketingPartnerships: multisigContracts[2],
      teamFounders: multisigContracts[3],
      strategicAdvisors: multisigContracts[4],
      seedStrategicVC: multisigContracts[5],
    };
  }

  it("loads distribution addresses when env is valid", async function () {
    const addresses = await loadDistributionAddresses();
    expect(addresses.communityEcosystem).to.equal(multisigContracts[0]);
    expect(addresses.seedStrategicVC).to.equal(multisigContracts[5]);
  });

  it("throws if an env variable is missing", async function () {
    delete process.env.COMMUNITY_ECOSYSTEM_WALLET;
    await expect(loadDistributionAddresses()).to.be.rejectedWith(
      "Missing environment variable COMMUNITY_ECOSYSTEM_WALLET"
    );
  });

  it("throws if duplicate addresses are provided", async function () {
    setEnvWithMultisigs({ LIQUIDITY_BUYBACK_RESERVE_WALLET: multisigContracts[0] });
    await expect(loadDistributionAddresses()).to.be.rejectedWith("Duplicate addresses detected");
  });

  it("throws if any address is an EOA (not a contract)", async function () {
    setEnvWithMultisigs({ SEED_STRATEGIC_VC_WALLET: ownerEOA });
    await expect(loadDistributionAddresses()).to.be.rejectedWith("is not a contract");
  });

  it("verifies distribution balances after token initialization", async function () {
    const addresses = await getDistributionAddresses();
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();
    await tokenImpl.waitForDeployment();
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
    await tokenProxy.waitForDeployment();
    const token = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

    await token.setDistributionConfig(
      addresses.communityEcosystem,
      addresses.liquidityBuybackReserve,
      addresses.marketingPartnerships,
      addresses.teamFounders,
      addresses.strategicAdvisors,
      addresses.seedStrategicVC
    );

    const initialSupply = ethers.parseEther("1000");
    await token.initialize("HYRA", "HYRA", initialSupply, addresses.communityEcosystem, ownerEOA, 0);

    await expect(verifyDistributionBalances(token, addresses, initialSupply)).to.be.fulfilled;
    await expect(
      verifyDistributionBalances(token, addresses, initialSupply + ethers.parseEther("1"))
    ).to.be.rejectedWith("Distribution mismatch");
  });
});

