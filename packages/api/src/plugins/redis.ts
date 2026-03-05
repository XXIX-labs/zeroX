import fp from 'fastify-plugin'
import IORedis from 'ioredis'
import { getConfig } from '../config'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    redis: IORedis
  }
}

export default fp(async function redisPlugin(app: FastifyInstance) {
  const config = getConfig()
  const redis = new IORedis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    lazyConnect: true,
  })

  await redis.connect()

  app.decorate('redis', redis)

  app.addHook('onClose', async () => {
    await redis.quit()
  })

  app.log.info('Redis connected')
}, { name: 'redis' })
