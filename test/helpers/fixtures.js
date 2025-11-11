"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProposalType = exports.UPGRADE_EXECUTION_WINDOW = exports.EMERGENCY_UPGRADE_DELAY = exports.TL_MIN_DELAY = exports.BASE_QUORUM_PERCENT = exports.PROPOSAL_THRESHOLD = exports.VOTING_PERIOD = exports.VOTING_DELAY = exports.INITIAL_SUPPLY = exports.SYMBOL = exports.NAME = void 0;
exports.deployCore = deployCore;
exports.descHash = descHash;
exports.proposeVoteQueueExecute = proposeVoteQueueExecute;
exports.addSecurityCouncilMemberViaDAO = addSecurityCouncilMemberViaDAO;
exports.deployV2 = deployV2;
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
exports.NAME = "HYRA";
exports.SYMBOL = "HYRA";
exports.INITIAL_SUPPLY = hardhat_1.ethers.parseEther("1000000"); // initial supply for core token tests
exports.VOTING_DELAY = 1; // blocks
exports.VOTING_PERIOD = 10; // blocks
exports.PROPOSAL_THRESHOLD = 0n;
exports.BASE_QUORUM_PERCENT = 10; // 10%
exports.TL_MIN_DELAY = 7 * 24 * 60 * 60; // 7d
exports.EMERGENCY_UPGRADE_DELAY = 2 * 24 * 60 * 60; // 2d
exports.UPGRADE_EXECUTION_WINDOW = 48 * 60 * 60; // 48h
exports.ProposalType = {
    STANDARD: 0,
    EMERGENCY: 1,
    CONSTITUTIONAL: 2,
    UPGRADE: 3,
};
async function deployCore() {
    const [deployer, voter1, voter2, alice, bob, carol] = await hardhat_1.ethers.getSigners();
    // ========= Deploy ProxyAdmin & ProxyDeployer first =========
    const ProxyAdmin = await hardhat_1.ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await ProxyAdmin.deploy(deployer.address);
    await proxyAdmin.waitForDeployment();
    const ProxyDeployer = await hardhat_1.ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await ProxyDeployer.deploy();
    await proxyDeployer.waitForDeployment();
    // ========= Deploy Timelock IMPLEMENTATION, then PROXY via HyraProxyDeployer =========
    const TimelockImpl = await hardhat_1.ethers.getContractFactory("HyraTimelock");
    const timelockImpl = await TimelockImpl.deploy();
    await timelockImpl.waitForDeployment();
    const tlInit = TimelockImpl.interface.encodeFunctionData("initialize", [
        exports.TL_MIN_DELAY,
        [],
        [hardhat_1.ethers.ZeroAddress],
        deployer.address, // temporary admin for AccessControl; we'll configure & can revoke later
    ]);
    const timelockProxyAddr = await proxyDeployer.deployProxy.staticCall(await timelockImpl.getAddress(), await proxyAdmin.getAddress(), tlInit, "HyraTimelock");
    await (await proxyDeployer.deployProxy(await timelockImpl.getAddress(), await proxyAdmin.getAddress(), tlInit, "HyraTimelock")).wait();
    const timelock = await hardhat_1.ethers.getContractAt("HyraTimelock", timelockProxyAddr);
    // Make Timelock the OWNER of ProxyAdmin so upgrades are DAO-controlled
    // await (await proxyAdmin.transferOwnership(timelockProxyAddr)).wait(); 
    // ========= Deploy Token IMPLEMENTATION, then PROXY via HyraProxyDeployer =========
    const TokenImpl = await hardhat_1.ethers.getContractFactory("HyraToken");
    const tokenImpl = await TokenImpl.deploy();
    await tokenImpl.waitForDeployment();
    const tokenInit = TokenImpl.interface.encodeFunctionData("initialize", [
        exports.NAME,
        exports.SYMBOL,
        exports.INITIAL_SUPPLY,
        voter1.address,
        timelockProxyAddr, // owner/governance is Timelock (proxy)
    ]);
    const tokenProxy = await proxyDeployer.deployProxy.staticCall(await tokenImpl.getAddress(), await proxyAdmin.getAddress(), tokenInit, "HyraToken");
    await (await proxyDeployer.deployProxy(await tokenImpl.getAddress(), await proxyAdmin.getAddress(), tokenInit, "HyraToken")).wait();
    const token = await hardhat_1.ethers.getContractAt("HyraToken", tokenProxy);
    await (await proxyAdmin.addProxy(tokenProxy, "HyraToken")).wait(); // add token proxy to proxy admin
    await (await proxyAdmin.transferOwnership(timelockProxyAddr)).wait();
    // ========= Deploy Governor IMPLEMENTATION, then PROXY via HyraProxyDeployer =========
    const GovernorImpl = await hardhat_1.ethers.getContractFactory("HyraGovernor");
    const governorImpl = await GovernorImpl.deploy();
    await governorImpl.waitForDeployment();
    const govInit = GovernorImpl.interface.encodeFunctionData("initialize", [
        tokenProxy,
        timelockProxyAddr,
        exports.VOTING_DELAY,
        exports.VOTING_PERIOD,
        exports.PROPOSAL_THRESHOLD,
        exports.BASE_QUORUM_PERCENT,
    ]);
    const governorProxy = await proxyDeployer.deployProxy.staticCall(await governorImpl.getAddress(), await proxyAdmin.getAddress(), govInit, "HyraGovernor");
    await (await proxyDeployer.deployProxy(await governorImpl.getAddress(), await proxyAdmin.getAddress(), govInit, "HyraGovernor")).wait();
    const governor = await hardhat_1.ethers.getContractAt("HyraGovernor", governorProxy);
    // ========= Roles wiring (now that Timelock is live) =========
    const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
    const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
    const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
    await (await timelock.grantRole(PROPOSER_ROLE, governorProxy)).wait();
    await (await timelock.grantRole(EXECUTOR_ROLE, hardhat_1.ethers.ZeroAddress)).wait();
    await (await timelock.grantRole(PROPOSER_ROLE, timelockProxyAddr)).wait(); // for timelock to propose upgrades
    await (await timelock.grantRole(EXECUTOR_ROLE, timelockProxyAddr)).wait(); // for timelock to execute upgrades
    await (await timelock.grantRole(EXECUTOR_ROLE, deployer.address)).wait();
    await (await timelock.revokeRole(ADMIN_ROLE, deployer.address)).wait();
    // ========= Delegations =========
    await (await token.connect((await hardhat_1.ethers.getSigners())[1]).delegate((await hardhat_1.ethers.getSigners())[1].address)).wait();
    await (await token.connect((await hardhat_1.ethers.getSigners())[1]).transfer((await hardhat_1.ethers.getSigners())[2].address, hardhat_1.ethers.parseEther("400000"))).wait();
    await (await token.connect((await hardhat_1.ethers.getSigners())[2]).delegate((await hardhat_1.ethers.getSigners())[2].address)).wait();
    await (0, hardhat_network_helpers_1.mine)(1);
    return {
        deployer,
        voter1,
        voter2,
        alice,
        bob,
        carol,
        timelock,
        governor,
        token,
        proxyAdmin,
        proxyDeployer,
        tokenImpl,
        tokenProxy,
    };
}
function descHash(description) {
    return hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes(description));
}
async function proposeVoteQueueExecute(governor, targets, values, calldatas, description, proposalType, voters) {
    const tx = await governor.proposeWithType(targets, values, calldatas, description, proposalType);
    await tx.wait();
    const id = await governor.hashProposal(targets, values, calldatas, descHash(description));
    await (0, hardhat_network_helpers_1.mine)(exports.VOTING_DELAY);
    await (await governor.connect(voters.voter1).castVote(id, 1)).wait();
    await (await governor.connect(voters.voter2).castVote(id, 1)).wait();
    await (0, hardhat_network_helpers_1.mine)(exports.VOTING_PERIOD + 1);
    await (await governor.queue(targets, values, calldatas, descHash(description))).wait();
    await hardhat_network_helpers_1.time.increase(exports.TL_MIN_DELAY + 1);
    await (await governor.execute(targets, values, calldatas, descHash(description))).wait();
    return id;
}
async function addSecurityCouncilMemberViaDAO(governor, addr, voter1, voter2) {
    const t = [await governor.getAddress()];
    const v = [0n];
    const c = [governor.interface.encodeFunctionData("addSecurityCouncilMember", [addr])];
    await proposeVoteQueueExecute(governor, t, v, c, `Add SC ${addr}`, exports.ProposalType.STANDARD, { voter1, voter2 });
}
async function deployV2() {
    const V2 = await hardhat_1.ethers.getContractFactory("HyraTokenV2");
    const v2 = await V2.deploy();
    await v2.waitForDeployment();
    return v2;
}
