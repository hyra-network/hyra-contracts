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
    
    // Quorum percentages (basis points) - Improved for better security
    uint256 public constant STANDARD_QUORUM = 1500; // 15% (increased from 10%)
    uint256 public constant EMERGENCY_QUORUM = 2000; // 20% (increased from 15%)
    uint256 public constant CONSTITUTIONAL_QUORUM = 3500; // 35% (increased from 30%)
    uint256 public constant UPGRADE_QUORUM = 3000; // 30% (increased from 25%)
    
    // Storage gap for upgradeability
    uint256[44] private __gap;

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
     */
    function initialize(
        IVotes _token,
        TimelockControllerUpgradeable _timelock,
        uint256 _votingDelay,
        uint256 _votingPeriod,
        uint256 _proposalThreshold,
        uint256 _quorumPercentage
    ) public initializer {
        __Governor_init("HyraGovernor");
        __GovernorSettings_init(uint48(_votingDelay), uint32(_votingPeriod), _proposalThreshold);
        __GovernorCountingSimple_init();
        __GovernorVotes_init(_token);
        __GovernorVotesQuorumFraction_init(_quorumPercentage);
        __GovernorTimelockControl_init(_timelock);
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
        
        // Emergency proposals require security council
        if (proposalType == ProposalType.EMERGENCY) {
            if (!securityCouncilMembers[msg.sender]) {
                revert OnlySecurityCouncil();
            }
        }
        
        // Validate proposal arrays
        if (!_validateProposal(targets, values, calldatas)) {
            revert InvalidProposalLength();
        }
        
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
        
        ProposalState currentState = state(proposalId);
        if (currentState == ProposalState.Canceled) {
            revert ProposalAlreadyCancelled();
        }
        
        // Check authorization - proposer or security council can cancel
        address proposer = proposalProposer(proposalId);
        if (msg.sender != proposer && !securityCouncilMembers[msg.sender]) {
            revert UnauthorizedCancellation();
        }
        
        // For security council members, bypass parent authorization
        if (securityCouncilMembers[msg.sender]) {
            // Directly call internal _cancel function
            _cancel(targets, values, calldatas, descriptionHash);
            proposalCancelled[proposalId] = true;
            emit ProposalCancelled(proposalId);
            return proposalId;
        } else {
            // For proposers, use parent function
            uint256 result = super.cancel(targets, values, calldatas, descriptionHash);
            proposalCancelled[proposalId] = true;
            emit ProposalCancelled(proposalId);
            return result;
        }
    }

    // ============ DAO Role Management Functions ============
    
    /**
     * @notice Set the DAO Role Manager (only governance)
     * @param _roleManager Address of the DAO Role Manager
     */
    function setRoleManager(DAORoleManager _roleManager) external onlyGovernance {
        roleManager = _roleManager;
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
     */
    function getProposalQuorum(uint256 proposalId) 
        public 
        view 
        returns (uint256) 
    {
        ProposalType pType = proposalTypes[proposalId];
        uint256 supply = token().getPastTotalSupply(proposalSnapshot(proposalId));
        
        if (pType == ProposalType.EMERGENCY) {
            return (supply * EMERGENCY_QUORUM) / 10000;
        } else if (pType == ProposalType.CONSTITUTIONAL) {
            return (supply * CONSTITUTIONAL_QUORUM) / 10000;
        } else if (pType == ProposalType.UPGRADE) {
            return (supply * UPGRADE_QUORUM) / 10000;
        } else {
            return (supply * STANDARD_QUORUM) / 10000;
        }
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

    // ============ Overrides Required for OpenZeppelin v5 ============

    function quorum(uint256 timepoint) 
        public 
        view 
        override(GovernorUpgradeable, GovernorVotesQuorumFractionUpgradeable, IGovernor) 
        returns (uint256) 
    {
        // Use base quorum for general cases
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
        // Use proposal-specific quorum instead of base quorum
        uint256 requiredQuorum = getProposalQuorum(proposalId);
        (uint256 forVotes, uint256 againstVotes, uint256 abstainVotes) = proposalVotes(proposalId);
        uint256 currentVotes = forVotes + abstainVotes;
        
        return currentVotes >= requiredQuorum;
    }
    
    /**
     * @notice Override quorum calculation to use proposal-specific quorum
     * @param proposalId The proposal ID
     * @param timepoint The timepoint
     * @return The required quorum for this specific proposal
     */
    function quorum(uint256 proposalId, uint256 timepoint) 
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
        
        uint256 proposalId = super.propose(targets, values, calldatas, description);
        // Removed duplicate _proposalProposers assignment
        
        // Set default proposal type as STANDARD
        proposalTypes[proposalId] = ProposalType.STANDARD;
        
        return proposalId;
    }

    function proposalThreshold()
        public
        view
        override(GovernorUpgradeable, GovernorSettingsUpgradeable, IGovernor)
        returns (uint256)
    {
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