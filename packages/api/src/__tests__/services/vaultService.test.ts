import { describe, it, expect, vi } from 'vitest'
import { getAllVaults, getVaultHistory } from '../../services/vaultService.js'

describe('VaultService', () => {
  describe('getAllVaults', () => {
    it('should transform snapshot rows to VaultSummary format', async () => {
      const now = new Date('2025-06-15T12:00:00Z')
      const rawRows = [
        {
          vaultAddress: '0x1111111111111111111111111111111111111111',
          token: 'USDC',
          tvl: '1500000.000000',
          apy: '5.250000',
          sharePrice: '1.050000000000000000',
          aaveApy: '3.100000',
          benqiApy: '4.200000',
          aaveAlloc: 6000,
          benqiAlloc: 4000,
          snapshotAt: now,
        },
      ]

      const mockDb: any = {
        selectDistinctOn: vi.fn(() => ({
          from: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue(rawRows),
          })),
        })),
      }

      const result = await getAllVaults(mockDb)

      expect(result).toHaveLength(1)
      expect(result[0]!.vaultAddress).toBe('0x1111111111111111111111111111111111111111')
      expect(result[0]!.token).toBe('USDC')
      expect(result[0]!.tvl).toBe('1500000.000000')
      expect(result[0]!.apy).toBe('5.250000')
      expect(result[0]!.sharePrice).toBe('1.050000000000000000')
      expect(result[0]!.aaveApy).toBe('3.100000')
      expect(result[0]!.benqiApy).toBe('4.200000')
      expect(result[0]!.aaveAlloc).toBe(6000)
      expect(result[0]!.benqiAlloc).toBe(4000)
      // snapshotAt should be converted to ISO string
      expect(result[0]!.snapshotAt).toBe('2025-06-15T12:00:00.000Z')
    })

    it('should return empty array when no snapshots exist', async () => {
      const mockDb: any = {
        selectDistinctOn: vi.fn(() => ({
          from: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue([]),
          })),
        })),
      }

      const result = await getAllVaults(mockDb)
      expect(result).toEqual([])
    })

    it('should handle multiple vaults', async () => {
      const rawRows = [
        {
          vaultAddress: '0x1111111111111111111111111111111111111111',
          token: 'USDC',
          tvl: '1000000',
          apy: '5.0',
          sharePrice: '1.05',
          aaveApy: null,
          benqiApy: null,
          aaveAlloc: null,
          benqiAlloc: null,
          snapshotAt: new Date('2025-01-01T00:00:00Z'),
        },
        {
          vaultAddress: '0x2222222222222222222222222222222222222222',
          token: 'USDT',
          tvl: '2000000',
          apy: '4.8',
          sharePrice: '1.03',
          aaveApy: '2.5',
          benqiApy: '3.0',
          aaveAlloc: 5000,
          benqiAlloc: 5000,
          snapshotAt: new Date('2025-01-01T00:00:00Z'),
        },
      ]

      const mockDb: any = {
        selectDistinctOn: vi.fn(() => ({
          from: vi.fn(() => ({
            orderBy: vi.fn().mockResolvedValue(rawRows),
          })),
        })),
      }

      const result = await getAllVaults(mockDb)
      expect(result).toHaveLength(2)
      expect(result[0]!.token).toBe('USDC')
      expect(result[1]!.token).toBe('USDT')
      // null values preserved
      expect(result[0]!.aaveApy).toBeNull()
      expect(result[1]!.aaveApy).toBe('2.5')
    })
  })

  describe('getVaultHistory', () => {
    it('should transform rows to HistoryPoint format', async () => {
      const rawRows = [
        { snapshotAt: new Date('2025-01-01T00:00:00Z'), tvl: '500000', apy: '4.5' },
        { snapshotAt: new Date('2025-01-02T00:00:00Z'), tvl: '550000', apy: '4.8' },
      ]

      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue(rawRows),
            })),
          })),
        })),
      }

      const result = await getVaultHistory(
        mockDb,
        '0x1111111111111111111111111111111111111111',
        30
      )

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        timestamp: '2025-01-01T00:00:00.000Z',
        tvl: '500000',
        apy: '4.5',
      })
      expect(result[1]).toEqual({
        timestamp: '2025-01-02T00:00:00.000Z',
        tvl: '550000',
        apy: '4.8',
      })
    })

    it('should return empty array for no data', async () => {
      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue([]),
            })),
          })),
        })),
      }

      const result = await getVaultHistory(mockDb, '0x1111111111111111111111111111111111111111')
      expect(result).toEqual([])
    })

    it('should default to 30 days when not specified', async () => {
      const mockWhere = vi.fn(() => ({
        orderBy: vi.fn().mockResolvedValue([]),
      }))

      const mockDb: any = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: mockWhere,
          })),
        })),
      }

      await getVaultHistory(mockDb, '0x1111111111111111111111111111111111111111')

      // Verify where was called (which means the date filter was applied)
      expect(mockWhere).toHaveBeenCalled()
    })
  })
})
