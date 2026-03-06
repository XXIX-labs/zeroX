import { formatUnits } from 'viem'

// ─── USD Formatting ────────────────────────────────────────────────────────────

export function formatUSD(
  value: number | bigint,
  options?: { compact?: boolean; decimals?: number }
): string {
  const num = typeof value === 'bigint' ? Number(value) : value
  const { compact = false, decimals = 2 } = options ?? {}

  if (compact && num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`
  }
  if (compact && num >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num)
}

// ─── Token Amount Formatting ───────────────────────────────────────────────────

export function formatTokenAmount(
  value: bigint,
  decimals: number,
  displayDecimals = 2
): string {
  const formatted = formatUnits(value, decimals)
  const num = parseFloat(formatted)
  return num.toLocaleString('en-US', {
    minimumFractionDigits: displayDecimals,
    maximumFractionDigits: displayDecimals,
  })
}

// ─── Percentage Formatting ─────────────────────────────────────────────────────

export function formatPercent(
  value: number,
  options?: { decimals?: number; signed?: boolean }
): string {
  const { decimals = 2, signed = false } = options ?? {}
  const formatted = value.toFixed(decimals) + '%'
  if (signed && value > 0) return '+' + formatted
  return formatted
}

export function formatBps(bps: number | bigint): string {
  const num = typeof bps === 'bigint' ? Number(bps) : bps
  return formatPercent(num / 100, { decimals: 2 })
}

// ─── Address Formatting ────────────────────────────────────────────────────────

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

// ─── Number Formatting ─────────────────────────────────────────────────────────

export function formatNumber(
  value: number,
  options?: { compact?: boolean; decimals?: number }
): string {
  const { compact = false, decimals = 0 } = options ?? {}

  if (compact && value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`
  }
  if (compact && value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`
  }

  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// ─── Time Formatting ───────────────────────────────────────────────────────────

export function formatTimeAgo(date: Date | number): string {
  const now = Date.now()
  const ms = typeof date === 'number' ? date : date.getTime()
  const diff = now - ms

  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
