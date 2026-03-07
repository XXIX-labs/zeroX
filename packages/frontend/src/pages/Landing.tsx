import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useEffect } from 'react'
import { ArrowRight, Zap, CreditCard, BarChart3, Shield, TrendingUp, Globe } from 'lucide-react'
import { AnimatedCounter } from '../components/common/AnimatedCounter'
import { ConnectButton } from '../components/wallet/ConnectButton'
import { formatUSD } from '../lib/formatters'

const STATS = [
  { label: 'TVL', value: 1_240_000, format: (v: number) => formatUSD(v, { compact: true }) },
  { label: 'Users', value: 847, format: (v: number) => Math.round(v).toLocaleString() },
  { label: 'Avg APY', value: 6.42, format: (v: number) => `${v.toFixed(2)}%` },
  { label: 'Credit Lines', value: 312, format: (v: number) => Math.round(v).toLocaleString() },
]

const FEATURES = [
  {
    icon: TrendingUp,
    title: 'Yield Vaults',
    description: 'Deposit stablecoins. Auto-rebalance across Aave V3 and Benqi. No manual management.',
    accent: 'text-accent',
    accentBg: 'bg-accent-dim',
  },
  {
    icon: CreditCard,
    title: 'Credit Lines',
    description: 'Use vault shares as collateral. Borrow stablecoins at 50% LTV. Draw and repay anytime.',
    accent: 'text-status-warning',
    accentBg: 'bg-status-warning/8',
  },
  {
    icon: BarChart3,
    title: 'Credit Score',
    description: 'Every interaction builds your on-chain identity. Score range 300-850. Fully portable.',
    accent: 'text-status-success',
    accentBg: 'bg-status-success/8',
  },
]

const WHY_ITEMS = [
  { icon: Shield, text: 'Audited contracts on Avalanche C-Chain' },
  { icon: Globe, text: 'Permissionless — no KYC required' },
  { icon: Zap, text: 'Sub-second finality, <$0.01 transactions' },
]

export function Landing() {
  const navigate = useNavigate()
  const { isConnected } = useAccount()

  useEffect(() => {
    if (isConnected) navigate('/app/dashboard')
  }, [isConnected, navigate])

  return (
    <div className="min-h-screen bg-bg-deep text-text overflow-x-hidden relative">
      {/* Background texture */}
      <div className="fixed inset-0 bg-dots bg-dot-sm opacity-30 pointer-events-none" />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/3 w-[600px] h-[400px] bg-accent/[0.03] rounded-full blur-[120px]" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-xs font-bold text-accent font-mono tracking-tighter">0X</span>
          </div>
          <span className="font-semibold text-text text-sm tracking-tight">ZeroX Protocol</span>
        </div>
        <div className="flex items-center gap-4">
          <a
            href="https://docs.zeroxprotocol.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-muted hover:text-text transition-colors font-mono"
          >
            Docs
          </a>
          <ConnectButton />
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-16">
        <div className="max-w-3xl">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded bg-accent-dim mb-8 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            <span className="text-2xs font-mono font-medium text-accent uppercase tracking-widest">Avalanche C-Chain</span>
          </div>

          {/* Headline — asymmetric, left-aligned, not centered */}
          <h1 className="text-5xl md:text-[4.5rem] font-bold leading-[1.02] tracking-tight mb-6 animate-slide-up">
            Your crypto.
            <br />
            <span className="text-gradient-accent">Working harder.</span>
          </h1>

          <p className="text-lg text-text-muted max-w-xl leading-relaxed mb-10 animate-slide-up-1">
            Deposit stablecoins for optimized yield. Unlock credit lines.
            Build a permanent on-chain credit identity.
          </p>

          {/* CTAs */}
          <div className="flex items-center gap-3 animate-slide-up-2">
            <ConnectButton />
            <a href="https://docs.zeroxprotocol.xyz" className="btn-secondary text-xs">
              Read Docs
              <ArrowRight size={13} />
            </a>
          </div>
        </div>

        {/* Stats strip — dense, monospaced, right of hero */}
        <div className="mt-20 grid grid-cols-4 gap-px bg-border rounded-lg overflow-hidden animate-slide-up-3">
          {STATS.map(({ label, value, format }) => (
            <div key={label} className="bg-surface px-5 py-4">
              <div className="text-xl font-bold font-mono tabular text-text">
                <AnimatedCounter value={value} format={format} duration={1500} />
              </div>
              <div className="text-2xs font-mono text-text-dim uppercase tracking-widest mt-1">
                {label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features — asymmetric grid */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h2 className="text-2xl font-bold text-text mb-1.5">Three layers. One protocol.</h2>
          <p className="text-text-muted text-sm">Everything for DeFi-native credit.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, description, accent, accentBg }, i) => (
            <div
              key={title}
              className={`card p-5 hover:shadow-card-hover transition-all duration-300 group
                animate-slide-up-${i + 2}`}
            >
              <div className={`w-9 h-9 rounded-lg ${accentBg} flex items-center justify-center mb-4
                group-hover:scale-105 transition-transform duration-200`}>
                <Icon size={16} className={accent} />
              </div>
              <h3 className="text-sm font-semibold text-text mb-1.5">{title}</h3>
              <p className="text-xs text-text-muted leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why ZeroX — horizontal strip */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        <div className="card p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex-1">
              <h3 className="text-lg font-bold text-text mb-1">Production-grade from day one.</h3>
              <p className="text-sm text-text-muted mb-4">
                Non-custodial, externally audited, designed for the long term.
              </p>
              <div className="flex flex-wrap gap-4">
                {WHY_ITEMS.map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-2 text-xs text-text-muted">
                    <Icon size={13} className="text-accent flex-shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => navigate('/app/dashboard')}
              className="btn-primary flex-shrink-0"
            >
              Launch App
              <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 max-w-5xl mx-auto px-6 py-6 border-t border-border mt-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-accent/10 flex items-center justify-center">
              <span className="text-[8px] font-mono font-bold text-accent">0X</span>
            </div>
            <span className="text-2xs font-mono text-text-dim">
              © 2025 ZeroX Protocol by 29Projects Lab
            </span>
          </div>
          <div className="flex items-center gap-4 text-2xs font-mono text-text-dim">
            <a href="#" className="hover:text-text-muted transition-colors">Privacy</a>
            <a href="#" className="hover:text-text-muted transition-colors">Terms</a>
            <a href="https://github.com/XXIX-labs/zeroX" className="hover:text-text-muted transition-colors">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
