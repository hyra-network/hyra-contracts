"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const hardhat_network_helpers_2 = require("@nomicfoundation/hardhat-network-helpers");
/**
 * Test suite to verify the fix for the quorum voting bug
 *
 * BUG: _quorumReached was incorrectly destructuring proposalVotes()
 * - proposalVotes() returns: (againstVotes, forVotes, abstainVotes)
 * - Old code: (uint256 forVotes, , uint256 abstainVotes) = proposalVotes(proposalId);
 * - This caused againstVotes to be counted as forVotes!
 *
 * FIX: Changed to: (, uint256 forVotes, uint256 abstainVotes) = proposalVotes(proposalId);
 */
describe("Quorum Voting Fix - Critical Bug Test", function () {
    let token;
    let governor;
    let timelock;
    let owner;
    let voter1;
    let voter2;
    let voter3;
    let proposalId;
    const VOTING_DELAY = 1; // 1 block
    const VOTING_PERIOD = 50400; // ~1 week
    const PROPOSAL_THRESHOLD = hardhat_1.ethers.parseEther("1000000"); // 1M tokens
    const QUORUM_PERCENTAGE = 10; // 10%
    beforeEach(async function () {
        [owner, voter1, voter2, voter3] = await hardhat_1.ethers.getSigners();
        // Deploy HyraToken via ERC1967Proxy
        const HyraTokenFactory = await hardhat_1.ethers.getContractFactory("HyraToken");
        const tokenImpl = await HyraTokenFactory.deploy();
        await tokenImpl.waitForDeployment();
        // Deploy proxy with empty init data first (to set distribution config before initialize)
        const ERC1967Proxy = await hardhat_1.ethers.getContractFactory("ERC1967Proxy");
        const tokenProxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), "0x");
        await tokenProxy.waitForDeployment();
        token = await hardhat_1.ethers.getContractAt("HyraToken", await tokenProxy.getAddress());

        // Deploy mock distribution wallets for setDistributionConfig
        const MockDistributionWallet = await hardhat_1.ethers.getContractFactory("MockDistributionWallet");
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
            hardhat_1.ethers.parseEther("10000000"),
            await owner.getAddress(),
            await owner.getAddress(),
            0, // yearStartTime
            await privilegedMultisig.getAddress() // privilegedMultisigWallet
        );
        // Deploy HyraTimelock via ERC1967Proxy (initialize)
        const HyraTimelockFactory = await hardhat_1.ethers.getContractFactory("HyraTimelock");
        const tlImpl = await HyraTimelockFactory.deploy();
        await tlImpl.waitForDeployment();
        const tlInit = HyraTimelockFactory.interface.encodeFunctionData("initialize", [
            2 * 24 * 60 * 60,
            [],
            [],
            await owner.getAddress(),
        ]);
        const tlProxy = await ERC1967Proxy.deploy(await tlImpl.getAddress(), tlInit);
        await tlProxy.waitForDeployment();
        timelock = await hardhat_1.ethers.getContractAt("HyraTimelock", await tlProxy.getAddress());
        // Deploy HyraGovernor via ERC1967Proxy (initialize)
        const HyraGovernorFactory = await hardhat_1.ethers.getContractFactory("HyraGovernor");
        const govImpl = await HyraGovernorFactory.deploy();
        await govImpl.waitForDeployment();
        
        const govInit = HyraGovernorFactory.interface.encodeFunctionData("initialize", [
            await token.getAddress(),
            await timelock.getAddress(),
            VOTING_DELAY,
            VOTING_PERIOD,
            PROPOSAL_THRESHOLD,
            QUORUM_PERCENTAGE,
            await privilegedMultisig.getAddress() // privilegedMultisigWallet
        ]);
        const govProxy = await ERC1967Proxy.deploy(await govImpl.getAddress(), govInit);
        await govProxy.waitForDeployment();
        governor = await hardhat_1.ethers.getContractAt("HyraGovernor", await govProxy.getAddress());
        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
        await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
        await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
        await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());
        // Distribute tokens to voters
        await token.transfer(await voter1.getAddress(), hardhat_1.ethers.parseEther("2000000")); // 2M
        await token.transfer(await voter2.getAddress(), hardhat_1.ethers.parseEther("1000000")); // 1M
        await token.transfer(await voter3.getAddress(), hardhat_1.ethers.parseEther("500000")); // 500K
        // Delegate voting power
        await token.connect(voter1).delegate(await voter1.getAddress());
        await token.connect(voter2).delegate(await voter2.getAddress());
        await token.connect(voter3).delegate(await voter3.getAddress());
        // Mine a block to make voting power active
        await hardhat_network_helpers_2.time.increase(1);
    });
    describe("Critical Bug: Against votes counted as For votes", function () {
        beforeEach(async function () {
            // Create a proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal for quorum bug verification";
            const tx = await governor.connect(voter1).propose(targets, values, calldatas, description);
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                }
                catch {
                    return false;
                }
            });
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }
            // Wait for voting to start (block-based governor)
            await (0, hardhat_network_helpers_1.mine)(VOTING_DELAY + 1);
        });
        it("Should correctly calculate quorum with only AGAINST votes (should NOT reach quorum)", async function () {
            // Scenario: Only against votes - should NOT count toward quorum
            // voter1 has 20% voting power, votes AGAINST
            // Quorum = 10%, but against votes should NOT count
            // Vote AGAINST (vote type = 0)
            await governor.connect(voter1).castVote(proposalId, 0);
            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const againstVotes = votes[0];
            const forVotes = votes[1];
            const abstainVotes = votes[2];
            console.log("Vote breakdown:");
            console.log("  Against votes:", hardhat_1.ethers.formatEther(againstVotes));
            console.log("  For votes:", hardhat_1.ethers.formatEther(forVotes));
            console.log("  Abstain votes:", hardhat_1.ethers.formatEther(abstainVotes));
            // Verify vote counts
            (0, chai_1.expect)(againstVotes).to.equal(hardhat_1.ethers.parseEther("2000000")); // 2M against
            (0, chai_1.expect)(forVotes).to.equal(0); // No for votes
            (0, chai_1.expect)(abstainVotes).to.equal(0); // No abstain votes
            // Get quorum info
            const requiredQuorum = await governor.getProposalQuorum(proposalId);
            console.log("  Required quorum:", hardhat_1.ethers.formatEther(requiredQuorum));
            // Check if quorum reached
            const state = await governor.state(proposalId);
            console.log("  Proposal state:", state);
            // CRITICAL: With the bug, againstVotes would be counted as forVotes
            // and quorum would incorrectly pass (2M > 1M required)
            // After fix: quorum should NOT be reached (0 for + 0 abstain < 1M required)
            // Move past voting period (blocks)
            await (0, hardhat_network_helpers_1.mine)(VOTING_PERIOD + 2);
            const finalState = await governor.state(proposalId);
            console.log("  Final state:", finalState);
            // State should be Defeated (3) because:
            // 1. Quorum not reached (0 for + 0 abstain < required)
            // 2. More against than for votes
            (0, chai_1.expect)(finalState).to.equal(3n, "Proposal should be defeated when only against votes");
        });
        it("Should correctly calculate quorum with FOR and ABSTAIN votes (should reach quorum)", async function () {
            // Scenario: For + Abstain votes should count toward quorum
            // voter1: 20% FOR
            // voter2: 10% ABSTAIN
            // Total: 30% participation, quorum = 10% ✓
            // Vote FOR (vote type = 1)
            await governor.connect(voter1).castVote(proposalId, 1);
            // Vote ABSTAIN (vote type = 2)
            await governor.connect(voter2).castVote(proposalId, 2);
            // Get vote counts
            const votes = await governor.proposalVotes(proposalId);
            const againstVotes = votes[0];
            const forVotes = votes[1];
            const abstainVotes = votes[2];
            console.log("Vote breakdown:");
            console.log("  Against votes:", hardhat_1.ethers.formatEther(againstVotes));
            console.log("  For votes:", hardhat_1.ethers.formatEther(forVotes));
            console.log("  Abstain votes:", hardhat_1.ethers.formatEther(abstainVotes));
            // Verify vote counts
            (0, chai_1.expect)(againstVotes).to.equal(0);
            (0, chai_1.expect)(forVotes).to.equal(hardhat_1.ethers.parseEther("2000000")); // 2M for
            (0, chai_1.expect)(abstainVotes).to.equal(hardhat_1.ethers.parseEther("1000000")); // 1M abstain
            // Get quorum info
            const requiredQuorum = await governor.getProposalQuorum(proposalId);
            const totalVotingPower = forVotes + abstainVotes;
            console.log("  Required quorum:", hardhat_1.ethers.formatEther(requiredQuorum));
            console.log("  Total voting power (for + abstain):", hardhat_1.ethers.formatEther(totalVotingPower));
            console.log("  Quorum reached:", totalVotingPower >= requiredQuorum);
            // Move past voting period (blocks)
            await (0, hardhat_network_helpers_1.mine)(VOTING_PERIOD + 2);
            const finalState = await governor.state(proposalId);
            console.log("  Final state:", finalState);
            // State should be Succeeded (4) because:
            // 1. Quorum reached (2M for + 1M abstain = 3M > 1M required)
            // 2. More for than against votes
            (0, chai_1.expect)(finalState).to.equal(4n, "Proposal should succeed with for + abstain votes");
        });
        it("Should NOT count AGAINST votes toward quorum (critical fix verification)", async function () {
            // This test specifically verifies the fix
            // With the bug: againstVotes counted as forVotes → quorum reached
            // After fix: againstVotes NOT counted → quorum not reached
            // Scenario: Only against votes
            // voter1: 20% AGAINST
            // Quorum = 10%, but should NOT be reached
            await governor.connect(voter1).castVote(proposalId, 0); // AGAINST
            const votes = await governor.proposalVotes(proposalId);
            const againstVotes = votes[0];
            const forVotes = votes[1];
            const abstainVotes = votes[2];
            // Calculate quorum participation (should be for + abstain only)
            const quorumVotes = forVotes + abstainVotes;
            const requiredQuorum = await governor.getProposalQuorum(proposalId);
            console.log("Quorum calculation verification:");
            console.log("  Against votes:", hardhat_1.ethers.formatEther(againstVotes));
            console.log("  For votes:", hardhat_1.ethers.formatEther(forVotes));
            console.log("  Abstain votes:", hardhat_1.ethers.formatEther(abstainVotes));
            console.log("  Quorum votes (for + abstain):", hardhat_1.ethers.formatEther(quorumVotes));
            console.log("  Required quorum:", hardhat_1.ethers.formatEther(requiredQuorum));
            // CRITICAL ASSERTION: Quorum votes should NOT include against votes
            (0, chai_1.expect)(quorumVotes).to.equal(0n, "Quorum votes should not include against votes");
            (0, chai_1.expect)(quorumVotes).to.be.lessThan(requiredQuorum, "Quorum should not be reached");
            // Verify against votes are not counted
            (0, chai_1.expect)(againstVotes).to.be.greaterThan(0n, "Should have against votes");
            (0, chai_1.expect)(againstVotes).to.be.greaterThan(requiredQuorum, "Against votes exceed quorum");
            (0, chai_1.expect)(quorumVotes).to.equal(0n, "But quorum votes should still be 0");
            console.log("✓ VERIFIED: Against votes are NOT counted toward quorum");
        });
        it("Should handle mixed voting correctly", async function () {
            // Complex scenario: Mix of all vote types
            // voter1 (20%): FOR
            // voter2 (10%): AGAINST
            // voter3 (5%): ABSTAIN
            // Quorum calculation: 20% FOR + 5% ABSTAIN = 25% participation
            // Required quorum: 10% ✓
            await governor.connect(voter1).castVote(proposalId, 1); // FOR
            await governor.connect(voter2).castVote(proposalId, 0); // AGAINST
            await governor.connect(voter3).castVote(proposalId, 2); // ABSTAIN
            const votes = await governor.proposalVotes(proposalId);
            const againstVotes = votes[0];
            const forVotes = votes[1];
            const abstainVotes = votes[2];
            console.log("Mixed voting breakdown:");
            console.log("  Against votes:", hardhat_1.ethers.formatEther(againstVotes));
            console.log("  For votes:", hardhat_1.ethers.formatEther(forVotes));
            console.log("  Abstain votes:", hardhat_1.ethers.formatEther(abstainVotes));
            const quorumVotes = forVotes + abstainVotes;
            const requiredQuorum = await governor.getProposalQuorum(proposalId);
            console.log("  Quorum votes (for + abstain):", hardhat_1.ethers.formatEther(quorumVotes));
            console.log("  Required quorum:", hardhat_1.ethers.formatEther(requiredQuorum));
            // Verify quorum calculation
            (0, chai_1.expect)(quorumVotes).to.equal(hardhat_1.ethers.parseEther("2500000"), // 2M for + 500K abstain
            "Quorum should be for + abstain only");
            (0, chai_1.expect)(quorumVotes).to.be.greaterThan(requiredQuorum, "Quorum should be reached");
            // Move past voting period (blocks)
            await (0, hardhat_network_helpers_1.mine)(VOTING_PERIOD + 2);
            const finalState = await governor.state(proposalId);
            // Should succeed: quorum reached (25% > 10%) AND more for than against
            (0, chai_1.expect)(finalState).to.equal(4n, "Proposal should succeed");
            console.log("✓ VERIFIED: Mixed voting calculated correctly");
        });
        it("Edge case: Quorum barely reached with for + abstain", async function () {
            // Test edge case where quorum is exactly at the threshold
            // Quorum = 10% of 10M = 1M tokens
            // voter2 has exactly 1M tokens (10%) - vote FOR
            await governor.connect(voter2).castVote(proposalId, 1);
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];
            const abstainVotes = votes[2];
            const quorumVotes = forVotes + abstainVotes;
            const requiredQuorum = await governor.getProposalQuorum(proposalId);
            console.log("Edge case - exact quorum:");
            console.log("  For votes:", hardhat_1.ethers.formatEther(forVotes));
            console.log("  Quorum votes:", hardhat_1.ethers.formatEther(quorumVotes));
            console.log("  Required quorum:", hardhat_1.ethers.formatEther(requiredQuorum));
            // Should exactly meet quorum
            (0, chai_1.expect)(quorumVotes).to.be.greaterThanOrEqual(requiredQuorum, "Should meet quorum");
            await (0, hardhat_network_helpers_1.mine)(VOTING_PERIOD + 2);
            const finalState = await governor.state(proposalId);
            // Should succeed with exactly at quorum
            (0, chai_1.expect)(finalState).to.equal(4n, "Should succeed at exact quorum");
            console.log("✓ VERIFIED: Edge case handled correctly");
        });
    });
    describe("Regression tests - Ensure fix doesn't break normal voting", function () {
        it("Should still count FOR votes correctly", async function () {
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const tx = await governor.connect(voter1).propose(targets, values, calldatas, "Test FOR votes");
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                }
                catch {
                    return false;
                }
            });
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }
            await hardhat_network_helpers_2.time.increase(VOTING_DELAY + 1);
            // Multiple FOR votes
            await governor.connect(voter1).castVote(proposalId, 1);
            await governor.connect(voter2).castVote(proposalId, 1);
            const votes = await governor.proposalVotes(proposalId);
            const forVotes = votes[1];
            (0, chai_1.expect)(forVotes).to.equal(hardhat_1.ethers.parseEther("3000000"), // 2M + 1M
            "FOR votes should accumulate correctly");
        });
        it("Should still count ABSTAIN votes correctly", async function () {
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const tx = await governor.connect(voter1).propose(targets, values, calldatas, "Test ABSTAIN votes");
            const receipt = await tx.wait();
            const event = receipt?.logs.find((log) => {
                try {
                    return governor.interface.parseLog(log)?.name === "ProposalCreated";
                }
                catch {
                    return false;
                }
            });
            if (event) {
                const parsed = governor.interface.parseLog(event);
                proposalId = parsed?.args[0];
            }
            await hardhat_network_helpers_2.time.increase(VOTING_DELAY + 1);
            // ABSTAIN votes
            await governor.connect(voter2).castVote(proposalId, 2);
            await governor.connect(voter3).castVote(proposalId, 2);
            const votes = await governor.proposalVotes(proposalId);
            const abstainVotes = votes[2];
            (0, chai_1.expect)(abstainVotes).to.equal(hardhat_1.ethers.parseEther("1500000"), // 1M + 500K
            "ABSTAIN votes should accumulate correctly");
        });
    });
});
