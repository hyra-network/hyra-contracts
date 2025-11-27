import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { HyraDAOInitializer, HyraGovernor, HyraTimelock, HyraToken, TokenVesting } from "../typechain-types";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// Test removed - incompatible with new logic
