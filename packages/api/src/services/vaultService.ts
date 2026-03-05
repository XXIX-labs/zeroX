import { eq, desc, gte, and } from 'drizzle-orm'
import type { Database } from '../plugins/db'
import { vaultSnapshots } from '../db/schema'

export interface VaultSummary {
  vaultAddress: string
  token:        string
  tvl:          string
  apy:          string
  sharePrice:   string
  aaveApy:      string | null
  benqiApy:     string | null
  aaveAlloc:    number | null
  benqiAlloc:   number | null
  snapshotAt:   string
}

export interface HistoryPoint {
  timestamp: string
  tvl:       string
  apy:       string
}

export async function getAllVaults(db: Database): Promise<VaultSummary[]> {
  const rows = await db
    .selectDistinctOn([vaultSnapshots.vaultAddress], {
      vaultAddress: vaultSnapshots.vaultAddress,
      token:        vaultSnapshots.token,
      tvl:          vaultSnapshots.tvl,
      apy:          vaultSnapshots.apy,
      sharePrice:   vaultSnapshots.sharePrice,
      aaveApy:      vaultSnapshots.aaveApy,
      benqiApy:     vaultSnapshots.benqiApy,
      aaveAlloc:    vaultSnapshots.aaveAlloc,
      benqiAlloc:   vaultSnapshots.benqiAlloc,
      snapshotAt:   vaultSnapshots.snapshotAt,
    })
    .from(vaultSnapshots)
    .orderBy(vaultSnapshots.vaultAddress, desc(vaultSnapshots.snapshotAt))

  return rows.map(r => ({
    ...r,
    snapshotAt: r.snapshotAt.toISOString(),
  }))
}

export async function getVaultHistory(
  db: Database,
  vaultAddress: string,
  days = 30
): Promise<HistoryPoint[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      snapshotAt: vaultSnapshots.snapshotAt,
      tvl:        vaultSnapshots.tvl,
      apy:        vaultSnapshots.apy,
    })
    .from(vaultSnapshots)
    .where(
      and(
        eq(vaultSnapshots.vaultAddress, vaultAddress.toLowerCase()),
        gte(vaultSnapshots.snapshotAt, since)
      )
    )
    .orderBy(vaultSnapshots.snapshotAt)

  return rows.map(r => ({
    timestamp: r.snapshotAt.toISOString(),
    tvl:       r.tvl,
    apy:       r.apy,
  }))
}
