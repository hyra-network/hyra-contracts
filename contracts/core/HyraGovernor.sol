// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/governance/GovernorUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorSettingsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesQuorumFractionUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorTimelockControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";
import "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC6372.sol";
import "../interfaces/IHyraGovernor.sol";
import "../security/DAORoleManager.sol";

/**
 * @title HyraGovernor
 * @notice DAO governance contract for proposal management and voting
 * @dev PRIVILEGED ROLES:
 *      - _governance: Can add/remove security council members
 *      - Security Council: Can create emergency proposals and cancel any proposal
 *      See: https://docs.hyra.network/security for role management guidelines.
 */
contract HyraGovernor is
    Initializable,
    ReentrancyGuardUpgradeable,
    GovernorUpgradeable,
    GovernorSettingsUpgradeable,
    GovernorCountingSimpleUpgradeable,
    GovernorVotesUpgradeable,
    GovernorVotesQuorumFractionUpgradeable,
    GovernorTimelockControlUpgradeable,
    IHyraGovernor
{   
    // ============ State Variables ============
    mapping(uint256 => ProposalType) public proposalTypes;
    mapping(uint256 => bool) public proposalCancelled;
    mapping(address => bool) public securityCouncilMembers;
    mapping(uint256 => address) private _proposalProposers; // Track proposers for v5
    uint256 public securityCouncilMemberCount;
    
    // DAO Role Manager for decentralized role management
    DAORoleManager public roleManager;
    
    // Privileged Multisig Wallet - This wallet has elevated privileges for creating UPGRADE, CONSTITUTIONAL, EMERGENCY, MINT REQUEST proposals
    // and can be used for other privileged operations like tokenMintFeed
    address public privilegedMultisigWallet;
    
    // Quorum percentages (basis points)
    // Hierarchy: STANDARD < EMERGENCY < UPGRADE < CONSTITUTIONAL
    uint256 public constant STANDARD_QUORUM = 500; // 5% - Regular proposals
    uint256 public constant EMERGENCY_QUORUM = 1000; // 10% - Emergency proposals (higher for security)
    uint256 public constant UPGRADE_QUORUM = 1500; // 15% - Contract upgrades
    uint256 public constant CONSTITUTIONAL_QUORUM = 2500; // 25% - Constitutional changes
    
    // Minimum quorum to prevent governance attacks
    uint256 public constant MINIMUM_QUORUM = 100; // 1% minimum
    
    // Mint request proposal threshold (3% of total supply, can be updated by privileged multisig)
    uint256 public mintRequestThresholdBps = 300; // 3% in basis points (default)
    
    // Storage gap for upgradeability
    uint256[42] private __gap; // Reduced by 2 (privilegedMultisigWallet + mintRequestThresholdBps)

    // ============ Events ============
    event ProposalTypeSet(uint256 indexed proposalId, ProposalType proposalType);
    event ProposalCancelled(uint256 indexed proposalId);
    event SecurityCouncilMemberAdded(address indexed member);
    event SecurityCouncilMemberRemoved(address indexed member);
    event ProposalCreatedWithType(
        uint256 indexed proposalId,
        address proposer,
        ProposalType proposalType
    );
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    event VoteCasted(address indexed voter, uint256 proposalId, uint8 support, uint256 weight);
    event PrivilegedMultisigWalletSet(address indexed oldWallet, address indexed newWallet);
    event MintRequestThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // ============ Errors ============
    error InvalidProposalType();
    error OnlySecurityCouncil();
    error NotSecurityCouncilMember();
    error AlreadySecurityCouncilMember();
    error ProposalAlreadyCancelled();
    error UnauthorizedCancellation();
    error InvalidProposalLength();
    error ZeroAddress();
    error ProposalNotFound();
    error VotingNotActive();
    error InsufficientVotingPowerForMintRequest();
    error NotPrivilegedMultisig();
    error NotContract();
    error InsufficientVotingPowerForStandardProposal();
    error OnlyPrivilegedMultisigWallet();
    error InvalidMintRequestThreshold();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    /**
     * @notice Initialize the Governor contract
     * @param _token The voting token (HyraToken)
     * @param _timelock The timelock controller
     * @param _votingDelay Delay before voting starts (blocks)
     * @param _votingPeriod Duration of voting (blocks)
     * @param _proposalThreshold Min tokens to create proposal
     * @param _quorumPercentage Initial quorum percentage
     * @param _privilegedMultisigWallet Address of privileged multisig wallet (can be zero, set later via governance)
     */
    function initialize(
        IVotes _token,
        TimelockControllerUpgradeable _timelock,
        uint256 _votingDelay,
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage,
        address _privilegedMultisigWallet
    ) public initializer {
        // FIXED: Add zero address validation
        if (address(_token) == address(0)) revert ZeroAddress();
        if (address(_timelock) == address(0)) revert ZeroAddress();
        __Governor_init("HyraGovernor");
        __GovernorSettings_init(uint48(_votingDelay), uint32(_votingPeriod), _proposalThreshold);
        __GovernorCountingSimple_init();
        __GovernorVotes_init(_token);
        __GovernorVotesQuorumFraction_init(_quorumPercentage);
        __GovernorTimelockControl_init(_timelock);
        
        // Set privileged multisig wallet if provided
        if (_privilegedMultisigWallet != address(0)) {
            // Validate that address is a contract (multisig wallet)
            uint256 codeSize;
            assembly {
                codeSize := extcodesize(_privilegedMultisigWallet)
            }
            if (codeSize == 0) revert NotContract();
            
            privilegedMultisigWallet = _privilegedMultisigWallet;
            emit PrivilegedMultisigWalletSet(address(0), _privilegedMultisigWallet);
        }
        
        // Initialize mint request threshold to default 3% (300 bps)
        mintRequestThresholdBps = 300;
    }

    // ============ Proposal Functions ============

    /**
     * @notice Create a proposal with specific type
     * @param targets Target addresses for calls
     * @param values ETH values for calls
     * @param calldatas Encoded function calls
     * @param description Proposal description
     * @param proposalType Type of proposal
     */
    function proposeWithType(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        ProposalType proposalType
    ) public returns (uint256) {
        // Validate proposal type
        if (uint8(proposalType) > uint8(ProposalType.UPGRADE)) {
            revert InvalidProposalType();
        }
        
        bool isPrivilegedMultisigWallet = isPrivilegedMultisig(msg.sender);
        
        // Check proposal type requirements
        if (proposalType == ProposalType.STANDARD) {
            // STANDARD proposals require 3% total supply voting power
            uint256 votingPower = token().getVotes(msg.sender);
            uint256 requiredThreshold = calculateMintRequestThreshold(); // 3% threshold
            
            if (votingPower < requiredThreshold) {
                revert InsufficientVotingPowerForStandardProposal();
            }
        } else if (
            proposalType == ProposalType.UPGRADE ||
            proposalType == ProposalType.CONSTITUTIONAL ||
            proposalType == ProposalType.EMERGENCY
        ) {
            // UPGRADE, CONSTITUTIONAL, EMERGENCY proposals require Privileged Multisig Wallet
            if (!isPrivilegedMultisigWallet) {
                revert OnlyPrivilegedMultisigWallet();
            }
        }
        // MINT REQUEST proposals are validated in propose() function
        
        // Validate proposal arrays
        if (!_validateProposal(targets, values, calldatas)) {
            revert InvalidProposalLength();
        }
        
        // propose() will handle mint request validation
        uint256 proposalId = propose(targets, values, calldatas, description);
        proposalTypes[proposalId] = proposalType;
        // Removed duplicate _proposalProposers assignment
        
        emit ProposalTypeSet(proposalId, proposalType);
        emit ProposalCreatedWithType(proposalId, msg.sender, proposalType);
        
        return proposalId;
    }

    /**
     * @notice Get proposal proposer (required for v5)
     * @param proposalId The proposal ID
     */
    function proposalProposer(uint256 proposalId) public view override(GovernorUpgradeable, IGovernor) returns (address) {
        return _proposalProposers[proposalId];
    }

    /**
     * @notice Cancel a proposal
     */
    function cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) public override(GovernorUpgradeable, IGovernor) nonReentrant returns (uint256) {
        uint256 proposalId = hashProposal(targets, values, calldatas, descriptionHash);
        
        // Checks: Verify proposal state and authorization
        ProposalState currentState = state(proposalId);
        if (currentState == ProposalState.Canceled) {
            revert ProposalAlreadyCancelled();
        }
        
        // Check authorization - proposer or security council can cancel
        address proposer = proposalProposer(proposalId);
        if (msg.sender != proposer && !securityCouncilMembers[msg.sender]) {
            revert UnauthorizedCancellation();
        }
        
        // Interactions: Call OpenZeppelin's trusted cancel logic first
        // This allows OZ to handle state transitions properly before we mark it cancelled
        if (securityCouncilMembers[msg.sender]) {
            // Directly call internal _cancel function
            _cancel(targets, values, calldatas, descriptionHash);
        } else {
            // For proposers, use parent function
            super.cancel(targets, values, calldatas, descriptionHash);
        }
        
        // Effects: Update our custom cancellation tracking after OZ cancel completes
        // This must be done AFTER super.cancel() to avoid interfering with OZ's state() checks
        proposalCancelled[proposalId] = true;
        emit ProposalCancelled(proposalId);
        
        return proposalId;
    }

    // ============ DAO Role Management Functions ============
    
    /**
     * @notice Set the DAO Role Manager (only governance)
     * @param _roleManager Address of the DAO Role Manager
     */
    function setRoleManager(DAORoleManager _roleManager) external onlyGovernance {
        // FIXED: Add zero address validation
        if (address(_roleManager) == address(0)) revert ZeroAddress();
        roleManager = _roleManager;
    }
    
    /**
     * @notice Set the Privileged Multisig Wallet (only governance)
     * @param _privilegedMultisigWallet Address of the privileged multisig wallet
     * @dev This wallet has elevated privileges for creating UPGRADE, CONSTITUTIONAL, EMERGENCY, MINT REQUEST proposals
     *      and can be used for other privileged operations like tokenMintFeed
     */
    function setPrivilegedMultisigWallet(address _privilegedMultisigWallet) external onlyGovernance {
        if (_privilegedMultisigWallet == address(0)) revert ZeroAddress();
        
        // Validate that address is a contract (multisig wallet)
        uint256 codeSize;
        assembly {
            codeSize := extcodesize(_privilegedMultisigWallet)
        }
        if (codeSize == 0) revert NotContract();
        
        address oldWallet = privilegedMultisigWallet;
        privilegedMultisigWallet = _privilegedMultisigWallet;
        
        emit PrivilegedMultisigWalletSet(oldWallet, _privilegedMultisigWallet);
    }

    // ============ Security Council Functions ============

    /**
     * @notice Add a security council member (decentralized via DAO role manager)
     * @param _member Address to add
     */
    function addSecurityCouncilMember(address _member) 
        external 
    {
        if (_member == address(0)) revert ZeroAddress();
        if (securityCouncilMembers[_member]) revert AlreadySecurityCouncilMember();
        
        // Check if caller has governance role through DAO role manager
        if (address(roleManager) != address(0)) {
            require(
                roleManager.hasRole(roleManager.GOVERNANCE_ROLE(), msg.sender),
                "Only governance role holders can add security council members"
            );
        } else {
            // Fallback: only allow if no role manager is set (deployment phase)
            revert("DAO role manager must be set for security council management");
        }
        
        securityCouncilMembers[_member] = true;
        securityCouncilMemberCount++;
        
        emit SecurityCouncilMemberAdded(_member);
    }

    /**
     * @notice Remove a security council member (decentralized via DAO role manager)
     * @param _member Address to remove
     */
    function removeSecurityCouncilMember(address _member) 
        external 
    {
        if (!securityCouncilMembers[_member]) revert NotSecurityCouncilMember();
        
        // Check if caller has governance role through DAO role manager
        if (address(roleManager) != address(0)) {
            require(
                roleManager.hasRole(roleManager.GOVERNANCE_ROLE(), msg.sender),
                "Only governance role holders can remove security council members"
            );
        } else {
            // Fallback: only allow if no role manager is set (deployment phase)
            revert("DAO role manager must be set for security council management");
        }
        
        securityCouncilMembers[_member] = false;
        securityCouncilMemberCount--;
        
        emit SecurityCouncilMemberRemoved(_member);
    }

    // ============ Internal Functions ============

    /**
     * @notice Validate proposal parameters
     * @param targets Array of target addresses
     * @param values Array of ETH values
     * @param calldatas Array of encoded function calls
     * @return valid True if parameters are valid
     */
    function _validateProposal(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas
    ) private pure returns (bool valid) {
        uint256 length = targets.length;
        valid = length == values.length && 
                length == calldatas.length && 
                length > 0 && 
                length <= 10; // Max 10 operations per proposal
    }
    
    /**
     * @notice Check if proposal is a mint request proposal
     * @param targets Array of target addresses
     * @param calldatas Array of encoded function calls
     * @return True if proposal calls createMintRequest() on HyraToken
     */
    function _isMintRequestProposal(
        address[] memory targets,
        bytes[] memory calldatas
    ) internal view returns (bool) {
        // Function selector for createMintRequest(address,uint256,string)
        // Calculated: keccak256("createMintRequest(address,uint256,string)")[0:4]
        bytes4 createMintRequestSelector = 0x121eb9e2;
        
        for (uint256 i = 0; i < targets.length; i++) {
            // Check if target is the token contract
            if (targets[i] == address(token())) {
                // Check if calldata starts with createMintRequest selector
                if (calldatas[i].length >= 4) {
                    bytes4 selector = bytes4(calldatas[i]);
                    if (selector == createMintRequestSelector) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    
    /**
     * @notice Check if address is the privileged multisig wallet
     * @param account Address to check
     * @return True if account is the privileged multisig wallet
     */
    function isPrivilegedMultisig(address account) public view returns (bool) {
        return account == privilegedMultisigWallet && privilegedMultisigWallet != address(0);
    }
    
    /**
     * @notice Calculate dynamic proposal threshold for mint requests
     * @return The required voting power threshold in tokens
     */
    function calculateMintRequestThreshold() public view returns (uint256) {
        uint256 totalSupply = token().getPastTotalSupply(block.number - 1);
        return (totalSupply * mintRequestThresholdBps) / 10000;
    }

    /**
     * @notice Set mint request proposal threshold (only privileged multisig wallet)
     * @param _newThreshold New threshold in basis points (e.g., 300 = 3%, 400 = 4%)
     * @dev Minimum: 100 (1%), Maximum: 1000 (10%) to prevent abuse
     */
    function setMintRequestThreshold(uint256 _newThreshold) external {
        if (!isPrivilegedMultisig(msg.sender)) {
            revert OnlyPrivilegedMultisigWallet();
        }
        
        // Validate threshold: between 1% (100 bps) and 10% (1000 bps)
        if (_newThreshold < 100 || _newThreshold > 1000) {
            revert InvalidMintRequestThreshold();
        }
        
        uint256 oldThreshold = mintRequestThresholdBps;
        mintRequestThresholdBps = _newThreshold;
        
        emit MintRequestThresholdUpdated(oldThreshold, _newThreshold);
    }

    /**
     * @notice Store proposer when proposal is created (v5 requirement)
     */
    function _propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        address proposer
    ) internal override returns (uint256 proposalId) {
        proposalId = super._propose(targets, values, calldatas, description, proposer);
        _proposalProposers[proposalId] = proposer;
        return proposalId;
    }

    // ============ View Functions ============

    /**
     * @notice Get custom quorum for a proposal based on its type
     * @param proposalId The proposal ID
     * @return The required quorum for this proposal
     */
    function getProposalQuorum(uint256 proposalId) 
        public 
        view 
        returns (uint256) 
    {
        // Validate proposal exists
        uint256 snapshot = proposalSnapshot(proposalId);
        if (snapshot == 0) {
            revert ProposalNotFound();
        }
        
        ProposalType pType = proposalTypes[proposalId];
        uint256 supply = token().getPastTotalSupply(snapshot);
        
        // Prevent division by zero and ensure minimum quorum
        if (supply == 0) {
            return 0;
        }
        
        uint256 quorumPercentage;
        if (pType == ProposalType.EMERGENCY) {
            quorumPercentage = EMERGENCY_QUORUM;
        } else if (pType == ProposalType.CONSTITUTIONAL) {
            quorumPercentage = CONSTITUTIONAL_QUORUM;
        } else if (pType == ProposalType.UPGRADE) {
            quorumPercentage = UPGRADE_QUORUM;
        } else {
            quorumPercentage = STANDARD_QUORUM;
        }
        
        uint256 calculatedQuorum = (supply * quorumPercentage) / 10000;
        
        // Apply minimum quorum protection
        uint256 minimumQuorum = (supply * MINIMUM_QUORUM) / 10000;
        
        return calculatedQuorum > minimumQuorum ? calculatedQuorum : minimumQuorum;
    }

    /**
     * @notice Check if address is security council member
     */
    function isSecurityCouncilMember(address _account) 
        external 
        view 
        returns (bool) 
    {
        return securityCouncilMembers[_account];
    }

    /**
     * @notice Get quorum percentage for a proposal type
     * @param proposalType The type of proposal
     * @return The quorum percentage in basis points
     */
    function getQuorumPercentage(ProposalType proposalType) 
        external 
        pure 
        returns (uint256) 
    {
        if (proposalType == ProposalType.EMERGENCY) {
            return EMERGENCY_QUORUM;
        } else if (proposalType == ProposalType.CONSTITUTIONAL) {
            return CONSTITUTIONAL_QUORUM;
        } else if (proposalType == ProposalType.UPGRADE) {
            return UPGRADE_QUORUM;
        } else {
            return STANDARD_QUORUM;
        }
    }

    /**
     * @notice Validate quorum hierarchy (for testing/debugging)
     * @return True if quorum hierarchy is correct
     */
    function validateQuorumHierarchy() external pure returns (bool) {
        return STANDARD_QUORUM < EMERGENCY_QUORUM && 
               EMERGENCY_QUORUM < UPGRADE_QUORUM && 
               UPGRADE_QUORUM < CONSTITUTIONAL_QUORUM &&
               MINIMUM_QUORUM < STANDARD_QUORUM;
    }

    // ============ Overrides Required for OpenZeppelin v5 ============

    function quorum(uint256 timepoint) 
        public 
        view 
        override(GovernorUpgradeable, GovernorVotesQuorumFractionUpgradeable, IGovernor) 
        returns (uint256) 
    {
        // Use the provided timepoint to compute past quorum correctly
        return super.quorum(timepoint);
    }

    /**
     * @notice Override _quorumReached to use proposal-specific quorum
     * @param proposalId The proposal ID
     * @return True if quorum is reached
     */
    function _quorumReached(uint256 proposalId) 
        internal 
        view 
        override(GovernorCountingSimpleUpgradeable, GovernorUpgradeable) 
        returns (bool) 
    {
        // Get proposal-specific quorum
        uint256 requiredQuorum = getProposalQuorum(proposalId);
        
        // If no quorum required (edge case), return true
        if (requiredQuorum == 0) {
            return true;
        }
        
        // FIXED: Correct destructuring order - proposalVotes returns (againstVotes, forVotes, abstainVotes)
        // Get current votes (for + abstain votes count toward quorum)
        (, uint256 forVotes, uint256 abstainVotes) = proposalVotes(proposalId);
        uint256 currentVotes = forVotes + abstainVotes;
        
        return currentVotes >= requiredQuorum;
    }
    
    /**
     * @notice Override quorum calculation to use proposal-specific quorum
     * @param proposalId The proposal ID
     * @return The required quorum for this specific proposal
     */
    function quorum(uint256 proposalId, uint256 /* timepoint */) 
        public 
        view 
        returns (uint256) 
    {
        // Get proposal-specific quorum based on type
        return getProposalQuorum(proposalId);
    }

    function votingDelay() 
        public 
        view 
        override(GovernorUpgradeable, GovernorSettingsUpgradeable, IGovernor) 
        returns (uint256) 
    {
        return super.votingDelay();
    }

    function votingPeriod() 
        public 
        view 
        override(GovernorUpgradeable, GovernorSettingsUpgradeable, IGovernor) 
        returns (uint256) 
    {
        return super.votingPeriod();
    }

    function proposalNeedsQueuing(uint256 proposalId) 
        public 
        view 
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable, IGovernor) 
        returns (bool) 
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function state(uint256 proposalId)
        public
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable, IGovernor)
        returns (ProposalState)
    {
        if (proposalCancelled[proposalId]) {
            return ProposalState.Canceled;
        }
        return super.state(proposalId);
    }

    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public override(GovernorUpgradeable, IGovernor) returns (uint256) {
        // Validate proposal length
        _validateProposal(targets, values, calldatas);
        
        // Check if this is a mint request proposal
        bool isMintRequest = _isMintRequestProposal(targets, calldatas);
        bool isPrivilegedMultisigWallet = isPrivilegedMultisig(msg.sender);
        
        if (isMintRequest) {
            // MINT REQUEST proposals require:
            // 1. Privileged Multisig Wallet, OR
            // 2. User with >= 3% voting power
            if (!isPrivilegedMultisigWallet) {
                uint256 votingPower = token().getVotes(msg.sender);
                uint256 requiredThreshold = calculateMintRequestThreshold(); // 3% threshold
                
                if (votingPower < requiredThreshold) {
                    revert InsufficientVotingPowerForMintRequest();
                }
            }
        } else {
            // For STANDARD proposals (when called directly without proposeWithType),
            // require 3% total supply voting power
            // Note: Privileged Multisig Wallet can bypass this check (handled in proposalThreshold())
            // If called from proposeWithType(), proposeWithType() already validates STANDARD proposals
            if (!isPrivilegedMultisigWallet) {
                uint256 votingPower = token().getVotes(msg.sender);
                uint256 requiredThreshold = calculateMintRequestThreshold(); // 3% threshold
                
                if (votingPower < requiredThreshold) {
                    revert InsufficientVotingPowerForStandardProposal();
                }
            }
            // If isPrivilegedMultisigWallet, bypass 3% check (will be validated in proposeWithType if needed)
        }
        
        // For privileged multisig wallet, proposalThreshold() will return 0 to bypass check
        uint256 proposalId = super.propose(targets, values, calldatas, description);
        // Removed duplicate _proposalProposers assignment
        
        // Set default proposal type as STANDARD (only if not already set by proposeWithType)
        // proposeWithType() will set the type after calling propose()
        if (proposalTypes[proposalId] == ProposalType(0)) {
            proposalTypes[proposalId] = ProposalType.STANDARD;
        }
        
        return proposalId;
    }

    function proposalThreshold()
        public
        view
        override(GovernorUpgradeable, GovernorSettingsUpgradeable, IGovernor)
        returns (uint256)
    {
        // For privileged multisig wallet, bypass normal threshold
        // This allows privileged multisig wallet to create proposals without normal threshold
        // The propose() function will validate if it's actually a mint request proposal
        // and apply the 3% threshold for non-multisig wallets
        if (isPrivilegedMultisig(msg.sender)) {
            // Return 0 to bypass threshold check for privileged multisig wallet
            // Note: This bypasses threshold for ALL proposals from this wallet
            // The propose() function validates mint request proposals separately
            return 0;
        }
        return super.proposalThreshold();
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (address)
    {
        return super._executor();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(GovernorUpgradeable, IERC165)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Clock mode for v5 (using block number)
     */
    function clock() public view override(GovernorUpgradeable, GovernorVotesUpgradeable, IERC6372) returns (uint48) {
        return super.clock();
    }

    /**
     * @notice Clock mode descriptor
     */
    function CLOCK_MODE() public view override(GovernorUpgradeable, GovernorVotesUpgradeable, IERC6372) returns (string memory) {
        return super.CLOCK_MODE();
    }

}