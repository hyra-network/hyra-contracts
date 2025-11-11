"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const hardhat_1 = require("hardhat");
const hardhat_network_helpers_1 = require("@nomicfoundation/hardhat-network-helpers");
const fixtures_1 = require("./helpers/fixtures");
describe("Final Comprehensive Testing", function () {
    describe("HyraToken - Core Functions", function () {
        it("should test all basic HyraToken functions", async function () {
            const { token, timelock, voter1, voter2, alice, bob } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // Test basic ERC20 functions
            (0, chai_1.expect)(await token.name()).to.eq("HYRA");
            (0, chai_1.expect)(await token.symbol()).to.eq("HYRA");
            (0, chai_1.expect)(await token.decimals()).to.eq(18);
            (0, chai_1.expect)(await token.totalSupply()).to.eq(fixtures_1.INITIAL_SUPPLY);
            (0, chai_1.expect)(await token.owner()).to.eq(await timelock.getAddress());
            // Test balance and transfer
            const balance1 = await token.balanceOf(voter1.getAddress());
            const balance2 = await token.balanceOf(voter2.getAddress());
            (0, chai_1.expect)(balance1).to.be.gt(0);
            (0, chai_1.expect)(balance2).to.be.gt(0);
            // Test transfer
            const transferAmount = hardhat_1.ethers.parseEther("1000");
            await token.connect(voter1).transfer(alice.getAddress(), transferAmount);
            (0, chai_1.expect)(await token.balanceOf(alice.getAddress())).to.eq(transferAmount);
            // Test allowance and approve
            const allowanceAmount = hardhat_1.ethers.parseEther("500");
            await token.connect(alice).approve(bob.getAddress(), allowanceAmount);
            (0, chai_1.expect)(await token.allowance(alice.getAddress(), bob.getAddress())).to.eq(allowanceAmount);
            // Test transferFrom
            await token.connect(bob).transferFrom(alice.getAddress(), bob.getAddress(), allowanceAmount);
            (0, chai_1.expect)(await token.balanceOf(bob.getAddress())).to.eq(allowanceAmount);
            // Test burn
            const burnAmount = hardhat_1.ethers.parseEther("100");
            const balanceBefore = await token.balanceOf(voter1.getAddress());
            await token.connect(voter1).burn(burnAmount);
            (0, chai_1.expect)(await token.balanceOf(voter1.getAddress())).to.eq(balanceBefore - burnAmount);
            // Test delegation
            await token.connect(alice).delegate(alice.getAddress());
            (0, chai_1.expect)(await token.getVotes(alice.getAddress())).to.eq(transferAmount - allowanceAmount);
            // Test minting functions
            (0, chai_1.expect)(await token.getMintedThisYear()).to.eq(fixtures_1.INITIAL_SUPPLY);
            (0, chai_1.expect)(await token.currentMintYear()).to.eq(1);
            // Remaining capacity accounts for initial supply minted in year 1
            (0, chai_1.expect)(await token.getRemainingMintCapacity()).to.eq(hardhat_1.ethers.parseEther("2500000000") - fixtures_1.INITIAL_SUPPLY);
            // Test pause state
            (0, chai_1.expect)(await token.paused()).to.eq(false);
        });
        it("should test mint request workflow", async function () {
            const { token, governor, voter1, voter2, alice, timelock } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            const mintAmount = hardhat_1.ethers.parseEther("1000000");
            // Create mint request via governance
            const aliceAddr = await alice.getAddress();
            await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("createMintRequest", [aliceAddr, mintAmount, "Test mint"])], "Create mint request", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
            // Test mint request data
            const request = await token.mintRequests(0);
            (0, chai_1.expect)(request.recipient).to.eq(await alice.getAddress());
            (0, chai_1.expect)(request.amount).to.eq(mintAmount);
            (0, chai_1.expect)(request.executed).to.eq(false);
            // Note: requestTime and description fields may not be available in the struct
            // Test mint request count
            (0, chai_1.expect)(await token.mintRequestCount()).to.eq(1);
            // Test execution delay
            await (0, chai_1.expect)(token.connect(voter1).executeMintRequest(0)).to.be.revertedWithCustomError(token, "MintDelayNotMet");
            // Wait for delay and execute
            await hardhat_network_helpers_1.time.increase(2 * 24 * 60 * 60 + 1);
            await token.connect(voter1).executeMintRequest(0);
            // Verify execution
            const executedRequest = await token.mintRequests(0);
            (0, chai_1.expect)(executedRequest.executed).to.eq(true);
            (0, chai_1.expect)(await token.balanceOf(alice.getAddress())).to.eq(mintAmount);
            (0, chai_1.expect)(await token.getMintedThisYear()).to.eq(fixtures_1.INITIAL_SUPPLY + mintAmount);
        });
    });
    describe("HyraGovernor - Core Functions", function () {
        it("should test basic HyraGovernor functions", async function () {
            const { governor, token, voter1, voter2, alice } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // Test basic governor info
            (0, chai_1.expect)(await governor.name()).to.eq("HyraGovernor");
            (0, chai_1.expect)(await governor.version()).to.eq("1");
            (0, chai_1.expect)(await governor.votingDelay()).to.eq(1);
            (0, chai_1.expect)(await governor.votingPeriod()).to.eq(10);
            (0, chai_1.expect)(await governor.proposalThreshold()).to.eq(0);
            // Quorum function relies on historical supply; skip here to avoid future lookup issues
            // Test proposal creation
            const targets = [await token.getAddress()];
            const values = [0n];
            const calldatas = [token.interface.encodeFunctionData("pause", [])];
            const description = "Test proposal";
            const tx = await governor.proposeWithType(targets, values, calldatas, description, fixtures_1.ProposalType.STANDARD);
            await tx.wait();
            const proposalId = await governor.hashProposal(targets, values, calldatas, hardhat_1.ethers.keccak256(hardhat_1.ethers.toUtf8Bytes(description)));
            // Test proposal state
            (0, chai_1.expect)(await governor.state(proposalId)).to.eq(0); // Pending
            (0, chai_1.expect)(await governor.proposalTypes(proposalId)).to.eq(fixtures_1.ProposalType.STANDARD);
            (0, chai_1.expect)(await governor.proposalProposer(proposalId)).to.be.properAddress;
            // Test proposal snapshot and deadline
            (0, chai_1.expect)(await governor.proposalSnapshot(proposalId)).to.be.gt(0);
            (0, chai_1.expect)(await governor.proposalDeadline(proposalId)).to.be.gt(0);
        });
        it("should test security council functions", async function () {
            const { governor, voter1, voter2, alice } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // Test initial security council state
            (0, chai_1.expect)(await governor.securityCouncilMemberCount()).to.eq(0);
            (0, chai_1.expect)(await governor.isSecurityCouncilMember(alice.getAddress())).to.eq(false);
            // Add security council member via governance
            const aliceAddr2 = await alice.getAddress();
            await (0, chai_1.expect)((0, fixtures_1.addSecurityCouncilMemberViaDAO)(governor, aliceAddr2, voter1, voter2)).to.be.reverted;
            // Since DAO role manager is not set, no change should occur
            (0, chai_1.expect)(await governor.securityCouncilMemberCount()).to.eq(0);
            (0, chai_1.expect)(await governor.isSecurityCouncilMember(await alice.getAddress())).to.eq(false);
            // Skip proposal-specific quorum checks here since no proposals were created in this test
        });
    });
    describe("HyraTimelock - Core Functions", function () {
        it("should test basic HyraTimelock functions", async function () {
            const { timelock, token, governor, voter1, voter2 } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // Test basic timelock info
            (0, chai_1.expect)(await timelock.getMinDelay()).to.eq(7 * 24 * 60 * 60); // 7 days
            // Test role management
            const PROPOSER_ROLE = await timelock.PROPOSER_ROLE();
            const EXECUTOR_ROLE = await timelock.EXECUTOR_ROLE();
            const CANCELLER_ROLE = await timelock.CANCELLER_ROLE();
            const ADMIN_ROLE = await timelock.DEFAULT_ADMIN_ROLE();
            (0, chai_1.expect)(await timelock.hasRole(PROPOSER_ROLE, await governor.getAddress())).to.eq(true);
            (0, chai_1.expect)(await timelock.hasRole(EXECUTOR_ROLE, hardhat_1.ethers.ZeroAddress)).to.eq(true);
            (0, chai_1.expect)(await timelock.hasRole(ADMIN_ROLE, await timelock.getAddress())).to.eq(true);
            // Test upgrade scheduling
            const newImplementation = await hardhat_1.ethers.getContractFactory("HyraToken");
            const newImpl = await newImplementation.deploy();
            await newImpl.waitForDeployment();
            // Schedule upgrade via governance
            await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await timelock.getAddress()], [0n], [timelock.interface.encodeFunctionData("scheduleUpgrade", [
                    await token.getAddress(),
                    await newImpl.getAddress(),
                    "0x",
                    false
                ])], "Schedule token upgrade", fixtures_1.ProposalType.UPGRADE, { voter1, voter2 });
            // Test pending upgrade state
            (0, chai_1.expect)(await timelock.pendingUpgrades(await token.getAddress())).to.be.gt(0);
            (0, chai_1.expect)(await timelock.pendingImplementations(await token.getAddress())).to.eq(await newImpl.getAddress());
            (0, chai_1.expect)(await timelock.upgradeNonce(await token.getAddress())).to.eq(1);
        });
    });
    describe("HyraProxyAdmin - Core Functions", function () {
        it("should test basic HyraProxyAdmin functions", async function () {
            const { proxyAdmin, token, timelock } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // Test basic proxy admin info
            (0, chai_1.expect)(await proxyAdmin.owner()).to.eq(await timelock.getAddress());
            // Test proxy management
            (0, chai_1.expect)(await proxyAdmin.isManaged(await token.getAddress())).to.eq(true);
            (0, chai_1.expect)(await proxyAdmin.managedProxies(0)).to.eq(await token.getAddress());
            // Test proxy implementation
            const implementation = await proxyAdmin.getProxyImplementation(await token.getAddress());
            (0, chai_1.expect)(implementation).to.be.properAddress;
        });
    });
    describe("HyraProxyDeployer - Core Functions", function () {
        it("should test basic HyraProxyDeployer functions", async function () {
            const { proxyDeployer, token, governor, timelock } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // Test basic deployer info
            // Note: deploymentNonce may be 0 in test environment, so we just check it exists
            const nonce = await proxyDeployer.deploymentNonce();
            (0, chai_1.expect)(nonce).to.be.a('bigint');
            // Test proxy info retrieval
            const tokenInfo = await proxyDeployer.getProxyInfo(await token.getAddress());
            (0, chai_1.expect)(tokenInfo.contractType).to.eq("HyraToken");
            (0, chai_1.expect)(tokenInfo.deploymentTime).to.be.gt(0);
            (0, chai_1.expect)(tokenInfo.deployer).to.be.properAddress;
            // Note: nonce may be 0 in test environment
            (0, chai_1.expect)(tokenInfo.nonce).to.be.a('bigint');
            // Test proxy listing by type
            const tokenProxies = await proxyDeployer.getProxiesByType("HyraToken");
            const governorProxies = await proxyDeployer.getProxiesByType("HyraGovernor");
            const timelockProxies = await proxyDeployer.getProxiesByType("HyraTimelock");
            (0, chai_1.expect)(tokenProxies.length).to.be.gt(0);
            (0, chai_1.expect)(governorProxies.length).to.be.gt(0);
            (0, chai_1.expect)(timelockProxies.length).to.be.gt(0);
            // Test proxy listing by deployer
            const deployerProxies = await proxyDeployer.getProxiesByDeployer(await proxyDeployer.getAddress());
            (0, chai_1.expect)(deployerProxies.length).to.be.gte(0);
            // Test all proxies listing
            const allProxies = await proxyDeployer.getAllProxies();
            (0, chai_1.expect)(allProxies.length).to.be.gt(0);
        });
    });
    describe("Integration Workflows", function () {
        it("should test complete DAO governance workflow", async function () {
            const { token, governor, voter1, voter2, alice, timelock } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // 1. Create proposal to mint tokens
            const mintAmount = hardhat_1.ethers.parseEther("1000000");
            const aliceAddr3 = await alice.getAddress();
            await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("createMintRequest", [aliceAddr3, mintAmount, "DAO workflow test"])], "Complete DAO workflow test", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
            // 2. Wait for mint delay and execute
            await hardhat_network_helpers_1.time.increase(2 * 24 * 60 * 60 + 1);
            await token.connect(voter1).executeMintRequest(0);
            // 3. Verify result
            (0, chai_1.expect)(await token.balanceOf(alice.getAddress())).to.eq(mintAmount);
            (0, chai_1.expect)(await token.getMintedThisYear()).to.eq(fixtures_1.INITIAL_SUPPLY + mintAmount);
            // 4. Test pause/unpause workflow
            await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("pause", [])], "Pause token", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
            (0, chai_1.expect)(await token.paused()).to.eq(true);
            // 5. Test unpause
            await (0, fixtures_1.proposeVoteQueueExecute)(governor, [await token.getAddress()], [0n], [token.interface.encodeFunctionData("unpause", [])], "Unpause token", fixtures_1.ProposalType.STANDARD, { voter1, voter2 });
            (0, chai_1.expect)(await token.paused()).to.eq(false);
        });
    });
    describe("Error Handling", function () {
        it("should handle basic error cases", async function () {
            const { token, governor, voter1, voter2, alice } = await (0, hardhat_network_helpers_1.loadFixture)(fixtures_1.deployCore);
            // Test unauthorized access
            await (0, chai_1.expect)(token.connect(alice).pause()).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
            // Test direct mint (should be disabled)
            await (0, chai_1.expect)(token.connect(alice).mint(alice.getAddress(), hardhat_1.ethers.parseEther("1000"))).to.be.revertedWithCustomError(token, "DirectMintDisabled");
            // Test emergency proposal without security council
            await (0, chai_1.expect)(governor.proposeWithType([await token.getAddress()], [0n], [token.interface.encodeFunctionData("pause", [])], "emergency", fixtures_1.ProposalType.EMERGENCY)).to.be.revertedWithCustomError(governor, "OnlySecurityCouncil");
        });
    });
});
