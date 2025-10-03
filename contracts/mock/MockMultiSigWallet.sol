// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

/**
 * @title MockMultiSigWallet
 * @notice Mock implementation of a multi-signature wallet for testing
 * @dev Simulates Gnosis Safe functionality for HNA-02 security testing
 */
contract MockMultiSigWallet is AccessControlUpgradeable {
    
    // ============ Constants ============
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    
    // ============ State Variables ============
    address[] public signers;
    uint256 public requiredSignatures;
    uint256 public nonce;
    
    // Transaction tracking
    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 confirmations;
        mapping(address => bool) confirmed;
    }
    
    mapping(uint256 => Transaction) public transactions;
    
    // ============ Events ============
    event TransactionSubmitted(
        uint256 indexed txId,
        address indexed to,
        uint256 value,
        bytes data
    );
    
    event TransactionConfirmed(
        uint256 indexed txId,
        address indexed signer
    );
    
    event TransactionExecuted(
        uint256 indexed txId,
        bool success,
        bytes returnData
    );
    
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event RequiredSignaturesUpdated(uint256 oldRequired, uint256 newRequired);
    
    // ============ Errors ============
    error InvalidSigner();
    error InsufficientSignatures();
    error TransactionAlreadyExecuted();
    error TransactionNotConfirmed();
    error AlreadyConfirmed();
    error InvalidRequiredSignatures();
    error Unauthorized();
    error TransactionFailed();
    
    /**
     * @notice Initialize the multi-signature wallet
     * @param _signers Array of signer addresses
     * @param _requiredSignatures Number of signatures required
     */
    function initialize(
        address[] memory _signers,
        uint256 _requiredSignatures
    ) external initializer {
        if (_signers.length == 0) revert InvalidSigner();
        if (_requiredSignatures == 0 || _requiredSignatures > _signers.length) {
            revert InvalidRequiredSignatures();
        }
        
        __AccessControl_init();
        
        requiredSignatures = _requiredSignatures;
        
        // FIXED: Add event for required signatures
        emit RequiredSignaturesUpdated(0, _requiredSignatures);
        
        // Add signers
        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == address(0)) revert InvalidSigner();
            signers.push(_signers[i]);
            _grantRole(SIGNER_ROLE, _signers[i]);
        }
        
        // Set admin role
        _grantRole(ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @notice Submit a transaction for approval
     * @param to Destination address
     * @param value ETH value to send
     * @param data Call data
     * @return txId Transaction ID
     */
    function submitTransaction(
        address to,
        uint256 value,
        bytes memory data
    ) external onlyRole(SIGNER_ROLE) returns (uint256 txId) {
        txId = nonce++;
        
        Transaction storage transaction = transactions[txId];
        transaction.to = to;
        transaction.value = value;
        transaction.data = data;
        transaction.executed = false;
        transaction.confirmations = 0;
        
        // Auto-confirm by submitter
        transaction.confirmed[msg.sender] = true;
        transaction.confirmations = 1;
        
        emit TransactionSubmitted(txId, to, value, data);
        emit TransactionConfirmed(txId, msg.sender);
    }
    
    /**
     * @notice Confirm a transaction
     * @param txId Transaction ID
     */
    function confirmTransaction(uint256 txId) external onlyRole(SIGNER_ROLE) {
        Transaction storage transaction = transactions[txId];
        
        if (transaction.executed) revert TransactionAlreadyExecuted();
        if (transaction.confirmed[msg.sender]) revert AlreadyConfirmed();
        
        transaction.confirmed[msg.sender] = true;
        transaction.confirmations++;
        
        emit TransactionConfirmed(txId, msg.sender);
    }
    
    /**
     * @notice Execute a confirmed transaction
     * @param txId Transaction ID
     */
    function executeTransaction(uint256 txId) external {
        Transaction storage transaction = transactions[txId];
        
        if (transaction.executed) revert TransactionAlreadyExecuted();
        if (transaction.confirmations < requiredSignatures) revert InsufficientSignatures();
        
        transaction.executed = true;
        
        (bool success, bytes memory returnData) = transaction.to.call{value: transaction.value}(transaction.data);
        
        if (!success) {
            revert TransactionFailed();
        }
        
        emit TransactionExecuted(txId, success, returnData);
    }
    
    /**
     * @notice Add a new signer
     * @param signer Address of the new signer
     */
    function addSigner(address signer) external onlyRole(ADMIN_ROLE) {
        if (signer == address(0)) revert InvalidSigner();
        
        signers.push(signer);
        _grantRole(SIGNER_ROLE, signer);
        
        emit SignerAdded(signer);
    }
    
    /**
     * @notice Remove a signer
     * @param signer Address of the signer to remove
     */
    function removeSigner(address signer) external onlyRole(ADMIN_ROLE) {
        if (!hasRole(SIGNER_ROLE, signer)) revert InvalidSigner();
        
        // Remove from array
        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == signer) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }
        
        _revokeRole(SIGNER_ROLE, signer);
        
        emit SignerRemoved(signer);
    }
    
    /**
     * @notice Update required signatures
     * @param _requiredSignatures New required signatures count
     */
    function updateRequiredSignatures(uint256 _requiredSignatures) external onlyRole(ADMIN_ROLE) {
        if (_requiredSignatures == 0 || _requiredSignatures > signers.length) {
            revert InvalidRequiredSignatures();
        }
        
        uint256 oldRequired = requiredSignatures;
        requiredSignatures = _requiredSignatures;
        
        emit RequiredSignaturesUpdated(oldRequired, _requiredSignatures);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Get all signers
     * @return Array of signer addresses
     */
    function getSigners() external view returns (address[] memory) {
        return signers;
    }
    
    /**
     * @notice Get signer count
     * @return Number of signers
     */
    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }
    
    /**
     * @notice Check if address is a signer
     * @param signer Address to check
     * @return isSigner Whether address is a signer
     */
    function isSigner(address signer) external view returns (bool) {
        return hasRole(SIGNER_ROLE, signer);
    }
    
    /**
     * @notice Get transaction details
     * @param txId Transaction ID
     * @return to Destination address
     * @return value ETH value
     * @return data Call data
     * @return executed Whether executed
     * @return confirmations Number of confirmations
     */
    function getTransaction(uint256 txId) external view returns (
        address to,
        uint256 value,
        bytes memory data,
        bool executed,
        uint256 confirmations
    ) {
        Transaction storage transaction = transactions[txId];
        return (transaction.to, transaction.value, transaction.data, transaction.executed, transaction.confirmations);
    }
    
    /**
     * @notice Check if signer has confirmed transaction
     * @param txId Transaction ID
     * @param signer Signer address
     * @return confirmed Whether confirmed
     */
    function isConfirmed(uint256 txId, address signer) external view returns (bool confirmed) {
        Transaction storage transaction = transactions[txId];
        return transaction.confirmed[signer];
    }
    
    /**
     * @notice Check if transaction can be executed
     * @param txId Transaction ID
     * @return canExecute Whether can execute
     */
    function canExecute(uint256 txId) external view returns (bool) {
        Transaction storage transaction = transactions[txId];
        return !transaction.executed && transaction.confirmations >= requiredSignatures;
    }
    
    // ============ Receive Function ============
    receive() external payable {}
}
