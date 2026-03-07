import type { ZeroXClientConfig } from './types'
import { VaultModule } from './modules/VaultModule'
import { CreditModule } from './modules/CreditModule'
import { ScoreModule } from './modules/ScoreModule'
import { getUserSnapshot } from './utils/multicall'
import type { Address } from 'viem'

/**
 * ZeroXClient — entry point for the @zerox/credit-sdk
 *
 * @example
 * ```ts
 * import { ZeroXClient } from '@zerox/credit-sdk'
 * import { createPublicClient, http } from 'viem'
 * import { avalanche } from 'viem/chains'
 *
 * const client = new ZeroXClient({
 *   publicClient: createPublicClient({ chain: avalanche, transport: http() }),
 *   addresses: {
 *     vaultUSDC: '0x...',
 *     credit:    '0x...',
 *     score:     '0x...',
 *   },
 * })
 *
 * const score = await client.score.getScoreData('0xABC...')
 * // { score: 742, tier: 'VERY_GOOD', signals: {...} }
 *
 * const position = await client.vault.getUserPosition('USDC', '0xABC...')
 * // { shares, assetsUSD, sharePrice }
 *
 * const snapshot = await client.getUserSnapshot('0xABC...')
 * // Batched: vaultUSDC, vaultUSDT, score, credit in one multicall
 * ```
 */
export class ZeroXClient {
  readonly vault:  VaultModule
  readonly credit: CreditModule
  readonly score:  ScoreModule

  private readonly config: ZeroXClientConfig

  constructor(config: ZeroXClientConfig) {
    this.config = config
    this.vault  = new VaultModule(config)
    this.credit = new CreditModule(config)
    this.score  = new ScoreModule(config)
  }

  /**
   * Fetch all relevant user data in a single multicall batch.
   * Efficient for dashboard loading — one RPC round-trip.
   */
  async getUserSnapshot(user: Address) {
    return getUserSnapshot(this.config.publicClient, this.config, user)
  }
}
