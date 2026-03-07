import type { PublicClient, Address } from 'viem'
import { SCORE_ABI } from '../abis'
import type { UserScore, ScoreTier, ZeroXClientConfig } from '../types'

const TIER_MAP: Record<string, ScoreTier> = {
  'EXCELLENT': 'EXCELLENT',
  'VERY_GOOD': 'VERY_GOOD',
  'GOOD':      'GOOD',
  'FAIR':      'FAIR',
  'POOR':      'POOR',
}

export class ScoreModule {
  private client: PublicClient
  private address?: Address

  constructor(config: ZeroXClientConfig) {
    this.client  = config.publicClient
    this.address = config.addresses.score
  }

  private ensureAddress(): Address {
    if (!this.address) throw new Error('Score contract address not configured')
    return this.address
  }

  async getScore(user: Address): Promise<number> {
    const addr = this.ensureAddress()
    return this.client.readContract({
      address:      addr,
      abi:          SCORE_ABI,
      functionName: 'getScore',
      args:         [user],
    })
  }

  async getScoreData(user: Address): Promise<UserScore> {
    const addr = this.ensureAddress()

    const [data, tierStr] = await Promise.all([
      this.client.readContract({
        address: addr, abi: SCORE_ABI, functionName: 'getScoreData', args: [user],
      }),
      this.client.readContract({
        address: addr, abi: SCORE_ABI, functionName: 'getRiskTier', args: [0],
      }),
    ])

    // Get the actual tier for this score
    const actualTierStr = await this.client.readContract({
      address: addr, abi: SCORE_ABI, functionName: 'getRiskTier', args: [data.score],
    })

    const tier = TIER_MAP[actualTierStr] ?? 'POOR'

    return {
      score:       data.score,
      tier,
      lastUpdated: data.lastUpdated,
      signals: {
        repayment:       data.repaymentSignal,
        utilization:     data.utilizationSignal,
        accountAge:      data.accountAgeSignal,
        collateral:      data.collateralSignal,
        diversification: data.diversificationSignal,
      },
      stats: {
        totalRepayments:  data.totalRepayments,
        onTimeRepayments: data.onTimeRepayments,
        liquidationCount: data.liquidationCount,
        totalVolumeUSD:   data.totalVolumeUSD,
        firstDepositAt:   data.firstDepositAt,
      },
    }
  }

  async isInitialized(user: Address): Promise<boolean> {
    const addr = this.ensureAddress()
    return this.client.readContract({
      address: addr, abi: SCORE_ABI, functionName: 'isInitialized', args: [user],
    })
  }

  getTierLabel(tier: ScoreTier): string {
    return {
      EXCELLENT: 'Excellent',
      VERY_GOOD: 'Very Good',
      GOOD:      'Good',
      FAIR:      'Fair',
      POOR:      'Poor',
    }[tier]
  }
}
