// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";
import "../interfaces/IHyraToken.sol";

/**
 * @title HyraTokenUltraFastTest
 * @notice ULTRA FAST test version for GUI testing on testnet
 * @dev ⚠️ EXTREME TESTING ONLY - DO NOT USE IN PRODUCTION!
 * 
 * Changes from HyraToken:
 * - MINT_EXECUTION_DELAY = 2 minutes (instead of 2 days)
 * - YEAR_DURATION = 1 HOUR (instead of 365 days) ⚡⚡⚡
 * - REQUEST_EXPIRY_PERIOD = 7 days (instead of 365 days)
 * 
 * This allows testing Year 2 after just 1 hour instead of 365 days!
 */
contract HyraTokenUltraFastTest is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    ERC20PausableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable,
    IHyraToken
{
    // ============ Constants ============
    uint256 public constant MAX_SUPPLY = 50_000_000_000e18; // 50 billion total cap
    
    // Minting tiers (annual caps)
    uint256 public constant TIER1_ANNUAL_CAP = 2_500_000_000e18; // 2.5B per year (5% of 50B)
    uint256 public constant TIER2_ANNUAL_CAP = 1_500_000_000e18; // 1.5B per year (3% of 50B)
    uint256 public constant TIER3_ANNUAL_CAP = 750_000_000e18;    // 750M per year (1.5% of 50B)
    
    // Time periods 
    uint256 public constant TIER1_END_YEAR = 10;  // Year 1-10
    uint256 public constant TIER2_END_YEAR = 15;  // Year 11-15
    uint256 public constant TIER3_END_YEAR = 25;  // Year 16-25
    uint256 public constant YEAR_DURATION = 1 hours; // ⚡⚡⚡ 1 HOUR instead of 365 days!
    
    // ============ State Variables ============
    uint256 public totalMintedSupply;
    
    // Annual mint tracking
    uint256 public currentMintYear;
    uint256 public mintYearStartTime;
    uint256 public originalMintYearStartTime;
    mapping(uint256 => uint256) public mintedByYear;
    mapping(uint256 => uint256) public pendingByYear;
    uint256 public constant REQUEST_EXPIRY_PERIOD = 7 days; // ⚡ Shortened for testing
    
    // Mint requests
    struct MintRequest {
        address recipient;
        uint256 amount;
        uint256 approvedAt;
        bool executed;
        string purpose;
    }
    
    mapping(uint256 => MintRequest) public mintRequests;
    uint256 public mintRequestCount;
    uint256 public constant MINT_EXECUTION_DELAY = 2 minutes; // ⚡ 2 MINUTES for fast testing!
    
    // Storage gap for upgradeability
    uint256[39] private __gap;

    // ============ Events ============
    event GovernanceTransferred(address indexed oldGovernance, address indexed newGovernance);
    event MintRequestCreated(uint256 indexed requestId, address indexed recipient, uint256 amount, string purpose);
    event MintRequestApproved(uint256 indexed requestId, uint256 executionTime);
    event MintRequestExecuted(uint256 indexed requestId, address indexed recipient, uint256 amount);
    event MintRequestCancelled(uint256 indexed requestId);
    event MintRequestExpired(uint256 indexed requestId);
    event ExpireOldRequestsCompleted(uint256 expiredCount, uint256 totalProcessed);
    event TokensMinted(address indexed to, uint256 amount, uint256 newTotalSupply);
    event MintYearReset(uint256 newYear, uint256 timestamp);
    event InitialDistribution(address indexed holder, uint256 amount, uint256 timestamp);
    event TokensPaused(address indexed by);
    event TokensUnpaused(address indexed by);

    // ============ Errors ============
    error ZeroAddress();
    error ExceedsAnnualMintCap(uint256 requested, uint256 available);
    error ExceedsMaxSupply(uint256 resultingSupply, uint256 maxSupply);
    error MintingPeriodEnded();
    error InsufficientMintAllowance(uint256 requested, uint256 available);
    error NotMinter();
    error AlreadyMinter();
    error InvalidAmount();
    error AlreadyExecuted();
    error MintDelayNotMet();
    error DirectMintDisabled();
    error RequestExpired();

    // ============ Modifiers ============
    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert ZeroAddress();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the token contract
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial supply to mint
     * @param _vestingContract Address to receive initial supply
     * @param _governance Initial governance address (owner)
     * @param _yearStartTime Unix timestamp for Year 1 start (0 = use block.timestamp). Example: 1735689600 = Jan 1, 2025 00:00:00 UTC
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _vestingContract,
        address _governance,
        uint256 _yearStartTime
    ) external initializer validAddress(_vestingContract) validAddress(_governance) {
        __ERC20_init(_name, _symbol);
        __ERC20Burnable_init();
        __ERC20Permit_init(_name);
        __ERC20Votes_init();
        __ERC20Pausable_init();
        __Ownable_init(_governance);
        __ReentrancyGuard_init();

        // Mint initial supply
        _mint(_vestingContract, _initialSupply);
        totalMintedSupply = _initialSupply;
        
        // Initialize mint year tracking
        currentMintYear = 1;
        
        // If _yearStartTime is provided and valid, use it; otherwise use block.timestamp
        // Validate: must be within reasonable range (not too far in past/future)
        if (_yearStartTime > 0) {
            require(_yearStartTime <= block.timestamp + 365 days, "Year start time too far in future");
            require(_yearStartTime >= block.timestamp - 365 days, "Year start time too far in past");
            mintYearStartTime = _yearStartTime;
            originalMintYearStartTime = _yearStartTime;
        } else {
            // Default to current timestamp if not specified
            mintYearStartTime = block.timestamp;
            originalMintYearStartTime = block.timestamp;
        }
        
        mintedByYear[1] = _initialSupply;

        emit InitialDistribution(_vestingContract, _initialSupply, block.timestamp);
    }

    // ============ Core Functions ============
    
    function createMintRequest(
        address _recipient,
        uint256 _amount,
        string memory _purpose
    ) external onlyOwner validAddress(_recipient) returns (uint256 requestId) {
        if (_amount == 0) revert InvalidAmount();
        
        _updateMintYear();
        
        uint256 tier = getCurrentMintTier();
        if (tier == 0) revert MintingPeriodEnded();
        
        uint256 annualCap = _getAnnualCap(tier);
        uint256 mintedInCurrentYear = mintedByYear[currentMintYear];
        uint256 pendingInCurrentYear = pendingByYear[currentMintYear];
        
        uint256 remainingMintCapacity = annualCap > (mintedInCurrentYear + pendingInCurrentYear) ? 
            annualCap - (mintedInCurrentYear + pendingInCurrentYear) : 0;
        
        if (_amount > remainingMintCapacity) {
            revert ExceedsAnnualMintCap(_amount, remainingMintCapacity);
        }
        
        require(pendingByYear[currentMintYear] + _amount >= pendingByYear[currentMintYear], "PendingByYear overflow");
        pendingByYear[currentMintYear] += _amount;
        
        if (totalSupply() + _amount > MAX_SUPPLY) {
            revert ExceedsMaxSupply(totalSupply() + _amount, MAX_SUPPLY);
        }
        
        requestId = mintRequestCount++;
        mintRequests[requestId] = MintRequest({
            recipient: _recipient,
            amount: _amount,
            approvedAt: block.timestamp,
            executed: false,
            purpose: _purpose
        });
        
        emit MintRequestCreated(requestId, _recipient, _amount, _purpose);
        emit MintRequestApproved(requestId, block.timestamp + MINT_EXECUTION_DELAY);
    }

    function executeMintRequest(uint256 _requestId) external nonReentrant {
        if (_requestId >= mintRequestCount) revert InvalidAmount();
        
        MintRequest storage request = mintRequests[_requestId];
        
        if (request.amount == 0) revert InvalidAmount();
        if (request.executed) revert AlreadyExecuted();
        if (block.timestamp < request.approvedAt + MINT_EXECUTION_DELAY) {
            revert MintDelayNotMet();
        }
        
        if (block.timestamp > request.approvedAt + REQUEST_EXPIRY_PERIOD) {
            revert RequestExpired();
        }
        
        request.executed = true;
        
        uint256 requestYear = _calculateYearFromTimestamp(request.approvedAt);
        
        require(mintedByYear[requestYear] + request.amount >= mintedByYear[requestYear], "MintedByYear overflow");
        require(totalMintedSupply + request.amount >= totalMintedSupply, "TotalMintedSupply overflow");
        require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
        
        mintedByYear[requestYear] += request.amount;
        pendingByYear[requestYear] -= request.amount;
        totalMintedSupply += request.amount;
        
        _mint(request.recipient, request.amount);
        
        emit MintRequestExecuted(_requestId, request.recipient, request.amount);
        emit TokensMinted(request.recipient, request.amount, totalSupply());
    }

    function cancelMintRequest(uint256 _requestId) external onlyOwner {
        if (_requestId >= mintRequestCount) revert InvalidAmount();
        
        MintRequest storage request = mintRequests[_requestId];
        
        if (request.amount == 0) revert InvalidAmount();
        if (request.executed) revert AlreadyExecuted();
        
        uint256 requestYear = _calculateYearFromTimestamp(request.approvedAt);
        require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
        
        pendingByYear[requestYear] -= request.amount;
        
        delete mintRequests[_requestId];
        
        emit MintRequestCancelled(_requestId);
    }

    // ============ View Functions ============
    
    function getCurrentMintTier() public view returns (uint256 tier) {
        uint256 elapsedYears = (block.timestamp - originalMintYearStartTime) / YEAR_DURATION;
        uint256 year = elapsedYears + 1;
        
        if (year <= TIER1_END_YEAR) return 1;
        if (year <= TIER2_END_YEAR) return 2;
        if (year <= TIER3_END_YEAR) return 3;
        return 0;
    }

    function getRemainingMintCapacity() external view returns (uint256) {
        uint256 tier = getCurrentMintTier();
        if (tier == 0) return 0;
        
        uint256 annualCap = _getAnnualCap(tier);
        uint256 minted = mintedByYear[currentMintYear];
        uint256 pending = pendingByYear[currentMintYear];
        
        if (annualCap > (minted + pending)) {
            return annualCap - (minted + pending);
        }
        return 0;
    }

    function getMintedThisYear() external view returns (uint256) {
        return mintedByYear[currentMintYear];
    }

    function getMaxMintableSupply() external pure returns (uint256) {
        return MAX_SUPPLY;
    }
    
    function getTimeUntilNextMintYear() external view returns (uint256) {
        uint256 nextYearTime = mintYearStartTime + YEAR_DURATION;
        return nextYearTime > block.timestamp ? 
            nextYearTime - block.timestamp : 0;
    }

    // ============ Internal Functions ============
    
    function _updateMintYear() internal {
        uint256 elapsedTime = block.timestamp - mintYearStartTime;
        
        if (elapsedTime >= YEAR_DURATION) {
            uint256 yearsElapsed = elapsedTime / YEAR_DURATION;
            currentMintYear += yearsElapsed;
            mintYearStartTime += (yearsElapsed * YEAR_DURATION);
            
            emit MintYearReset(currentMintYear, block.timestamp);
        }
    }

    function _calculateYearFromTimestamp(uint256 timestamp) internal view returns (uint256) {
        if (timestamp < originalMintYearStartTime) return 1;
        uint256 elapsed = timestamp - originalMintYearStartTime;
        return (elapsed / YEAR_DURATION) + 1;
    }

    function _getAnnualCap(uint256 tier) internal pure returns (uint256) {
        if (tier == 1) return TIER1_ANNUAL_CAP;
        if (tier == 2) return TIER2_ANNUAL_CAP;
        if (tier == 3) return TIER3_ANNUAL_CAP;
        return 0;
    }

    // ============ Governance Functions ============
    
    function transferGovernance(address _newGovernance) external onlyOwner validAddress(_newGovernance) {
        address oldGovernance = owner();
        _transferOwnership(_newGovernance);
        emit GovernanceTransferred(oldGovernance, _newGovernance);
    }

    function pause() external onlyOwner {
        _pause();
        emit TokensPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        _unpause();
        emit TokensUnpaused(msg.sender);
    }

    // ============ Disabled Functions ============
    
    function mint(address, uint256) external pure {
        revert DirectMintDisabled();
    }

    // ============ Required Overrides ============
    
    function _update(address from, address to, uint256 value)
        internal
        override(ERC20Upgradeable, ERC20VotesUpgradeable, ERC20PausableUpgradeable)
    {
        super._update(from, to, value);
    }

    function nonces(address owner)
        public
        view
        override(ERC20PermitUpgradeable, NoncesUpgradeable)
        returns (uint256)
    {
        return super.nonces(owner);
    }
}


