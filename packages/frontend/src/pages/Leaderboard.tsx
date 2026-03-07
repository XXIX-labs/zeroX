import { useState } from 'react'
import { Trophy, Medal, ChevronLeft, ChevronRight } from 'lucide-react'
import { GlassCard } from '../components/common/GlassCard'
import { Badge } from '../components/common/Badge'
import { getTierForScore } from '../lib/scoreUtils'
import { formatUSD, formatPercent } from '../lib/formatters'

// Mock leaderboard data
const LEADERBOARD = Array.from({ length: 50 }, (_, i) => ({
  rank: i + 1,
  address: `0x${Math.random().toString(16).slice(2, 6)}...${Math.random().toString(16).slice(2, 6)}`,
  score: Math.max(300, Math.min(850, 850 - i * 8 + Math.floor(Math.random() * 20 - 10))),
  deposited: Math.floor(Math.random() * 100_000) + 500,
  utilization: Math.random() * 0.8,
}))

const ITEMS_PER_PAGE = 20

const RANK_STYLES: Record<number, { bg: string; border: string }> = {
  1: { bg: 'bg-[#FFD700]/[0.08]', border: 'border-[#FFD700]/30' },
  2: { bg: 'bg-[#C0C0C0]/[0.06]', border: 'border-[#C0C0C0]/20' },
  3: { bg: 'bg-[#CD7F32]/[0.06]', border: 'border-[#CD7F32]/20' },
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy size={16} className="text-[#FFD700]" />
  if (rank === 2) return <Medal size={16} className="text-[#C0C0C0]" />
  if (rank === 3) return <Medal size={16} className="text-[#CD7F32]" />
  return <span className="text-sm text-text-dim font-mono tabular-nums w-6 text-center">{rank}</span>
}

export function Leaderboard() {
  const [page, setPage] = useState(1)
  const totalPages = Math.ceil(LEADERBOARD.length / ITEMS_PER_PAGE)
  const start = (page - 1) * ITEMS_PER_PAGE
  const pageData = LEADERBOARD.slice(start, start + ITEMS_PER_PAGE)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Leaderboard</h1>
        <p className="text-sm text-text-dim mt-1">Top wallets by credit score on ZeroX Protocol</p>
      </div>

      {/* Top 3 podium */}
      <div className="grid grid-cols-3 gap-4">
        {[1, 0, 2].map((rankIdx) => {
          const entry = LEADERBOARD[rankIdx]
          if (!entry) return null
          const tier = getTierForScore(entry.score)
          const podiumHeight = rankIdx === 0 ? 'py-8' : 'py-5'
          const isFirst = entry.rank === 1

          return (
            <div
              key={entry.rank}
              className={`rounded-xl border bg-surface p-4 ${podiumHeight} text-center relative transition-all duration-200
                         ${RANK_STYLES[entry.rank]?.bg ?? ''}
                         ${RANK_STYLES[entry.rank]?.border ?? 'border-border'}
                         ${isFirst ? 'order-2' : entry.rank === 2 ? 'order-1' : 'order-3'}`}
            >
              <div className="flex justify-center mb-2">
                <RankBadge rank={entry.rank} />
              </div>
              <div className="text-2xs text-text-dim font-mono mb-2">{entry.address}</div>
              <div className="text-2xl font-mono font-black tabular-nums mb-1" style={{ color: tier.hex }}>
                {entry.score}
              </div>
              <Badge variant={
                tier.tier === 'EXCELLENT' ? 'green' :
                tier.tier === 'VERY_GOOD' ? 'green' :
                'yellow'
              }>
                {tier.label}
              </Badge>
            </div>
          )
        })}
      </div>

      {/* Full table */}
      <GlassCard padding="none">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-4 px-5 py-3 border-b border-border text-2xs font-semibold text-text-dim uppercase tracking-wider">
          <div className="col-span-1">#</div>
          <div className="col-span-4">Address</div>
          <div className="col-span-3 text-right">Score</div>
          <div className="col-span-2 text-right">Deposits</div>
          <div className="col-span-2 text-right">Utilization</div>
        </div>

        {/* Table rows */}
        <div>
          {pageData.map((entry) => {
            const tier = getTierForScore(entry.score)
            const rowStyle = RANK_STYLES[entry.rank]

            return (
              <div
                key={entry.rank}
                className={`grid grid-cols-12 gap-4 px-5 py-4 border-b border-border
                             hover:bg-surface-hover transition-colors
                             ${rowStyle ? rowStyle.bg : ''}
                             ${entry.rank <= 3 ? `border-l-2 ${entry.rank === 1 ? 'border-l-[#FFD700]/50' : entry.rank === 2 ? 'border-l-[#C0C0C0]/40' : 'border-l-[#CD7F32]/40'}` : ''}`}
              >
                {/* Rank */}
                <div className="col-span-1 flex items-center">
                  <RankBadge rank={entry.rank} />
                </div>

                {/* Address */}
                <div className="col-span-4 flex items-center">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-2xs font-mono font-bold"
                      style={{ background: `${tier.hex}20`, color: tier.hex, border: `1px solid ${tier.hex}30` }}
                    >
                      {entry.rank}
                    </div>
                    <span className="text-sm font-mono text-text-muted">{entry.address}</span>
                  </div>
                </div>

                {/* Score */}
                <div className="col-span-3 flex items-center justify-end gap-2">
                  <span className="text-sm font-mono font-black tabular-nums" style={{ color: tier.hex }}>
                    {entry.score}
                  </span>
                  <Badge
                    variant={
                      tier.tier === 'EXCELLENT' || tier.tier === 'VERY_GOOD' ? 'green' :
                      tier.tier === 'GOOD' ? 'yellow' :
                      tier.tier === 'FAIR' ? 'yellow' : 'red'
                    }
                  >
                    {tier.label}
                  </Badge>
                </div>

                {/* Deposits */}
                <div className="col-span-2 flex items-center justify-end">
                  <span className="text-sm font-mono tabular-nums text-text-muted">{formatUSD(entry.deposited, { compact: true })}</span>
                </div>

                {/* Utilization */}
                <div className="col-span-2 flex items-center justify-end gap-2">
                  <div className="w-12 h-1.5 rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${entry.utilization * 100}%`,
                        backgroundColor: entry.utilization > 0.7 ? '#EF4444' : entry.utilization > 0.4 ? '#F59E0B' : '#10B981',
                      }}
                    />
                  </div>
                  <span className="text-2xs font-mono tabular-nums text-text-dim w-8 text-right">
                    {formatPercent(entry.utilization * 100, { decimals: 0 })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-border">
          <div className="text-2xs text-text-dim font-mono tabular-nums">
            Showing {start + 1}--{Math.min(start + ITEMS_PER_PAGE, LEADERBOARD.length)} of {LEADERBOARD.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost w-8 h-8 p-0 flex items-center justify-center disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-2xs font-mono tabular-nums text-text-muted px-2">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost w-8 h-8 p-0 flex items-center justify-center disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  )
}
