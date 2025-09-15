// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TokenVesting
 * @notice Gradual token distribution contract with high security
 * @dev Solves centralization issues in initial token distribution
 */
contract TokenVesting is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    // ============ Structs ============
    struct VestingSchedule {
        bool initialized;        // Whether initialized
        bool revocable;         // Whether revocable
        uint256 totalAmount;    // Total tokens to be vested
        uint256 releasedAmount; // Amount of tokens already released
        uint256 startTime;      // Vesting start time
        uint256 duration;       // Vesting duration (seconds)
        uint256 cliff;          // Cliff duration (seconds)
        address beneficiary;    // Token recipient
        string purpose;         // Purpose of token usage
    }
    
    // ============ State Variables ============
    IERC20 public token;                              // Token being vested
    mapping(bytes32 => VestingSchedule) public vestingSchedules; // Vesting schedules
    mapping(address => uint256) public totalVestedAmount;        // Total vested tokens per person
    mapping(address => uint256) public totalReleasedAmount;      // Total released tokens per person
    
    uint256 public totalVestingSchedules;             // Total number of vesting schedules
    uint256 public constant MIN_VESTING_DURATION = 30 days;     // Minimum vesting duration
    uint256 public constant MAX_VESTING_DURATION = 10 * 365 days; // Maximum vesting duration (10 years)
    
    // ============ Events ============
    event VestingScheduleCreated(
        bytes32 indexed vestingScheduleId,
        address indexed beneficiary,
        uint256 totalAmount,
        uint256 startTime,
        uint256 duration,
        uint256 cliff,
        string purpose
    );
    
    event TokensReleased(
        bytes32 indexed vestingScheduleId,
        address indexed beneficiary,
        uint256 amount,
        uint256 timestamp
    );
    
    event VestingScheduleRevoked(
        bytes32 indexed vestingScheduleId,
        address indexed beneficiary,
        uint256 revokedAmount,
        uint256 timestamp
    );
    
    event EmergencyWithdraw(address indexed token, uint256 amount, uint256 timestamp);
    
    // ============ Errors ============
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidCliff();
    error VestingScheduleNotFound();
    error VestingScheduleAlreadyExists();
    error NotRevocable();
    error AlreadyRevoked();
    error InsufficientTokenBalance();
    error NoTokensToRelease();
    error UnauthorizedAccess();
    
    // ============ Modifiers ============
    modifier validAddress(address _addr) {
        if (_addr == address(0)) revert InvalidAddress();
        _;
    }
    
    modifier validAmount(uint256 _amount) {
        if (_amount == 0) revert InvalidAmount();
        _;
    }
    
    modifier validDuration(uint256 _duration) {
        if (_duration < MIN_VESTING_DURATION || _duration > MAX_VESTING_DURATION) {
            revert InvalidDuration();
        }
        _;
    }
    
    modifier validCliff(uint256 _cliff, uint256 _duration) {
        if (_cliff > _duration) revert InvalidCliff();
        _;
    }
    
    modifier vestingScheduleExists(bytes32 _vestingScheduleId) {
        if (!vestingSchedules[_vestingScheduleId].initialized) {
            revert VestingScheduleNotFound();
        }
        _;
    }
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize vesting contract
     * @param _token ERC20 token address
     * @param _owner Contract owner (usually multi-sig)
     */
    function initialize(address _token, address _owner) 
        public 
        initializer 
        validAddress(_token) 
        validAddress(_owner) 
    {
        __Ownable_init(_owner);
        __ReentrancyGuard_init();
        
        token = IERC20(_token);
    }
    
    /**
     * @notice Create new vesting schedule
     * @param _beneficiary Token recipient
     * @param _totalAmount Total token amount
     * @param _startTime Start time
     * @param _duration Vesting duration
     * @param _cliff Cliff duration
     * @param _revocable Whether revocable
     * @param _purpose Purpose of usage
     * @return vestingScheduleId Vesting schedule ID
     */
    function createVestingSchedule(
        address _beneficiary,
        uint256 _totalAmount,
        uint256 _startTime,
        uint256 _duration,
        uint256 _cliff,
        bool _revocable,
        string memory _purpose
    ) 
        external 
        onlyOwner 
        validAddress(_beneficiary) 
        validAmount(_totalAmount)
        validDuration(_duration)
        validCliff(_cliff, _duration)
        returns (bytes32 vestingScheduleId)
    {
        // Check contract token balance
        if (token.balanceOf(address(this)) < _totalAmount) {
            revert InsufficientTokenBalance();
        }
        
        // Create unique ID for vesting schedule
        vestingScheduleId = keccak256(abi.encodePacked(
            _beneficiary,
            _totalAmount,
            _startTime,
            _duration,
            _cliff,
            _purpose,
            block.timestamp
        ));
        
        // Check if vesting schedule already exists
        if (vestingSchedules[vestingScheduleId].initialized) {
            revert VestingScheduleAlreadyExists();
        }
        
        // Create vesting schedule
        vestingSchedules[vestingScheduleId] = VestingSchedule({
            initialized: true,
            revocable: _revocable,
            totalAmount: _totalAmount,
            releasedAmount: 0,
            startTime: _startTime,
            duration: _duration,
            cliff: _cliff,
            beneficiary: _beneficiary,
            purpose: _purpose
        });
        
        // Update statistics
        totalVestingSchedules++;
        totalVestedAmount[_beneficiary] += _totalAmount;
        
        emit VestingScheduleCreated(
            vestingScheduleId,
            _beneficiary,
            _totalAmount,
            _startTime,
            _duration,
            _cliff,
            _purpose
        );
        
        return vestingScheduleId;
    }
    
    /**
     * @notice Release vested tokens
     * @param _vestingScheduleId Vesting schedule ID
     * @return releasedAmount Amount of tokens released
     */
    function release(bytes32 _vestingScheduleId) 
        external 
        nonReentrant 
        vestingScheduleExists(_vestingScheduleId)
        returns (uint256 releasedAmount)
    {
        VestingSchedule storage schedule = vestingSchedules[_vestingScheduleId];
        
        // Calculate releasable token amount
        releasedAmount = _calculateReleasableAmount(schedule);
        
        if (releasedAmount == 0) {
            revert NoTokensToRelease();
        }
        
        // Update state
        schedule.releasedAmount += releasedAmount;
        totalReleasedAmount[schedule.beneficiary] += releasedAmount;
        
        // Transfer tokens
        require(
            token.transfer(schedule.beneficiary, releasedAmount),
            "Token transfer failed"
        );
        
        emit TokensReleased(
            _vestingScheduleId,
            schedule.beneficiary,
            releasedAmount,
            block.timestamp
        );
        
        return releasedAmount;
    }
    
    /**
     * @notice Release tokens for all schedules of a beneficiary
     * @param _beneficiary Token recipient
     * @return totalReleased Total amount of tokens released
     */
    function releaseAllForBeneficiary(address _beneficiary) 
        external 
        nonReentrant 
        validAddress(_beneficiary)
        returns (uint256 totalReleased)
    {
        totalReleased = 0;
        
        // Note: In practice, need to implement way to find all vesting schedules of a beneficiary
        // This is a simple implementation, may need improvement
        for (uint256 i = 0; i < totalVestingSchedules; i++) {
            // Detailed implementation needs additional mapping to track vesting schedules per beneficiary
        }
        
        return totalReleased;
    }
    
    /**
     * @notice Revoke vesting schedule (only when revocable = true)
     * @param _vestingScheduleId Vesting schedule ID
     * @return revokedAmount Amount of tokens revoked
     */
    function revoke(bytes32 _vestingScheduleId) 
        external 
        onlyOwner 
        vestingScheduleExists(_vestingScheduleId)
        returns (uint256 revokedAmount)
    {
        VestingSchedule storage schedule = vestingSchedules[_vestingScheduleId];
        
        if (!schedule.revocable) {
            revert NotRevocable();
        }
        
        // Calculate remaining unvested tokens
        uint256 vestedAmount = _calculateVestedAmount(schedule);
        revokedAmount = schedule.totalAmount - vestedAmount;
        
        if (revokedAmount == 0) {
            revert AlreadyRevoked();
        }
        
        // Update state
        schedule.totalAmount = vestedAmount;
        totalVestedAmount[schedule.beneficiary] -= revokedAmount;
        
        emit VestingScheduleRevoked(
            _vestingScheduleId,
            schedule.beneficiary,
            revokedAmount,
            block.timestamp
        );
        
        return revokedAmount;
    }
    
    /**
     * @notice Emergency token withdrawal (owner only)
     * @param _amount Amount of tokens to withdraw
     */
    function emergencyWithdraw(uint256 _amount) 
        external 
        onlyOwner 
        nonReentrant
    {
        require(token.transfer(owner(), _amount), "Token transfer failed");
        emit EmergencyWithdraw(address(token), _amount, block.timestamp);
    }
    
    // ============ View Functions ============
    
    /**
     * @notice Calculate releasable token amount
     * @param _vestingScheduleId Vesting schedule ID
     * @return Releasable token amount
     */
    function getReleasableAmount(bytes32 _vestingScheduleId) 
        external 
        view 
        vestingScheduleExists(_vestingScheduleId)
        returns (uint256)
    {
        return _calculateReleasableAmount(vestingSchedules[_vestingScheduleId]);
    }
    
    /**
     * @notice Calculate vested token amount
     * @param _vestingScheduleId Vesting schedule ID
     * @return Vested token amount
     */
    function getVestedAmount(bytes32 _vestingScheduleId) 
        external 
        view 
        vestingScheduleExists(_vestingScheduleId)
        returns (uint256)
    {
        return _calculateVestedAmount(vestingSchedules[_vestingScheduleId]);
    }
    
    /**
     * @notice Get detailed vesting schedule information
     * @param _vestingScheduleId Vesting schedule ID
     * @return schedule Detailed information
     */
    function getVestingSchedule(bytes32 _vestingScheduleId) 
        external 
        view 
        vestingScheduleExists(_vestingScheduleId)
        returns (VestingSchedule memory schedule)
    {
        return vestingSchedules[_vestingScheduleId];
    }
    
    /**
     * @notice Calculate total releasable tokens for a beneficiary
     * @param _beneficiary Token recipient
     * @return Total releasable token amount
     */
    function getTotalReleasableAmount(address _beneficiary) 
        external 
        view 
        returns (uint256)
    {
        // Implementation needs additional mapping to track vesting schedules per beneficiary
        return 0;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Calculate releasable token amount
     * @param schedule Vesting schedule
     * @return Releasable token amount
     */
    function _calculateReleasableAmount(VestingSchedule storage schedule) 
        internal 
        view 
        returns (uint256)
    {
        uint256 vestedAmount = _calculateVestedAmount(schedule);
        return vestedAmount - schedule.releasedAmount;
    }
    
    /**
     * @notice Calculate vested token amount
     * @param schedule Vesting schedule
     * @return Vested token amount
     */
    function _calculateVestedAmount(VestingSchedule storage schedule) 
        internal 
        view 
        returns (uint256)
    {
        // Check start time
        if (block.timestamp < schedule.startTime) {
            return 0;
        }
        
        // Check cliff time
        if (block.timestamp < schedule.startTime + schedule.cliff) {
            return 0;
        }
        
        // Check end time
        if (block.timestamp >= schedule.startTime + schedule.duration) {
            return schedule.totalAmount;
        }
        
        // Calculate linear vesting
        uint256 timeElapsed = block.timestamp - schedule.startTime;
        return (schedule.totalAmount * timeElapsed) / schedule.duration;
    }
}
