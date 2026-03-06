import { useReadContract } from 'wagmi'
import { useAccount, useChainId } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { ADDRESSES } from '../constants/addresses'
import { getTierForScore } from '../lib/scoreUtils'

const SCORE_ABI = [
  { type: 'function', name: 'getScore',     inputs: [{ type: 'address' }], outputs: [{ type: 'uint16' }], stateMutability: 'view' },
  { type: 'function', name: 'getScoreData', inputs: [{ type: 'address' }], outputs: [{ type: 'tuple', components: [{ name: 'score', type: 'uint16' }, { name: 'lastUpdated', type: 'uint40' }, { name: 'repaymentSignal', type: 'uint32' }, { name: 'utilizationSignal', type: 'uint32' }, { name: 'accountAgeSignal', type: 'uint32' }, { name: 'collateralSignal', type: 'uint32' }, { name: 'diversificationSignal', type: 'uint32' }, { name: 'totalRepayments', type: 'uint32' }, { name: 'onTimeRepayments', type: 'uint32' }, { name: 'totalVolumeUSD', type: 'uint32' }, { name: 'liquidationCount', type: 'uint8' }, { name: 'firstDepositAt', type: 'uint40' }] }], stateMutability: 'view' },
  { type: 'function', name: 'isInitialized', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
] as const

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export function useScore(overrideAddress?: `0x${string}`) {
  const { address: connectedUser } = useAccount()
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const scoreAddress = addrs?.score
  const user = overrideAddress ?? connectedUser

  // On-chain primary source
  const { data: scoreData, isLoading: loadingChain, refetch } = useReadContract({
    address:      scoreAddress,
    abi:          SCORE_ABI,
    functionName: 'getScoreData',
    args:         user ? [user] : undefined,
    query: { enabled: !!user && !!scoreAddress, refetchInterval: 30_000 },
  })

  // API fallback / history
  const { data: apiScore } = useQuery({
    queryKey: ['score', user],
    queryFn:  async () => {
      const res = await fetch(`${API_URL}/api/v1/score/${user}`)
      if (!res.ok) throw new Error('Score not found')
      return res.json()
    },
    enabled: !!user,
    staleTime: 30_000,
    retry: false,
  })

  // Prefer on-chain data, fall back to API
  const score = scoreData?.score ?? apiScore?.score ?? 600
  const tier = getTierForScore(score)

  return {
    score,
    tier,
    isLoading: loadingChain && !apiScore,
    signals: scoreData
      ? {
          repayment:       scoreData.repaymentSignal,
          utilization:     scoreData.utilizationSignal,
          accountAge:      scoreData.accountAgeSignal,
          collateral:      scoreData.collateralSignal,
          diversification: scoreData.diversificationSignal,
        }
      : apiScore
        ? {
            repayment:       apiScore.repaymentSignal ?? 0,
            utilization:     apiScore.utilizationSignal ?? 0,
            accountAge:      apiScore.accountAgeSignal ?? 0,
            collateral:      apiScore.collateralSignal ?? 0,
            diversification: apiScore.diversifySignal ?? 0,
          }
        : null,
    stats: scoreData
      ? {
          totalRepayments:  scoreData.totalRepayments,
          onTimeRepayments: scoreData.onTimeRepayments,
          liquidationCount: scoreData.liquidationCount,
          firstDepositAt:   scoreData.firstDepositAt,
        }
      : null,
    refetch,
  }
}

export function useScoreHistory(days = 90) {
  const { address: user } = useAccount()

  return useQuery({
    queryKey: ['scoreHistory', user, days],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/score/${user}/history?days=${days}`)
      if (!res.ok) throw new Error('Failed to fetch history')
      return res.json() as Promise<Array<{ score: number; computedAt: string; triggerEvent: string | null }>>
    },
    enabled:   !!user,
    staleTime: 60_000,
  })
}
