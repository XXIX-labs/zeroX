import type { PublicClient, WalletClient, Address, Hash } from 'viem'

export interface ZeroXClientConfig {
  publicClient: PublicClient
  walletClient?: WalletClient
  addresses: {
    vaultUSDC?:  Address
    vaultUSDT?:  Address
    credit?:     Address
    score?:      Address
  }
}

export type ScoreTier = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'FAIR' | 'POOR'

export interface UserScore {
  score:               number
  tier:                ScoreTier
  lastUpdated:         number
  signals: {
    repayment:       number
    utilization:     number
    accountAge:      number
    collateral:      number
    diversification: number
  }
  stats: {
    totalRepayments:  number
    onTimeRepayments: number
    liquidationCount: number
    totalVolumeUSD:   number
    firstDepositAt:   number
  }
}

export interface UserPosition {
  vaultAddress:  Address
  token:         string
  shares:        bigint
  assetsUSD:     bigint
  sharePrice:    bigint
}

export interface VaultInfo {
  address:    Address
  token:      string
  totalAssets: bigint
  totalSupply: bigint
  aaveApy:    bigint  // bps
  benqiApy:   bigint  // bps
  aaveAlloc:  bigint  // bps
  benqiAlloc: bigint  // bps
}

export interface CreditLineInfo {
  isOpen:          boolean
  collateralVault: Address
  collateralShares: bigint
  principal:       bigint
  interestIndex:   bigint
  openedAt:        number
  currentDebt: {
    principal: bigint
    interest:  bigint
  }
  healthFactor:    bigint  // scaled 1e18
  maxBorrowable:   bigint
  collateralUSD:   bigint
}

export interface TxResult {
  hash: Hash
  wait: () => Promise<void>
}
