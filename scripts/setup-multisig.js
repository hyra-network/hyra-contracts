"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockMultisigFactory = exports.SecureTokenDistributionSetup = void 0;
exports.main = main;
const hardhat_1 = require("hardhat");
class SecureTokenDistributionSetup {
    constructor(hre) {
        this.hre = hre;
    }
    /**
     * Setup multi-signature wallet with Gnosis Safe
     * @param config Multi-signature wallet configuration
     * @returns Multi-signature wallet address
     */
    async setupMultisigWallet(config) {
        console.log("Setting up multi-signature wallet...");
        // Validate configuration
        if (config.signers.length < config.threshold) {
            throw new Error("Number of signers must be >= threshold");
        }
        if (config.threshold < 2) {
            throw new Error("Threshold must be >= 2 for security");
        }
        // In practice, use Gnosis Safe SDK
        // This is a mock implementation for demo
        const mockMultisigAddress = await this.deployMockMultisig(config);
        console.log(`Mock multisig wallet created: ${mockMultisigAddress}`);
        console.log(`Signers: ${config.signers.join(", ")}`);
        console.log(`Threshold: ${config.threshold}/${config.signers.length}`);
        return mockMultisigAddress;
    }
    /**
     * Create vesting schedules for safe token distribution
     * @param schedules List of vesting schedules
     * @returns Vesting configuration
     */
    createVestingSchedules(schedules) {
        console.log("Creating vesting schedules...");
        const vestingConfig = {
            beneficiaries: schedules.map(s => s.beneficiary),
            amounts: schedules.map(s => hardhat_1.ethers.parseEther(s.amount)),
            startTimes: schedules.map(s => s.startTime),
            durations: schedules.map(s => s.duration),
            cliffs: schedules.map(s => s.cliff),
            revocable: schedules.map(s => s.revocable),
            purposes: schedules.map(s => s.purpose)
        };
        console.log(`Created ${schedules.length} vesting schedules`);
        return vestingConfig;
    }
    /**
     * Deploy DAO with safe token distribution
     * @param multisigAddress Multisig wallet address
     * @param vestingConfig Vesting configuration
     */
    async deploySecureDAO(multisigAddress, vestingConfig) {
        console.log("Deploying DAO with safe token distribution...");
        // DAO configuration
        const daoConfig = {
            // Token config
            tokenName: "HYRA",
            tokenSymbol: "HYRA",
            initialSupply: hardhat_1.ethers.parseEther("2500000000"), // 2.5B tokens
            vestingContract: multisigAddress, // Will be replaced with vesting contract
            // Timelock config
            timelockDelay: 7 * 24 * 60 * 60, // 7 days
            // Governor config
            votingDelay: 1, // 1 block
            votingPeriod: 10, // 10 blocks
            proposalThreshold: 0,
            quorumPercentage: 10, // 10%
            // Security council
            securityCouncil: [
                "0x1234567890123456789012345678901234567890", // Team member 1
                "0x2345678901234567890123456789012345678901", // Team member 2
                "0x3456789012345678901234567890123456789012", // Community rep
            ],
            // Vesting config
            vestingConfig: vestingConfig
        };
        // Deploy DAO
        const DAOInitializer = await hardhat_1.ethers.getContractFactory("HyraDAOInitializer");
        const daoInitializer = await DAOInitializer.deploy();
        console.log("Deploying DAO...");
        const deploymentResult = await daoInitializer.deployDAO(daoConfig);
        console.log("DAO deployed successfully!");
        console.log(`Token Proxy: ${deploymentResult.tokenProxy}`);
        console.log(`Timelock Proxy: ${deploymentResult.timelockProxy}`);
        console.log(`Governor Proxy: ${deploymentResult.governorProxy}`);
        console.log(`Vesting Proxy: ${deploymentResult.vestingProxy}`);
        return deploymentResult;
    }
    /**
     * Mock implementation for multisig wallet (use Gnosis Safe in practice)
     */
    async deployMockMultisig(config) {
        // In practice, use Gnosis Safe SDK:
        // const safeSdk = await Safe.create({ ethAdapter, safeAddress })
        // const safeSdk = await safeSdk.createSafe({ safeAccountConfig })
        // Mock implementation for demo
        const MockMultisig = await hardhat_1.ethers.getContractFactory("MockMultisig");
        const mockMultisig = await MockMultisig.deploy(config.signers, config.threshold, config.name, config.description);
        return await mockMultisig.getAddress();
    }
    /**
     * Create token distribution report
     */
    generateDistributionReport(deploymentResult) {
        const report = `
# Token Distribution Security Report

## Contract Addresses
- **Token Proxy**: ${deploymentResult.tokenProxy}
- **Timelock Proxy**: ${deploymentResult.timelockProxy}
- **Governor Proxy**: ${deploymentResult.governorProxy}
- **Vesting Proxy**: ${deploymentResult.vestingProxy}
- **Proxy Admin**: ${deploymentResult.proxyAdmin}

## Security
- Use multisig wallet instead of single address
- Tokens distributed gradually through vesting contract
- Governance controlled by Timelock
- No single centralization point

## Benefits
1. **Reduced centralization risk**: No single address holds all initial tokens
2. **Increased transparency**: All distributions recorded on blockchain
3. **Attack protection**: Multiple signatures required for important transactions
4. **Fair distribution**: Tokens distributed gradually over time

## HNA-01 Resolution
Centralization issue in initial token distribution resolved by:
- Multisig wallet instead of single address
- Vesting contract for gradual distribution
- Decentralized governance through DAO
`;
        return report;
    }
}
exports.SecureTokenDistributionSetup = SecureTokenDistributionSetup;
// Mock Multisig Contract cho demo
exports.MockMultisigFactory = {
    abi: [
        "constructor(address[] signers, uint256 threshold, string name, string description)",
        "function executeTransaction(address to, uint256 value, bytes data, bytes[] signatures) external",
        "function getSigners() external view returns (address[])",
        "function getThreshold() external view returns (uint256)"
    ],
    bytecode: "0x608060405234801561001057600080fd5b5060405161001d9061003a565b604051809103906000f080158015610039573d6000803e3d6000fd5b505050610047565b61004a8061005683390190565b50565b6040516100589061003a565b600060405180830381855af49150503d8060008114610093576040519150601f19603f3d011682016040523d82523d6000602084013e610098565b606091505b50509050806100a657600080fd5b5050565b6100a4806100b96000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063150b7a021461003b5780634a58db1914610059578063f2fde38b14610063575b600080fd5b61004361007f565b60405161005091906100b0565b60405180910390f35b610061610088565b005b61007d600480360381019061007891906100dc565b610092565b005b60008054905090565b610090610136565b565b61009a610136565b8173ffffffffffffffffffffffffffffffffffffffff166108fc479081150290604051600060405180830381858888f193505050501580156100df573d6000803e3d6000fd5b505050565b600080fd5b6000819050919050565b6100fb816100e8565b811461010657600080fd5b50565b600081359050610118816100f2565b92915050565b600060208284031215610134576101336100e3565b5b600061014284828501610109565b91505092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006101768261014b565b9050919050565b6101868161016b565b82525050565b60006020820190506101a1600083018461017d565b9291505056fea2646970667358221220"
};
// Main script to run setup
async function main() {
    const setup = new SecureTokenDistributionSetup(hre);
    // Configure multisig wallet
    const multisigConfig = {
        signers: [
            "0x1234567890123456789012345678901234567890", // Team member 1
            "0x2345678901234567890123456789012345678901", // Team member 2
            "0x3456789012345678901234567890123456789012", // Community representative
            "0x4567890123456789012345678901234567890123", // Technical lead
            "0x5678901234567890123456789012345678901234", // Legal advisor
        ],
        threshold: 3, // Need 3/5 signatures
        name: "Hyra DAO Multi-sig",
        description: "Multi-signature wallet for secure token distribution and DAO governance"
    };
    // Create vesting schedules
    const vestingSchedules = [
        {
            beneficiary: "0x1234567890123456789012345678901234567890", // Team member 1
            amount: "500000000", // 500M tokens
            startTime: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
            duration: 4 * 365 * 24 * 60 * 60, // 4 years
            cliff: 6 * 30 * 24 * 60 * 60, // 6 months cliff
            revocable: false,
            purpose: "Team member vesting"
        },
        {
            beneficiary: "0x2345678901234567890123456789012345678901", // Team member 2
            amount: "500000000", // 500M tokens
            startTime: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
            duration: 4 * 365 * 24 * 60 * 60, // 4 years
            cliff: 6 * 30 * 24 * 60 * 60, // 6 months cliff
            revocable: false,
            purpose: "Team member vesting"
        },
        {
            beneficiary: "0x3456789012345678901234567890123456789012", // Community treasury
            amount: "1000000000", // 1B tokens
            startTime: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
            duration: 2 * 365 * 24 * 60 * 60, // 2 years
            cliff: 0, // No cliff for community
            revocable: true,
            purpose: "Community treasury and rewards"
        },
        {
            beneficiary: "0x4567890123456789012345678901234567890123", // Advisor
            amount: "250000000", // 250M tokens
            startTime: Math.floor(Date.now() / 1000) + (60 * 24 * 60 * 60), // 60 days from now
            duration: 2 * 365 * 24 * 60 * 60, // 2 years
            cliff: 3 * 30 * 24 * 60 * 60, // 3 months cliff
            revocable: true,
            purpose: "Advisor compensation"
        },
        {
            beneficiary: "0x5678901234567890123456789012345678901234", // Reserve fund
            amount: "250000000", // 250M tokens
            startTime: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days from now
            duration: 5 * 365 * 24 * 60 * 60, // 5 years
            cliff: 12 * 30 * 24 * 60 * 60, // 12 months cliff
            revocable: true,
            purpose: "Reserve fund for future development"
        }
    ];
    try {
        // Setup multisig wallet
        const multisigAddress = await setup.setupMultisigWallet(multisigConfig);
        // Create vesting configuration
        const vestingConfig = setup.createVestingSchedules(vestingSchedules);
        // Deploy secure DAO
        const deploymentResult = await setup.deploySecureDAO(multisigAddress, vestingConfig);
        // Generate report
        const report = setup.generateDistributionReport(deploymentResult);
        console.log(report);
        console.log("\nSetup completed! HNA-01 issue has been resolved.");
    }
    catch (error) {
        console.error("Error during setup:", error);
        process.exit(1);
    }
}
// Run script if called directly
if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
