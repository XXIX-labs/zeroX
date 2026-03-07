import { useAccount } from 'wagmi'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { GlassCard } from '../components/common/GlassCard'
import { ScoreGauge } from '../components/score/ScoreGauge'
import { Badge } from '../components/common/Badge'
import { ConnectButton } from '../components/wallet/ConnectButton'
import { getTierForScore } from '../lib/scoreUtils'
import { formatUSD, formatPercent } from '../lib/formatters'
import { TrendingUp, Clock, ShieldCheck, Repeat, DollarSign, ArrowUpRight } from 'lucide-react'

// Mock score data — replace with on-chain reads
const MOCK_SCORE = {
  score: 714,
  repaymentSignal: 9200,
  utilizationSignal: 6800,
  accountAgeSignal: 5200,
  collateralSignal: 7100,
  diversificationSignal: 5000,
  totalRepayments: 8,
  onTimeRepayments: 8,
  liquidationCount: 0,
  totalVolumeUSD: 42_500,
  firstDepositAt: new Date('2024-09-15'),
}

const SCORE_HISTORY = Array.from({ length: 90 }, (_, i) => ({
  date: new Date(Date.now() - (89 - i) * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  score: Math.min(850, Math.max(300, 580 + Math.round(i * 1.5 + Math.random() * 20 - 10))),
}))

const SIGNALS = [
  {
    key: 'repayment',
    label: 'Repayment History',
    weight: 35,
    signal: MOCK_SCORE.repaymentSignal,
    icon: Repeat,
    description: `${MOCK_SCORE.onTimeRepayments}/${MOCK_SCORE.totalRepayments} on-time`,
  },
  {
    key: 'utilization',
    label: 'Credit Utilization',
    weight: 30,
    signal: MOCK_SCORE.utilizationSignal,
    icon: TrendingUp,
    description: `${formatPercent(100 - MOCK_SCORE.utilizationSignal / 100)} utilized`,
  },
  {
    key: 'age',
    label: 'Account Age',
    weight: 15,
    signal: MOCK_SCORE.accountAgeSignal,
    icon: Clock,
    description: `Since ${MOCK_SCORE.firstDepositAt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`,
  },
  {
    key: 'collateral',
    label: 'Collateral Health',
    weight: 10,
    signal: MOCK_SCORE.collateralSignal,
    icon: ShieldCheck,
    description: 'Good collateral ratio',
  },
  {
    key: 'volume',
    label: 'Total Volume',
    weight: 5,
    signal: MOCK_SCORE.diversificationSignal,
    icon: DollarSign,
    description: `${formatUSD(MOCK_SCORE.totalVolumeUSD, { compact: true })} cumulative`,
  },
]

const TIPS = [
  {
    title: 'Repay on time',
    description: 'On-time repayments are the #1 factor. Set reminders for payment due dates.',
    impact: 'High Impact',
    variant: 'green' as const,
  },
  {
    title: 'Lower your utilization',
    description: 'Keep borrowed amount under 30% of your credit limit for best score.',
    impact: 'Medium Impact',
    variant: 'yellow' as const,
  },
  {
    title: 'Maintain deposits',
    description: 'Consistent deposits over time increase your account age and consistency score.',
    impact: 'Gradual',
    variant: 'accent' as const,
  },
]

function getSignalColor(signal: number): string {
  if (signal >= 7500) return '#10B981'
  if (signal >= 5000) return '#F59E0B'
  if (signal >= 2500) return '#F97316'
  return '#EF4444'
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const score = payload[0].value
  const tier = getTierForScore(score)
  return (
    <div className="bg-surface-elevated border border-border-bright rounded-xl px-4 py-3 shadow-card-hover">
      <div className="text-2xs text-text-dim mb-1">{label}</div>
      <div className="text-lg font-mono font-black tabular-nums" style={{ color: tier.hex }}>{score}</div>
      <div className="text-2xs font-mono" style={{ color: tier.hex }}>{tier.label}</div>
    </div>
  )
}

export function Score() {
  const { isConnected } = useAccount()
  const tier = getTierForScore(MOCK_SCORE.score)

  if (!isConnected) {
    return (
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold text-text">Credit Score</h1>
        <div className="flex flex-col items-center justify-center py-24">
          <ScoreGauge score={600} size={200} animate={false} />
          <div className="text-sm text-text-dim mt-4 mb-6">Connect wallet to see your score</div>
          <ConnectButton />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Credit Score</h1>
        <p className="text-sm text-text-dim mt-1">On-chain credit score, readable by any protocol</p>
      </div>

      {/* Score overview */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Score gauge — primary card */}
        <GlassCard padding="lg" className="flex flex-col items-center justify-center"
                   style={{ borderColor: tier.hex + '33', boxShadow: `0 0 30px ${tier.hex}15` }}>
          <ScoreGauge score={MOCK_SCORE.score} size={220} />

          {/* Stats below gauge */}
          <div className="w-full mt-6 grid grid-cols-2 gap-3 text-center">
            <div className="p-3 rounded-xl bg-surface border border-border">
              <div className="text-lg font-mono font-black tabular-nums text-text">{MOCK_SCORE.onTimeRepayments}</div>
              <div className="stat-label">On-Time</div>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border">
              <div className="text-lg font-mono font-black tabular-nums text-status-success">{MOCK_SCORE.liquidationCount}</div>
              <div className="stat-label">Liquidations</div>
            </div>
          </div>

          {/* Portability badge */}
          <div className="mt-4 flex items-center gap-2 text-2xs text-text-dim">
            <ArrowUpRight size={12} />
            Readable by any protocol on Avalanche
          </div>
        </GlassCard>

        {/* Score breakdown */}
        <GlassCard className="lg:col-span-2">
          <div className="text-sm font-semibold text-text mb-5">Score Breakdown</div>
          <div className="space-y-4">
            {SIGNALS.map(({ key, label, weight, signal, icon: Icon, description }) => {
              const pct = signal / 100
              const color = getSignalColor(signal)
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <Icon size={14} className="text-text-dim" />
                      <span className="text-sm text-text-muted font-medium">{label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-2xs">
                      <span className="text-text-dim font-mono">{weight}% weight</span>
                      <span className="font-mono font-bold tabular-nums" style={{ color }}>{pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface overflow-hidden mb-1">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: color,
                        boxShadow: `0 0 6px ${color}66`,
                      }}
                    />
                  </div>
                  <div className="text-2xs text-text-dim">{description}</div>
                </div>
              )
            })}
          </div>
        </GlassCard>
      </div>

      {/* Score history chart */}
      <GlassCard padding="none">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <div className="text-sm font-semibold text-text">Score History</div>
            <div className="text-2xs text-text-dim">Last 90 days</div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-bold tabular-nums" style={{ color: tier.hex }}>{MOCK_SCORE.score}</span>
            <Badge variant={
              tier.tier === 'EXCELLENT' ? 'green' :
              tier.tier === 'VERY_GOOD' ? 'green' :
              tier.tier === 'GOOD' ? 'yellow' :
              tier.tier === 'FAIR' ? 'yellow' : 'red'
            }>{tier.label}</Badge>
          </div>
        </div>
        <div className="h-48 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SCORE_HISTORY} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="date"
                tick={{ fill: 'hsl(220, 10%, 30%)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval={14}
              />
              <YAxis
                domain={[300, 850]}
                tick={{ fill: 'hsl(220, 10%, 30%)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Tier boundary lines */}
              <ReferenceLine y={750} stroke="rgba(16,185,129,0.2)" strokeDasharray="4 4" />
              <ReferenceLine y={700} stroke="rgba(134,239,172,0.2)" strokeDasharray="4 4" />
              <ReferenceLine y={650} stroke="rgba(250,204,21,0.2)" strokeDasharray="4 4" />
              <ReferenceLine y={580} stroke="rgba(245,158,11,0.2)" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="score"
                stroke={tier.hex}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: tier.hex }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {/* Tier legend */}
        <div className="px-5 pb-4 flex items-center gap-4 text-2xs text-text-dim font-mono">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-status-success inline-block" />750+ Excellent</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-score-very-good inline-block" />700 Very Good</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-score-good inline-block" />650 Good</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-score-fair inline-block" />580 Fair</span>
        </div>
      </GlassCard>

      {/* Tips to improve */}
      <div>
        <div className="text-sm font-semibold text-text mb-3">How to improve your score</div>
        <div className="grid md:grid-cols-3 gap-4">
          {TIPS.map(({ title, description, impact, variant }) => (
            <GlassCard key={title}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-text">{title}</span>
                <Badge variant={variant} className="text-2xs">{impact}</Badge>
              </div>
              <p className="text-2xs text-text-muted leading-relaxed">{description}</p>
            </GlassCard>
          ))}
        </div>
      </div>
    </div>
  )
}
