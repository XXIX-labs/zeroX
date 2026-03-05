import { eq, desc, gte, and } from 'drizzle-orm'
import type { Database } from '../plugins/db'
import { userScores } from '../db/schema'

export interface ScoreEntry {
  score:              number
  riskTier:           string
  repaymentSignal:    number | null
  utilizationSignal:  number | null
  accountAgeSignal:   number | null
  collateralSignal:   number | null
  diversifySignal:    number | null
  triggerEvent:       string | null
  computedAt:         string
}

export interface LeaderboardEntry {
  rank:        number
  userAddress: string
  score:       number
  riskTier:    string
  computedAt:  string
}

export async function getLatestScore(
  db: Database,
  userAddress: string
): Promise<ScoreEntry | null> {
  const [row] = await db
    .select()
    .from(userScores)
    .where(eq(userScores.userAddress, userAddress.toLowerCase()))
    .orderBy(desc(userScores.computedAt))
    .limit(1)

  if (!row) return null

  return {
    score:             row.score,
    riskTier:          row.riskTier,
    repaymentSignal:   row.repaymentSignal,
    utilizationSignal: row.utilizationSignal,
    accountAgeSignal:  row.accountAgeSignal,
    collateralSignal:  row.collateralSignal,
    diversifySignal:   row.diversifySignal,
    triggerEvent:      row.triggerEvent,
    computedAt:        row.computedAt.toISOString(),
  }
}

export async function getScoreHistory(
  db: Database,
  userAddress: string,
  days = 90
): Promise<Array<{ score: number; computedAt: string; triggerEvent: string | null }>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      score:        userScores.score,
      computedAt:   userScores.computedAt,
      triggerEvent: userScores.triggerEvent,
    })
    .from(userScores)
    .where(
      and(
        eq(userScores.userAddress, userAddress.toLowerCase()),
        gte(userScores.computedAt, since)
      )
    )
    .orderBy(userScores.computedAt)

  return rows.map(r => ({
    score:        r.score,
    computedAt:   r.computedAt.toISOString(),
    triggerEvent: r.triggerEvent,
  }))
}

export async function getLeaderboard(
  db: Database,
  redis: { get: (k: string) => Promise<string | null>; setex: (k: string, ttl: number, v: string) => Promise<unknown> },
  page = 1,
  limit = 20
): Promise<{ entries: LeaderboardEntry[]; total: number; page: number; totalPages: number }> {
  const CACHE_KEY = `api:leaderboard:${page}:${limit}`
  const CACHE_TTL = 60

  const cached = await redis.get(CACHE_KEY)
  if (cached) return JSON.parse(cached)

  const offset = (page - 1) * limit

  // Get distinct latest score per user
  const rows = await db.execute<{
    user_address: string
    score:        number
    risk_tier:    string
    computed_at:  string
    row_num:      number
    total:        number
  }>(
    `SELECT user_address, score, risk_tier, computed_at, total
     FROM (
       SELECT DISTINCT ON (user_address)
         user_address,
         score,
         risk_tier,
         computed_at,
         COUNT(*) OVER () AS total
       FROM user_scores
       ORDER BY user_address, computed_at DESC
     ) latest
     ORDER BY score DESC
     LIMIT ${limit} OFFSET ${offset}`
  )

  const total = rows.length > 0 ? Number(rows[0]!.total) : 0

  const entries: LeaderboardEntry[] = rows.map((r, idx) => ({
    rank:        offset + idx + 1,
    userAddress: r.user_address,
    score:       r.score,
    riskTier:    r.risk_tier,
    computedAt:  new Date(r.computed_at).toISOString(),
  }))

  const result = {
    entries,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  }

  await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result))
  return result
}
