import type { PublicClient, Address } from 'viem'
import { VAULT_ABI, SCORE_ABI, CREDIT_ABI } from '../abis'
import type { ZeroXClientConfig } from '../types'

export interface UserSnapshot {
  vaultUSDC: {
    shares:   bigint
    assets:   bigint
  } | null
  vaultUSDT: {
    shares:   bigint
    assets:   bigint
  } | null
  score: {
    score: number
    tier:  string
  } | null
  credit: {
    isOpen:       boolean
    debtTotal:    bigint
    healthFactor: bigint
  } | null
}

/**
 * Fetches all relevant user data in a single multicall batch.
 * Falls back gracefully if contracts are not configured.
 */
export async function getUserSnapshot(
  publicClient: PublicClient,
  config: ZeroXClientConfig,
  user: Address
): Promise<UserSnapshot> {
  const calls: Array<{ address: Address; abi: typeof VAULT_ABI | typeof SCORE_ABI | typeof CREDIT_ABI; functionName: string; args: unknown[] }> = []
  const callIndexes: Record<string, number> = {}

  if (config.addresses.vaultUSDC) {
    callIndexes['usdcShares'] = calls.length
    calls.push({ address: config.addresses.vaultUSDC, abi: VAULT_ABI, functionName: 'balanceOf', args: [user] })
    callIndexes['usdcAssets'] = calls.length
    calls.push({ address: config.addresses.vaultUSDC, abi: VAULT_ABI, functionName: 'convertToAssets', args: [0n] })
  }

  if (config.addresses.vaultUSDT) {
    callIndexes['usdtShares'] = calls.length
    calls.push({ address: config.addresses.vaultUSDT, abi: VAULT_ABI, functionName: 'balanceOf', args: [user] })
    callIndexes['usdtAssets'] = calls.length
    calls.push({ address: config.addresses.vaultUSDT, abi: VAULT_ABI, functionName: 'convertToAssets', args: [0n] })
  }

  if (config.addresses.score) {
    callIndexes['score'] = calls.length
    calls.push({ address: config.addresses.score, abi: SCORE_ABI, functionName: 'getScore', args: [user] })
  }

  if (config.addresses.credit) {
    callIndexes['creditLine'] = calls.length
    calls.push({ address: config.addresses.credit, abi: CREDIT_ABI, functionName: 'getCreditLine', args: [user] })
    callIndexes['debtPrincipal'] = calls.length
    calls.push({ address: config.addresses.credit, abi: CREDIT_ABI, functionName: 'getCurrentDebt', args: [user] })
    callIndexes['healthFactor'] = calls.length
    calls.push({ address: config.addresses.credit, abi: CREDIT_ABI, functionName: 'getHealthFactor', args: [user] })
  }

  if (calls.length === 0) {
    return { vaultUSDC: null, vaultUSDT: null, score: null, credit: null }
  }

  const results = await publicClient.multicall({ contracts: calls as Parameters<typeof publicClient.multicall>[0]['contracts'], allowFailure: true })

  const get = (key: string) => {
    const idx = callIndexes[key]
    if (idx === undefined) return undefined
    const r = results[idx]
    return r?.status === 'success' ? r.result : undefined
  }

  const usdcShares = get('usdcShares') as bigint | undefined
  const usdtShares = get('usdtShares') as bigint | undefined

  const creditLine = get('creditLine') as { isOpen: boolean } | undefined
  const debtResult = get('debtPrincipal') as { principal: bigint; interest: bigint } | undefined
  const healthFactor = get('healthFactor') as bigint | undefined

  const score = get('score') as number | undefined

  return {
    vaultUSDC: config.addresses.vaultUSDC ? {
      shares: usdcShares ?? 0n,
      assets: usdcShares && usdcShares > 0n
        ? await publicClient.readContract({
            address: config.addresses.vaultUSDC, abi: VAULT_ABI, functionName: 'convertToAssets', args: [usdcShares],
          })
        : 0n,
    } : null,
    vaultUSDT: config.addresses.vaultUSDT ? {
      shares: usdtShares ?? 0n,
      assets: usdtShares && usdtShares > 0n
        ? await publicClient.readContract({
            address: config.addresses.vaultUSDT, abi: VAULT_ABI, functionName: 'convertToAssets', args: [usdtShares],
          })
        : 0n,
    } : null,
    score: config.addresses.score && score !== undefined ? {
      score,
      tier: score >= 750 ? 'EXCELLENT' : score >= 700 ? 'VERY_GOOD' : score >= 650 ? 'GOOD' : score >= 580 ? 'FAIR' : 'POOR',
    } : null,
    credit: config.addresses.credit && creditLine ? {
      isOpen:       creditLine.isOpen,
      debtTotal:    (debtResult?.principal ?? 0n) + (debtResult?.interest ?? 0n),
      healthFactor: healthFactor ?? 0n,
    } : null,
  }
}
