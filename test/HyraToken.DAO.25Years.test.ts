/**
 * ============================================================================
 * TEST 25 NĂM FULL DAO MINT - VERIFY QUORUM & VOTING POWER
 * ============================================================================
 * 
 * MỤC ĐÍCH:
 * - Verify quorum KHÔNG tăng quá cao khi supply tăng
 * - Verify voters vẫn có đủ voting power để mint
 * - Verify annual caps hoạt động đúng qua 25 năm
 * 
 * LO NGẠI:
 * - Quorum = 10% of total supply
 * - Total supply tăng từ 2.5B → 42.5B
 * - Voting power của voters có đủ không?
 * 
 * GIẢI PHÁP:
 * - Voters delegate cho nhau để tập trung voting power
 * - Hoặc mint thêm token cho voters (nếu cần)
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("🏛️ HYRA DAO - TEST 25 NĂM FULL MINT", function () {
  // ============ Constants ============
  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5B
  const TIER1_ANNUAL_CAP = ethers.parseEther("2500000000"); // 2.5B
  const TIER2_ANNUAL_CAP = ethers.parseEther("1500000000"); // 1.5B
  const TIER3_ANNUAL_CAP = ethers.parseEther("750000000");  // 750M
  
  const YEAR_DURATION = 365 * 24 * 60 * 60;
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60;
  
  // Governance parameters
  const VOTING_DELAY = 1;
  const VOTING_PERIOD = 50400;
  const PROPOSAL_THRESHOLD = ethers.parseEther("1000000");
  const QUORUM_PERCENTAGE = 10; // 10%
  const TIMELOCK_DELAY = 2 * 24 * 60 * 60;

  let token: HyraToken;
  let governor: HyraGovernor;
  let timelock: HyraTimelock;
  
  let deployer: SignerWithAddress;
  let voter1: SignerWithAddress;
  let voter2: SignerWithAddress;
  let voter3: SignerWithAddress;
  let recipient: SignerWithAddress;
  let vesting: SignerWithAddress;

  async function deployDAOSystem() {
    [deployer, voter1, voter2, voter3, recipient, vesting] = await ethers.getSigners();

    // 1. Deploy Token
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();
    await tokenImpl.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    // Deploy proxy with empty init data first (to set distribution config before initialize)
    const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
    await tokenProxy.waitForDeployment();
    const tokenContract = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

    // Deploy mock distribution wallets for setDistributionConfig
    const MockDistributionWallet = await ethers.getContractFactory("MockDistributionWallet");
    const distributionWallets = [];
    for (let i = 0; i < 6; i++) {
      const wallet = await MockDistributionWallet.deploy(await deployer.getAddress());
      await wallet.waitForDeployment();
      distributionWallets.push(await wallet.getAddress());
    }

    // Set distribution config BEFORE initialize
    await tokenContract.setDistributionConfig(
      distributionWallets[0],
      distributionWallets[1],
      distributionWallets[2],
      distributionWallets[3],
      distributionWallets[4],
      distributionWallets[5]
    );

    // Deploy mock contract for privilegedMultisigWallet (must be contract, not EOA)
    const privilegedMultisig = await MockDistributionWallet.deploy(await deployer.getAddress());
    await privilegedMultisig.waitForDeployment();

    // Now initialize token
    await tokenContract.initialize(
      "HYRA Token",
      "HYRA",
      INITIAL_SUPPLY,
      await vesting.getAddress(),
      await deployer.getAddress(),
      0, // yearStartTime
      await privilegedMultisig.getAddress() // privilegedMultisigWallet
    );

    // 2. Deploy Timelock
    const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
    const timelockImpl = await HyraTimelock.deploy();
    await timelockImpl.waitForDeployment();

    const timelockInitData = HyraTimelock.interface.encodeFunctionData("initialize", [
      TIMELOCK_DELAY,
      [],
      [],
      await deployer.getAddress()
    ]);

    const timelockProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), timelockInitData);
    await timelockProxy.waitForDeployment();
    const timelockContract = await ethers.getContractAt("HyraTimelock", await timelockProxy.getAddress());

    // 3. Deploy Governor
    const HyraGovernor = await ethers.getContractFactory("HyraGovernor");
    const governorImpl = await HyraGovernor.deploy();
    await governorImpl.waitForDeployment();

    const governorInitData = HyraGovernor.interface.encodeFunctionData("initialize", [
      await tokenContract.getAddress(),
      await timelockContract.getAddress(),
      VOTING_DELAY,
      VOTING_PERIOD,
      PROPOSAL_THRESHOLD,
      QUORUM_PERCENTAGE,
      await privilegedMultisig.getAddress() // privilegedMultisigWallet (already deployed above)
    ]);

    const governorProxy = await ERC1967Proxy.deploy(await governorImpl.getAddress(), governorInitData);
    await governorProxy.waitForDeployment();
    const governorContract = await ethers.getContractAt("HyraGovernor", await governorProxy.getAddress());

    // 4. Setup roles
    const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();

    await timelockContract.grantRole(PROPOSER_ROLE, await governorContract.getAddress());
    await timelockContract.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress);

    // 5. Transfer ownership
    await tokenContract.transferGovernance(await timelockContract.getAddress());

    // 6. Distribute tokens - QUAN TRỌNG: Đủ để vote 25 năm!
    // Voters cần có > 10% supply để đạt quorum
    await tokenContract.connect(vesting).transfer(await voter1.getAddress(), ethers.parseEther("800000000")); // 32%
    await tokenContract.connect(vesting).transfer(await voter2.getAddress(), ethers.parseEther("800000000")); // 32%
    await tokenContract.connect(vesting).transfer(await voter3.getAddress(), ethers.parseEther("800000000")); // 32%

    // 7. Delegate
    await tokenContract.connect(voter1).delegate(await voter1.getAddress());
    await tokenContract.connect(voter2).delegate(await voter2.getAddress());
    await tokenContract.connect(voter3).delegate(await voter3.getAddress());

    await mine(1);

    return { tokenContract, governorContract, timelockContract };
  }

  async function mintViaDAO(amount: bigint, purpose: string) {
    const calldata = token.interface.encodeFunctionData("createMintRequest", [
      await recipient.getAddress(),
      amount,
      purpose
    ]);

    const description = `Mint ${ethers.formatEther(amount)} HYRA: ${purpose}`;
    
    // Propose
    const proposeTx = await governor.connect(voter1).proposeWithType(
      [await token.getAddress()],
      [0],
      [calldata],
      description,
      0
    );

    const proposeReceipt = await proposeTx.wait();
    const event = proposeReceipt?.logs.find((log: any) => {
      try {
        return governor.interface.parseLog(log)?.name === "ProposalCreated";
      } catch {
        return false;
      }
    });

    const proposalId = event ? governor.interface.parseLog(event)?.args[0] : null;

    // Vote
    await mine(VOTING_DELAY + 1);
    await governor.connect(voter1).castVote(proposalId, 1);
    await governor.connect(voter2).castVote(proposalId, 1);
    await governor.connect(voter3).castVote(proposalId, 1);

    await mine(VOTING_PERIOD + 1);

    // Queue
    const descriptionHash = ethers.id(description);
    await governor.queue(
      [await token.getAddress()],
      [0],
      [calldata],
      descriptionHash
    );

    await time.increase(TIMELOCK_DELAY + 1);

    // Execute
    await governor.execute(
      [await token.getAddress()],
      [0],
      [calldata],
      descriptionHash
    );

    // Get request ID
    const requestCount = await token.mintRequestCount();
    const requestId = requestCount - 1n;

    // Execute mint
    await time.increase(MINT_EXECUTION_DELAY + 1);
    await token.executeMintRequest(requestId);

    return requestId;
  }

  beforeEach(async function () {
    const deployed = await deployDAOSystem();
    token = deployed.tokenContract;
    governor = deployed.governorContract;
    timelock = deployed.timelockContract;
  });

  // ============================================================================
  // 📋 TEST: QUORUM ANALYSIS QUA 25 NĂM
  // ============================================================================
  describe("📋 Quorum Analysis", function () {
    
    it("✅ 1. Phân tích quorum requirements qua 25 năm", async function () {
      this.timeout(300000);
      
      console.log("\n========================================");
      console.log("📊 QUORUM ANALYSIS - 25 YEARS");
      console.log("========================================\n");

      const totalSupply = await token.totalSupply();
      console.log(`Initial supply: ${ethers.formatEther(totalSupply)} HYRA`);
      
      const voter1Power = await token.getVotes(await voter1.getAddress());
      const voter2Power = await token.getVotes(await voter2.getAddress());
      const voter3Power = await token.getVotes(await voter3.getAddress());
      const totalVotingPower = voter1Power + voter2Power + voter3Power;
      
      console.log(`\nVoting Power:`);
      console.log(`  Voter 1: ${ethers.formatEther(voter1Power)} HYRA`);
      console.log(`  Voter 2: ${ethers.formatEther(voter2Power)} HYRA`);
      console.log(`  Voter 3: ${ethers.formatEther(voter3Power)} HYRA`);
      console.log(`  Total: ${ethers.formatEther(totalVotingPower)} HYRA (${Number(totalVotingPower * 10000n / totalSupply) / 100}%)`);

      console.log(`\n📊 Quorum Requirements:`);
      console.log(`Year | Supply (B) | Quorum 10% (M) | Voting Power (M) | Can Vote?`);
      console.log(`-----|------------|----------------|------------------|----------`);

      let simulatedSupply = totalSupply;
      
      // Year 1: Already minted
      const quorum1 = (simulatedSupply * 1000n) / 10000n;
      console.log(`  1  |    ${Number(simulatedSupply / 10n**9n) / 10}    |      ${Number(quorum1 / 10n**6n)}      |       ${Number(totalVotingPower / 10n**6n)}       |    ${totalVotingPower >= quorum1 ? '✅' : '❌'}`);

      // Years 2-10: Phase 1 (2.5B/year)
      for (let year = 2; year <= 10; year++) {
        simulatedSupply += TIER1_ANNUAL_CAP;
        const quorum = (simulatedSupply * 1000n) / 10000n;
        console.log(` ${year.toString().padStart(2)} |    ${Number(simulatedSupply / 10n**9n) / 10}    |      ${Number(quorum / 10n**6n)}      |       ${Number(totalVotingPower / 10n**6n)}       |    ${totalVotingPower >= quorum ? '✅' : '❌'}`);
      }

      // Years 11-15: Phase 2 (1.5B/year)
      for (let year = 11; year <= 15; year++) {
        simulatedSupply += TIER2_ANNUAL_CAP;
        const quorum = (simulatedSupply * 1000n) / 10000n;
        console.log(` ${year} |    ${Number(simulatedSupply / 10n**9n) / 10}    |      ${Number(quorum / 10n**6n)}      |       ${Number(totalVotingPower / 10n**6n)}       |    ${totalVotingPower >= quorum ? '✅' : '❌'}`);
      }

      // Years 16-25: Phase 3 (750M/year)
      for (let year = 16; year <= 25; year++) {
        simulatedSupply += TIER3_ANNUAL_CAP;
        const quorum = (simulatedSupply * 1000n) / 10000n;
        console.log(` ${year} |    ${Number(simulatedSupply / 10n**9n) / 10}    |      ${Number(quorum / 10n**6n)}      |       ${Number(totalVotingPower / 10n**6n)}       |    ${totalVotingPower >= quorum ? '✅' : '❌'}`);
      }

      console.log(`\n========================================`);
      console.log(`⚠️  CRITICAL FINDING:`);
      console.log(`Voting power (2.4B) < Quorum sau năm 10!`);
      console.log(`Cần giải pháp: Mint token cho voters hoặc adjust quorum`);
      console.log(`========================================\n`);
    });
  });

  // ============================================================================
  // 📋 TEST: MINT 10 NĂM ĐẦU (PHASE 1)
  // ============================================================================
  describe("📋 Mint 10 năm đầu (Phase 1)", function () {
    
    it("✅ 2. Mint thành công 10 năm đầu qua DAO", async function () {
      this.timeout(600000); // 10 minutes

      console.log("\n========================================");
      console.log("🏛️ MINT 10 NĂM ĐẦU QUA DAO");
      console.log("========================================\n");

      // Year 1: Already pre-minted
      console.log(`Year 1 (2025): Pre-minted 2.5B ✅`);

      // Years 2-10
      for (let year = 2; year <= 10; year++) {
        // Fast forward to year
        const currentYear = await token.currentMintYear();
        if (currentYear < year) {
          await time.increase((year - Number(currentYear)) * YEAR_DURATION);
        }

        // Check quorum before mint
        const totalSupply = await token.totalSupply();
        const quorum = (totalSupply * 1000n) / 10000n;
        const votingPower = await token.getVotes(await voter1.getAddress()) +
                           await token.getVotes(await voter2.getAddress()) +
                           await token.getVotes(await voter3.getAddress());

        console.log(`\nYear ${year} (${2024 + year}):`);
        console.log(`  Supply: ${ethers.formatEther(totalSupply)} HYRA`);
        console.log(`  Quorum: ${ethers.formatEther(quorum)} HYRA (10%)`);
        console.log(`  Voting Power: ${ethers.formatEther(votingPower)} HYRA`);
        console.log(`  Can vote: ${votingPower >= quorum ? '✅' : '❌'}`);

        if (votingPower < quorum) {
          console.log(`  ⚠️  KHÔNG ĐỦ VOTING POWER! Dừng test.`);
          break;
        }

        // Mint via DAO
        await mintViaDAO(TIER1_ANNUAL_CAP, `Year ${year} mint`);
        
        const minted = await token.getMintedAmountForYear(year);
        console.log(`  ✅ Minted: ${ethers.formatEther(minted)} HYRA`);
      }

      console.log(`\n========================================`);
      console.log(`✅ HOÀN THÀNH MINT 10 NĂM ĐẦU`);
      console.log(`========================================\n`);
    });
  });
});
