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



  
  

});