import Fastify from 'fastify'
import { getConfig } from './config'

// Plugins
import dbPlugin from './plugins/db'
import redisPlugin from './plugins/redis'
import corsPlugin from './plugins/cors'
import rateLimitPlugin from './plugins/rateLimit'

// Routes
import healthRoutes from './routes/health'
import statsRoutes from './routes/stats'
import vaultRoutes from './routes/vaults'
import creditRoutes from './routes/credit'
import scoreRoutes from './routes/score'
import leaderboardRoutes from './routes/leaderboard'
import eventsRoutes from './routes/events'
import adminRoutes from './routes/admin'
import { createApiAuthHook } from './middleware/apiAuth'

// Jobs
import { createVaultSyncQueue, scheduleVaultSync, createVaultSyncWorker } from './jobs/syncVaultApys'
import { createScoreSyncQueue, scheduleScoreSync, createScoreSyncWorker } from './jobs/syncScores'

async function main() {
  const config = getConfig()

  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: config.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
        : undefined,
    },
    trustProxy: true,
  })

  // ── Plugins ─────────────────────────────────────────────────────────────────
  await app.register(corsPlugin)
  await app.register(rateLimitPlugin)
  await app.register(dbPlugin)
  await app.register(redisPlugin)

  // ── API Key Auth (SDK Metering) ────────────────────────────────────────────
  app.addHook('preHandler', createApiAuthHook(app.db, app.redis))

  // ── Routes ──────────────────────────────────────────────────────────────────
  await app.register(healthRoutes,     { prefix: '/api/v1' })
  await app.register(statsRoutes,      { prefix: '/api/v1' })
  await app.register(vaultRoutes,      { prefix: '/api/v1' })
  await app.register(creditRoutes,     { prefix: '/api/v1' })
  await app.register(scoreRoutes,      { prefix: '/api/v1' })
  await app.register(leaderboardRoutes,{ prefix: '/api/v1' })
  await app.register(eventsRoutes,     { prefix: '/api/v1' })
  await app.register(adminRoutes,      { prefix: '/api/v1' })

  // ── Global 404 ──────────────────────────────────────────────────────────────
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'Not found' })
  })

  // ── Background Jobs ──────────────────────────────────────────────────────────
  if (config.ENABLE_JOBS) {
    const vaultQueue = createVaultSyncQueue(app.redis)
    const scoreQueue = createScoreSyncQueue(app.redis)

    const vaultWorker = createVaultSyncWorker(app.redis, app.db)
    const scoreWorker = createScoreSyncWorker(app.redis, app.db)

    await scheduleVaultSync(vaultQueue, config.SNAPSHOT_INTERVAL_MS)
    await scheduleScoreSync(scoreQueue, config.SNAPSHOT_INTERVAL_MS)

    app.addHook('onClose', async () => {
      await vaultWorker.close()
      if (scoreWorker) await scoreWorker.close()
      await vaultQueue.close()
      await scoreQueue.close()
    })

    app.log.info('Background jobs started')
  }

  // ── Start ────────────────────────────────────────────────────────────────────
  await app.listen({ port: config.PORT, host: config.HOST })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
