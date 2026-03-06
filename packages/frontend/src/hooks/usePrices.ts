import { useQuery } from '@tanstack/react-query'
import { useReadContracts } from 'wagmi'
import { useChainId } from 'wagmi'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

// Chainlink AggregatorV3 ABI (minimal)
const CL_ABI = [
  {
    type: 'function',
    name: 'latestRoundData',
    inputs: [],
    outputs: [
      { name: 'roundId',         type: 'uint80'  },
      { name: 'answer',          type: 'int256'  },
      { name: 'startedAt',       type: 'uint256' },
      { name: 'updatedAt',       type: 'uint256' },
      { name: 'answeredInRound', type: 'uint80'  },
    ],
    stateMutability: 'view',
  },
  { type: 'function', name: 'decimals', inputs: [], outputs: [{ type: 'uint8' }], stateMutability: 'view' },
] as const

// Mainnet Chainlink feed addresses
const FEEDS = {
  43114: {
    AVAX_USD: '0x0A77230d17318075983913bC2145DB16C7366156' as const,
    USDC_USD: '0xF096872672F44d6EBA71527d2ae83EB827571358' as const,
  },
  43113: {
    // Fuji testnet feeds (if available)
    AVAX_USD: '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD' as const,
    USDC_USD: '0x7898AcCC83587C3C55116c5230C17a6Cd9C71bad' as const,
  },
}

export function usePrices() {
  const chainId = useChainId()
  const feeds = FEEDS[chainId as keyof typeof FEEDS] ?? FEEDS[43114]

  const { data } = useReadContracts({
    contracts: [
      { address: feeds.AVAX_USD, abi: CL_ABI, functionName: 'latestRoundData' },
      { address: feeds.USDC_USD, abi: CL_ABI, functionName: 'latestRoundData' },
    ],
    query: { refetchInterval: 60_000 },
  })

  const avaxResult = data?.[0]
  const usdcResult = data?.[1]

  const avaxPrice = avaxResult?.status === 'success'
    ? Number(avaxResult.result[1]) / 1e8  // Chainlink 8 decimals
    : null

  const usdcPrice = usdcResult?.status === 'success'
    ? Number(usdcResult.result[1]) / 1e8
    : 1.0 // USDC ≈ $1

  return { avaxPrice, usdcPrice }
}

export function useProtocolStats() {
  return useQuery({
    queryKey: ['protocolStats'],
    queryFn:  async () => {
      const res = await fetch(`${API_URL}/api/v1/stats`)
      if (!res.ok) throw new Error('Failed to fetch stats')
      return res.json() as Promise<{
        tvlUSD:        string
        totalBorrowed: string
        avgApy:        string
        activeUsers:   number
        totalLoans:    number
        healthScore:   string
        updatedAt:     string
      }>
    },
    refetchInterval: 30_000,
    staleTime:       30_000,
  })
}

export function useActivityFeed(limit = 20) {
  return useQuery({
    queryKey: ['activityFeed', limit],
    queryFn:  async () => {
      const res = await fetch(`${API_URL}/api/v1/events?limit=${limit}`)
      if (!res.ok) throw new Error('Failed to fetch events')
      return res.json()
    },
    refetchInterval: 10_000,
    staleTime:       5_000,
  })
}

export function useVaultHistory(vaultAddress: string | undefined, days = 30) {
  return useQuery({
    queryKey: ['vaultHistory', vaultAddress, days],
    queryFn:  async () => {
      const res = await fetch(`${API_URL}/api/v1/vaults/${vaultAddress}/history?days=${days}`)
      if (!res.ok) throw new Error('Failed to fetch vault history')
      return res.json() as Promise<Array<{ timestamp: string; tvl: string; apy: string }>>
    },
    enabled:   !!vaultAddress,
    staleTime: 60_000,
  })
}
