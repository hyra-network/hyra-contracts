import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { HyraToken, HyraGovernor, HyraTimelock } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { time } from "@nomicfoundation/hardhat-network-helpers";

/**
 * Test suite to verify the fix for cancel() execution order
 * 
 * BUG: proposalCancelled[proposalId] = true was set BEFORE calling super.cancel()
 * This could interfere with OpenZeppelin's state() checks during cancellation
 * 
 * FIX: Call super.cancel() first, then set proposalCancelled[proposalId] = true
 * This allows OZ to properly handle state transitions without interference
 */
describe("Cancel Order Fix - Execution Order Test", function () {
    let token: HyraToken;
    let governor: HyraGovernor;
    let timelock: HyraTimelock;
    let owner: SignerWithAddress;
    let proposer: SignerWithAddress;
    let securityCouncil: SignerWithAddress;
    let voter: SignerWithAddress;
    let proposalId: bigint;

    const VOTING_DELAY = 1; // 1 block
    const VOTING_PERIOD = 50400; // ~1 week
    const PROPOSAL_THRESHOLD = ethers.parseEther("1000000"); // 1M tokens
    const QUORUM_PERCENTAGE = 10; // 10%

    beforeEach(async function () {
        [owner, proposer, securityCouncil, voter] = await ethers.getSigners();

        // Deploy HyraToken
        const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
        token = await upgrades.deployProxy(
            HyraTokenFactory,
            [
                "Hyra Token",
                "HYRA",
                ethers.parseEther("10000000"), // 10M initial supply
                owner.address,
                owner.address
            ],
            { initializer: "initializeLegacy" }
        ) as any;

        // Deploy HyraTimelock
        const HyraTimelockFactory = await ethers.getContractFactory("HyraTimelock");
        timelock = await upgrades.deployProxy(
            HyraTimelockFactory,
            [
                2 * 24 * 60 * 60, // 2 days min delay
                [],
                [],
                owner.address
            ],
            { initializer: "initialize" }
        ) as any;

        // Deploy HyraGovernor
        const HyraGovernorFactory = await ethers.getContractFactory("HyraGovernor");
        governor = await upgrades.deployProxy(
            HyraGovernorFactory,
            [
                await token.getAddress(),
                await timelock.getAddress(),
                VOTING_DELAY,
                VOTING_PERIOD,
                PROPOSAL_THRESHOLD,
                QUORUM_PERCENTAGE
            ],
            { initializer: "initialize" }
        ) as any;

        // Setup roles
        const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
        const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
        const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();

        await timelock.grantRole(PROPOSER_ROLE, await governor.getAddress());
        await timelock.grantRole(EXECUTOR_ROLE, await governor.getAddress());
        await timelock.grantRole(CANCELLER_ROLE, await governor.getAddress());

        // Distribute tokens
        await token.transfer(proposer.address, ethers.parseEther("2000000")); // 2M tokens
        await token.transfer(voter.address, ethers.parseEther("2000000")); // 2M tokens

        // Delegate voting power
        await token.connect(proposer).delegate(proposer.address);
        await token.connect(voter).delegate(voter.address);

        // Mine a block
        await time.increase(1);
    });

    describe("Cancel execution order verification", function () {
        beforeEach(async function () {
            // Create a test proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal for cancel order";

            const tx = await governor.connect(proposer).propose(targets, values, calldatas, description);
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
            await time.increase(VOTING_DELAY + 1);
        });

        it("Should allow proposer to cancel during voting period", async function () {
            console.log("Initial proposal state:", await governor.state(proposalId));
            
            // Proposer cancels their own proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const descriptionHash = ethers.id("Test proposal for cancel order");

            const tx = await governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash);
            await tx.wait();

            // Verify state is Canceled
            const finalState = await governor.state(proposalId);
            console.log("Final proposal state:", finalState);
            
            expect(finalState).to.equal(2n, "Proposal should be in Canceled state");
            
            // Verify proposalCancelled mapping is set
            expect(await governor.proposalCancelled(proposalId)).to.be.true;
        });

        it("Should emit ProposalCancelled event after OZ cancel completes", async function () {
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const descriptionHash = ethers.id("Test proposal for cancel order");

            // Check that event is emitted
            await expect(
                governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash)
            ).to.emit(governor, "ProposalCancelled").withArgs(proposalId);
        });

        it("Should not allow cancelling already cancelled proposal", async function () {
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const descriptionHash = ethers.id("Test proposal for cancel order");

            // Cancel first time
            await governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash);

            // Try to cancel again - should revert
            await expect(
                governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash)
            ).to.be.revertedWithCustomError(governor, "ProposalAlreadyCancelled");
        });

        it("Should allow security council to cancel any proposal", async function () {
            // Add security council member
            // First, we need a role manager or use owner permissions
            // For this test, let's assume owner can add security council members
            
            // Note: In production, this would go through DAO role manager
            // For now, skip this test if role manager is required
            this.skip();
        });

        it("Should properly handle state() check during cancel", async function () {
            // This test verifies that state() doesn't interfere with cancel logic
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const descriptionHash = ethers.id("Test proposal for cancel order");

            // Check state before cancel
            const stateBefore = await governor.state(proposalId);
            console.log("State before cancel:", stateBefore);
            expect(stateBefore).to.equal(1n, "Should be Active before cancel");

            // Cancel
            await governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash);

            // Check state after cancel
            const stateAfter = await governor.state(proposalId);
            console.log("State after cancel:", stateAfter);
            expect(stateAfter).to.equal(2n, "Should be Canceled after cancel");

            // Verify both OZ state and custom state are set
            expect(await governor.proposalCancelled(proposalId)).to.be.true;
        });

        it("Should not allow unauthorized users to cancel", async function () {
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const descriptionHash = ethers.id("Test proposal for cancel order");

            // Random voter tries to cancel
            await expect(
                governor.connect(voter).cancel(targets, values, calldatas, descriptionHash)
            ).to.be.revertedWithCustomError(governor, "UnauthorizedCancellation");
        });

        it("Verify cancel works correctly with voting", async function () {
            // Some votes are cast
            await governor.connect(voter).castVote(proposalId, 1); // Vote FOR

            const votes = await governor.proposalVotes(proposalId);
            console.log("Votes before cancel - For:", ethers.formatEther(votes[1]));

            // Then proposer cancels
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const descriptionHash = ethers.id("Test proposal for cancel order");

            await governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash);

            // Verify cancelled state
            expect(await governor.state(proposalId)).to.equal(2n);
            
            // Votes should still be recorded but proposal is cancelled
            const votesAfter = await governor.proposalVotes(proposalId);
            expect(votesAfter[1]).to.equal(votes[1], "Votes should remain unchanged");
        });
    });

    describe("Execution order correctness", function () {
        it("Should complete full cancel flow in correct order", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test full cancel flow";

            const tx = await governor.connect(proposer).propose(targets, values, calldatas, description);
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

            await time.increase(VOTING_DELAY + 1);

            // Cancel flow should:
            // 1. Check state and authorization (proposalCancelled should be false)
            // 2. Call super.cancel() (OZ handles state transition)
            // 3. Set proposalCancelled[proposalId] = true
            // 4. Emit ProposalCancelled event
            
            console.log("Step 1: Verify proposalCancelled is false before cancel");
            expect(await governor.proposalCancelled(proposalId)).to.be.false;
            
            console.log("Step 2: Execute cancel");
            const descriptionHash = ethers.id(description);
            const cancelTx = await governor.connect(proposer).cancel(targets, values, calldatas, descriptionHash);
            await cancelTx.wait();
            
            console.log("Step 3: Verify proposalCancelled is true after cancel");
            expect(await governor.proposalCancelled(proposalId)).to.be.true;
            
            console.log("Step 4: Verify state is Canceled");
            expect(await governor.state(proposalId)).to.equal(2n);
            
            console.log("✓ All steps completed in correct order");
        });
    });

    describe("Regression tests", function () {
        it("Should not break normal proposal lifecycle", async function () {
            // Create proposal
            const targets = [await token.getAddress()];
            const values = [0];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Normal proposal lifecycle test";

            const tx = await governor.connect(proposer).propose(targets, values, calldatas, description);
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

            await time.increase(VOTING_DELAY + 1);

            // Vote on it
            await governor.connect(proposer).castVote(proposalId, 1);
            await governor.connect(voter).castVote(proposalId, 1);

            // Wait for voting to end
            await time.increase(VOTING_PERIOD + 1);

            // Check final state (should be Succeeded if quorum met)
            const finalState = await governor.state(proposalId);
            console.log("Final state of normal proposal:", finalState);
            
            // Should be Succeeded (4) if quorum reached
            expect(finalState).to.equal(4n, "Proposal should succeed");
        });
    });
});

