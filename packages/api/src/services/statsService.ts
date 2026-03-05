import { desc, eq, sql, and, gte } from 'drizzle-orm'
import type { Database } from '../plugins/db'
import { vaultSnapshots, creditPositions, userScores } from '../db/schema'

export interface ProtocolStats {
  tvlUSD:       string
  totalBorrowed: string
  avgApy:        string
  activeUsers:   number
  totalLoans:    number
  healthScore:   string
  updatedAt:     string
}

export async function getProtocolStats(db: Database, redis: { get: (k: string) => Promise<string | null>; setex: (k: string, ttl: number, v: string) => Promise<unknown> }): Promise<ProtocolStats> {
  const CACHE_KEY = 'api:stats'
  const CACHE_TTL = 60

  const cached = await redis.get(CACHE_KEY)
  if (cached) return JSON.parse(cached)

  // Latest TVL per vault
  const tvlRows = await db
    .selectDistinctOn([vaultSnapshots.vaultAddress], {
      vaultAddress: vaultSnapshots.vaultAddress,
      tvl:          vaultSnapshots.tvl,
      apy:          vaultSnapshots.apy,
    })
    .from(vaultSnapshots)
    .orderBy(vaultSnapshots.vaultAddress, desc(vaultSnapshots.snapshotAt))

  const tvlUSD = tvlRows.reduce((sum, r) => sum + parseFloat(r.tvl), 0)
  const avgApy = tvlRows.length
    ? tvlRows.reduce((sum, r) => sum + parseFloat(r.apy), 0) / tvlRows.length
    : 0

  // Active credit positions
  const [borrowStats] = await db
    .select({
      totalBorrowed: sql<string>`COALESCE(SUM(principal + interest_accrued), 0)`,
      totalLoans:    sql<number>`COUNT(*)`,
    })
    .from(creditPositions)
    .where(eq(creditPositions.isActive, true))

  // Avg credit score (proxy for health)
  const [scoreStats] = await db
    .select({
      avgScore: sql<string>`COALESCE(AVG(score), 600)`,
      userCount: sql<number>`COUNT(DISTINCT user_address)`,
    })
    .from(userScores)
    .where(
      gte(userScores.computedAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
    )

  const stats: ProtocolStats = {
    tvlUSD:        tvlUSD.toFixed(2),
    totalBorrowed: borrowStats?.totalBorrowed ?? '0',
    avgApy:        avgApy.toFixed(4),
    activeUsers:   Number(scoreStats?.userCount ?? 0),
    totalLoans:    Number(borrowStats?.totalLoans ?? 0),
    healthScore:   parseFloat(scoreStats?.avgScore ?? '600').toFixed(0),
    updatedAt:     new Date().toISOString(),
  }

  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(stats))
  return stats
}
