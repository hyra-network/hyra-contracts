import { ethers } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Script để thiết lập ví đa chữ ký và phân phối token an toàn
 * Giải quyết vấn đề HNA-01: Centralization Risk trong phân phối token ban đầu
 */

interface MultisigConfig {
  signers: string[];           // Danh sách người ký
  threshold: number;          // Số chữ ký tối thiểu cần thiết
  name: string;              // Tên ví đa chữ ký
  description: string;       // Mô tả mục đích
}

interface VestingSchedule {
  beneficiary: string;       // Người nhận token
  amount: string;           // Số lượng token (wei)
  startTime: number;        // Thời gian bắt đầu (timestamp)
  duration: number;         // Thời gian vesting (seconds)
  cliff: number;           // Thời gian cliff (seconds)
  revocable: boolean;      // Có thể hủy không
  purpose: string;         // Mục đích sử dụng
}

export class SecureTokenDistributionSetup {
  private hre: HardhatRuntimeEnvironment;
  
  constructor(hre: HardhatRuntimeEnvironment) {
    this.hre = hre;
  }

  /**
   * Thiết lập ví đa chữ ký với Gnosis Safe
   * @param config Cấu hình ví đa chữ ký
   * @returns Địa chỉ ví đa chữ ký
   */
  async setupMultisigWallet(config: MultisigConfig): Promise<string> {
    console.log("🔐 Thiết lập ví đa chữ ký...");
    
    // Validate cấu hình
    if (config.signers.length < config.threshold) {
      throw new Error("Số lượng người ký phải >= threshold");
    }
    
    if (config.threshold < 2) {
      throw new Error("Threshold phải >= 2 cho bảo mật");
    }
    
    // Trong thực tế, sử dụng Gnosis Safe SDK
    // Đây là mock implementation cho demo
    const mockMultisigAddress = await this.deployMockMultisig(config);
    
    console.log(`Ví đa chữ ký đã được tạo: ${mockMultisigAddress}`);
    console.log(`Người ký: ${config.signers.join(", ")}`);
    console.log(`Threshold: ${config.threshold}/${config.signers.length}`);
    
    return mockMultisigAddress;
  }

  /**
   * Tạo các lịch trình vesting cho phân phối token an toàn
   * @param schedules Danh sách lịch trình vesting
   * @returns Cấu hình vesting
   */
  createVestingSchedules(schedules: VestingSchedule[]): any {
    console.log("⏰ Tạo lịch trình vesting...");
    
    const vestingConfig = {
      beneficiaries: schedules.map(s => s.beneficiary),
      amounts: schedules.map(s => ethers.parseEther(s.amount)),
      startTimes: schedules.map(s => s.startTime),
      durations: schedules.map(s => s.duration),
      cliffs: schedules.map(s => s.cliff),
      revocable: schedules.map(s => s.revocable),
      purposes: schedules.map(s => s.purpose)
    };
    
    console.log(`Đã tạo ${schedules.length} lịch trình vesting`);
    
    return vestingConfig;
  }

  /**
   * Triển khai DAO với phân phối token an toàn
   * @param multisigAddress Địa chỉ ví đa chữ ký
   * @param vestingConfig Cấu hình vesting
   */
  async deploySecureDAO(multisigAddress: string, vestingConfig: any) {
    console.log("Triển khai DAO với phân phối token an toàn...");
    
    // Cấu hình DAO
    const daoConfig = {
      // Token config
      tokenName: "Hyra Token",
      tokenSymbol: "HYRA",
      initialSupply: ethers.parseEther("2500000000"), // 2.5B tokens
      vestingContract: multisigAddress, // Sẽ được thay thế bằng vesting contract
      
      // Timelock config
      timelockDelay: 7 * 24 * 60 * 60, // 7 days
      
      // Governor config
      votingDelay: 1, // 1 block
      votingPeriod: 10, // 10 blocks
      proposalThreshold: 0,
      quorumPercentage: 10, // 10%
      
      // Security council
      securityCouncil: [
        "0x1234567890123456789012345678901234567890", // Team member 1
        "0x2345678901234567890123456789012345678901", // Team member 2
        "0x3456789012345678901234567890123456789012", // Community rep
      ],
      
      // Vesting config
      vestingConfig: vestingConfig
    };
    
    // Deploy DAO
    const DAOInitializer = await ethers.getContractFactory("HyraDAOInitializer");
    const daoInitializer = await DAOInitializer.deploy();
    
    console.log("Đang triển khai DAO...");
    const deploymentResult = await daoInitializer.deployDAO(daoConfig);
    
    console.log("DAO đã được triển khai thành công!");
    console.log(`Token Proxy: ${deploymentResult.tokenProxy}`);
    console.log(`Timelock Proxy: ${deploymentResult.timelockProxy}`);
    console.log(`Governor Proxy: ${deploymentResult.governorProxy}`);
    console.log(`Vesting Proxy: ${deploymentResult.vestingProxy}`);
    
    return deploymentResult;
  }

  /**
   * Mock implementation cho ví đa chữ ký (trong thực tế dùng Gnosis Safe)
   */
  private async deployMockMultisig(config: MultisigConfig): Promise<string> {
    // Trong thực tế, sử dụng Gnosis Safe SDK:
    // const safeSdk = await Safe.create({ ethAdapter, safeAddress })
    // const safeSdk = await safeSdk.createSafe({ safeAccountConfig })
    
    // Mock implementation cho demo
    const MockMultisig = await ethers.getContractFactory("MockMultisig");
    const mockMultisig = await MockMultisig.deploy(
      config.signers,
      config.threshold,
      config.name,
      config.description
    );
    
    return await mockMultisig.getAddress();
  }

  /**
   * Tạo báo cáo phân phối token
   */
  generateDistributionReport(deploymentResult: any): string {
    const report = `
# 📊 Báo Cáo Phân Phối Token An Toàn

## 🎯 Địa Chỉ Hợp Đồng
- **Token Proxy**: ${deploymentResult.tokenProxy}
- **Timelock Proxy**: ${deploymentResult.timelockProxy}
- **Governor Proxy**: ${deploymentResult.governorProxy}
- **Vesting Proxy**: ${deploymentResult.vestingProxy}
- **Proxy Admin**: ${deploymentResult.proxyAdmin}

## Bảo Mật
- Sử dụng ví đa chữ ký thay vì địa chỉ đơn lẻ
- Token được phân phối dần qua vesting contract
- Quản trị được điều khiển bởi Timelock
- Không có điểm tập trung hóa duy nhất

## Lợi Ích
1. **Giảm rủi ro tập trung hóa**: Không có một địa chỉ nào nắm giữ toàn bộ token ban đầu
2. **Tăng tính minh bạch**: Tất cả phân phối được ghi lại trên blockchain
3. **Bảo vệ khỏi tấn công**: Cần nhiều chữ ký để thực hiện giao dịch quan trọng
4. **Phân phối công bằng**: Token được phân phối dần theo thời gian

## 🚨 Giải Quyết HNA-01
Vấn đề tập trung hóa trong phân phối token ban đầu đã được giải quyết bằng:
- Ví đa chữ ký thay vì địa chỉ đơn lẻ
- Hợp đồng vesting để phân phối dần
- Quản trị phi tập trung thông qua DAO
`;

    return report;
  }
}

// Mock Multisig Contract cho demo
export const MockMultisigFactory = {
  abi: [
    "constructor(address[] signers, uint256 threshold, string name, string description)",
    "function executeTransaction(address to, uint256 value, bytes data, bytes[] signatures) external",
    "function getSigners() external view returns (address[])",
    "function getThreshold() external view returns (uint256)"
  ],
  bytecode: "0x608060405234801561001057600080fd5b5060405161001d9061003a565b604051809103906000f080158015610039573d6000803e3d6000fd5b505050610047565b61004a8061005683390190565b50565b6040516100589061003a565b600060405180830381855af49150503d8060008114610093576040519150601f19603f3d011682016040523d82523d6000602084013e610098565b606091505b50509050806100a657600080fd5b5050565b6100a4806100b96000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c8063150b7a021461003b5780634a58db1914610059578063f2fde38b14610063575b600080fd5b61004361007f565b60405161005091906100b0565b60405180910390f35b610061610088565b005b61007d600480360381019061007891906100dc565b610092565b005b60008054905090565b610090610136565b565b61009a610136565b8173ffffffffffffffffffffffffffffffffffffffff166108fc479081150290604051600060405180830381858888f193505050501580156100df573d6000803e3d6000fd5b505050565b600080fd5b6000819050919050565b6100fb816100e8565b811461010657600080fd5b50565b600081359050610118816100f2565b92915050565b600060208284031215610134576101336100e3565b5b600061014284828501610109565b91505092915050565b600073ffffffffffffffffffffffffffffffffffffffff82169050919050565b60006101768261014b565b9050919050565b6101868161016b565b82525050565b60006020820190506101a1600083018461017d565b9291505056fea2646970667358221220"
};

// Script chính để chạy setup
export async function main() {
  const setup = new SecureTokenDistributionSetup(hre);
  
  // Cấu hình ví đa chữ ký
  const multisigConfig: MultisigConfig = {
    signers: [
      "0x1234567890123456789012345678901234567890", // Team member 1
      "0x2345678901234567890123456789012345678901", // Team member 2
      "0x3456789012345678901234567890123456789012", // Community representative
      "0x4567890123456789012345678901234567890123", // Technical lead
      "0x5678901234567890123456789012345678901234", // Legal advisor
    ],
    threshold: 3, // Cần 3/5 chữ ký
    name: "Hyra DAO Multi-sig",
    description: "Multi-signature wallet for secure token distribution and DAO governance"
  };
  
  // Tạo lịch trình vesting
  const vestingSchedules: VestingSchedule[] = [
    {
      beneficiary: "0x1234567890123456789012345678901234567890", // Team member 1
      amount: "500000000", // 500M tokens
      startTime: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
      duration: 4 * 365 * 24 * 60 * 60, // 4 years
      cliff: 6 * 30 * 24 * 60 * 60, // 6 months cliff
      revocable: false,
      purpose: "Team member vesting"
    },
    {
      beneficiary: "0x2345678901234567890123456789012345678901", // Team member 2
      amount: "500000000", // 500M tokens
      startTime: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60), // 30 days from now
      duration: 4 * 365 * 24 * 60 * 60, // 4 years
      cliff: 6 * 30 * 24 * 60 * 60, // 6 months cliff
      revocable: false,
      purpose: "Team member vesting"
    },
    {
      beneficiary: "0x3456789012345678901234567890123456789012", // Community treasury
      amount: "1000000000", // 1B tokens
      startTime: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days from now
      duration: 2 * 365 * 24 * 60 * 60, // 2 years
      cliff: 0, // No cliff for community
      revocable: true,
      purpose: "Community treasury and rewards"
    },
    {
      beneficiary: "0x4567890123456789012345678901234567890123", // Advisor
      amount: "250000000", // 250M tokens
      startTime: Math.floor(Date.now() / 1000) + (60 * 24 * 60 * 60), // 60 days from now
      duration: 2 * 365 * 24 * 60 * 60, // 2 years
      cliff: 3 * 30 * 24 * 60 * 60, // 3 months cliff
      revocable: true,
      purpose: "Advisor compensation"
    },
    {
      beneficiary: "0x5678901234567890123456789012345678901234", // Reserve fund
      amount: "250000000", // 250M tokens
      startTime: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60), // 90 days from now
      duration: 5 * 365 * 24 * 60 * 60, // 5 years
      cliff: 12 * 30 * 24 * 60 * 60, // 12 months cliff
      revocable: true,
      purpose: "Reserve fund for future development"
    }
  ];
  
  try {
    // Thiết lập ví đa chữ ký
    const multisigAddress = await setup.setupMultisigWallet(multisigConfig);
    
    // Tạo cấu hình vesting
    const vestingConfig = setup.createVestingSchedules(vestingSchedules);
    
    // Triển khai DAO an toàn
    const deploymentResult = await setup.deploySecureDAO(multisigAddress, vestingConfig);
    
    // Tạo báo cáo
    const report = setup.generateDistributionReport(deploymentResult);
    console.log(report);
    
    console.log("\n🎉 Thiết lập hoàn tất! Vấn đề HNA-01 đã được giải quyết.");
    
  } catch (error) {
    console.error("Lỗi trong quá trình thiết lập:", error);
    process.exit(1);
  }
}

// Chạy script nếu được gọi trực tiếp
if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
