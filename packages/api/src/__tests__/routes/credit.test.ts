import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildTestApp } from '../helpers.js'
import creditRoutes from '../../routes/credit.js'
import type { FastifyInstance } from 'fastify'

vi.mock('../../services/creditService.js', () => ({
  getCreditPosition: vi.fn(),
  getCreditHistory: vi.fn(),
  getAtRiskPositions: vi.fn(),
}))

import {
  getCreditPosition,
  getCreditHistory,
  getAtRiskPositions,
} from '../../services/creditService.js'

const mockGetCreditPosition = getCreditPosition as ReturnType<typeof vi.fn>
const mockGetCreditHistory = getCreditHistory as ReturnType<typeof vi.fn>
const mockGetAtRiskPositions = getAtRiskPositions as ReturnType<typeof vi.fn>

describe('Credit Routes', () => {
  let app: FastifyInstance
  const validAddress = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12'

  afterEach(async () => {
    await app?.close()
    vi.clearAllMocks()
  })

  describe('GET /api/v1/credit/at-risk', () => {
    it('should return at-risk positions', async () => {
      const positions = [
        {
          userAddress: '0x1111111111111111111111111111111111111111',
          ltvBps: 8500,
          healthStatus: 'AT_RISK',
          principal: '50000.000000',
          lastUpdated: '2025-01-01T00:00:00.000Z',
        },
      ]
      mockGetAtRiskPositions.mockResolvedValue(positions)

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({ method: 'GET', url: '/api/v1/credit/at-risk' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
      expect(res.json()[0].healthStatus).toBe('AT_RISK')
    })

    it('should return empty array when no positions at risk', async () => {
      mockGetAtRiskPositions.mockResolvedValue([])

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({ method: 'GET', url: '/api/v1/credit/at-risk' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('should return 500 on service failure', async () => {
      mockGetAtRiskPositions.mockRejectedValue(new Error('DB error'))

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({ method: 'GET', url: '/api/v1/credit/at-risk' })

      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ error: 'Failed to fetch at-risk positions' })
    })
  })

  describe('GET /api/v1/credit/:userAddress', () => {
    it('should return credit position for valid address', async () => {
      const position = {
        userAddress: validAddress.toLowerCase(),
        collateralShares: '100.000000000000000000',
        collateralToken: 'USDC',
        collateralVault: '0x2222222222222222222222222222222222222222',
        principal: '5000.000000',
        interestAccrued: '50.000000',
        ltvBps: 5000,
        healthStatus: 'HEALTHY',
        isActive: true,
        openedAt: '2025-01-01T00:00:00.000Z',
        closedAt: null,
        lastUpdated: '2025-01-15T00:00:00.000Z',
      }
      mockGetCreditPosition.mockResolvedValue(position)

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/credit/${validAddress}`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().healthStatus).toBe('HEALTHY')
      expect(mockGetCreditPosition).toHaveBeenCalledWith(expect.anything(), validAddress)
    })

    it('should return 404 when no position found', async () => {
      mockGetCreditPosition.mockResolvedValue(null)

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/credit/${validAddress}`,
      })

      expect(res.statusCode).toBe(404)
      expect(res.json()).toEqual({ error: 'No credit position found' })
    })

    it('should return 400 for invalid address', async () => {
      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credit/invalid-address',
      })

      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid user address' })
    })

    it('should return 400 for short address', async () => {
      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credit/0x1234',
      })

      expect(res.statusCode).toBe(400)
    })

    it('should return 500 on service failure', async () => {
      mockGetCreditPosition.mockRejectedValue(new Error('timeout'))

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/credit/${validAddress}`,
      })

      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ error: 'Failed to fetch credit position' })
    })
  })

  describe('GET /api/v1/credit/:userAddress/history', () => {
    it('should return credit history for valid address', async () => {
      const history = [
        {
          txHash: '0xabc123',
          blockNumber: 12345,
          eventType: 'BORROW',
          amount: '1000.000000',
          createdAt: '2025-01-01T00:00:00.000Z',
          metadata: null,
        },
      ]
      mockGetCreditHistory.mockResolvedValue(history)

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/credit/${validAddress}/history`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(1)
      expect(res.json()[0].eventType).toBe('BORROW')
      expect(mockGetCreditHistory).toHaveBeenCalledWith(
        expect.anything(),
        validAddress,
        50 // default limit
      )
    })

    it('should accept and clamp limit query parameter', async () => {
      mockGetCreditHistory.mockResolvedValue([])

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      // Clamp to max 200
      await app.inject({
        method: 'GET',
        url: `/api/v1/credit/${validAddress}/history?limit=500`,
      })
      expect(mockGetCreditHistory).toHaveBeenCalledWith(
        expect.anything(),
        validAddress,
        200
      )

      vi.clearAllMocks()

      // Clamp to min 1
      await app.inject({
        method: 'GET',
        url: `/api/v1/credit/${validAddress}/history?limit=0`,
      })
      expect(mockGetCreditHistory).toHaveBeenCalledWith(
        expect.anything(),
        validAddress,
        1
      )
    })

    it('should return 400 for invalid address', async () => {
      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credit/bad/history',
      })

      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid user address' })
    })

    it('should return 500 on service failure', async () => {
      mockGetCreditHistory.mockRejectedValue(new Error('fail'))

      app = await buildTestApp({
        routes: [{ plugin: creditRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/credit/${validAddress}/history`,
      })

      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ error: 'Failed to fetch credit history' })
    })
  })
})
