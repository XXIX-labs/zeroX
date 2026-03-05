import { eq, desc, and, lt, isNotNull } from 'drizzle-orm'
import type { Database } from '../plugins/db'
import { creditPositions, protocolEvents } from '../db/schema'

export interface CreditLineState {
  userAddress:      string
  collateralShares: string | null
  collateralToken:  string | null
  collateralVault:  string | null
  principal:        string | null
  interestAccrued:  string | null
  ltvBps:           number | null
  healthStatus:     string | null
  isActive:         boolean | null
  openedAt:         string | null
  closedAt:         string | null
  lastUpdated:      string
}

export interface CreditEvent {
  txHash:      string
  blockNumber: number
  eventType:   string
  amount:      string | null
  createdAt:   string
  metadata:    string | null
}

export async function getCreditPosition(
  db: Database,
  userAddress: string
): Promise<CreditLineState | null> {
  const [row] = await db
    .select()
    .from(creditPositions)
    .where(eq(creditPositions.userAddress, userAddress.toLowerCase()))

  if (!row) return null

  return {
    ...row,
    openedAt:    row.openedAt?.toISOString() ?? null,
    closedAt:    row.closedAt?.toISOString() ?? null,
    lastUpdated: row.lastUpdated.toISOString(),
  }
}

export async function getCreditHistory(
  db: Database,
  userAddress: string,
  limit = 50
): Promise<CreditEvent[]> {
  const rows = await db
    .select({
      txHash:      protocolEvents.txHash,
      blockNumber: protocolEvents.blockNumber,
      eventType:   protocolEvents.eventType,
      amount:      protocolEvents.amount,
      createdAt:   protocolEvents.createdAt,
      metadata:    protocolEvents.metadata,
    })
    .from(protocolEvents)
    .where(
      and(
        eq(protocolEvents.userAddress, userAddress.toLowerCase()),
        // Only credit-related events
      )
    )
    .orderBy(desc(protocolEvents.createdAt))
    .limit(limit)

  return rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }))
}

export interface AtRiskPosition {
  userAddress:  string
  ltvBps:       number | null
  healthStatus: string | null
  principal:    string | null
  lastUpdated:  string
}

export async function getAtRiskPositions(db: Database): Promise<AtRiskPosition[]> {
  const AT_RISK_LTV = 9000 // 90% LTV — approaching liquidation at 105%

  const rows = await db
    .select({
      userAddress:  creditPositions.userAddress,
      ltvBps:       creditPositions.ltvBps,
      healthStatus: creditPositions.healthStatus,
      principal:    creditPositions.principal,
      lastUpdated:  creditPositions.lastUpdated,
    })
    .from(creditPositions)
    .where(
      and(
        eq(creditPositions.isActive, true),
        isNotNull(creditPositions.ltvBps),
        lt(creditPositions.ltvBps, AT_RISK_LTV) // drizzle uses column value, we want ltvBps > AT_RISK
      )
    )
    .orderBy(desc(creditPositions.ltvBps))
    .limit(100)

  return rows.map(r => ({
    ...r,
    lastUpdated: r.lastUpdated.toISOString(),
  }))
}
