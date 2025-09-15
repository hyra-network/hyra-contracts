// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title TokenVesting
 * @notice Hợp đồng phân phối token dần theo thời gian với bảo mật cao
 * @dev Giải quyết vấn đề tập trung hóa trong phân phối token ban đầu
 */
contract TokenVesting is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    
    // ============ Structs ============
    struct VestingSchedule {
        bool initialized;        // Đã khởi tạo chưa
        bool revocable;         // Có thể hủy không
        uint256 totalAmount;    // Tổng số token được vest
        uint256 releasedAmount; // Số token đã phát hành
        uint256 startTime;      // Thời gian bắt đầu vesting
        uint256 duration;       // Thời gian vesting (seconds)
        uint256 cliff;          // Thời gian cliff (seconds)
        address beneficiary;    // Người nhận token
        string purpose;         // Mục đích sử dụng token
    }
    
    // ============ State Variables ============
    IERC20 public token;                              // Token được vest
    mapping(bytes32 => VestingSchedule) public vestingSchedules; // Lịch trình vesting
    mapping(address => uint256) public totalVestedAmount;        // Tổng token vested cho mỗi người
    mapping(address => uint256) public totalReleasedAmount;      // Tổng token đã phát hành cho mỗi người
    
    uint256 public totalVestingSchedules;             // Tổng số lịch trình vesting
    uint256 public constant MIN_VESTING_DURATION = 30 days;     // Thời gian vesting tối thiểu
    uint256 public constant MAX_VESTING_DURATION = 10 * 365 days; // Thời gian vesting tối đa (10 năm)
    
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
     * @notice Khởi tạo hợp đồng vesting
     * @param _token Địa chỉ token ERC20
     * @param _owner Chủ sở hữu hợp đồng (thường là multi-sig)
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
     * @notice Tạo lịch trình vesting mới
     * @param _beneficiary Người nhận token
     * @param _totalAmount Tổng số token
     * @param _startTime Thời gian bắt đầu
     * @param _duration Thời gian vesting
     * @param _cliff Thời gian cliff
     * @param _revocable Có thể hủy không
     * @param _purpose Mục đích sử dụng
     * @return vestingScheduleId ID của lịch trình vesting
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
        // Kiểm tra token balance của contract
        if (token.balanceOf(address(this)) < _totalAmount) {
            revert InsufficientTokenBalance();
        }
        
        // Tạo ID duy nhất cho vesting schedule
        vestingScheduleId = keccak256(abi.encodePacked(
            _beneficiary,
            _totalAmount,
            _startTime,
            _duration,
            _cliff,
            _purpose,
            block.timestamp
        ));
        
        // Kiểm tra vesting schedule đã tồn tại chưa
        if (vestingSchedules[vestingScheduleId].initialized) {
            revert VestingScheduleAlreadyExists();
        }
        
        // Tạo vesting schedule
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
        
        // Cập nhật thống kê
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
     * @notice Phát hành token đã vested
     * @param _vestingScheduleId ID của lịch trình vesting
     * @return releasedAmount Số token đã phát hành
     */
    function release(bytes32 _vestingScheduleId) 
        external 
        nonReentrant 
        vestingScheduleExists(_vestingScheduleId)
        returns (uint256 releasedAmount)
    {
        VestingSchedule storage schedule = vestingSchedules[_vestingScheduleId];
        
        // Tính toán số token có thể phát hành
        releasedAmount = _calculateReleasableAmount(schedule);
        
        if (releasedAmount == 0) {
            revert NoTokensToRelease();
        }
        
        // Cập nhật trạng thái
        schedule.releasedAmount += releasedAmount;
        totalReleasedAmount[schedule.beneficiary] += releasedAmount;
        
        // Chuyển token
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
     * @notice Phát hành token cho tất cả lịch trình của một người
     * @param _beneficiary Người nhận token
     * @return totalReleased Tổng số token đã phát hành
     */
    function releaseAllForBeneficiary(address _beneficiary) 
        external 
        nonReentrant 
        validAddress(_beneficiary)
        returns (uint256 totalReleased)
    {
        totalReleased = 0;
        
        // Lưu ý: Trong thực tế, cần implement cách để tìm tất cả vesting schedules của một beneficiary
        // Đây là implementation đơn giản, có thể cần cải thiện
        for (uint256 i = 0; i < totalVestingSchedules; i++) {
            // Implementation chi tiết cần thêm mapping để track vesting schedules per beneficiary
        }
        
        return totalReleased;
    }
    
    /**
     * @notice Hủy lịch trình vesting (chỉ khi revocable = true)
     * @param _vestingScheduleId ID của lịch trình vesting
     * @return revokedAmount Số token đã hủy
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
        
        // Tính toán số token còn lại chưa vest
        uint256 vestedAmount = _calculateVestedAmount(schedule);
        revokedAmount = schedule.totalAmount - vestedAmount;
        
        if (revokedAmount == 0) {
            revert AlreadyRevoked();
        }
        
        // Cập nhật trạng thái
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
     * @notice Rút token khẩn cấp (chỉ owner)
     * @param _amount Số token cần rút
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
     * @notice Tính toán số token có thể phát hành
     * @param _vestingScheduleId ID của lịch trình vesting
     * @return Số token có thể phát hành
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
     * @notice Tính toán số token đã vested
     * @param _vestingScheduleId ID của lịch trình vesting
     * @return Số token đã vested
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
     * @notice Lấy thông tin chi tiết của vesting schedule
     * @param _vestingScheduleId ID của lịch trình vesting
     * @return schedule Thông tin chi tiết
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
     * @notice Tính tổng token có thể phát hành cho một người
     * @param _beneficiary Người nhận token
     * @return Tổng số token có thể phát hành
     */
    function getTotalReleasableAmount(address _beneficiary) 
        external 
        view 
        returns (uint256)
    {
        // Implementation cần thêm mapping để track vesting schedules per beneficiary
        return 0;
    }
    
    // ============ Internal Functions ============
    
    /**
     * @notice Tính toán số token có thể phát hành
     * @param schedule Lịch trình vesting
     * @return Số token có thể phát hành
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
     * @notice Tính toán số token đã vested
     * @param schedule Lịch trình vesting
     * @return Số token đã vested
     */
    function _calculateVestedAmount(VestingSchedule storage schedule) 
        internal 
        view 
        returns (uint256)
    {
        // Kiểm tra thời gian bắt đầu
        if (block.timestamp < schedule.startTime) {
            return 0;
        }
        
        // Kiểm tra thời gian cliff
        if (block.timestamp < schedule.startTime + schedule.cliff) {
            return 0;
        }
        
        // Kiểm tra thời gian kết thúc
        if (block.timestamp >= schedule.startTime + schedule.duration) {
            return schedule.totalAmount;
        }
        
        // Tính toán linear vesting
        uint256 timeElapsed = block.timestamp - schedule.startTime;
        return (schedule.totalAmount * timeElapsed) / schedule.duration;
    }
}
