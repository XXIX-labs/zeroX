import { describe, it, expect } from 'vitest'
import {
  getTierForScore,
  scoreToAngle,
  scoreToArcPosition,
  TIER_CONFIG,
  GAUGE_MIN_SCORE,
  GAUGE_MAX_SCORE,
  GAUGE_SWEEP_DEG,
  GAUGE_START_DEG,
  GAUGE_SEGMENTS,
} from '@/lib/scoreUtils'

// ─── getTierForScore ──────────────────────────────────────────────────────────

describe('getTierForScore', () => {
  it('returns POOR for score 300', () => {
    expect(getTierForScore(300)).toBe(TIER_CONFIG.POOR)
  })

  it('returns POOR for score 579', () => {
    expect(getTierForScore(579)).toBe(TIER_CONFIG.POOR)
  })

  it('returns FAIR for score 580', () => {
    expect(getTierForScore(580)).toBe(TIER_CONFIG.FAIR)
  })

  it('returns FAIR for score 649', () => {
    expect(getTierForScore(649)).toBe(TIER_CONFIG.FAIR)
  })

  it('returns GOOD for score 650', () => {
    expect(getTierForScore(650)).toBe(TIER_CONFIG.GOOD)
  })

  it('returns GOOD for score 699', () => {
    expect(getTierForScore(699)).toBe(TIER_CONFIG.GOOD)
  })

  it('returns VERY_GOOD for score 700', () => {
    expect(getTierForScore(700)).toBe(TIER_CONFIG.VERY_GOOD)
  })

  it('returns VERY_GOOD for score 749', () => {
    expect(getTierForScore(749)).toBe(TIER_CONFIG.VERY_GOOD)
  })

  it('returns EXCELLENT for score 750', () => {
    expect(getTierForScore(750)).toBe(TIER_CONFIG.EXCELLENT)
  })

  it('returns EXCELLENT for score 850', () => {
    expect(getTierForScore(850)).toBe(TIER_CONFIG.EXCELLENT)
  })

  it('returns correct labels', () => {
    expect(getTierForScore(300).label).toBe('Poor')
    expect(getTierForScore(600).label).toBe('Fair')
    expect(getTierForScore(660).label).toBe('Good')
    expect(getTierForScore(720).label).toBe('Very Good')
    expect(getTierForScore(800).label).toBe('Excellent')
  })

  it('returns correct hex colors', () => {
    expect(getTierForScore(300).hex).toBe('#EF4444')
    expect(getTierForScore(600).hex).toBe('#F59E0B')
    expect(getTierForScore(660).hex).toBe('#FACC15')
    expect(getTierForScore(720).hex).toBe('#86EFAC')
    expect(getTierForScore(800).hex).toBe('#10B981')
  })

  it('returns POOR for below-minimum scores', () => {
    expect(getTierForScore(100)).toBe(TIER_CONFIG.POOR)
    expect(getTierForScore(0)).toBe(TIER_CONFIG.POOR)
  })

  it('returns EXCELLENT for above-maximum scores', () => {
    expect(getTierForScore(900)).toBe(TIER_CONFIG.EXCELLENT)
  })
})

// ─── scoreToAngle ─────────────────────────────────────────────────────────────

describe('scoreToAngle', () => {
  it('returns start angle for minimum score', () => {
    const angle = scoreToAngle(GAUGE_MIN_SCORE)
    // ratio = 0, so angle = GAUGE_START_DEG + 0 - 180 = 140 - 180 = -40
    expect(angle).toBe(GAUGE_START_DEG - 180)
  })

  it('returns end angle for maximum score', () => {
    const angle = scoreToAngle(GAUGE_MAX_SCORE)
    // ratio = 1, so angle = 140 + 260 - 180 = 220
    expect(angle).toBe(GAUGE_START_DEG + GAUGE_SWEEP_DEG - 180)
  })

  it('returns midpoint angle for midpoint score', () => {
    const midScore = (GAUGE_MIN_SCORE + GAUGE_MAX_SCORE) / 2 // 575
    const angle = scoreToAngle(midScore)
    const expectedAngle = GAUGE_START_DEG + 0.5 * GAUGE_SWEEP_DEG - 180
    expect(angle).toBe(expectedAngle)
  })

  it('clamps score below minimum', () => {
    expect(scoreToAngle(100)).toBe(scoreToAngle(GAUGE_MIN_SCORE))
  })

  it('clamps score above maximum', () => {
    expect(scoreToAngle(1000)).toBe(scoreToAngle(GAUGE_MAX_SCORE))
  })

  it('returns increasing angles for increasing scores', () => {
    const angle400 = scoreToAngle(400)
    const angle600 = scoreToAngle(600)
    const angle800 = scoreToAngle(800)
    expect(angle400).toBeLessThan(angle600)
    expect(angle600).toBeLessThan(angle800)
  })
})

// ─── scoreToArcPosition ──────────────────────────────────────────────────────

describe('scoreToArcPosition', () => {
  it('returns 0 for minimum score', () => {
    expect(scoreToArcPosition(GAUGE_MIN_SCORE)).toBe(0)
  })

  it('returns 1 for maximum score', () => {
    expect(scoreToArcPosition(GAUGE_MAX_SCORE)).toBe(1)
  })

  it('returns 0.5 for midpoint score', () => {
    const midScore = (GAUGE_MIN_SCORE + GAUGE_MAX_SCORE) / 2
    expect(scoreToArcPosition(midScore)).toBeCloseTo(0.5)
  })

  it('clamps below minimum to 0', () => {
    expect(scoreToArcPosition(0)).toBe(0)
  })

  it('clamps above maximum to 1', () => {
    expect(scoreToArcPosition(1000)).toBe(1)
  })

  it('calculates correct position for score 600', () => {
    // (600 - 300) / (850 - 300) = 300 / 550 = 0.5454...
    expect(scoreToArcPosition(600)).toBeCloseTo(0.5455, 3)
  })
})

// ─── GAUGE_SEGMENTS ───────────────────────────────────────────────────────────

describe('GAUGE_SEGMENTS', () => {
  it('has 5 segments', () => {
    expect(GAUGE_SEGMENTS).toHaveLength(5)
  })

  it('covers the full score range 300-850', () => {
    expect(GAUGE_SEGMENTS[0].from).toBe(300)
    expect(GAUGE_SEGMENTS[GAUGE_SEGMENTS.length - 1].to).toBe(850)
  })

  it('has contiguous segments (no gaps)', () => {
    for (let i = 1; i < GAUGE_SEGMENTS.length; i++) {
      expect(GAUGE_SEGMENTS[i].from).toBe(GAUGE_SEGMENTS[i - 1].to)
    }
  })

  it('all segments have positive range', () => {
    for (const segment of GAUGE_SEGMENTS) {
      expect(segment.to).toBeGreaterThan(segment.from)
    }
  })
})

// ─── TIER_CONFIG ──────────────────────────────────────────────────────────────

describe('TIER_CONFIG', () => {
  it('has all 5 tiers', () => {
    expect(Object.keys(TIER_CONFIG)).toHaveLength(5)
    expect(TIER_CONFIG).toHaveProperty('EXCELLENT')
    expect(TIER_CONFIG).toHaveProperty('VERY_GOOD')
    expect(TIER_CONFIG).toHaveProperty('GOOD')
    expect(TIER_CONFIG).toHaveProperty('FAIR')
    expect(TIER_CONFIG).toHaveProperty('POOR')
  })

  it('each tier has all required fields', () => {
    for (const tier of Object.values(TIER_CONFIG)) {
      expect(tier).toHaveProperty('tier')
      expect(tier).toHaveProperty('label')
      expect(tier).toHaveProperty('color')
      expect(tier).toHaveProperty('bg')
      expect(tier).toHaveProperty('border')
      expect(tier).toHaveProperty('glow')
      expect(tier).toHaveProperty('hex')
      expect(tier).toHaveProperty('range')
      expect(tier.range).toHaveLength(2)
      expect(tier.range[1]).toBeGreaterThan(tier.range[0])
    }
  })
})
