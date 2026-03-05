import { Queue, Worker, type Job } from 'bullmq'
import type IORedis from 'ioredis'
import type { Database } from '../plugins/db'
import { vaultSnapshots } from '../db/schema'
import { getConfig } from '../config'
import { createPublicClient, http, parseAbi, formatUnits } from 'viem'
import { avalanche, avalancheFuji } from 'viem/chains'

const JOB_NAME = 'sync-vault-apys'
const QUEUE_NAME = 'vault-sync'

// Minimal ABI for reading vault state
const VAULT_ABI = parseAbi([
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function getAaveAPY() view returns (uint256)',
  'function getBenqiAPY() view returns (uint256)',
  'function aaveAllocation() view returns (uint256)',
  'function benqiAllocation() view returns (uint256)',
  'function asset() view returns (address)',
])

export function createVaultSyncQueue(redis: IORedis) {
  const queue = new Queue(QUEUE_NAME, { connection: redis })
  return queue
}

export async function scheduleVaultSync(queue: Queue, intervalMs: number) {
  await queue.upsertJobScheduler('vault-sync-scheduler', {
    every: intervalMs,
  }, {
    name: JOB_NAME,
    data: {},
  })
}

export function createVaultSyncWorker(redis: IORedis, db: Database) {
  const config = getConfig()

  const chain = config.CHAIN_ID === 43113 ? avalancheFuji : avalanche
  const client = createPublicClient({
    chain,
    transport: http(config.AVALANCHE_RPC_HTTP),
  })

  const vaultAddresses: string[] = [
    config.VAULT_USDC_ADDRESS,
    config.VAULT_USDT_ADDRESS,
  ].filter(Boolean) as string[]

  const TOKENS: Record<string, string> = {
    [config.VAULT_USDC_ADDRESS?.toLowerCase() ?? '']: 'USDC',
    [config.VAULT_USDT_ADDRESS?.toLowerCase() ?? '']: 'USDT',
  }

  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      if (vaultAddresses.length === 0) {
        return { skipped: true, reason: 'No vault addresses configured' }
      }

      const results = await Promise.allSettled(
        vaultAddresses.map(async (vaultAddress) => {
          const addr = vaultAddress as `0x${string}`

          const [totalAssets, totalSupply, aaveApyRaw, benqiApyRaw, aaveAllocRaw, benqiAllocRaw] =
            await Promise.all([
              client.readContract({ address: addr, abi: VAULT_ABI, functionName: 'totalAssets' }),
              client.readContract({ address: addr, abi: VAULT_ABI, functionName: 'totalSupply' }),
              client.readContract({ address: addr, abi: VAULT_ABI, functionName: 'getAaveAPY' }),
              client.readContract({ address: addr, abi: VAULT_ABI, functionName: 'getBenqiAPY' }),
              client.readContract({ address: addr, abi: VAULT_ABI, functionName: 'aaveAllocation' }),
              client.readContract({ address: addr, abi: VAULT_ABI, functionName: 'benqiAllocation' }),
            ])

          // share price: 1 share = how many assets (6 decimals for USDC/USDT)
          const sharePrice = totalSupply > 0n
            ? (totalAssets * 10n ** 18n) / totalSupply
            : 10n ** 18n

          // Blended APY: (aaveApy * aaveAlloc + benqiApy * benqiAlloc) / 10000
          const totalAlloc = Number(aaveAllocRaw) + Number(benqiAllocRaw)
          const blendedApyBps = totalAlloc > 0
            ? (Number(aaveApyRaw) * Number(aaveAllocRaw) + Number(benqiApyRaw) * Number(benqiAllocRaw)) / totalAlloc
            : 0

          await db.insert(vaultSnapshots).values({
            vaultAddress: vaultAddress.toLowerCase(),
            token:        TOKENS[vaultAddress.toLowerCase()] ?? 'UNKNOWN',
            tvl:          formatUnits(totalAssets, 6),
            apy:          (blendedApyBps / 10000).toFixed(6),
            sharePrice:   formatUnits(sharePrice, 18),
            aaveApy:      (Number(aaveApyRaw) / 10000).toFixed(6),
            benqiApy:     (Number(benqiApyRaw) / 10000).toFixed(6),
            aaveAlloc:    Number(aaveAllocRaw),
            benqiAlloc:   Number(benqiAllocRaw),
          })
        })
      )

      const failures = results.filter(r => r.status === 'rejected')
      if (failures.length > 0) {
        throw new Error(`${failures.length} vault syncs failed`)
      }

      return { synced: vaultAddresses.length }
    },
    { connection: redis, concurrency: 1 }
  )

  worker.on('failed', (job, err) => {
    console.error(`[vault-sync] job ${job?.id} failed:`, err.message)
  })

  return worker
}
