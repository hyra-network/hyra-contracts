import { expect } from "chai";
import { ethers } from "hardhat";
import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { TokenVesting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("TokenVesting - Simple Tests", function () {
  let tokenVesting: TokenVesting;
  let token: any;
  let owner: SignerWithAddress;
  let beneficiary1: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000");
  const VESTING_AMOUNT = ethers.parseEther("100000");
  const VESTING_DURATION = 365 * 24 * 60 * 60; // 1 year
  const CLIFF_DURATION = 30 * 24 * 60 * 60; // 30 days

  async function deploySimpleFixture() {
    const [deployer, ownerAddr, beneficiary1Addr] = await ethers.getSigners();
    
    // Deploy mock ERC20 token
    const Token = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await Token.deploy();
    await tokenImpl.waitForDeployment();
    
    // Deploy proxy infrastructure
    const ProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await ProxyDeployer.deploy();
    await proxyDeployer.waitForDeployment();
    
    const ProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(await ownerAddr.getAddress());
    await proxyAdmin.waitForDeployment();
    
    // Deploy proxy with empty init data first (to set distribution config before initialize)
    const tokenProxy = await proxyDeployer.deployProxy.staticCall(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      "0x",
      "TEST"
    );
    
    await (await proxyDeployer.deployProxy(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      "0x",
      "TEST"
    )).wait();
    
    const tokenContract = await ethers.getContractAt("HyraToken", tokenProxy);

    // Deploy mock distribution wallets for setDistributionConfig
    const MockDistributionWallet = await ethers.getContractFactory("MockDistributionWallet");
    const distributionWallets = [];
    for (let i = 0; i < 6; i++) {
      const wallet = await MockDistributionWallet.deploy(await ownerAddr.getAddress());
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
    const privilegedMultisig = await MockDistributionWallet.deploy(await ownerAddr.getAddress());
    await privilegedMultisig.waitForDeployment();

    // Now initialize token
    await tokenContract.initialize(
      "Test Token",
      "TEST",
      INITIAL_SUPPLY,
      await deployer.getAddress(), // initial holder
      await ownerAddr.getAddress(), // governance
      0, // yearStartTime
      await privilegedMultisig.getAddress() // privilegedMultisigWallet
    );
    
    // Deploy TokenVesting
    const TokenVesting = await ethers.getContractFactory("TokenVesting");
    const vestingImpl = await TokenVesting.deploy();
    await vestingImpl.waitForDeployment();
    
    const vestingInit = TokenVesting.interface.encodeFunctionData("initialize", [
      tokenProxy,
      await ownerAddr.getAddress()
    ]);
    
    const vestingProxy = await proxyDeployer.deployProxy.staticCall(
      await vestingImpl.getAddress(),
      await proxyAdmin.getAddress(),
      vestingInit,
      "VESTING"
    );
    
    await (await proxyDeployer.deployProxy(
      await vestingImpl.getAddress(),
      await proxyAdmin.getAddress(),
      vestingInit,
      "VESTING"
    )).wait();
    
    const vestingContract = await ethers.getContractAt("TokenVesting", vestingProxy);
    
    // Transfer tokens to vesting contract
    await (await tokenContract.transfer(vestingProxy, VESTING_AMOUNT)).wait();
    
    return {
      token: tokenContract,
      vesting: vestingContract,
      owner: ownerAddr,
      beneficiary1: beneficiary1Addr
    };
  }

  beforeEach(async function () {
    const fixture = await loadFixture(deploySimpleFixture);
    tokenVesting = fixture.vesting;
    token = fixture.token;
    owner = fixture.owner;
    beneficiary1 = fixture.beneficiary1;
  });

  describe("Basic Functionality", function () {
    it("should initialize correctly", async function () {
      expect(await tokenVesting.owner()).to.equal(await owner.getAddress());
      expect(await tokenVesting.token()).to.equal(await token.getAddress());
    });

    it("should create vesting schedule", async function () {
      const latest = await ethers.provider.getBlock("latest");
      const startTime = latest!.timestamp + 1000;
      
      const tx = await tokenVesting.connect(owner).createVestingSchedule(
        await beneficiary1.getAddress(),
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        false,
        "Test vesting"
      );
      
      await expect(tx)
        .to.emit(tokenVesting, "VestingScheduleCreated");
      
      expect(await tokenVesting.totalVestedAmount(beneficiary1.getAddress())).to.equal(VESTING_AMOUNT);
    });

    it("should revert if not owner", async function () {
      const latest = await ethers.provider.getBlock("latest");
      const startTime = latest!.timestamp + 1000;
      
      await expect(
        tokenVesting.connect(beneficiary1).createVestingSchedule(
          beneficiary1.getAddress(),
          VESTING_AMOUNT,
          startTime,
          VESTING_DURATION,
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWithCustomError(tokenVesting, "OwnableUnauthorizedAccount");
    });

    it("should revert with zero amount", async function () {
      const latest = await ethers.provider.getBlock("latest");
      const startTime = latest!.timestamp + 1000;
      
      await expect(
        tokenVesting.connect(owner).createVestingSchedule(
          beneficiary1.getAddress(),
          0,
          startTime,
          VESTING_DURATION,
          CLIFF_DURATION,
          false,
          "Test vesting"
        )
      ).to.be.revertedWithCustomError(tokenVesting, "InvalidAmount");
    });

    it("should allow emergency withdraw by owner", async function () {
      const withdrawAmount = ethers.parseEther("1000");
      const balanceBefore = await token.balanceOf(await owner.getAddress());
      
      const tx = await tokenVesting.connect(owner).emergencyWithdraw(withdrawAmount);
      
      await expect(tx)
        .to.emit(tokenVesting, "EmergencyWithdraw");
      
      const balanceAfter = await token.balanceOf(await owner.getAddress());
      expect(balanceAfter - balanceBefore).to.equal(withdrawAmount);
    });

    it("should revert emergency withdraw if not owner", async function () {
      const withdrawAmount = ethers.parseEther("1000");
      
      await expect(
        tokenVesting.connect(beneficiary1).emergencyWithdraw(withdrawAmount)
      ).to.be.revertedWithCustomError(tokenVesting, "OwnableUnauthorizedAccount");
    });
  });

  describe("Vesting Calculations", function () {
    let vestingScheduleId: string;
    let startTime: number;

    beforeEach(async function () {
      { const latest = await ethers.provider.getBlock("latest"); startTime = latest!.timestamp + 1000; }
      
      const tx = await tokenVesting.connect(owner).createVestingSchedule(
        beneficiary1.getAddress(),
        VESTING_AMOUNT,
        startTime,
        VESTING_DURATION,
        CLIFF_DURATION,
        false,
        "Test vesting"
      );
      
      // Get the vesting schedule ID from the event
      const receipt = await tx.wait();
      const event = receipt?.logs.find(log => {
        try {
          const parsed = tokenVesting.interface.parseLog(log);
          return parsed?.name === "VestingScheduleCreated";
        } catch {
          return false;
        }
      });
      
      if (event) {
        const parsed2 = tokenVesting.interface.parseLog(event);
        vestingScheduleId = parsed2?.args[0];
      }
    });

    it("should calculate vested amount correctly", async function () {
      // Before start time - should be 0
      expect(await tokenVesting.getVestedAmount(vestingScheduleId)).to.equal(0);
      
      // After cliff but before full duration - linear from start time
      await time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
      
      const vestedAmount = await tokenVesting.getVestedAmount(vestingScheduleId);
      const timeElapsed = BigInt(CLIFF_DURATION) + BigInt(VESTING_DURATION / 2);
      const expectedAmount = (VESTING_AMOUNT * timeElapsed) / BigInt(VESTING_DURATION);
      
      // Allow for small time differences
      expect(vestedAmount).to.be.closeTo(expectedAmount, ethers.parseEther("100"));
      
      // After full duration - should be full amount
      await time.increaseTo(startTime + VESTING_DURATION + 1000);
      expect(await tokenVesting.getVestedAmount(vestingScheduleId)).to.equal(VESTING_AMOUNT);
    });

    it("should release tokens after cliff", async function () {
      // Wait for cliff to pass
      await time.increaseTo(startTime + CLIFF_DURATION + (VESTING_DURATION / 2));
      
      const balanceBefore = await token.balanceOf(beneficiary1.getAddress());
      
      const tx = await tokenVesting.release(vestingScheduleId);
      
      await expect(tx)
        .to.emit(tokenVesting, "TokensReleased");
      
      const balanceAfter = await token.balanceOf(beneficiary1.getAddress());
      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });

    it("should not release tokens before cliff", async function () {
      // Before cliff
      await expect(
        tokenVesting.release(vestingScheduleId)
      ).to.be.revertedWithCustomError(tokenVesting, "NoTokensToRelease");
    });
  });
});
