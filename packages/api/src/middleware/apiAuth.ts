import { createHash } from 'node:crypto'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type IORedis from 'ioredis'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { eq } from 'drizzle-orm'
import { apiKeys } from '../db/schema'

/** Tier rate limits (requests per day) */
const TIER_LIMITS: Record<string, number> = {
  free:       100,
  builder:    10_000,
  growth:     100_000,
  scale:      1_000_000,
  enterprise: 10_000_000,
}

/** Routes that skip API key auth */
const PUBLIC_PATHS = ['/api/v1/health', '/api/v1/stats']

interface ApiKeyRow {
  id: number
  keyHash: string
  owner: string
  tier: string
  rateLimit: number
  revokedAt: Date | null
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Fastify preHandler hook for API key authentication and usage metering.
 *
 * Usage: app.addHook('preHandler', createApiAuthHook(app.db, app.redis))
 */
export function createApiAuthHook(
  db: NodePgDatabase<Record<string, never>>,
  redis: IORedis
) {
  return async function apiAuthHook(req: FastifyRequest, reply: FastifyReply) {
    // Skip auth for public routes
    if (PUBLIC_PATHS.some((p) => req.url.startsWith(p))) return

    const rawKey = req.headers['x-api-key']
    if (!rawKey || typeof rawKey !== 'string') {
      reply.status(401).send({ error: 'Missing X-API-Key header' })
      return
    }

    const keyHash = hashKey(rawKey)

    // Check Redis cache first (60s TTL)
    const cacheKey = `apikey:${keyHash}`
    let row: ApiKeyRow | null = null

    const cached = await redis.get(cacheKey)
    if (cached) {
      row = JSON.parse(cached) as ApiKeyRow
    } else {
      const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1)
      if (rows.length > 0) {
        row = rows[0] as ApiKeyRow
        await redis.set(cacheKey, JSON.stringify(row), 'EX', 60)
      }
    }

    if (!row || row.revokedAt) {
      reply.status(401).send({ error: 'Invalid or revoked API key' })
      return
    }

    // Check daily rate limit via Redis counter
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const usageKey = `usage:${row.id}:${today}`
    const currentUsage = await redis.incr(usageKey)

    // Set TTL on first increment (expire after 25h to handle timezone edge)
    if (currentUsage === 1) {
      await redis.expire(usageKey, 90_000)
    }

    const limit = TIER_LIMITS[row.tier] ?? row.rateLimit
    if (currentUsage > limit) {
      reply.status(429).send({
        error: 'Daily rate limit exceeded',
        tier: row.tier,
        limit,
        reset: `${today}T23:59:59Z`,
      })
      return
    }

    // Attach key info to request for downstream use
    ;(req as FastifyRequest & { apiKey: ApiKeyRow }).apiKey = row
  }
}
