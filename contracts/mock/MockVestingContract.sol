// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockVestingContract
 * @notice Mock contract for testing vesting functionality
 * @dev This is a simple mock that implements basic ERC20 functionality for testing
 */
contract MockVestingContract is Initializable, OwnableUpgradeable {
    
    string public name;
    string public symbol;
    
    mapping(address => uint256) public balances;
    mapping(address => mapping(address => uint256)) public allowances;
    
    uint256 public totalSupply;
    
    // ============ Events ============
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    
    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }
    
    /**
     * @notice Initialize the mock vesting contract
     * @param _name Contract name
     * @param _symbol Contract symbol
     */
    function initialize(string memory _name, string memory _symbol) public initializer {
        __Ownable_init(msg.sender);
        name = _name;
        symbol = _symbol;
    }
    
    /**
     * @notice Mock transfer function for testing
     * @param to Recipient address
     * @param amount Amount to transfer
     * @return success Success status
     */
    function transfer(address to, uint256 amount) external returns (bool success) {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        
        balances[msg.sender] -= amount;
        balances[to] += amount;
        
        emit Transfer(msg.sender, to, amount);
        return true;
    }
    
    /**
     * @notice Mock transferFrom function for testing
     * @param from Sender address
     * @param to Recipient address
     * @param amount Amount to transfer
     * @return success Success status
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool success) {
        require(balances[from] >= amount, "Insufficient balance");
        require(allowances[from][msg.sender] >= amount, "Insufficient allowance");
        
        balances[from] -= amount;
        balances[to] += amount;
        allowances[from][msg.sender] -= amount;
        
        emit Transfer(from, to, amount);
        return true;
    }
    
    /**
     * @notice Mock approve function for testing
     * @param spender Spender address
     * @param amount Amount to approve
     * @return success Success status
     */
    function approve(address spender, uint256 amount) external returns (bool success) {
        allowances[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }
    
    /**
     * @notice Get balance of an address
     * @param account Account address
     * @return balance Balance amount
     */
    function balanceOf(address account) external view returns (uint256 balance) {
        return balances[account];
    }
    
    /**
     * @notice Get allowance
     * @param owner Owner address
     * @param spender Spender address
     * @return allowance Allowance amount
     */
    function allowance(address owner, address spender) external view returns (uint256 allowance) {
        return allowances[owner][spender];
    }
    
    /**
     * @notice Mint tokens (for testing purposes)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external onlyOwner {
        balances[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }
    
    /**
     * @notice Burn tokens (for testing purposes)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) external onlyOwner {
        require(balances[from] >= amount, "Insufficient balance");
        balances[from] -= amount;
        totalSupply -= amount;
        emit Transfer(from, address(0), amount);
    }
}
