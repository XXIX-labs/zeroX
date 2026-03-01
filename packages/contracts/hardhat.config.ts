import { HardhatUserConfig } from 'hardhat/config'
import '@nomicfoundation/hardhat-toolbox'
import '@nomicfoundation/hardhat-foundry'
import 'hardhat-gas-reporter'
import 'solidity-coverage'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const DEPLOYER_PRIVATE_KEY = process.env['DEPLOYER_PRIVATE_KEY'] ?? '0x' + '0'.repeat(64)
const AVALANCHE_RPC_URL = process.env['AVALANCHE_RPC_URL'] ?? 'https://api.avax.network/ext/bc/C/rpc'
const FUJI_RPC_URL = process.env['FUJI_RPC_URL'] ?? 'https://api.avax-test.network/ext/bc/C/rpc'
const SNOWTRACE_API_KEY = process.env['SNOWTRACE_API_KEY'] ?? ''

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'cancun',
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      // Fork Avalanche mainnet for integration tests
      forking: {
        url: AVALANCHE_RPC_URL,
        enabled: process.env['FORK'] === 'true',
        blockNumber: 55000000, // Pin a recent block for reproducible tests
      },
      chainId: 43114,
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        count: 10,
      },
    },
    fuji: {
      url: FUJI_RPC_URL,
      chainId: 43113,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: 25000000000, // 25 gwei
    },
    mainnet: {
      url: AVALANCHE_RPC_URL,
      chainId: 43114,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gasPrice: 25000000000,
    },
  },
  gasReporter: {
    enabled: process.env['REPORT_GAS'] === 'true',
    currency: 'USD',
    gasPrice: 25,
    coinmarketcap: process.env['CMC_API_KEY'],
    outputFile: 'gas-report.txt',
  },
  etherscan: {
    apiKey: {
      avalanche: SNOWTRACE_API_KEY,
      avalancheFujiTestnet: SNOWTRACE_API_KEY,
    },
    customChains: [
      {
        network: 'avalanche',
        chainId: 43114,
        urls: {
          apiURL: 'https://api.snowtrace.io/api',
          browserURL: 'https://snowtrace.io',
        },
      },
      {
        network: 'avalancheFujiTestnet',
        chainId: 43113,
        urls: {
          apiURL: 'https://api-testnet.snowtrace.io/api',
          browserURL: 'https://testnet.snowtrace.io',
        },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test/hardhat',
    cache: './cache',
    artifacts: './artifacts',
  },
  typechain: {
    outDir: './typechain-types',
    target: 'ethers-v6',
  },
}

export default config
