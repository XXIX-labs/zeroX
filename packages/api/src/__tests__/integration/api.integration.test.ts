/**
 * API Integration Tests
 * Tests API endpoints against a running API server with real PostgreSQL + Redis
 */
import { describe, it, expect, beforeAll } from 'vitest'

const API_BASE = process.env['API_BASE_URL'] || 'http://localhost:3001'
// Use the real server secret — setup.ts overrides ADMIN_SECRET for unit tests,
// but integration tests run against the live server which uses .env values
const ADMIN_SECRET = 'zerox_admin_fuji_testnet_2024'

describe('API Integration', () => {
  // ─── Health ────────────────────────────────────────────────────────
  describe('GET /api/v1/health', () => {
    it('returns status ok with version and uptime', async () => {
      const res = await fetch(`${API_BASE}/api/v1/health`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe('ok')
      expect(body.version).toBeDefined()
      expect(typeof body.uptime).toBe('number')
    })
  })

  // ─── API Key Auth ──────────────────────────────────────────────────
  describe('API Key Authentication', () => {
    it('rejects requests without X-API-Key on protected routes', async () => {
      const res = await fetch(`${API_BASE}/api/v1/vaults`)
      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error).toContain('API-Key')
    })

    it('allows health endpoint without API key', async () => {
      const res = await fetch(`${API_BASE}/api/v1/health`)
      expect(res.status).toBe(200)
    })
  })

  // ─── Admin Routes ─────────────────────────────────────────────────
  describe('Admin API Key Management', () => {
    let createdApiKey: string | undefined

    it('rejects admin requests without X-Admin-Secret', async () => {
      const res = await fetch(`${API_BASE}/api/v1/admin/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'test-user', tier: 'free' }),
      })
      expect([401, 403]).toContain(res.status)
    })

    it('creates an API key with valid admin secret', async () => {
      const res = await fetch(`${API_BASE}/api/v1/admin/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ owner: 'integration-test', tier: 'free' }),
      })
      expect(res.status).toBe(201)
      const body = await res.json()
      // Admin route returns `key` field
      expect(body.key || body.apiKey).toBeDefined()
      createdApiKey = body.key || body.apiKey
    })

    it('can use created API key to access protected routes', async () => {
      expect(createdApiKey).toBeDefined()
      const res = await fetch(`${API_BASE}/api/v1/vaults`, {
        headers: { 'X-API-Key': createdApiKey! },
      })
      expect(res.status).toBe(200)
    })

    it('lists API keys', async () => {
      const res = await fetch(`${API_BASE}/api/v1/admin/api-keys`, {
        headers: { 'X-Admin-Secret': ADMIN_SECRET },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      // Response is an array directly
      const keys = Array.isArray(body) ? body : body.keys
      expect(Array.isArray(keys)).toBe(true)
      expect(keys.length).toBeGreaterThan(0)
    })
  })

  // ─── Vault Routes ─────────────────────────────────────────────────
  describe('Vault Routes (with API key)', () => {
    let apiKey: string

    beforeAll(async () => {
      const res = await fetch(`${API_BASE}/api/v1/admin/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ owner: 'vault-test', tier: 'builder' }),
      })
      const body = await res.json()
      apiKey = body.key || body.apiKey
    })

    it('GET /api/v1/vaults returns array', async () => {
      const res = await fetch(`${API_BASE}/api/v1/vaults`, {
        headers: { 'X-API-Key': apiKey },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body.vaults || body)).toBe(true)
    })
  })

  // ─── Score Routes ──────────────────────────────────────────────────
  describe('Score Routes', () => {
    let apiKey: string

    beforeAll(async () => {
      const res = await fetch(`${API_BASE}/api/v1/admin/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ owner: 'score-test', tier: 'builder' }),
      })
      const body = await res.json()
      apiKey = body.key || body.apiKey
    })

    it('GET /api/v1/leaderboard returns entries', async () => {
      const res = await fetch(`${API_BASE}/api/v1/leaderboard`, {
        headers: { 'X-API-Key': apiKey },
      })
      expect(res.status).toBe(200)
      const body = await res.json()
      // Response is { entries: [], total, page, totalPages }
      expect(Array.isArray(body.entries)).toBe(true)
      expect(typeof body.total).toBe('number')
    })
  })
})
