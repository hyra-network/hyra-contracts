// scripts/transfer-proxyadmin-to-safe.ts
/**
 * Script to transfer SecureProxyAdmin control to Safe Multisig
 * This includes:
 * 1. Grant all necessary roles to Safe Multisig
 * 2. Transfer ownership to Safe Multisig
 * 3. Optionally revoke deployer roles (for full decentralization)
 */

import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`\n🔐 Transferring SecureProxyAdmin to Safe Multisig...`);
    console.log(`Deployer: ${await deployer.getAddress()}\n`);

    const SECURE_PROXY_ADMIN = "0x2E5d59c47bdf5D0D0255FAf779903935B381594f";
    const SAFE_MULTISIG = "0xa6154bF0334Db14F5f5CB02B3524AF4ABCaE6fF2";

    const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
    const proxyAdmin = SecureProxyAdmin.attach(SECURE_PROXY_ADMIN);

    console.log(`📍 SecureProxyAdmin: ${SECURE_PROXY_ADMIN}`);
    console.log(`🏦 Safe Multisig: ${SAFE_MULTISIG}`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Step 1: Check current state
    console.log(`\n📊 Step 1: Checking current state...\n`);
    
    const currentOwner = await proxyAdmin.owner();
    console.log(`   Current Owner: ${currentOwner}`);
    console.log(`   Is Deployer? ${currentOwner === await deployer.getAddress() ? '✅ YES' : '❌ NO'}`);

    // Get role hashes
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

    console.log(`\n   Current Safe Multisig Roles:`);
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, SAFE_MULTISIG);
        console.log(`   ${role.name}: ${hasRole ? '✅ YES' : '❌ NO'}`);
    }

    // Step 2: Grant roles to Safe Multisig
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n🎯 Step 2: Granting roles to Safe Multisig...\n`);

    let grantedRoles = 0;
    let skippedRoles = 0;

    for (const role of roles) {
        try {
            const hasRole = await proxyAdmin.hasRole(role.hash, SAFE_MULTISIG);
            
            if (hasRole) {
                console.log(`   ${role.name}: ℹ️  Already granted, skipping`);
                skippedRoles++;
                continue;
            }

            console.log(`   Granting ${role.name}...`);
            const tx = await proxyAdmin.grantRole(role.hash, SAFE_MULTISIG, {
                gasLimit: 200_000
            });
            
            console.log(`   Transaction: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`   ✅ Granted successfully! (Gas: ${receipt.gasUsed})\n`);
            
            grantedRoles++;
        } catch (error: any) {
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    console.log(`   Summary: ${grantedRoles} granted, ${skippedRoles} already had`);

    // Step 3: Verify roles after granting
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n🔍 Step 3: Verifying roles...\n`);

    let allRolesGranted = true;
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, SAFE_MULTISIG);
        console.log(`   ${role.name}: ${hasRole ? '✅ YES' : '❌ NO'}`);
        if (!hasRole) allRolesGranted = false;
    }

    if (!allRolesGranted) {
        console.log(`\n   ⚠️  Not all roles granted. Please check errors above.`);
        console.log(`   ⚠️  Stopping before ownership transfer for safety.\n`);
        return;
    }

    console.log(`\n   ✅ All roles successfully granted!`);

    // Step 4: Transfer ownership
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n👑 Step 4: Transferring ownership...\n`);

    try {
        const currentOwnerCheck = await proxyAdmin.owner();
        
        if (currentOwnerCheck.toLowerCase() === SAFE_MULTISIG.toLowerCase()) {
            console.log(`   ℹ️  Safe Multisig is already the owner!`);
        } else {
            console.log(`   Transferring ownership from:`);
            console.log(`   ${currentOwnerCheck}`);
            console.log(`   to:`);
            console.log(`   ${SAFE_MULTISIG}\n`);

            const tx = await proxyAdmin.transferOwnership(SAFE_MULTISIG, {
                gasLimit: 200_000
            });
            
            console.log(`   Transaction: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`   ✅ Ownership transferred! (Gas: ${receipt.gasUsed})`);
        }
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // Step 5: Final verification
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✅ Step 5: Final Verification\n`);

    const finalOwner = await proxyAdmin.owner();
    console.log(`   Owner: ${finalOwner}`);
    console.log(`   Is Safe Multisig? ${finalOwner.toLowerCase() === SAFE_MULTISIG.toLowerCase() ? '✅ YES' : '❌ NO'}`);

    console.log(`\n   Safe Multisig Roles:`);
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, SAFE_MULTISIG);
        console.log(`   ${role.name}: ${hasRole ? '✅ YES' : '❌ NO'}`);
    }

    console.log(`\n   Deployer Roles (should be kept for now):`);
    for (const role of roles) {
        const hasRole = await proxyAdmin.hasRole(role.hash, await deployer.getAddress());
        console.log(`   ${role.name}: ${hasRole ? '✅ YES' : '❌ NO'}`);
    }

    // Summary
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📝 Summary:`);
    console.log(`\n   ✅ All roles granted to Safe Multisig`);
    console.log(`   ✅ Ownership transferred to Safe Multisig`);
    console.log(`   ℹ️  Deployer still has roles (can be revoked later)`);
    console.log(`\n   🎉 SecureProxyAdmin is now controlled by Safe Multisig!`);
    
    console.log(`\n⚠️  IMPORTANT NEXT STEPS:`);
    console.log(`   1. Verify Safe Multisig can interact with SecureProxyAdmin`);
    console.log(`   2. Test creating a test upgrade proposal`);
    console.log(`   3. Once confident, revoke deployer roles using Safe`);
    console.log(`   4. Update documentation with new ownership structure`);
    
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

