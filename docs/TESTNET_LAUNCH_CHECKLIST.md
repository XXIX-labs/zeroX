# ZeroX Protocol — Testnet & Mainnet Launch Checklist

**Target:** Avalanche Fuji (testnet) → Avalanche C-Chain (mainnet)
**Last updated:** 2026-03-05

---

## Phase 0 — Pre-Testnet: Code Readiness

These gates must be cleared before any on-chain deployment.

### Smart Contract Quality
- [ ] All CRITICAL + HIGH findings in `docs/SECURITY_AUDIT.md` resolved (verified 2026-03-05)
- [ ] All post-Agora NEW-H-01 / NEW-M-01 / NEW-M-02 / NEW-L-01 / NEW-L-02 fixes applied (done)
- [ ] Solidity compiler: `0.8.24`, optimizer `1000` runs, `viaIR: false`
- [ ] All `require()` messages are user-readable (no raw reverts)
- [ ] No `selfdestruct`, no `delegatecall` in non-proxy contracts
- [ ] No hardcoded `block.number` comparisons (timestamps only)
- [ ] No unchecked arithmetic outside explicitly safe blocks
- [ ] All external calls use `SafeERC20` or explicit return-value checks
- [ ] `forceApprove` used (not `approve`) for ERC-20 with non-standard return types (USDT)

### Test Suite
- [ ] **Hardhat unit tests pass:** `npx hardhat test` — 0 failures
  - ZeroXVault.test.ts
  - ZeroXCredit.test.ts
  - ZeroXScore.test.ts
  - ZeroXRegistry.test.ts
  - Integration.test.ts
- [ ] **Foundry fuzz tests pass:** `forge test --fuzz-runs 10000` — 0 failures
  - ZeroXCredit.fuzz.t.sol (RiskMath fuzz, C-01 invariant)
  - ZeroXVault.fuzz.t.sol (ERC-4626 roundtrip)
  - ZeroXScore.invariant.t.sol (score bounds)
- [ ] Test coverage ≥ 95% on all core contracts (use `forge coverage`)
- [ ] Integration test covers full lifecycle: deposit → open credit → borrow → repay → close → withdraw
- [ ] Integration test covers liquidation path
- [ ] Integration test covers emergency pause + withdraw
- [ ] Integration test covers rebalance with Agora allocation active (NEW-H-01 regression)

### Static Analysis
- [ ] **Slither:** `slither packages/contracts --filter-paths "node_modules,mocks,test"` — 0 High/Critical
- [ ] **Mythril** or **Echidna**: run against ZeroXVault and ZeroXCredit — 0 critical findings
- [ ] Manual review of all `unchecked` blocks
- [ ] Manual review of all external protocol integrations (Aave, Benqi, Chainlink, Agora)

---

## Phase 1 — Fuji Testnet Deployment

### Infrastructure Setup
- [ ] Fuji RPC configured in `hardhat.config.ts` (`https://api.avax-test.network/ext/bc/C/rpc`)
- [ ] Deploy wallet funded with Fuji AVAX (faucet: `faucet.avax.network`)
- [ ] `packages/contracts/deployments/fuji.json` exists and is empty/reset
- [ ] `.env` set: `FUJI_PRIVATE_KEY`, `FUJI_RPC_URL`, `SNOWTRACE_API_KEY`, `FEE_RECIPIENT`
- [ ] Multisig: set up 5 test signer addresses for Fuji (can use dev wallets)

### Deploy Sequence (run in order)
- [ ] `00_deploy_registry.ts` — 5 signer addresses populated in script
- [ ] `01_deploy_vault_usdc.ts` — uses Fuji USDC mock or Fuji native USDC
- [ ] `02_deploy_vault_usdt.ts` — uses Fuji USDT mock
- [ ] `03_deploy_score.ts`
- [ ] `04_deploy_credit.ts`
- [ ] `05_wire_registry.ts` — executes proposals (timelock auto-advanced on testnet)
- [ ] `06_deploy_vault_ausd.ts` — uses Fuji AUSD mock

### Post-Deploy Verification
- [ ] All 7 contract addresses saved in `deployments/fuji.json`
- [ ] `ZeroXRegistry.getAddress(KEY_VAULT_USDC)` returns USDC vault address
- [ ] `ZeroXRegistry.getAddress(KEY_VAULT_USDT)` returns USDT vault address
- [ ] `ZeroXRegistry.getAddress(KEY_CREDIT)` returns Credit address
- [ ] `ZeroXRegistry.getAddress(KEY_SCORE)` returns Score address
- [ ] `ZeroXScore.scoreUpdater` == ZeroXCredit address
- [ ] `ZeroXScore.authorizedVaults(vaultUsdc)` == true
- [ ] `ZeroXScore.authorizedVaults(vaultUsdt)` == true
- [ ] `ZeroXScore.authorizedVaults(vaultAusd)` == true
- [ ] `ZeroXCredit.allowedVaults(vaultUsdc)` == true
- [ ] `ZeroXCredit.allowedVaults(vaultUsdt)` == true
- [ ] `ZeroXCredit.allowedVaults(vaultAusd)` == true
- [ ] `ZeroXVault(usdc).aaveAllocation + benqiAllocation` == 10000
- [ ] `ZeroXVault(usdc).rebalanceCooldown` >= 4 hours
- [ ] `ZeroXVault(usdc)._decimalsOffset()` == 6 (via compilation check / test)
- [ ] All vaults have `scoreContract` set
- [ ] Contracts verified on Snowtrace (Fuji): `npx hardhat verify --network fuji <address> ...args`

### Fuji Functional Testing (manual + script)
- [ ] **Deposit:** Deposit 1000 USDC into USDC vault → receive zxUSDC shares
- [ ] **Score init:** User's score initialized after first deposit (`getScore(user)` returns 600)
- [ ] **Credit line open:** Lock 100 zxUSDC → credit line active, collateral USD > $500
- [ ] **Borrow:** Borrow 400 USDC (< 50% LTV) → USDC received in wallet
- [ ] **LTV check:** Borrow beyond 50% LTV → reverts with "exceeds maximum LTV"
- [ ] **On-time repay:** Repay within 30 days of borrow → `REPAY_ONTIME` event, score increases
- [ ] **Late repay:** Repay after 30 days (advance time) → `REPAY_LATE` event, score decreases
- [ ] **Close credit line:** Repay all, close → collateral shares returned, score updated
- [ ] **Withdraw:** Redeem zxUSDC → USDC returned (includes yield)
- [ ] **Liquidation:** Drive position to LTV > 95.24% (depeg mock) → liquidation succeeds, liquidator gets bonus
- [ ] **Rebalance:** Owner calls `rebalance()` → allocation shifts, `StrategyRebalanced` event emitted
- [ ] **Rebalance with Agora:** Enable agoraAllocation=2000, call rebalance() → aave+benqi+agora=10000 ✓
- [ ] **Emergency pause:** Owner pauses all vaults → deposits/borrows revert
- [ ] **Emergency withdraw:** Owner calls `emergencyWithdrawAll()` → all funds pulled from Aave/Benqi
- [ ] **Registry timelock:** Propose registration → try execute before 48h → reverts; execute after 48h → succeeds
- [ ] **Price staleness:** Set mock Chainlink to 2h old → `getAssetPrice()` reverts with "stale price"

### Chainlink Feed Verification (Fuji)
- [ ] AVAX/USD feed responding with fresh data (< 1h)
- [ ] USDC/USD feed responding with fresh data (< 1h)
- [ ] USDT/USD feed responding with fresh data (< 1h)
- [ ] `getAssetPrice()` returns non-zero, non-stale price on all vaults

### API & Indexer (Fuji)
- [ ] Indexer connects to Fuji RPC and polls blocks
- [ ] Vault deposit events indexed → `vault_deposits` table populated
- [ ] Credit line events indexed → `credit_lines` table populated
- [ ] Score update events indexed → `score_events` table populated
- [ ] API `/v1/vaults` returns all 3 vaults with correct APY
- [ ] API `/v1/credit/{address}` returns credit line and LTV
- [ ] API `/v1/score/{address}` returns score and tier
- [ ] BullMQ liquidation watcher job fires when position crosses threshold

### Frontend (Fuji)
- [ ] `.env` updated with Fuji contract addresses
- [ ] Wallet connects on Fuji (chainId 43113)
- [ ] Vaults page shows USDC, USDT, AUSD vaults with live APY
- [ ] Dashboard shows user position, score, LTV
- [ ] Deposit flow works end-to-end (approve + deposit)
- [ ] Credit flow works end-to-end (open → borrow → repay → close)
- [ ] Score page shows score, history, tier badge
- [ ] Leaderboard shows top 10 scores
- [ ] AUSD vault shows Agora badge and "T-bill" strategy description

---

## Phase 2 — External Security Audit

**This phase is mandatory before mainnet. No exceptions.**

- [ ] Engage professional audit firm (Trail of Bits / Spearbit / Zellic / Code4rena)
- [ ] Provide auditors: all contracts, NatDoc, test suite, SECURITY_AUDIT.md, REFERENCE.md
- [ ] Audit scope: ZeroXVault, ZeroXCredit, ZeroXScore, ZeroXRegistry, RiskMath, ScoreCalculator
- [ ] All CRITICAL and HIGH findings from external audit resolved
- [ ] All MEDIUM findings resolved or formally accepted with documented rationale
- [ ] Final audit report published (link in README)
- [ ] Bug bounty program launched (Immunefi recommended; min $50K pool for Critical)

---

## Phase 3 — Mainnet Launch

### Pre-Launch Checklist
- [ ] External audit complete with final report
- [ ] All audit findings resolved and re-reviewed
- [ ] `registerDirect()` confirmed NOT present in any deployed contract bytecode
- [ ] 5 mainnet multisig signer addresses confirmed (hardware wallets preferred: Ledger/Trezor)
- [ ] Safe{Wallet} (Gnosis Safe) deployed on Avalanche with 3-of-5 threshold
- [ ] Safe address used as `owner` in all contracts
- [ ] `FEE_RECIPIENT` is a cold wallet or multisig, not an EOA hot wallet
- [ ] `AAVE_POOL` constant verified against Aave V3 Avalanche deployment (`0x794a6135...`)
- [ ] Benqi qiUSDC address verified: `0xB715808a78F6041E46d61Cb123C9B4A27056AE9C`
- [ ] Benqi qiUSDT address verified (update before deploy)
- [ ] Chainlink USDC/USD feed verified: `0xF096872672F44d6EBA71527d2ae83EB827571358`
- [ ] Chainlink USDT/USD feed verified: `0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a`
- [ ] AUSD mainnet address verified: `0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`
- [ ] Agora APPROVED_SWAPPER whitelist confirmed for USDC vault before enabling Agora strategy
- [ ] Multisig proposal flow tested end-to-end on Fuji with hardware wallets
- [ ] Deploy wallets use a fresh, never-reused key; transfer ownership to Safe immediately post-deploy
- [ ] Frontend ENV set to mainnet chain (chainId 43114) and mainnet contract addresses
- [ ] USDC liquidity funded into ZeroXCredit reserve (recommended initial: $500K)
- [ ] Initial performance fee set to 0% for first 30 days (user acquisition period)

### Mainnet Deploy Sequence
- [ ] `00_deploy_registry.ts` (mainnet) — Safe address as all 5 signers initially (rotate post-launch)
- [ ] `01_deploy_vault_usdc.ts` (mainnet)
- [ ] `02_deploy_vault_usdt.ts` (mainnet)
- [ ] `03_deploy_score.ts` (mainnet)
- [ ] `04_deploy_credit.ts` (mainnet)
- [ ] `05_wire_registry.ts` (mainnet) — prints calldata; execute via Safe UI + 48h wait
- [ ] `06_deploy_vault_ausd.ts` (mainnet) — only after Agora whitelist confirmed

### Post-Deploy Mainnet Verification
- [ ] All contracts verified on Snowtrace (mainnet)
- [ ] All addresses published in `deployments/mainnet.json`
- [ ] Frontend updated with mainnet addresses
- [ ] SDK `@zerox/credit-sdk` published with mainnet addresses as defaults
- [ ] Indexer connected to mainnet RPC
- [ ] API connected to mainnet indexer
- [ ] Monitoring alerts configured:
  - [ ] Chainlink staleness alert (> 55 min without update)
  - [ ] Total protocol TVL drop > 20% in 1h
  - [ ] Position count crossing liquidation threshold > 10
  - [ ] ZeroXCredit reserve balance < $100K
  - [ ] Any call to `emergencyWithdrawAll()`
  - [ ] Any Registry proposal submitted

### Soft Launch (First 30 Days)
- [ ] Launch with deposit cap: $500K per vault (`maxDepositUSD` guard — add before mainnet)
- [ ] Launch with credit line cap: max $50K per user
- [ ] Core team monitors positions daily
- [ ] Remove caps after 30 days of incident-free operation
- [ ] Announce bug bounty with active Immunefi campaign

---

## Summary Table

| Phase | Gate | Required Before |
|-------|------|-----------------|
| 0 | Tests pass + static analysis clean | Testnet deploy |
| 1 | Full Fuji functional test pass | External audit |
| 2 | External audit complete, all critical/high fixed | Mainnet deploy |
| 3 | Hardware wallet multisig, liquidity funded, monitoring live | Public launch |

---

## Known Outstanding Items (Post-Mainnet Upgrades via Registry)

These are informational findings accepted for v1 and scheduled for v1.1:

1. **`performanceFee` not implemented** — `harvestYield()` stub. Implement fee harvesting in v1.1.
2. **`diversificationSignal` static** — update when user deposits to 2nd vault. Requires off-chain tracking.
3. **No proposal expiry** — Registry proposals never expire. Add 7-day execution window in v1.1.
4. **No signer rotation** — If a signer key is compromised, cannot remove without redeploying Registry. Use Safe's existing key rotation for interim protection.
5. **AUSD peg assumption** — Monitor AUSD peg daily. Add Chainlink AUSD/USD feed when available.
