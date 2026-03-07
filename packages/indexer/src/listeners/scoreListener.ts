import type { PublicClient } from 'viem'
import type IORedis from 'ioredis'
import type { Logger } from 'pino'
import type { Database } from '../db'
import { SCORE_ABI } from '../abis'
import { runPollingLoop } from '../utils/blockPoller'
import { handleScoreEvents } from '../handlers/scoreHandler'
import { getConfig } from '../config'

export async function startScoreListener(
  client: PublicClient,
  redis: IORedis,
  db: Database,
  logger: Logger
): Promise<() => void> {
  const config = getConfig()

  if (!config.SCORE_ADDRESS) {
    logger.warn('SCORE_ADDRESS not configured — score listener disabled')
    return () => {}
  }

  const scoreAddress = config.SCORE_ADDRESS
  const scoreLogger = logger.child({ contract: 'ZeroXScore', address: scoreAddress })

  const stop = await runPollingLoop({
    redis,
    client,
    contractAddress: scoreAddress,
    startBlock:      config.START_BLOCK,
    confirmationBlocks: config.CONFIRMATION_BLOCKS,
    batchSize:       config.BLOCK_BATCH_SIZE,
    pollIntervalMs:  config.POLL_INTERVAL_MS,
    logger:          scoreLogger,
    async processRange(from, to) {
      const logs = await client.getLogs({
        address:   scoreAddress as `0x${string}`,
        events:    SCORE_ABI,
        fromBlock: from,
        toBlock:   to,
      })

      if (logs.length > 0) {
        scoreLogger.info({ count: logs.length }, 'Processing score events')
        await handleScoreEvents(
          logs as Parameters<typeof handleScoreEvents>[0],
          db,
          scoreLogger
        )
      }
    },
  })

  scoreLogger.info({ from: config.START_BLOCK }, 'Score listener started')
  return stop
}
