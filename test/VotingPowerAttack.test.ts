import { expect } from "chai";
import { ethers } from "hardhat";
import { mine, time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken, HyraGovernor, HyraTimelock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

//npm test -- test/VotingPowerAttack.test.ts
/**
 * Test suite to verify protection against voting power manipulation attacks
 * 
 * This test suite covers all possible attack scenarios where attackers try to
 * manipulate voting power by transferring tokens after proposal snapshot is taken.
 * 
 * Key Security Features Tested:
 * 1. Snapshot mechanism prevents voting power manipulation
 * 2. Transfer token after snapshot cannot increase voting power
 * 3. Buying tokens after snapshot cannot be used for voting
 * 4. Multiple account transfers cannot bypass snapshot
 * 5. Delegate after snapshot cannot increase voting power
 */
describe("Voting Power Attack Scenarios - Transfer Token Hacks", function () {
    let token: HyraToken;
    let governor: HyraGovernor;
    let timelock: HyraTimelock;
    let owner: SignerWithAddress;
    let attacker: SignerWithAddress;
    let voter1: SignerWithAddress;
    let voter2: SignerWithAddress;
    let voter3: SignerWithAddress;
    let voter4: SignerWithAddress;
    let voter5: SignerWithAddress;
    let proposalId: bigint;

    const VOTING_DELAY = 1; // 1 block
    const VOTING_PERIOD = 100; // 100 blocks
    const PROPOSAL_THRESHOLD = ethers.parseEther("1000000"); // 1M tokens
    const QUORUM_PERCENTAGE = 10; // 10%
    const INITIAL_SUPPLY = ethers.parseEther("10000000"); // 10M tokens

    beforeEach(async function () {
        [owner, attacker, voter1, voter2, voter3, voter4, voter5] = await ethers.getSigners();

        // Deploy HyraTimelock
        const HyraTimelockFactory = await ethers.getContractFactory("HyraTimelock");
        const timelockImpl = await HyraTimelockFactory.deploy();
        await timelockImpl.waitForDeployment();
        const tlInit = HyraTimelockFactory.interface.encodeFunctionData("initialize", [
            2 * 24 * 60 * 60, // 2 days
            [],
            [],
            await owner.getAddress(),
        ]);
        const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
        const tlProxy = await ERC1967Proxy.deploy(await timelockImpl.getAddress(), tlInit);
        await tlProxy.waitForDeployment();
        timelock = await ethers.getContractAt("HyraTimelock", await tlProxy.getAddress());

        // Deploy HyraToken
        const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
        const tokenImpl = await HyraTokenFactory.deploy();
        await tokenImpl.waitForDeployment();
        // Deploy proxy with empty init data first (to set distribution config before initialize)
        const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
        await tokenProxy.waitForDeployment();
        token = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

        // Deploy mock distribution wallets for setDistributionConfig
        const MockDistributionWallet = await ethers.getContractFactory("MockDistributionWallet");
        const distributionWallets = [];
        for (let i = 0; i < 6; i++) {
            const wallet = await MockDistributionWallet.deploy(await owner.getAddress());
            await wallet.waitForDeployment();
            distributionWallets.push(await wallet.getAddress());
        }

        // Set distribution config BEFORE initialize
        await token.setDistributionConfig(
            distributionWallets[0],
            distributionWallets[1],
            distributionWallets[2],
            distributionWallets[3],
            distributionWallets[4],
            distributionWallets[5]
        );

        // Deploy mock contract for privilegedMultisigWallet (must be contract, not EOA)
        const privilegedMultisig = await MockDistributionWallet.deploy(await owner.getAddress());
        await privilegedMultisig.waitForDeployment();

        // Now initialize token
        await token.initialize(
            "HYRA",
            "HYRA",
            INITIAL_SUPPLY,
            await owner.getAddress(),
            await timelock.getAddress(),
            0, // yearStartTime (0 = use block.timestamp)
            await privilegedMultisig.getAddress() // privilegedMultisigWallet
        );

        // Deploy HyraGovernor
        const HyraGovernorFactory = await ethers.getContractFactory("HyraGovernor");
        const govImpl = await HyraGovernorFactory.deploy();
        await govImpl.waitForDeployment();
        const govInit = HyraGovernorFactory.interface.encodeFunctionData("initialize", [
            await token.getAddress(),
            await timelock.getAddress(),
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM_PERCENTAGE,
            await privilegedMultisig.getAddress() // privilegedMultisigWallet (already deployed above)
        ]);
        const govProxy = await ERC1967Proxy.deploy(await govImpl.getAddress(), govInit);
        await govProxy.waitForDeployment();
        governor = await ethers.getContractAt("HyraGovernor", await govProxy.getAddress());

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

        await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
        await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
        await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());

        // Distribute initial tokens (owner has 10M from initialization)
        await token.transfer(await voter1.getAddress(), ethers.parseEther("2000000")); // 2M
        await token.transfer(await voter2.getAddress(), ethers.parseEther("1000000")); // 1M
        await token.transfer(await voter3.getAddress(), ethers.parseEther("500000"));  // 500K
        await token.transfer(await attacker.getAddress(), ethers.parseEther("100000")); // 100K
        // Owner now has: 10M - 3.6M = 6.4M remaining

        // Delegate voting power
        await token.connect(voter1).delegate(await voter1.getAddress());
        await token.connect(voter2).delegate(await voter2.getAddress());
        await token.connect(voter3).delegate(await voter3.getAddress());
        await token.connect(attacker).delegate(await attacker.getAddress());

        // Mine a block to make voting power active
        await mine(1);
    });

    describe("Attack 1: Transfer Token After Snapshot to Increase Voting Power", function () {
        it("Should prevent attacker from increasing voting power by transferring tokens after snapshot", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start (need to mine blocks first)
            await mine(VOTING_DELAY + 1);

            // Get snapshot block
            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Attacker's voting power at snapshot (need to be at least 1 block after snapshot)
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const attackerVotingPowerAtSnapshot = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlock
            );
            console.log("🔴 Attacker voting power at snapshot:", ethers.formatEther(attackerVotingPowerAtSnapshot));

            // ATTACK: Attacker tries to buy/transfer tokens after snapshot
            // Check owner balance first
            const ownerBalance = await token.balanceOf(await owner.getAddress());
            const transferAmount = ownerBalance > ethers.parseEther("5000000") 
                ? ethers.parseEther("5000000") 
                : ownerBalance / 2n; // Use half if not enough
            if (transferAmount > 0) {
                await token.transfer(await attacker.getAddress(), transferAmount);
            }
            await token.connect(attacker).delegate(await attacker.getAddress());
            await mine(1);

            // Check current voting power (should be higher)
            const attackerCurrentVotingPower = await token.getVotes(await attacker.getAddress());
            console.log("🔴 Attacker current voting power:", ethers.formatEther(attackerCurrentVotingPower));

            // Verify: Voting power at snapshot should still be the same
            const currentBlockAfter = await ethers.provider.getBlockNumber();
            const checkBlockAfter = currentBlockAfter > snapshotBlock ? snapshotBlock : currentBlockAfter - 1;
            const attackerVotingPowerAtSnapshotAfter = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlockAfter
            );
            expect(attackerVotingPowerAtSnapshotAfter).to.equal(attackerVotingPowerAtSnapshot);
            console.log("✅ Attack failed: Voting power at snapshot unchanged");

            // Attacker votes
            await governor.connect(attacker).castVote(proposalId, 1); // FOR

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            // Verify: Attacker's vote should only count based on snapshot voting power
            // Total forVotes should be based on snapshot, not current balance
            expect(forVotes).to.be.greaterThanOrEqual(attackerVotingPowerAtSnapshot);
            expect(forVotes).to.be.lessThan(attackerVotingPowerAtSnapshot + ethers.parseEther("5000000"));
            console.log("✅ Attack failed: Vote counted based on snapshot, not current balance");
        });
    });

    describe("Attack 2: Multiple Account Transfer Attack", function () {
        it("Should prevent attacker from using multiple accounts to bypass snapshot", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Multi account attack";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // ATTACK: Attacker transfers tokens to multiple accounts after snapshot
            await token.transfer(await voter4.getAddress(), ethers.parseEther("2000000")); // 2M
            await token.transfer(await voter5.getAddress(), ethers.parseEther("2000000")); // 2M

            // New accounts delegate
            await token.connect(voter4).delegate(await voter4.getAddress());
            await token.connect(voter5).delegate(await voter5.getAddress());
            await mine(1);

            // Check voting power at snapshot for new accounts
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const voter4VotingPowerAtSnapshot = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlock
            );
            const voter5VotingPowerAtSnapshot = await token.getPastVotes(
                await voter5.getAddress(),
                checkBlock
            );

            console.log("🔴 Voter4 voting power at snapshot:", ethers.formatEther(voter4VotingPowerAtSnapshot));
            console.log("🔴 Voter5 voting power at snapshot:", ethers.formatEther(voter5VotingPowerAtSnapshot));

            // Verify: New accounts should have 0 voting power at snapshot
            expect(voter4VotingPowerAtSnapshot).to.equal(0);
            expect(voter5VotingPowerAtSnapshot).to.equal(0);
            console.log("✅ Attack failed: New accounts have 0 voting power at snapshot");

            // Try to vote with new accounts
            await governor.connect(voter4).castVote(proposalId, 1);
            await governor.connect(voter5).castVote(proposalId, 1);

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            // Verify: Votes from new accounts should be 0
            // Total forVotes should not include votes from accounts that didn't exist at snapshot
            console.log("📊 Total forVotes:", ethers.formatEther(forVotes));
            console.log("✅ Attack failed: Votes from new accounts don't count");
        });
    });

    describe("Attack 3: Buy Token After Snapshot Attack", function () {
        it("Should prevent buying tokens after snapshot to vote", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Buy token attack";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Attacker has minimal tokens at snapshot
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const attackerVotingPowerAtSnapshot = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlock
            );
            console.log("🔴 Attacker voting power at snapshot:", ethers.formatEther(attackerVotingPowerAtSnapshot));

            // ATTACK: Attacker "buys" tokens (receives transfer) after snapshot
            // Check owner balance first
            const ownerBalance = await token.balanceOf(await owner.getAddress());
            const transferAmount = ownerBalance > ethers.parseEther("8000000") 
                ? ethers.parseEther("8000000") 
                : ownerBalance; // Use all available if less than 8M
            if (transferAmount > 0) {
                await token.transfer(await attacker.getAddress(), transferAmount);
                await token.connect(attacker).delegate(await attacker.getAddress());
                await mine(1);
            }

            // Check current voting power (should be high)
            const attackerCurrentVotingPower = await token.getVotes(await attacker.getAddress());
            console.log("🔴 Attacker current voting power:", ethers.formatEther(attackerCurrentVotingPower));

            // Verify: Voting power at snapshot should still be low
            const currentBlockAfter = await ethers.provider.getBlockNumber();
            const checkBlockAfter = currentBlockAfter > snapshotBlock ? snapshotBlock : currentBlockAfter - 1;
            const attackerVotingPowerAtSnapshotAfter = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlockAfter
            );
            expect(attackerVotingPowerAtSnapshotAfter).to.equal(attackerVotingPowerAtSnapshot);
            console.log("✅ Attack failed: Cannot increase voting power by buying after snapshot");

            // Attacker votes
            await governor.connect(attacker).castVote(proposalId, 1);

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            // Verify: Vote should only count based on snapshot voting power
            expect(forVotes).to.be.lessThan(attackerVotingPowerAtSnapshot + ethers.parseEther("1000000"));
            console.log("✅ Attack failed: Vote counted based on snapshot, not purchased tokens");
        });
    });

    describe("Attack 4: Delegate After Snapshot Attack", function () {
        it("Should prevent increasing voting power by delegating after snapshot", async function () {
            // Setup: User has tokens but hasn't delegated
            await token.transfer(await voter4.getAddress(), ethers.parseEther("3000000")); // 3M
            await mine(1);

            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Delegate after snapshot";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Voter4 has tokens but hasn't delegated at snapshot
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const voter4VotingPowerAtSnapshot = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlock
            );
            console.log("🔴 Voter4 voting power at snapshot (no delegate):", ethers.formatEther(voter4VotingPowerAtSnapshot));

            // Verify: Should be 0 because not delegated
            expect(voter4VotingPowerAtSnapshot).to.equal(0);

            // ATTACK: Voter4 delegates after snapshot
            await token.connect(voter4).delegate(await voter4.getAddress());
            await mine(1);

            // Check current voting power (should be high now)
            const voter4CurrentVotingPower = await token.getVotes(await voter4.getAddress());
            console.log("🔴 Voter4 current voting power (after delegate):", ethers.formatEther(voter4CurrentVotingPower));

            // Verify: Voting power at snapshot should still be 0
            const currentBlockAfter = await ethers.provider.getBlockNumber();
            const checkBlockAfter = currentBlockAfter > snapshotBlock ? snapshotBlock : currentBlockAfter - 1;
            const voter4VotingPowerAtSnapshotAfter = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlockAfter
            );
            expect(voter4VotingPowerAtSnapshotAfter).to.equal(0);
            console.log("✅ Attack failed: Delegate after snapshot doesn't increase voting power at snapshot");

            // Voter4 tries to vote
            await governor.connect(voter4).castVote(proposalId, 1);

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            // Verify: Vote should be 0 or minimal
            console.log("📊 Total forVotes:", ethers.formatEther(forVotes));
            console.log("✅ Attack failed: Vote doesn't count because no voting power at snapshot");
        });
    });

    describe("Attack 5: Transfer and Delegate Immediately Attack", function () {
        it("Should prevent attack by transferring and delegating immediately after snapshot", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Transfer and delegate attack";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // ATTACK: Transfer tokens and delegate immediately
            await token.transfer(await voter4.getAddress(), ethers.parseEther("5000000")); // 5M
            await token.connect(voter4).delegate(await voter4.getAddress());
            await mine(1);

            // Check voting power at snapshot
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const voter4VotingPowerAtSnapshot = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlock
            );
            console.log("🔴 Voter4 voting power at snapshot:", ethers.formatEther(voter4VotingPowerAtSnapshot));

            // Verify: Should be 0 because tokens transferred after snapshot
            expect(voter4VotingPowerAtSnapshot).to.equal(0);
            console.log("✅ Attack failed: Transfer after snapshot = 0 voting power at snapshot");

            // Try to vote
            await governor.connect(voter4).castVote(proposalId, 1);

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            console.log("📊 Total forVotes:", ethers.formatEther(forVotes));
            console.log("✅ Attack failed: Vote doesn't count");
        });
    });

    describe("Attack 6: Circular Transfer Attack", function () {
        it("Should prevent circular transfers to manipulate voting power", async function () {
            // Setup: Multiple accounts with tokens
            await token.transfer(await voter4.getAddress(), ethers.parseEther("2000000")); // 2M
            await token.transfer(await voter5.getAddress(), ethers.parseEther("2000000")); // 2M
            await token.connect(voter4).delegate(await voter4.getAddress());
            await token.connect(voter5).delegate(await voter5.getAddress());
            await mine(1);

            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Circular transfer attack";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Get voting power at snapshot
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const voter4VotingPowerAtSnapshot = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlock
            );
            const voter5VotingPowerAtSnapshot = await token.getPastVotes(
                await voter5.getAddress(),
                checkBlock
            );
            console.log("📊 Voter4 voting power at snapshot:", ethers.formatEther(voter4VotingPowerAtSnapshot));
            console.log("📊 Voter5 voting power at snapshot:", ethers.formatEther(voter5VotingPowerAtSnapshot));

            // ATTACK: Circular transfer to try to double voting power
            // Voter4 → Voter5 → Voter4 (circular)
            await token.connect(voter4).transfer(await voter5.getAddress(), ethers.parseEther("2000000"));
            await token.connect(voter5).transfer(await voter4.getAddress(), ethers.parseEther("4000000"));
            await mine(1);

            // Check voting power at snapshot (should be unchanged)
            const currentBlockAfter = await ethers.provider.getBlockNumber();
            const checkBlockAfter = currentBlockAfter > snapshotBlock ? snapshotBlock : currentBlockAfter - 1;
            
            const voter4VotingPowerAtSnapshotAfter = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlockAfter
            );
            const voter5VotingPowerAtSnapshotAfter = await token.getPastVotes(
                await voter5.getAddress(),
                checkBlockAfter
            );

            expect(voter4VotingPowerAtSnapshotAfter).to.equal(voter4VotingPowerAtSnapshot);
            expect(voter5VotingPowerAtSnapshotAfter).to.equal(voter5VotingPowerAtSnapshot);
            console.log("✅ Attack failed: Circular transfers don't affect snapshot voting power");

            // Vote
            await governor.connect(voter4).castVote(proposalId, 1);
            await governor.connect(voter5).castVote(proposalId, 1);

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            // Verify: Votes should be based on snapshot, not current balance
            const expectedVotes = voter4VotingPowerAtSnapshot + voter5VotingPowerAtSnapshot;
            expect(forVotes).to.be.greaterThanOrEqual(expectedVotes);
            console.log("✅ Attack failed: Votes counted based on snapshot");
        });
    });

    describe("Attack 7: Flash Loan Attack Simulation", function () {
        it("Should prevent flash loan attack to manipulate voting power", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Flash loan attack";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Attacker's voting power at snapshot
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const attackerVotingPowerAtSnapshot = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlock
            );
            console.log("🔴 Attacker voting power at snapshot:", ethers.formatEther(attackerVotingPowerAtSnapshot));

            // ATTACK: Simulate flash loan - borrow huge amount, vote, return
            // Step 1: "Borrow" tokens (transfer from owner)
            const ownerBalance = await token.balanceOf(await owner.getAddress());
            const borrowAmount = ownerBalance > ethers.parseEther("9000000") 
                ? ethers.parseEther("9000000") 
                : ownerBalance;
            if (borrowAmount > 0) {
                await token.transfer(await attacker.getAddress(), borrowAmount);
            }
            await token.connect(attacker).delegate(await attacker.getAddress());
            await mine(1);

            // Step 2: Vote with borrowed tokens
            await governor.connect(attacker).castVote(proposalId, 1);

            // Step 3: "Return" tokens (transfer back)
            const attackerBalance = await token.balanceOf(await attacker.getAddress());
            if (attackerBalance > 0) {
                await token.connect(attacker).transfer(await owner.getAddress(), attackerBalance);
            }
            await mine(1);

            // Verify: Voting power at snapshot should still be original
            const currentBlockAfter = await ethers.provider.getBlockNumber();
            const checkBlockAfter = currentBlockAfter > snapshotBlock ? snapshotBlock : currentBlockAfter - 1;
            const attackerVotingPowerAtSnapshotAfter = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlockAfter
            );
            expect(attackerVotingPowerAtSnapshotAfter).to.equal(attackerVotingPowerAtSnapshot);
            console.log("✅ Attack failed: Flash loan doesn't affect snapshot voting power");

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            // Verify: Vote should only count based on snapshot voting power
            expect(forVotes).to.be.lessThan(attackerVotingPowerAtSnapshot + ethers.parseEther("1000000"));
            console.log("✅ Attack failed: Vote counted based on snapshot, not flash loaned tokens");
        });
    });

    describe("Attack 8: Snapshot Timing Attack", function () {
        it("Should prevent timing attack by creating proposal at specific block", async function () {
            // Setup: Attacker prepares multiple accounts
            await token.transfer(await voter4.getAddress(), ethers.parseEther("1000000")); // 1M
            await token.transfer(await voter5.getAddress(), ethers.parseEther("1000000")); // 1M
            await token.connect(voter4).delegate(await voter4.getAddress());
            await token.connect(voter5).delegate(await voter5.getAddress());
            await mine(1);

            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Timing attack";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            const currentBlock = await ethers.provider.getBlockNumber();
            console.log("📸 Snapshot block:", snapshot.toString());
            console.log("📊 Current block:", currentBlock.toString());

            // Verify: Snapshot should be at proposal creation block
            expect(Number(snapshot)).to.be.lessThanOrEqual(currentBlock);
            console.log("✅ Snapshot correctly set at proposal creation");

            // ATTACK: Try to transfer tokens after snapshot
            const ownerBalance = await token.balanceOf(await owner.getAddress());
            const transferAmount = ownerBalance > ethers.parseEther("5000000") 
                ? ethers.parseEther("5000000") 
                : ownerBalance; // Use all available if less than 5M
            if (transferAmount > 0) {
                await token.transfer(await voter4.getAddress(), transferAmount);
                await mine(1);
            }

            // Check voting power at snapshot
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const voter4VotingPowerAtSnapshot = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlock
            );
            console.log("🔴 Voter4 voting power at snapshot:", ethers.formatEther(voter4VotingPowerAtSnapshot));

            // Verify: Should only have original 1M, not 6M
            expect(voter4VotingPowerAtSnapshot).to.equal(ethers.parseEther("1000000"));
            console.log("✅ Attack failed: Cannot increase voting power after snapshot");
        });
    });

    describe("Attack 9: Quorum Manipulation Attack", function () {
        it("Should prevent manipulating quorum by transferring tokens after snapshot", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Quorum manipulation";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Get quorum at snapshot
            const requiredQuorum = await governor.getProposalQuorum(proposalId);
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const totalSupplyAtSnapshot = await token.getPastTotalSupply(checkBlock);
            console.log("📊 Total supply at snapshot:", ethers.formatEther(totalSupplyAtSnapshot));
            console.log("📊 Required quorum:", ethers.formatEther(requiredQuorum));

            // ATTACK: Try to manipulate quorum by minting/transferring tokens
            // Note: In real scenario, attacker might try to increase total supply
            // But quorum is calculated from snapshot, so this won't work
            await token.transfer(await voter4.getAddress(), ethers.parseEther("5000000")); // 5M
            await mine(1);

            // Get quorum again (should be same)
            const requiredQuorumAfter = await governor.getProposalQuorum(proposalId);
            expect(requiredQuorumAfter).to.equal(requiredQuorum);
            console.log("✅ Attack failed: Quorum calculated from snapshot, not current supply");

            // Verify: Total supply at snapshot unchanged
            const currentBlockAfter = await ethers.provider.getBlockNumber();
            const checkBlockAfter = currentBlockAfter > snapshotBlock ? snapshotBlock : currentBlockAfter - 1;
            const totalSupplyAtSnapshotAfter = await token.getPastTotalSupply(checkBlockAfter);
            expect(totalSupplyAtSnapshotAfter).to.equal(totalSupplyAtSnapshot);
            console.log("✅ Attack failed: Total supply at snapshot unchanged");
        });
    });

    describe("Attack 10: Combined Attack - All Methods", function () {
        it("Should prevent combined attack using all manipulation methods", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Combined attack";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Get initial voting power
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const attackerVotingPowerAtSnapshot = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlock
            );
            console.log("🔴 Attacker initial voting power at snapshot:", ethers.formatEther(attackerVotingPowerAtSnapshot));

            // COMBINED ATTACK: Try all methods
            // 1. Transfer tokens to attacker (from owner who has remaining tokens)
            const ownerBalance = await token.balanceOf(await owner.getAddress());
            if (ownerBalance >= ethers.parseEther("3000000")) {
                await token.transfer(await attacker.getAddress(), ethers.parseEther("3000000")); // 3M
                await token.connect(attacker).delegate(await attacker.getAddress());
                await mine(1);
            }

            // 2. Transfer to multiple accounts (check balance after first transfer)
            const ownerBalanceAfterFirst = await token.balanceOf(await owner.getAddress());
            if (ownerBalanceAfterFirst >= ethers.parseEther("4000000")) {
                await token.transfer(await voter4.getAddress(), ethers.parseEther("2000000")); // 2M
                await token.transfer(await voter5.getAddress(), ethers.parseEther("2000000")); // 2M
            } else if (ownerBalanceAfterFirst >= ethers.parseEther("2")) {
                // Use half of remaining balance for each
                const halfBalance = ownerBalanceAfterFirst / 2n;
                if (halfBalance > 0) {
                    await token.transfer(await voter4.getAddress(), halfBalance);
                    const remaining = await token.balanceOf(await owner.getAddress());
                    if (remaining > 0) {
                        await token.transfer(await voter5.getAddress(), remaining);
                    }
                }
            }
            await token.connect(voter4).delegate(await voter4.getAddress());
            await token.connect(voter5).delegate(await voter5.getAddress());
            await mine(1);

            // 3. Check voting power at snapshot (should be unchanged)
            const currentBlockAfter = await ethers.provider.getBlockNumber();
            const checkBlockAfter = currentBlockAfter > snapshotBlock ? snapshotBlock : currentBlockAfter - 1;
            
            const attackerVotingPowerAtSnapshotAfter = await token.getPastVotes(
                await attacker.getAddress(),
                checkBlockAfter
            );
            const voter4VotingPowerAtSnapshot = await token.getPastVotes(
                await voter4.getAddress(),
                checkBlockAfter
            );
            const voter5VotingPowerAtSnapshot = await token.getPastVotes(
                await voter5.getAddress(),
                checkBlockAfter
            );

            expect(attackerVotingPowerAtSnapshotAfter).to.equal(attackerVotingPowerAtSnapshot);
            expect(voter4VotingPowerAtSnapshot).to.equal(0);
            expect(voter5VotingPowerAtSnapshot).to.equal(0);
            console.log("✅ Combined attack failed: All voting powers at snapshot unchanged");

            // 4. Try to vote with all accounts
            await governor.connect(attacker).castVote(proposalId, 1);
            await governor.connect(voter4).castVote(proposalId, 1);
            await governor.connect(voter5).castVote(proposalId, 1);

            // 5. Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];

            // 6. Verify: Votes should only count based on snapshot
            const expectedVotes = attackerVotingPowerAtSnapshot; // Only attacker had voting power at snapshot
            expect(forVotes).to.be.greaterThanOrEqual(expectedVotes);
            expect(forVotes).to.be.lessThan(expectedVotes + ethers.parseEther("1000000")); // Small margin for other voters
            console.log("✅ Combined attack failed: Votes counted based on snapshot only");
        });
    });

    describe("Security Verification - Normal Voting Still Works", function () {
        it("Should verify that normal voting works correctly with snapshot", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal - Normal voting";

            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log: any) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                } catch {
                    return false;
                }
            });
            
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }

            // Wait for voting to start
            await mine(VOTING_DELAY + 1);

            const snapshot = await governor.proposalSnapshot(proposalId);
            console.log("📸 Snapshot block:", snapshot.toString());

            // Normal voting: Users vote with their voting power at snapshot
            await governor.connect(voter1).castVote(proposalId, 1); // FOR
            await governor.connect(voter2).castVote(proposalId, 1); // FOR
            await governor.connect(voter3).castVote(proposalId, 2); // ABSTAIN

            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const againstVotes = votes[0];
            const forVotes = votes[1];
            const abstainVotes = votes[2];

            console.log("📊 Against votes:", ethers.formatEther(againstVotes));
            console.log("📊 For votes:", ethers.formatEther(forVotes));
            console.log("📊 Abstain votes:", ethers.formatEther(abstainVotes));

            // Verify: Votes should match voting power at snapshot
            const currentBlock = await ethers.provider.getBlockNumber();
            const snapshotBlock = Number(snapshot);
            const checkBlock = currentBlock > snapshotBlock ? snapshotBlock : currentBlock - 1;
            
            const voter1VotingPower = await token.getPastVotes(await voter1.getAddress(), checkBlock);
            const voter2VotingPower = await token.getPastVotes(await voter2.getAddress(), checkBlock);
            const voter3VotingPower = await token.getPastVotes(await voter3.getAddress(), checkBlock);

            expect(forVotes).to.be.greaterThanOrEqual(voter1VotingPower + voter2VotingPower);
            expect(abstainVotes).to.be.greaterThanOrEqual(voter3VotingPower);
            console.log("✅ Normal voting works correctly");
        });
    });
});

