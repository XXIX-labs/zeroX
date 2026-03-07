// Main client
export { ZeroXClient } from './ZeroXClient'

// Modules (for selective imports)
export { VaultModule } from './modules/VaultModule'
export { CreditModule } from './modules/CreditModule'
export { ScoreModule } from './modules/ScoreModule'

// Types
export type {
  ZeroXClientConfig,
  ScoreTier,
  UserScore,
  UserPosition,
  VaultInfo,
  CreditLineInfo,
  TxResult,
} from './types'

// Utils
export { getUserSnapshot } from './utils/multicall'

// ABIs (for direct viem usage)
export { VAULT_ABI, CREDIT_ABI, SCORE_ABI, ERC20_ABI } from './abis'
