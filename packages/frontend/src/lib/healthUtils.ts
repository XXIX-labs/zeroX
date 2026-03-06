// ─── Health Factor / LTV Utilities ────────────────────────────────────────────

export type HealthStatus = 'HEALTHY' | 'WARNING' | 'AT_RISK' | 'LIQUIDATABLE'

export interface HealthConfig {
  status: HealthStatus
  label: string
  color: string       // hex
  bgClass: string     // tailwind bg
  textClass: string   // tailwind text
  borderClass: string // tailwind border
  description: string
}

export const HEALTH_CONFIG: Record<HealthStatus, HealthConfig> = {
  HEALTHY: {
    status: 'HEALTHY',
    label: 'Healthy',
    color: '#10B981',
    bgClass: 'bg-status-success',
    textClass: 'text-status-success',
    borderClass: 'border-status-success',
    description: 'Your position is safe',
  },
  WARNING: {
    status: 'WARNING',
    label: 'Warning',
    color: '#F59E0B',
    bgClass: 'bg-status-warning',
    textClass: 'text-status-warning',
    borderClass: 'border-status-warning',
    description: 'Approaching maximum LTV',
  },
  AT_RISK: {
    status: 'AT_RISK',
    label: 'At Risk',
    color: '#EF4444',
    bgClass: 'bg-status-danger',
    textClass: 'text-status-danger',
    borderClass: 'border-status-danger',
    description: 'Add collateral or repay immediately',
  },
  LIQUIDATABLE: {
    status: 'LIQUIDATABLE',
    label: 'Liquidatable',
    color: '#EF4444',
    bgClass: 'bg-status-danger',
    textClass: 'text-status-danger',
    borderClass: 'border-status-danger',
    description: 'Position is being liquidated',
  },
}

/**
 * Get health status from LTV in basis points
 */
export function getHealthFromLTV(ltvBps: number): HealthConfig {
  if (ltvBps >= 10500) return HEALTH_CONFIG.LIQUIDATABLE  // 105%+
  if (ltvBps >= 8333) return HEALTH_CONFIG.AT_RISK         // collateral ratio < 120%
  if (ltvBps >= 4000) return HEALTH_CONFIG.WARNING         // 40-50% LTV
  return HEALTH_CONFIG.HEALTHY
}

/**
 * Get a color interpolation for the health bar gradient
 * ltvBps: 0 (safe) → 10000+ (liquidatable)
 */
export function getLTVBarColor(ltvBps: number): string {
  if (ltvBps >= 10000) return '#EF4444'
  if (ltvBps >= 8000) return '#F59E0B'
  if (ltvBps >= 4000) return '#FACC15'
  return '#10B981'
}

/**
 * Calculate what percentage of the health bar to fill (0-100)
 * Max display: 150% LTV (anything beyond = full bar)
 */
export function getLTVBarFillPercent(ltvBps: number): number {
  const maxDisplay = 15000 // 150% LTV = full bar
  return Math.min(100, (ltvBps / maxDisplay) * 100)
}
