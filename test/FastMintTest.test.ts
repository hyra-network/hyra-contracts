import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { HyraToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("Fast Mint Test (Time Manipulation)", function () {
  let token: HyraToken;
  let owner: SignerWithAddress;
  let recipient: SignerWithAddress;
  let vesting: SignerWithAddress;

  const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
  const MINT_AMOUNT = ethers.parseEther("1000"); // 1K tokens
  const TWO_DAYS = 2 * 24 * 60 * 60; // 2 days in seconds

  beforeEach(async function () {
    [owner, recipient, vesting] = await ethers.getSigners();

    // Deploy token implementation
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();
    await tokenImpl.waitForDeployment();

    // Deploy proxy
    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const initData = HyraToken.interface.encodeFunctionData("initialize", [
      "HYRA",
      "HYRA",
      INITIAL_SUPPLY,
      await vesting.getAddress(),
      await owner.getAddress()
    ]);
    
    const proxy = await ERC1967Proxy.deploy(await tokenImpl.getAddress(), initData);
    await proxy.waitForDeployment();

    // Connect to proxy as HyraToken
    token = await ethers.getContractAt("HyraToken", await proxy.getAddress());

    console.log("\n=== Setup Complete ===");
    console.log(`Token: ${await token.getAddress()}`);
    console.log(`Owner: ${await owner.getAddress()}`);
  });

  describe("Fast Mint with Time Manipulation", function () {
    it("Should create and execute mint request after fast-forward", async function () {
      console.log("\n=== Test: Fast Forward Mint ===");

      // 1. Create mint request
      console.log("1. Creating mint request...");
      const tx = await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        MINT_AMOUNT,
        "Test fast mint"
      );
      await tx.wait();
      console.log("   ✅ Request created (ID: 0)");

      // 2. Verify request exists but not executed
      const requestBefore = await token.mintRequests(0);
      expect(requestBefore.executed).to.equal(false);
      expect(requestBefore.amount).to.equal(MINT_AMOUNT);

      // 3. Try to execute immediately - should fail
      console.log("2. Trying to execute immediately (should fail)...");
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "MintDelayNotMet");
      console.log("   ✅ Correctly rejected (delay not met)");

      // 4. Fast forward 2 days
      console.log("3. Fast forwarding 2 days...");
      await time.increase(TWO_DAYS);
      console.log("   ✅ Time advanced");

      // 5. Execute mint request
      console.log("4. Executing mint request...");
      const balanceBefore = await token.balanceOf(await recipient.getAddress());
      
      const executeTx = await token.executeMintRequest(0);
      await executeTx.wait();
      
      const balanceAfter = await token.balanceOf(await recipient.getAddress());
      console.log("   ✅ Executed successfully!");
      console.log(`   Balance change: +${ethers.formatEther(balanceAfter - balanceBefore)} HYRA`);

      // 6. Verify results
      expect(balanceAfter - balanceBefore).to.equal(MINT_AMOUNT);
      
      const requestAfter = await token.mintRequests(0);
      expect(requestAfter.executed).to.equal(true);
    });

    it("Should handle multiple mint requests in sequence", async function () {
      console.log("\n=== Test: Multiple Sequential Mints ===");

      const numRequests = 3;
      
      for (let i = 0; i < numRequests; i++) {
        console.log(`\n${i + 1}. Processing request ${i}...`);
        
        // Create
        await (await token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          MINT_AMOUNT,
          `Test mint ${i}`
        )).wait();
        console.log(`   ✅ Created request ${i}`);
        
        // Fast forward
        await time.increase(TWO_DAYS);
        console.log(`   ✅ Fast forwarded 2 days`);
        
        // Execute
        await (await token.executeMintRequest(i)).wait();
        console.log(`   ✅ Executed request ${i}`);
      }

      const finalBalance = await token.balanceOf(await recipient.getAddress());
      const expectedBalance = MINT_AMOUNT * BigInt(numRequests);
      expect(finalBalance).to.equal(expectedBalance);
      
      console.log(`\n✅ All ${numRequests} mints completed!`);
      console.log(`   Final balance: ${ethers.formatEther(finalBalance)} HYRA`);
    });

    it("Should respect annual mint cap", async function () {
      console.log("\n=== Test: Annual Cap Enforcement ===");

      // Get remaining capacity
      const remaining = await token.getRemainingMintCapacity();
      console.log(`Remaining capacity: ${ethers.formatEther(remaining)} HYRA`);

      // Try to mint more than capacity
      const excessAmount = remaining + ethers.parseEther("1");
      
      await expect(
        token.connect(owner).createMintRequest(
          await recipient.getAddress(),
          excessAmount,
          "Exceed cap test"
        )
      ).to.be.revertedWithCustomError(token, "ExceedsAnnualMintCap");

      console.log("✅ Annual cap enforced correctly");
    });

    it("Should allow owner to cancel pending request", async function () {
      console.log("\n=== Test: Cancel Request ===");

      // Create request
      await (await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        MINT_AMOUNT,
        "Test cancel"
      )).wait();
      console.log("✅ Request created");

      // Cancel
      await (await token.connect(owner).cancelMintRequest(0)).wait();
      console.log("✅ Request cancelled");

      // Try to execute - should fail
      await time.increase(TWO_DAYS);
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "InvalidAmount");

      console.log("✅ Cancelled request cannot be executed");
    });

    it("Should handle request expiry", async function () {
      console.log("\n=== Test: Request Expiry ===");

      // Create request
      await (await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        MINT_AMOUNT,
        "Test expiry"
      )).wait();
      console.log("✅ Request created");

      // Fast forward past expiry (365 days + 1 day)
      const expiryPeriod = 365 * 24 * 60 * 60;
      await time.increase(expiryPeriod + 86400);
      console.log("✅ Fast forwarded past expiry");

      // Try to execute - should fail
      await expect(
        token.executeMintRequest(0)
      ).to.be.revertedWithCustomError(token, "RequestExpired");

      console.log("✅ Expired request correctly rejected");
    });
  });

  describe("Token Stats", function () {
    it("Should track minted amounts correctly", async function () {
      console.log("\n=== Test: Tracking Stats ===");

      const totalSupplyBefore = await token.totalSupply();
      const mintedBefore = await token.totalMintedSupply();

      // Create and execute mint
      await (await token.connect(owner).createMintRequest(
        await recipient.getAddress(),
        MINT_AMOUNT,
        "Test stats"
      )).wait();

      await time.increase(TWO_DAYS);
      await (await token.executeMintRequest(0)).wait();

      const totalSupplyAfter = await token.totalSupply();
      const mintedAfter = await token.totalMintedSupply();

      expect(totalSupplyAfter - totalSupplyBefore).to.equal(MINT_AMOUNT);
      expect(mintedAfter - mintedBefore).to.equal(MINT_AMOUNT);

      console.log(`Total Supply: ${ethers.formatEther(totalSupplyBefore)} → ${ethers.formatEther(totalSupplyAfter)} HYRA`);
      console.log(`Total Minted: ${ethers.formatEther(mintedBefore)} → ${ethers.formatEther(mintedAfter)} HYRA`);
    });
  });
});
