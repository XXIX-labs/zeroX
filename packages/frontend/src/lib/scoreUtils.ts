// ─── Score Tier Logic ──────────────────────────────────────────────────────────

export type ScoreTier = 'EXCELLENT' | 'VERY_GOOD' | 'GOOD' | 'FAIR' | 'POOR'

export interface TierConfig {
  tier: ScoreTier
  label: string
  color: string          // Tailwind text color
  bg: string             // Tailwind bg color
  border: string         // Tailwind border color
  glow: string           // CSS box-shadow
  hex: string            // Hex color for SVG/canvas
  range: [number, number]
}

export const TIER_CONFIG: Record<ScoreTier, TierConfig> = {
  EXCELLENT: {
    tier: 'EXCELLENT',
    label: 'Excellent',
    color: 'text-score-excellent',
    bg: 'bg-score-excellent/10',
    border: 'border-score-excellent/30',
    glow: '0 0 20px rgba(16, 185, 129, 0.3)',
    hex: '#10B981',
    range: [750, 850],
  },
  VERY_GOOD: {
    tier: 'VERY_GOOD',
    label: 'Very Good',
    color: 'text-score-very-good',
    bg: 'bg-score-very-good/10',
    border: 'border-score-very-good/30',
    glow: '0 0 20px rgba(134, 239, 172, 0.3)',
    hex: '#86EFAC',
    range: [700, 749],
  },
  GOOD: {
    tier: 'GOOD',
    label: 'Good',
    color: 'text-score-good',
    bg: 'bg-score-good/10',
    border: 'border-score-good/30',
    glow: '0 0 20px rgba(250, 204, 21, 0.3)',
    hex: '#FACC15',
    range: [650, 699],
  },
  FAIR: {
    tier: 'FAIR',
    label: 'Fair',
    color: 'text-score-fair',
    bg: 'bg-score-fair/10',
    border: 'border-score-fair/30',
    glow: '0 0 20px rgba(245, 158, 11, 0.3)',
    hex: '#F59E0B',
    range: [580, 649],
  },
  POOR: {
    tier: 'POOR',
    label: 'Poor',
    color: 'text-score-poor',
    bg: 'bg-score-poor/10',
    border: 'border-score-poor/30',
    glow: '0 0 20px rgba(239, 68, 68, 0.3)',
    hex: '#EF4444',
    range: [300, 579],
  },
}

export function getTierForScore(score: number): TierConfig {
  if (score >= 750) return TIER_CONFIG.EXCELLENT
  if (score >= 700) return TIER_CONFIG.VERY_GOOD
  if (score >= 650) return TIER_CONFIG.GOOD
  if (score >= 580) return TIER_CONFIG.FAIR
  return TIER_CONFIG.POOR
}

// ─── Gauge Math ────────────────────────────────────────────────────────────────

export const GAUGE_MIN_SCORE = 300
export const GAUGE_MAX_SCORE = 850
export const GAUGE_SWEEP_DEG = 260  // Total arc sweep in degrees
export const GAUGE_START_DEG = 140  // Start angle (bottom-left)

/**
 * Convert a credit score to the rotation angle for the gauge needle
 * @param score Credit score (300-850)
 * @returns Rotation angle in degrees (for CSS transform)
 */
export function scoreToAngle(score: number): number {
  const clampedScore = Math.max(GAUGE_MIN_SCORE, Math.min(GAUGE_MAX_SCORE, score))
  const ratio = (clampedScore - GAUGE_MIN_SCORE) / (GAUGE_MAX_SCORE - GAUGE_MIN_SCORE)
  return GAUGE_START_DEG + ratio * GAUGE_SWEEP_DEG - 180 // center at 0
}

/**
 * Convert a score to a percentage position along the gauge arc (0-1)
 */
export function scoreToArcPosition(score: number): number {
  const clampedScore = Math.max(GAUGE_MIN_SCORE, Math.min(GAUGE_MAX_SCORE, score))
  return (clampedScore - GAUGE_MIN_SCORE) / (GAUGE_MAX_SCORE - GAUGE_MIN_SCORE)
}

// ─── Score Segments (for the SVG arc coloring) ────────────────────────────────

export const GAUGE_SEGMENTS = [
  { from: 300, to: 580, color: '#EF4444' },  // Poor
  { from: 580, to: 650, color: '#F59E0B' },  // Fair
  { from: 650, to: 700, color: '#FACC15' },  // Good
  { from: 700, to: 750, color: '#86EFAC' },  // Very Good
  { from: 750, to: 850, color: '#10B981' },  // Excellent
]
