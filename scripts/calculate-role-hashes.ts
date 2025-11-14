// scripts/calculate-role-hashes.ts
/**
 * Script to calculate all role hashes used in AccessControl
 */

import { ethers } from "hardhat";

async function main() {
    console.log(`\n🔐 Calculating Role Hashes...\n`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Common roles used in contracts
    const roles = [
        "MULTISIG_ROLE",
        "GOVERNANCE_ROLE",
        "EMERGENCY_ROLE",
        "PROPOSER_ROLE",
        "EXECUTOR_ROLE",
        "CANCELLER_ROLE",
        "TIMELOCK_ADMIN_ROLE",
        "MANAGER_ROLE",
        "MINTER_ROLE",
        "PAUSER_ROLE",
        "UPGRADER_ROLE"
    ];

    console.log(`📋 Role Hashes:\n`);

    for (const roleName of roles) {
        const roleHash = ethers.keccak256(ethers.toUtf8Bytes(roleName));
        console.log(`${roleName}:`);
        console.log(`   Hash: ${roleHash}`);
        console.log(``);
    }

    // Also show DEFAULT_ADMIN_ROLE (0x00...00)
    console.log(`DEFAULT_ADMIN_ROLE (Special):`);
    console.log(`   Hash: ${ethers.ZeroHash}`);
    console.log(`   (0x0000000000000000000000000000000000000000000000000000000000000000)`);

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Example: How to use in JavaScript/TypeScript
    console.log(`💡 Usage Example:\n`);
    console.log(`   const { ethers } = require('ethers');\n`);
    console.log(`   // Calculate MULTISIG_ROLE hash`);
    console.log(`   const MULTISIG_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MULTISIG_ROLE"));\n`);
    console.log(`   // Use in hasRole check`);
    console.log(`   const hasRole = await contract.hasRole(MULTISIG_ROLE, address);\n`);

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

// Execute
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

export { main };

