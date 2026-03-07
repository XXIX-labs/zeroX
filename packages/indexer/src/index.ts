import { createPublicClient, http, fallback } from 'viem'
import { avalanche, avalancheFuji } from 'viem/chains'
import IORedis from 'ioredis'
import pino from 'pino'
import { getConfig } from './config'
import { getDb, closeDb } from './db'
import { startVaultListener } from './listeners/vaultListener'
import { startCreditListener } from './listeners/creditListener'
import { startScoreListener } from './listeners/scoreListener'

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
    : undefined,
})

async function main() {
  const config = getConfig()

  logger.info({ chainId: config.CHAIN_ID, env: config.NODE_ENV }, 'ZeroX Indexer starting')

  // ── Clients ──────────────────────────────────────────────────────────────────
  const chain = config.CHAIN_ID === 43113 ? avalancheFuji : avalanche

  const client = createPublicClient({
    chain,
    transport: fallback([
      http(config.AVALANCHE_RPC_HTTP),
      // HTTP fallback if WS fails
      http('https://avalanche-c-chain-rpc.publicnode.com'),
    ]),
    batch: { multicall: true },
  })

  const redis = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })
  await redis.connect()
  logger.info('Redis connected')

  const db = getDb()
  logger.info('Database connected')

  // ── Start Listeners ──────────────────────────────────────────────────────────
  const vaultStopFns = await startVaultListener(client, redis, db, logger)
  const creditStop   = await startCreditListener(client, redis, db, logger)
  const scoreStop    = await startScoreListener(client, redis, db, logger)

  logger.info('All listeners started — indexing Avalanche C-Chain')

  // ── Graceful Shutdown ─────────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received')

    for (const stop of vaultStopFns) stop()
    creditStop()
    scoreStop()

    await redis.quit()
    await closeDb()

    logger.info('Indexer shut down cleanly')
    process.exit(0)
  }

  process.on('SIGINT',  () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.error(err, 'Fatal error — exiting')
  process.exit(1)
})
