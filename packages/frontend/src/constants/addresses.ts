import { avalanche, avalancheFuji } from 'wagmi/chains'
import type { Address } from 'viem'

interface ChainAddresses {
  registry:  Address
  vaultUSDC: Address
  vaultUSDT: Address
  vaultAUSD: Address  // Agora USD vault (T-bill yield)
  credit:    Address
  score:     Address
  // Tokens
  USDC: Address
  USDT: Address
  // Agora USD — same address on all EVM chains
  AUSD: Address
  // External
  AAVE_POOL:   Address
  BENQI_USDC:  Address
  CL_USDC_USD: Address
  CL_USDT_USD: Address
  // Agora StableSwap pair (USDC/AUSD) — contact Agora for whitelist
  AGORA_SWAP: Address
}

// Agora USD — same address on all EVM chains (deployed at vanity address)
const AUSD_ADDRESS: Address = '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a'
const ZERO: Address = '0x0000000000000000000000000000000000000000'

export const ADDRESSES: Record<number, ChainAddresses> = {
  [avalanche.id]: {
    registry:  ZERO,  // populated from deployments/mainnet.json post-deploy
    vaultUSDC: ZERO,
    vaultUSDT: ZERO,
    vaultAUSD: ZERO,
    credit:    ZERO,
    score:     ZERO,
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    AUSD: AUSD_ADDRESS,
    AAVE_POOL:   '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    BENQI_USDC:  '0xB715808a78F6041E46d61Cb123C9B4A27056AE9C',
    CL_USDC_USD: '0xF096872672F44d6EBA71527d2ae83EB827571358',
    CL_USDT_USD: '0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a',
    AGORA_SWAP:  ZERO,  // fill after coordinating with Agora for APPROVED_SWAPPER whitelist
  },
  [avalancheFuji.id]: {
    registry:  '0xBE12f47fcE3100ebe7fFB60122E9356cedb7923e',
    vaultUSDC: '0xb56098Ef9Ac2296f306A014e58e432105Cc37329',
    vaultUSDT: ZERO,
    vaultAUSD: ZERO,
    credit:    '0xdadFbb531FEB9C4375d7c6ab347554484d097beF',
    score:     '0xC41845eA00181ebc709f647E1d47ed69746d485A',
    USDC: '0x5425890298aed601595a70AB815c96711a31Bc65',
    USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    AUSD: AUSD_ADDRESS,
    AAVE_POOL:   '0x1775ECC8362dB6CaB0c7A9C0957cF656A5276c29',
    BENQI_USDC:  ZERO,
    CL_USDC_USD: '0x7898AcCC83587C3C55116c5230C17a07CD018F53',
    CL_USDT_USD: ZERO,
    AGORA_SWAP:  ZERO,
  },
}

export function getAddresses(chainId: number): ChainAddresses {
  return ADDRESSES[chainId] ?? ADDRESSES[avalanche.id]!
}
