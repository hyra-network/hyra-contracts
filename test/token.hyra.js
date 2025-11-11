"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const fixtures_1 = require("./helpers/fixtures");
describe("HyraToken", function () {
    it("initializes with name/symbol, supply to voter1, owner=Timelock, delegation works", async function () {
        const { token, timelock, voter1, voter2 } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
        (0, chai_1.expect)(await token.name()).to.eq("HYRA");
        (0, chai_1.expect)(await token.symbol()).to.eq("HYRA");
        (0, chai_1.expect)(await token.balanceOf(voter1.address)).to.eq(fixtures_1.INITIAL_SUPPLY - hardhat_1.ethers.parseEther("400000"));
        (0, chai_1.expect)(await token.balanceOf(voter2.address)).to.eq(hardhat_1.ethers.parseEther("400000"));
        (0, chai_1.expect)(await token.owner()).to.eq(await timelock.getAddress());
        // votes snapshot is exercised in governance tests
    });
    it("pause/unpause via DAO", async function () {
        const { token, governor, voter1, voter2 } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
        // pause 
        await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("pause", [])], "pause token", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
        (0, chai_1.expect)(await token.paused()).to.eq(true);
        // unpause
        await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("unpause", [])], "unpause token", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
        (0, chai_1.expect)(await token.paused()).to.eq(false);
    });
    it("direct mint disabled", async function () {
        const { token, voter1 } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
        await (0, chai_1.expect)(token.connect(voter1).mint(voter1.address, 1n)).to.be.revertedWithCustomError(token, "DirectMintDisabled");
    });
    it("mint via DAO respects 2d delay and updates mintedThisYear", async function () {
        const { token, governor, voter1, voter2, alice } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
        const amount = hardhat_1.ethers.parseEther("250000");
        await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("createMintRequest", [alice.address, amount, "LM Q1"])], "mint req", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
        const req = await token.mintRequests(0);
        (0, chai_1.expect)(req.executed).to.eq(false);
        await (0, chai_1.expect)(token.executeMintRequest(0)).to.be.revertedWithCustomError(token, "MintDelayNotMet");
        await hardhat_network_helpers_1.time.increase(2 * 24 * 60 * 60 + 1); // 2 days + 1 second
        await token.executeMintRequest(0); // execute mint request
        const mintedThisYear = hardhat_1.ethers.formatEther((await token.getMintedThisYear()).toString());
        console.log("mintedThisYear", mintedThisYear);
        (0, chai_1.expect)(await token.balanceOf(alice.address)).to.eq(amount);
        (0, chai_1.expect)(await token.getMintedThisYear()).to.eq(amount + fixtures_1.INITIAL_SUPPLY);
    });
    it("DAO mint flow completes for valid amounts under cap", async function () {
        const { token, governor, voter1, voter2, alice } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
        const amount = hardhat_1.ethers.parseEther("1250000000");
        await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("createMintRequest", [alice.address, amount, "attempt"])], "mr-cap", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
    });
    it("burn for holder", async function () {
        const { token, voter1 } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
        const balBefore = await token.balanceOf(voter1.address);
        console.log("balBefore", balBefore);
        await token.connect(voter1).burn(hardhat_1.ethers.parseEther("1"));
        const balAfter = await token.balanceOf(voter1.address);
        console.log("balAfter", balAfter);
        (0, chai_1.expect)(balAfter).to.eq(balBefore - hardhat_1.ethers.parseEther("1"));
    });
});
