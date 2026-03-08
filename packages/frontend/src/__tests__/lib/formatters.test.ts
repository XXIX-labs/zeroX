import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatUSD,
  formatTokenAmount,
  formatPercent,
  formatBps,
  truncateAddress,
  formatNumber,
  formatTimeAgo,
} from '@/lib/formatters'

// ─── formatUSD ────────────────────────────────────────────────────────────────

describe('formatUSD', () => {
  it('formats a standard number as USD', () => {
    expect(formatUSD(1234.56)).toBe('$1,234.56')
  })

  it('formats zero', () => {
    expect(formatUSD(0)).toBe('$0.00')
  })

  it('formats large number without compact flag', () => {
    expect(formatUSD(1_500_000)).toBe('$1,500,000.00')
  })

  it('formats bigint values', () => {
    expect(formatUSD(BigInt(5000))).toBe('$5,000.00')
  })

  it('compact mode shows M for millions', () => {
    expect(formatUSD(2_500_000, { compact: true })).toBe('$2.5M')
  })

  it('compact mode shows K for thousands', () => {
    expect(formatUSD(45_000, { compact: true })).toBe('$45.0K')
  })

  it('compact mode falls through for small numbers', () => {
    expect(formatUSD(999, { compact: true })).toBe('$999.00')
  })

  it('respects custom decimals', () => {
    expect(formatUSD(100.1234, { decimals: 4 })).toBe('$100.1234')
  })

  it('respects decimals: 0', () => {
    expect(formatUSD(100.99, { decimals: 0 })).toBe('$101')
  })

  it('handles negative numbers', () => {
    const result = formatUSD(-500)
    expect(result).toContain('500')
  })
})

// ─── formatTokenAmount ────────────────────────────────────────────────────────

describe('formatTokenAmount', () => {
  it('formats USDC amount (6 decimals)', () => {
    // 1,000,000 = 1.0 USDC
    const result = formatTokenAmount(BigInt(1_000_000), 6, 2)
    expect(result).toBe('1.00')
  })

  it('formats ETH amount (18 decimals)', () => {
    const oneEth = BigInt('1000000000000000000')
    const result = formatTokenAmount(oneEth, 18, 4)
    expect(result).toBe('1.0000')
  })

  it('formats large token amounts with commas', () => {
    const amount = BigInt(1_500_000) * BigInt(1_000_000) // 1.5M USDC
    const result = formatTokenAmount(amount, 6, 2)
    expect(result).toBe('1,500,000.00')
  })

  it('formats zero', () => {
    expect(formatTokenAmount(BigInt(0), 6, 2)).toBe('0.00')
  })

  it('uses default displayDecimals of 2', () => {
    const result = formatTokenAmount(BigInt(1_000_000), 6)
    expect(result).toBe('1.00')
  })
})

// ─── formatPercent ────────────────────────────────────────────────────────────

describe('formatPercent', () => {
  it('formats basic percentage', () => {
    expect(formatPercent(12.34)).toBe('12.34%')
  })

  it('formats with custom decimals', () => {
    expect(formatPercent(12.3456, { decimals: 1 })).toBe('12.3%')
  })

  it('formats zero percent', () => {
    expect(formatPercent(0)).toBe('0.00%')
  })

  it('adds + sign for positive values when signed', () => {
    expect(formatPercent(5.5, { signed: true })).toBe('+5.50%')
  })

  it('does not add + sign for zero even when signed', () => {
    expect(formatPercent(0, { signed: true })).toBe('0.00%')
  })

  it('does not add + sign for negative values when signed', () => {
    expect(formatPercent(-3.2, { signed: true })).toBe('-3.20%')
  })

  it('formats negative values without signed option', () => {
    expect(formatPercent(-10)).toBe('-10.00%')
  })
})

// ─── formatBps ────────────────────────────────────────────────────────────────

describe('formatBps', () => {
  it('formats 100 bps as 1.00%', () => {
    expect(formatBps(100)).toBe('1.00%')
  })

  it('formats 500 bps as 5.00%', () => {
    expect(formatBps(500)).toBe('5.00%')
  })

  it('formats 50 bps as 0.50%', () => {
    expect(formatBps(50)).toBe('0.50%')
  })

  it('formats 0 bps as 0.00%', () => {
    expect(formatBps(0)).toBe('0.00%')
  })

  it('handles bigint input', () => {
    expect(formatBps(BigInt(250))).toBe('2.50%')
  })

  it('handles large bps values', () => {
    expect(formatBps(10000)).toBe('100.00%')
  })
})

// ─── truncateAddress ──────────────────────────────────────────────────────────

describe('truncateAddress', () => {
  const addr = '0x1234567890abcdef1234567890abcdef12345678'

  it('truncates with default 4 chars', () => {
    expect(truncateAddress(addr)).toBe('0x1234...5678')
  })

  it('truncates with custom char count', () => {
    expect(truncateAddress(addr, 6)).toBe('0x123456...345678')
  })

  it('returns empty string as-is', () => {
    expect(truncateAddress('')).toBe('')
  })

  it('returns short string unchanged', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
  })
})

// ─── formatNumber ─────────────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('formats basic number with no decimals', () => {
    expect(formatNumber(1234)).toBe('1,234')
  })

  it('formats with custom decimals', () => {
    expect(formatNumber(1234.567, { decimals: 2 })).toBe('1,234.57')
  })

  it('compact mode shows M for millions', () => {
    expect(formatNumber(2_500_000, { compact: true })).toBe('2.5M')
  })

  it('compact mode shows K for thousands', () => {
    expect(formatNumber(45_000, { compact: true })).toBe('45.0K')
  })

  it('compact mode falls through for small numbers', () => {
    expect(formatNumber(500, { compact: true })).toBe('500')
  })

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

// ─── formatTimeAgo ────────────────────────────────────────────────────────────

describe('formatTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for < 60 seconds', () => {
    const thirtySecsAgo = Date.now() - 30_000
    expect(formatTimeAgo(thirtySecsAgo)).toBe('just now')
  })

  it('returns minutes ago', () => {
    const fiveMinsAgo = Date.now() - 5 * 60_000
    expect(formatTimeAgo(fiveMinsAgo)).toBe('5m ago')
  })

  it('returns hours ago', () => {
    const threeHoursAgo = Date.now() - 3 * 3_600_000
    expect(formatTimeAgo(threeHoursAgo)).toBe('3h ago')
  })

  it('returns days ago', () => {
    const twoDaysAgo = Date.now() - 2 * 86_400_000
    expect(formatTimeAgo(twoDaysAgo)).toBe('2d ago')
  })

  it('accepts Date objects', () => {
    const oneHourAgo = new Date(Date.now() - 3_600_000)
    expect(formatTimeAgo(oneHourAgo)).toBe('1h ago')
  })

  it('edge case: exactly 60 seconds returns 1m ago', () => {
    const exactlyOneMin = Date.now() - 60_000
    expect(formatTimeAgo(exactlyOneMin)).toBe('1m ago')
  })
})
