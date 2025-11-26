/**
 *  npx hardhat test test/HyraToken.MintSchedule.DAO.Complete.test.ts
 * ============================================================================
 * BỘ TEST CASE ĐẦY ĐỦ CHO HYRA DAO MINT SCHEDULE
 * ============================================================================
 * 
 * LUỒNG GOVERNANCE ĐÚNG:
 * 1. Proposal → HyraGovernor.proposeWithType()
 * 2. Voting → Vote với quorum (10-30%)
 * 3. Queue → Timelock queue
 * 4. Execute → Timelock execute → HyraToken.createMintRequest()
 * 5. Mint Delay → 2 ngày
 * 6. Execute Mint → HyraToken.executeMintRequest()
 * 
 * QUORUM LEVELS:
 * - STANDARD: 5% (500 basis points)
 * - EMERGENCY: 10% (1000 basis points)
 * - UPGRADE: 15% (1500 basis points)
 * - CONSTITUTIONAL: 25% (2500 basis points)
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock, MockDistributionWallet } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HYRA DAO - BỘ TEST MINT SCHEDULE VỚI GOVERNANCE", function () {
  // ============ Constants ============
  const MAX_SUPPLY = ethers.parseEther("50000000000"); // 50 tỷ
  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5 tỷ
  
  const TIER1_ANNUAL_CAP = ethers.parseEther("2500000000"); // 2.5B
  const TIER2_ANNUAL_CAP = ethers.parseEther("1500000000"); // 1.5B
  const TIER3_ANNUAL_CAP = ethers.parseEther("750000000");  // 750M
  
  const YEAR_DURATION = 365 * 24 * 60 * 60;
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60;
  
  // Governance parameters
  const VOTING_DELAY = 1; // 1 block
  const VOTING_PERIOD = 50400; // ~1 week in blocks
  const PROPOSAL_THRESHOLD = ethers.parseEther("1000000"); // 1M tokens
  const QUORUM_PERCENTAGE = 10; // 10%
  const TIMELOCK_DELAY = 2 * 24 * 60 * 60; // 2 days
  const YEAR_START_TIMESTAMP = 0; // 0 = use block.timestamp (default in contract)

  // ============ Test Variables ============
  let token: HyraToken;
  let governor: HyraGovernor;
  let timelock: HyraTimelock;
  
  let deployer: SignerWithAddress;
  let dao: SignerWithAddress;
  let voter1: SignerWithAddress;
  let voter2: SignerWithAddress;
  let voter3: SignerWithAddress;
  let recipient: SignerWithAddress;
  let vesting: SignerWithAddress;
  let distributionWallets: MockDistributionWallet[];

  // ============ Helper Functions ============
  
  async function deployDistributionWallet(owner: SignerWithAddress): Promise<MockDistributionWallet> {
    const Factory = await ethers.getContractFactory("MockDistributionWallet");
    const wallet = await Factory.deploy(await owner.getAddress());
    await wallet.waitForDeployment();
    return wallet;
  }

  async function deployDAOSystem() {
    [deployer, dao, voter1, voter2, voter3, recipient, vesting] = await ethers.getSigners();
    distributionWallets = [];

    // 1. Deploy Token
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();
    await tokenImpl.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
    await tokenProxy.waitForDeployment();
    const tokenContract = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

    for (let i = 0; i < 6; i++) {
      distributionWallets.push(await deployDistributionWallet(vesting));
    }

    await tokenContract.setDistributionConfig(
      await distributionWallets[0].getAddress(),
      await distributionWallets[1].getAddress(),
      await distributionWallets[2].getAddress(),
      await distributionWallets[3].getAddress(),
      await distributionWallets[4].getAddress(),
      await distributionWallets[5].getAddress()
    );

    // Deploy mock contract for privilegedMultisigWallet (must be contract, not EOA)
    const privilegedMultisigWallet = await deployDistributionWallet(vesting);

    await tokenContract.initialize(
      "HYRA Token",
      "HYRA",
      INITIAL_SUPPLY,
      await vesting.getAddress(),
      await deployer.getAddress(),
      YEAR_START_TIMESTAMP,
      await privilegedMultisigWallet.getAddress() // privilegedMultisigWallet
    );

    const vestingAddress = await vesting.getAddress();
    for (const wallet of distributionWallets) {
      const walletAddress = await wallet.getAddress();
      const balance = await tokenContract.balanceOf(walletAddress);
      if (balance > 0n) {
        await wallet
          .connect(vesting)
          .forwardTokens(await tokenContract.getAddress(), vestingAddress, balance);
      }
    }

    // 2. Deploy Timelock
    const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
    const timelockImpl = await HyraTimelock.deploy();
    await timelockImpl.waitForDeployment();

    const timelockInitData = HyraTimelock.interface.encodeFunctionData("initialize", [
      TIMELOCK_DELAY,
      [], // proposers (will be governor)
      [], // executors (will be address(0) for anyone)
      await deployer.getAddress() // admin
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
    const CANCELLER_ROLE = await timelockContract.CANCELLER_ROLE();
    const DEFAULT_ADMIN_ROLE = await timelockContract.DEFAULT_ADMIN_ROLE();

    await timelockContract.grantRole(PROPOSER_ROLE, await governorContract.getAddress());
    await timelockContract.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress); // Anyone can execute
    await timelockContract.grantRole(CANCELLER_ROLE, await governorContract.getAddress());

    // 5. Transfer token ownership to timelock
    await tokenContract.transferGovernance(await timelockContract.getAddress());

    // 6. Distribute tokens to voters for voting power (from 2.5B initial supply)
    await tokenContract.connect(vesting).transfer(await voter1.getAddress(), ethers.parseEther("800000000")); // 800M (32% of initial)
    await tokenContract.connect(vesting).transfer(await voter2.getAddress(), ethers.parseEther("800000000")); // 800M (32% of initial)
    await tokenContract.connect(vesting).transfer(await voter3.getAddress(), ethers.parseEther("800000000")); // 800M (32% of initial)
    // Total distributed: 2.4B, remaining in vesting: 100M

    // 7. Delegate voting power
    await tokenContract.connect(voter1).delegate(await voter1.getAddress());
    await tokenContract.connect(voter2).delegate(await voter2.getAddress());
    await tokenContract.connect(voter3).delegate(await voter3.getAddress());

    // Mine block to activate voting power
    await time.increase(1);

    return { tokenContract, governorContract, timelockContract };
  }

  /**
   * Tạo proposal mint qua DAO
   */
  async function createMintProposal(
    amount: bigint,
    recipientAddr: string,
    purpose: string,
    proposalType: number = 0 // 0 = STANDARD
  ) {
    // Encode function call to token.createMintRequest
    const calldata = token.interface.encodeFunctionData("createMintRequest", [
      recipientAddr,
      amount,
      purpose
    ]);

    // Create proposal
    const tx = await governor.connect(voter1).proposeWithType(
      [await token.getAddress()],
      [0],
      [calldata],
      `Mint ${ethers.formatEther(amount)} HYRA: ${purpose}`,
      proposalType
    );

    const receipt = await tx.wait();
    const event = receipt?.logs.find((log: any) => {
      try {
        return governor.interface.parseLog(log)?.name === "ProposalCreated";
      } catch {
        return false;
      }
    });

    const proposalId = event ? governor.interface.parseLog(event)?.args[0] : null;
    return proposalId;
  }

  /**
   * Vote và execute proposal (full flow)
   */
  async function voteAndExecuteProposal(
    targets: string[],
    values: bigint[],
    calldatas: string[],
    description: string
  ) {
    // Calculate proposal ID
    const proposalId = await governor.hashProposal(
      targets,
      values,
      calldatas,
      ethers.id(description)
    );

    // Wait for voting delay (in blocks)
    await mine(VOTING_DELAY + 1);

    // Vote FOR (1 = For, 0 = Against, 2 = Abstain)
    await governor.connect(voter1).castVote(proposalId, 1);
    await governor.connect(voter2).castVote(proposalId, 1);
    await governor.connect(voter3).castVote(proposalId, 1);

    // Wait for voting period to end (in blocks)
    await mine(VOTING_PERIOD + 1);

    // Queue proposal
    const descriptionHash = ethers.id(description);
    await governor.queue(targets, values, calldatas, descriptionHash);

    // Wait for timelock delay (in seconds)
    await time.increase(TIMELOCK_DELAY + 1);

    // Execute proposal
    await governor.execute(targets, values, calldatas, descriptionHash);
    
    return proposalId;
  }

  /**
   * Fast forward đến năm cụ thể
   */
  async function fastForwardToYear(targetYear: number) {
    const currentYear = await token.currentMintYear();
    const yearsToAdvance = targetYear - Number(currentYear);
    
    if (yearsToAdvance > 0) {
      await time.increase(yearsToAdvance * YEAR_DURATION);
    }
  }

  // ============ Setup ============
  beforeEach(async function () {
    const deployed = await deployDAOSystem();
    token = deployed.tokenContract;
    governor = deployed.governorContract;
    timelock = deployed.timelockContract;
  });

  // ============================================================================
  // TEST SUITE 1: KIỂM TRA SETUP DAO
  // ============================================================================
  describe("Suite 1: Kiểm tra setup DAO system", function () {
    
    it("1.1: Token đã deploy và pre-mint 2.5B", async function () {
      const totalSupply = await token.totalSupply();
      expect(totalSupply).to.equal(INITIAL_SUPPLY);
    });

    it("1.2: Governor đã được setup đúng", async function () {
      const tokenAddr = await governor.token();
      expect(tokenAddr).to.equal(await token.getAddress());
    });

    it("1.3: Timelock là owner của token", async function () {
      const owner = await token.owner();
      expect(owner).to.equal(await timelock.getAddress());
    });

    it("1.4: Voters có voting power", async function () {
      const power1 = await token.getVotes(await voter1.getAddress());
      const power2 = await token.getVotes(await voter2.getAddress());
      const power3 = await token.getVotes(await voter3.getAddress());
      
      expect(power1).to.equal(ethers.parseEther("800000000"));
      expect(power2).to.equal(ethers.parseEther("800000000"));
      expect(power3).to.equal(ethers.parseEther("800000000"));
    });

    it("1.5: Quorum levels đúng", async function () {
      const standardQuorum = await governor.STANDARD_QUORUM();
      const emergencyQuorum = await governor.EMERGENCY_QUORUM();
      const upgradeQuorum = await governor.UPGRADE_QUORUM();
      const constitutionalQuorum = await governor.CONSTITUTIONAL_QUORUM();
      
      expect(standardQuorum).to.equal(500n);  // 5%
      expect(emergencyQuorum).to.equal(1000n); // 10%
      expect(upgradeQuorum).to.equal(1500n); // 15%
      expect(constitutionalQuorum).to.equal(2500n); // 25%
    });
  });

  // ============================================================================
  // TEST SUITE 2: LUỒNG GOVERNANCE CƠ BẢN
  // ============================================================================
  describe("Suite 2: Luồng governance cơ bản - Propose → Vote → Queue → Execute", function () {
    
    it("2.1: Tạo proposal mint thành công", async function () {
      this.timeout(60000);
      
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000"); // 1B
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        amount,
        "Test mint via DAO"
      ]);

      const tx = await governor.connect(voter1).proposeWithType(
        [await token.getAddress()],
        [0],
        [calldata],
        "Mint 1B HYRA for development",
        0 // STANDARD
      );

      await expect(tx).to.emit(governor, "ProposalCreated");
    });

    it("2.2: Vote đạt quorum và proposal succeeded", async function () {
      this.timeout(60000);
      
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000");
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        amount,
        "Test"
      ]);

      const proposeTx = await governor.connect(voter1).proposeWithType(
        [await token.getAddress()],
        [0],
        [calldata],
        "Mint proposal",
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
      expect(proposalId).to.not.be.null;

      // Wait for voting to start (in blocks)
      await mine(VOTING_DELAY + 1);

      // Vote
      await governor.connect(voter1).castVote(proposalId, 1); // For
      await governor.connect(voter2).castVote(proposalId, 1); // For
      await governor.connect(voter3).castVote(proposalId, 1); // For

      // Wait for voting to end (in blocks)
      await mine(VOTING_PERIOD + 1);

      // Check state
      const state = await governor.state(proposalId);
      expect(state).to.equal(4n); // Succeeded
    });

    it("2.3: Queue proposal vào timelock", async function () {
      this.timeout(60000);
      
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000");
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        amount,
        "Test"
      ]);

      const description = "Mint proposal for queue test";
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
      const queueTx = await governor.queue(
        [await token.getAddress()],
        [0],
        [calldata],
        descriptionHash
      );

      await expect(queueTx).to.emit(governor, "ProposalQueued");

      // Check state
      const state = await governor.state(proposalId);
      expect(state).to.equal(5n); // Queued
    });

    it("2.4: Execute proposal sau timelock delay", async function () {
      this.timeout(60000);
      
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000");
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        amount,
        "Test execute"
      ]);

      const description = "Mint proposal for execute test";
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

      // Wait for timelock
      await time.increase(TIMELOCK_DELAY + 1);

      // Execute
      const executeTx = await governor.execute(
        [await token.getAddress()],
        [0],
        [calldata],
        descriptionHash
      );

      await expect(executeTx).to.emit(token, "MintRequestCreated");

      // Verify mint request was created
      const requestCount = await token.mintRequestCount();
      expect(requestCount).to.equal(1n);
    });
  });

  // ============================================================================
  // TEST SUITE 3: FULL MINT FLOW QUA DAO
  // ============================================================================
  describe("Suite 3: Full mint flow - Từ proposal đến nhận token", function () {
    
    it("3.1: FULL FLOW - Mint 1B HYRA qua DAO governance", async function () {
      this.timeout(120000);
      
      console.log("\n========================================");
      console.log("BẮT ĐẦU FULL DAO MINT FLOW");
      console.log("========================================\n");
      
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000"); // 1B
      const recipientAddr = await recipient.getAddress();
      
      // STEP 1: Create Proposal
      console.log("STEP 1: Tạo proposal...");
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        recipientAddr,
        amount,
        "Development fund Q1 2026"
      ]);

      const description = "Mint 1B HYRA for development fund Q1 2026";
      const proposeTx = await governor.connect(voter1).proposeWithType(
        [await token.getAddress()],
        [0],
        [calldata],
        description,
        0 // STANDARD
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
      console.log(`   Proposal created: ${proposalId}\n`);

      // STEP 2: Voting
      console.log("STEP 2: Voting...");
      await mine(VOTING_DELAY + 1);
      
      await governor.connect(voter1).castVote(proposalId, 1);
      console.log("   Voter 1 voted FOR (800M voting power)");
      
      await governor.connect(voter2).castVote(proposalId, 1);
      console.log("   Voter 2 voted FOR (800M voting power)");
      
      await governor.connect(voter3).castVote(proposalId, 1);
      console.log("   Voter 3 voted FOR (800M voting power)");
      console.log("   Total votes: 2.4B (96% of initial supply)\n");

      await mine(VOTING_PERIOD + 1);

      const state1 = await governor.state(proposalId);
      console.log(`   Proposal state: ${state1} (0=Pending, 1=Active, 2=Canceled, 3=Defeated, 4=Succeeded, 5=Queued, 6=Expired, 7=Executed)`);
      
      // Check quorum
      const quorum = await governor.getProposalQuorum(proposalId);
      const votes = await governor.proposalVotes(proposalId);
      console.log(`   Required quorum: ${ethers.formatEther(quorum)} HYRA`);
      console.log(`   For votes: ${ethers.formatEther(votes[1])} HYRA`);
      console.log(`   Against votes: ${ethers.formatEther(votes[0])} HYRA`);
      console.log(`   Abstain votes: ${ethers.formatEther(votes[2])} HYRA`);
      
      expect(state1).to.equal(4n); // Succeeded
      console.log("   Proposal SUCCEEDED\n");

      // STEP 3: Queue
      console.log("STEP 3: Queue vào Timelock...");
      const descriptionHash = ethers.id(description);
      await governor.queue(
        [await token.getAddress()],
        [0],
        [calldata],
        descriptionHash
      );
      console.log("   Proposal queued (2 days delay)\n");

      // STEP 4: Execute (after timelock)
      console.log("STEP 4: Execute proposal...");
      await time.increase(TIMELOCK_DELAY + 1);
      
      await governor.execute(
        [await token.getAddress()],
        [0],
        [calldata],
        descriptionHash
      );
      console.log("   Proposal executed");
      console.log("   Mint request created\n");

      // Verify mint request
      const requestCount = await token.mintRequestCount();
      expect(requestCount).to.equal(1n);

      const request = await token.mintRequests(0);
      expect(request.recipient).to.equal(recipientAddr);
      expect(request.amount).to.equal(amount);
      expect(request.executed).to.equal(false);

      // STEP 5: Execute mint (after 2 days delay)
      console.log("STEP 5: Execute mint request...");
      await time.increase(MINT_EXECUTION_DELAY + 1);
      
      const balanceBefore = await token.balanceOf(recipientAddr);
      
      await token.executeMintRequest(0);
      for (const wallet of distributionWallets) {
        const walletAddress = await wallet.getAddress();
        const walletBalance = await token.balanceOf(walletAddress);
        if (walletBalance > 0n) {
          await wallet
            .connect(vesting)
            .forwardTokens(await token.getAddress(), recipientAddr, walletBalance);
        }
      }
      
      const balanceAfter = await token.balanceOf(recipientAddr);
      const minted = balanceAfter - balanceBefore;
      
      expect(minted).to.equal(amount);
      console.log(`   Minted: ${ethers.formatEther(minted)} HYRA`);
      console.log(`   Recipient balance: ${ethers.formatEther(balanceAfter)} HYRA\n`);

      console.log("========================================");
      console.log("FULL DAO MINT FLOW HOÀN THÀNH");
      console.log("========================================\n");
    });
  });

  // ============================================================================
  // TEST SUITE 4: KIỂM TRA QUORUM LEVELS
  // ============================================================================
  describe("Suite 4: Kiểm tra quorum levels theo loại proposal", function () {
    
    it("4.1: STANDARD proposal - Quorum 5%", async function () {
      this.timeout(60000);
      
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("1000000000");
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        amount,
        "Standard mint"
      ]);

      const description = "Standard mint proposal";
      const proposeTx = await governor.connect(voter1).proposeWithType(
        [await token.getAddress()],
        [0],
        [calldata],
        description,
        0 // STANDARD
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

      // Mine blocks to finalize proposal creation and allow quorum query
      await mine(2);

      // Check proposal type
      const proposalType = await governor.proposalTypes(proposalId);
      expect(proposalType).to.equal(0n); // STANDARD

      // Check quorum (after mining blocks)
      const quorum = await governor.getProposalQuorum(proposalId);
      const totalSupply = await token.totalSupply();
      const expectedQuorum = (totalSupply * 500n) / 10000n; // 5%
      
      expect(quorum).to.equal(expectedQuorum);
      
      console.log(`   Standard quorum: ${ethers.formatEther(quorum)} HYRA (5%)`);
    });

    it("4.2: Verify quorum constants", async function () {
      // Just verify the quorum constants are set correctly
      const standardQuorum = await governor.STANDARD_QUORUM();
      const emergencyQuorum = await governor.EMERGENCY_QUORUM();
      const upgradeQuorum = await governor.UPGRADE_QUORUM();
      const constitutionalQuorum = await governor.CONSTITUTIONAL_QUORUM();
      
      expect(standardQuorum).to.equal(500n);  // 5%
      expect(emergencyQuorum).to.equal(1000n); // 10%
      expect(upgradeQuorum).to.equal(1500n); // 15%
      expect(constitutionalQuorum).to.equal(2500n); // 25%
      
      console.log(`   Standard quorum: 5%`);
      console.log(`   Emergency quorum: 10%`);
      console.log(`   Upgrade quorum: 15%`);
      console.log(`   Constitutional quorum: 25%`);
    });

    it("4.3: Non-security council không thể tạo EMERGENCY proposal", async function () {
      await fastForwardToYear(2);
      
      const amount = ethers.parseEther("500000000");
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        amount,
        "Emergency mint"
      ]);

      await expect(
        governor.connect(voter2).proposeWithType(
          [await token.getAddress()],
          [0],
          [calldata],
          "Emergency proposal",
          1 // EMERGENCY
        )
      ).to.be.revertedWithCustomError(governor, "OnlySecurityCouncil");
    });
  });

  // ============================================================================
  // TEST SUITE 5: KIỂM TRA ANNUAL MINT CAPS QUA DAO
  // ============================================================================
  describe("Suite 5: Kiểm tra annual mint caps qua DAO", function () {
    
    it("5.1: Mint đúng limit năm 2 (2.5B) qua DAO", async function () {
      this.timeout(120000);
      
      await fastForwardToYear(2);
      
      const amount = TIER1_ANNUAL_CAP; // 2.5B
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        amount,
        "Year 2 full capacity"
      ]);

      const description = "Mint full year 2 capacity";
      
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

      // Execute mint
      await time.increase(MINT_EXECUTION_DELAY + 1);
      await token.executeMintRequest(0);

      // Verify - check current year
      const currentYear = await token.currentMintYear();
      const mintedCurrentYear = await token.getMintedAmountForYear(currentYear);
      
      // Should have minted the full amount
      expect(mintedCurrentYear).to.be.gte(TIER1_ANNUAL_CAP);
      
      console.log(`   Minted year ${currentYear}: ${ethers.formatEther(mintedCurrentYear)} HYRA`);
    });

    it("5.2: Không thể mint vượt limit năm 2", async function () {
      this.timeout(120000);
      
      await fastForwardToYear(2);
      
      const excessAmount = TIER1_ANNUAL_CAP + ethers.parseEther("1");
      const calldata = token.interface.encodeFunctionData("createMintRequest", [
        await recipient.getAddress(),
        excessAmount,
        "Exceed limit"
      ]);

      const description = "Try to exceed year 2 limit";
      
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

      // Execute should revert
      await expect(
        governor.execute(
          [await token.getAddress()],
          [0],
          [calldata],
          descriptionHash
        )
      ).to.be.reverted; // Will revert because createMintRequest will fail
    });
  });

  // ============================================================================
  // 🏁 KẾT THÚC BỘ TEST
  // ============================================================================
});
