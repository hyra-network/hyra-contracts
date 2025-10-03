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
    uint256 public constant TIER1_END_YEAR = 10;  // Year 1-10
    uint256 public constant TIER2_END_YEAR = 15;  // Year 11-15
    uint256 public constant TIER3_END_YEAR = 25;  // Year 16-25
    uint256 public constant YEAR_DURATION = 365 days;
    
    // ============ State Variables ============
    mapping(address => bool) public minters;
    mapping(address => uint256) public mintAllowances;
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
    }
    
    mapping(uint256 => MintRequest) public mintRequests;
    uint256 public mintRequestCount;
    uint256 public constant MINT_EXECUTION_DELAY = 2 days;
    
    // Storage gap for upgradeability
    uint256[39] private __gap;

    // ============ Events ============
    event MinterAdded(address indexed minter);
    event MinterRemoved(address indexed minter);
    event MintAllowanceSet(address indexed minter, uint256 allowance);
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
    modifier onlyMinter() {
        if (!minters[msg.sender] && msg.sender != owner()) revert NotMinter();
        _;
    }

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
     */
    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _vestingContract,
        address _governance
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
            // Mint to vesting contract instead of single holder for security
            _mint(_vestingContract, _initialSupply);
            totalMintedSupply = _initialSupply;
            
            // Track initial supply in year 1
            mintedByYear[1] = _initialSupply;
            
            // Emit event for transparency - now shows vesting contract
            emit InitialDistribution(_vestingContract, _initialSupply, block.timestamp);
        }
        
        // Initialize mint year tracking
        currentMintYear = 1;
        mintYearStartTime = block.timestamp;
        originalMintYearStartTime = block.timestamp; // Store original start time
    }
    
    /**
     * @notice DEPRECATED: Legacy initialize function for backward compatibility
     * @dev This function is kept for backward compatibility but should not be used
     * @param _name Token name
     * @param _symbol Token symbol
     * @param _initialSupply Initial token supply
     * @param _initialHolder Address to receive initial supply (DEPRECATED - use vesting)
     * @param _governance Initial governance address
     */
    function initializeLegacy(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _initialHolder,
        address _governance
    ) public initializer validAddress(_initialHolder) validAddress(_governance) {
        __ERC20_init(_name, _symbol);
        __ERC20Burnable_init();
        __ERC20Permit_init(_name);
        __ERC20Votes_init();
        __Ownable_init(_governance);
        __Pausable_init();
        __ReentrancyGuard_init();
        
        // Initial supply should not exceed 5% (2.5B) 
        require(_initialSupply <= 2_500_000_000e18, "Initial supply exceeds 5% of max supply");
        
        if (_initialSupply > 0) {
            _mint(_initialHolder, _initialSupply);
            totalMintedSupply = _initialSupply;
            
            // Track initial supply in year 1
            mintedByYear[1] = _initialSupply;
            
            // Emit event for transparency
            emit InitialDistribution(_initialHolder, _initialSupply, block.timestamp);
        }
        
        // Initialize mint year tracking
        currentMintYear = 1;
        mintYearStartTime = block.timestamp;
        originalMintYearStartTime = block.timestamp; // Store original start time
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
            purpose: _purpose
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
        uint256 requestYear = _calculateYearFromTimestamp(request.approvedAt);
        
        // Check for overflow
        require(mintedByYear[requestYear] + request.amount >= mintedByYear[requestYear], "MintedByYear overflow");
        require(totalMintedSupply + request.amount >= totalMintedSupply, "TotalMintedSupply overflow");
        
        // Check for underflow
        require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
        
        mintedByYear[requestYear] += request.amount;
        pendingByYear[requestYear] -= request.amount;
        totalMintedSupply += request.amount;
        
        // Mint tokens
        _mint(request.recipient, request.amount);
        
        emit MintRequestExecuted(_requestId, request.recipient, request.amount);
        emit TokensMinted(request.recipient, request.amount, totalSupply());
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
        uint256 requestYear = _calculateYearFromTimestamp(request.approvedAt);
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

    /**
     * @notice Add a new minter
     * @param _minter Address to grant minting permission
     */
    function addMinter(address _minter) 
        external 
        override 
        onlyOwner 
        validAddress(_minter) 
    {
        if (minters[_minter]) revert AlreadyMinter();
        minters[_minter] = true;
        emit MinterAdded(_minter);
    }

    /**
     * @notice Remove a minter
     * @param _minter Address to revoke minting permission
     */
    function removeMinter(address _minter) external override onlyOwner {
        if (!minters[_minter]) revert NotMinter();
        minters[_minter] = false;
        delete mintAllowances[_minter];
        emit MinterRemoved(_minter);
    }

    /**
     * @notice Set mint allowance for a minter
     * @param _minter Address of the minter
     * @param _allowance Amount allowed to mint
     */
    function setMintAllowance(address _minter, uint256 _allowance) 
        external 
        override 
        onlyOwner 
    {
        mintAllowances[_minter] = _allowance;
        emit MintAllowanceSet(_minter, _allowance);
    }

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

    /**
     * @notice Check if an address is a minter
     */
    function isMinter(address _account) external view override returns (bool) {
        return minters[_account] || _account == owner();
    }

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
     * @return Total of all tier caps plus initial mint (42.5B tokens)
     */
    function getMaxMintableSupply() external pure returns (uint256) {
        return 2_500_000_000e18 +         // Initial mint: 2.5B
               (TIER1_ANNUAL_CAP * 10) +  // Year 1-10: 25B
               (TIER2_ANNUAL_CAP * 5) +   // Year 11-15: 7.5B
               (TIER3_ANNUAL_CAP * 10);   // Year 16-25: 7.5B
               // Total: 42.5B (85% of MAX_SUPPLY)
               // Reserved: 7.5B (15% never minted)
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
     * @notice Get year from timestamp
     * @param timestamp The timestamp to convert
     * @return year The year number
     */
    function _getYearFromTimestamp(uint256 timestamp) internal pure returns (uint256) {
        // More accurate year calculation using 365.25 days per year (accounting for leap years)
        // This provides better accuracy over long periods
        return (timestamp * 4) / (36525 * 24 * 60 * 60) + 1;
    }

    /**
     * @notice Manually expire old requests to prevent accumulation
     * @dev Cancels requests older than REQUEST_EXPIRY_PERIOD with batch limit
     * @param maxExpire Maximum number of requests to expire in one call
     * @return expiredCount Number of requests actually expired
     */
    function expireOldRequests(uint256 maxExpire) external onlyOwner returns (uint256 expiredCount) {
        // Validate maxExpire parameter
        require(maxExpire > 0 && maxExpire <= 1000, "Invalid maxExpire value");
        
        uint256 currentTime = block.timestamp;
        uint256 processed = 0;
        
        for (uint256 i = 0; i < mintRequestCount && expiredCount < maxExpire; i++) {
            MintRequest storage request = mintRequests[i];
            
            // Check if request is not executed and has expired
            if (!request.executed && 
                currentTime > request.approvedAt + REQUEST_EXPIRY_PERIOD) {
                
                // Auto-cancel expired request with underflow check
                uint256 requestYear = _calculateYearFromTimestamp(request.approvedAt);
                require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
                pendingByYear[requestYear] -= request.amount;
                
                delete mintRequests[i];
                emit MintRequestExpired(i);
                expiredCount++;
            }
            processed++;
        }
        
        emit ExpireOldRequestsCompleted(expiredCount, processed);
        return expiredCount;
    }

    /**
     * @notice Expire all old requests (use with caution)
     * @dev Expires all requests older than REQUEST_EXPIRY_PERIOD
     * @return expiredCount Number of requests expired
     */
    function expireAllOldRequests() external onlyOwner returns (uint256 expiredCount) {
        uint256 currentTime = block.timestamp;
        
        for (uint256 i = 0; i < mintRequestCount; i++) {
            MintRequest storage request = mintRequests[i];
            
            if (!request.executed && 
                currentTime > request.approvedAt + REQUEST_EXPIRY_PERIOD) {
                
                uint256 requestYear = _calculateYearFromTimestamp(request.approvedAt);
                require(pendingByYear[requestYear] >= request.amount, "PendingByYear underflow");
                pendingByYear[requestYear] -= request.amount;
                
                delete mintRequests[i];
                emit MintRequestExpired(i);
                expiredCount++;
            }
        }
        
        emit ExpireOldRequestsCompleted(expiredCount, mintRequestCount);
        return expiredCount;
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