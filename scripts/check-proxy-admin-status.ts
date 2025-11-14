// scripts/check-proxy-admin-status.ts
/**
 * Script to check SecureProxyAdmin status and configuration
 */

import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`\n🔍 Checking SecureProxyAdmin Status...`);
    console.log(`Caller: ${await deployer.getAddress()}\n`);

    const SECURE_PROXY_ADMIN = "0x2E5d59c47bdf5D0D0255FAf779903935B381594f";
    const SAFE_MULTISIG = "0xa6154bF0334Db14F5f5CB02B3524AF4ABCaE6fF2";

    const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
    const proxyAdmin = SecureProxyAdmin.attach(SECURE_PROXY_ADMIN);

    console.log(`📍 Contract Address: ${SECURE_PROXY_ADMIN}`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // 1. Check Owner
    console.log(`\n1️⃣  Owner & Roles:`);
    try {
        const owner = await proxyAdmin.owner();
        console.log(`   Owner: ${owner}`);
        console.log(`   Is Safe Multisig owner? ${owner.toLowerCase() === SAFE_MULTISIG.toLowerCase() ? '✅ YES' : '❌ NO'}`);
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // 2. Check Required Signatures
    console.log(`\n2️⃣  Multi-Signature Settings:`);
    try {
        const requiredSigs = await proxyAdmin.requiredSignatures();
        console.log(`   Required Signatures: ${requiredSigs}`);
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // 3. Check Delays
    console.log(`\n3️⃣  Upgrade Delays:`);
    try {
        const upgradeDelay = await proxyAdmin.UPGRADE_DELAY();
        const emergencyDelay = await proxyAdmin.EMERGENCY_DELAY();
        console.log(`   UPGRADE_DELAY: ${upgradeDelay} seconds (${Number(upgradeDelay) / 3600} hours)`);
        console.log(`   EMERGENCY_DELAY: ${emergencyDelay} seconds (${Number(emergencyDelay) / 3600} hours)`);
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // 4. Check Managed Proxies
    console.log(`\n4️⃣  Managed Proxies:`);
    try {
        const managedProxies = await proxyAdmin.getManagedProxies();
        console.log(`   Total Count: ${managedProxies.length}`);
        
        if (managedProxies.length > 0) {
            console.log(`\n   Proxy List:`);
            for (let i = 0; i < managedProxies.length; i++) {
                const proxyInfo = await proxyAdmin.getProxyByIndex(i);
                console.log(`   ${i + 1}. ${proxyInfo.name}`);
                console.log(`      Address: ${proxyInfo.proxy}`);
                
                // Check if has pending upgrade
                const pending = await proxyAdmin.getPendingUpgrade(proxyInfo.proxy);
                if (pending.executeTime > 0) {
                    console.log(`      ⚠️  Pending Upgrade:`);
                    console.log(`         Implementation: ${pending.implementation}`);
                    console.log(`         Execute Time: ${new Date(Number(pending.executeTime) * 1000).toLocaleString()}`);
                    console.log(`         Is Emergency: ${pending.isEmergency}`);
                    console.log(`         Reason: ${pending.reason}`);
                } else {
                    console.log(`      ✅ No pending upgrade`);
                }
            }
        } else {
            console.log(`   ⚠️  No proxies managed yet!`);
            console.log(`\n   ℹ️  You need to add proxies using:`);
            console.log(`      npx hardhat run scripts/add-proxies-to-admin.ts --network baseSepolia`);
        }
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    // 5. Check Roles
    console.log(`\n5️⃣  Access Control Roles:`);
    
    // Get role hashes
    const MULTISIG_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MULTISIG_ROLE"));
    const GOVERNANCE_ROLE = ethers.keccak256(ethers.toUtf8Bytes("GOVERNANCE_ROLE"));
    const EMERGENCY_ROLE = ethers.keccak256(ethers.toUtf8Bytes("EMERGENCY_ROLE"));
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash; // 0x00...00

    const roles = [
        { name: "DEFAULT_ADMIN_ROLE", hash: DEFAULT_ADMIN_ROLE },
        { name: "MULTISIG_ROLE", hash: MULTISIG_ROLE },
        { name: "GOVERNANCE_ROLE", hash: GOVERNANCE_ROLE },
        { name: "EMERGENCY_ROLE", hash: EMERGENCY_ROLE }
    ];

    const addresses = [
        { name: "Deployer", address: await deployer.getAddress() },
        { name: "Safe Multisig", address: SAFE_MULTISIG }
    ];

    for (const role of roles) {
        console.log(`\n   ${role.name}:`);
        console.log(`   Hash: ${role.hash}`);
        
        for (const addr of addresses) {
            try {
                const hasRole = await proxyAdmin.hasRole(role.hash, addr.address);
                console.log(`   ${addr.name}: ${hasRole ? '✅ HAS ROLE' : '❌ NO ROLE'}`);
            } catch (error: any) {
                console.log(`   ${addr.name}: ❌ Error checking`);
            }
        }
    }

    // 6. Upgrade Nonce
    console.log(`\n6️⃣  Upgrade Tracking:`);
    try {
        const nonce = await proxyAdmin.upgradeNonce();
        console.log(`   Upgrade Nonce: ${nonce}`);
    } catch (error: any) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n✨ Status check completed!\n`);
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

