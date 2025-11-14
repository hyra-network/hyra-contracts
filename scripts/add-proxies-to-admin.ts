// scripts/add-proxies-to-admin.ts
/**
 * Script to add proxy contracts to SecureProxyAdmin for management
 * This enables SecureProxyAdmin to manage upgrades for these proxies
 */

import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(`\n🔧 Adding proxies to SecureProxyAdmin...`);
    console.log(`Deployer: ${await deployer.getAddress()}\n`);

    // Contract addresses from your deployment
    const SECURE_PROXY_ADMIN = "0x2E5d59c47bdf5D0D0255FAf779903935B381594f";
    
    // Proxy addresses to add
    const proxies = [
        {
            address: "0x2f5e3C7b31dc9375B91f5B75022347aE57d4C45B",
            name: "TokenVesting"
        },
        {
            address: "0x4722887361ccaCB6A122331C9BFc24dDC6cd0890",
            name: "HyraToken"
        },
        {
            address: "0x84916acb85368e2f2135960fd16A7484b8992F5b",
            name: "HyraTimelock"
        },
        {
            address: "0x95A4E418474a0F9912a8359f07E9C80b3B252fA9",
            name: "HyraGovernor"
        }
    ];

    // Get SecureProxyAdmin contract
    const SecureProxyAdmin = await ethers.getContractFactory("SecureProxyAdmin");
    const proxyAdmin = SecureProxyAdmin.attach(SECURE_PROXY_ADMIN);

    console.log(`📋 Current managed proxies:`);
    try {
        const currentProxies = await proxyAdmin.getManagedProxies();
        console.log(`   Count: ${currentProxies.length}`);
        if (currentProxies.length > 0) {
            for (let i = 0; i < currentProxies.length; i++) {
                const proxyInfo = await proxyAdmin.getProxyByIndex(i);
                console.log(`   ${i + 1}. ${proxyInfo.name}: ${proxyInfo.proxy}`);
            }
        } else {
            console.log(`   ⚠️  No proxies managed yet`);
        }
    } catch (error) {
        console.log(`   ❌ Error reading current proxies:`, error);
    }

    console.log(`\n🚀 Adding proxies to SecureProxyAdmin...\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const proxy of proxies) {
        try {
            console.log(`Adding: ${proxy.name} (${proxy.address})...`);
            
            // Check if already managed
            const isManaged = await proxyAdmin.isManaged(proxy.address);
            if (isManaged) {
                console.log(`   ℹ️  Already managed, skipping\n`);
                successCount++;
                continue;
            }

            // Add proxy
            const tx = await proxyAdmin.addProxy(proxy.address, proxy.name, {
                gasLimit: 500_000
            });
            
            console.log(`   Transaction: ${tx.hash}`);
            const receipt = await tx.wait();
            console.log(`   ✅ Added successfully! (Gas used: ${receipt.gasUsed})`);
            console.log(`   Block: ${receipt.blockNumber}\n`);
            
            successCount++;
        } catch (error: any) {
            console.log(`   ❌ Error: ${error.message}\n`);
            errorCount++;
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Successfully added: ${successCount}/${proxies.length}`);
    console.log(`   ❌ Failed: ${errorCount}/${proxies.length}`);

    // Verify final state
    console.log(`\n🔍 Verifying final state...`);
    try {
        const finalProxies = await proxyAdmin.getManagedProxies();
        console.log(`   Total managed proxies: ${finalProxies.length}`);
        
        if (finalProxies.length > 0) {
            console.log(`\n   Managed proxies list:`);
            for (let i = 0; i < finalProxies.length; i++) {
                const proxyInfo = await proxyAdmin.getProxyByIndex(i);
                console.log(`   ${i + 1}. ${proxyInfo.name}: ${proxyInfo.proxy}`);
            }
        }
    } catch (error) {
        console.log(`   ❌ Error verifying:`, error);
    }

    console.log(`\n✨ Done!`);
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

