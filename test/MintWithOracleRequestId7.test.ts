import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken } from "../typechain-types";
import { MockTokenMintFeed } from "../typechain-types";
import { MockDistributionWallet } from "../typechain-types";

describe("Mint với getLatestMintData - RequestId 7", function () {
  const ORACLE_REQUEST_ID = 7n;
  const TOKENS_TO_MINT = ethers.parseEther("1000000"); // 1M tokens
  const TOTAL_REVENUE = 100000000n; // 1M USD cents
  const TOKEN_PRICE = ethers.parseEther("1.0"); // 1 USDT (18 decimals)
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60; // 2 days

  async function deployFixture() {
    const [deployer, owner, recipient, ...others] = await ethers.getSigners();

    // Deploy MockTokenMintFeed
    const MockTokenMintFeedFactory = await ethers.getContractFactory("MockTokenMintFeed");
    const mockTokenMintFeed = await MockTokenMintFeedFactory.deploy();
    await mockTokenMintFeed.waitForDeployment();

    // Set mint data for requestId = 7
    await mockTokenMintFeed.setMintData(
      ORACLE_REQUEST_ID,
      TOTAL_REVENUE,
      TOKEN_PRICE,
      TOKENS_TO_MINT,
      true // finalized
    );

    // Deploy 6 mock distribution wallets
    const MockDistributionWalletFactory = await ethers.getContractFactory("MockDistributionWallet");
    const distributionWallets = [];
    for (let i = 0; i < 6; i++) {
      const wallet = await MockDistributionWalletFactory.deploy(deployer.address);
      await wallet.waitForDeployment();
      distributionWallets.push(await wallet.getAddress());
    }

    // Deploy privileged multisig wallet - use SimpleExecutor that can execute calls
    const SimpleExecutorFactory = await ethers.getContractFactory("SimpleExecutor");
    const privilegedMultisig = await SimpleExecutorFactory.deploy(owner.address);
    await privilegedMultisig.waitForDeployment();

    // Deploy HyraToken implementation
    const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraTokenFactory.deploy();
    await tokenImpl.waitForDeployment();

    // Deploy proxy with empty init data
    const ProxyDeployerFactory = await ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await ProxyDeployerFactory.deploy();
    await proxyDeployer.waitForDeployment();

    const ProxyAdminFactory = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await ProxyAdminFactory.deploy(deployer.address);
    await proxyAdmin.waitForDeployment();

    const tokenProxyAddr = await proxyDeployer.deployProxy.staticCall(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      "0x",
      "HyraToken"
    );
    await (
      await proxyDeployer.deployProxy(
        await tokenImpl.getAddress(),
        await proxyAdmin.getAddress(),
        "0x",
        "HyraToken"
      )
    ).wait();
    const token = await ethers.getContractAt("HyraToken", tokenProxyAddr);

    // Set distribution config BEFORE initialize
    await token.setDistributionConfig(
      distributionWallets[0],
      distributionWallets[1],
      distributionWallets[2],
      distributionWallets[3],
      distributionWallets[4],
      distributionWallets[5]
    );

    // Initialize token
    await token.initialize(
      "HYRA",
      "HYRA",
      ethers.parseEther("1000000"), // initial supply
      owner.address, // vestingContract
      owner.address, // governance/owner
      await privilegedMultisig.getAddress() // privilegedMultisigWallet
    );

    // Set token mint feed (must be called by privilegedMultisig)
    const privilegedMultisigContract = await ethers.getContractAt(
      "SimpleExecutor",
      await privilegedMultisig.getAddress()
    );
    const setTokenMintFeedData = token.interface.encodeFunctionData("setTokenMintFeed", [
      await mockTokenMintFeed.getAddress(),
    ]);
    await privilegedMultisigContract.connect(owner).execute(tokenProxyAddr, 0, setTokenMintFeedData);

    // Fast forward to 2025 (minting period starts) if needed
    const YEAR_2025_START = 1735689600; // 2025-01-01 00:00:00 UTC
    const currentTime = await time.latest();
    if (currentTime < YEAR_2025_START) {
      await time.increaseTo(YEAR_2025_START + 1);
    }

    return {
      token,
      mockTokenMintFeed,
      owner,
      recipient,
      distributionWallets,
      privilegedMultisig,
    };
  }

  describe("Kiểm tra getLatestMintData với requestId = 7", function () {
    it("Nên lấy được mint data từ oracle với requestId = 7", async function () {
      const { mockTokenMintFeed } = await loadFixture(deployFixture);

      const [totalRevenue, tokenPrice, tokensToMint, timestamp, finalized] =
        await mockTokenMintFeed.getLatestMintData(ORACLE_REQUEST_ID);

      expect(totalRevenue).to.equal(TOTAL_REVENUE);
      expect(tokenPrice).to.equal(TOKEN_PRICE);
      expect(tokensToMint).to.equal(TOKENS_TO_MINT);
      expect(finalized).to.be.true;
      expect(timestamp).to.be.gt(0);
    });

    it("Nên tạo mint request với requestId = 7", async function () {
      const { token, owner, recipient } = await loadFixture(deployFixture);

      // Create mint request với requestId = 7
      const tx = await token
        .connect(owner)
        .createMintRequest(recipient.address, ORACLE_REQUEST_ID, "Test mint với requestId 7");

      await expect(tx)
        .to.emit(token, "MintRequestCreated")
        .withArgs(0n, recipient.address, TOKENS_TO_MINT, "Test mint với requestId 7");

      const latestTime = await time.latest();
      await expect(tx)
        .to.emit(token, "MintRequestApproved")
        .withArgs(0n, BigInt(latestTime) + BigInt(MINT_EXECUTION_DELAY));

      // Verify mint request
      const mintRequest = await token.mintRequests(0);
      expect(mintRequest.recipient).to.equal(recipient.address);
      expect(mintRequest.amount).to.equal(TOKENS_TO_MINT);
      expect(mintRequest.executed).to.be.false;
      expect(mintRequest.purpose).to.equal("Test mint với requestId 7");
    });

    it("Nên lấy đúng amount từ oracle khi tạo mint request", async function () {
      const { token, owner, recipient, mockTokenMintFeed } = await loadFixture(deployFixture);

      // Verify oracle data trước
      const [,, tokensToMint] = await mockTokenMintFeed.getLatestMintData(ORACLE_REQUEST_ID);
      expect(tokensToMint).to.equal(TOKENS_TO_MINT);

      // Create mint request
      await token
        .connect(owner)
        .createMintRequest(recipient.address, ORACLE_REQUEST_ID, "Test mint");

      // Verify mint request có đúng amount từ oracle
      const mintRequest = await token.mintRequests(0);
      expect(mintRequest.amount).to.equal(tokensToMint);
      expect(mintRequest.amount).to.equal(TOKENS_TO_MINT);
    });

    it("Nên execute mint request sau delay và distribute tokens", async function () {
      const { token, owner, recipient, distributionWallets } = await loadFixture(deployFixture);

      // Create mint request
      await token
        .connect(owner)
        .createMintRequest(recipient.address, ORACLE_REQUEST_ID, "Test mint với requestId 7");

      // Fast forward 2 days + 1 second
      await time.increase(MINT_EXECUTION_DELAY + 1);

      // Get balances trước khi execute
      const balancesBefore = await Promise.all(
        distributionWallets.map((wallet) => token.balanceOf(wallet))
      );

      // Execute mint request
      const tx = await token.connect(owner).executeMintRequest(0);

      // Note: MintRequestExecuted emits address(0) for recipient, not the actual recipient
      // This is by design - tokens are distributed to 6 wallets, not the recipient
      await expect(tx)
        .to.emit(token, "MintRequestExecuted")
        .withArgs(0n, ethers.ZeroAddress, TOKENS_TO_MINT);

      // Verify mint request đã executed
      const mintRequest = await token.mintRequests(0);
      expect(mintRequest.executed).to.be.true;

      // Verify tokens được distribute đến 6 wallets
      // Distribution percentages: 60%, 12%, 10%, 8%, 5%, 5%
      const expectedAmounts = [
        (TOKENS_TO_MINT * 6000n) / 10000n, // 60%
        (TOKENS_TO_MINT * 1200n) / 10000n, // 12%
        (TOKENS_TO_MINT * 1000n) / 10000n, // 10%
        (TOKENS_TO_MINT * 800n) / 10000n, // 8%
        (TOKENS_TO_MINT * 500n) / 10000n, // 5%
        (TOKENS_TO_MINT * 500n) / 10000n, // 5%
      ];

      const balancesAfter = await Promise.all(
        distributionWallets.map((wallet) => token.balanceOf(wallet))
      );

      for (let i = 0; i < 6; i++) {
        const expectedIncrease = expectedAmounts[i];
        const actualIncrease = balancesAfter[i] - balancesBefore[i];
        expect(actualIncrease).to.equal(expectedIncrease);
      }

      // Verify total distributed = TOKENS_TO_MINT
      const totalDistributed = balancesAfter.reduce(
        (sum, balance, i) => sum + (balance - balancesBefore[i]),
        0n
      );
      expect(totalDistributed).to.equal(TOKENS_TO_MINT);
    });

    it("Nên revert nếu oracle data chưa finalized", async function () {
      const { token, owner, recipient, mockTokenMintFeed } = await loadFixture(deployFixture);

      // Set mint data với finalized = false
      await mockTokenMintFeed.setMintData(
        ORACLE_REQUEST_ID,
        TOTAL_REVENUE,
        TOKEN_PRICE,
        TOKENS_TO_MINT,
        false // NOT finalized
      );

      // Should revert khi tạo mint request
      await expect(
        token
          .connect(owner)
          .createMintRequest(recipient.address, ORACLE_REQUEST_ID, "Test mint")
      ).to.be.revertedWithCustomError(token, "OracleDataNotFinalized");
    });

    it("Nên revert nếu oracle requestId không tồn tại", async function () {
      const { token, owner, recipient } = await loadFixture(deployFixture);

      const INVALID_REQUEST_ID = 999n;

      // Should revert khi requestId không tồn tại trong oracle
      await expect(
        token
          .connect(owner)
          .createMintRequest(recipient.address, INVALID_REQUEST_ID, "Test mint")
      ).to.be.revertedWithCustomError(token, "OracleRequestNotFound");
    });

    it("Nên revert nếu oracle trả về tokensToMint = 0", async function () {
      const { token, owner, recipient, mockTokenMintFeed } = await loadFixture(deployFixture);

      // Set mint data với tokensToMint = 0
      await mockTokenMintFeed.setMintData(
        ORACLE_REQUEST_ID,
        TOTAL_REVENUE,
        TOKEN_PRICE,
        0n, // tokensToMint = 0
        true // finalized
      );

      // Should revert
      await expect(
        token
          .connect(owner)
          .createMintRequest(recipient.address, ORACLE_REQUEST_ID, "Test mint")
      ).to.be.revertedWithCustomError(token, "InvalidOracleAmount");
    });

    it("Nên update pendingByYear khi tạo mint request", async function () {
      const { token, owner, recipient } = await loadFixture(deployFixture);

      // Get current year và pending trước
      const currentYear = await token.currentMintYear();
      const pendingBefore = await token.pendingByYear(currentYear);

      // Create mint request
      await token
        .connect(owner)
        .createMintRequest(recipient.address, ORACLE_REQUEST_ID, "Test mint");

      // Verify pendingByYear đã tăng
      const pendingAfter = await token.pendingByYear(currentYear);
      expect(pendingAfter).to.equal(pendingBefore + TOKENS_TO_MINT);
    });

    it("Nên update mintedByYear và pendingByYear khi execute mint request", async function () {
      const { token, owner, recipient } = await loadFixture(deployFixture);

      // Create mint request
      await token
        .connect(owner)
        .createMintRequest(recipient.address, ORACLE_REQUEST_ID, "Test mint");

      const currentYear = await token.currentMintYear();
      const mintedBefore = await token.mintedByYear(currentYear);
      const pendingBefore = await token.pendingByYear(currentYear);

      // Fast forward 2 days
      await time.increase(MINT_EXECUTION_DELAY + 1);

      // Execute mint request
      await token.connect(owner).executeMintRequest(0);

      // Verify mintedByYear tăng và pendingByYear giảm
      const mintedAfter = await token.mintedByYear(currentYear);
      const pendingAfter = await token.pendingByYear(currentYear);

      expect(mintedAfter).to.equal(mintedBefore + TOKENS_TO_MINT);
      expect(pendingAfter).to.equal(pendingBefore - TOKENS_TO_MINT);
    });
  });
});

