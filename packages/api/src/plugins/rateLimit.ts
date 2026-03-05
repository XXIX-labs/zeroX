import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { getConfig } from '../config'
import type { FastifyInstance } from 'fastify'

export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  const config = getConfig()
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    keyGenerator: (req) => req.headers['x-forwarded-for']?.toString() ?? req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${context.after}.`,
    }),
  })
}, { name: 'rateLimit' })
