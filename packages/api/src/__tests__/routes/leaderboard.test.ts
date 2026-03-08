import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildTestApp } from '../helpers.js'
import leaderboardRoutes from '../../routes/leaderboard.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../services/scoreService.js', () => ({
  getLeaderboard: vi.fn(),
  getLatestScore: vi.fn(),
  getScoreHistory: vi.fn(),
}))

import { getLeaderboard } from '../../services/scoreService.js'

const mockGetLeaderboard = getLeaderboard as ReturnType<typeof vi.fn>

describe('Leaderboard Routes', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app?.close()
    vi.clearAllMocks()
  })

  describe('GET /api/v1/leaderboard', () => {
    const leaderboardResult = {
      entries: [
        {
          rank: 1,
          userAddress: '0x1111111111111111111111111111111111111111',
          score: 820,
          riskTier: 'EXCELLENT',
          computedAt: '2025-01-15T00:00:00.000Z',
        },
        {
          rank: 2,
          userAddress: '0x2222222222222222222222222222222222222222',
          score: 750,
          riskTier: 'VERY_GOOD',
          computedAt: '2025-01-15T00:00:00.000Z',
        },
      ],
      total: 100,
      page: 1,
      totalPages: 5,
    }

    it('should return paginated leaderboard', async () => {
      mockGetLeaderboard.mockResolvedValue(leaderboardResult)

      app = await buildTestApp({
        routes: [{ plugin: leaderboardRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard',
      })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body.entries).toHaveLength(2)
      expect(body.total).toBe(100)
      expect(body.page).toBe(1)
      expect(body.totalPages).toBe(5)
      expect(mockGetLeaderboard).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        1,  // default page
        20  // default limit
      )
    })

    it('should accept page and limit query parameters', async () => {
      mockGetLeaderboard.mockResolvedValue({
        entries: [],
        total: 100,
        page: 3,
        totalPages: 10,
      })

      app = await buildTestApp({
        routes: [{ plugin: leaderboardRoutes }],
      })

      await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard?page=3&limit=10',
      })

      expect(mockGetLeaderboard).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        3,
        10
      )
    })

    it('should clamp limit to max 100', async () => {
      mockGetLeaderboard.mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        totalPages: 0,
      })

      app = await buildTestApp({
        routes: [{ plugin: leaderboardRoutes }],
      })

      await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard?limit=500',
      })

      expect(mockGetLeaderboard).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        1,
        100
      )
    })

    it('should clamp page to min 1', async () => {
      mockGetLeaderboard.mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        totalPages: 0,
      })

      app = await buildTestApp({
        routes: [{ plugin: leaderboardRoutes }],
      })

      await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard?page=0',
      })

      expect(mockGetLeaderboard).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        1,
        20
      )
    })

    it('should clamp limit to min 1', async () => {
      mockGetLeaderboard.mockResolvedValue({
        entries: [],
        total: 0,
        page: 1,
        totalPages: 0,
      })

      app = await buildTestApp({
        routes: [{ plugin: leaderboardRoutes }],
      })

      await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard?limit=-5',
      })

      expect(mockGetLeaderboard).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        1,
        1
      )
    })

    it('should return 500 on service failure', async () => {
      mockGetLeaderboard.mockRejectedValue(new Error('Redis down'))

      app = await buildTestApp({
        routes: [{ plugin: leaderboardRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/leaderboard',
      })

      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ error: 'Failed to fetch leaderboard' })
    })
  })
})
