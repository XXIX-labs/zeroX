import {
  pgTable,
  text,
  integer,
  smallint,
  numeric,
  timestamp,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core'

// ─── Vault Snapshots ──────────────────────────────────────────────────────────

export const vaultSnapshots = pgTable(
  'vault_snapshots',
  {
    id:           integer().primaryKey().generatedAlwaysAsIdentity(),
    vaultAddress: text().notNull(),
    token:        text().notNull(),          // 'USDC' | 'USDT'
    tvl:          numeric({ precision: 36, scale: 6 }).notNull(),
    apy:          numeric({ precision: 10, scale: 6 }).notNull(),
    sharePrice:   numeric({ precision: 36, scale: 18 }).notNull(),
    aaveApy:      numeric({ precision: 10, scale: 6 }),
    benqiApy:     numeric({ precision: 10, scale: 6 }),
    aaveAlloc:    integer(),  // basis points
    benqiAlloc:   integer(),  // basis points
    snapshotAt:   timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('vault_snapshots_address_idx').on(t.vaultAddress),
    index('vault_snapshots_time_idx').on(t.snapshotAt),
  ]
)

// ─── Credit Positions ─────────────────────────────────────────────────────────

export const creditPositions = pgTable(
  'credit_positions',
  {
    userAddress:      text().primaryKey(),
    collateralShares: numeric({ precision: 36, scale: 18 }),
    collateralToken:  text(),
    collateralVault:  text(),
    principal:        numeric({ precision: 36, scale: 6 }).default('0'),
    interestAccrued:  numeric({ precision: 36, scale: 6 }).default('0'),
    ltvBps:           integer().default(0),
    healthStatus:     text().default('HEALTHY'), // HEALTHY | WARNING | AT_RISK | LIQUIDATABLE
    isActive:         boolean().default(true),
    openedAt:         timestamp({ withTimezone: true }),
    closedAt:         timestamp({ withTimezone: true }),
    lastUpdated:      timestamp({ withTimezone: true }).defaultNow().notNull(),
  }
)

// ─── User Scores ──────────────────────────────────────────────────────────────

export const userScores = pgTable(
  'user_scores',
  {
    id:                 integer().primaryKey().generatedAlwaysAsIdentity(),
    userAddress:        text().notNull(),
    score:              smallint().notNull(),
    riskTier:           text().notNull(),  // EXCELLENT | VERY_GOOD | GOOD | FAIR | POOR
    repaymentSignal:    integer(),
    utilizationSignal:  integer(),
    accountAgeSignal:   integer(),
    collateralSignal:   integer(),
    diversifySignal:    integer(),
    triggerEvent:       text(),
    computedAt:         timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('user_scores_address_idx').on(t.userAddress),
    index('user_scores_computed_idx').on(t.computedAt),
  ]
)

// ─── Protocol Events ──────────────────────────────────────────────────────────

export const protocolEvents = pgTable(
  'protocol_events',
  {
    id:          integer().primaryKey().generatedAlwaysAsIdentity(),
    txHash:      text().notNull(),
    blockNumber: integer().notNull(),
    logIndex:    integer().notNull().default(0),
    eventType:   text().notNull(), // DEPOSIT|WITHDRAW|BORROW|REPAY|LIQUIDATION|SCORE_UPDATED|CREDIT_OPENED|CREDIT_CLOSED
    userAddress: text(),
    amount:      numeric({ precision: 36, scale: 6 }),
    vaultAddress: text(),
    metadata:    text(),  // JSON string for event-specific data
    createdAt:   timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('protocol_events_tx_log_idx').on(t.txHash, t.logIndex),
    index('protocol_events_user_idx').on(t.userAddress),
    index('protocol_events_type_idx').on(t.eventType),
    index('protocol_events_time_idx').on(t.createdAt),
  ]
)

// ─── API Keys (SDK Metering) ─────────────────────────────────────────────────

export const apiKeys = pgTable(
  'api_keys',
  {
    id:        integer().primaryKey().generatedAlwaysAsIdentity(),
    keyHash:   text().notNull(),
    owner:     text().notNull(),
    tier:      text().notNull().default('free'), // free | builder | growth | scale | enterprise
    rateLimit: integer().notNull().default(100), // requests per day
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('api_keys_hash_idx').on(t.keyHash),
    index('api_keys_owner_idx').on(t.owner),
  ]
)

// ─── API Usage (SDK Metering) ────────────────────────────────────────────────

export const apiUsage = pgTable(
  'api_usage',
  {
    id:         integer().primaryKey().generatedAlwaysAsIdentity(),
    keyId:      integer().notNull(),
    endpoint:   text().notNull(),
    timestamp_: timestamp({ withTimezone: true }).defaultNow().notNull(),
    responseMs: integer(),
  },
  (t) => [
    index('api_usage_key_idx').on(t.keyId),
    index('api_usage_time_idx').on(t.timestamp_),
  ]
)

// ─── Indexer State ────────────────────────────────────────────────────────────

export const indexerState = pgTable(
  'indexer_state',
  {
    contractAddress: text().primaryKey(),
    contractName:    text().notNull(),
    lastBlock:       integer().notNull().default(0),
    updatedAt:       timestamp({ withTimezone: true }).defaultNow().notNull(),
  }
)
