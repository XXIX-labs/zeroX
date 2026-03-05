/**
 * Integration Tests — Full ZeroX Protocol Lifecycle
 *
 * Tests multi-contract flows end-to-end:
 *   1. Deposit → Open Credit Line → Borrow → Repay → Close → Withdraw
 *   2. Liquidation scenario (price crash)
 *   3. Score improves over a clean repayment history
 *   4. Multiple users competing for protocol liquidity
 *   5. Emergency pause halts new credit operations
 */
import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { Signer } from 'ethers'
import type {
  ZeroXVault,
  ZeroXCredit,
  ZeroXScore,
  MockERC20,
  MockChainlinkFeed,
  MockAavePool,
  MockBenqi,
} from '../../typechain-types'

describe('Integration — Full Protocol Lifecycle', () => {
  // ─── Actors ────────────────────────────────────────────────────────────────
  let owner:        Signer
  let alice:        Signer
  let bob:          Signer
  let liquidator:   Signer
  let feeRecipient: Signer

  // ─── Contracts ─────────────────────────────────────────────────────────────
  let usdc:      MockERC20
  let aToken:    MockERC20
  let priceFeed: MockChainlinkFeed
  let aavePool:  MockAavePool
  let benqi:     MockBenqi
  let score:     ZeroXScore
  let vault:     ZeroXVault
  let credit:    ZeroXCredit

  // ─── Constants ─────────────────────────────────────────────────────────────
  const ONE_USDC       = 10n ** 6n
  const DEPOSIT        = 10_000n * ONE_USDC  // $10,000 — well above $500 minimum
  const BORROW         = 4_000n * ONE_USDC   // $4,000 — 40% LTV (below 50% max)
  const INITIAL_PRICE  = 100_000_000n        // $1.00 with 8 decimals

  // ─── Deploy ────────────────────────────────────────────────────────────────
  async function deployAll() {
    ;[owner, alice, bob, liquidator, feeRecipient] = await ethers.getSigners()

    const ERC20F = await ethers.getContractFactory('MockERC20')
    usdc   = await ERC20F.deploy('USD Coin', 'USDC', 6)
    aToken = await ERC20F.deploy('aUSDC', 'aUSDC', 6)

    const FeedF = await ethers.getContractFactory('MockChainlinkFeed')
    priceFeed = await FeedF.deploy(INITIAL_PRICE, 8)

    const AaveF = await ethers.getContractFactory('MockAavePool')
    aavePool = await AaveF.deploy(await usdc.getAddress(), await aToken.getAddress())

    const BenqiF = await ethers.getContractFactory('MockBenqi')
    benqi = await BenqiF.deploy(
      await usdc.getAddress(),
      'Benqi USDC',
      'qiUSDC',
    )

    const ScoreF = await ethers.getContractFactory('ZeroXScore')
    score = await ScoreF.deploy(await owner.getAddress())

    const VaultF = await ethers.getContractFactory('ZeroXVault')
    vault = await VaultF.deploy(
      await usdc.getAddress(), 'ZeroX USDC Vault', 'zxUSDC',
      await priceFeed.getAddress(),
      await aavePool.getAddress(),
      await benqi.getAddress(),
      await aToken.getAddress(),
      await feeRecipient.getAddress(),
      await owner.getAddress(),
    )

    const CreditF = await ethers.getContractFactory('ZeroXCredit')
    credit = await CreditF.deploy(
      await usdc.getAddress(),
      await score.getAddress(),
      await owner.getAddress(),
    )

    // ─── Wire ────────────────────────────────────────────────────────────────
    await vault.connect(owner).setScoreContract(await score.getAddress())
    await score.connect(owner).setVaultAuthorized(await vault.getAddress(), true)
    await score.connect(owner).setScoreUpdater(await credit.getAddress())
    await credit.connect(owner).addAllowedVault(await vault.getAddress())

    // ─── Seed token balances ─────────────────────────────────────────────────
    // Users
    await usdc.mint(await alice.getAddress(),      DEPOSIT * 10n)
    await usdc.mint(await bob.getAddress(),        DEPOSIT * 10n)
    await usdc.mint(await liquidator.getAddress(), DEPOSIT * 10n)
    // Strategies need liquidity to handle redemptions
    await usdc.mint(await benqi.getAddress(),      DEPOSIT * 200n)
    // Fund credit contract reserve
    await usdc.mint(await owner.getAddress(),      DEPOSIT * 100n)
    await usdc.connect(owner).approve(await credit.getAddress(), DEPOSIT * 100n)
    await credit.connect(owner).fundReserve(DEPOSIT * 100n)
  }

  beforeEach(deployAll)

  // ─── Helpers ───────────────────────────────────────────────────────────────

  async function aliceDepositsAndOpensCreditLine() {
    await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT)
    await vault.connect(alice).deposit(DEPOSIT, await alice.getAddress())
    const shares = await vault.balanceOf(await alice.getAddress())
    await vault.connect(alice).approve(await credit.getAddress(), shares)
    await credit.connect(alice).openCreditLine(await vault.getAddress(), shares)
    return shares
  }

  async function advanceTime(seconds: number) {
    await ethers.provider.send('evm_increaseTime', [seconds])
    await ethers.provider.send('evm_mine', [])
  }

  // ─── Scenario 1: Happy Path ────────────────────────────────────────────────
  describe('Scenario 1: Full happy-path lifecycle', () => {
    it('Deposit → Open Credit Line → Borrow → Repay → Close → Withdraw', async () => {
      const aliceAddr = await alice.getAddress()

      // ── Step 1: Alice deposits USDC into vault ─────────────────────────────
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT)
      await vault.connect(alice).deposit(DEPOSIT, aliceAddr)

      const shares = await vault.balanceOf(aliceAddr)
      expect(shares).to.be.gt(0n, 'Alice should have vault shares after deposit')

      // Score should be initialized at 600
      expect(await score.isInitialized(aliceAddr)).to.be.true
      expect(await score.getScore(aliceAddr)).to.equal(600n)

      // ── Step 2: Alice opens a credit line ──────────────────────────────────
      await vault.connect(alice).approve(await credit.getAddress(), shares)
      await credit.connect(alice).openCreditLine(await vault.getAddress(), shares)

      // Vault shares must be held by credit contract, NOT alice
      expect(await vault.balanceOf(aliceAddr)).to.equal(0n)
      expect(await vault.balanceOf(await credit.getAddress())).to.equal(shares)

      // Collateral must be non-zero (C-01 fix verification)
      const collateralUSD = await credit.getCollateralValueUSD(aliceAddr)
      expect(collateralUSD).to.be.gt(0n, 'C-01: collateral must be non-zero after openCreditLine')
      expect(collateralUSD).to.be.gte(500n * ONE_USDC, 'Must meet $500 minimum')

      const cl = await credit.getCreditLine(aliceAddr)
      expect(cl.active).to.be.true
      expect(cl.principal).to.equal(0n)

      // ── Step 3: Alice borrows ──────────────────────────────────────────────
      const usdcBefore = await usdc.balanceOf(aliceAddr)
      await credit.connect(alice).borrow(BORROW)
      const usdcAfter = await usdc.balanceOf(aliceAddr)

      expect(usdcAfter - usdcBefore).to.equal(BORROW, 'Alice should receive borrowed USDC')

      const clAfterBorrow = await credit.getCreditLine(aliceAddr)
      expect(clAfterBorrow.principal).to.equal(BORROW)
      expect(clAfterBorrow.lastBorrowAt).to.be.gt(0n, 'lastBorrowAt must be set')

      const ltv = await credit.getLTV(aliceAddr)
      expect(ltv).to.be.gt(0n).and.to.be.lte(5000n, 'LTV must be within 50% limit')

      // ── Step 4: Some time passes (interest accrues) ────────────────────────
      await advanceTime(30 * 24 * 3600) // 30 days — still within on-time window
      await priceFeed.setPrice(INITIAL_PRICE) // refresh to avoid stale price

      const debt = await credit.getCurrentDebt(aliceAddr)
      expect(debt).to.be.gte(BORROW, 'Debt should have grown with interest')

      // ── Step 5: Alice repays in full (within 30 days → REPAY_ONTIME) ───────
      // Approve extra to cover any interest that accrues between this call and repay()
      await usdc.connect(alice).approve(await credit.getAddress(), debt * 2n)
      await credit.connect(alice).repay(ethers.MaxUint256) // contract caps to currentDebt

      const clAfterRepay = await credit.getCreditLine(aliceAddr)
      expect(clAfterRepay.principal).to.equal(0n, 'Principal must be zero after full repay')
      expect(await credit.getCurrentDebt(aliceAddr)).to.equal(0n)

      // ── Step 6: Alice closes the credit line ──────────────────────────────
      await credit.connect(alice).closeCreditLine()

      // Shares must be returned to Alice
      const sharesReturned = await vault.balanceOf(aliceAddr)
      expect(sharesReturned).to.equal(shares, 'Alice should get her shares back')

      const clClosed = await credit.getCreditLine(aliceAddr)
      expect(clClosed.active).to.be.false

      // ── Step 7: Alice redeems vault shares for USDC ────────────────────────
      await vault.connect(alice).redeem(sharesReturned, aliceAddr, aliceAddr)
      const finalBalance = await usdc.balanceOf(aliceAddr)

      // Alice should have roughly her original balance minus interest paid
      // (she started with DEPOSIT * 10, deposited DEPOSIT, borrowed BORROW, repaid debt)
      expect(finalBalance).to.be.gt(0n)

      // Score should have improved from repayment
      const finalScore = await score.getScore(aliceAddr)
      expect(finalScore).to.be.gte(600n, 'Score should be at least initial after clean repayment')
    })

    it('Available credit decreases after borrow, increases after repay', async () => {
      await aliceDepositsAndOpensCreditLine()
      const aliceAddr = await alice.getAddress()

      const availableBefore = await credit.getAvailableCredit(aliceAddr)
      expect(availableBefore).to.be.gt(0n)

      await credit.connect(alice).borrow(BORROW)
      const availableAfterBorrow = await credit.getAvailableCredit(aliceAddr)
      expect(availableAfterBorrow).to.be.lt(availableBefore, 'Available credit must decrease after borrow')

      // Repay half
      const halfBorrow = BORROW / 2n
      await usdc.connect(alice).approve(await credit.getAddress(), halfBorrow)
      await credit.connect(alice).repay(halfBorrow)

      const availableAfterRepay = await credit.getAvailableCredit(aliceAddr)
      expect(availableAfterRepay).to.be.gt(availableAfterBorrow, 'Available credit must increase after partial repay')
    })

    it('Interest accrues at ~10% APR', async () => {
      await aliceDepositsAndOpensCreditLine()
      const aliceAddr = await alice.getAddress()

      await credit.connect(alice).borrow(BORROW)

      // Advance 1 year (refresh price feed to avoid staleness)
      await advanceTime(365 * 24 * 3600)
      await priceFeed.setPrice(INITIAL_PRICE)

      const debt = await credit.getCurrentDebt(aliceAddr)
      const interest = debt - BORROW

      // 10% APR on $4,000 = $400. Allow ±1% tolerance
      const expectedInterest = BORROW / 10n  // $400
      expect(interest).to.be.gte(expectedInterest * 99n / 100n, 'Interest too low')
      expect(interest).to.be.lte(expectedInterest * 101n / 100n, 'Interest too high')
    })
  })

  // ─── Scenario 2: Liquidation ───────────────────────────────────────────────
  describe('Scenario 2: Liquidation after price crash', () => {
    it('Bob liquidates Alice after USDC price crashes to $0.50', async () => {
      const aliceAddr     = await alice.getAddress()
      const liquidatorAddr = await liquidator.getAddress()

      // Alice deposits $10,000 and borrows $4,000 (40% LTV)
      await aliceDepositsAndOpensCreditLine()
      await credit.connect(alice).borrow(BORROW)

      // Confirm position is healthy
      expect(await credit.getLTV(aliceAddr)).to.be.lte(5000n)

      // Price crashes: USDC drops to $0.50 (collateral value halved)
      // At $5,000 collateral and $4,000 debt → 80% LTV → above 105% ratio threshold
      await priceFeed.setPrice(50_000_000n) // $0.50

      const collateralAfterCrash = await credit.getCollateralValueUSD(aliceAddr)
      const debt = await credit.getCurrentDebt(aliceAddr)

      // Collateral ($5,000) / debt ($4,000) = 125% ... still above 105% liquidation threshold
      // Drop further to $0.38 to ensure liquidation is triggered
      await priceFeed.setPrice(38_000_000n) // $0.38 → collateral ≈ $3,800 vs $4,000 debt → below 105%

      // Verify position is now liquidatable
      const healthStatus = await credit.getHealthStatus(aliceAddr)
      // HealthStatus enum: HEALTHY=0, WARNING=1, CRITICAL=2, AT_RISK=3, LIQUIDATABLE=4
      expect(Number(healthStatus)).to.equal(4, 'Position should be liquidatable')

      const debtAtLiquidation = await credit.getCurrentDebt(aliceAddr)

      // Liquidator approves and liquidates (approve extra to cover 1-block interest accrual)
      await usdc.connect(liquidator).approve(await credit.getAddress(), debtAtLiquidation * 2n)
      await credit.connect(liquidator).liquidate(aliceAddr)

      // Credit line closed
      const clAfter = await credit.getCreditLine(aliceAddr)
      expect(clAfter.active).to.be.false
      expect(clAfter.principal).to.equal(0n)

      // Liquidator received vault shares (with 5% bonus)
      const liquidatorShares = await vault.balanceOf(liquidatorAddr)
      expect(liquidatorShares).to.be.gt(0n, 'Liquidator should have received shares')

      // Alice's score should be penalized (LIQUIDATION event)
      const aliceScore = await score.getScore(aliceAddr)
      expect(aliceScore).to.be.lt(600n, 'Score should drop after liquidation')
    })

    it('Cannot liquidate a healthy position', async () => {
      await aliceDepositsAndOpensCreditLine()
      await credit.connect(alice).borrow(BORROW)

      // Position is healthy — liquidation should revert
      await usdc.connect(liquidator).approve(await credit.getAddress(), BORROW)
      await expect(
        credit.connect(liquidator).liquidate(await alice.getAddress())
      ).to.be.revertedWith('ZeroXCredit: position not liquidatable')
    })

    it('Cannot self-liquidate', async () => {
      await aliceDepositsAndOpensCreditLine()
      await credit.connect(alice).borrow(BORROW)

      await priceFeed.setPrice(38_000_000n)

      await usdc.connect(alice).approve(await credit.getAddress(), BORROW * 2n)
      await expect(
        credit.connect(alice).liquidate(await alice.getAddress())
      ).to.be.revertedWith('ZeroXCredit: cannot self-liquidate')
    })
  })

  // ─── Scenario 3: Multi-user ────────────────────────────────────────────────
  describe('Scenario 3: Multiple users interact independently', () => {
    it('Alice and Bob can have independent credit lines', async () => {
      const aliceAddr = await alice.getAddress()
      const bobAddr   = await bob.getAddress()

      // Alice opens credit line
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT)
      await vault.connect(alice).deposit(DEPOSIT, aliceAddr)
      const aliceShares = await vault.balanceOf(aliceAddr)
      await vault.connect(alice).approve(await credit.getAddress(), aliceShares)
      await credit.connect(alice).openCreditLine(await vault.getAddress(), aliceShares)

      // Bob opens credit line
      await usdc.connect(bob).approve(await vault.getAddress(), DEPOSIT)
      await vault.connect(bob).deposit(DEPOSIT, bobAddr)
      const bobShares = await vault.balanceOf(bobAddr)
      await vault.connect(bob).approve(await credit.getAddress(), bobShares)
      await credit.connect(bob).openCreditLine(await vault.getAddress(), bobShares)

      // Both borrow
      await credit.connect(alice).borrow(BORROW)
      await credit.connect(bob).borrow(BORROW / 2n)

      // Alice's debt is ~2x Bob's
      const aliceDebt = await credit.getCurrentDebt(aliceAddr)
      const bobDebt   = await credit.getCurrentDebt(bobAddr)
      expect(aliceDebt).to.be.gte(bobDebt, 'Alice borrowed more than Bob')

      // Total principal tracked correctly
      expect(await credit.totalPrincipal()).to.equal(BORROW + BORROW / 2n)
    })

    it('Score tracks each user independently', async () => {
      const aliceAddr = await alice.getAddress()
      const bobAddr   = await bob.getAddress()

      // Alice: 5 perfect repayments
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT)
      await vault.connect(alice).deposit(DEPOSIT, aliceAddr)
      const aliceShares = await vault.balanceOf(aliceAddr)
      await vault.connect(alice).approve(await credit.getAddress(), aliceShares)
      await credit.connect(alice).openCreditLine(await vault.getAddress(), aliceShares)

      for (let i = 0; i < 5; i++) {
        await credit.connect(alice).borrow(100n * ONE_USDC)
        const debt = await credit.getCurrentDebt(aliceAddr)
        await usdc.connect(alice).approve(await credit.getAddress(), debt * 2n)
        await credit.connect(alice).repay(ethers.MaxUint256)
      }

      // Bob: no activity
      await usdc.connect(bob).approve(await vault.getAddress(), DEPOSIT)
      await vault.connect(bob).deposit(DEPOSIT, bobAddr)
      // Bob just deposits, no credit line

      const aliceScore = await score.getScore(aliceAddr)
      const bobScore   = await score.getScore(bobAddr)

      // Alice should have a better or equal score from repayments
      expect(aliceScore).to.be.gte(bobScore, 'Alice should have at least as good a score as Bob')
    })
  })

  // ─── Scenario 4: Late Repayment ────────────────────────────────────────────
  describe('Scenario 4: Late repayment scoring (H-01 fix)', () => {
    it('Repayment within 30 days of borrow is on-time even with old credit line', async () => {
      const aliceAddr = await alice.getAddress()

      // Alice opens credit line
      await aliceDepositsAndOpensCreditLine()

      // Wait 60 days before borrowing (credit line is "old")
      await advanceTime(60 * 24 * 3600)
      // Refresh price feed after time advance to avoid staleness check failure
      await priceFeed.setPrice(INITIAL_PRICE)

      // Borrow now — lastBorrowAt is set to current time
      await credit.connect(alice).borrow(BORROW)

      const cl = await credit.getCreditLine(aliceAddr)
      const lastBorrowAt = cl.lastBorrowAt

      // Repay within 20 days of borrow (still on-time)
      await advanceTime(20 * 24 * 3600)

      const debt = await credit.getCurrentDebt(aliceAddr)
      await usdc.connect(alice).approve(await credit.getAddress(), debt * 2n)

      // Listen for ScoreUpdated — repay emits score event
      await expect(
        credit.connect(alice).repay(ethers.MaxUint256)
      ).to.emit(score, 'ScoreUpdated')

      // Score data: onTimeRepayments should have incremented
      const scoreData = await score.getScoreData(aliceAddr)
      expect(scoreData.onTimeRepayments).to.equal(1n, 'Should be counted as on-time')
    })

    it('Repayment after 31+ days from borrow is late (regardless of credit line age)', async () => {
      const aliceAddr = await alice.getAddress()

      await aliceDepositsAndOpensCreditLine()
      await credit.connect(alice).borrow(BORROW)

      // Wait 35 days — past the 30-day window from borrow
      await advanceTime(35 * 24 * 3600)
      // Refresh price feed after time advance to avoid staleness check failure
      await priceFeed.setPrice(INITIAL_PRICE)

      const debt = await credit.getCurrentDebt(aliceAddr)
      await usdc.connect(alice).approve(await credit.getAddress(), debt * 2n)
      await credit.connect(alice).repay(ethers.MaxUint256)

      const scoreData = await score.getScoreData(aliceAddr)
      expect(scoreData.onTimeRepayments).to.equal(0n, 'Should NOT be counted as on-time')
      expect(scoreData.totalRepayments).to.equal(1n, 'Should still count as a repayment')
    })
  })

  // ─── Scenario 5: Add Collateral ────────────────────────────────────────────
  describe('Scenario 5: Add collateral to improve health factor', () => {
    it('Adding collateral lowers LTV and improves health', async () => {
      const aliceAddr = await alice.getAddress()

      await aliceDepositsAndOpensCreditLine()
      await credit.connect(alice).borrow(BORROW)

      const ltvBefore = await credit.getLTV(aliceAddr)

      // Alice deposits more and adds collateral
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT)
      await vault.connect(alice).deposit(DEPOSIT, aliceAddr)
      const newShares = await vault.balanceOf(aliceAddr)
      await vault.connect(alice).approve(await credit.getAddress(), newShares)
      await credit.connect(alice).addCollateral(newShares)

      const ltvAfter = await credit.getLTV(aliceAddr)
      expect(ltvAfter).to.be.lt(ltvBefore, 'LTV should decrease after adding collateral')
    })
  })

  // ─── Scenario 6: Emergency Pause ──────────────────────────────────────────
  describe('Scenario 6: Emergency pause halts protocol operations', () => {
    it('Pausing vault blocks deposits', async () => {
      await vault.connect(owner).pause()

      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT)
      await expect(
        vault.connect(alice).deposit(DEPOSIT, await alice.getAddress())
      ).to.be.revertedWithCustomError(vault, 'EnforcedPause')
    })

    it('Pausing credit blocks borrowing', async () => {
      await aliceDepositsAndOpensCreditLine()
      await credit.connect(owner).pause()

      await expect(
        credit.connect(alice).borrow(BORROW)
      ).to.be.revertedWithCustomError(credit, 'EnforcedPause')
    })

    it('Unpausing restores full functionality', async () => {
      await credit.connect(owner).pause()
      await credit.connect(owner).unpause()

      await aliceDepositsAndOpensCreditLine()
      await expect(
        credit.connect(alice).borrow(BORROW)
      ).to.not.be.reverted
    })
  })

  // ─── Scenario 7: Score Bounds ─────────────────────────────────────────────
  describe('Scenario 7: Score stays within [300, 850] throughout lifecycle', () => {
    it('Score never exceeds 850 after many perfect repayments', async () => {
      const aliceAddr = await alice.getAddress()
      await aliceDepositsAndOpensCreditLine()

      for (let i = 0; i < 20; i++) {
        await credit.connect(alice).borrow(100n * ONE_USDC)
        const debt = await credit.getCurrentDebt(aliceAddr)
        await usdc.connect(alice).approve(await credit.getAddress(), debt * 2n)
        await credit.connect(alice).repay(ethers.MaxUint256)
      }

      expect(await score.getScore(aliceAddr)).to.be.lte(850n)
    })

    it('Score never drops below 300 after catastrophic liquidations', async () => {
      const aliceAddr     = await alice.getAddress()
      const liquidatorAddr = await liquidator.getAddress()

      // Repeatedly open credit lines, borrow, crash price, get liquidated
      // (3 rounds max since each time we need a new deposit)
      for (let round = 0; round < 3; round++) {
        // Alice gets fresh USDC from bob for each round
        await usdc.mint(aliceAddr, DEPOSIT)

        // If previous credit line was closed, Alice can open a new one
        const cl = await credit.getCreditLine(aliceAddr)
        if (!cl.active) {
          await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT)
          await vault.connect(alice).deposit(DEPOSIT, aliceAddr)
          const shares = await vault.balanceOf(aliceAddr)
          await vault.connect(alice).approve(await credit.getAddress(), shares)
          await credit.connect(alice).openCreditLine(await vault.getAddress(), shares)
        }

        await credit.connect(alice).borrow(BORROW)

        // Crash price → trigger liquidation
        await priceFeed.setPrice(38_000_000n)
        const debt = await credit.getCurrentDebt(aliceAddr)
        await usdc.connect(liquidator).approve(await credit.getAddress(), debt * 2n)
        await credit.connect(liquidator).liquidate(aliceAddr)

        // Restore price for next round
        await priceFeed.setPrice(INITIAL_PRICE)
      }

      expect(await score.getScore(aliceAddr)).to.be.gte(300n, 'Score must stay ≥ 300')
    })
  })
})
