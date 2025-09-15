// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title IMultiSigProxyAdmin
 * @notice Interface for MultiSigProxyAdmin contract
 */
interface IMultiSigProxyAdmin {
    
    // ============ Structs ============
    struct PendingUpgrade {
        address implementation;
        uint256 executeTime;
        bool isEmergency;
        string reason;
        address proposer;
    }
    
    // ============ Events ============
    event UpgradeProposed(
        address indexed proxy,
        address indexed implementation,
        uint256 executeTime,
        bool isEmergency,
        string reason,
        bytes32 upgradeId
    );
    
    event UpgradeExecuted(
        address indexed proxy,
        address indexed implementation,
        bytes32 upgradeId
    );
    
    event UpgradeCancelled(
        address indexed proxy,
        bytes32 upgradeId
    );
    
    event SignatureAdded(
        bytes32 indexed upgradeId,
        address indexed signer,
        uint256 signatureCount,
        uint256 requiredSignatures
    );
    
    // ============ Functions ============
    
    /**
     * @notice Initialize the MultiSigProxyAdmin
     * @param initialOwner The initial owner (should be multisig wallet)
     * @param _requiredSignatures Number of signatures required for upgrades
     */
    function initialize(address initialOwner, uint256 _requiredSignatures) external;
    
    /**
     * @notice Propose an upgrade with multi-signature requirement
     * @param proxy Address of the proxy to upgrade
     * @param implementation Address of the new implementation
     * @param isEmergency Whether this is an emergency upgrade
     * @param reason Reason for the upgrade
     */
    function proposeUpgrade(
        address proxy,
        address implementation,
        bool isEmergency,
        string memory reason
    ) external;
    
    /**
     * @notice Sign an upgrade proposal
     * @param upgradeId The upgrade proposal ID
     */
    function signUpgrade(bytes32 upgradeId) external;
    
    /**
     * @notice Execute an upgrade after sufficient signatures and delay
     * @param proxy Address of the proxy to upgrade
     */
    function executeUpgrade(address proxy) external;
    
    /**
     * @notice Cancel a pending upgrade
     * @param proxy Address of the proxy
     */
    function cancelUpgrade(address proxy) external;
    
    /**
     * @notice Batch propose upgrades for multiple proxies
     * @param proxies Array of proxy addresses
     * @param implementations Array of new implementation addresses
     * @param reasons Array of reasons for each upgrade
     */
    function batchProposeUpgrade(
        address[] calldata proxies,
        address[] calldata implementations,
        string[] calldata reasons
    ) external;
    
    // ============ View Functions ============
    
    /**
     * @notice Get pending upgrade information
     * @param proxy Address of the proxy
     * @return upgrade Pending upgrade details
     */
    function getPendingUpgrade(address proxy) external view returns (PendingUpgrade memory upgrade);
    
    /**
     * @notice Check if upgrade can be executed
     * @param proxy Address of the proxy
     * @return canExecute Whether upgrade can be executed
     * @return reason Reason if cannot execute
     */
    function canExecuteUpgrade(address proxy) external view returns (bool canExecute, string memory reason);
    
    /**
     * @notice Get signature count for an upgrade
     * @param upgradeId The upgrade proposal ID
     * @return count Number of signatures
     */
    function getSignatureCount(bytes32 upgradeId) external view returns (uint256 count);
    
    /**
     * @notice Check if an address has signed an upgrade
     * @param upgradeId The upgrade proposal ID
     * @param signer Address to check
     * @return hasSigned Whether the address has signed
     */
    function hasSigned(bytes32 upgradeId, address signer) external view returns (bool hasSigned);
}
