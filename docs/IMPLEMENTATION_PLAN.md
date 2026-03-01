# ZeroX Protocol — Implementation Plan

> Engineering guide for developers working on the ZeroX Protocol monorepo.

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Local Development Workflow](#3-local-development-workflow)
4. [Testing Strategy](#4-testing-strategy)
5. [Deployment Sequence](#5-deployment-sequence)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [CI/CD Pipeline](#7-cicd-pipeline)
8. [Monitoring & Alerting](#8-monitoring--alerting)
9. [Incident Response](#9-incident-response)

---

## 1. Development Environment Setup

### Prerequisites

| Tool        | Version  | Purpose                         |
|-------------|----------|---------------------------------|
| Node.js     | 20 LTS   | Runtime for API, indexer, SDK   |
| pnpm        | 9.x      | Package manager (workspaces)    |
| Foundry     | latest   | Fuzz + invariant testing        |
| Docker      | 24.x     | Local Postgres + Redis          |
| Git         | 2.40+    | Version control                 |

### Installation

```bash
# 1. Install pnpm
npm install -g pnpm@9

# 2. Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 3. Clone and install
git clone https://github.com/your-org/zerox.git
cd zerox
pnpm install

# 4. Copy environment files
cp .env.example .env
cp packages/api/.env.example packages/api/.env       # if exists
cp packages/indexer/.env.example packages/indexer/.env

# 5. Start local services
docker compose up -d   # Postgres 16 + Redis 7

# 6. Run database migrations
pnpm --filter api db:migrate

# 7. Compile contracts
pnpm --filter contracts compile

# 8. Build all packages
pnpm build
```

### Local Hardhat Fork

For full E2E testing against Avalanche state:

```bash
# Start Hardhat node forking Avalanche mainnet
cd packages/contracts
npx hardhat node --fork $AVALANCHE_RPC_HTTP

# In another terminal — deploy to local fork
npx hardhat run scripts/deploy/00_deploy_registry.ts --network localhost
# ... repeat for 01-05
```

---

## 2. Monorepo Structure

```
zeroX/
├── package.json              # pnpm workspaces root
├── pnpm-workspace.yaml       # workspace glob: packages/*
├── turbo.json                # Turborepo pipeline
├── tsconfig.base.json        # Shared TypeScript config
├── .env.example              # Environment variable template
├── packages/
│   ├── contracts/            # Solidity + Hardhat + Foundry
│   ├── frontend/             # React 18 + Wagmi v2 + Viem
│   ├── api/                  # Fastify + Drizzle + PostgreSQL
│   ├── indexer/              # Viem event listener service
│   └── sdk/                  # @zerox/credit-sdk npm package
└── docs/
    ├── IMPLEMENTATION_PLAN.md
    └── REFERENCE.md
```

### Turborepo Build Pipeline

```
contracts:compile
       ↓
   sdk:build
       ↓
  ┌────┴────┐
api:build  frontend:build
  └────┬────┘
indexer:build
```

Tasks: `compile → build → test → lint`
All tasks depend on `^build` (upstream packages must build first).

---

## 3. Local Development Workflow

### Starting all services

```bash
# Terminal 1: API server (hot reload)
pnpm --filter api dev

# Terminal 2: Indexer (hot reload)
pnpm --filter indexer dev

# Terminal 3: Frontend (Vite HMR)
pnpm --filter frontend dev

# Terminal 4: Hardhat node (if needed)
pnpm --filter contracts node:fork
```

### Making contract changes

1. Edit `.sol` file
2. `pnpm --filter contracts compile` — regenerates TypeChain types
3. `pnpm --filter contracts test` — run Hardhat tests
4. TypeChain types auto-imported in frontend/sdk via the `contracts` package

### Adding a new API endpoint

1. Create service in `packages/api/src/services/`
2. Create route in `packages/api/src/routes/`
3. Register route in `packages/api/src/index.ts`
4. Add Zod validation for all inputs

### Updating the DB schema

```bash
# Edit packages/api/src/db/schema.ts
# Generate migration
pnpm --filter api db:generate
# Apply migration
pnpm --filter api db:migrate
```

---

## 4. Testing Strategy

### Contract Tests (Hardhat)

```bash
pnpm --filter contracts test
pnpm --filter contracts test:gas    # Gas report
pnpm --filter contracts coverage    # Coverage report (target: >95%)
```

Test files: `packages/contracts/test/hardhat/`

### Contract Fuzz Tests (Foundry)

```bash
pnpm --filter contracts test:fuzz       # 10,000 runs per property
pnpm --filter contracts test:invariant  # Invariant: score in [300,850]
```

Test files: `packages/contracts/test/foundry/`

### API Tests

```bash
pnpm --filter api test   # Vitest with real Postgres via testcontainers
```

### SDK Tests

```bash
pnpm --filter sdk test   # Unit tests against mock publicClient
```

### Frontend E2E

```bash
# Requires local Hardhat fork + all services running
pnpm --filter frontend test:e2e  # Playwright
```

### Security Analysis

```bash
# Install Slither
pip install slither-analyzer

# Run on all contracts
cd packages/contracts
slither . --config-file slither.config.json
```

---

## 5. Deployment Sequence

### Phase 1: Fuji Testnet

```bash
# Prerequisites:
# - FUJI_PRIVATE_KEY in .env
# - FUJI_RPC_URL pointing to testnet

pnpm --filter contracts deploy:fuji
```

This runs in order:
1. `00_deploy_registry.ts` — ZeroXRegistry with 3-of-5 signers
2. `01_deploy_vault_usdc.ts` — ZeroXVault (USDC)
3. `02_deploy_vault_usdt.ts` — ZeroXVault (USDT)
4. `03_deploy_score.ts` — ZeroXScore
5. `04_deploy_credit.ts` — ZeroXCredit
6. `05_wire_registry.ts` — Registers all contracts in Registry, grants roles

After deployment:
- Addresses written to `deployments/fuji.json`
- Update `packages/frontend/src/constants/addresses.ts` with Fuji addresses
- Update `.env` for API + Indexer with Fuji contract addresses
- Run indexer against Fuji: `pnpm --filter indexer start`
- Conduct full flow test: deposit → credit → borrow → repay

### Phase 2: External Security Audit

> **DO NOT deploy to mainnet without a completed external security audit.**

Prepare audit package:
- All `.sol` files with NatSpec documentation complete
- Test coverage report (must be >95%)
- Slither analysis report (zero high/critical findings)
- Fuzz test results (10k runs, no failures)
- Architecture documentation

Recommended auditors: Trail of Bits, Spearbit, Sherlock, Code4rena contest.

### Phase 3: Mainnet Deployment

```bash
# Prerequisites:
# - Audit complete and all findings resolved
# - MAINNET_PRIVATE_KEY in .env (deployer)
# - Gnosis Safe address for multisig signers
# - SNOWTRACE_API_KEY for contract verification

pnpm --filter contracts deploy:mainnet
```

After deployment:
- Verify all contracts on Snowtrace: `pnpm --filter contracts verify:fuji` (adjust for mainnet)
- Transfer ownership of Registry to multisig
- Run smoke test: minimal deposit → borrow → repay
- Enable monitoring (Tenderly, Grafana alerts)

---

## 6. Environment Variables Reference

### Root `.env`

```env
# ─── Blockchain ────────────────────────────────────────────────────────────────
AVALANCHE_RPC_HTTP=https://api.avax.network/ext/bc/C/rpc
AVALANCHE_RPC_WS=wss://api.avax.network/ext/bc/C/ws
FUJI_RPC_HTTP=https://api.avax-test.network/ext/bc/C/rpc
FUJI_RPC_WS=wss://api.avax-test.network/ext/bc/C/ws

# ─── Deploy Keys (never commit) ────────────────────────────────────────────────
DEPLOYER_PRIVATE_KEY=           # Used only for deployment scripts
FUJI_PRIVATE_KEY=               # Testnet deployer

# ─── Contract Addresses (populated after deployment) ───────────────────────────
REGISTRY_ADDRESS=
VAULT_USDC_ADDRESS=
VAULT_USDT_ADDRESS=
SCORE_ADDRESS=
CREDIT_ADDRESS=

# ─── API Server ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://zerox:zerox@localhost:5432/zerox
REDIS_URL=redis://localhost:6379
PORT=3001
CORS_ORIGIN=http://localhost:5173

# ─── Frontend ──────────────────────────────────────────────────────────────────
VITE_WALLETCONNECT_PROJECT_ID=  # From cloud.walletconnect.com
VITE_ALCHEMY_KEY=               # Optional, for Alchemy RPC
VITE_API_URL=http://localhost:3001

# ─── Verification ──────────────────────────────────────────────────────────────
SNOWTRACE_API_KEY=
```

---

## 7. CI/CD Pipeline

### GitHub Actions

File: `.github/workflows/ci.yml`

**On every push / PR:**
1. `pnpm install`
2. `pnpm build` (Turborepo cached)
3. `pnpm --filter contracts compile`
4. `pnpm --filter contracts test`
5. `pnpm --filter contracts lint` (solhint)
6. `pnpm --filter api test`
7. `pnpm --filter sdk test`

**On merge to `main`:**
1. All of the above
2. `pnpm --filter frontend build` (ensures production build succeeds)
3. Deploy preview to Vercel (frontend)

**On tag `v*.*.*`:**
1. All CI checks
2. Deploy frontend to Vercel (production)
3. Publish `@zerox/credit-sdk` to npm

### Infrastructure

| Service    | Platform       | Notes                              |
|------------|----------------|------------------------------------|
| Frontend   | Vercel         | Auto-deploy from main branch        |
| API        | Railway        | Dockerfile in packages/api/         |
| Indexer    | Railway        | Long-running process service        |
| Postgres   | Railway        | PostgreSQL 16                       |
| Redis      | Railway        | Redis 7                             |
| Monitoring | Grafana Cloud  | + Prometheus metrics endpoint       |

---

## 8. Monitoring & Alerting

### Key Metrics to Track

**Indexer Health**
- `indexer_last_block` — should be within 20 blocks of chain head
- `indexer_events_processed_total` — counter by event type
- `indexer_errors_total` — alert if >5/minute

**API Health**
- `http_request_duration_p99` — alert if >500ms
- `http_error_rate` — alert if >1% 5xx
- `db_query_duration_p99`
- `redis_hit_rate`

**Protocol Health**
- Count of positions with `healthStatus = 'LIQUIDATABLE'` — alert if >0
- TVL changes >20% in 1 hour
- Number of oracle staleness errors

### Grafana Dashboards

1. **Protocol Overview** — TVL, active loans, avg score, 24h events
2. **Indexer** — block lag, events/minute, error rate
3. **API** — request rate, latency percentiles, error rate
4. **Risk** — at-risk positions, LTV distribution histogram

### Tenderly Alerts

Set up Tenderly monitoring for:
- Any `Liquidated` event → immediate Slack notification
- `emergencyWithdrawAll` called → PagerDuty alert
- Registry `Paused` event → PagerDuty alert
- Large single deposit/withdrawal (>$1M)

---

## 9. Incident Response

### P0 — Contract Exploit Suspected

1. Immediately call `Registry.pause()` via multisig (3-of-5 signers)
   - This pauses Vault deposits/withdrawals AND Credit borrows
2. Post public message: "Investigating reports of unusual activity"
3. Engage security firm for incident analysis
4. Do NOT unpause until root cause is identified and patched

### P1 — Oracle Goes Stale

Chainlink feeds include a 1-hour staleness guard. If a feed stops:
- Vault `totalAssets()` will use last known price
- Credit borrows will revert (oracle required for collateral USD)
- Monitor: if USDC/USD or AVAX/USD feed is stale >1hr, alert

### P2 — Indexer Falls Behind

If indexer block lag >1000 blocks:
1. Check Redis for cursor key
2. Check RPC endpoint connectivity
3. Manual restart: `railway service restart indexer`
4. If DB issue: check Railway Postgres logs
