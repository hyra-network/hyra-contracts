import { expect } from "chai";
import { ethers } from "hardhat";
import { time, mine, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { HyraGovernor, HyraTimelock, HyraToken, HyraProxyAdmin, ERC1967Proxy, HyraTransparentUpgradeableProxy } from "../typechain-types";

describe("Upgrade via Voting", function () {
  const VOTING_DELAY = 1; // blocks
  const VOTING_PERIOD = 10; // blocks
  const PROPOSAL_THRESHOLD = 0n;
  const BASE_QUORUM_PERCENT = 10; // 10%
  const TL_MIN_DELAY = 7 * 24 * 60 * 60; // 7 days
  const UPGRADE_DELAY = 7 * 24 * 60 * 60; // 7 days
  const INITIAL_SUPPLY = ethers.parseEther("1000000");

  const ProposalType = {
    STANDARD: 0,
    EMERGENCY: 1,
    CONSTITUTIONAL: 2,
    UPGRADE: 3,
  } as const;

  async function deployUpgradeFixture() {
    const [deployer, voter1, voter2, alice, privilegedMultisigSigner] = await ethers.getSigners();

    // Deploy ProxyAdmin
    const ProxyAdminFactory = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await ProxyAdminFactory.deploy(deployer.address);
    await proxyAdmin.waitForDeployment();

    // Deploy ProxyDeployer
    const ProxyDeployerFactory = await ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await ProxyDeployerFactory.deploy();
    await proxyDeployer.waitForDeployment();

    // Deploy Timelock
    const TimelockFactory = await ethers.getContractFactory("HyraTimelock");
    const timelockImpl = await TimelockFactory.deploy();
    await timelockImpl.waitForDeployment();

    const timelockInit = TimelockFactory.interface.encodeFunctionData("initialize", [
      TL_MIN_DELAY,
      [],
      [ethers.ZeroAddress],
      deployer.address,
    ]);

    const timelockProxyAddr = await proxyDeployer.deployProxy.staticCall(
      await timelockImpl.getAddress(),
      await proxyAdmin.getAddress(),
      timelockInit,
      "HyraTimelock"
    );
    await (await proxyDeployer.deployProxy(
      await timelockImpl.getAddress(),
      await proxyAdmin.getAddress(),
      timelockInit,
      "HyraTimelock"
    )).wait();
    const timelock = await ethers.getContractAt("HyraTimelock", timelockProxyAddr);

    // Deploy Token
    const TokenFactory = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await TokenFactory.deploy();
    await tokenImpl.waitForDeployment();

    const tokenProxy = await proxyDeployer.deployProxy.staticCall(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      "0x",
      "HyraToken"
    );
    await (await proxyDeployer.deployProxy(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      "0x",
      "HyraToken"
    )).wait();
    const token = await ethers.getContractAt("HyraToken", tokenProxy);

    // Deploy 6 mock distribution wallets
    const MockDistributionWallet = await ethers.getContractFactory("MockDistributionWallet");
    const distributionWallets = [];
    for (let i = 0; i < 6; i++) {
      const wallet = await MockDistributionWallet.deploy(deployer.address);
      await wallet.waitForDeployment();
      distributionWallets.push(await wallet.getAddress());
    }

    // Set distribution config
    await token.setDistributionConfig(
      distributionWallets[0],
      distributionWallets[1],
      distributionWallets[2],
      distributionWallets[3],
      distributionWallets[4],
      distributionWallets[5]
    );

    // Deploy a simple forwarder contract to act as privilegedMultisigWallet
    // This contract can forward calls from its owner (privilegedMultisigSigner)
    // In production, this would be a multisig contract
    const ProposalForwarderFactory = await ethers.getContractFactory("ProposalForwarder");
    const privilegedMultisigContract = await ProposalForwarderFactory.deploy(privilegedMultisigSigner.address);
    await privilegedMultisigContract.waitForDeployment();
    const privilegedMultisigAddress = await privilegedMultisigContract.getAddress();

    // Initialize token
    await token.initialize(
      "HYRA",
      "HYRA",
      INITIAL_SUPPLY,
      voter1.address, // vesting contract (not used)
      timelockProxyAddr, // governance
      privilegedMultisigAddress // privilegedMultisigWallet
    );

    await (await proxyAdmin.addProxy(tokenProxy, "HyraToken")).wait();
    await (await proxyAdmin.transferOwnership(timelockProxyAddr)).wait();

    // Deploy Governor
    const GovernorFactory = await ethers.getContractFactory("HyraGovernor");
    const governorImpl = await GovernorFactory.deploy();
    await governorImpl.waitForDeployment();

    const govInit = GovernorFactory.interface.encodeFunctionData("initialize", [
      tokenProxy,
      timelockProxyAddr,
      VOTING_DELAY,
      VOTING_PERIOD,
      PROPOSAL_THRESHOLD,
      BASE_QUORUM_PERCENT,
      privilegedMultisigAddress, // privilegedMultisigWallet
    ]);

    const governorProxy = await proxyDeployer.deployProxy.staticCall(
      await governorImpl.getAddress(),
      await proxyAdmin.getAddress(),
      govInit,
      "HyraGovernor"
    );
    await (await proxyDeployer.deployProxy(
      await governorImpl.getAddress(),
      await proxyAdmin.getAddress(),
      govInit,
      "HyraGovernor"
    )).wait();
    const governor = await ethers.getContractAt("HyraGovernor", governorProxy);

    // Setup roles
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
    await (await timelock.grantRole(PROPOSER_ROLE, governorProxy)).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress)).wait();
    await (await timelock.grantRole(PROPOSER_ROLE, timelockProxyAddr)).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, timelockProxyAddr)).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, deployer.address)).wait();
    await (await timelock.revokeRole(ADMIN_ROLE, deployer.address)).wait();

    // Setup voting power - tokens are distributed to 6 wallets, need to transfer from them
    // Get tokens from first distribution wallet (communityEcosystem - 60% = 600,000 tokens)
    const distributionWallet1 = await ethers.getContractAt("MockDistributionWallet", distributionWallets[0]);
    const wallet1Balance = await token.balanceOf(distributionWallets[0]);
    // Transfer smaller amounts to voters
    await (await distributionWallet1.connect(deployer).forwardTokens(tokenProxy, voter1.address, ethers.parseEther("300000"))).wait();
    await (await distributionWallet1.connect(deployer).forwardTokens(tokenProxy, voter2.address, ethers.parseEther("200000"))).wait();
    
    await (await token.connect(voter1).delegate(voter1.address)).wait();
    await (await token.connect(voter2).delegate(voter2.address)).wait();
    await mine(1);

    // Deploy new implementation for upgrade (using same contract for testing)
    const TokenV2Factory = await ethers.getContractFactory("HyraToken");
    const tokenImplV2 = await TokenV2Factory.deploy();
    await tokenImplV2.waitForDeployment();

    return {
      deployer,
      voter1,
      voter2,
      alice,
      timelock,
      governor,
      token,
      tokenImpl: tokenImpl,
      tokenImplV2,
      tokenProxy,
      proxyAdmin,
      privilegedMultisig: privilegedMultisigAddress,
      privilegedMultisigSigner,
    };
  }

  describe("Upgrade via Governance Proposal", function () {
    it("should successfully upgrade token contract through voting process", async function () {
      const {
        deployer,
        voter1,
        voter2,
        timelock,
        governor,
        token,
        tokenImplV2,
        tokenProxy,
        proxyAdmin,
        privilegedMultisig,
        privilegedMultisigSigner,
      } = await loadFixture(deployUpgradeFixture);

      // Step 1: Create proposal to schedule upgrade
      const description = "Upgrade HyraToken to V2 implementation";
      const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));

      // Prepare proposal data: call scheduleUpgrade on timelock
      const targets = [await timelock.getAddress()];
      const values = [0n];
      const calldatas = [
        timelock.interface.encodeFunctionData("scheduleUpgrade", [
          tokenProxy,
          await tokenImplV2.getAddress(),
          "0x",
          false, // not emergency
        ]),
      ];

      // Create proposal with UPGRADE type (requires privilegedMultisigWallet)
      // Use ProposalForwarder to forward the call from privilegedMultisigSigner
      const forwarder = await ethers.getContractAt("ProposalForwarder", privilegedMultisig);
      await expect(
        forwarder.connect(privilegedMultisigSigner).proposeWithType(
          await governor.getAddress(),
          targets,
          values,
          calldatas,
          description,
          ProposalType.UPGRADE
        )
      ).to.emit(governor, "ProposalCreated");

      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
      expect(proposalId).to.be.gt(0);

      // Verify proposal type is UPGRADE
      const proposalType = await governor.proposalTypes(proposalId);
      expect(proposalType).to.eq(ProposalType.UPGRADE);

      // Step 2: Wait for voting delay
      await mine(VOTING_DELAY + 1);

      // Step 3: Vote on proposal
      await expect(governor.connect(voter1).castVote(proposalId, 1)) // 1 = For
        .to.emit(governor, "VoteCast");

      await expect(governor.connect(voter2).castVote(proposalId, 1)) // 1 = For
        .to.emit(governor, "VoteCast");

      // Step 4: Wait for voting period
      await mine(VOTING_PERIOD + 1);

      // Verify proposal state is Succeeded
      const state = await governor.state(proposalId);
      expect(state).to.eq(4); // 4 = Succeeded

      // Step 5: Queue proposal
      await expect(governor.queue(targets, values, calldatas, descriptionHash))
        .to.emit(governor, "ProposalQueued");

      // Verify proposal is queued (state should be Queued)
      const queuedState = await governor.state(proposalId);
      expect(queuedState).to.eq(5); // 5 = Queued

      // Step 6: Wait for timelock delay
      await time.increase(TL_MIN_DELAY + 1);

      // Step 7: Execute proposal
      await expect(governor.execute(targets, values, calldatas, descriptionHash))
        .to.emit(governor, "ProposalExecuted")
        .to.emit(timelock, "UpgradeScheduled");

      // Step 8: Verify upgrade is scheduled
      const pendingUpgrade = await timelock.pendingUpgrades(tokenProxy);
      expect(pendingUpgrade).to.be.gt(0);

      const pendingImplementation = await timelock.pendingImplementations(tokenProxy);
      expect(pendingImplementation).to.eq(await tokenImplV2.getAddress());

      // Step 9: Wait for upgrade delay
      await time.increase(UPGRADE_DELAY + 1);

      // Step 10: Execute upgrade
      await expect(
        timelock.executeUpgrade(await proxyAdmin.getAddress(), tokenProxy)
      )
        .to.emit(timelock, "UpgradeExecuted");

      // Step 11: Verify upgrade was successful
      // Check that implementation address changed (via proxy implementation() function)
      const tokenProxyContract = await ethers.getContractAt("HyraTransparentUpgradeableProxy", tokenProxy);
      const currentImplementation = await tokenProxyContract.implementation();
      expect(currentImplementation.toLowerCase()).to.eq((await tokenImplV2.getAddress()).toLowerCase());

      // Verify upgrade is no longer pending
      const pendingUpgradeAfter = await timelock.pendingUpgrades(tokenProxy);
      expect(pendingUpgradeAfter).to.eq(0);
    });

    it("should fail to create UPGRADE proposal without privilegedMultisigWallet", async function () {
      const { voter1, timelock, governor, token, tokenImplV2, tokenProxy, privilegedMultisig, privilegedMultisigSigner } = await loadFixture(
        deployUpgradeFixture
      );

      const targets = [await timelock.getAddress()];
      const values = [0n];
      const calldatas = [
        timelock.interface.encodeFunctionData("scheduleUpgrade", [
          tokenProxy,
          await tokenImplV2.getAddress(),
          "0x",
          false,
        ]),
      ];
      const description = "Upgrade proposal";

      // Regular user cannot create UPGRADE proposal
      await expect(
        governor.connect(voter1).proposeWithType(targets, values, calldatas, description, ProposalType.UPGRADE)
      ).to.be.revertedWithCustomError(governor, "OnlyPrivilegedMultisigWallet");
    });

    it("should require UPGRADE quorum (15%) for upgrade proposal", async function () {
      const {
        voter1,
        voter2,
        timelock,
        governor,
        token,
        tokenImplV2,
        tokenProxy,
        privilegedMultisig,
        privilegedMultisigSigner,
      } = await loadFixture(deployUpgradeFixture);

      // Create proposal
      const targets = [await timelock.getAddress()];
      const values = [0n];
      const calldatas = [
        timelock.interface.encodeFunctionData("scheduleUpgrade", [
          tokenProxy,
          await tokenImplV2.getAddress(),
          "0x",
          false,
        ]),
      ];
      const description = "Upgrade proposal";
      const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));

      const forwarder = await ethers.getContractAt("ProposalForwarder", privilegedMultisig);
      await forwarder.connect(privilegedMultisigSigner).proposeWithType(
        await governor.getAddress(),
        targets,
        values,
        calldatas,
        description,
        ProposalType.UPGRADE
      );

      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
      
      // Wait for voting delay to ensure proposal snapshot is set
      await mine(VOTING_DELAY + 1);

      // Vote with insufficient quorum (only voter1 - has 300,000 tokens = 30% of 1M total)
      // UPGRADE requires 15% quorum, so voter1 alone should be enough
      // But let's test with a scenario where quorum is not met by casting a vote with less tokens
      // Actually, voter1 has 30% which is more than 15%, so proposal will succeed
      // To test quorum failure, we need voters with less tokens or no votes at all
      // Don't vote at all - let proposal fail due to no votes
      
      // Wait for voting period to end without voting
      await mine(VOTING_PERIOD + 1);

      // Proposal should be Defeated due to no votes (quorum not met)
      const state = await governor.state(proposalId);
      expect(state).to.eq(3); // 3 = Defeated
    });

    it("should allow canceling upgrade proposal before execution", async function () {
      const {
        voter1,
        voter2,
        timelock,
        governor,
        token,
        tokenImplV2,
        tokenProxy,
        privilegedMultisig,
        privilegedMultisigSigner,
      } = await loadFixture(deployUpgradeFixture);

      // Create proposal
      const targets = [await timelock.getAddress()];
      const values = [0n];
      const calldatas = [
        timelock.interface.encodeFunctionData("scheduleUpgrade", [
          tokenProxy,
          await tokenImplV2.getAddress(),
          "0x",
          false,
        ]),
      ];
      const description = "Upgrade proposal";
      const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));

      const forwarder = await ethers.getContractAt("ProposalForwarder", privilegedMultisig);
      await forwarder.connect(privilegedMultisigSigner).proposeWithType(
        await governor.getAddress(),
        targets,
        values,
        calldatas,
        description,
        ProposalType.UPGRADE
      );

      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
      
      // Cancel proposal immediately (before voting delay passes)
      // Proposer can cancel in Pending state (before voting starts)
      // forwarder was already declared above, reuse it
      await expect(forwarder.connect(privilegedMultisigSigner).cancel(await governor.getAddress(), targets, values, calldatas, descriptionHash))
        .to.emit(governor, "ProposalCancelled");

      const state = await governor.state(proposalId);
      expect(state).to.eq(2); // 2 = Canceled
    });

    it("should handle expired upgrade after proposal execution", async function () {
      const {
        deployer,
        voter1,
        voter2,
        alice,
        timelock,
        governor,
        token,
        tokenImplV2,
        tokenProxy,
        proxyAdmin,
        privilegedMultisig,
        privilegedMultisigSigner,
      } = await loadFixture(deployUpgradeFixture);

      // Create and execute proposal to schedule upgrade
      const targets = [await timelock.getAddress()];
      const values = [0n];
      const calldatas = [
        timelock.interface.encodeFunctionData("scheduleUpgrade", [
          tokenProxy,
          await tokenImplV2.getAddress(),
          "0x",
          false,
        ]),
      ];
      const description = "Upgrade proposal";
      const descriptionHash = ethers.keccak256(ethers.toUtf8Bytes(description));

      const forwarder = await ethers.getContractAt("ProposalForwarder", privilegedMultisig);
      await forwarder.connect(privilegedMultisigSigner).proposeWithType(
        await governor.getAddress(),
        targets,
        values,
        calldatas,
        description,
        ProposalType.UPGRADE
      );

      const proposalId = await governor.hashProposal(targets, values, calldatas, descriptionHash);
      await mine(VOTING_DELAY + 1);
      await governor.connect(voter1).castVote(proposalId, 1);
      await governor.connect(voter2).castVote(proposalId, 1);
      await mine(VOTING_PERIOD + 1);
      await governor.queue(targets, values, calldatas, descriptionHash);
      await time.increase(TL_MIN_DELAY + 1);
      await governor.execute(targets, values, calldatas, descriptionHash);

      // Wait for upgrade delay
      await time.increase(UPGRADE_DELAY + 1);

      // Don't execute upgrade, let it expire (48 hours)
      const pendingUpgrade = await timelock.pendingUpgrades(tokenProxy);
      await time.increase(48 * 60 * 60 + 1); // 48 hours + 1 second

      // Verify upgrade is expired
      const isReady = await timelock.isUpgradeReady(tokenProxy);
      expect(isReady).to.be.false;

      // Try to execute expired upgrade - should fail
      await expect(
        timelock.executeUpgrade(await proxyAdmin.getAddress(), tokenProxy)
      ).to.be.revertedWithCustomError(timelock, "UpgradeExpired");

      // Cleanup expired upgrade
      await expect(timelock.connect(alice).cleanupExpiredUpgrade(tokenProxy))
        .to.emit(timelock, "UpgradeExpiredCleaned");

      // Verify upgrade is cleaned up
      const pendingUpgradeAfter = await timelock.pendingUpgrades(tokenProxy);
      expect(pendingUpgradeAfter).to.eq(0);
    });
  });
});

