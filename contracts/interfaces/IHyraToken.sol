// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/governance/utils/IVotes.sol";

/**
 * @title IHyraToken
 * @notice Minimal interface for HyraToken - only essential public functions
 */
interface IHyraToken is IERC20, IVotes {
    // Governance transfer
    function transferGovernance(address newGovernance) external;
    
    // Pause functionality
    function pause() external;
    function unpause() external;
    
    // Essential view functions for external contracts
    function totalMintedSupply() external view returns (uint256);
}