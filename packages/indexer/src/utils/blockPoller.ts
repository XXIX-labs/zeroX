import type Redis from 'ioredis'
import type { PublicClient } from 'viem'
import type { Logger } from 'pino'

const CURSOR_KEY_PREFIX = 'indexer:cursor:'

export async function getLastProcessedBlock(
  redis: Redis,
  contractAddress: string,
  defaultBlock: number
): Promise<number> {
  const key = CURSOR_KEY_PREFIX + contractAddress.toLowerCase()
  const val = await redis.get(key)
  return val ? parseInt(val, 10) : defaultBlock
}

export async function saveLastProcessedBlock(
  redis: Redis,
  contractAddress: string,
  blockNumber: number
): Promise<void> {
  const key = CURSOR_KEY_PREFIX + contractAddress.toLowerCase()
  await redis.set(key, blockNumber.toString())
}

export interface BlockRange {
  fromBlock: bigint
  toBlock:   bigint
}

/**
 * Splits a potentially large block range into batches to avoid RPC limits.
 */
export function* splitBlockRange(
  from: bigint,
  to: bigint,
  batchSize: bigint
): Generator<BlockRange> {
  let current = from
  while (current <= to) {
    const end = current + batchSize - 1n < to ? current + batchSize - 1n : to
    yield { fromBlock: current, toBlock: end }
    current = end + 1n
  }
}

/**
 * Polls for the latest safe block number (currentBlock - confirmationBlocks).
 * Returns the safe head to process up to.
 */
export async function getSafeHead(
  client: PublicClient,
  confirmationBlocks: number
): Promise<bigint> {
  const latest = await client.getBlockNumber()
  const safeHead = latest - BigInt(confirmationBlocks)
  return safeHead < 0n ? 0n : safeHead
}

/**
 * Runs a continuous polling loop that calls `processRange` for each new batch.
 */
export async function runPollingLoop(opts: {
  redis:              Redis
  client:             PublicClient
  contractAddress:    string
  startBlock:         number
  confirmationBlocks: number
  batchSize:          number
  pollIntervalMs:     number
  logger:             Logger
  processRange:       (from: bigint, to: bigint) => Promise<void>
}): Promise<() => void> {
  const {
    redis, client, contractAddress, startBlock,
    confirmationBlocks, batchSize, pollIntervalMs,
    logger, processRange,
  } = opts

  let running = true

  const loop = async () => {
    while (running) {
      try {
        const lastBlock = await getLastProcessedBlock(redis, contractAddress, startBlock)
        const safeHead  = await getSafeHead(client, confirmationBlocks)

        if (BigInt(lastBlock) >= safeHead) {
          await sleep(pollIntervalMs)
          continue
        }

        const from = BigInt(lastBlock + 1)
        const to   = safeHead

        logger.debug({ contractAddress, from: from.toString(), to: to.toString() }, 'Processing block range')

        for (const range of splitBlockRange(from, to, BigInt(batchSize))) {
          if (!running) break
          await processRange(range.fromBlock, range.toBlock)
        }

        await saveLastProcessedBlock(redis, contractAddress, Number(to))
      } catch (err) {
        logger.error({ err, contractAddress }, 'Polling loop error — retrying in 10s')
        await sleep(10_000)
      }
    }
  }

  // Start the loop without blocking
  void loop()

  return () => { running = false }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
