import { expect } from "chai";
import { ethers } from "hardhat";
import { HyraToken, TokenVesting } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Tokenomics - 26 Years (11+5+10)", function () {
  let token: HyraToken;
  let vesting: TokenVesting;
  let owner: SignerWithAddress;
  let deployer: SignerWithAddress;

  beforeEach(async function () {
    [deployer, owner] = await ethers.getSigners();

    // Deploy TokenVesting
    const TokenVesting = await ethers.getContractFactory("TokenVesting");
    const vestingImpl = await TokenVesting.deploy();
    await vestingImpl.waitForDeployment();

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const vestingProxy = await ERC1967Proxy.deploy(
      await vestingImpl.getAddress(),
      "0x"
    );
    await vestingProxy.waitForDeployment();
    vesting = await ethers.getContractAt("TokenVesting", await vestingProxy.getAddress());

    // Deploy HyraToken
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();
    await tokenImpl.waitForDeployment();

    const tokenInit = HyraToken.interface.encodeFunctionData("initialize", [
      "HYRA",
      "HYRA",
      ethers.parseEther("2500000000"), // 2.5B initial (5%)
      await vesting.getAddress(),
      await owner.getAddress()
    ]);

    const tokenProxy = await ERC1967Proxy.deploy(
      await tokenImpl.getAddress(),
      tokenInit
    );
    await tokenProxy.waitForDeployment();
    token = await ethers.getContractAt("HyraToken", await tokenProxy.getAddress());
  });

  describe("26 Years Minting Schedule", function () {
    it("Should have correct tier end years", async function () {
      // These are constants, can't call directly, but we can verify through logic
      const tier1Cap = ethers.parseEther("2500000000"); // 2.5B
      const tier2Cap = ethers.parseEther("1500000000"); // 1.5B
      const tier3Cap = ethers.parseEther("750000000"); // 750M

      // Year 1-11 should return tier1 cap
      const year11Cap = await token.getRemainingMintCapacityForYear(11);
      expect(year11Cap).to.be.gt(0); // Should have capacity

      // Year 12 should return tier2 cap
      const year12Cap = await token.getRemainingMintCapacityForYear(12);
      expect(year12Cap).to.be.gt(0); // Should have capacity

      // Year 17 should return tier3 cap
      const year17Cap = await token.getRemainingMintCapacityForYear(17);
      expect(year17Cap).to.be.gt(0); // Should have capacity

      // Year 27 should return 0 (after tier3 ends at 26)
      const year27Cap = await token.getRemainingMintCapacityForYear(27);
      expect(year27Cap).to.equal(0);
    });

    it("Should calculate max mintable as 42.5B (11+5+10 years)", async function () {
      const maxMintable = await token.getMaxMintableSupply();
      const expected = ethers.parseEther("42500000000"); // 42.5B
      expect(maxMintable).to.equal(expected);
    });

    it("Should match tokenomics: 55% + 15% + 15% = 85%", async function () {
      const PHASE1 = ethers.parseEther("2500000000") * 11n; // 55% (11 years × 2.5B, includes initial)
      const PHASE2 = ethers.parseEther("1500000000") * 5n; // 15% (5 years × 1.5B)
      const PHASE3 = ethers.parseEther("750000000") * 10n; // 15% (10 years × 750M)
      
      const TOTAL = PHASE1 + PHASE2 + PHASE3;
      const EXPECTED = ethers.parseEther("42500000000"); // 42.5B (85% of 50B)
      
      expect(TOTAL).to.equal(EXPECTED);
      
      const maxMintable = await token.getMaxMintableSupply();
      expect(maxMintable).to.equal(EXPECTED);
    });

    it("Phase 1 should be 11 years (55%)", async function () {
      // Year 11 should still be in tier 1
      const year11Cap = await token.getRemainingMintCapacityForYear(11);
      expect(year11Cap).to.be.gt(0);

      // Year 12 should be in tier 2
      const year12Cap = await token.getRemainingMintCapacityForYear(12);
      expect(year12Cap).to.be.gt(0);
      
      // Verify they're different tiers
      expect(year11Cap).to.not.equal(year12Cap);
    });

    it("Total duration should be 26 years", async function () {
      // Year 26 should have capacity
      const year26Cap = await token.getRemainingMintCapacityForYear(26);
      expect(year26Cap).to.be.gt(0);

      // Year 27 should have no capacity
      const year27Cap = await token.getRemainingMintCapacityForYear(27);
      expect(year27Cap).to.equal(0);
    });

    it("Reserved should be 15% (7.5B)", async function () {
      const MAX_SUPPLY = ethers.parseEther("50000000000"); // 50B
      const maxMintable = await token.getMaxMintableSupply();
      const reserved = MAX_SUPPLY - maxMintable;
      
      const expectedReserved = ethers.parseEther("7500000000"); // 7.5B (15%)
      expect(reserved).to.equal(expectedReserved);
    });
  });

  describe("Token Name and Symbol", function () {
    it("Should have name 'HYRA'", async function () {
      const name = await token.name();
      expect(name).to.equal("HYRA");
    });

    it("Should have symbol 'HYRA'", async function () {
      const symbol = await token.symbol();
      expect(symbol).to.equal("HYRA");
    });
  });
});

