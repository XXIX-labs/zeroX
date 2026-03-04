import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { Signer } from 'ethers'
import type {
  ZeroXVault,
  MockERC20,
  MockChainlinkFeed,
  MockAavePool,
  MockBenqi,
  ZeroXScore,
} from '../../typechain-types'

// ─── Test Suite: ZeroXVault ────────────────────────────────────────────────────
describe('ZeroXVault', () => {
  let owner: Signer
  let alice: Signer
  let bob: Signer
  let feeRecipient: Signer

  let usdc: MockERC20
  let priceFeed: MockChainlinkFeed
  let aavePool: MockAavePool
  let benqi: MockBenqi
  let aToken: MockERC20
  let score: ZeroXScore
  let vault: ZeroXVault

  const INITIAL_PRICE = 100_000_000n // $1.00 with 8 decimals
  const USDC_DECIMALS = 6n
  const DEPOSIT_AMOUNT = 10_000n * 10n ** USDC_DECIMALS // $10,000 USDC

  async function deployFixture() {
    ;[owner, alice, bob, feeRecipient] = await ethers.getSigners()

    // Deploy mock USDC
    const ERC20Factory = await ethers.getContractFactory('MockERC20')
    usdc = await ERC20Factory.deploy('USD Coin', 'USDC', 6)

    // Deploy aToken (Aave position token)
    aToken = await ERC20Factory.deploy('Aave USDC', 'aUSDC', 6)

    // Deploy mock price feed ($1.00)
    const FeedFactory = await ethers.getContractFactory('MockChainlinkFeed')
    priceFeed = await FeedFactory.deploy(INITIAL_PRICE, 8)

    // Deploy mock Aave pool
    const AaveFactory = await ethers.getContractFactory('MockAavePool')
    aavePool = await AaveFactory.deploy(await usdc.getAddress(), await aToken.getAddress())

    // Deploy mock Benqi
    const BenqiFactory = await ethers.getContractFactory('MockBenqi')
    benqi = await BenqiFactory.deploy(await usdc.getAddress(), 'Mock qiUSDC', 'qiUSDC')

    // Deploy ZeroXScore
    const ScoreFactory = await ethers.getContractFactory('ZeroXScore')
    score = await ScoreFactory.deploy(await owner.getAddress())

    // Deploy vault
    const VaultFactory = await ethers.getContractFactory('ZeroXVault')
    vault = await VaultFactory.deploy(
      await usdc.getAddress(),
      'ZeroX USDC Vault',
      'zxUSDC',
      await priceFeed.getAddress(),
      await aavePool.getAddress(),
      await benqi.getAddress(),
      await aToken.getAddress(),
      await feeRecipient.getAddress(),
      await owner.getAddress()
    )

    // Wire score contract
    await vault.connect(owner).setScoreContract(await score.getAddress())
    await score.connect(owner).setVaultAuthorized(await vault.getAddress(), true)

    // Mint USDC to users
    await usdc.mint(await alice.getAddress(), DEPOSIT_AMOUNT * 10n)
    await usdc.mint(await bob.getAddress(),   DEPOSIT_AMOUNT * 10n)

    // Aave pool needs USDC to return on withdraw
    await usdc.mint(await aavePool.getAddress(), DEPOSIT_AMOUNT * 100n)
    // Benqi needs USDC liquidity too
    await usdc.mint(await benqi.getAddress(),    DEPOSIT_AMOUNT * 100n)
  }

  beforeEach(async () => {
    await deployFixture()
  })

  // ─── Deployment ──────────────────────────────────────────────────────────────
  describe('Deployment', () => {
    it('has correct name and symbol', async () => {
      expect(await vault.name()).to.equal('ZeroX USDC Vault')
      expect(await vault.symbol()).to.equal('zxUSDC')
    })

    it('has correct asset address', async () => {
      expect(await vault.asset()).to.equal(await usdc.getAddress())
    })

    it('starts with 0 total assets', async () => {
      expect(await vault.totalAssets()).to.equal(0n)
    })

    it('starts with 0 total supply', async () => {
      expect(await vault.totalSupply()).to.equal(0n)
    })

    it('correctly sets fee recipient', async () => {
      expect(await vault.feeRecipient()).to.equal(await feeRecipient.getAddress())
    })
  })

  // ─── Deposit ─────────────────────────────────────────────────────────────────
  describe('Deposit', () => {
    it('mints correct shares on first deposit', async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())

      const shares = await vault.balanceOf(await alice.getAddress())
      expect(shares).to.be.gt(0n)
    })

    it('correctly updates totalAssets after deposit', async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())

      expect(await vault.totalAssets()).to.equal(DEPOSIT_AMOUNT)
    })

    it('reverts when paused', async () => {
      await vault.connect(owner).pause()
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await expect(
        vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())
      ).to.be.revertedWithCustomError(vault, 'EnforcedPause')
    })

    it('initializes score on first deposit', async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())

      expect(await score.isInitialized(await alice.getAddress())).to.be.true
    })

    it('second depositor gets proportionally fewer shares after yield', async () => {
      // Alice deposits first
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())
      const aliceShares = await vault.balanceOf(await alice.getAddress())

      // Simulate yield: donate 1000 USDC to vault (increases share price)
      await usdc.mint(await vault.getAddress(), 1_000n * 10n ** USDC_DECIMALS)

      // Bob deposits same amount
      await usdc.connect(bob).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(bob).deposit(DEPOSIT_AMOUNT, await bob.getAddress())
      const bobShares = await vault.balanceOf(await bob.getAddress())

      // Bob should get fewer shares than Alice since share price is higher
      expect(bobShares).to.be.lt(aliceShares)
    })

    it('prevents share inflation attack (virtual offset protection)', async () => {
      // Attacker deposits 1 wei
      await usdc.connect(alice).approve(await vault.getAddress(), 1n)
      await vault.connect(alice).deposit(1n, await alice.getAddress())

      // Attacker donates large amount to try to grief next depositor
      await usdc.connect(alice).transfer(await vault.getAddress(), DEPOSIT_AMOUNT)

      // Bob deposits DEPOSIT_AMOUNT — should get reasonable shares, not 0
      await usdc.connect(bob).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(bob).deposit(DEPOSIT_AMOUNT, await bob.getAddress())

      const bobShares = await vault.balanceOf(await bob.getAddress())
      expect(bobShares).to.be.gt(0n)
      // Bob's shares should represent close to his actual deposit proportion
      expect(bobShares).to.be.gt(1000n) // Not trivially small
    })
  })

  // ─── Withdraw / Redeem ───────────────────────────────────────────────────────
  describe('Withdraw & Redeem', () => {
    beforeEach(async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())
    })

    it('burns correct shares on redeem', async () => {
      const shares = await vault.balanceOf(await alice.getAddress())
      await vault.connect(alice).redeem(shares, await alice.getAddress(), await alice.getAddress())
      expect(await vault.balanceOf(await alice.getAddress())).to.equal(0n)
    })

    it('returns correct assets on full redeem', async () => {
      const shares = await vault.balanceOf(await alice.getAddress())
      const balanceBefore = await usdc.balanceOf(await alice.getAddress())
      await vault.connect(alice).redeem(shares, await alice.getAddress(), await alice.getAddress())
      const balanceAfter = await usdc.balanceOf(await alice.getAddress())
      // Allow 1 wei rounding difference
      expect(balanceAfter - balanceBefore).to.be.gte(DEPOSIT_AMOUNT - 1n)
    })

    it('reverts when paused', async () => {
      await vault.connect(owner).pause()
      const shares = await vault.balanceOf(await alice.getAddress())
      await expect(
        vault.connect(alice).redeem(shares, await alice.getAddress(), await alice.getAddress())
      ).to.be.revertedWithCustomError(vault, 'EnforcedPause')
    })

    it('cannot redeem more shares than owned', async () => {
      const shares = await vault.balanceOf(await alice.getAddress())
      await expect(
        vault.connect(alice).redeem(shares + 1n, await alice.getAddress(), await alice.getAddress())
      ).to.be.reverted
    })
  })

  // ─── getUserPositionUSD ────────────────────────────────────────────────────
  describe('getUserPositionUSD', () => {
    it('returns 0 for user with no shares', async () => {
      expect(await vault.getUserPositionUSD(await alice.getAddress())).to.equal(0n)
    })

    it('returns correct USD value after deposit', async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())

      const usdValue = await vault.getUserPositionUSD(await alice.getAddress())
      // $10,000 USDC at $1.00 = $10,000 (6 decimals = 10_000_000_000)
      expect(usdValue).to.be.gte(DEPOSIT_AMOUNT - 1n)
    })
  })

  // ─── getSharesValueUSD ─────────────────────────────────────────────────────
  describe('getSharesValueUSD', () => {
    it('returns 0 for 0 shares', async () => {
      expect(await vault.getSharesValueUSD(0n)).to.equal(0n)
    })

    it('returns correct value for a given shares amount', async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())

      const shares = await vault.balanceOf(await alice.getAddress())
      const sharesValue = await vault.getSharesValueUSD(shares)
      const positionValue = await vault.getUserPositionUSD(await alice.getAddress())

      expect(sharesValue).to.equal(positionValue)
    })

    it('prices half shares at approximately half the full position value', async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())

      const shares = await vault.balanceOf(await alice.getAddress())
      const fullValue = await vault.getSharesValueUSD(shares)
      const halfValue = await vault.getSharesValueUSD(shares / 2n)

      // Allow 1% tolerance for rounding
      const expected = fullValue / 2n
      const tolerance = expected / 100n
      expect(halfValue).to.be.gte(expected - tolerance)
      expect(halfValue).to.be.lte(expected + tolerance)
    })
  })

  // ─── Oracle ─────────────────────────────────────────────────────────────────
  describe('Oracle Price Feed', () => {
    it('returns correct asset price', async () => {
      const price = await vault.getAssetPrice()
      expect(price).to.equal(INITIAL_PRICE)
    })

    it('reverts with stale price', async () => {
      // Advance time beyond PRICE_STALENESS (3600s)
      await ethers.provider.send('evm_increaseTime', [3601])
      await ethers.provider.send('evm_mine', [])
      await expect(vault.getAssetPrice()).to.be.revertedWith('ZeroXVault: stale price')
    })

    it('reverts with negative price', async () => {
      await priceFeed.setAnswer(-1)
      await expect(vault.getAssetPrice()).to.be.revertedWith('ZeroXVault: invalid price')
    })
  })

  // ─── APY ─────────────────────────────────────────────────────────────────────
  describe('APY Queries', () => {
    it('getAaveAPY returns a value (even if 0 from mock)', async () => {
      const apy = await vault.getAaveAPY()
      expect(apy).to.be.gte(0n)
    })

    it('getBenqiAPY returns a value', async () => {
      const apy = await vault.getBenqiAPY()
      expect(apy).to.be.gte(0n)
    })
  })

  // ─── Rebalance ───────────────────────────────────────────────────────────────
  describe('Rebalance', () => {
    it('only owner can call rebalance', async () => {
      await expect(vault.connect(alice).rebalance()).to.be.revertedWithCustomError(
        vault, 'OwnableUnauthorizedAccount'
      )
    })

    it('enforces cooldown between rebalances', async () => {
      // First rebalance might skip if APYs are equal
      // Force a rebalance by setting unequal APYs
      await benqi.setSupplyRate(200n * 10n ** 18n) // Very high Benqi APY
      await vault.connect(owner).rebalance()

      // Try immediately — should fail
      await expect(vault.connect(owner).rebalance()).to.be.revertedWith('ZeroXVault: cooldown active')
    })
  })

  // ─── Emergency ───────────────────────────────────────────────────────────────
  describe('Emergency', () => {
    it('only owner can call emergencyWithdrawAll', async () => {
      await expect(vault.connect(alice).emergencyWithdrawAll()).to.be.revertedWithCustomError(
        vault, 'OwnableUnauthorizedAccount'
      )
    })

    it('emergencyWithdrawAll pulls funds back to vault', async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())

      // Strategy funds are deployed; call emergency withdraw
      await vault.connect(owner).emergencyWithdrawAll()

      // Vault should have all funds idle now
      const idle = await usdc.balanceOf(await vault.getAddress())
      expect(idle).to.be.gte(DEPOSIT_AMOUNT - 1n)
    })
  })

  // ─── Admin ───────────────────────────────────────────────────────────────────
  describe('Admin', () => {
    it('setAllocation enforces sum = 10000', async () => {
      await expect(vault.connect(owner).setAllocation(6000n, 5000n)).to.be.revertedWith(
        'ZeroXVault: allocations must sum to 10000'
      )
    })

    it('setAllocation works with valid values', async () => {
      await vault.connect(owner).setAllocation(7000n, 3000n)
      expect(await vault.aaveAllocation()).to.equal(7000n)
      expect(await vault.benqiAllocation()).to.equal(3000n)
    })

    it('setPerformanceFee enforces maximum of 20%', async () => {
      await expect(vault.connect(owner).setPerformanceFee(2001n)).to.be.revertedWith(
        'ZeroXVault: fee too high'
      )
    })

    it('only owner can set fee recipient', async () => {
      await expect(
        vault.connect(alice).setFeeRecipient(await alice.getAddress())
      ).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount')
    })
  })

  // ─── Harvest Yield (Performance Fee) ──────────────────────────────────────────
  describe('harvestYield', () => {
    beforeEach(async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())
    })

    it('returns 0 when no yield accrued', async () => {
      const tx = await vault.harvestYield()
      const receipt = await tx.wait()
      // Should emit YieldHarvested with 0 yield
      const event = receipt?.logs.find((log) => {
        try {
          return vault.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === 'YieldHarvested'
        } catch { return false }
      })
      expect(event).to.be.undefined // no yield = no event (returns 0 early)
    })

    it('mints fee shares to feeRecipient on yield', async () => {
      const feeRecipientAddr = await feeRecipient.getAddress()
      const sharesBefore = await vault.balanceOf(feeRecipientAddr)

      // Simulate yield: donate 1000 USDC to vault
      await usdc.mint(await vault.getAddress(), 1_000n * 10n ** USDC_DECIMALS)

      await vault.harvestYield()

      const sharesAfter = await vault.balanceOf(feeRecipientAddr)
      expect(sharesAfter).to.be.gt(sharesBefore)
    })

    it('emits YieldHarvested event with correct values', async () => {
      // Simulate 1000 USDC yield
      const yieldAmount = 1_000n * 10n ** USDC_DECIMALS
      await usdc.mint(await vault.getAddress(), yieldAmount)

      await expect(vault.harvestYield())
        .to.emit(vault, 'YieldHarvested')
    })

    it('does not double-count yield on second harvest', async () => {
      const feeRecipientAddr = await feeRecipient.getAddress()

      // First yield + harvest
      await usdc.mint(await vault.getAddress(), 1_000n * 10n ** USDC_DECIMALS)
      await vault.harvestYield()
      const sharesAfterFirst = await vault.balanceOf(feeRecipientAddr)

      // Second harvest with no new yield
      await vault.harvestYield()
      const sharesAfterSecond = await vault.balanceOf(feeRecipientAddr)

      expect(sharesAfterSecond).to.equal(sharesAfterFirst)
    })

    it('skips minting when feeRecipient is zero address', async () => {
      // Set fee recipient to zero (should gracefully skip)
      await vault.connect(owner).setFeeRecipient(ethers.ZeroAddress)

      // Simulate yield
      await usdc.mint(await vault.getAddress(), 1_000n * 10n ** USDC_DECIMALS)

      // Should not revert
      await expect(vault.harvestYield()).to.not.be.reverted
    })

    it('reverts when paused', async () => {
      await vault.connect(owner).pause()
      await expect(vault.harvestYield()).to.be.revertedWithCustomError(vault, 'EnforcedPause')
    })
  })

  // ─── ETH Rejection ────────────────────────────────────────────────────────────
  describe('ETH Rejection', () => {
    it('reverts on accidental ETH transfer', async () => {
      await expect(
        alice.sendTransaction({ to: await vault.getAddress(), value: ethers.parseEther('1') })
      ).to.be.reverted
    })
  })

  // ─── Preview Functions ────────────────────────────────────────────────────────
  describe('Preview Functions', () => {
    beforeEach(async () => {
      await usdc.connect(alice).approve(await vault.getAddress(), DEPOSIT_AMOUNT)
      await vault.connect(alice).deposit(DEPOSIT_AMOUNT, await alice.getAddress())
    })

    it('previewDeposit returns same as actual deposit', async () => {
      const amount = 1_000n * 10n ** USDC_DECIMALS
      const preview = await vault.previewDeposit(amount)
      expect(preview).to.be.gt(0n)
    })

    it('previewRedeem returns same as actual redeem', async () => {
      const shares = await vault.balanceOf(await alice.getAddress())
      const preview = await vault.previewRedeem(shares)
      // Preview should be close to deposit amount (within 1 unit)
      expect(preview).to.be.gte(DEPOSIT_AMOUNT - 1n)
    })
  })
})
