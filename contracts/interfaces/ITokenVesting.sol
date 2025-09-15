// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ITokenVesting
 * @notice Interface for gradual token distribution contract
 */
interface ITokenVesting {
    
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
    
    // ============ Functions ============
    
    /**
     * @notice Initialize vesting contract
     * @param _token ERC20 token address
     * @param _owner Contract owner
     */
    function initialize(address _token, address _owner) external;
    
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
    ) external returns (bytes32 vestingScheduleId);
    
    /**
     * @notice Release vested tokens
     * @param _vestingScheduleId Vesting schedule ID
     * @return releasedAmount Amount of tokens released
     */
    function release(bytes32 _vestingScheduleId) external returns (uint256 releasedAmount);
    
    /**
     * @notice Release tokens for all schedules of a beneficiary
     * @param _beneficiary Token recipient
     * @return totalReleased Total amount of tokens released
     */
    function releaseAllForBeneficiary(address _beneficiary) external returns (uint256 totalReleased);
    
    /**
     * @notice Revoke vesting schedule
     * @param _vestingScheduleId Vesting schedule ID
     * @return revokedAmount Amount of tokens revoked
     */
    function revoke(bytes32 _vestingScheduleId) external returns (uint256 revokedAmount);
    
    /**
     * @notice Emergency token withdrawal
     * @param _amount Amount of tokens to withdraw
     */
    function emergencyWithdraw(uint256 _amount) external;
    
    // ============ View Functions ============
    
    /**
     * @notice Calculate releasable token amount
     * @param _vestingScheduleId Vesting schedule ID
     * @return Releasable token amount
     */
    function getReleasableAmount(bytes32 _vestingScheduleId) external view returns (uint256);
    
    /**
     * @notice Calculate vested token amount
     * @param _vestingScheduleId Vesting schedule ID
     * @return Vested token amount
     */
    function getVestedAmount(bytes32 _vestingScheduleId) external view returns (uint256);
    
    /**
     * @notice Get detailed vesting schedule information
     * @param _vestingScheduleId Vesting schedule ID
     * @return schedule Detailed information
     */
    function getVestingSchedule(bytes32 _vestingScheduleId) external view returns (VestingSchedule memory schedule);
    
    /**
     * @notice Calculate total releasable tokens for a beneficiary
     * @param _beneficiary Token recipient
     * @return Total releasable token amount
     */
    function getTotalReleasableAmount(address _beneficiary) external view returns (uint256);
    
    /**
     * @notice Get vesting schedule by ID
     * @param _vestingScheduleId Vesting schedule ID
     * @return schedule Vesting schedule
     */
    function vestingSchedules(bytes32 _vestingScheduleId) external view returns (VestingSchedule memory schedule);
    
    /**
     * @notice Get total vested tokens for a beneficiary
     * @param _beneficiary Token recipient
     * @return Total vested token amount
     */
    function totalVestedAmount(address _beneficiary) external view returns (uint256);
    
    /**
     * @notice Get total released tokens for a beneficiary
     * @param _beneficiary Token recipient
     * @return Total released token amount
     */
    function totalReleasedAmount(address _beneficiary) external view returns (uint256);
}
