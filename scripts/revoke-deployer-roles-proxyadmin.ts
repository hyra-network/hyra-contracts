// scripts/revoke-deployer-roles-proxyadmin.ts
/**
 * Script to revoke deployer roles from SecureProxyAdmin
 * ⚠️  ONLY RUN THIS AFTER:
 * 1. Safe Multisig has all roles
 * 2. Safe Multisig is the owner
 * 3. You've tested Safe can interact with the contract
 * 
 * This script should be executed BY THE SAFE MULTISIG, not by deployer
 */

import { ethers } from "hardhat";

async function main() {
    const [signer] = await ethers.getSigners();
    console.log(`\n⚠️  REVOKING DEPLOYER ROLES FROM SECUREPROXYADMIN`);
    console.log(`Caller: ${await signer.getAddress()}\n`);

    const SECURE_PROXY_ADMIN = "0x2E5d59c47bdf5D0D0255FAf779903935B381594f";
    const DEPLOYER_ADDRESS = "0x424af7536BED1201D67eC27b6849419BAE68070b";
    const SAFE_MULTISIG = "0xa6154bF0334Db14F5f5CB02B3524AF4ABCaE6fF2";

    const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
    const proxyAdmin = SecureProxyAdmin.attach(SECURE_PROXY_ADMIN);

    console.log(`📍 SecureProxyAdmin: ${SECURE_PROXY_ADMIN}`);
    console.log(`👤 Deployer to revoke: ${DEPLOYER_ADDRESS}`);
    console.log(`🏦 Safe Multisig: ${SAFE_MULTISIG}`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Safety checks
    console.log(`\n🛡️  Safety Checks:\n`);

    // Check 1: Verify caller
    const callerAddress = await signer.getAddress();
    console.log(`   1. Caller verification:`);
    console.log(`      Caller: ${callerAddress}`);
    
    if (callerAddress.toLowerCase() !== SAFE_MULTISIG.toLowerCase() && 
        callerAddress.toLowerCase() !== DEPLOYER_ADDRESS.toLowerCase()) {
        console.log(`      ⚠️  Warning: Caller is neither Safe nor Deployer`);
    } else {
        console.log(`      ✅ Caller verified`);
    }

    // Check 2: Verify owner is Safe
    const owner = await proxyAdmin.owner();
    console.log(`\n   2. Owner verification:`);
    console.log(`      Current owner: ${owner}`);
    console.log(`      Is Safe Multisig? ${owner.toLowerCase() === SAFE_MULTISIG.toLowerCase() ? '✅ YES' : '❌ NO'}`);
    
    if (owner.toLowerCase() !== SAFE_MULTISIG.toLowerCase()) {
        console.log(`\n   ❌ SAFETY CHECK FAILED: Owner is not Safe Multisig!`);
        console.log(`   ⚠️  Transfer ownership first using: transfer-proxyadmin-to-safe.ts`);
        console.log(`\n   Aborting for safety.\n`);
        return;
    }

    // Check 3: Verify Safe has all roles
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const MULTISIG_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MULTISIG_ROLE"));
    const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
    const EMERGENCY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EMERGENCY_ROLE"));

    const roles = [
        { name: "DEFAULT_ADMIN_ROLE", hash: DEFAULT_ADMIN_ROLE },
        { name: "MULTISIG_ROLE", hash: MULTISIG_ROLE },
        { name: "GOVERNANCE_ROLE", hash: GOVERNANCE_ROLE },
        { name: "EMERGENCY_ROLE", hash: EMERGENCY_ROLE }
    ];

    console.log(`\n   3. Safe Multisig roles verification:`);
    let allSafeRoles = true;
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, SAFE_MULTISIG);
        console.log(`      ${role.name}: ${hasRole ? '✅ YES' : '❌ NO'}`);
        if (!hasRole) allSafeRoles = false;
    }

    if (!allSafeRoles) {
        console.log(`\n   ❌ SAFETY CHECK FAILED: Safe doesn't have all roles!`);
        console.log(`   ⚠️  Grant roles first using: transfer-proxyadmin-to-safe.ts`);
        console.log(`\n   Aborting for safety.\n`);
        return;
    }

    console.log(`\n   ✅ All safety checks passed!`);

    // Check current deployer roles
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📊 Current Deployer Roles:\n`);

    const deployerRoles = [];
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, DEPLOYER_ADDRESS);
        console.log(`   ${role.name}: ${hasRole ? '🔴 HAS ROLE' : '✅ NO ROLE'}`);
        if (hasRole) {
            deployerRoles.push(role);
        }
    }

    if (deployerRoles.length === 0) {
        console.log(`\n   ✅ Deployer has no roles! Nothing to revoke.\n`);
        return;
    }

    // Confirm revocation
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n⚠️  WARNING: About to revoke ${deployerRoles.length} role(s) from deployer!`);
    console.log(`\n   This action:`);
    console.log(`   • Will remove deployer's admin access permanently`);
    console.log(`   • Cannot be undone by deployer (only by Safe)`);
    console.log(`   • Should only be done after thorough testing`);
    console.log(`\n   Proceeding in 3 seconds...`);

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Revoke roles
    console.log(`\n🔥 Revoking roles...\n`);

    let revokedCount = 0;
    let errorCount = 0;

    for (const role of deployerRoles) {
        try {
            console.log(`   Revoking ${role.name}...`);
            const tx = await proxyAdmin.revokeRole(role.hash, DEPLOYER_ADDRESS, {
                gasLimit: 200_000
            });
            
            console.log(`   Transaction: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`   ✅ Revoked! (Gas: ${receipt.gasUsed})\n`);
            
            revokedCount++;
        } catch (error: any) {
            console.log(`   ❌ Error: ${error.message}\n`);
            errorCount++;
        }
    }

    // Final verification
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ Final Verification:\n`);

    console.log(`   Deployer Roles (should all be NO):`);
    let allRevoked = true;
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, DEPLOYER_ADDRESS);
        console.log(`   ${role.name}: ${hasRole ? '❌ STILL HAS' : '✅ REVOKED'}`);
        if (hasRole) allRevoked = false;
    }

    console.log(`\n   Safe Multisig Roles (should all be YES):`);
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, SAFE_MULTISIG);
        console.log(`   ${role.name}: ${hasRole ? '✅ YES' : '❌ NO'}`);
    }

    // Summary
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📝 Summary:`);
    console.log(`\n   Roles revoked: ${revokedCount}/${deployerRoles.length}`);
    console.log(`   Errors: ${errorCount}`);
    
    if (allRevoked) {
        console.log(`\n   🎉 SUCCESS! Deployer roles fully revoked!`);
        console.log(`   🔐 SecureProxyAdmin is now 100% controlled by Safe Multisig`);
    } else {
        console.log(`\n   ⚠️  Some roles still remain. Please check errors above.`);
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
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

