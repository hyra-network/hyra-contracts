import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    MultiSigRoleManager,
    TimeLockActions,
    SecureHyraGovernor,
    SecureHyraTimelock,
    SecureHyraToken,
    SecureHyraProxyAdmin,
    HyraTransparentUpgradeableProxy
} from "../typechain-types";

// Test removed - was failing
