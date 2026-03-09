import type { PublicClient } from 'viem'
import type Redis from 'ioredis'
import type { Logger } from 'pino'
import type { Database } from '../db'
import { CREDIT_ABI } from '../abis'
import { runPollingLoop } from '../utils/blockPoller'
import { handleCreditEvents } from '../handlers/creditHandler'
import { getConfig } from '../config'

export async function startCreditListener(
  client: PublicClient,
  redis: Redis,
  db: Database,
  logger: Logger
): Promise<() => void> {
  const config = getConfig()

  if (!config.CREDIT_ADDRESS) {
    logger.warn('CREDIT_ADDRESS not configured — credit listener disabled')
    return () => {}
  }

  const creditAddress = config.CREDIT_ADDRESS
  const creditLogger = logger.child({ contract: 'ZeroXCredit', address: creditAddress })

  const stop = await runPollingLoop({
    redis,
    client,
    contractAddress: creditAddress,
    startBlock:      config.START_BLOCK,
    confirmationBlocks: config.CONFIRMATION_BLOCKS,
    batchSize:       config.BLOCK_BATCH_SIZE,
    pollIntervalMs:  config.POLL_INTERVAL_MS,
    logger:          creditLogger,
    async processRange(from, to) {
      const logs = await client.getLogs({
        address:   creditAddress as `0x${string}`,
        events:    CREDIT_ABI,
        fromBlock: from,
        toBlock:   to,
      })

      if (logs.length > 0) {
        creditLogger.info({ count: logs.length, from: from.toString(), to: to.toString() }, 'Processing credit events')
        await handleCreditEvents(
          logs as Parameters<typeof handleCreditEvents>[0],
          db,
          creditLogger
        )
      }
    },
  })

  creditLogger.info({ from: config.START_BLOCK }, 'Credit listener started')
  return stop
}
