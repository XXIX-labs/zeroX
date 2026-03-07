import { useState } from 'react'
import { TrendingUp, Info, ChevronRight, Zap } from 'lucide-react'
import { GlassCard } from '../components/common/GlassCard'
import { Badge } from '../components/common/Badge'
import { useAppStore } from '../store/useAppStore'
import { formatUSD, formatPercent } from '../lib/formatters'

const VAULTS = [
  {
    id: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    apy: 6.42,
    tvl: 820_000,
    totalShares: 12_450,
    aaveAlloc: 60,
    benqiAlloc: 40,
    agoraAlloc: 0,
    aaveApy: 6.55,
    benqiApy: 6.22,
    agoraApy: 0,
    userDeposit: 5_000,
    userShares: 4_980,
    userYield: 142.38,
    iconColor: '#2775CA',
    minDeposit: 500,
    status: 'active',
    yieldSource: 'Aave V3 + Benqi',
  },
  {
    id: 'usdt',
    symbol: 'USDT',
    name: 'Tether USD',
    apy: 6.38,
    tvl: 420_000,
    totalShares: 6_340,
    aaveAlloc: 55,
    benqiAlloc: 45,
    agoraAlloc: 0,
    aaveApy: 6.48,
    benqiApy: 6.25,
    agoraApy: 0,
    userDeposit: 0,
    userShares: 0,
    userYield: 0,
    iconColor: '#26A17B',
    minDeposit: 500,
    status: 'active',
    yieldSource: 'Aave V3 + Benqi',
  },
  {
    id: 'ausd',
    symbol: 'AUSD',
    name: 'Agora USD',
    apy: 4.85,
    tvl: 180_000,
    totalShares: 2_890,
    aaveAlloc: 0,
    benqiAlloc: 0,
    agoraAlloc: 100,
    aaveApy: 0,
    benqiApy: 0,
    agoraApy: 4.85,
    userDeposit: 0,
    userShares: 0,
    userYield: 0,
    iconColor: '#C9A84C',
    minDeposit: 500,
    status: 'active',
    yieldSource: 'Agora T-bills',
  },
]

interface DepositModalProps {
  vault: (typeof VAULTS)[0]
  onClose: () => void
}

function DepositModal({ vault, onClose }: DepositModalProps) {
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'input' | 'approve' | 'deposit'>('input')
  const numAmount = parseFloat(amount) || 0
  const estimatedShares = numAmount / 1.001

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md card-elevated animate-slide-up p-5 z-10 rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-lg font-bold text-text">Deposit {vault.symbol}</div>
            <div className="text-2xs text-text-dim">Earn {formatPercent(vault.apy)} APY</div>
          </div>
          <button onClick={onClose} className="text-text-dim hover:text-text text-2xl leading-none">
            ×
          </button>
        </div>

        {/* Amount Input */}
        <div className="space-y-3 mb-5">
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
                onClick={() => setAmount('5000')}
                className="text-2xs text-accent hover:text-accent/80 font-semibold font-mono"
              >
                MAX
              </button>
              <span className="text-sm font-semibold text-text-muted font-mono">{vault.symbol}</span>
            </div>
          </div>

          {/* Preview */}
          {numAmount > 0 && (
            <div className="p-3 rounded-xl bg-surface border border-border space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">You receive</span>
                <span className="font-semibold font-mono tabular-nums text-text">
                  ~{estimatedShares.toFixed(4)} zx{vault.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Est. APY</span>
                <span className="font-semibold font-mono tabular-nums text-status-success">
                  {formatPercent(vault.apy)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Est. annual yield</span>
                <span className="font-semibold font-mono tabular-nums text-text">
                  {formatUSD((numAmount * vault.apy) / 100)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Minimum deposit notice */}
        {numAmount > 0 && numAmount < vault.minDeposit && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-status-warning/10 border border-status-warning/20 mb-4 text-sm text-status-warning">
            <Info size={14} className="flex-shrink-0" />
            Minimum deposit is {formatUSD(vault.minDeposit)}
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {step === 'input' && (
            <button
              onClick={() => setStep('approve')}
              disabled={numAmount < vault.minDeposit}
              className="w-full btn-primary py-3"
            >
              Approve {vault.symbol}
            </button>
          )}
          {step === 'approve' && (
            <>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-status-success/10 border border-status-success/20 text-sm text-status-success">
                ✓ {vault.symbol} approved
              </div>
              <button
                onClick={() => {
                  setStep('deposit')
                  onClose()
                }}
                className="w-full btn-primary py-3"
              >
                Deposit {formatUSD(numAmount)}
              </button>
            </>
          )}
        </div>

        <div className="mt-4 text-center text-2xs text-text-dim">
          By depositing you agree to the ZeroX Protocol terms
        </div>
      </div>
    </div>
  )
}

export function Vaults() {
  const [selectedVault, setSelectedVault] = useState<(typeof VAULTS)[0] | null>(null)
  const [depositVault, setDepositVault] = useState<(typeof VAULTS)[0] | null>(null)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Yield Vaults</h1>
        <p className="text-sm text-text-dim mt-1">
          Earn optimized yield via Aave V3, Benqi, and Agora T-bills — three strategies, one vault.
        </p>
      </div>

      {/* Vault cards */}
      <div className="grid lg:grid-cols-3 gap-4">
        {VAULTS.map((vault) => (
          <GlassCard
            key={vault.id}
            padding="none"
            className="overflow-hidden hover:border-border-bright transition-all duration-200"
          >
            {/* Card header */}
            <div className="p-5 border-b border-border">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  {/* Token icon */}
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-black text-base"
                    style={{
                      backgroundColor: vault.iconColor + '25',
                      border: `1px solid ${vault.iconColor}40`,
                    }}
                  >
                    <span style={{ color: vault.iconColor }}>{vault.symbol[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-text">zx{vault.symbol}</span>
                      <Badge variant="green" dot>
                        Active
                      </Badge>
                      {vault.agoraAlloc > 0 && (
                        <span
                          className="text-2xs font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: '#C9A84C20',
                            color: '#C9A84C',
                            border: '1px solid #C9A84C40',
                          }}
                        >
                          Agora
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-text-dim">{vault.name} Vault</div>
                  </div>
                </div>
                {/* APY */}
                <div className="text-right">
                  <div className="text-2xl font-black font-mono tabular-nums text-accent">
                    {formatPercent(vault.apy)}
                  </div>
                  <div className="stat-label">APY</div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="p-5 space-y-4">
              {/* Protocol TVL */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="stat-label mb-1">Total Deposited</div>
                  <div className="text-base font-bold font-mono tabular-nums text-text">
                    {formatUSD(vault.tvl, { compact: true })}
                  </div>
                </div>
                {vault.userDeposit > 0 && (
                  <div>
                    <div className="stat-label mb-1">Your Deposit</div>
                    <div className="text-base font-bold font-mono tabular-nums text-text">
                      {formatUSD(vault.userDeposit)}
                    </div>
                  </div>
                )}
              </div>

              {/* Strategy breakdown bar */}
              <div>
                <div className="flex justify-between text-2xs text-text-muted mb-2">
                  <span>Strategy Allocation</span>
                  {vault.agoraAlloc === 0 && (
                    <span className="flex items-center gap-1">
                      <Zap size={10} className="text-accent" />
                      Auto-rebalancing
                    </span>
                  )}
                </div>
                <div className="h-1.5 rounded-full overflow-hidden flex gap-px bg-surface">
                  {vault.aaveAlloc > 0 && (
                    <div
                      className="h-full transition-all duration-700"
                      style={{
                        width: `${vault.aaveAlloc}%`,
                        background: 'linear-gradient(90deg, #B6509E, #2EBAC6)',
                        borderRadius:
                          vault.benqiAlloc === 0 && vault.agoraAlloc === 0
                            ? '9999px'
                            : '9999px 0 0 9999px',
                      }}
                    />
                  )}
                  {vault.benqiAlloc > 0 && (
                    <div
                      className="h-full transition-all duration-700"
                      style={{
                        width: `${vault.benqiAlloc}%`,
                        background: 'linear-gradient(90deg, #E84142, #FF7A45)',
                        borderRadius: vault.agoraAlloc === 0 ? '0 9999px 9999px 0' : '0',
                      }}
                    />
                  )}
                  {vault.agoraAlloc > 0 && (
                    <div
                      className="h-full transition-all duration-700"
                      style={{
                        width: `${vault.agoraAlloc}%`,
                        background: 'linear-gradient(90deg, #C9A84C, #F0D060)',
                        borderRadius:
                          vault.aaveAlloc === 0 && vault.benqiAlloc === 0
                            ? '9999px'
                            : '0 9999px 9999px 0',
                      }}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 text-2xs text-text-dim mt-1.5 font-mono">
                  {vault.aaveAlloc > 0 && (
                    <span>
                      Aave V3 {vault.aaveAlloc}% — {formatPercent(vault.aaveApy)}
                    </span>
                  )}
                  {vault.benqiAlloc > 0 && (
                    <span>
                      Benqi {vault.benqiAlloc}% — {formatPercent(vault.benqiApy)}
                    </span>
                  )}
                  {vault.agoraAlloc > 0 && (
                    <span style={{ color: '#C9A84C' }}>
                      Agora T-bills {vault.agoraAlloc}% — {formatPercent(vault.agoraApy)}
                    </span>
                  )}
                </div>
              </div>

              {/* Yield earned (if user has position) */}
              {vault.userDeposit > 0 && (
                <div className="p-3 rounded-lg bg-status-success/[0.08] border border-status-success/[0.15]">
                  <div className="flex items-center justify-between">
                    <span className="text-2xs text-text-muted">Yield earned</span>
                    <span className="text-sm font-bold font-mono tabular-nums text-status-success">
                      +{formatUSD(vault.userYield)}
                    </span>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                <button onClick={() => setDepositVault(vault)} className="flex-1 btn-primary py-2">
                  <TrendingUp size={14} />
                  Deposit
                </button>
                {vault.userDeposit > 0 && (
                  <button className="flex-1 btn-secondary py-2">Withdraw</button>
                )}
                <button
                  onClick={() => setSelectedVault(vault)}
                  className="w-9 h-9 btn-secondary p-0 flex items-center justify-center"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Credit eligibility notice */}
      <GlassCard className="border-accent/20">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-dim flex items-center justify-center flex-shrink-0">
            <TrendingUp size={16} className="text-accent" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-text">Credit Line Eligibility</div>
            <div className="text-2xs text-text-dim mt-0.5">
              Deposit at least $500 in any vault to unlock a stablecoin credit line at 50% LTV.
            </div>
          </div>
          <Badge variant="accent">50% LTV</Badge>
        </div>
      </GlassCard>

      {/* Deposit modal */}
      {depositVault && (
        <DepositModal vault={depositVault} onClose={() => setDepositVault(null)} />
      )}
    </div>
  )
}
