import { useState } from 'react'
import { useAccount } from 'wagmi'
import { AlertTriangle, CreditCard, DollarSign, Info, Plus, ArrowDownLeft } from 'lucide-react'
import { GlassCard } from '../components/common/GlassCard'
import { Badge } from '../components/common/Badge'
import { HealthFactorBar } from '../components/credit/HealthFactorBar'
import { ConnectButton } from '../components/wallet/ConnectButton'
import { formatUSD, formatPercent, formatBps } from '../lib/formatters'
import { getHealthFromLTV } from '../lib/healthUtils'

// Mock credit line data — replace with on-chain reads
const MOCK_CREDIT = {
  isOpen: true,
  collateralUSD: 5_000,
  collateralVault: 'zxUSDC',
  creditLimit: 2_500,
  borrowed: 800,
  interest: 12.45,
  ltvBps: 3200,
  apr: 1000, // 10% in bps
  openedAt: new Date('2025-01-15'),
}

const REPAYMENT_HISTORY = [
  { date: '2025-02-15', amount: 300, onTime: true },
  { date: '2025-01-20', amount: 500, onTime: true },
]

function BorrowModal({ creditLimit, borrowed, onClose }: { creditLimit: number; borrowed: number; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const available = creditLimit - borrowed
  const numAmount = parseFloat(amount) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card-elevated animate-slide-up p-6 z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-lg font-bold text-text">Borrow USDC</div>
            <div className="text-2xs text-text-dim">10% APR · Available: <span className="font-mono tabular-nums">{formatUSD(available)}</span></div>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-text text-2xl leading-none">×</button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input-field text-xl font-bold font-mono pr-24"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={() => setAmount(available.toString())}
                className="text-xs text-accent hover:text-accent/80 font-semibold"
              >
                MAX
              </button>
              <span className="text-sm font-semibold text-text-muted">USDC</span>
            </div>
          </div>

          {numAmount > 0 && (
            <div className="p-4 rounded-xl bg-surface border border-border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">New total debt</span>
                <span className="font-semibold font-mono tabular-nums text-text">{formatUSD(borrowed + numAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">New LTV</span>
                <span className="font-semibold font-mono tabular-nums text-text">
                  {formatPercent((borrowed + numAmount) / 5000 * 100)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Daily interest</span>
                <span className="font-semibold font-mono tabular-nums text-status-warning">
                  {formatUSD(numAmount * 0.10 / 365, { decimals: 4 })}
                </span>
              </div>
            </div>
          )}

          {numAmount > available && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-status-danger/10 border border-status-danger/20 text-sm text-status-danger">
              <AlertTriangle size={14} />
              Amount exceeds available credit
            </div>
          )}
        </div>

        <button
          disabled={numAmount <= 0 || numAmount > available}
          className="w-full btn-primary py-3"
          onClick={onClose}
        >
          Borrow {numAmount > 0 ? formatUSD(numAmount) : 'USDC'}
        </button>
      </div>
    </div>
  )
}

function RepayModal({ borrowed, interest, onClose }: { borrowed: number; interest: number; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const totalOwed = borrowed + interest
  const numAmount = parseFloat(amount) || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card-elevated animate-slide-up p-6 z-10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="text-lg font-bold text-text">Repay USDC</div>
            <div className="text-2xs text-text-dim">Total owed: <span className="font-mono tabular-nums">{formatUSD(totalOwed)}</span></div>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-text text-2xl leading-none">×</button>
        </div>

        <div className="space-y-4 mb-6">
          <div className="p-4 rounded-xl bg-surface border border-border space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">Principal</span>
              <span className="font-semibold font-mono tabular-nums text-text">{formatUSD(borrowed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Accrued interest</span>
              <span className="font-semibold font-mono tabular-nums text-status-warning">{formatUSD(interest)}</span>
            </div>
            <div className="divider my-2" />
            <div className="flex justify-between">
              <span className="text-text font-semibold">Total owed</span>
              <span className="font-bold font-mono tabular-nums text-text">{formatUSD(totalOwed)}</span>
            </div>
          </div>

          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input-field text-xl font-bold font-mono pr-32"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button onClick={() => setAmount(totalOwed.toString())} className="text-xs text-accent font-semibold">FULL</button>
              <span className="text-sm font-semibold text-text-muted">USDC</span>
            </div>
          </div>
        </div>

        <button
          disabled={numAmount <= 0}
          className="w-full btn-primary py-3"
          onClick={onClose}
        >
          Repay {numAmount > 0 ? formatUSD(numAmount) : 'USDC'}
        </button>
      </div>
    </div>
  )
}

export function Credit() {
  const { isConnected } = useAccount()
  const [showBorrow, setShowBorrow] = useState(false)
  const [showRepay, setShowRepay] = useState(false)
  const health = getHealthFromLTV(MOCK_CREDIT.ltvBps)

  if (!isConnected) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-text">Credit Lines</h1>
          <p className="text-sm text-text-dim mt-1">Borrow stablecoins against your vault position</p>
        </div>
        <div className="flex flex-col items-center justify-center py-24">
          <CreditCard size={40} className="text-text-dim mb-4" />
          <div className="text-lg font-semibold text-text-muted mb-2">Connect your wallet</div>
          <div className="text-sm text-text-dim mb-6">to view and manage your credit lines</div>
          <ConnectButton />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Credit Lines</h1>
        <p className="text-sm text-text-dim mt-1">Borrow stablecoins against your vault position at 50% LTV</p>
      </div>

      {/* Credit Line Card */}
      {MOCK_CREDIT.isOpen ? (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main credit card */}
          <GlassCard padding="none" className="lg:col-span-2 overflow-hidden">
            {/* Card header with visual */}
            <div className="relative p-6 overflow-hidden"
                 style={{ background: 'linear-gradient(135deg, #111827 0%, #1A2236 100%)' }}>
              {/* Decorative circles */}
              <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-avax/10" />
              <div className="absolute -bottom-4 -right-4 w-20 h-20 rounded-full bg-accent/10" />

              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <CreditCard size={20} className="text-accent" />
                    <span className="text-sm font-semibold text-text-muted">ZeroX Credit Line</span>
                  </div>
                  <Badge variant={
                    health.status === 'HEALTHY' ? 'green' :
                    health.status === 'WARNING' ? 'yellow' : 'red'
                  } dot>
                    {health.label}
                  </Badge>
                </div>

                {/* Credit limit display */}
                <div className="mb-4">
                  <div className="text-2xs text-text-dim mb-1">Available Credit</div>
                  <div className="text-4xl font-black font-mono tabular-nums text-text">
                    {formatUSD(MOCK_CREDIT.creditLimit - MOCK_CREDIT.borrowed)}
                  </div>
                  <div className="text-sm text-text-dim mt-1">
                    of <span className="font-mono tabular-nums">{formatUSD(MOCK_CREDIT.creditLimit)}</span> total limit
                  </div>
                </div>

                {/* Utilization bar */}
                <div>
                  <div className="flex justify-between text-2xs text-text-dim mb-1.5">
                    <span>Credit utilization</span>
                    <span className="font-mono tabular-nums">{formatPercent((MOCK_CREDIT.borrowed / MOCK_CREDIT.creditLimit) * 100)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${(MOCK_CREDIT.borrowed / MOCK_CREDIT.creditLimit) * 100}%`,
                        boxShadow: '0 0 8px var(--color-accent, rgba(0,212,255,0.5))',
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-text-dim mb-1">Total Borrowed</div>
                  <div className="font-bold font-mono tabular-nums text-status-danger text-lg">{formatUSD(MOCK_CREDIT.borrowed)}</div>
                </div>
                <div>
                  <div className="text-text-dim mb-1">Interest Accrued</div>
                  <div className="font-bold font-mono tabular-nums text-status-warning text-lg">{formatUSD(MOCK_CREDIT.interest)}</div>
                </div>
                <div>
                  <div className="text-text-dim mb-1">Annual Rate</div>
                  <div className="font-bold font-mono tabular-nums text-text">{formatBps(MOCK_CREDIT.apr)}</div>
                </div>
                <div>
                  <div className="text-text-dim mb-1">Collateral</div>
                  <div className="font-bold text-text">{MOCK_CREDIT.collateralVault}</div>
                </div>
              </div>

              {/* Health factor */}
              <div className="p-4 rounded-xl bg-surface border border-border">
                <div className="text-2xs font-medium text-text-muted mb-3">Collateral Health</div>
                <HealthFactorBar ltvBps={MOCK_CREDIT.ltvBps} />
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowBorrow(true)}
                  className="flex-1 btn-primary py-3"
                >
                  <Plus size={15} />
                  Borrow More
                </button>
                <button
                  onClick={() => setShowRepay(true)}
                  className="flex-1 btn-secondary py-3"
                >
                  <ArrowDownLeft size={15} />
                  Repay
                </button>
              </div>
            </div>
          </GlassCard>

          {/* Right column */}
          <div className="space-y-4">
            {/* Collateral panel */}
            <GlassCard>
              <div className="text-sm font-semibold text-text mb-4">Collateral</div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center text-xs font-bold text-accent">z</div>
                    <span className="text-sm font-medium text-text">{MOCK_CREDIT.collateralVault}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold font-mono tabular-nums text-text">{formatUSD(MOCK_CREDIT.collateralUSD)}</div>
                    <div className="text-2xs text-text-dim">~4,980 shares</div>
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-surface border border-border text-xs space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-text-dim">LTV Ratio</span>
                    <span className="font-semibold font-mono tabular-nums text-text">{formatBps(MOCK_CREDIT.ltvBps)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Max LTV</span>
                    <span className="font-semibold font-mono tabular-nums text-text">50.00%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-dim">Liq. Threshold</span>
                    <span className="font-semibold font-mono tabular-nums text-status-danger">~95%</span>
                  </div>
                </div>
                <button className="w-full btn-secondary text-xs py-2">
                  <Plus size={12} />
                  Add Collateral
                </button>
              </div>
            </GlassCard>

            {/* Repayment history */}
            <GlassCard>
              <div className="text-sm font-semibold text-text mb-4">Repayment History</div>
              <div className="space-y-2">
                {REPAYMENT_HISTORY.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${r.onTime ? 'bg-status-success' : 'bg-status-warning'}`} />
                      <span className="text-text-muted font-mono tabular-nums">{r.date}</span>
                    </div>
                    <span className="font-medium font-mono tabular-nums text-text">{formatUSD(r.amount)}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        </div>
      ) : (
        /* No credit line — open CTA */
        <GlassCard className="border-accent/20">
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-5">
              <CreditCard size={28} className="text-accent" />
            </div>
            <h3 className="text-xl font-bold text-text mb-2">Open a Credit Line</h3>
            <p className="text-sm text-text-dim max-w-md mx-auto mb-6">
              Deposit at least $500 in a vault, then open a credit line at 50% LTV. No credit check. No KYC.
            </p>
            <div className="flex items-center justify-center gap-3 text-sm text-text-dim mb-8">
              <div className="flex items-center gap-1.5">
                <DollarSign size={14} className="text-accent" />
                50% LTV
              </div>
              <div className="flex items-center gap-1.5">
                <Info size={14} className="text-accent" />
                10% APR
              </div>
            </div>
            <button className="btn-primary px-8 py-3 text-base">
              Open Credit Line
            </button>
          </div>
        </GlassCard>
      )}

      {showBorrow && (
        <BorrowModal
          creditLimit={MOCK_CREDIT.creditLimit}
          borrowed={MOCK_CREDIT.borrowed}
          onClose={() => setShowBorrow(false)}
        />
      )}
      {showRepay && (
        <RepayModal
          borrowed={MOCK_CREDIT.borrowed}
          interest={MOCK_CREDIT.interest}
          onClose={() => setShowRepay(false)}
        />
      )}
    </div>
  )
}
