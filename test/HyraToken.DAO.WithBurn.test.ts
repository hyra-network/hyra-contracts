/**
 * ============================================================================
 * TEST DAO VỚI BURN MECHANISM
 * ============================================================================
 * 
 * SCENARIO:
 * - Mỗi năm mint token
 * - Một phần token bị burn
 * - Verify quorum vẫn đạt được
 * 
 * VÍ DỤ:
 * - Năm 1: Mint 2.5B, burn 1B → Supply = 1.5B
 * - Năm 2: Mint 2.5B, burn 2B → Supply = 2B
 * - ...
 * 
 * QUORUM:
 * - Quorum = 10% of totalSupply()
 * - totalSupply() GIẢM khi burn
 * - → Quorum GIẢM → Dễ vote hơn! ✅
 * 
 * ============================================================================
 */

import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("🔥 HYRA DAO - TEST VỚI BURN MECHANISM", function () {
  const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // 2.5B
  const TIER1_ANNUAL_CAP = ethers.parseEther("2500000000"); // 2.5B
  
  const YEAR_DURATION = 365 * 24 * 60 * 60;
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60;
  
  const VOTING_DELAY = 1;
  const VOTING_PERIOD = 50400;
  const PROPOSAL_THRESHOLD = ethers.parseEther("1000000");
  const QUORUM_PERCENTAGE = 10;
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
  let burner: SignerWithAddress;

  async function deployDAOSystem() {
    [deployer, voter1, voter2, voter3, recipient, vesting, burner] = await ethers.getSigners();

    // Deploy Token
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

    // Deploy Timelock
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

    // Deploy Governor
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

    // Setup roles
    const PROPOSER_ROLE = await timelockContract.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelockContract.EXECUTOR_ROLE();

    await timelockContract.grantRole(PROPOSER_ROLE, await governorContract.getAddress());
    await timelockContract.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress);

    // Transfer ownership
    await tokenContract.transferGovernance(await timelockContract.getAddress());

    // Distribute tokens
    await tokenContract.connect(vesting).transfer(await voter1.getAddress(), ethers.parseEther("800000000"));
    await tokenContract.connect(vesting).transfer(await voter2.getAddress(), ethers.parseEther("800000000"));
    await tokenContract.connect(vesting).transfer(await voter3.getAddress(), ethers.parseEther("800000000"));
    await tokenContract.connect(vesting).transfer(await burner.getAddress(), ethers.parseEther("100000000")); // For burning

    // Delegate
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

    await mine(VOTING_DELAY + 1);
    await governor.connect(voter1).castVote(proposalId, 1);
    await governor.connect(voter2).castVote(proposalId, 1);
    await governor.connect(voter3).castVote(proposalId, 1);

    await mine(VOTING_PERIOD + 1);

    const descriptionHash = ethers.id(description);
    await governor.queue(
      [await token.getAddress()],
      [0],
      [calldata],
      descriptionHash
    );

    await time.increase(TIMELOCK_DELAY + 1);

    await governor.execute(
      [await token.getAddress()],
      [0],
      [calldata],
      descriptionHash
    );

    const requestCount = await token.mintRequestCount();
    const requestId = requestCount - 1n;

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

  describe("📋 Burn Impact Analysis", function () {
    
    it("✅ 1. Phân tích quorum với burn scenarios", async function () {
      this.timeout(300000);
      
      console.log("\n========================================");
      console.log("🔥 BURN IMPACT ON QUORUM");
      console.log("========================================\n");

      const initialSupply = await token.totalSupply();
      const votingPower = await token.getVotes(await voter1.getAddress()) +
                         await token.getVotes(await voter2.getAddress()) +
                         await token.getVotes(await voter3.getAddress());

      console.log(`Initial State:`);
      console.log(`  Supply: ${ethers.formatEther(initialSupply)} HYRA`);
      console.log(`  Voting Power: ${ethers.formatEther(votingPower)} HYRA (${Number(votingPower * 10000n / initialSupply) / 100}%)\n`);

      console.log(`Scenario Comparison:`);
      console.log(`Year | No Burn Supply | No Burn Quorum | With 40% Burn Supply | With Burn Quorum | Can Vote?`);
      console.log(`-----|----------------|----------------|----------------------|------------------|----------`);

      let noBurnSupply = initialSupply;
      let withBurnSupply = initialSupply;

      // Year 1
      let quorumNoBurn = (noBurnSupply * 1000n) / 10000n;
      let quorumWithBurn = (withBurnSupply * 1000n) / 10000n;
      console.log(`  1  |     ${Number(noBurnSupply / 10n**9n) / 10}B     |     ${Number(quorumNoBurn / 10n**6n)}M     |        ${Number(withBurnSupply / 10n**9n) / 10}B        |      ${Number(quorumWithBurn / 10n**6n)}M      |    ${votingPower >= quorumWithBurn ? '✅' : '❌'}`);

      // Years 2-10
      for (let year = 2; year <= 10; year++) {
        // No burn scenario
        noBurnSupply += TIER1_ANNUAL_CAP;
        quorumNoBurn = (noBurnSupply * 1000n) / 10000n;

        // With burn scenario (40% of minted amount)
        const mintAmount = TIER1_ANNUAL_CAP;
        const burnAmount = (mintAmount * 40n) / 100n;
        withBurnSupply = withBurnSupply + mintAmount - burnAmount;
        quorumWithBurn = (withBurnSupply * 1000n) / 10000n;

        const canVoteNoBurn = votingPower >= quorumNoBurn;
        const canVoteWithBurn = votingPower >= quorumWithBurn;

        console.log(` ${year.toString().padStart(2)} |     ${Number(noBurnSupply / 10n**9n) / 10}B     |     ${Number(quorumNoBurn / 10n**6n)}M     |        ${Number(withBurnSupply / 10n**9n) / 10}B        |      ${Number(quorumWithBurn / 10n**6n)}M      |    ${canVoteWithBurn ? '✅' : '❌'} (no burn: ${canVoteNoBurn ? '✅' : '❌'})`);
      }

      console.log(`\n========================================`);
      console.log(`✅ KẾT LUẬN:`);
      console.log(`Burn mechanism GIÚP maintain quorum!`);
      console.log(`Với 40% burn rate:`);
      console.log(`  - Năm 10 no burn: Quorum = ${Number(quorumNoBurn / 10n**6n)}M (${votingPower >= quorumNoBurn ? 'CÓ THỂ' : 'KHÔNG THỂ'} vote)`);
      console.log(`  - Năm 10 with burn: Quorum = ${Number(quorumWithBurn / 10n**6n)}M (${votingPower >= quorumWithBurn ? 'CÓ THỂ' : 'KHÔNG THỂ'} vote)`);
      console.log(`========================================\n`);
    });

    it("✅ 2. Test thực tế: Mint → Burn → Vote lại", async function () {
      this.timeout(300000);

      console.log("\n========================================");
      console.log("🔥 REAL TEST: MINT → BURN → VOTE");
      console.log("========================================\n");

      // Year 2: Mint via DAO
      await time.increase(YEAR_DURATION);
      
      console.log(`Year 2: Mint 2.5B via DAO`);
      const supplyBefore = await token.totalSupply();
      const quorumBefore = (supplyBefore * 1000n) / 10000n;
      console.log(`  Supply before: ${ethers.formatEther(supplyBefore)} HYRA`);
      console.log(`  Quorum before: ${ethers.formatEther(quorumBefore)} HYRA`);

      await mintViaDAO(TIER1_ANNUAL_CAP, "Year 2 mint");

      const supplyAfterMint = await token.totalSupply();
      console.log(`  Supply after mint: ${ethers.formatEther(supplyAfterMint)} HYRA`);

      // Burn 100M tokens (burner has 100M)
      const burnAmount = ethers.parseEther("100000000");
      console.log(`\n🔥 Burning ${ethers.formatEther(burnAmount)} HYRA...`);
      
      await token.connect(burner).burn(burnAmount);

      const supplyAfterBurn = await token.totalSupply();
      const quorumAfterBurn = (supplyAfterBurn * 1000n) / 10000n;
      console.log(`  Supply after burn: ${ethers.formatEther(supplyAfterBurn)} HYRA`);
      console.log(`  Quorum after burn: ${ethers.formatEther(quorumAfterBurn)} HYRA`);

      // Verify quorum decreased
      expect(supplyAfterBurn).to.be.lt(supplyAfterMint);
      expect(quorumAfterBurn).to.be.lt((supplyAfterMint * 1000n) / 10000n);

      console.log(`\n✅ Quorum GIẢM từ ${ethers.formatEther((supplyAfterMint * 1000n) / 10000n)} → ${ethers.formatEther(quorumAfterBurn)} HYRA`);

      // Try to vote again in year 3
      await time.increase(YEAR_DURATION);
      
      console.log(`\nYear 3: Vote lại với quorum thấp hơn`);
      const votingPower = await token.getVotes(await voter1.getAddress()) +
                         await token.getVotes(await voter2.getAddress()) +
                         await token.getVotes(await voter3.getAddress());
      
      console.log(`  Voting power: ${ethers.formatEther(votingPower)} HYRA`);
      console.log(`  Quorum needed: ${ethers.formatEther(quorumAfterBurn)} HYRA`);
      console.log(`  Can vote: ${votingPower >= quorumAfterBurn ? '✅ YES' : '❌ NO'}`);

      expect(votingPower).to.be.gte(quorumAfterBurn);

      // Mint successfully
      await mintViaDAO(TIER1_ANNUAL_CAP, "Year 3 mint");

      console.log(`  ✅ Mint thành công!`);

      console.log(`\n========================================`);
      console.log(`✅ BURN MECHANISM HOẠT ĐỘNG TỐT!`);
      console.log(`========================================\n`);
    });
  });
});
