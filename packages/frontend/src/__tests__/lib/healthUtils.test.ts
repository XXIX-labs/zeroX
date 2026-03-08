import { describe, it, expect } from 'vitest'
import {
  getHealthFromLTV,
  getLTVBarColor,
  getLTVBarFillPercent,
  HEALTH_CONFIG,
} from '@/lib/healthUtils'

// ─── getHealthFromLTV ─────────────────────────────────────────────────────────

describe('getHealthFromLTV', () => {
  it('returns HEALTHY for 0 LTV', () => {
    expect(getHealthFromLTV(0)).toBe(HEALTH_CONFIG.HEALTHY)
  })

  it('returns HEALTHY for low LTV (20%)', () => {
    expect(getHealthFromLTV(2000)).toBe(HEALTH_CONFIG.HEALTHY)
  })

  it('returns HEALTHY for LTV just below 40% (3999 bps)', () => {
    expect(getHealthFromLTV(3999)).toBe(HEALTH_CONFIG.HEALTHY)
  })

  it('returns WARNING at exactly 40% LTV (4000 bps)', () => {
    expect(getHealthFromLTV(4000)).toBe(HEALTH_CONFIG.WARNING)
  })

  it('returns WARNING for 50% LTV', () => {
    expect(getHealthFromLTV(5000)).toBe(HEALTH_CONFIG.WARNING)
  })

  it('returns WARNING for LTV just below 83.33%', () => {
    expect(getHealthFromLTV(8332)).toBe(HEALTH_CONFIG.WARNING)
  })

  it('returns AT_RISK at 83.33% LTV (8333 bps)', () => {
    expect(getHealthFromLTV(8333)).toBe(HEALTH_CONFIG.AT_RISK)
  })

  it('returns AT_RISK at 100% LTV', () => {
    expect(getHealthFromLTV(10000)).toBe(HEALTH_CONFIG.AT_RISK)
  })

  it('returns AT_RISK just below 105%', () => {
    expect(getHealthFromLTV(10499)).toBe(HEALTH_CONFIG.AT_RISK)
  })

  it('returns LIQUIDATABLE at 105% LTV (10500 bps)', () => {
    expect(getHealthFromLTV(10500)).toBe(HEALTH_CONFIG.LIQUIDATABLE)
  })

  it('returns LIQUIDATABLE for extreme LTV (200%)', () => {
    expect(getHealthFromLTV(20000)).toBe(HEALTH_CONFIG.LIQUIDATABLE)
  })

  it('returns correct labels for each status', () => {
    expect(getHealthFromLTV(0).label).toBe('Healthy')
    expect(getHealthFromLTV(5000).label).toBe('Warning')
    expect(getHealthFromLTV(9000).label).toBe('At Risk')
    expect(getHealthFromLTV(11000).label).toBe('Liquidatable')
  })

  it('returns correct status strings', () => {
    expect(getHealthFromLTV(0).status).toBe('HEALTHY')
    expect(getHealthFromLTV(5000).status).toBe('WARNING')
    expect(getHealthFromLTV(9000).status).toBe('AT_RISK')
    expect(getHealthFromLTV(11000).status).toBe('LIQUIDATABLE')
  })
})

// ─── getLTVBarColor ───────────────────────────────────────────────────────────

describe('getLTVBarColor', () => {
  it('returns green for low LTV', () => {
    expect(getLTVBarColor(0)).toBe('#10B981')
    expect(getLTVBarColor(2000)).toBe('#10B981')
    expect(getLTVBarColor(3999)).toBe('#10B981')
  })

  it('returns yellow for moderate LTV (40-80%)', () => {
    expect(getLTVBarColor(4000)).toBe('#FACC15')
    expect(getLTVBarColor(6000)).toBe('#FACC15')
    expect(getLTVBarColor(7999)).toBe('#FACC15')
  })

  it('returns amber/warning for high LTV (80-100%)', () => {
    expect(getLTVBarColor(8000)).toBe('#F59E0B')
    expect(getLTVBarColor(9000)).toBe('#F59E0B')
    expect(getLTVBarColor(9999)).toBe('#F59E0B')
  })

  it('returns red for 100%+ LTV', () => {
    expect(getLTVBarColor(10000)).toBe('#EF4444')
    expect(getLTVBarColor(15000)).toBe('#EF4444')
  })
})

// ─── getLTVBarFillPercent ─────────────────────────────────────────────────────

describe('getLTVBarFillPercent', () => {
  it('returns 0 for 0 LTV', () => {
    expect(getLTVBarFillPercent(0)).toBe(0)
  })

  it('calculates correct percentage for 50% LTV', () => {
    // 5000 / 15000 * 100 = 33.33...
    expect(getLTVBarFillPercent(5000)).toBeCloseTo(33.33, 1)
  })

  it('calculates correct percentage for 100% LTV', () => {
    // 10000 / 15000 * 100 = 66.67
    expect(getLTVBarFillPercent(10000)).toBeCloseTo(66.67, 1)
  })

  it('returns 100 at 150% LTV', () => {
    expect(getLTVBarFillPercent(15000)).toBe(100)
  })

  it('caps at 100 for LTV above 150%', () => {
    expect(getLTVBarFillPercent(20000)).toBe(100)
    expect(getLTVBarFillPercent(50000)).toBe(100)
  })

  it('handles small LTV values', () => {
    // 100 / 15000 * 100 = 0.667
    expect(getLTVBarFillPercent(100)).toBeCloseTo(0.667, 1)
  })
})
