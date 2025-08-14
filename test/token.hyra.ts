import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import {
  deployCore,
  ProposalType,
  proposeVoteQueueExecute,
  addSecurityCouncilMemberViaDAO,
  INITIAL_SUPPLY,
} from "./helpers/fixtures";
import { log } from "console";

describe("HyraToken", function () {
  it("initializes with name/symbol, supply to voter1, owner=Timelock, delegation works", async function () {
    const { token, timelock, voter1, voter2 } = await loadFixture(deployCore);
    expect(await token.name()).to.eq("Hyra Token");
    expect(await token.symbol()).to.eq("HYRA");
    expect(await token.balanceOf(voter1.address)).to.eq(INITIAL_SUPPLY - ethers.parseEther("400000"));
    expect(await token.balanceOf(voter2.address)).to.eq(ethers.parseEther("400000"));
    expect(await token.owner()).to.eq(await timelock.getAddress()); 
    // votes snapshot is exercised in governance tests
  });
  it("pause/unpause via DAO", async function () {
    const { token, governor, voter1, voter2 } = await loadFixture(deployCore);

    // pause 
    await proposeVoteQueueExecute(
      governor,
      [await token.getAddress()],
      [0n],
      [token.interface.encodeFunctionData("pause", [])],
      "pause token",
      ProposalType.STANDARD,
      { voter1, voter2 }
    );
    expect(await token.paused()).to.eq(true);

    // unpause
    await proposeVoteQueueExecute(
      governor,
      [await token.getAddress()],
      [0n],
      [token.interface.encodeFunctionData("unpause", [])],
      "unpause token",
      ProposalType.STANDARD,
      { voter1, voter2 }
    );
    expect(await token.paused()).to.eq(false);
  });

  it("direct mint disabled", async function () {
    const { token, voter1 } = await loadFixture(deployCore);
    await expect(token.connect(voter1).mint(voter1.address, 1n)).to.be.revertedWithCustomError(token, "DirectMintDisabled");
  });

  it("mint via DAO respects 2d delay and updates mintedThisYear", async function () {
    const { token, governor, voter1, voter2, alice } = await loadFixture(deployCore);
    const amount = ethers.parseEther("250000");

    await proposeVoteQueueExecute(
      governor,
      [await token.getAddress()],
      [0n],
      [token.interface.encodeFunctionData("createMintRequest", [alice.address, amount, "LM Q1"])],
      "mint req",
      ProposalType.STANDARD,
      { voter1, voter2 }
    );

    const req = await token.mintRequests(0);
    expect(req.executed).to.eq(false);
    await expect(token.executeMintRequest(0)).to.be.revertedWithCustomError(token, "MintDelayNotMet");
    await time.increase(2 * 24 * 60 * 60 + 1); // 2 days + 1 second
    await token.executeMintRequest(0); // execute mint request

    const mintedThisYear = ethers.formatEther((await token.getMintedThisYear()).toString());
    console.log("mintedThisYear", mintedThisYear);
    expect(await token.balanceOf(alice.address)).to.eq(amount);
    expect(await token.getMintedThisYear()).to.eq(amount);
  });

  it("annual cap enforced across multiple requests in same year", async function () {
    const { token, governor, voter1, voter2, alice, bob } = await loadFixture(deployCore);
    const half = ethers.parseEther("1250000000"); // 1.25B

    // First request (ok)
    await proposeVoteQueueExecute(
      governor,
      [await token.getAddress()],
      [0n],
      [token.interface.encodeFunctionData("createMintRequest", [alice.address, half, "half1"])],
      "mr1",
      ProposalType.STANDARD,
      { voter1, voter2 }
    );
    await time.increase(2 * 24 * 60 * 60 + 1); // 2 days + 1 second
    await token.executeMintRequest(0); // execute mint request 1

    // Second request (ok until cap)
    await proposeVoteQueueExecute(
      governor,
      [await token.getAddress()],
      [0n],
      [token.interface.encodeFunctionData("createMintRequest", [bob.address, half, "half2"])],
      "mr2",
      ProposalType.STANDARD,
      { voter1, voter2 }
    );
    await time.increase(2 * 24 * 60 * 60 + 1); // 2 days + 1 second
    await token.executeMintRequest(1); // execute mint request 2

    // Third request would exceed (expect revert somewhere in flow)
    const tooMuch = ethers.parseEther("1");
    await expect(
      proposeVoteQueueExecute(
        governor,
        [await token.getAddress()],
        [0n],
        [token.interface.encodeFunctionData("createMintRequest", [alice.address, tooMuch, "exceed"])],
        "mr3",
        ProposalType.STANDARD,
        { voter1, voter2 }
      )
    ).to.be.rejected; // underlying revert at queue/execute or inside token
  });

  it("burn for holder", async function () {
    const { token, voter1 } = await loadFixture(deployCore);
    const balBefore = await token.balanceOf(voter1.address);
    console.log("balBefore", balBefore);
    await token.connect(voter1).burn(ethers.parseEther("1"));
    const balAfter = await token.balanceOf(voter1.address);
    console.log("balAfter", balAfter);
    expect(balAfter).to.eq(balBefore - ethers.parseEther("1"));
  });
  
  

});