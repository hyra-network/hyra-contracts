import { ethers } from "hardhat";
import { time, mine } from "@nomicfoundation/hardhat-network-helpers";

export const NAME = "Hyra Token";
export const SYMBOL = "HYRA";
export const INITIAL_SUPPLY = ethers.parseEther("2500000000"); // mint 2.5 billion tokens

export const VOTING_DELAY = 1; // blocks
export const VOTING_PERIOD = 10; // blocks
export const PROPOSAL_THRESHOLD = 0n;
export const BASE_QUORUM_PERCENT = 10; // 10%

export const TL_MIN_DELAY = 7 * 24 * 60 * 60; // 7d
export const EMERGENCY_UPGRADE_DELAY = 2 * 24 * 60 * 60; // 2d
export const UPGRADE_EXECUTION_WINDOW = 48 * 60 * 60; // 48h

export const ProposalType = {
  STANDARD: 0,
  EMERGENCY: 1,
  CONSTITUTIONAL: 2,
  UPGRADE: 3,
} as const;

export async function deployCore() {
  const [deployer, voter1, voter2, alice, bob, carol] = await ethers.getSigners();

  // ========= Deploy ProxyAdmin & ProxyDeployer first =========
  const ProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
  const proxyAdmin = await ProxyAdmin.deploy(deployer.address);
  await proxyAdmin.waitForDeployment();

  const ProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
  const proxyDeployer = await ProxyDeployer.deploy();
  await proxyDeployer.waitForDeployment();

  // ========= Deploy Timelock IMPLEMENTATION, then PROXY via HyraProxyDeployer =========
  const TimelockImpl = await ethers.getContractFactory("HyraTimelock");
  const timelockImpl = await TimelockImpl.deploy();
  await timelockImpl.waitForDeployment();

  const tlInit = TimelockImpl.interface.encodeFunctionData("initialize", [
    TL_MIN_DELAY,
    [],
    [ethers.ZeroAddress],
    deployer.address, // temporary admin for AccessControl; we'll configure & can revoke later
  ]);

  const timelockProxyAddr = await proxyDeployer.deployProxy.staticCall(
    await timelockImpl.getAddress(),
    await proxyAdmin.getAddress(),
    tlInit,
    "HyraTimelock"
  );
  await (await proxyDeployer.deployProxy(
    await timelockImpl.getAddress(),
    await proxyAdmin.getAddress(),
    tlInit,
    "HyraTimelock"
  )).wait();
  const timelock = await ethers.getContractAt("HyraTimelock", timelockProxyAddr);

  // Make Timelock the OWNER of ProxyAdmin so upgrades are DAO-controlled
  // await (await proxyAdmin.transferOwnership(timelockProxyAddr)).wait(); 

  // ========= Deploy Token IMPLEMENTATION, then PROXY via HyraProxyDeployer =========
  const TokenImpl = await ethers.getContractFactory("HyraToken");
  const tokenImpl = await TokenImpl.deploy();
  await tokenImpl.waitForDeployment();

  const tokenInit = TokenImpl.interface.encodeFunctionData("initialize", [
    NAME,
    SYMBOL,
    INITIAL_SUPPLY,
    voter1.address,
    timelockProxyAddr, // owner/governance is Timelock (proxy)
  ]);

  const tokenProxy = await proxyDeployer.deployProxy.staticCall(
    await tokenImpl.getAddress(),
    await proxyAdmin.getAddress(),
    tokenInit,
    "HyraToken"
  );
  await (await proxyDeployer.deployProxy(
    await tokenImpl.getAddress(),
    await proxyAdmin.getAddress(),
    tokenInit,
    "HyraToken"
  )).wait();
  const token = await ethers.getContractAt("HyraToken", tokenProxy);

  await (await proxyAdmin.addProxy(tokenProxy, "HyraToken")).wait(); // add token proxy to proxy admin
  await (await proxyAdmin.transferOwnership(timelockProxyAddr)).wait();

  // ========= Deploy Governor IMPLEMENTATION, then PROXY via HyraProxyDeployer =========
  const GovernorImpl = await ethers.getContractFactory("HyraGovernor");
  const governorImpl = await GovernorImpl.deploy();
  await governorImpl.waitForDeployment();

  const govInit = GovernorImpl.interface.encodeFunctionData("initialize", [
    tokenProxy,
    timelockProxyAddr,
    VOTING_DELAY,
    VOTING_PERIOD,
    PROPOSAL_THRESHOLD,
    BASE_QUORUM_PERCENT,
  ]);

  const governorProxy = await proxyDeployer.deployProxy.staticCall(
    await governorImpl.getAddress(),
    await proxyAdmin.getAddress(),
    govInit,
    "HyraGovernor"
  );
  await (await proxyDeployer.deployProxy(
    await governorImpl.getAddress(),
    await proxyAdmin.getAddress(),
    govInit,
    "HyraGovernor"
  )).wait();
  const governor = await ethers.getContractAt("HyraGovernor", governorProxy);

  // ========= Roles wiring (now that Timelock is live) =========
  const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
  const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
  const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
  await (await timelock.grantRole(PROPOSER_ROLE, governorProxy)).wait();
  await (await timelock.grantRole(EXECUTOR_ROLE, ethers.ZeroAddress)).wait();
  await (await timelock.grantRole(PROPOSER_ROLE, timelockProxyAddr)).wait(); // for timelock to propose upgrades
  await (await timelock.grantRole(EXECUTOR_ROLE, timelockProxyAddr)).wait(); // for timelock to execute upgrades
  await (await timelock.grantRole(EXECUTOR_ROLE, deployer.address)).wait();
  await (await timelock.revokeRole(ADMIN_ROLE, deployer.address)).wait();

  // ========= Delegations =========
  await (await token.connect((await ethers.getSigners())[1]).delegate((await ethers.getSigners())[1].address)).wait();
  await (await token.connect((await ethers.getSigners())[1]).transfer((await ethers.getSigners())[2].address, ethers.parseEther("400000"))).wait();
  await (await token.connect((await ethers.getSigners())[2]).delegate((await ethers.getSigners())[2].address)).wait();
  await mine(1);

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

export function descHash(description: string) {
  return ethers.keccak256(ethers.toUtf8Bytes(description));
}

export async function proposeVoteQueueExecute(
  governor: any,
  targets: string[],
  values: bigint[],
  calldatas: string[],
  description: string,
  proposalType: number,
  voters: { voter1: any; voter2: any },
) {
  const tx = await governor.proposeWithType(targets, values, calldatas, description, proposalType);
  await tx.wait();

  const id = await governor.hashProposal(targets, values, calldatas, descHash(description));
  await mine(VOTING_DELAY);
  await (await governor.connect(voters.voter1).castVote(id, 1)).wait();
  await (await governor.connect(voters.voter2).castVote(id, 1)).wait();
  await mine(VOTING_PERIOD + 1);
  await (await governor.queue(targets, values, calldatas, descHash(description))).wait();
  await time.increase(TL_MIN_DELAY + 1);
  await (await governor.execute(targets, values, calldatas, descHash(description))).wait();
  return id as bigint;
}

export async function addSecurityCouncilMemberViaDAO(governor: any, addr: string, voter1: any, voter2: any) {
  const t = [await governor.getAddress()];
  const v = [0n];
  const c = [governor.interface.encodeFunctionData("addSecurityCouncilMember", [addr])];
  await proposeVoteQueueExecute(governor, t, v, c, `Add SC ${addr}`, ProposalType.STANDARD, { voter1, voter2 });
}

export async function deployV2() {
  const V2 = await ethers.getContractFactory("HyraTokenV2");
  const v2 = await V2.deploy();
  await v2.waitForDeployment();
  return v2;
}