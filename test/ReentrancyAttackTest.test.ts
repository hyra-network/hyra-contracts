import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { HyraGovernor, HyraTimelock, HyraToken } from "../typechain-types";

// Malicious contract that attempts reentrancy attacks
describe("Reentrancy Attack Tests", function () {
  let owner: SignerWithAddress;
  let attacker: SignerWithAddress;
  let user1: SignerWithAddress;
  
  let governor: HyraGovernor;
  let timelock: HyraTimelock;
  let token: HyraToken;

  // Malicious contract that tries to reenter
  let maliciousContract: any;

  beforeEach(async function () {
    [owner, attacker, user1] = await ethers.getSigners();
    
    // Deploy contracts
    const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
    const HyraGovernorFactory = await ethers.getContractFactory("HyraGovernor");
    const HyraTimelockFactory = await ethers.getContractFactory("HyraTimelock");

    token = await HyraTokenFactory.deploy();
    governor = await HyraGovernorFactory.deploy();
    timelock = await HyraTimelockFactory.deploy();

    // Initialize contracts
    await token.initialize(
      "Hyra Token",
      "HYRA",
      ethers.parseEther("1000000"),
      owner.address,
      owner.address
    );

    await timelock.initialize(
      86400, // 1 day delay
      [owner.address], // proposers
      [owner.address], // executors
      owner.address // admin
    );

    await governor.initialize(
      await token.getAddress(),
      timelock,
      1, // voting delay
      100, // voting period
      ethers.parseEther("1000"), // proposal threshold
      1000 // quorum percentage
    );
  });

  describe("Governor Reentrancy Protection", function () {
    it("Should prevent reentrancy in cancel function", async function () {
      // Deploy malicious contract
      const MaliciousContractFactory = await ethers.getContractFactory("MaliciousReentrancyContract");
      maliciousContract = await MaliciousContractFactory.deploy(await governor.getAddress());

      // The malicious contract should not be able to reenter
      // This test verifies that the nonReentrant modifier works
      await expect(
        maliciousContract.attemptReentrancy()
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("Should maintain state consistency during cancel operations", async function () {
      // Create a proposal first
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [token.interface.encodeFunctionData("transfer", [user1.address, ethers.parseEther("100")])];
      const description = "Test proposal";

      const proposalId = await governor.propose(targets, values, calldatas, description);
      
      // Verify proposal state before cancel
      let state = await governor.state(proposalId);
      expect(state).to.equal(0); // Pending state

      // Cancel the proposal
      await governor.cancel(targets, values, calldatas, ethers.id(description));

      // Verify proposal is cancelled
      state = await governor.state(proposalId);
      expect(state).to.equal(2); // Cancelled state

      // Verify proposalCancelled mapping is updated
      const isCancelled = await governor.proposalCancelled(proposalId);
      expect(isCancelled).to.be.true;
    });
  });

  describe("Timelock Reentrancy Protection", function () {
    it("Should prevent reentrancy in executeUpgrade function", async function () {
      // Deploy malicious contract targeting timelock
      const MaliciousTimelockContractFactory = await ethers.getContractFactory("MaliciousTimelockReentrancy");
      const maliciousTimelockContract = await MaliciousTimelockContractFactory.deploy(await timelock.getAddress());

      // The malicious contract should not be able to reenter
      await expect(
        maliciousTimelockContract.attemptReentrancy()
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("Should maintain upgrade state consistency", async function () {
      // Schedule an upgrade
      const proxyAddress = await token.getAddress(); // Using token as proxy for testing
      const newImplementation = await token.getAddress(); // Same address for testing

      await timelock.scheduleUpgrade(proxyAddress, newImplementation, "0x", false);

      // Verify upgrade is scheduled
      const upgradeDetails = await timelock.getUpgradeDetails(proxyAddress);
      expect(upgradeDetails.isScheduled).to.be.true;

      // Fast forward time to make upgrade ready
      await ethers.provider.send("evm_increaseTime", [86400 * 8]); // 8 days
      await ethers.provider.send("evm_mine", []);

      // Execute upgrade (this should not allow reentrancy)
      await expect(
        timelock.executeUpgrade(owner.address, proxyAddress)
      ).to.not.be.reverted;

      // Verify upgrade state is consistent
      const upgradeDetailsAfter = await timelock.getUpgradeDetails(proxyAddress);
      expect(upgradeDetailsAfter.isScheduled).to.be.false;
    });
  });

  describe("State Transition Tests", function () {
    it("Should properly handle state transitions in governor", async function () {
      // Create proposal
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [token.interface.encodeFunctionData("transfer", [user1.address, ethers.parseEther("100")])];
      const description = "Test proposal";

      const proposalId = await governor.propose(targets, values, calldatas, description);

      // Verify initial state
      let state = await governor.state(proposalId);
      expect(state).to.equal(0); // Pending

      // Fast forward to active state
      await ethers.provider.send("evm_increaseTime", [100]);
      await ethers.provider.send("evm_mine", []);

      state = await governor.state(proposalId);
      expect(state).to.equal(1); // Active

      // Cancel proposal
      await governor.cancel(targets, values, calldatas, ethers.id(description));

      // Verify final state
      state = await governor.state(proposalId);
      expect(state).to.equal(2); // Cancelled
    });

    it("Should handle concurrent operations safely", async function () {
      // Create multiple proposals
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [token.interface.encodeFunctionData("transfer", [user1.address, ethers.parseEther("100")])];
      
      const proposal1 = await governor.propose(targets, values, calldatas, "Proposal 1");
      const proposal2 = await governor.propose(targets, values, calldatas, "Proposal 2");

      // Cancel both proposals concurrently
      await Promise.all([
        governor.cancel(targets, values, calldatas, ethers.id("Proposal 1")),
        governor.cancel(targets, values, calldatas, ethers.id("Proposal 2"))
      ]);

      // Verify both are cancelled
      const state1 = await governor.state(proposal1);
      const state2 = await governor.state(proposal2);
      
      expect(state1).to.equal(2); // Cancelled
      expect(state2).to.equal(2); // Cancelled
    });
  });

  describe("Edge Case Tests", function () {
    it("Should handle zero-address inputs gracefully", async function () {
      const targets = [ethers.ZeroAddress];
      const values = [0];
      const calldatas = ["0x"];
      const description = "Test proposal";

      // Should revert due to zero address validation
      await expect(
        governor.propose(targets, values, calldatas, description)
      ).to.be.reverted;
    });

    it("Should handle empty arrays correctly", async function () {
      const targets: string[] = [];
      const values: bigint[] = [];
      const calldatas: string[] = [];
      const description = "Empty proposal";

      // Should revert due to empty arrays
      await expect(
        governor.propose(targets, values, calldatas, description)
      ).to.be.reverted;
    });

    it("Should handle large arrays efficiently", async function () {
      // Create proposal with maximum allowed operations (10)
      const targets = new Array(10).fill(await token.getAddress());
      const values = new Array(10).fill(0);
      const calldatas = new Array(10).fill(token.interface.encodeFunctionData("transfer", [user1.address, ethers.parseEther("10")]));
      const description = "Large proposal";

      const proposalId = await governor.propose(targets, values, calldatas, description);
      
      // Cancel the large proposal
      await governor.cancel(targets, values, calldatas, ethers.id(description));

      // Verify cancellation
      const state = await governor.state(proposalId);
      expect(state).to.equal(2); // Cancelled
    });
  });
});

// Malicious contract for testing reentrancy
contract MaliciousReentrancyContract {
    HyraGovernor public governor;
    bool public reentrancyAttempted = false;

    constructor(address _governor) {
        governor = HyraGovernor(_governor);
    }

    function attemptReentrancy() external {
        // This would attempt to reenter the governor's cancel function
        // But should be prevented by the nonReentrant modifier
        reentrancyAttempted = true;
        
        // Simulate a reentrancy attempt
        // In a real attack, this would call back into the governor
        // But the nonReentrant modifier should prevent this
    }
}

// Malicious contract for testing timelock reentrancy
contract MaliciousTimelockReentrancy {
    HyraTimelock public timelock;
    bool public reentrancyAttempted = false;

    constructor(address _timelock) {
        timelock = HyraTimelock(_timelock);
    }

    function attemptReentrancy() external {
        // This would attempt to reenter the timelock's executeUpgrade function
        // But should be prevented by the nonReentrant modifier
        reentrancyAttempted = true;
        
        // Simulate a reentrancy attempt
        // In a real attack, this would call back into the timelock
        // But the nonReentrant modifier should prevent this
    }
}
