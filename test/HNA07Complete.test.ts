import { expect } from "chai";
import { ethers } from "hardhat";
import { HyraToken } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("HNA-07 Complete Tests", function () {
  let token: HyraToken;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  const TOKEN_NAME = "Hyra Token";
  const TOKEN_SYMBOL = "HYRA";
  const INITIAL_SUPPLY = ethers.parseEther("100000"); // 100K tokens
  const TIER1_ANNUAL_CAP = ethers.parseEther("2500000000"); // 2.5B per year
  const YEAR_DURATION = 365 * 24 * 60 * 60; // 365 days in seconds
  const MINT_EXECUTION_DELAY = 2 * 24 * 60 * 60; // 2 days in seconds

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    // Deploy implementation
    const HyraTokenFactory = await ethers.getContractFactory("HyraToken");
    const implementation = await HyraTokenFactory.deploy();
    await implementation.waitForDeployment();

    // Create proxy and initialize
    const initData = implementation.interface.encodeFunctionData("initialize", [
      TOKEN_NAME,
      TOKEN_SYMBOL,
      INITIAL_SUPPLY,
      alice.address, // vesting contract
      owner.address, // governance
    ]);

    const ProxyFactory = await ethers.getContractFactory("ERC1967Proxy");
    const proxy = await ProxyFactory.deploy(await implementation.getAddress(), initData);
    await proxy.waitForDeployment();
    
    token = await ethers.getContractAt("HyraToken", await proxy.getAddress());
  });

  it("HNA-07 Fix: Cross-year execution attribution", async function () {
    console.log("=== HNA-07 Fix: Cross-year Execution Attribution ===");
    
    // Create a mint request in year 1
    const mintAmount = ethers.parseEther("1000000"); // 1M tokens
    const tx1 = await token.createMintRequest(alice.address, mintAmount, "year 1 request");
    const receipt1 = await tx1.wait();
    const requestId1 = receipt1.logs[0].args[0];
    
    console.log("1. Created request in year 1 for", ethers.formatEther(mintAmount), "tokens");
    console.log("   Current year:", await token.currentMintYear());
    console.log("   Minted by year 1:", ethers.formatEther(await token.mintedByYear(1)), "tokens");
    console.log("   Minted by year 2:", ethers.formatEther(await token.mintedByYear(2)), "tokens");
    
    // Move to year 2
    await ethers.provider.send("evm_increaseTime", [YEAR_DURATION]);
    await ethers.provider.send("evm_mine", []);
    
    // Create a mint request to trigger year reset
    const tx2 = await token.createMintRequest(bob.address, ethers.parseEther("1000"), "trigger year reset");
    await tx2.wait();
    
    console.log("2. Moved to year 2");
    console.log("   Current year:", await token.currentMintYear());
    console.log("   Minted by year 1:", ethers.formatEther(await token.mintedByYear(1)), "tokens");
    console.log("   Minted by year 2:", ethers.formatEther(await token.mintedByYear(2)), "tokens");
    
    // Execute the year 1 request in year 2
    await ethers.provider.send("evm_increaseTime", [MINT_EXECUTION_DELAY + 1]);
    await ethers.provider.send("evm_mine", []);
    await token.executeMintRequest(requestId1);
    
    console.log("3. Executed year 1 request in year 2");
    console.log("   Current year:", await token.currentMintYear());
    console.log("   Minted by year 1:", ethers.formatEther(await token.mintedByYear(1)), "tokens");
    console.log("   Minted by year 2:", ethers.formatEther(await token.mintedByYear(2)), "tokens");
    console.log("   Alice balance:", ethers.formatEther(await token.balanceOf(alice.address)), "tokens");
    
    // Verify the fix is working
    expect(await token.mintedByYear(1)).to.equal(INITIAL_SUPPLY + mintAmount); // 100K + 1M = 1.1M
    expect(await token.mintedByYear(2)).to.equal(0); // Year 2 should be 0
    expect(await token.balanceOf(alice.address)).to.equal(INITIAL_SUPPLY + mintAmount); // Alice has initial supply + minted amount
    
    console.log("HNA-07 Fix Verified:");
    console.log("   - Year 1 request executed in year 2 was correctly attributed to year 1");
    console.log("   - Year 2 minted amount remains 0");
    console.log("   - Cross-year execution doesn't consume wrong year's capacity");
  });

  it("HNA-07 Fix: Year capacity isolation", async function () {
    console.log("=== HNA-07 Fix: Year Capacity Isolation ===");
    
    // Create a large mint request in year 1
    const year1Amount = ethers.parseEther("1000000"); // 1M tokens
    const tx1 = await token.createMintRequest(alice.address, year1Amount, "year 1 large request");
    const receipt1 = await tx1.wait();
    const requestId1 = receipt1.logs[0].args[0];
    
    // Move to year 2
    await ethers.provider.send("evm_increaseTime", [YEAR_DURATION]);
    await ethers.provider.send("evm_mine", []);
    
    // Create a mint request to trigger year reset
    const tx2 = await token.createMintRequest(bob.address, ethers.parseEther("1000"), "trigger year reset");
    await tx2.wait();
    
    // Move to year 3
    await ethers.provider.send("evm_increaseTime", [YEAR_DURATION]);
    await ethers.provider.send("evm_mine", []);
    
    // Create a mint request to trigger year reset to year 3
    const tx3 = await token.createMintRequest(alice.address, ethers.parseEther("1000"), "trigger year 3 reset");
    await tx3.wait();
    
    console.log("1. Created year 1 request, moved to year 3");
    console.log("   Current year:", await token.currentMintYear());
    console.log("   Minted by year 1:", ethers.formatEther(await token.mintedByYear(1)), "tokens");
    console.log("   Minted by year 2:", ethers.formatEther(await token.mintedByYear(2)), "tokens");
    console.log("   Minted by year 3:", ethers.formatEther(await token.mintedByYear(3)), "tokens");
    
    // Execute the year 1 request in year 3
    await ethers.provider.send("evm_increaseTime", [MINT_EXECUTION_DELAY + 1]);
    await ethers.provider.send("evm_mine", []);
    await token.executeMintRequest(requestId1);
    
    console.log("2. Executed year 1 request in year 3");
    console.log("   Current year:", await token.currentMintYear());
    console.log("   Minted by year 1:", ethers.formatEther(await token.mintedByYear(1)), "tokens");
    console.log("   Minted by year 2:", ethers.formatEther(await token.mintedByYear(2)), "tokens");
    console.log("   Minted by year 3:", ethers.formatEther(await token.mintedByYear(3)), "tokens");
    
    // Verify the fix is working
    expect(await token.mintedByYear(1)).to.equal(INITIAL_SUPPLY + year1Amount); // 100K + 1M = 1.1M
    expect(await token.mintedByYear(2)).to.equal(0);
    expect(await token.mintedByYear(3)).to.equal(0);
    
    // Verify year 3 still has full capacity available
    const remainingCapacity = await token.getRemainingMintCapacity();
    console.log("   Year 3 remaining capacity:", ethers.formatEther(remainingCapacity), "tokens");
    expect(remainingCapacity).to.equal(TIER1_ANNUAL_CAP);
    
    console.log("Year Capacity Isolation Verified:");
    console.log("   - Year 1 mints don't affect year 3 capacity");
    console.log("   - Each year maintains independent minting capacity");
    console.log("   - Cross-year execution preserves year boundaries");
  });

  it("HNA-07 Fix: Simple year tracking", async function () {
    console.log("=== HNA-07 Fix: Simple Year Tracking ===");
    
    // Create a request in year 1
    const year1Amount = ethers.parseEther("500000"); // 500K tokens
    const tx1 = await token.createMintRequest(alice.address, year1Amount, "year 1 request");
    const receipt1 = await tx1.wait();
    const requestId1 = receipt1.logs[0].args[0];
    
    // Move to year 2
    await ethers.provider.send("evm_increaseTime", [YEAR_DURATION]);
    await ethers.provider.send("evm_mine", []);
    
    // Create a mint request to trigger year reset
    const tx2 = await token.createMintRequest(bob.address, ethers.parseEther("1000"), "trigger year reset");
    await tx2.wait();
    
    console.log("1. Created request in year 1, moved to year 2");
    console.log("   Current year:", await token.currentMintYear());
    console.log("   Minted by year 1:", ethers.formatEther(await token.mintedByYear(1)), "tokens");
    console.log("   Minted by year 2:", ethers.formatEther(await token.mintedByYear(2)), "tokens");
    
    // Execute the year 1 request in year 2
    await ethers.provider.send("evm_increaseTime", [MINT_EXECUTION_DELAY + 1]);
    await ethers.provider.send("evm_mine", []);
    await token.executeMintRequest(requestId1);
    
    console.log("2. Executed year 1 request in year 2");
    console.log("   Current year:", await token.currentMintYear());
    console.log("   Minted by year 1:", ethers.formatEther(await token.mintedByYear(1)), "tokens");
    console.log("   Minted by year 2:", ethers.formatEther(await token.mintedByYear(2)), "tokens");
    console.log("   Alice balance:", ethers.formatEther(await token.balanceOf(alice.address)), "tokens");
    console.log("   Bob balance:", ethers.formatEther(await token.balanceOf(bob.address)), "tokens");
    
    // Verify the fix is working
    expect(await token.mintedByYear(1)).to.equal(INITIAL_SUPPLY + year1Amount); // 100K + 500K = 600K
    expect(await token.mintedByYear(2)).to.equal(0); // Year 2 should be 0
    expect(await token.balanceOf(alice.address)).to.equal(INITIAL_SUPPLY + year1Amount); // Alice has initial supply + year1 amount
    expect(await token.balanceOf(bob.address)).to.equal(0); // Bob has 0 (request not executed yet)
    
    console.log("Simple Year Tracking Verified:");
    console.log("   - Year 1 request correctly attributed to year 1");
    console.log("   - Year 2 minted amount remains 0");
    console.log("   - Cross-year execution preserves year boundaries");
  });
});
