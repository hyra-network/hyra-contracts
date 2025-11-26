// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

/**
 * @title ITokenMintFeed
 * @notice Interface for TokenMintFeed oracle contract
 * @dev External contract - DO NOT MODIFY
 */
interface ITokenMintFeed {
    /**
     * @dev Get latest mint data by request ID
     * @param _requestId Request ID
     * @return totalRevenue Total revenue (USD cents)
     * @return tokenPrice Token price (USDT, 18 decimals)
     * @return tokensToMint Tokens to mint (18 decimals)
     * @return timestamp Update timestamp
     * @return finalized Is finalized
     */
    function getLatestMintData(uint256 _requestId)
        external
        view
        returns (
            uint256 totalRevenue,
            uint256 tokenPrice,
            uint256 tokensToMint,
            uint64 timestamp,
            bool finalized
        );
}

