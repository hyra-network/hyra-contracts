// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./HyraTransparentUpgradeableProxy.sol";
import "../interfaces/IHyraProxyDeployer.sol";

/**
 * @title HyraProxyDeployer
 * @notice Factory contract for deploying Hyra protocol proxies
 */
contract HyraProxyDeployer is IHyraProxyDeployer {
    // ============ Structs ============
    struct ProxyInfo {
        address implementation;
        address proxyAdmin;
        string contractType;
        uint256 deploymentTime;
        address deployer;
        uint256 nonce;
        bytes32 salt; // For deterministic deployments
    }
    
    // ============ State Variables ============
    mapping(address => ProxyInfo) public deployedProxies;
    address[] public allProxies;
    uint256 public deploymentNonce;
    
    // ============ Events ============
    event ProxyDeployed(
        address indexed proxy,
        address indexed implementation,
        address indexed proxyAdmin,
        string contractType,
        uint256 nonce
    );
    
    event DeterministicProxyDeployed(
        address indexed proxy,
        address indexed implementation,
        address indexed proxyAdmin,
        bytes32 salt
    );
    
    // ============ Errors ============
    error InvalidImplementation();
    error InvalidAdmin();
    error DeploymentFailed();
    error ProxyAlreadyDeployed();
    error ZeroAddress();
    error InvalidContractType();
    error InvalidProxy();

    /**
     * @notice Deploy a new TransparentUpgradeableProxy
     * @param implementation Initial implementation contract
     * @param proxyAdmin Address of the ProxyAdmin contract
     * @param initData Initialization data
     * @param contractType Type identifier for the contract
     * @return proxy Address of the deployed proxy
     */
    function deployProxy(
        address implementation,
        address proxyAdmin,
        bytes memory initData,
        string memory contractType
    ) external override returns (address proxy) {
        if (implementation == address(0)) revert InvalidImplementation();
        if (proxyAdmin == address(0)) revert InvalidAdmin();
        if (bytes(contractType).length == 0) revert InvalidContractType();
        
        proxy = address(
            new HyraTransparentUpgradeableProxy(
                implementation,
                proxyAdmin,
                initData
            )
        );
        
        if (proxy == address(0)) revert DeploymentFailed();
        
        // Store proxy info
        deployedProxies[proxy] = ProxyInfo({
            implementation: implementation,
            proxyAdmin: proxyAdmin,
            contractType: contractType,
            deploymentTime: block.timestamp,
            deployer: tx.origin, // Use tx.origin for actual deployer
            nonce: deploymentNonce,
            salt: bytes32(0) // Not deterministic
        });
        
        allProxies.push(proxy);
        deploymentNonce++;
        
        emit ProxyDeployed(
            proxy,
            implementation,
            proxyAdmin,
            contractType,
            deploymentNonce - 1
        );
    }

    /**
     * @notice Deploy proxy with CREATE2 for deterministic addresses
     * @param implementation Implementation address
     * @param proxyAdmin ProxyAdmin address
     * @param initData Initialization data
     * @param salt Salt for CREATE2
     * @param contractType Type identifier for the contract
     * @return proxy Address of the deployed proxy
     */
    function deployProxyDeterministic(
        address implementation,
        address proxyAdmin,
        bytes memory initData,
        bytes32 salt,
        string memory contractType
    ) external returns (address proxy) {
        // Generate unique salt to prevent frontrunning
        bytes32 uniqueSalt = keccak256(abi.encodePacked(salt, msg.sender, block.timestamp));
        if (implementation == address(0)) revert InvalidImplementation();
        if (proxyAdmin == address(0)) revert InvalidAdmin();
        if (bytes(contractType).length == 0) revert InvalidContractType();
        
        // Create bytecode for CREATE2
        bytes memory bytecode = abi.encodePacked(
            type(HyraTransparentUpgradeableProxy).creationCode,
            abi.encode(implementation, proxyAdmin, initData)
        );
        
        // Deploy with CREATE2 using unique salt
        assembly {
            proxy := create2(0, add(bytecode, 0x20), mload(bytecode), uniqueSalt)
        }
        
        if (proxy == address(0)) revert DeploymentFailed();
        if (deployedProxies[proxy].deploymentTime != 0) revert ProxyAlreadyDeployed();
        
        // Store proxy info
        deployedProxies[proxy] = ProxyInfo({
            implementation: implementation,
            proxyAdmin: proxyAdmin,
            contractType: contractType,
            deploymentTime: block.timestamp,
            deployer: tx.origin, // Use tx.origin for actual deployer
            nonce: deploymentNonce,
            salt: salt
        });
        
        allProxies.push(proxy);
        deploymentNonce++;
        
        emit DeterministicProxyDeployed(
            proxy,
            implementation,
            proxyAdmin,
            salt
        );
    }

    /**
     * @notice Compute the deployment address for CREATE2
     * @param implementation Implementation address
     * @param proxyAdmin ProxyAdmin address
     * @param initData Initialization data
     * @param salt Salt for CREATE2
     * @return computedAddress The computed proxy address
     */
    function computeProxyAddress(
        address implementation,
        address proxyAdmin,
        bytes memory initData,
        bytes32 salt
    ) external view returns (address computedAddress) {
        bytes memory bytecode = abi.encodePacked(
            type(TransparentUpgradeableProxy).creationCode,
            abi.encode(implementation, proxyAdmin, initData)
        );
        
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(bytecode)
            )
        );
        
        computedAddress = address(uint160(uint256(hash)));
    }

    // ============ View Functions ============

    /**
     * @notice Get all deployed proxies
     * @return Array of proxy addresses
     */
    function getAllProxies() external view returns (address[] memory) {
        return allProxies;
    }

    /**
     * @notice Get proxy count
     * @return Number of deployed proxies
     */
    function getProxyCount() external view returns (uint256) {
        return allProxies.length;
    }

    /**
     * @notice Check if an address is a deployed proxy
     * @param proxy Address to check
     * @return True if the address is a deployed proxy
     */
    function isDeployedProxy(address proxy) external view override returns (bool) {
        return deployedProxies[proxy].deploymentTime != 0;
    }

    /**
     * @notice Get detailed proxy information
     * @param proxy Address of the proxy
     * @return info ProxyInfo struct with all details
     */
    function getProxyInfo(address proxy) external view returns (ProxyInfo memory info) {
        info = deployedProxies[proxy];
        if (info.deploymentTime == 0) revert InvalidProxy();
        return info;
    }

    /**
     * @notice Get proxies by type
     * @param contractType Type of contract to filter by
     * @return proxies Array of proxy addresses of the given type
     */
    function getProxiesByType(string memory contractType) 
        external 
        view 
        returns (address[] memory proxies) 
    {
        uint256 length = allProxies.length;
        uint256 count = 0;
        
        // Count matching proxies
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(bytes(deployedProxies[allProxies[i]].contractType)) == 
                keccak256(bytes(contractType))) {
                count++;
            }
        }
        
        // Collect matching proxies
        proxies = new address[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(bytes(deployedProxies[allProxies[i]].contractType)) == 
                keccak256(bytes(contractType))) {
                proxies[index++] = allProxies[i];
            }
        }
    }

    /**
     * @notice Get proxies deployed by a specific address
     * @param deployer Address of the deployer
     * @return proxies Array of proxy addresses deployed by the deployer
     */
    function getProxiesByDeployer(address deployer) 
        external 
        view 
        returns (address[] memory proxies) 
    {
        uint256 length = allProxies.length;
        uint256 count = 0;
        
        // Count matching proxies
        for (uint256 i = 0; i < length; i++) {
            if (deployedProxies[allProxies[i]].deployer == deployer) {
                count++;
            }
        }
        
        // Collect matching proxies
        proxies = new address[](count);
        uint256 index = 0;
        
        for (uint256 i = 0; i < length; i++) {
            if (deployedProxies[allProxies[i]].deployer == deployer) {
                proxies[index++] = allProxies[i];
            }
        }
    }
}