import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest'
import { createHash } from 'node:crypto'
import Fastify, { type FastifyInstance } from 'fastify'
import { createApiAuthHook } from '../../middleware/apiAuth.js'
import healthRoutes from '../../routes/health.js'

function hashKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function createMockKeyRow(overrides: Partial<{
  id: number
  keyHash: string
  owner: string
  tier: string
  rateLimit: number
  revokedAt: Date | null
}> = {}) {
  return {
    id: 1,
    keyHash: hashKey('test-api-key-123'),
    owner: '0x1111111111111111111111111111111111111111',
    tier: 'builder',
    rateLimit: 10_000,
    revokedAt: null,
    ...overrides,
  }
}

describe('API Auth Middleware', () => {
  let app: FastifyInstance
  let mockDb: any
  let mockRedis: any

  beforeEach(() => {
    const store: Record<string, string> = {}
    mockRedis = {
      get: vi.fn(async (key: string) => store[key] ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store[key] = value
        return 'OK'
      }),
      incr: vi.fn(async (key: string) => {
        const val = parseInt(store[key] ?? '0', 10) + 1
        store[key] = String(val)
        return val
      }),
      expire: vi.fn(async () => 1),
      _store: store,
    }

    mockDb = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    }
  })

  afterEach(async () => {
    await app?.close()
  })

  async function buildApp() {
    app = Fastify({ logger: false })
    app.decorate('db', mockDb)
    app.decorate('redis', mockRedis)
    app.addHook('preHandler', createApiAuthHook(mockDb, mockRedis))

    // Register a public route (health)
    await app.register(healthRoutes, { prefix: '/api/v1' })

    // Register a protected route
    app.get('/api/v1/vaults', async () => ({ data: 'vaults' }))

    await app.ready()
    return app
  }

  describe('Public routes (skip auth)', () => {
    it('should skip auth for /api/v1/health', async () => {
      await buildApp()

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      })

      expect(res.statusCode).toBe(200)
      // DB should NOT have been queried
      expect(mockDb.select).not.toHaveBeenCalled()
    })
  })

  describe('Missing API key', () => {
    it('should return 401 when X-API-Key header is missing', async () => {
      await buildApp()

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toEqual({ error: 'Missing X-API-Key header' })
    })
  })

  describe('Invalid API key', () => {
    it('should return 401 for unknown API key', async () => {
      // DB returns no rows
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })

      await buildApp()

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'nonexistent-key' },
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toEqual({ error: 'Invalid or revoked API key' })
    })

    it('should return 401 for revoked API key', async () => {
      const row = createMockKeyRow({ revokedAt: new Date('2025-01-01') })
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([row]),
          })),
        })),
      })

      await buildApp()

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'test-api-key-123' },
      })

      expect(res.statusCode).toBe(401)
      expect(res.json()).toEqual({ error: 'Invalid or revoked API key' })
    })
  })

  describe('Valid API key', () => {
    it('should allow request with valid API key from DB', async () => {
      const row = createMockKeyRow()
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([row]),
          })),
        })),
      })

      await buildApp()

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'test-api-key-123' },
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ data: 'vaults' })
    })

    it('should use cached key from Redis on second call', async () => {
      const row = createMockKeyRow()

      // First call: DB returns the key
      mockDb.select.mockReturnValue({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([row]),
          })),
        })),
      })

      await buildApp()

      // First request — loads from DB and caches in Redis
      await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'test-api-key-123' },
      })

      expect(mockRedis.set).toHaveBeenCalled()

      // Reset DB mock to verify it's not called again
      mockDb.select.mockClear()

      // Second request — should use Redis cache
      const res2 = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'test-api-key-123' },
      })

      expect(res2.statusCode).toBe(200)
      // DB should not be queried again (cache hit)
      expect(mockDb.select).not.toHaveBeenCalled()
    })
  })

  describe('Rate limiting', () => {
    it('should return 429 when daily rate limit is exceeded', async () => {
      const row = createMockKeyRow({ tier: 'free', rateLimit: 100 })

      // Pre-populate Redis cache with the API key
      const keyHash = hashKey('test-api-key-123')
      mockRedis._store[`apikey:${keyHash}`] = JSON.stringify(row)

      // Set usage counter to 100 (at limit for free tier)
      const today = new Date().toISOString().slice(0, 10)
      mockRedis._store[`usage:${row.id}:${today}`] = '100'

      await buildApp()

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'test-api-key-123' },
      })

      // incr pushes it to 101, which exceeds the limit of 100
      expect(res.statusCode).toBe(429)
      const body = res.json()
      expect(body.error).toBe('Daily rate limit exceeded')
      expect(body.tier).toBe('free')
      expect(body.limit).toBe(100)
    })

    it('should allow request within rate limit', async () => {
      const row = createMockKeyRow({ tier: 'builder' })

      const keyHash = hashKey('test-api-key-123')
      mockRedis._store[`apikey:${keyHash}`] = JSON.stringify(row)

      await buildApp()

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'test-api-key-123' },
      })

      expect(res.statusCode).toBe(200)
    })

    it('should set TTL on first usage increment', async () => {
      const row = createMockKeyRow()

      const keyHash = hashKey('test-api-key-123')
      mockRedis._store[`apikey:${keyHash}`] = JSON.stringify(row)

      await buildApp()

      await app.inject({
        method: 'GET',
        url: '/api/v1/vaults',
        headers: { 'x-api-key': 'test-api-key-123' },
      })

      // First request, incr returns 1, so expire should be called
      expect(mockRedis.expire).toHaveBeenCalledWith(
        expect.stringContaining('usage:'),
        90_000
      )
    })
  })
})
