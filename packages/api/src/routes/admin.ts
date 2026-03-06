import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { apiKeys } from '../db/schema'
import type { FastifyInstance } from 'fastify'

const VALID_TIERS = ['free', 'builder', 'growth', 'scale', 'enterprise'] as const

const TIER_LIMITS: Record<string, number> = {
  free: 100,
  builder: 10_000,
  growth: 100_000,
  scale: 1_000_000,
  enterprise: 10_000_000,
}

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export default async function adminRoutes(app: FastifyInstance) {
  // Create a new API key
  app.post<{
    Body: { owner: string; tier?: string }
  }>('/admin/api-keys', async (req, reply) => {
    const adminSecret = req.headers['x-admin-secret']
    if (adminSecret !== process.env['ADMIN_SECRET']) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const { owner, tier = 'free' } = req.body
    if (!owner) return reply.status(400).send({ error: 'owner is required' })
    if (!VALID_TIERS.includes(tier as typeof VALID_TIERS[number])) {
      return reply.status(400).send({ error: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` })
    }

    const rawKey = `zx_${randomBytes(24).toString('hex')}`
    const keyHash = hashKey(rawKey)
    const rateLimit = TIER_LIMITS[tier] ?? 100

    const [inserted] = await app.db
      .insert(apiKeys)
      .values({ keyHash, owner, tier, rateLimit })
      .returning({ id: apiKeys.id, createdAt: apiKeys.createdAt })

    return reply.status(201).send({
      id: inserted.id,
      key: rawKey, // Only shown once
      owner,
      tier,
      rateLimit,
      createdAt: inserted.createdAt,
    })
  })

  // Revoke an API key
  app.delete<{
    Params: { id: string }
  }>('/admin/api-keys/:id', async (req, reply) => {
    const adminSecret = req.headers['x-admin-secret']
    if (adminSecret !== process.env['ADMIN_SECRET']) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const id = parseInt(req.params.id, 10)
    if (isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })

    await app.db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(eq(apiKeys.id, id))

    // Invalidate cache
    const rows = await app.db.select({ keyHash: apiKeys.keyHash }).from(apiKeys).where(eq(apiKeys.id, id))
    if (rows[0]) {
      await app.redis.del(`apikey:${rows[0].keyHash}`)
    }

    return reply.send({ ok: true })
  })

  // List API keys (no raw keys shown)
  app.get('/admin/api-keys', async (req, reply) => {
    const adminSecret = req.headers['x-admin-secret']
    if (adminSecret !== process.env['ADMIN_SECRET']) {
      return reply.status(403).send({ error: 'Forbidden' })
    }

    const rows = await app.db
      .select({
        id: apiKeys.id,
        owner: apiKeys.owner,
        tier: apiKeys.tier,
        rateLimit: apiKeys.rateLimit,
        createdAt: apiKeys.createdAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)

    return reply.send(rows)
  })
}
