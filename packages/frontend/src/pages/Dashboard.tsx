import { useAccount } from 'wagmi'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, CreditCard, BarChart3, DollarSign, Activity, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { GlassCard } from '../components/common/GlassCard'
import { AnimatedCounter } from '../components/common/AnimatedCounter'
import { Badge } from '../components/common/Badge'
import { HealthFactorBar } from '../components/credit/HealthFactorBar'
import { ConnectButton } from '../components/wallet/ConnectButton'
import { formatUSD, formatTimeAgo } from '../lib/formatters'
import { useAppStore } from '../store/useAppStore'

// Mock data — replace with live API queries
const PROTOCOL_STATS = {
  tvl: 1_240_000,
  avgApy: 6.42,
  totalBorrowed: 380_000,
  activeUsers: 847,
}

const TVL_CHART_DATA = Array.from({ length: 30 }, (_, i) => ({
  date: new Date(Date.now() - (29 - i) * 86_400_000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  tvl: 800_000 + Math.random() * 500_000 + i * 15_000,
}))

const ACTIVITY_FEED = [
  { type: 'DEPOSIT', address: '0xABc1...4F2e', amount: 10_000, ago: Date.now() - 120_000 },
  { type: 'BORROW', address: '0x1234...5678', amount: 4_200, ago: Date.now() - 480_000 },
  { type: 'REPAY', address: '0xDEaD...BEeF', amount: 1_800, ago: Date.now() - 720_000 },
  { type: 'DEPOSIT', address: '0x9876...5432', amount: 25_000, ago: Date.now() - 1_200_000 },
  { type: 'LIQUIDATION', address: '0xC0fF...EE01', amount: 800, ago: Date.now() - 3_600_000 },
]

const EVENT_STYLES = {
  DEPOSIT: { icon: ArrowDownLeft, color: 'text-status-success', bg: 'bg-status-success/10', badge: 'accent' as const },
  BORROW: { icon: ArrowUpRight, color: 'text-accent', bg: 'bg-accent-dim', badge: 'accent' as const },
  REPAY: { icon: ArrowDownLeft, color: 'text-status-info', bg: 'bg-status-info/10', badge: 'muted' as const },
  LIQUIDATION: { icon: Activity, color: 'text-status-danger', bg: 'bg-status-danger/10', badge: 'muted' as const },
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-elevated border border-border rounded-xl px-4 py-3 shadow-card-hover">
      <div className="text-2xs text-text-dim mb-1 font-mono">{label}</div>
      <div className="text-sm font-bold text-accent font-mono tabular">
        {formatUSD(payload[0].value)}
      </div>
    </div>
  )
}

export function Dashboard() {
  const { isConnected, address } = useAccount()
  const navigate = useNavigate()
  const { openModal } = useAppStore()

  // Mock user position — replace with wagmi reads
  const userPosition = isConnected
    ? { depositedUSD: 5_000, yieldEarned: 142.38, ltvBps: 3200, creditLimit: 2500, borrowed: 800 }
    : null

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-text font-display">Dashboard</h1>
        <p className="text-sm text-text-dim mt-1">Protocol overview and your positions</p>
      </div>

      {/* Protocol stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Value Locked',
            value: PROTOCOL_STATS.tvl,
            format: (v: number) => formatUSD(v, { compact: true }),
            icon: DollarSign,
            change: '+12.4%',
            changePositive: true,
            iconBg: 'bg-accent/10',
            iconColor: 'text-accent',
          },
          {
            label: 'Average APY',
            value: PROTOCOL_STATS.avgApy,
            format: (v: number) => `${v.toFixed(2)}%`,
            icon: TrendingUp,
            change: 'Aave + Benqi',
            changePositive: true,
            iconBg: 'bg-status-success/10',
            iconColor: 'text-status-success',
          },
          {
            label: 'Total Borrowed',
            value: PROTOCOL_STATS.totalBorrowed,
            format: (v: number) => formatUSD(v, { compact: true }),
            icon: CreditCard,
            change: '10% APR',
            changePositive: null,
            iconBg: 'bg-avax/10',
            iconColor: 'text-avax',
          },
          {
            label: 'Active Users',
            value: PROTOCOL_STATS.activeUsers,
            format: (v: number) => Math.round(v).toLocaleString(),
            icon: BarChart3,
            change: '+23 this week',
            changePositive: true,
            iconBg: 'bg-status-warning/10',
            iconColor: 'text-status-warning',
          },
        ].map(({ label, value, format, icon: Icon, change, changePositive, iconBg, iconColor }) => (
          <GlassCard key={label} className="relative overflow-hidden">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}>
                <Icon size={17} className={iconColor} />
              </div>
              {change && (
                <span className={`text-2xs font-medium ${
                  changePositive === true ? 'text-status-success' :
                  changePositive === false ? 'text-status-danger' :
                  'text-text-dim'
                }`}>
                  {change}
                </span>
              )}
            </div>
            <div className="text-2xl font-black text-text font-mono tabular mb-1">
              <AnimatedCounter value={value} format={format} duration={1200} />
            </div>
            <div className="stat-label">{label}</div>
          </GlassCard>
        ))}
      </div>

      {/* Main content: TVL chart + user position */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* TVL Chart */}
        <GlassCard padding="none" className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-border">
            <div>
              <div className="text-sm font-semibold text-text">Total Value Locked</div>
              <div className="text-2xs text-text-dim">30-day history</div>
            </div>
            <div className="text-lg font-black text-gradient-accent font-mono tabular">
              {formatUSD(PROTOCOL_STATS.tvl, { compact: true })}
            </div>
          </div>
          <div className="h-52 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={TVL_CHART_DATA} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--color-text-dim)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  interval={6}
                />
                <YAxis
                  tick={{ fill: 'var(--color-text-dim)', fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v/1000).toFixed(0)}K`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="tvl"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  fill="url(#tvlGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* User position */}
        <GlassCard padding="none" className="overflow-hidden">
          <div className="p-5 border-b border-border">
            <div className="text-sm font-semibold text-text">Your Position</div>
          </div>

          {!isConnected ? (
            <div className="p-5 flex flex-col items-center justify-center min-h-[200px] gap-4">
              <div className="w-12 h-12 rounded-xl bg-surface border border-border flex items-center justify-center">
                <CreditCard size={20} className="text-text-dim" />
              </div>
              <div className="text-center">
                <div className="text-sm font-medium text-text-muted mb-1">Connect wallet to view</div>
                <div className="text-2xs text-text-dim">Your deposits and credit positions will appear here</div>
              </div>
              <ConnectButton compact />
            </div>
          ) : userPosition ? (
            <div className="p-5 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Deposited</span>
                  <span className="font-bold text-text font-mono tabular">{formatUSD(userPosition.depositedUSD)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Yield Earned</span>
                  <span className="font-bold text-status-success font-mono tabular">+{formatUSD(userPosition.yieldEarned)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Credit Limit</span>
                  <span className="font-bold text-text font-mono tabular">{formatUSD(userPosition.creditLimit)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-text-muted">Borrowed</span>
                  <span className="font-bold text-status-danger font-mono tabular">{formatUSD(userPosition.borrowed)}</span>
                </div>
              </div>

              <div className="divider" />

              {/* Health Factor */}
              <div>
                <div className="stat-label mb-2">Collateral Health</div>
                <HealthFactorBar ltvBps={userPosition.ltvBps} compact />
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  onClick={() => openModal('deposit')}
                  className="btn-secondary text-xs py-2"
                >
                  Deposit
                </button>
                <button
                  onClick={() => navigate('/app/credit')}
                  className="btn-secondary text-xs py-2"
                >
                  Borrow
                </button>
                <button
                  onClick={() => navigate('/app/score')}
                  className="btn-secondary text-xs py-2"
                >
                  Score
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="text-sm text-text-dim">No active position</div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Activity Feed */}
      <GlassCard padding="none">
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div className="text-sm font-semibold text-text">Recent Activity</div>
          <Badge variant="muted">Live</Badge>
        </div>
        <div className="divide-y divide-border">
          {ACTIVITY_FEED.map((event, i) => {
            const style = EVENT_STYLES[event.type as keyof typeof EVENT_STYLES]!
            const Icon = style.icon
            return (
              <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-elevated transition-colors">
                <div className={`w-8 h-8 rounded-xl ${style.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={14} className={style.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={style.badge} className="text-2xs">{event.type}</Badge>
                    <span className="text-sm text-text-muted font-mono truncate">{event.address}</span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-text font-mono tabular">{formatUSD(event.amount)}</div>
                  <div className="text-2xs text-text-dim font-mono">{formatTimeAgo(event.ago)}</div>
                </div>
              </div>
            )
          })}
        </div>
      </GlassCard>
    </div>
  )
}
