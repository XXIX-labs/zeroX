import { describe, it, expect, afterEach, vi } from 'vitest'
import { buildTestApp, createMockDb, createMockRedis } from '../helpers.js'
import vaultRoutes from '../../routes/vaults.js'
import type { FastifyInstance } from 'fastify'

// Mock the service module
vi.mock('../../services/vaultService.js', () => ({
  getAllVaults: vi.fn(),
  getVaultHistory: vi.fn(),
}))

import { getAllVaults, getVaultHistory } from '../../services/vaultService.js'

const mockGetAllVaults = getAllVaults as ReturnType<typeof vi.fn>
const mockGetVaultHistory = getVaultHistory as ReturnType<typeof vi.fn>

describe('Vault Routes', () => {
  let app: FastifyInstance

  afterEach(async () => {
    await app?.close()
    vi.clearAllMocks()
  })

  describe('GET /api/v1/vaults', () => {
    it('should return list of vaults', async () => {
      const vaults = [
        {
          vaultAddress: '0x1111111111111111111111111111111111111111',
          token: 'USDC',
          tvl: '1000000.000000',
          apy: '5.250000',
          sharePrice: '1.050000000000000000',
          aaveApy: '3.100000',
          benqiApy: '4.200000',
          aaveAlloc: 6000,
          benqiAlloc: 4000,
          snapshotAt: '2025-01-01T00:00:00.000Z',
        },
      ]
      mockGetAllVaults.mockResolvedValue(vaults)

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({ method: 'GET', url: '/api/v1/vaults' })

      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect(body).toHaveLength(1)
      expect(body[0].token).toBe('USDC')
      expect(body[0].tvl).toBe('1000000.000000')
      expect(mockGetAllVaults).toHaveBeenCalledOnce()
    })

    it('should return empty array when no vaults exist', async () => {
      mockGetAllVaults.mockResolvedValue([])

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({ method: 'GET', url: '/api/v1/vaults' })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual([])
    })

    it('should return 500 when service throws', async () => {
      mockGetAllVaults.mockRejectedValue(new Error('DB connection failed'))

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({ method: 'GET', url: '/api/v1/vaults' })

      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ error: 'Failed to fetch vaults' })
    })
  })

  describe('GET /api/v1/vaults/:address/history', () => {
    const validAddress = '0x1111111111111111111111111111111111111111'

    it('should return history for valid address', async () => {
      const history = [
        { timestamp: '2025-01-01T00:00:00.000Z', tvl: '500000', apy: '4.5' },
        { timestamp: '2025-01-02T00:00:00.000Z', tvl: '550000', apy: '4.8' },
      ]
      mockGetVaultHistory.mockResolvedValue(history)

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vaults/${validAddress}/history`,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json()).toHaveLength(2)
      expect(mockGetVaultHistory).toHaveBeenCalledWith(
        expect.anything(),
        validAddress,
        30 // default days
      )
    })

    it('should accept days query parameter', async () => {
      mockGetVaultHistory.mockResolvedValue([])

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vaults/${validAddress}/history?days=7`,
      })

      expect(res.statusCode).toBe(200)
      expect(mockGetVaultHistory).toHaveBeenCalledWith(
        expect.anything(),
        validAddress,
        7
      )
    })

    it('should clamp days to max 90', async () => {
      mockGetVaultHistory.mockResolvedValue([])

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      await app.inject({
        method: 'GET',
        url: `/api/v1/vaults/${validAddress}/history?days=365`,
      })

      expect(mockGetVaultHistory).toHaveBeenCalledWith(
        expect.anything(),
        validAddress,
        90
      )
    })

    it('should clamp days to min 1', async () => {
      mockGetVaultHistory.mockResolvedValue([])

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      await app.inject({
        method: 'GET',
        url: `/api/v1/vaults/${validAddress}/history?days=0`,
      })

      expect(mockGetVaultHistory).toHaveBeenCalledWith(
        expect.anything(),
        validAddress,
        1
      )
    })

    it('should return 400 for invalid address format', async () => {
      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults/not-an-address/history',
      })

      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid vault address' })
    })

    it('should return 400 for address without 0x prefix', async () => {
      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/vaults/1111111111111111111111111111111111111111/history',
      })

      expect(res.statusCode).toBe(400)
      expect(res.json()).toEqual({ error: 'Invalid vault address' })
    })

    it('should return 500 when service throws', async () => {
      mockGetVaultHistory.mockRejectedValue(new Error('timeout'))

      app = await buildTestApp({
        routes: [{ plugin: vaultRoutes }],
      })

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/vaults/${validAddress}/history`,
      })

      expect(res.statusCode).toBe(500)
      expect(res.json()).toEqual({ error: 'Failed to fetch vault history' })
    })
  })
})
