# ZeroX Protocol — Developer Reference

> Permanent reference for future developers. Keep this document up to date after every major change.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Contract Addresses](#2-contract-addresses)
3. [Smart Contract API](#3-smart-contract-api)
4. [Scoring Algorithm](#4-scoring-algorithm)
5. [Risk Parameters](#5-risk-parameters)
6. [API Endpoint Catalog](#6-api-endpoint-catalog)
7. [SDK Reference](#7-sdk-reference)
8. [Security Model](#8-security-model)
9. [Upgrade Path](#9-upgrade-path)
10. [Key External Dependencies](#10-key-external-dependencies)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Vercel)                        │
│           React 18 + Wagmi v2 + Viem + Tailwind                 │
│   Connects directly to chain for writes; reads from API + chain  │
└──────────────────┬──────────────────────────┬───────────────────┘
                   │ REST API                  │ Wagmi (viem)
                   ▼                           ▼
┌──────────────────────────┐    ┌──────────────────────────────────┐
│   API Server (Railway)    │    │        Avalanche C-Chain          │
│  Fastify + Drizzle ORM   │    │                                   │
│  BullMQ + Redis cache     │    │  ZeroXRegistry  ─── access ctrl  │
└────────────┬─────────────┘    │  ZeroXVault ─────── ERC-4626      │
             │                  │  ZeroXCredit ────── lending        │
             │ shared DB        │  ZeroXScore ─────── scoring        │
             ▼                  │                                   │
┌──────────────────────────┐    │   ┌──── Aave V3 Pool              │
│    PostgreSQL 16          │    │   └──── Benqi qiToken             │
│  (Railway managed)        │◄───┤                                   │
└──────────────────────────┘    │   Chainlink Price Feeds           │
             ▲                  │   USDC/USD  AVAX/USD              │
             │                  └──────────────────────────────────┘
┌────────────┴─────────────┐
│   Indexer (Railway)       │
│   Viem getLogs polling    │
│   Redis block cursor      │
│   12-block reorg buffer   │
└──────────────────────────┘
```

### Data Flow

1. **User deposits**: Wallet → `ZeroXVault.deposit()` → Score initialized → funds routed 60/40 Aave/Benqi
2. **User borrows**: `ZeroXCredit.openCreditLine()` → locks vault shares as collateral → `borrow()` → USDC transferred
3. **Score update**: Any credit event → `ZeroXScore.recordEvent()` → signals recomputed → score stored on-chain
4. **Indexer**: Polls getLogs every 3s → writes events to Postgres → updates `credit_positions` + `user_scores`
5. **API**: Reads from Postgres (fast) + supplements with on-chain calls for real-time accuracy

---

## 2. Contract Addresses

### Fuji Testnet (Chain ID: 43113)

> Populated after first testnet deployment. See `packages/contracts/deployments/fuji.json`.

| Contract      | Address |
|---------------|---------|
| ZeroXRegistry | TBD     |
| ZeroXVault (USDC) | TBD |
| ZeroXVault (USDT) | TBD |
| ZeroXScore    | TBD     |
| ZeroXCredit   | TBD     |

### Avalanche Mainnet (Chain ID: 43114)

> Populated after audit + mainnet deployment. See `packages/contracts/deployments/mainnet.json`.
> **DO NOT deploy to mainnet without a completed external security audit.**

| Contract      | Address |
|---------------|---------|
| ZeroXRegistry | TBD     |
| ZeroXVault (USDC) | TBD |
| ZeroXVault (USDT) | TBD |
| ZeroXScore    | TBD     |
| ZeroXCredit   | TBD     |

### External Protocol Addresses (Mainnet)

| Contract / Token     | Address                                      |
|----------------------|----------------------------------------------|
| USDC                 | `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E` |
| USDT                 | `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7` |
| Aave V3 Pool         | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Benqi qiUSDC         | `0xB715808a78F6041E46d61Cb123C9B4A27056AE9C` |
| Chainlink AVAX/USD   | `0x0A77230d17318075983913bC2145DB16C7366156` |
| Chainlink USDC/USD   | `0xF096872672F44d6EBA71527d2ae83EB827571358` |

---

## 3. Smart Contract API

### ZeroXRegistry

Central address book. All contracts look up peers through the Registry.

```solidity
// Read
function getAddress(bytes32 name) external view returns (address)
function isRegistered(bytes32 name) external view returns (bool)
function isPaused() external view returns (bool)

// Write (multisig-gated)
function propose(bytes32 name, address newAddress) external returns (uint256 proposalId)
function approve(uint256 proposalId) external
function execute(uint256 proposalId) external

// Emergency (admin only)
function pause() external
function unpause() external
```

**Registry keys** (keccak256 of name string):
- `"VAULT_USDC"`, `"VAULT_USDT"`, `"CREDIT"`, `"SCORE"`

### ZeroXVault (ERC-4626)

Standard ERC-4626 with strategy routing and ZeroX extensions.

```solidity
// ERC-4626 (standard)
function deposit(uint256 assets, address receiver) returns (uint256 shares)
function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)
function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)
function convertToAssets(uint256 shares) view returns (uint256)
function convertToShares(uint256 assets) view returns (uint256)
function totalAssets() view returns (uint256)     // idle + aToken.balanceOf + benqi*exchangeRate
function previewDeposit(uint256 assets) view returns (uint256)
function previewWithdraw(uint256 assets) view returns (uint256)
function previewRedeem(uint256 shares) view returns (uint256)

// ZeroX extensions
function getAaveAPY() view returns (uint256)      // bps (10000 = 100%)
function getBenqiAPY() view returns (uint256)     // bps
function aaveAllocation() view returns (uint256)  // bps (6000 = 60%)
function benqiAllocation() view returns (uint256) // bps (4000 = 40%)
function getUserPositionUSD(address user) view returns (uint256)  // 6 decimals

// Admin
function rebalance() external  // cooldown: 1 day
function emergencyWithdrawAll() external  // pauses and withdraws from strategies
```

**Important**: `totalAssets()` = `IERC20(asset).balanceOf(address(this))` + `aToken.balanceOf(address(this))` + `benqi.balanceOf(address(this)) * benqi.exchangeRateStored() / 1e18`

### ZeroXScore

```solidity
// Initialize (called automatically on first deposit)
function initializeScore(address user) external  // onlyScoreUpdater; no-op if already initialized

// Record events (called by Vault + Credit contracts)
function recordEvent(address user, CreditEventType eventType, uint256 amountUSD) external  // onlyScoreUpdater

// Read
function getScore(address user) view returns (uint16)        // 300–850
function getScoreData(address user) view returns (ScoreData)
function getRiskTier(uint16 score) pure returns (string)     // "EXCELLENT"|"VERY_GOOD"|"GOOD"|"FAIR"|"POOR"
function isInitialized(address user) view returns (bool)
```

**CreditEventType enum**:
```
0 = DEPOSIT
1 = WITHDRAWAL
2 = BORROW
3 = REPAY_ONTIME
4 = REPAY_LATE
5 = LIQUIDATION
6 = COLLATERAL_ADDED
7 = CREDIT_LINE_OPENED
8 = CREDIT_LINE_CLOSED
```

### ZeroXCredit

```solidity
// Credit line lifecycle
function openCreditLine(address collateralVault, uint256 sharesToDeposit) external
function closeCreditLine() external  // requires full repayment

// Borrowing
function borrow(uint256 amount) external   // USDC/USDT; max 50% LTV
function repay(uint256 amount) external    // partial or full

// Liquidation
function liquidate(address user) external  // callable by anyone; user must be at 105%+ LTV

// Read
function getCreditLine(address user) view returns (CreditLine memory)
function getCurrentDebt(address user) view returns (uint256 principal, uint256 interest)
function getHealthFactor(address user) view returns (uint256)   // scaled 1e18
function getMaxBorrowable(address user) view returns (uint256)  // 6 decimals
function getCollateralUSD(address user) view returns (uint256)  // 6 decimals
```

---

## 4. Scoring Algorithm

### Formula

```
score = 300 + (550 * weightedSum) / (BPS * BPS)

weightedSum = repaymentSignal * 3500
            + utilizationSignal * 3000
            + accountAgeSignal * 1500
            + collateralSignal * 1000
            + diversificationSignal * 0

result clamped to [300, 850]
```

`BPS = 10000`. All signals are in range `[0, 10000]`.

### Signal Computation

**Repayment Signal** (35% weight):
- 0 repayments → 3000 bps
- onTimeRepayments / totalRepayments → scaled 3000–10000
- Each liquidation: -3000 bps, minimum 0

**Utilization Signal** (30% weight):
- `currentDebt / maxBorrow`, inverse: lower debt = higher signal
- 0% utilization → 10000 bps
- 50%+ utilization → 3000 bps
- Linearly scaled between

**Account Age Signal** (15% weight):
- Age = `block.timestamp - firstDepositAt`
- 0 days → 0 bps
- 365 days → 10000 bps
- Linear, capped at 1 year

**Collateral Signal** (10% weight):
- If no credit line → 5000 bps (neutral)
- LTV < 30% → 10000 bps (excellent)
- LTV > 80% → 0 bps (poor)
- Linear between

**Diversification Signal** (0% weight, reserved):
- Number of unique vault interactions
- Currently not weighted (future feature)

### Score Tiers

| Tier      | Range   | Color   |
|-----------|---------|---------|
| EXCELLENT | 750–850 | #10B981 (green)  |
| VERY_GOOD | 700–749 | #34D399 (emerald)|
| GOOD      | 650–699 | #F59E0B (amber)  |
| FAIR      | 580–649 | #EF4444 (red)    |
| POOR      | 300–579 | #DC2626 (dark red)|

### Initial Score

New users are initialized at **600** (FAIR tier). This incentivizes early responsible behavior to move into GOOD territory.

---

## 5. Risk Parameters

| Parameter         | Value       | Notes                                    |
|-------------------|-------------|------------------------------------------|
| `LTV_MAX`         | 5000 bps    | Max 50% LTV — max borrows = 50% collateral |
| `WARN_LTV`        | 8000 bps    | 80% of collateral — WARNING health status |
| `LIQ_LTV`         | 10500 bps   | 105% of collateral — LIQUIDATABLE         |
| `APR`             | 1000 bps    | 10% annual interest rate                  |
| `LIQ_BONUS`       | 500 bps     | 5% bonus for liquidators                  |
| `MIN_DEPOSIT`     | 500 USD     | Minimum vault deposit                     |
| `PRICE_STALENESS` | 3600 s      | Chainlink oracle max age (1 hour)         |
| `AAVE_ALLOC`      | 6000 bps    | 60% of vault funds → Aave V3             |
| `BENQI_ALLOC`     | 4000 bps    | 40% of vault funds → Benqi               |
| `REBALANCE_CD`    | 1 day       | Minimum time between rebalances           |
| `CONFIRM_BLOCKS`  | 12          | Indexer reorg safety buffer               |

### Health Status Labels

| Status       | LTV Range           |
|--------------|---------------------|
| `HEALTHY`    | 0–79% of collateral |
| `WARNING`    | 80–104%             |
| `AT_RISK`    | 100–104%            |
| `LIQUIDATABLE` | 105%+            |

---

## 6. API Endpoint Catalog

Base URL: `https://api.zerox.finance/api/v1`

### Protocol

| Method | Path      | Description                     | Cache |
|--------|-----------|---------------------------------|-------|
| GET    | `/health` | Service health check             | none  |
| GET    | `/stats`  | TVL, totalBorrowed, avgAPY, users | 60s  |

### Vaults

| Method | Path                              | Description                | Cache |
|--------|-----------------------------------|----------------------------|-------|
| GET    | `/vaults`                         | All vaults + latest APY/TVL | none |
| GET    | `/vaults/:address/history?days=30` | APY + TVL history points   | none  |

### Credit

| Method | Path                            | Description              |
|--------|---------------------------------|--------------------------|
| GET    | `/credit/at-risk`               | Positions near liquidation |
| GET    | `/credit/:userAddress`          | Current credit line state  |
| GET    | `/credit/:userAddress/history`  | Borrow/repay event history |

### Score

| Method | Path                           | Description              |
|--------|--------------------------------|--------------------------|
| GET    | `/score/:userAddress`          | Latest score + signals   |
| GET    | `/score/:userAddress/history?days=90` | Score history   |

### Leaderboard

| Method | Path                         | Description                | Cache |
|--------|------------------------------|----------------------------|-------|
| GET    | `/leaderboard?page=1&limit=20` | Top scores paginated      | 60s   |

### Events

| Method | Path                                   | Description          |
|--------|----------------------------------------|----------------------|
| GET    | `/events?type=DEPOSIT&limit=50`        | Activity feed        |

### Response Shapes

**`GET /stats`**
```json
{
  "tvlUSD":        "1250000.00",
  "totalBorrowed": "340000.000000",
  "avgApy":        "0.085000",
  "activeUsers":   142,
  "totalLoans":    89,
  "healthScore":   "687",
  "updatedAt":     "2025-01-15T12:00:00.000Z"
}
```

**`GET /score/:userAddress`**
```json
{
  "score":             742,
  "riskTier":          "VERY_GOOD",
  "repaymentSignal":   8200,
  "utilizationSignal": 7500,
  "accountAgeSignal":  6100,
  "collateralSignal":  8800,
  "diversifySignal":   null,
  "triggerEvent":      "REPAY_ONTIME",
  "computedAt":        "2025-01-15T11:30:00.000Z"
}
```

---

## 7. SDK Reference

### Installation

```bash
npm install @zerox/credit-sdk viem
```

### Setup

```typescript
import { ZeroXClient } from '@zerox/credit-sdk'
import { createPublicClient, createWalletClient, http, custom } from 'viem'
import { avalanche } from 'viem/chains'

const publicClient = createPublicClient({
  chain: avalanche,
  transport: http('https://api.avax.network/ext/bc/C/rpc'),
})

// For read-only usage
const client = new ZeroXClient({
  publicClient,
  addresses: {
    vaultUSDC: '0x...',
    vaultUSDT: '0x...',
    credit:    '0x...',
    score:     '0x...',
  },
})

// For write operations
const walletClient = createWalletClient({
  chain: avalanche,
  transport: custom(window.ethereum),
})

const clientWithWallet = new ZeroXClient({ publicClient, walletClient, addresses: { ... } })
```

### Score Module

```typescript
// Get numeric score
const score = await client.score.getScore('0xABC...')  // 742

// Get full score data
const data = await client.score.getScoreData('0xABC...')
// {
//   score: 742,
//   tier: 'VERY_GOOD',
//   lastUpdated: 1705312200,
//   signals: { repayment: 8200, utilization: 7500, accountAge: 6100, collateral: 8800, diversification: 0 },
//   stats: { totalRepayments: 5, onTimeRepayments: 5, liquidationCount: 0, ... }
// }
```

### Vault Module

```typescript
// Get vault info
const info = await client.vault.getVaultInfo('USDC')
// { totalAssets, totalSupply, aaveApy, benqiApy, ... }

// Get user position
const pos = await client.vault.getUserPosition('USDC', '0xABC...')
// { shares, assetsUSD, sharePrice }

// Deposit flow (with walletClient)
const approve = await clientWithWallet.vault.approve(USDC_ADDRESS, VAULT_USDC_ADDRESS, amount)
await approve.wait()
const deposit = await clientWithWallet.vault.deposit('USDC', amount, userAddress)
await deposit.wait()
```

### Credit Module

```typescript
// Get credit line state
const line = await client.credit.getCreditLine('0xABC...')
// { isOpen, collateralShares, principal, currentDebt, healthFactor, maxBorrowable }

// Borrow
const tx = await clientWithWallet.credit.borrow(parseUnits('1000', 6))
await tx.wait()

// Repay
const repay = await clientWithWallet.credit.repay(parseUnits('500', 6))
await repay.wait()
```

### getUserSnapshot (Multicall)

```typescript
// All user data in one RPC call
const snapshot = await client.getUserSnapshot('0xABC...')
// {
//   vaultUSDC: { shares: ..., assetsUSD: ... },
//   vaultUSDT: { shares: ..., assetsUSD: ... },
//   score:     { score: 742, tier: 'VERY_GOOD' },
//   credit:    { isOpen: true, debtTotal: ..., healthFactor: ... }
// }
```

---

## 8. Security Model

### Access Control

| Role                 | Who Holds It         | Powers                                    |
|----------------------|----------------------|-------------------------------------------|
| `DEFAULT_ADMIN`      | ZeroXRegistry        | Grant/revoke all roles                    |
| `SCORE_UPDATER`      | ZeroXVault + ZeroXCredit | Call `recordEvent()` on Score contract |
| `VAULT_MANAGER`      | Multisig             | Rebalance strategy allocation             |
| `PAUSER`             | Any multisig signer  | Emergency pause (single signer)           |

### Multisig (3-of-5)

- Registry-internal proposal system (no external Gnosis dependency)
- 5 signer addresses set at deployment
- Proposals require 3 approvals before execution
- 48-hour execution window after approval threshold met
- Single signers can pause (for emergencies); unpause requires 3-of-5

### Oracle Security

- All Chainlink reads check:
  1. `answeredInRound >= roundId` (no stale round)
  2. `updatedAt >= block.timestamp - 3600` (max 1 hour old)
  3. `answer > 0` (sanity check)
- If oracle fails: vault `totalAssets()` uses last cached price; credit borrows revert

### Reentrancy

- All vault and credit functions use OpenZeppelin `ReentrancyGuard`
- Strategy interactions (Aave, Benqi) happen **after** ERC-4626 share minting (CEI pattern)
- No `.call()` to arbitrary addresses — only typed contract interfaces

### Flash Loan Protection

- No flashloan receiver interface implemented
- `deposit()` → ERC-4626 shares minted atomically; withdraw requires shares
- No price manipulation vector via same-block deposit-borrow-withdraw (LTV check at borrow time using Chainlink, not spot AMM price)

---

## 9. Upgrade Path

ZeroX uses a **Registry-based migration pattern** instead of proxy upgrades.

### How it works

1. Deploy new implementation contract (e.g., `ZeroXVaultV2`)
2. Propose address change in Registry: `registry.propose("VAULT_USDC", newVaultAddress)`
3. 3-of-5 signers approve the proposal
4. Execute: `registry.execute(proposalId)`
5. All contracts that look up `VAULT_USDC` via Registry now point to V2
6. Migrate user funds: admin calls `oldVault.migrateToNewVault(newVaultAddress)` (if implemented) or users withdraw and redeposit

### Advantages

- No storage collision risks (no proxies)
- Transparent — everyone can see the new address before migration
- Multisig-gated with time delay

### Limitations

- Users must redeposit if vault migrates (unless migration function implemented)
- Contract address changes break saved references — use Registry lookups everywhere

---

## 10. Key External Dependencies

| Dependency           | Version  | Purpose                      | Risk if Unavailable       |
|----------------------|----------|------------------------------|---------------------------|
| Aave V3 Pool         | on-chain | Primary yield strategy (60%) | Vault APY drops, fallback to Benqi |
| Benqi qiToken        | on-chain | Secondary yield (40%)        | Vault APY drops, fallback to Aave |
| Chainlink USDC/USD   | on-chain | Collateral pricing            | Credit borrows revert      |
| Chainlink AVAX/USD   | on-chain | AVAX price reference          | Some calculations fail     |
| Avalanche C-Chain    | L1       | All transactions              | Protocol offline           |
| PostgreSQL (Railway) | 16       | Off-chain data store          | API offline, chain still works |
| Redis (Railway)      | 7        | Cache + BullMQ queues         | API slower, no job scheduler |

### Fallback Strategy

- If Aave is paused: `emergencyWithdrawAll()` → all funds stay in vault idle (still ERC-4626 compliant)
- If Benqi fails: similar — withdraw from Benqi, keep idle
- If both yield strategies fail: vault becomes a simple yield-bearing USDC/USDT holding account
- Protocol continues to function; APY drops to 0% but deposits and credit lines remain accessible
