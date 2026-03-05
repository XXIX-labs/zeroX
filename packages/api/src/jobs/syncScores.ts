import { Queue, Worker, type Job } from 'bullmq'
import type IORedis from 'ioredis'
import type { Database } from '../plugins/db'
import { userScores } from '../db/schema'
import { getConfig } from '../config'
import { createPublicClient, http, parseAbi } from 'viem'
import { avalanche, avalancheFuji } from 'viem/chains'
import { sql, desc } from 'drizzle-orm'

const JOB_NAME = 'sync-scores'
const QUEUE_NAME = 'score-sync'

const SCORE_ABI = parseAbi([
  'function getScoreData(address user) view returns (tuple(uint16 score, uint40 lastUpdated, uint32 repaymentSignal, uint32 utilizationSignal, uint32 accountAgeSignal, uint32 collateralSignal, uint32 diversificationSignal, uint32 totalRepayments, uint32 onTimeRepayments, uint32 totalVolumeUSD, uint8 liquidationCount, uint40 firstDepositAt))',
  'function getRiskTier(uint16 score) pure returns (string)',
])

const TIER_NAMES: Record<string, string> = {
  'EXCELLENT': 'EXCELLENT',
  'VERY_GOOD': 'VERY_GOOD',
  'GOOD':      'GOOD',
  'FAIR':      'FAIR',
  'POOR':      'POOR',
}

export function createScoreSyncQueue(redis: IORedis) {
  return new Queue(QUEUE_NAME, { connection: redis })
}

export async function scheduleScoreSync(queue: Queue, intervalMs: number) {
  await queue.upsertJobScheduler('score-sync-scheduler', {
    every: intervalMs * 3, // 3x slower than vault sync
  }, {
    name: JOB_NAME,
    data: {},
  })
}

export function createScoreSyncWorker(redis: IORedis, db: Database) {
  const config = getConfig()

  if (!config.SCORE_ADDRESS) {
    console.warn('[score-sync] SCORE_ADDRESS not configured, worker disabled')
    return null
  }

  const chain = config.CHAIN_ID === 43113 ? avalancheFuji : avalanche
  const client = createPublicClient({
    chain,
    transport: http(config.AVALANCHE_RPC_HTTP),
  })

  const scoreAddress = config.SCORE_ADDRESS as `0x${string}`

  const worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      // Get the most recent users from the score table to refresh
      const recentUsers = await db
        .selectDistinctOn([userScores.userAddress], {
          userAddress: userScores.userAddress,
        })
        .from(userScores)
        .orderBy(userScores.userAddress, desc(userScores.computedAt))
        .limit(500) // batch of 500 per run

      if (recentUsers.length === 0) return { synced: 0 }

      const results = await Promise.allSettled(
        recentUsers.map(async ({ userAddress }) => {
          const addr = userAddress as `0x${string}`

          const [scoreData, riskTier] = await Promise.all([
            client.readContract({ address: scoreAddress, abi: SCORE_ABI, functionName: 'getScoreData', args: [addr] }),
            client.readContract({ address: scoreAddress, abi: SCORE_ABI, functionName: 'getRiskTier', args: [0] }),
          ])

          const tier = TIER_NAMES[riskTier] ?? 'POOR'

          await db.insert(userScores).values({
            userAddress: userAddress.toLowerCase(),
            score:       scoreData.score,
            riskTier:    tier,
            repaymentSignal:   scoreData.repaymentSignal,
            utilizationSignal: scoreData.utilizationSignal,
            accountAgeSignal:  scoreData.accountAgeSignal,
            collateralSignal:  scoreData.collateralSignal,
            diversifySignal:   scoreData.diversificationSignal,
            triggerEvent:      'SYNC',
          })
        })
      )

      const failures = results.filter(r => r.status === 'rejected')
      return {
        synced:  recentUsers.length - failures.length,
        failed:  failures.length,
      }
    },
    { connection: redis, concurrency: 1 }
  )

  worker.on('failed', (job, err) => {
    console.error(`[score-sync] job ${job?.id} failed:`, err.message)
  })

  return worker
}
