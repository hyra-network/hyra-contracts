import { expect } from "chai";
import { ethers } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, MockDistributionWallet } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Token Distribution Logic", function () {
  let token: HyraToken;
  let deployer: SignerWithAddress;
  let owner: SignerWithAddress;
  let privilegedMultisig: MockDistributionWallet;

  // 6 Distribution Wallets
  let communityWallet: MockDistributionWallet;
  let liquidityWallet: MockDistributionWallet;
  let marketingWallet: MockDistributionWallet;
  let teamWallet: MockDistributionWallet;
  let advisorsWallet: MockDistributionWallet;
  let seedWallet: MockDistributionWallet;

  let wallets: string[];

  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5B

  beforeEach(async function () {
    [deployer, owner] = await ethers.getSigners();

    // Deploy Mock Wallets
    const MockWallet = await ethers.getContractFactory("MockDistributionWallet");

    communityWallet = await MockWallet.deploy(deployer.address);
    liquidityWallet = await MockWallet.deploy(deployer.address);
    marketingWallet = await MockWallet.deploy(deployer.address);
    teamWallet = await MockWallet.deploy(deployer.address);
    advisorsWallet = await MockWallet.deploy(deployer.address);
    seedWallet = await MockWallet.deploy(deployer.address);
    privilegedMultisig = await MockWallet.deploy(deployer.address);

    wallets = [
      await communityWallet.getAddress(),
      await liquidityWallet.getAddress(),
      await marketingWallet.getAddress(),
      await teamWallet.getAddress(),
      await advisorsWallet.getAddress(),
      await seedWallet.getAddress()
    ];

    // Deploy Token
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();

    const Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await Proxy.deploy(await tokenImpl.getAddress(), "0x");
    token = await ethers.getContractAt("HyraToken", await proxy.getAddress());
  });

  describe("Configuration", function () {
    it("Should allow setting distribution config once", async function () {
      await expect(token.setDistributionConfig(
        wallets[0], wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]
      )).to.emit(token, "DistributionConfigSet");

      const config = await token.distributionConfig();
      expect(config.communityEcosystem).to.equal(wallets[0]);
      expect(await token.configSet()).to.be.true;
    });

    it("Should revert if setting config twice", async function () {
      await token.setDistributionConfig(
        wallets[0], wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]
      );

      await expect(token.setDistributionConfig(
        wallets[0], wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]
      )).to.be.revertedWithCustomError(token, "ConfigAlreadySet");
    });

    it("Should revert if any address is zero", async function () {
      await expect(token.setDistributionConfig(
        ethers.ZeroAddress, wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]
      )).to.be.revertedWithCustomError(token, "ZeroAddress");
    });

    it("Should revert if any address is not a contract", async function () {
      await expect(token.setDistributionConfig(
        deployer.address, wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]
      )).to.be.revertedWithCustomError(token, "NotContract");
    });

    it("Should revert if duplicate addresses are used", async function () {
      await expect(token.setDistributionConfig(
        wallets[0], wallets[0], wallets[2], wallets[3], wallets[4], wallets[5]
      )).to.be.revertedWithCustomError(token, "DuplicateAddress");
    });
  });

  describe("Initial Distribution", function () {
    it("Should revert initialize if config not set", async function () {
      // Must pass valid address for vesting contract to pass modifier check
      await expect(token.initialize(
        "Hyra", "HYRA", INITIAL_SUPPLY, wallets[0], owner.address, await privilegedMultisig.getAddress()
      )).to.be.revertedWithCustomError(token, "ConfigNotSet");
    });

    it("Should distribute initial supply correctly", async function () {
      await token.setDistributionConfig(
        wallets[0], wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]
      );

      // Use a dummy address for vesting contract since we are testing distribution
      const dummyVesting = wallets[0];

      await expect(token.initialize(
        "Hyra", "HYRA", INITIAL_SUPPLY, dummyVesting, owner.address, await privilegedMultisig.getAddress()
      )).to.emit(token, "TokensDistributed");

      // Verify balances
      // 60% = 1.5B
      expect(await token.balanceOf(wallets[0])).to.equal(ethers.parseEther("1500000000"));
      // 12% = 300M
      expect(await token.balanceOf(wallets[1])).to.equal(ethers.parseEther("300000000"));
      // 10% = 250M
      expect(await token.balanceOf(wallets[2])).to.equal(ethers.parseEther("250000000"));
      // 8% = 200M
      expect(await token.balanceOf(wallets[3])).to.equal(ethers.parseEther("200000000"));
      // 5% = 125M
      expect(await token.balanceOf(wallets[4])).to.equal(ethers.parseEther("125000000"));
      // 5% = 125M
      expect(await token.balanceOf(wallets[5])).to.equal(ethers.parseEther("125000000"));

      expect(await token.totalSupply()).to.equal(INITIAL_SUPPLY);
    });
  });

  describe("Mint Request Distribution", function () {
    beforeEach(async function () {
      await token.setDistributionConfig(
        wallets[0], wallets[1], wallets[2], wallets[3], wallets[4], wallets[5]
      );

      // Initialize with 0 supply to focus on mint requests
      await token.initialize(
        "Hyra", "HYRA", 0, wallets[0], owner.address, await privilegedMultisig.getAddress()
      );
    });

    it("Should distribute minted tokens correctly", async function () {
      // 1. Set Oracle Feed
      const MockOracle = await ethers.getContractFactory("MockTokenMintFeed");
      const oracle = await MockOracle.deploy();

      const multisigAddress = await privilegedMultisig.getAddress();
      const multisigSigner = await ethers.getImpersonatedSigner(multisigAddress);

      // Fund the multisig so it can pay gas using hardhat_setBalance
      await ethers.provider.send("hardhat_setBalance", [
        multisigAddress,
        "0x1000000000000000000", // 1 ETH
      ]);

      // Verify privileged multisig is set correctly
      expect(await token.privilegedMultisigWallet()).to.equal(multisigAddress);

      await token.connect(multisigSigner).setTokenMintFeed(await oracle.getAddress());

      // 2. Create Mint Request
      // Need to be in minting period (2025+)
      // Increase time to 2025
      const YEAR_2025_START = 1735689600;
      if (await time.latest() < YEAR_2025_START) {
        await time.increaseTo(YEAR_2025_START + 1);
      }

      const MINT_AMOUNT = ethers.parseEther("100000000"); // 100M
      const requestId = 123;

      // Mock oracle response
      // setMintData(requestId, totalRevenue, tokenPrice, tokensToMint, finalized)
      await oracle.setMintData(requestId, 0, 0, MINT_AMOUNT, true);

      await token.connect(owner).createMintRequest(owner.address, requestId, "Test Mint");

      // 3. Execute Mint Request
      // Wait for delay (2 days)
      await time.increase(2 * 24 * 60 * 60 + 1);

      await expect(token.executeMintRequest(0))
        .to.emit(token, "TokensDistributed");

      // Verify balances (100M distribution)
      // 60% = 60M
      expect(await token.balanceOf(wallets[0])).to.equal(ethers.parseEther("60000000"));
      // 12% = 12M
      expect(await token.balanceOf(wallets[1])).to.equal(ethers.parseEther("12000000"));
      // ... verify others
      expect(await token.balanceOf(wallets[5])).to.equal(ethers.parseEther("5000000"));
    });

    it("Should handle rounding correctly", async function () {
      // Setup oracle and time as above
      const MockOracle = await ethers.getContractFactory("MockTokenMintFeed");
      const oracle = await MockOracle.deploy();

      const multisigAddress = await privilegedMultisig.getAddress();
      const multisigSigner = await ethers.getImpersonatedSigner(multisigAddress);

      await ethers.provider.send("hardhat_setBalance", [
        multisigAddress,
        "0x1000000000000000000", // 1 ETH
      ]);
      await token.connect(multisigSigner).setTokenMintFeed(await oracle.getAddress());

      const YEAR_2025_START = 1735689600;
      if (await time.latest() < YEAR_2025_START) {
        await time.increaseTo(YEAR_2025_START + 1);
      }

      // Amount that causes rounding: 1000 wei
      // 60% = 600
      // 12% = 120
      // 10% = 100
      // 8% = 80
      // 5% = 50
      // 5% = 50
      // Total = 1000. No remainder.

      // Try 1001 wei
      // 60% = 600.6 -> 600
      // 12% = 120.12 -> 120
      // 10% = 100.1 -> 100
      // 8% = 80.08 -> 80
      // 5% = 50.05 -> 50
      // 5% = 50.05 -> 50
      // Sum = 1000
      // Remainder = 1
      // Community gets 600 + 1 = 601

      const MINT_AMOUNT = 1001n;
      const requestId = 999;
      // Mock oracle response
      // setMintData(requestId, totalRevenue, tokenPrice, tokensToMint, finalized)
      await oracle.setMintData(requestId, 0, 0, MINT_AMOUNT, true);

      await token.connect(owner).createMintRequest(owner.address, requestId, "Rounding Test");
      await time.increase(2 * 24 * 60 * 60 + 1);

      const initialCommunityBalance = await token.balanceOf(wallets[0]);

      await token.executeMintRequest(0);

      const finalCommunityBalance = await token.balanceOf(wallets[0]);
      expect(finalCommunityBalance - initialCommunityBalance).to.equal(601n);
    });
  });
});
