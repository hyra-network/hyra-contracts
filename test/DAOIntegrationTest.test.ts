import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { HyraDAOInitializer, HyraGovernor, HyraTimelock, HyraToken, TokenVesting } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("DAO Integration Tests", function () {
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let user3: SignerWithAddress;
  let securityCouncil1: SignerWithAddress;
  let securityCouncil2: SignerWithAddress;
  
  let daoInitializer: HyraDAOInitializer;
  let deploymentResult: any;

  beforeEach(async function () {
    [owner, user1, user2, user3, securityCouncil1, securityCouncil2] = await ethers.getSigners();
    
    const HyraDAOInitializerFactory = await ethers.getContractFactory("HyraDAOInitializer");
    daoInitializer = await HyraDAOInitializerFactory.deploy();
  });

  describe("Complete DAO Deployment", function () {
    it("Should deploy and initialize complete DAO system", async function () {
      const config = {
        tokenName: "Hyra Governance Token",
        tokenSymbol: "HYRA",
        initialSupply: ethers.parseEther("50000000"), // 50M tokens
        vestingContract: owner.address, // Will be replaced by vesting proxy
        timelockDelay: 86400 * 2, // 2 days
        votingDelay: 1, // 1 block
        votingPeriod: 100, // 100 blocks
        proposalThreshold: ethers.parseEther("100000"), // 100K tokens
        quorumPercentage: 1000, // 10%
        securityCouncil: [securityCouncil1.address, securityCouncil2.address],
        multisigSigners: [owner.address, user1.address, user2.address],
        requiredSignatures: 2,
        vestingConfig: {
          beneficiaries: [user1.address, user2.address, user3.address],
          amounts: [
            ethers.parseEther("5000000"), // 5M tokens
            ethers.parseEther("3000000"), // 3M tokens
            ethers.parseEther("2000000")  // 2M tokens
          ],
          startTimes: [
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000) + 86400 * 30, // 30 days later
            Math.floor(Date.now() / 1000) + 86400 * 60  // 60 days later
          ],
          durations: [
            86400 * 365 * 2, // 2 years
            86400 * 365 * 3, // 3 years
            86400 * 365 * 4  // 4 years
          ],
          cliffs: [
            86400 * 180, // 6 months
            86400 * 365, // 1 year
            86400 * 365  // 1 year
          ],
          revocable: [true, true, false],
          purposes: ["Team vesting", "Advisor vesting", "Community vesting"]
        }
      };

      const tx = await daoInitializer.deployDAO(config);
      const receipt = await tx.wait();
      
      // Extract deployment result from events
      const event = receipt?.logs.find(log => {
        try {
          const parsed = daoInitializer.interface.parseLog(log);
          return parsed?.name === "DAODeployed";
        } catch {
          return false;
        }
      });

      expect(event).to.not.be.undefined;
      
      if (event) {
        const parsed = daoInitializer.interface.parseLog(event);
        deploymentResult = parsed?.args.result;
        
        expect(deploymentResult.tokenProxy).to.not.equal(ethers.ZeroAddress);
        expect(deploymentResult.governorProxy).to.not.equal(ethers.ZeroAddress);
        expect(deploymentResult.timelockProxy).to.not.equal(ethers.ZeroAddress);
        expect(deploymentResult.vestingProxy).to.not.equal(ethers.ZeroAddress);
        expect(deploymentResult.proxyAdmin).to.not.equal(ethers.ZeroAddress);
        expect(deploymentResult.proxyDeployer).to.not.equal(ethers.ZeroAddress);
        expect(deploymentResult.executorManager).to.not.equal(ethers.ZeroAddress);
        expect(deploymentResult.proxyAdminValidator).to.not.equal(ethers.ZeroAddress);
      }
    });

    it("Should have correct token configuration", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const token = await ethers.getContractAt("HyraToken", deploymentResult.tokenProxy);
      
      expect(await token.name()).to.equal("Hyra Governance Token");
      expect(await token.symbol()).to.equal("HYRA");
      expect(await token.totalSupply()).to.equal(ethers.parseEther("50000000"));
      expect(await token.owner()).to.equal(deploymentResult.timelockProxy);
    });

    it("Should have correct governance configuration", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const governor = await ethers.getContractAt("HyraGovernor", deploymentResult.governorProxy);
      
      expect(await governor.votingDelay()).to.equal(1);
      expect(await governor.votingPeriod()).to.equal(100);
      expect(await governor.proposalThreshold()).to.equal(ethers.parseEther("100000"));
    });

    it("Should have correct timelock configuration", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const timelock = await ethers.getContractAt("HyraTimelock", deploymentResult.timelockProxy);
      
      expect(await timelock.getMinDelay()).to.equal(86400 * 2); // 2 days
    });
  });

  describe("Vesting System Integration", function () {
    it("Should create vesting schedules correctly", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const vesting = await ethers.getContractAt("TokenVesting", deploymentResult.vestingProxy);
      const token = await ethers.getContractAt("HyraToken", deploymentResult.tokenProxy);

      // Check that vesting contract has tokens
      const vestingBalance = await token.balanceOf(deploymentResult.vestingProxy);
      expect(vestingBalance).to.equal(ethers.parseEther("50000000")); // All initial supply

      // Check vesting schedules
      const schedule1 = await vesting.getVestingSchedule(user1.address, 0);
      expect(schedule1.totalAmount).to.equal(ethers.parseEther("5000000"));

      const schedule2 = await vesting.getVestingSchedule(user2.address, 0);
      expect(schedule2.totalAmount).to.equal(ethers.parseEther("3000000"));

      const schedule3 = await vesting.getVestingSchedule(user3.address, 0);
      expect(schedule3.totalAmount).to.equal(ethers.parseEther("2000000"));
    });

    it("Should allow token release after cliff period", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const vesting = await ethers.getContractAt("TokenVesting", deploymentResult.vestingProxy);
      const token = await ethers.getContractAt("HyraToken", deploymentResult.tokenProxy);

      // Fast forward past cliff period for user1 (6 months)
      await time.increase(86400 * 180 + 1);

      // User1 should be able to release some tokens
      const releasableAmount = await vesting.getReleasableAmount(user1.address, 0);
      expect(releasableAmount).to.be.gt(0);

      // Release tokens
      await vesting.connect(user1).release(user1.address, 0);
      
      const user1Balance = await token.balanceOf(user1.address);
      expect(user1Balance).to.be.gt(0);
    });
  });

  describe("Governance System Integration", function () {
    it("Should allow proposal creation and voting", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const governor = await ethers.getContractAt("HyraGovernor", deploymentResult.governorProxy);
      const token = await ethers.getContractAt("HyraToken", deploymentResult.tokenProxy);

      // User1 needs tokens to create proposal
      await token.connect(user1).transfer(user1.address, ethers.parseEther("200000")); // More than threshold

      // Create proposal
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [token.interface.encodeFunctionData("transfer", [user2.address, ethers.parseEther("1000")])];
      const description = "Transfer 1000 tokens to user2";

      const proposalId = await governor.connect(user1).propose(targets, values, calldatas, description);
      
      // Fast forward to voting period
      await time.increase(1);
      await time.advanceBlock();

      // Vote on proposal
      await governor.connect(user1).castVote(proposalId, 1); // For
      await governor.connect(user2).castVote(proposalId, 1); // For

      // Fast forward past voting period
      await time.increase(100);
      await time.advanceBlock();

      // Queue proposal
      await governor.queue(targets, values, calldatas, ethers.id(description));

      // Fast forward past timelock delay
      await time.increase(86400 * 2 + 1);

      // Execute proposal
      await governor.execute(targets, values, calldatas, ethers.id(description));

      // Verify execution
      const user2Balance = await token.balanceOf(user2.address);
      expect(user2Balance).to.equal(ethers.parseEther("1000"));
    });

    it("Should handle emergency proposals by security council", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const governor = await ethers.getContractAt("HyraGovernor", deploymentResult.governorProxy);
      const token = await ethers.getContractAt("HyraToken", deploymentResult.tokenProxy);

      // Security council member creates emergency proposal
      const targets = [await token.getAddress()];
      const values = [0];
      const calldatas = [token.interface.encodeFunctionData("pause")];
      const description = "Emergency pause";

      const proposalId = await governor.connect(securityCouncil1).proposeWithType(
        targets,
        values,
        calldatas,
        description,
        1 // EMERGENCY type
      );

      // Emergency proposals should have different quorum requirements
      const quorum = await governor.getProposalQuorum(proposalId);
      expect(quorum).to.be.gt(0);
    });
  });

  describe("Proxy System Integration", function () {
    it("Should allow proxy upgrades through governance", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const governor = await ethers.getContractAt("HyraGovernor", deploymentResult.governorProxy);
      const timelock = await ethers.getContractAt("HyraTimelock", deploymentResult.timelockProxy);
      const proxyAdmin = await ethers.getContractAt("SecureProxyAdmin", deploymentResult.proxyAdmin);

      // Deploy new implementation
      const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
      const newImplementation = await HyraTokenFactory.deploy();

      // Create upgrade proposal
      const targets = [deploymentResult.timelockProxy];
      const values = [0];
      const calldatas = [
        timelock.interface.encodeFunctionData("scheduleUpgrade", [
          deploymentResult.tokenProxy,
          await newImplementation.getAddress(),
          "0x",
          false
        ])
      ];
      const description = "Upgrade token implementation";

      const proposalId = await governor.propose(targets, values, calldatas, description);

      // Fast forward through voting and execution
      await time.increase(100);
      await time.advanceBlock();
      await governor.queue(targets, values, calldatas, ethers.id(description));
      await time.increase(86400 * 2 + 1);
      await governor.execute(targets, values, calldatas, ethers.id(description));

      // Execute upgrade
      await timelock.executeUpgrade(deploymentResult.proxyAdmin, deploymentResult.tokenProxy);

      // Verify upgrade
      const currentImplementation = await proxyAdmin.getProxyImplementation(deploymentResult.tokenProxy);
      expect(currentImplementation).to.equal(await newImplementation.getAddress());
    });
  });

  describe("Security Features Integration", function () {
    it("Should prevent unauthorized access", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const timelock = await ethers.getContractAt("HyraTimelock", deploymentResult.timelockProxy);
      const proxyAdmin = await ethers.getContractAt("SecureProxyAdmin", deploymentResult.proxyAdmin);

      // Unauthorized user should not be able to schedule upgrades
      await expect(
        timelock.connect(user1).scheduleUpgrade(
          deploymentResult.tokenProxy,
          user1.address,
          "0x",
          false
        )
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");

      // Unauthorized user should not be able to execute upgrades
      await expect(
        timelock.connect(user1).executeUpgrade(
          deploymentResult.proxyAdmin,
          deploymentResult.tokenProxy
        )
      ).to.be.revertedWithCustomError(timelock, "AccessControlUnauthorizedAccount");
    });

    it("Should handle multi-signature requirements", async function () {
      if (!deploymentResult) {
        await deployDAO();
      }

      const proxyAdmin = await ethers.getContractAt("SecureProxyAdmin", deploymentResult.proxyAdmin);

      // Deploy new implementation
      const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
      const newImplementation = await HyraTokenFactory.deploy();

      // Propose upgrade
      await proxyAdmin.proposeUpgrade(
        deploymentResult.tokenProxy,
        await newImplementation.getAddress(),
        false,
        "Test upgrade"
      );

      // Sign upgrade (need 2 signatures)
      const upgradeId = await proxyAdmin.getUpgradeId(
        deploymentResult.tokenProxy,
        await newImplementation.getAddress()
      );

      await proxyAdmin.signUpgrade(upgradeId);
      await proxyAdmin.connect(user1).signUpgrade(upgradeId);

      // Fast forward past delay
      await time.increase(86400 * 2 + 1);

      // Execute upgrade
      await proxyAdmin.executeUpgrade(deploymentResult.tokenProxy);

      // Verify upgrade
      const currentImplementation = await proxyAdmin.getProxyImplementation(deploymentResult.tokenProxy);
      expect(currentImplementation).to.equal(await newImplementation.getAddress());
    });
  });

  describe("Error Handling and Edge Cases", function () {
    it("Should handle invalid configurations gracefully", async function () {
      const invalidConfig = {
        tokenName: "", // Empty name
        tokenSymbol: "HYRA",
        initialSupply: ethers.parseEther("1000000"),
        vestingContract: owner.address,
        timelockDelay: 86400,
        votingDelay: 1,
        votingPeriod: 100,
        proposalThreshold: ethers.parseEther("1000"),
        quorumPercentage: 1000,
        securityCouncil: [owner.address],
        multisigSigners: [owner.address],
        requiredSignatures: 1,
        vestingConfig: {
          beneficiaries: [user1.address],
          amounts: [ethers.parseEther("1000")],
          startTimes: [Math.floor(Date.now() / 1000)],
          durations: [86400 * 365],
          cliffs: [86400 * 30],
          revocable: [true],
          purposes: ["Test"]
        }
      };

      await expect(
        daoInitializer.deployDAO(invalidConfig)
      ).to.be.revertedWithCustomError(daoInitializer, "InvalidConfig");
    });

    it("Should handle array length mismatches", async function () {
      const invalidConfig = {
        tokenName: "Test Token",
        tokenSymbol: "TEST",
        initialSupply: ethers.parseEther("1000000"),
        vestingContract: owner.address,
        timelockDelay: 86400,
        votingDelay: 1,
        votingPeriod: 100,
        proposalThreshold: ethers.parseEther("1000"),
        quorumPercentage: 1000,
        securityCouncil: [owner.address],
        multisigSigners: [owner.address],
        requiredSignatures: 1,
        vestingConfig: {
          beneficiaries: [user1.address, user2.address], // 2 beneficiaries
          amounts: [ethers.parseEther("1000")], // 1 amount
          startTimes: [Math.floor(Date.now() / 1000)],
          durations: [86400 * 365],
          cliffs: [86400 * 30],
          revocable: [true],
          purposes: ["Test"]
        }
      };

      await expect(
        daoInitializer.deployDAO(invalidConfig)
      ).to.be.revertedWith("Invalid vesting config");
    });
  });

  // Helper function to deploy DAO
  async function deployDAO() {
    const config = {
      tokenName: "Hyra Governance Token",
      tokenSymbol: "HYRA",
      initialSupply: ethers.parseEther("50000000"),
      vestingContract: owner.address,
      timelockDelay: 86400 * 2,
      votingDelay: 1,
      votingPeriod: 100,
      proposalThreshold: ethers.parseEther("100000"),
      quorumPercentage: 1000,
      securityCouncil: [securityCouncil1.address, securityCouncil2.address],
      multisigSigners: [owner.address, user1.address, user2.address],
      requiredSignatures: 2,
      vestingConfig: {
        beneficiaries: [user1.address, user2.address, user3.address],
        amounts: [
          ethers.parseEther("5000000"),
          ethers.parseEther("3000000"),
          ethers.parseEther("2000000")
        ],
        startTimes: [
          Math.floor(Date.now() / 1000),
          Math.floor(Date.now() / 1000) + 86400 * 30,
          Math.floor(Date.now() / 1000) + 86400 * 60
        ],
        durations: [
          86400 * 365 * 2,
          86400 * 365 * 3,
          86400 * 365 * 4
        ],
        cliffs: [
          86400 * 180,
          86400 * 365,
          86400 * 365
        ],
        revocable: [true, true, false],
        purposes: ["Team vesting", "Advisor vesting", "Community vesting"]
      }
    };

    const tx = await daoInitializer.deployDAO(config);
    const receipt = await tx.wait();
    
    const event = receipt?.logs.find(log => {
      try {
        const parsed = daoInitializer.interface.parseLog(log);
        return parsed?.name === "DAODeployed";
      } catch {
        return false;
      }
    });

    if (event) {
      const parsed = daoInitializer.interface.parseLog(event);
      deploymentResult = parsed?.args.result;
    }
  }
});
