// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/**
 * @title IHyraToken
 * @notice Minimal interface for HyraToken - only essential public functions
 */
interface IHyraToken is IERC20, IVotes {
    // Core minting functions that external contracts need
    function mint(address to, uint256 amount) external;
    function addMinter(address minter) external;
    function removeMinter(address minter) external;
    function setMintAllowance(address minter, uint256 allowance) external;
    
    // Governance transfer
    function transferGovernance(address newGovernance) external;
    
    // Pause functionality
    function pause() external;
    function unpause() external;
    
    // Essential view functions for external contracts
    function isMinter(address account) external view returns (bool);
    function mintAllowances(address minter) external view returns (uint256);
    function governanceAddress() external view returns (address);
    function totalMintedSupply() external view returns (uint256);
}