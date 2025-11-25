// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/NoncesUpgradeable.sol";
import "../interfaces/IHyraToken.sol";

/**
 * @title HyraToken
 * @notice ERC20 governance token with voting capabilities for Hyra DAO
 * @dev Implementation contract with tiered minting schedule
 */
contract HyraToken is
    Initializable,
    ERC20Upgradeable,
    ERC20BurnableUpgradeable,
    ERC20PermitUpgradeable,
    ERC20VotesUpgradeable,
    OwnableUpgradeable,
    PausableUpgradeable,
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
    uint256 public constant TIER1_END_YEAR = 10;  // Year 1-10 (2025-2034)
    uint256 public constant TIER2_END_YEAR = 15;  // Year 11-15 (2035-2039)
    uint256 public constant TIER3_END_YEAR = 25;  // Year 16-25 (2040-2049)
    uint256 public constant YEAR_DURATION = 365 days;
    
    // Calendar year constants - Hardcoded to ensure Year 1 = 2025, Year 25 = 2049
    // 01/01/2025 00:00:00 UTC - Mint period starts regardless of deploy time
    uint256 public constant YEAR_2025_START = 1735689600;
    
    // ============ State Variables ============
    // Removed unused governanceAddress - using owner() instead
    uint256 public totalMintedSupply;
    
    // Annual mint tracking
    uint256 public currentMintYear;
    uint256 public mintYearStartTime;
    uint256 public originalMintYearStartTime; // Store original start time for accurate year calculation
    mapping(uint256 => uint256) public mintedByYear; // Track minted amount by year
    mapping(uint256 => uint256) public pendingByYear; // Track pending mint requests by year
    uint256 public constant REQUEST_EXPIRY_PERIOD = 365 days; // 1 year expiry for requests
    
    // Mint requests (must be approved by DAO)
    struct MintRequest {
        address recipient;
        uint256 amount;
        uint256 approvedAt;
        bool executed;
        string purpose;
        uint256 yearCreated; // Track which year this request was created for
    }
    
    mapping(uint256 => MintRequest) public mintRequests;
    uint256 public mintRequestCount;
    uint256 public constant MINT_EXECUTION_DELAY = 2 days;
    
    // ============ Token Distribution Configuration ============
    // Distribution to 6 multisig wallets with fixed percentages
    struct DistributionConfig {
        address communityEcosystem;      // 60%
        address liquidityBuybackReserve;  // 12%
        address marketingPartnerships;    // 10%
        address teamFounders;             // 8%
        address strategicAdvisors;       // 5%
        address seedStrategicVC;          // 5%
    }
    
    DistributionConfig public distributionConfig;
    bool public configSet;  // Immutable flag - can only set once
    
    // Storage gap for upgradeability (reduced by 1 slot for distribution config)
    uint256[38] private __gap;

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
    
    // Distribution events
    event DistributionConfigSet(
        address indexed communityEcosystem,
        address indexed liquidityBuybackReserve,
        address indexed marketingPartnerships,
        address teamFounders,
        address strategicAdvisors,
        address seedStrategicVC
    );
    
    event TokensDistributed(
        uint256 totalAmount,
        uint256 communityEcosystem,
        uint256 liquidityBuybackReserve,
        uint256 marketingPartnerships,
        uint256 teamFounders,
        uint256 strategicAdvisors,
        uint256 seedStrategicVC
    );

    // ============ Errors ============
    error ZeroAddress();
    error ExceedsAnnualMintCap(uint256 requested, uint256 available);
    error ExceedsMaxSupply(uint256 resultingSupply, uint256 maxSupply);
    error MintingPeriodEnded();
    error MintingPeriodNotStarted(); // NEW: Before 01/01/2025
    error InsufficientMintAllowance(uint256 requested, uint256 available);
    error NotMinter();
    error AlreadyMinter();
    error InvalidAmount();
    error AlreadyExecuted();
    error MintDelayNotMet();
    error DirectMintDisabled();
    error RequestExpired();
    error ConfigAlreadySet();
    error ConfigNotSet();
    error DuplicateAddress();
    error NotContract();

    // ============ Modifiers ============
    // Removed onlyMinter modifier along with minter role logic

    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert ZeroAddress();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize the token contract with secure initial distribution
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial token supply
     * @param _vestingContract Address of the vesting contract for secure distribution
     * @param _governance Initial governance address
     * @param _yearStartTime Unix timestamp for Year 1 start (0 = use block.timestamp). Example: 1735689600 = Jan 1, 2025 00:00:00 UTC
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _vestingContract,
        address _governance,
        uint256 _yearStartTime
    ) public initializer validAddress(_vestingContract) validAddress(_governance) {
        __ERC20_init(_name, _symbol);
        __ERC20Burnable_init();
        __ERC20Permit_init(_name);
        __ERC20Votes_init();
        __Ownable_init(_governance); // set initial owner
        __Pausable_init();
        __ReentrancyGuard_init();
        
        // Initial supply should not exceed 5% (2.5B) 
        require(_initialSupply <= 2_500_000_000e18, "Initial supply exceeds 5% of max supply");
        
        if (_initialSupply > 0) {
            // Distribution config must be set before initialize
            if (!configSet) revert ConfigNotSet();
            
            // Distribute initial supply to 6 multisig wallets
            _distributeTokens(_initialSupply);
            
            totalMintedSupply = _initialSupply;
            
            // Track initial supply in year 1
            mintedByYear[1] = _initialSupply;
            
            // Emit event for transparency
            emit InitialDistribution(address(0), _initialSupply, block.timestamp);
        }
        
        // Initialize mint year tracking
        // HARDCODED to 01/01/2025 - Year 1 = 2025, Year 2 = 2026, etc.
        currentMintYear = 1;
        mintYearStartTime = YEAR_2025_START;
        originalMintYearStartTime = YEAR_2025_START;
    }
    
    // Legacy initializer removed to eliminate single-holder initial distribution path

    // ============ Distribution Configuration ============
    
    /**
     * @notice Set token distribution configuration (only owner, can only set once)
     * @param _communityEcosystem Community & Ecosystem wallet (60%)
     * @param _liquidityBuybackReserve Liquidity, Buyback & Reserve wallet (12%)
     * @param _marketingPartnerships Marketing & Partnerships wallet (10%)
     * @param _teamFounders Team & Founders wallet (8%)
     * @param _strategicAdvisors Strategic Advisors wallet (5%)
     * @param _seedStrategicVC Seed & Strategic VC wallet (5%)
     * @dev This function can only be called once. Addresses are immutable after set.
     *      All addresses must be contracts (multisig wallets), not EOA.
     */
    function setDistributionConfig(
        address _communityEcosystem,
        address _liquidityBuybackReserve,
        address _marketingPartnerships,
        address _teamFounders,
        address _strategicAdvisors,
        address _seedStrategicVC
    ) external {
        // Allow setting config before initialization (no owner check)
        // After initialization, only owner can call (checked via onlyOwner if needed)
        // For now, allow anyone to set before init, but in practice should be deployer
        // Can only set once
        if (configSet) revert ConfigAlreadySet();
        
        // Validate all addresses are not zero
        if (_communityEcosystem == address(0)) revert ZeroAddress();
        if (_liquidityBuybackReserve == address(0)) revert ZeroAddress();
        if (_marketingPartnerships == address(0)) revert ZeroAddress();
        if (_teamFounders == address(0)) revert ZeroAddress();
        if (_strategicAdvisors == address(0)) revert ZeroAddress();
        if (_seedStrategicVC == address(0)) revert ZeroAddress();
        
        // Validate all addresses are contracts (multisig wallets)
        if (_communityEcosystem.code.length == 0) revert NotContract();
        if (_liquidityBuybackReserve.code.length == 0) revert NotContract();
        if (_marketingPartnerships.code.length == 0) revert NotContract();
        if (_teamFounders.code.length == 0) revert NotContract();
        if (_strategicAdvisors.code.length == 0) revert NotContract();
        if (_seedStrategicVC.code.length == 0) revert NotContract();
        
        // Prevent duplicate addresses
        if (_communityEcosystem == _liquidityBuybackReserve) revert DuplicateAddress();
        if (_communityEcosystem == _marketingPartnerships) revert DuplicateAddress();
        if (_communityEcosystem == _teamFounders) revert DuplicateAddress();
        if (_communityEcosystem == _strategicAdvisors) revert DuplicateAddress();
        if (_communityEcosystem == _seedStrategicVC) revert DuplicateAddress();
        if (_liquidityBuybackReserve == _marketingPartnerships) revert DuplicateAddress();
        if (_liquidityBuybackReserve == _teamFounders) revert DuplicateAddress();
        if (_liquidityBuybackReserve == _strategicAdvisors) revert DuplicateAddress();
        if (_liquidityBuybackReserve == _seedStrategicVC) revert DuplicateAddress();
        if (_marketingPartnerships == _teamFounders) revert DuplicateAddress();
        if (_marketingPartnerships == _strategicAdvisors) revert DuplicateAddress();
        if (_marketingPartnerships == _seedStrategicVC) revert DuplicateAddress();
        if (_teamFounders == _strategicAdvisors) revert DuplicateAddress();
        if (_teamFounders == _seedStrategicVC) revert DuplicateAddress();
        if (_strategicAdvisors == _seedStrategicVC) revert DuplicateAddress();
        
        // Set distribution config
        distributionConfig = DistributionConfig({
            communityEcosystem: _communityEcosystem,
            liquidityBuybackReserve: _liquidityBuybackReserve,
            marketingPartnerships: _marketingPartnerships,
            teamFounders: _teamFounders,
            strategicAdvisors: _strategicAdvisors,
            seedStrategicVC: _seedStrategicVC
        });
        
        // Mark as set (immutable)
        configSet = true;
        
        emit DistributionConfigSet(
            _communityEcosystem,
            _liquidityBuybackReserve,
            _marketingPartnerships,
            _teamFounders,
            _strategicAdvisors,
            _seedStrategicVC
        );
    }

    // ============ Minting Functions ============

    /**
     * @notice Create a mint request (only owner/timelock can call)
     * @param _recipient Address to receive tokens
     * @param _amount Amount to mint
     * @param _purpose Purpose of minting (for transparency)
     */
    function createMintRequest(
        address _recipient,
        uint256 _amount,
        string memory _purpose
    ) external onlyOwner validAddress(_recipient) returns (uint256 requestId) {
        if (_amount == 0) revert InvalidAmount();
        
        // CALENDAR YEAR VALIDATION: Check if we're in the mint period (2025-2049)
        // 31/12/2049 23:59:59 UTC = 2524607999
        if (block.timestamp < YEAR_2025_START) {
            revert MintingPeriodNotStarted();
        }

        // Check if we need to reset annual mint tracking
        _checkAndResetMintYear();
        
        // Check if minting period has ended (after year 25)
        if (currentMintYear > TIER3_END_YEAR) {
            revert MintingPeriodEnded();
        }
        
        // Year-specific validation
        uint256 annualCap = _getAnnualMintCap(currentMintYear);
        uint256 mintedInCurrentYear = mintedByYear[currentMintYear];
        uint256 pendingInCurrentYear = pendingByYear[currentMintYear];
        
        uint256 remainingMintCapacity = annualCap > (mintedInCurrentYear + pendingInCurrentYear) ? 
            annualCap - (mintedInCurrentYear + pendingInCurrentYear) : 0;
        
        if (_amount > remainingMintCapacity) {
            revert ExceedsAnnualMintCap(_amount, remainingMintCapacity);
        }
        
        // Reserve the mint amount for current year with overflow check
        require(pendingByYear[currentMintYear] + _amount >= pendingByYear[currentMintYear], "PendingByYear overflow");
        pendingByYear[currentMintYear] += _amount;
        
        // Check total supply cap
        if (totalSupply() + _amount > MAX_SUPPLY) {
            revert ExceedsMaxSupply(totalSupply() + _amount, MAX_SUPPLY);
        }
        
        // Create mint request
        requestId = mintRequestCount++;
        mintRequests[requestId] = MintRequest({
            recipient: _recipient,
            amount: _amount,
            approvedAt: block.timestamp,
            executed: false,
            purpose: _purpose,
            yearCreated: currentMintYear // Store the year this request was created for
        });
        
        emit MintRequestCreated(requestId, _recipient, _amount, _purpose);
        emit MintRequestApproved(requestId, block.timestamp + MINT_EXECUTION_DELAY);
    }
    
    /**
     * @notice Execute an approved mint request after delay
     * @param _requestId ID of the mint request
     */
    function executeMintRequest(uint256 _requestId) external nonReentrant {
        // Validate request ID exists
        if (_requestId >= mintRequestCount) revert InvalidAmount();
        
        MintRequest storage request = mintRequests[_requestId];
        
        if (request.amount == 0) revert InvalidAmount();
        if (request.executed) revert AlreadyExecuted();
        if (block.timestamp < request.approvedAt + MINT_EXECUTION_DELAY) {
            revert MintDelayNotMet();
        }
        
        // Check if request has expired
        if (block.timestamp > request.approvedAt + REQUEST_EXPIRY_PERIOD) {
            revert RequestExpired();
        }
        
        // Mark as executed
        request.executed = true;
        
        // Update year-specific tracking with overflow/underflow checks
        // Use yearCreated instead of calculating from approvedAt to ensure correct tracking
        uint256 requestYear = request.yearCreated;
        
        // Check for overflow
        require(mintedByYear[requestYear] + request.amount >= mintedByYear[requestYear], "MintedByYear overflow");
        require(totalMintedSupply + request.amount >= totalMintedSupply, "TotalMintedSupply overflow");
        
        // Check for underflow
        require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
        
        mintedByYear[requestYear] += request.amount;
        pendingByYear[requestYear] -= request.amount;
        totalMintedSupply += request.amount;
        
        // Distribution config must be set
        if (!configSet) revert ConfigNotSet();
        
        // Distribute tokens to 6 multisig wallets (ignore request.recipient)
        _distributeTokens(request.amount);
        
        emit MintRequestExecuted(_requestId, address(0), request.amount);
        emit TokensMinted(address(0), request.amount, totalSupply());
    }
    
    /**
     * @notice Cancel a mint request (only owner)
     * @param _requestId ID of the mint request to cancel
     */
    function cancelMintRequest(uint256 _requestId) external onlyOwner {
        // Validate request ID exists
        if (_requestId >= mintRequestCount) revert InvalidAmount();
        
        MintRequest storage request = mintRequests[_requestId];
        
        if (request.amount == 0) revert InvalidAmount();
        if (request.executed) revert AlreadyExecuted();
        
        // Update year-specific pending tracking with underflow check
        // Use yearCreated to ensure correct tracking
        uint256 requestYear = request.yearCreated;
        require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
        pendingByYear[requestYear] -= request.amount;
        
        // Clear the request
        delete mintRequests[_requestId];
        
        emit MintRequestCancelled(_requestId);
    }

    /**
     * @notice DEPRECATED: Direct mint is disabled, use createMintRequest instead
     */
    function mint(address, uint256) external pure {
        revert DirectMintDisabled();
    }

    /**
     * @notice Get the annual mint cap for a specific year
     * @param year The year number (1-based)
     * @return Annual mint cap for that year
     */
    /**
     * @notice Internal function to distribute tokens to 6 wallets with fixed percentages
     * @param _totalAmount Total amount to distribute
     * @dev Distribution percentages: 60%, 12%, 10%, 8%, 5%, 5%
     *      Remainder from rounding goes to Community & Ecosystem (largest allocation)
     */
    function _distributeTokens(uint256 _totalAmount) internal {
        require(configSet, "Distribution config not set");
        require(_totalAmount > 0, "Amount must be greater than 0");
        
        uint256 basisPoints = 10000;
        
        // Calculate distribution amounts using basis points (fixed percentages)
        uint256 community = (_totalAmount * 6000) / basisPoints;      // 60%
        uint256 liquidity = (_totalAmount * 1200) / basisPoints;      // 12%
        uint256 marketing = (_totalAmount * 1000) / basisPoints;      // 10%
        uint256 team = (_totalAmount * 800) / basisPoints;            // 8%
        uint256 advisors = (_totalAmount * 500) / basisPoints;       // 5%
        uint256 seed = (_totalAmount * 500) / basisPoints;           // 5%
        
        // Calculate remainder (due to rounding)
        uint256 distributed = community + liquidity + marketing + team + advisors + seed;
        uint256 remainder = _totalAmount - distributed;
        
        // Add remainder to largest allocation (Community & Ecosystem)
        community += remainder;
        
        // Verify total (safety check)
        require(community + liquidity + marketing + team + advisors + seed == _totalAmount, "Distribution math error");
        
        // Mint to each wallet
        _mint(distributionConfig.communityEcosystem, community);
        _mint(distributionConfig.liquidityBuybackReserve, liquidity);
        _mint(distributionConfig.marketingPartnerships, marketing);
        _mint(distributionConfig.teamFounders, team);
        _mint(distributionConfig.strategicAdvisors, advisors);
        _mint(distributionConfig.seedStrategicVC, seed);
        
        emit TokensDistributed(
            _totalAmount,
            community,
            liquidity,
            marketing,
            team,
            advisors,
            seed
        );
    }
    
    function _getAnnualMintCap(uint256 year) private pure returns (uint256) {
        // FIXED: Use range checks instead of strict equality
        if (year < 1 || year > TIER3_END_YEAR) {
            return 0; // No minting allowed
        }
        
        if (year <= TIER1_END_YEAR) {
            // Year 1-10: 2.5B per year
            return TIER1_ANNUAL_CAP;
        } else if (year <= TIER2_END_YEAR) {
            // Year 11-15: 1.5B per year
            return TIER2_ANNUAL_CAP;
        } else {
            // Year 16-25: 750M per year
            return TIER3_ANNUAL_CAP;
        }
    }

    /**
     * @notice Check and reset mint year if needed
     */
    function _checkAndResetMintYear() private {
        if (block.timestamp >= mintYearStartTime + YEAR_DURATION) {
            // Calculate how many years have passed
            uint256 yearsPassed = (block.timestamp - mintYearStartTime) / YEAR_DURATION;
            
            currentMintYear += yearsPassed;
            mintYearStartTime += yearsPassed * YEAR_DURATION;
            
            emit MintYearReset(currentMintYear, block.timestamp);
        }
    }

    // ============ Minter Management ============
    // Removed: addMinter, removeMinter, setMintAllowance (unused)

    // ============ Governance Functions ============

    /**
     * @notice Transfer governance to a new address
     * @param _newGovernance New governance address
     */
    function transferGovernance(address _newGovernance) 
        external 
        override 
        onlyOwner 
        validAddress(_newGovernance) 
    {
        // Removed unused governanceAddress transfer
        address oldOwner = owner();
        _transferOwnership(_newGovernance);
        emit GovernanceTransferred(oldOwner, _newGovernance);
    }

    /**
     * @notice Pause token transfers
     */
    function pause() external override onlyOwner {
        _pause();
        emit TokensPaused(msg.sender);
    }

    /**
     * @notice Unpause token transfers
     */
    function unpause() external override onlyOwner {
        _unpause();
        emit TokensUnpaused(msg.sender);
    }

    // ============ View Functions ============

    // Removed: isMinter (unused)

    /**
     * @notice Get remaining mint capacity for current year
     * @return Available mint amount for the rest of the year
     */
    function getRemainingMintCapacity() external view returns (uint256) {
        // Check if minting period has ended
        uint256 year = currentMintYear;
        if (block.timestamp >= mintYearStartTime + YEAR_DURATION) {
            year += (block.timestamp - mintYearStartTime) / YEAR_DURATION;
        }
        
        if (year > TIER3_END_YEAR) {
            return 0; // Minting period ended
        }
        
        // Use year-specific logic
        return this.getRemainingMintCapacityForYear(year);
    }

    /**
     * @notice Get remaining mint capacity for a specific year
     * @param year The year number
     * @return Available mint amount for that year
     */
    function getRemainingMintCapacityForYear(uint256 year) external view returns (uint256) {
        // FIXED: Validate year parameter - use range checks
        if (year < 1 || year > TIER3_END_YEAR) {
            return 0;
        }
        
        uint256 annualCap = _getAnnualMintCap(year);
        uint256 mintedInYear = mintedByYear[year];
        uint256 pendingInYear = pendingByYear[year];
        
        return annualCap > (mintedInYear + pendingInYear) ? 
            annualCap - (mintedInYear + pendingInYear) : 0;
    }

    /**
     * @notice Get pending mint amount for a specific year
     * @param year The year number
     * @return Pending mint amount for that year
     */
    function getPendingMintAmountForYear(uint256 year) external view returns (uint256) {
        // FIXED: Validate year parameter - use range checks
        if (year < 1 || year > TIER3_END_YEAR) {
            return 0;
        }
        return pendingByYear[year];
    }

    /**
     * @notice Get minted amount for a specific year
     * @param year The year number
     * @return Minted amount for that year
     */
    function getMintedAmountForYear(uint256 year) external view returns (uint256) {
        // FIXED: Validate year parameter - use range checks
        if (year < 1 || year > TIER3_END_YEAR) {
            return 0;
        }
        return mintedByYear[year];
    }

    /**
     * @notice Get total pending mint amount across all years
     * @return Total pending mint amount
     */
    function getTotalPendingMintAmount() external view returns (uint256) {
        // Optimized: Only check years that might have pending amounts
        // Most years will be 0, so we can skip them
        uint256 totalPending = 0;
        
        // Check current year and nearby years (most likely to have pending amounts)
        uint256 currentYear = currentMintYear;
        for (uint256 year = currentYear > 0 ? currentYear - 1 : 1; 
             year <= currentYear + 1 && year <= TIER3_END_YEAR; 
             year++) {
            totalPending += pendingByYear[year];
        }
        
        return totalPending;
    }

    /**
     * @notice Get count of expired requests that need cleanup
     * @return Number of expired requests
     */
    function getExpiredRequestsCount() external view returns (uint256) {
        uint256 currentTime = block.timestamp;
        uint256 expiredCount = 0;
        
        // Optimized: Limit the number of iterations to prevent gas limit issues
        uint256 maxIterations = mintRequestCount > 100 ? 100 : mintRequestCount;
        
        for (uint256 i = 0; i < maxIterations; i++) {
            MintRequest storage request = mintRequests[i];
            
            if (!request.executed && 
                currentTime > request.approvedAt + REQUEST_EXPIRY_PERIOD) {
                expiredCount++;
            }
        }
        
        return expiredCount;
    }

    /**
     * @notice Get the current minting tier
     * @return tier Current tier (1, 2, 3, or 0 if ended)
     */
    function getCurrentMintTier() external view returns (uint256 tier) {
        uint256 year = currentMintYear;
        if (block.timestamp >= mintYearStartTime + YEAR_DURATION) {
            year += (block.timestamp - mintYearStartTime) / YEAR_DURATION;
        }
        
        // FIXED: Use range checks instead of strict equality
        if (year < 1 || year > TIER3_END_YEAR) {
            return 0; // No tier (minting ended)
        } else if (year <= TIER1_END_YEAR) {
            return 1;
        } else if (year <= TIER2_END_YEAR) {
            return 2;
        } else {
            return 3;
        }
    }

    /**
     * @notice Get amount minted in current year
     */
    function getMintedThisYear() external view returns (uint256) {
        uint256 year = currentMintYear;
        if (block.timestamp >= mintYearStartTime + YEAR_DURATION) {
            year += (block.timestamp - mintYearStartTime) / YEAR_DURATION;
        }
        return mintedByYear[year];
    }

    /**
     * @notice Get time until next mint year
     * @return Seconds until mint year resets
     */
    function getTimeUntilNextMintYear() external view returns (uint256) {
        uint256 nextYearTime = mintYearStartTime + YEAR_DURATION;
        return nextYearTime > block.timestamp ? 
            nextYearTime - block.timestamp : 0;
    }

    /**
     * @notice Get total maximum mintable supply over 25 years
     * @return Total of all tier caps plus initial mint (40B tokens = 80% of MAX_SUPPLY)
     */
    function getMaxMintableSupply() external pure returns (uint256) {
        return 2_500_000_000e18 +         // Year 1 pre-mint: 2.5B
               (TIER1_ANNUAL_CAP * 9) +   // Year 2-10 (9 years): 22.5B
               (TIER2_ANNUAL_CAP * 5) +   // Year 11-15 (5 years): 7.5B
               (TIER3_ANNUAL_CAP * 10);   // Year 16-25 (10 years): 7.5B
               // Total: 40B (80% of MAX_SUPPLY)
               // Reserved: 10B (20% never minted)
    }

    // ============ Internal Functions ============

    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) whenNotPaused {
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

    // ============ Helper Functions ============
    
    /**
     * @notice Manually expire old requests to prevent accumulation
     * @dev Cancels requests older than REQUEST_EXPIRY_PERIOD within specified range
     * @param startId Starting request ID (inclusive)
     * @param endId Ending request ID (exclusive)
     * @return expiredCount Number of requests actually expired
     */
    function expireOldRequests(uint256 startId, uint256 endId) external onlyOwner returns (uint256 expiredCount) {
        // Validate parameters
        require(startId < endId, "Invalid range: startId must be less than endId");
        require(endId <= mintRequestCount, "Invalid range: endId exceeds total requests");
        require(endId - startId <= 1000, "Range too large: maximum 1000 requests per call");
        
        uint256 currentTime = block.timestamp;
        
        for (uint256 i = startId; i < endId; i++) {
            MintRequest storage request = mintRequests[i];
            
            // Check if request is not executed and has expired
            if (!request.executed && 
                request.amount > 0 && // Check if request exists
                currentTime > request.approvedAt + REQUEST_EXPIRY_PERIOD) {
                
                // Auto-cancel expired request with underflow check
                uint256 requestYear = request.yearCreated;
                require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
                pendingByYear[requestYear] -= request.amount;
                
                delete mintRequests[i];
                emit MintRequestExpired(i);
                expiredCount++;
            }
        }
        
        emit ExpireOldRequestsCompleted(expiredCount, endId - startId);
        return expiredCount;
    }

    /**
     * @notice Expire all old requests in batches (use with caution for large datasets)
     * @dev Expires all requests older than REQUEST_EXPIRY_PERIOD by processing in batches
     * @param batchSize Number of requests to process per batch (max 1000)
     * @return totalExpired Total number of requests expired across all batches
     */
    function expireAllOldRequests(uint256 batchSize) external onlyOwner returns (uint256 totalExpired) {
        require(batchSize > 0 && batchSize <= 1000, "Invalid batchSize: must be 1-1000");
        
        uint256 currentTime = block.timestamp;
        uint256 processed = 0;
        
        for (uint256 i = 0; i < mintRequestCount && processed < batchSize; i++) {
            MintRequest storage request = mintRequests[i];
            
            // Skip already deleted or executed requests
            if (request.amount == 0 || request.executed) {
                continue;
            }
            
            // Check if request has expired
            if (currentTime > request.approvedAt + REQUEST_EXPIRY_PERIOD) {
                uint256 requestYear = _calculateYearFromTimestamp(request.approvedAt);
                require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
                pendingByYear[requestYear] -= request.amount;
                
                delete mintRequests[i];
                emit MintRequestExpired(i);
                totalExpired++;
            }
            
            processed++;
        }
        
        emit ExpireOldRequestsCompleted(totalExpired, processed);
        return totalExpired;
    }

    /**
     * @notice Calculate year from timestamp based on contract's year tracking
     * @param timestamp The timestamp to convert
     * @return year The year number based on contract's mintYearStartTime
     */
    function _calculateYearFromTimestamp(uint256 timestamp) internal view returns (uint256) {
        if (timestamp < originalMintYearStartTime) {
            return 1; // Before contract start, assume year 1
        }
        
        // Calculate which year the timestamp falls into based on original start time
        uint256 yearsPassed = (timestamp - originalMintYearStartTime) / YEAR_DURATION;
        return 1 + yearsPassed; // Year 1 + years passed
    }
}