import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { Signer } from 'ethers'
import type { ZeroXScore } from '../../typechain-types'

describe('ZeroXScore', () => {
  let owner: Signer
  let vaultUpdater: Signer
  let scoreUpdater: Signer
  let alice: Signer
  let bob: Signer
  let attacker: Signer

  let score: ZeroXScore

  const CreditEventType = {
    DEPOSIT:            0,
    WITHDRAWAL:         1,
    BORROW:             2,
    REPAY_ONTIME:       3,
    REPAY_LATE:         4,
    LIQUIDATION:        5,
    COLLATERAL_ADDED:   6,
    CREDIT_LINE_OPENED: 7,
    CREDIT_LINE_CLOSED: 8,
  }

  async function deploy() {
    ;[owner, vaultUpdater, scoreUpdater, alice, bob, attacker] = await ethers.getSigners()
    const ScoreF = await ethers.getContractFactory('ZeroXScore')
    score = await ScoreF.deploy(await owner.getAddress())
    await score.connect(owner).setVaultAuthorized(await vaultUpdater.getAddress(), true)
    await score.connect(owner).setScoreUpdater(await scoreUpdater.getAddress())
  }

  beforeEach(deploy)

  // ─── initializeScore ─────────────────────────────────────────────────────────
  describe('initializeScore', () => {
    it('initializes score to 600', async () => {
      await score.connect(vaultUpdater).initializeScore(await alice.getAddress())
      expect(await score.getScore(await alice.getAddress())).to.equal(600n)
    })

    it('marks user as initialized', async () => {
      expect(await score.isInitialized(await alice.getAddress())).to.be.false
      await score.connect(vaultUpdater).initializeScore(await alice.getAddress())
      expect(await score.isInitialized(await alice.getAddress())).to.be.true
    })

    it('is idempotent — second call does nothing', async () => {
      await score.connect(vaultUpdater).initializeScore(await alice.getAddress())
      await score.connect(vaultUpdater).initializeScore(await alice.getAddress())
      expect(await score.getScore(await alice.getAddress())).to.equal(600n)
    })

    it('emits ScoreInitialized event', async () => {
      await expect(score.connect(vaultUpdater).initializeScore(await alice.getAddress()))
        .to.emit(score, 'ScoreInitialized')
        .withArgs(await alice.getAddress(), 600n)
    })

    it('reverts for unauthorized caller', async () => {
      await expect(score.connect(attacker).initializeScore(await alice.getAddress()))
        .to.be.revertedWith('ZeroXScore: unauthorized vault caller')
    })

    it('returns 0 for uninitialized user', async () => {
      expect(await score.getScore(await alice.getAddress())).to.equal(0n)
    })
  })

  // ─── recordEvent ─────────────────────────────────────────────────────────────
  describe('recordEvent', () => {
    beforeEach(async () => {
      await score.connect(vaultUpdater).initializeScore(await alice.getAddress())
    })

    it('REPAY_ONTIME increments both counters', async () => {
      await score.connect(scoreUpdater).recordEvent(await alice.getAddress(), CreditEventType.REPAY_ONTIME, 1000n)
      const data = await score.getScoreData(await alice.getAddress())
      expect(data.totalRepayments).to.equal(1n)
      expect(data.onTimeRepayments).to.equal(1n)
    })

    it('REPAY_LATE increments totalRepayments only', async () => {
      await score.connect(scoreUpdater).recordEvent(await alice.getAddress(), CreditEventType.REPAY_LATE, 1000n)
      const data = await score.getScoreData(await alice.getAddress())
      expect(data.totalRepayments).to.equal(1n)
      expect(data.onTimeRepayments).to.equal(0n)
    })

    it('LIQUIDATION increments liquidationCount and decreases score', async () => {
      const scoreBefore = await score.getScore(await alice.getAddress())
      await score.connect(scoreUpdater).recordEvent(await alice.getAddress(), CreditEventType.LIQUIDATION, 5000n)
      const data = await score.getScoreData(await alice.getAddress())
      expect(data.liquidationCount).to.equal(1n)
      expect(await score.getScore(await alice.getAddress())).to.be.lt(scoreBefore)
    })

    it('multiple REPAY_ONTIME events improve score', async () => {
      const scoreBefore = await score.getScore(await alice.getAddress())
      for (let i = 0; i < 10; i++) {
        await score.connect(scoreUpdater).recordEvent(await alice.getAddress(), CreditEventType.REPAY_ONTIME, 500n)
      }
      const scoreAfter = await score.getScore(await alice.getAddress())
      expect(scoreAfter).to.be.gte(scoreBefore)
    })

    it('emits ScoreUpdated event', async () => {
      await expect(
        score.connect(scoreUpdater).recordEvent(await alice.getAddress(), CreditEventType.REPAY_ONTIME, 1000n)
      ).to.emit(score, 'ScoreUpdated')
    })

    it('reverts for uninitialized user', async () => {
      await expect(
        score.connect(scoreUpdater).recordEvent(await bob.getAddress(), CreditEventType.DEPOSIT, 1000n)
      ).to.be.revertedWith('ZeroXScore: user not initialized')
    })

    it('reverts for unauthorized caller', async () => {
      await expect(
        score.connect(attacker).recordEvent(await alice.getAddress(), CreditEventType.DEPOSIT, 100n)
      ).to.be.revertedWith('ZeroXScore: unauthorized caller')
    })
  })

  // ─── Score Bounds ─────────────────────────────────────────────────────────────
  describe('Score Bounds [300, 850]', () => {
    beforeEach(async () => {
      await score.connect(vaultUpdater).initializeScore(await alice.getAddress())
    })

    it('score never drops below 300 after multiple liquidations', async () => {
      for (let i = 0; i < 20; i++) {
        try {
          await score.connect(scoreUpdater).recordEvent(await alice.getAddress(), CreditEventType.LIQUIDATION, 10000n)
        } catch { break }
      }
      expect(await score.getScore(await alice.getAddress())).to.be.gte(300n)
    })

    it('score never exceeds 850 after many perfect repayments', async () => {
      for (let i = 0; i < 50; i++) {
        await score.connect(scoreUpdater).recordEvent(await alice.getAddress(), CreditEventType.REPAY_ONTIME, 500n)
      }
      expect(await score.getScore(await alice.getAddress())).to.be.lte(850n)
    })
  })

  // ─── getRiskTier ─────────────────────────────────────────────────────────────
  describe('getRiskTier', () => {
    const cases: Array<[number, string]> = [
      [850, 'EXCELLENT'], [750, 'EXCELLENT'],
      [749, 'VERY_GOOD'], [700, 'VERY_GOOD'],
      [699, 'GOOD'],      [650, 'GOOD'],
      [649, 'FAIR'],      [580, 'FAIR'],
      [579, 'POOR'],      [300, 'POOR'],
    ]

    for (const [s, expected] of cases) {
      it(`${s} → ${expected}`, async () => {
        expect(await score.getRiskTier(s)).to.equal(expected)
      })
    }
  })

  // ─── updatePositionSignals ────────────────────────────────────────────────────
  describe('updatePositionSignals', () => {
    beforeEach(async () => {
      await score.connect(vaultUpdater).initializeScore(await alice.getAddress())
    })

    it('0% utilization gives maximum utilization signal', async () => {
      await score.connect(scoreUpdater).updatePositionSignals(await alice.getAddress(), 0n, 5000n, 20000n)
      const data = await score.getScoreData(await alice.getAddress())
      expect(data.utilizationSignal).to.equal(10000n)
    })

    it('100% utilization gives 0 utilization signal', async () => {
      await score.connect(scoreUpdater).updatePositionSignals(await alice.getAddress(), 5000n, 5000n, 10500n)
      const data = await score.getScoreData(await alice.getAddress())
      expect(data.utilizationSignal).to.equal(0n)
    })

    it('emits SignalsUpdated', async () => {
      await expect(
        score.connect(scoreUpdater).updatePositionSignals(await alice.getAddress(), 0n, 5000n, 20000n)
      ).to.emit(score, 'SignalsUpdated')
    })

    it('silently ignores uninitialized user', async () => {
      await expect(
        score.connect(scoreUpdater).updatePositionSignals(await bob.getAddress(), 0n, 5000n, 20000n)
      ).to.not.be.reverted
    })
  })

  // ─── Access Control ──────────────────────────────────────────────────────────
  describe('Access Control', () => {
    it('only owner can pause', async () => {
      await expect(score.connect(alice).pause()).to.be.revertedWithCustomError(
        score, 'OwnableUnauthorizedAccount'
      )
    })

    it('pausing blocks initializeScore', async () => {
      await score.connect(owner).pause()
      await expect(
        score.connect(vaultUpdater).initializeScore(await alice.getAddress())
      ).to.be.revertedWithCustomError(score, 'EnforcedPause')
    })

    it('only owner can set scoreUpdater', async () => {
      await expect(
        score.connect(alice).setScoreUpdater(await attacker.getAddress())
      ).to.be.revertedWithCustomError(score, 'OwnableUnauthorizedAccount')
    })
  })
})
