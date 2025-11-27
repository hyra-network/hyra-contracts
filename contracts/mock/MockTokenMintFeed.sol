// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "../interfaces/ITokenMintFeed.sol";

/**
 * @title MockTokenMintFeed
 * @notice Mock oracle contract for testing
 * @dev Allows tests to set mint data for specific request IDs
 */
contract MockTokenMintFeed is ITokenMintFeed {
    struct MintData {
        uint256 totalRevenue;
        uint256 tokenPrice;
        uint256 tokensToMint;
        uint64 timestamp;
        bool finalized;
    }

    mapping(uint256 => MintData) public mintData;
    address public owner;

    error NotOwner();
    error InvalidRequestId();

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    /**
     * @notice Set mint data for a specific request ID
     * @param _requestId Request ID
     * @param _totalRevenue Total revenue (USD cents)
     * @param _tokenPrice Token price (USDT, 18 decimals)
     * @param _tokensToMint Tokens to mint (18 decimals)
     * @param _finalized Is finalized
     */
    function setMintData(
        uint256 _requestId,
        uint256 _totalRevenue,
        uint256 _tokenPrice,
        uint256 _tokensToMint,
        bool _finalized
    ) external onlyOwner {
        mintData[_requestId] = MintData({
            totalRevenue: _totalRevenue,
            tokenPrice: _tokenPrice,
            tokensToMint: _tokensToMint,
            timestamp: uint64(block.timestamp),
            finalized: _finalized
        });
    }

    /**
     * @notice Get latest mint data by request ID
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
        override
        returns (
            uint256 totalRevenue,
            uint256 tokenPrice,
            uint256 tokensToMint,
            uint64 timestamp,
            bool finalized
        )
    {
        MintData memory data = mintData[_requestId];
        if (data.tokensToMint == 0 && data.timestamp == 0) {
            revert InvalidRequestId();
        }
        return (
            data.totalRevenue,
            data.tokenPrice,
            data.tokensToMint,
            data.timestamp,
            data.finalized
        );
    }
}

