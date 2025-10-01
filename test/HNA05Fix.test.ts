import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("HNA-05 Fix: TransparentUpgradeableProxy Compatibility", function () {
  async function deployTestContracts() {
    const [owner, proposer1, executor1, alice, bob] = await ethers.getSigners();

    // Deploy HyraTimelock implementation
    const HyraTimelock = await ethers.getContractFactory("HyraTimelock");
    const timelockImplementation = await HyraTimelock.deploy();
    await timelockImplementation.waitForDeployment();

    // Setup role arrays
    const proposers = [proposer1.getAddress()];
    const executors = [executor1.getAddress()];

    // Create proxy and initialize timelock
    const initData = HyraTimelock.interface.encodeFunctionData("initialize", [
      86400, // 1 day delay
      proposers,
      executors,
      owner.getAddress()
    ]);

    const ERC1967Proxy = await ethers.getContractFactory("ERC1967Proxy");
    const timelockProxy = await ERC1967Proxy.deploy(await timelockImplementation.getAddress(), initData);
    await timelockProxy.waitForDeployment();

    const timelock = HyraTimelock.attach(await timelockProxy.getAddress());

    // Deploy HyraProxyAdmin
    const HyraProxyAdmin = await ethers.getContractFactory("HyraProxyAdmin");
    const proxyAdmin = await HyraProxyAdmin.deploy(await timelock.getAddress());
    await proxyAdmin.waitForDeployment();

    // Deploy HyraToken implementations
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImplementation = await HyraToken.deploy();
    await tokenImplementation.waitForDeployment();

    const newTokenImplementation = await HyraToken.deploy();
    await newTokenImplementation.waitForDeployment();

    // Deploy token proxy using HyraTransparentUpgradeableProxy
    const HyraTransparentUpgradeableProxy = await ethers.getContractFactory("HyraTransparentUpgradeableProxy");
    
    const tokenInitData = HyraToken.interface.encodeFunctionData("initialize", [
      "Test Token",
      "TEST",
      ethers.parseEther("1000000"),
      alice.getAddress(),
      bob.getAddress()
    ]);

    const tokenProxy = await HyraTransparentUpgradeableProxy.deploy(
      await tokenImplementation.getAddress(),
      await proxyAdmin.getAddress(),
      tokenInitData
    );
    await tokenProxy.waitForDeployment();

    const token = HyraToken.attach(await tokenProxy.getAddress());

    return {
      timelock,
      proxyAdmin,
      token,
      tokenProxy,
      tokenImplementation,
      newTokenImplementation,
      proposer1,
      executor1,
      alice,
      bob,
      owner
    };
  }

  it("should successfully execute upgrade using HyraProxyAdmin", async function () {
    const {
      timelock,
      proxyAdmin,
      token,
      tokenProxy,
      newTokenImplementation,
      proposer1,
      executor1,
      owner
    } = await loadFixture(deployTestContracts);

    // Add proxy to proxy admin management first
    await proxyAdmin.connect(owner).addProxy(await tokenProxy.getAddress(), "Test Token");
    
    // Schedule upgrade
    await timelock.connect(proposer1).scheduleUpgrade(
      await tokenProxy.getAddress(),
      await newTokenImplementation.getAddress(),
      "0x",
      false
    );

    // Fast forward past delay (7 days)
    await time.increase(7 * 24 * 60 * 60 + 1);

    // Execute upgrade
    await expect(
      timelock.connect(executor1).executeUpgrade(
        await proxyAdmin.getAddress(),
        await tokenProxy.getAddress()
      )
    ).to.not.be.reverted;

    // Verify upgrade was executed successfully
    // Check that the proxy now points to the new implementation
    const currentImplementation = await tokenProxy.implementation();
    expect(currentImplementation).to.equal(await newTokenImplementation.getAddress());
  });

  it("should verify proxy admin is correctly set", async function () {
    const { tokenProxy, proxyAdmin } = await loadFixture(deployTestContracts);

    // Check that the proxy admin is correctly set to HyraProxyAdmin
    const currentAdmin = await tokenProxy.admin();
    expect(currentAdmin).to.equal(await proxyAdmin.getAddress());
  });

  it("should verify implementation function works", async function () {
    const { tokenProxy, tokenImplementation } = await loadFixture(deployTestContracts);

    // Check that the implementation function returns the correct address
    const currentImplementation = await tokenProxy.implementation();
    expect(currentImplementation).to.equal(await tokenImplementation.getAddress());
  });

  it("should allow HyraProxyAdmin to upgrade the proxy directly", async function () {
    const { proxyAdmin, tokenProxy, newTokenImplementation, owner } = await loadFixture(deployTestContracts);

    // Add proxy to management (owner can do this directly)
    await proxyAdmin.connect(owner).connect(owner).addProxy(await tokenProxy.getAddress(), "Test Token");

    // Directly upgrade through HyraProxyAdmin
    await expect(
      proxyAdmin.connect(owner).connect(owner).upgradeAndCall(
        await tokenProxy.getAddress(),
        await newTokenImplementation.getAddress(),
        "0x"
      )
    ).to.not.be.reverted;

    // Verify the upgrade worked
    const currentImplementation = await tokenProxy.implementation();
    expect(currentImplementation).to.equal(await newTokenImplementation.getAddress());
  });

  it("should reject upgrade calls from non-admin addresses", async function () {
    const { tokenProxy, newTokenImplementation, alice } = await loadFixture(deployTestContracts);

    // Try to upgrade from a non-admin address should fail
    await expect(
      tokenProxy.connect(alice).upgradeToAndCall(
        await newTokenImplementation.getAddress(),
        "0x"
      )
    ).to.be.reverted;
  });

  it("should work with HyraProxyDeployer", async function () {
    const { proxyAdmin, alice, bob } = await loadFixture(deployTestContracts);

    // Deploy HyraProxyDeployer
    const HyraProxyDeployer = await ethers.getContractFactory("HyraProxyDeployer");
    const proxyDeployer = await HyraProxyDeployer.deploy();
    await proxyDeployer.waitForDeployment();

    // Deploy a new proxy using the deployer
    const HyraToken = await ethers.getContractFactory("HyraToken");
    const tokenImpl = await HyraToken.deploy();
    await tokenImpl.waitForDeployment();

    const initData = HyraToken.interface.encodeFunctionData("initialize", [
      "Deployed Token",
      "DEPLOY",
      ethers.parseEther("1000000"),
      alice.getAddress(),
      bob.getAddress()
    ]);

    const tx = await proxyDeployer.deployProxy(
      await tokenImpl.getAddress(),
      await proxyAdmin.getAddress(),
      initData,
      "HyraToken"
    );

    await expect(tx).to.not.be.reverted;

    // Get the deployed proxy address from events
    const receipt = await tx.wait();
    const event = receipt?.logs.find(log => {
      try {
        const parsed = proxyDeployer.interface.interface.parseLog(log);
        return parsed?.name === "ProxyDeployed";
      } catch {
        return false;
      }
    });

    expect(event).to.not.be.undefined;
  });
});
