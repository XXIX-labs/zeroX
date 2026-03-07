import { AlertTriangle, ShieldCheck, Shield } from 'lucide-react'
import { getHealthFromLTV, getLTVBarColor, getLTVBarFillPercent } from '../../lib/healthUtils'
import { formatBps } from '../../lib/formatters'
import { clsx } from 'clsx'

interface HealthFactorBarProps {
  ltvBps: number          // LTV in basis points (0-15000+)
  maxBorrowBps?: number   // Max allowed LTV in bps (default 5000 = 50%)
  liqThresholdBps?: number // Liquidation threshold (default 10500 = 105% collateral ratio)
  showLabels?: boolean
  compact?: boolean
}

export function HealthFactorBar({
  ltvBps,
  maxBorrowBps = 5000,
  liqThresholdBps = 9524, // 10500 collateral ratio = ~9524 LTV bps (1/1.05)
  showLabels = true,
  compact = false,
}: HealthFactorBarProps) {
  const health = getHealthFromLTV(ltvBps)
  const fillPercent = getLTVBarFillPercent(ltvBps)
  const barColor = getLTVBarColor(ltvBps)

  const Icon = ltvBps >= 8333 ? AlertTriangle : ltvBps >= 4000 ? Shield : ShieldCheck

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Icon
              size={13}
              className={health.textClass}
            />
            <span className={clsx('font-semibold', health.textClass)}>
              {health.label}
            </span>
          </div>
          <span className="text-text-dim font-mono">
            LTV: {formatBps(ltvBps)}
          </span>
        </div>
      )}

      {/* Bar track */}
      <div className="relative h-2.5 rounded-full bg-border overflow-hidden">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${fillPercent}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 8px ${barColor}66`,
          }}
        />

        {/* Threshold markers */}
        {showLabels && (
          <>
            {/* Max borrow threshold */}
            <div
              className="absolute top-0 bottom-0 w-px bg-text-dim"
              style={{
                left: `${(maxBorrowBps / 15000) * 100}%`,
              }}
            />
            {/* Liquidation threshold */}
            <div
              className="absolute top-0 bottom-0 w-px bg-status-danger/60"
              style={{
                left: `${(liqThresholdBps / 15000) * 100}%`,
              }}
            />
          </>
        )}
      </div>

      {showLabels && !compact && (
        <div className="flex justify-between text-[10px] text-text-dim font-medium">
          <span>0%</span>
          <span className="text-text-muted">50% max borrow</span>
          <span className="text-status-danger/70">~95% liq.</span>
        </div>
      )}
    </div>
  )
}
