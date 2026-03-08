/**
 * E2E Tests — Full protocol lifecycle on local Hardhat network
 * Tests the complete user journey: deposit → score init → open credit → borrow → repay → withdraw
 */
import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'

describe('E2E: Full Protocol Lifecycle', function () {
  this.timeout(120_000)

  let owner: SignerWithAddress
  let alice: SignerWithAddress
  let bob: SignerWithAddress

  let usdc: any
  let mockBenqi: any
  let mockAave: any
  let mockAToken: any
  let mockFeed: any
  let vault: any
  let score: any
  let credit: any

  before(async () => {
    ;[owner, alice, bob] = await ethers.getSigners()

    // Deploy mock infrastructure
    const MockERC20 = await ethers.getContractFactory('MockERC20')
    usdc = await MockERC20.deploy('USD Coin', 'USDC', 6)

    const MockBenqi = await ethers.getContractFactory('MockBenqi')
    mockBenqi = await MockBenqi.deploy(await usdc.getAddress(), 'qiUSDC', 'qiUSDC')

    const mockATokenContract = await MockERC20.deploy('aUSDC', 'aUSDC', 6)
    mockAToken = mockATokenContract

    const MockAavePool = await ethers.getContractFactory('MockAavePool')
    mockAave = await MockAavePool.deploy(await usdc.getAddress(), await mockAToken.getAddress())
    await mockAave.setAToken(await usdc.getAddress(), await mockAToken.getAddress())

    const MockFeed = await ethers.getContractFactory('MockChainlinkFeed')
    mockFeed = await MockFeed.deploy(100000000n, 8) // $1.00

    // Deploy protocol
    const Score = await ethers.getContractFactory('ZeroXScore')
    score = await Score.deploy(owner.address)

    const Vault = await ethers.getContractFactory('ZeroXVault')
    vault = await Vault.deploy(
      await usdc.getAddress(),
      'ZeroX USDC Vault',
      'zxUSDC',
      await mockFeed.getAddress(),
      await mockAave.getAddress(),
      await mockBenqi.getAddress(),
      await mockAToken.getAddress(),
      owner.address, // feeRecipient
      owner.address  // owner
    )

    const Credit = await ethers.getContractFactory('ZeroXCredit')
    credit = await Credit.deploy(
      await usdc.getAddress(),
      await score.getAddress(),
      owner.address
    )

    // Wire contracts
    await score.setScoreUpdater(await credit.getAddress())
    await score.setVaultAuthorized(await vault.getAddress(), true)
    await vault.setScoreContract(await score.getAddress())
    await credit.addAllowedVault(await vault.getAddress())
    await credit.setTreasury(owner.address)

    // Mint USDC to users
    await usdc.mint(alice.address, ethers.parseUnits('10000', 6))
    await usdc.mint(bob.address, ethers.parseUnits('5000', 6))

    // Fund credit reserve
    await usdc.mint(owner.address, ethers.parseUnits('50000', 6))
    await usdc.connect(owner).approve(await credit.getAddress(), ethers.parseUnits('50000', 6))
    await credit.fundReserve(ethers.parseUnits('50000', 6))
  })

  describe('Step 1: Vault Deposit', () => {
    it('Alice deposits 1000 USDC and receives vault shares', async () => {
      const depositAmount = ethers.parseUnits('1000', 6)
      await usdc.connect(alice).approve(await vault.getAddress(), depositAmount)
      await vault.connect(alice).deposit(depositAmount, alice.address)

      const shares = await vault.balanceOf(alice.address)
      expect(shares).to.be.gt(0n)

      const totalAssets = await vault.totalAssets()
      expect(totalAssets).to.be.gte(depositAmount)
    })

    it('Bob deposits 500 USDC', async () => {
      const depositAmount = ethers.parseUnits('500', 6)
      await usdc.connect(bob).approve(await vault.getAddress(), depositAmount)
      await vault.connect(bob).deposit(depositAmount, bob.address)

      const shares = await vault.balanceOf(bob.address)
      expect(shares).to.be.gt(0n)
    })
  })

  describe('Step 2: Score Initialization', () => {
    it('Alice score is initialized after vault deposit', async () => {
      const scoreData = await score.getScoreData(alice.address)
      // Score should be initialized (600 default)
      expect(scoreData.score).to.equal(600)
    })
  })

  describe('Step 3: Credit Line', () => {
    it('Alice opens a credit line using vault shares as collateral', async () => {
      const aliceShares = await vault.balanceOf(alice.address)
      const collateralShares = aliceShares / 2n // Use half

      // Approve credit contract to transfer vault shares
      await vault.connect(alice).approve(await credit.getAddress(), collateralShares)

      await credit.connect(alice).openCreditLine(
        await vault.getAddress(),
        collateralShares
      )

      const cl = await credit.getCreditLine(alice.address)
      expect(cl.collateralShares).to.equal(collateralShares)
      expect(cl.active).to.be.true
    })

    it('Alice borrows against her credit line', async () => {
      const borrowAmount = ethers.parseUnits('100', 6)
      const aliceBalBefore = await usdc.balanceOf(alice.address)

      await credit.connect(alice).borrow(borrowAmount)

      const aliceBalAfter = await usdc.balanceOf(alice.address)
      expect(aliceBalAfter - aliceBalBefore).to.equal(borrowAmount)
    })

    it('Alice repays her loan', async () => {
      // Approve a generous amount to cover principal + any accrued interest
      const repayAmount = ethers.parseUnits('200', 6)
      await usdc.connect(alice).approve(await credit.getAddress(), repayAmount)
      await credit.connect(alice).repay(repayAmount)

      const clAfter = await credit.getCreditLine(alice.address)
      expect(clAfter.principal).to.equal(0n)
    })

    it('Alice closes her credit line and gets collateral back', async () => {
      const sharesBefore = await vault.balanceOf(alice.address)

      // closeCreditLine may require repaying any remaining interest
      // Approve extra USDC just in case
      await usdc.connect(alice).approve(await credit.getAddress(), ethers.parseUnits('100', 6))
      await credit.connect(alice).closeCreditLine()
      const sharesAfter = await vault.balanceOf(alice.address)

      expect(sharesAfter).to.be.gt(sharesBefore)

      const cl = await credit.getCreditLine(alice.address)
      expect(cl.active).to.be.false
    })
  })

  describe('Step 4: Vault Withdrawal', () => {
    it('Alice withdraws her vault deposit', async () => {
      const shares = await vault.balanceOf(alice.address)
      const usdcBefore = await usdc.balanceOf(alice.address)

      await vault.connect(alice).redeem(shares, alice.address, alice.address)

      const usdcAfter = await usdc.balanceOf(alice.address)
      expect(usdcAfter).to.be.gt(usdcBefore)
      expect(await vault.balanceOf(alice.address)).to.equal(0n)
    })
  })

  describe('Step 5: Fee Harvest', () => {
    it('harvestYield returns 0 when no yield accrued', async () => {
      const tx = await vault.harvestYield()
      const receipt = await tx.wait()
      // Should not revert, just return 0
      expect(receipt.status).to.equal(1)
    })
  })

  describe('Step 6: Access Control', () => {
    it('non-owner cannot pause vault', async () => {
      await expect(vault.connect(alice).pause()).to.be.reverted
    })

    it('non-owner cannot set fee recipient', async () => {
      await expect(vault.connect(alice).setFeeRecipient(alice.address)).to.be.reverted
    })

    it('non-owner cannot set treasury on credit', async () => {
      await expect(credit.connect(alice).setTreasury(alice.address)).to.be.reverted
    })

    it('non-owner cannot add allowed vault', async () => {
      await expect(credit.connect(alice).addAllowedVault(alice.address)).to.be.reverted
    })
  })

  describe('Step 7: Edge Cases', () => {
    it('cannot borrow without an active credit line', async () => {
      await expect(
        credit.connect(bob).borrow(ethers.parseUnits('100', 6))
      ).to.be.reverted
    })

    it('cannot open credit line with 0 collateral', async () => {
      await expect(
        credit.connect(bob).openCreditLine(await vault.getAddress(), 0n)
      ).to.be.reverted
    })

    it('vault share price is approximately 1:1', async () => {
      // Vault has _decimalsOffset=6, so shares have 12 decimals (6 asset + 6 offset)
      // 1e12 shares should convert to ~1e6 assets (1 USDC)
      const oneShare = 10n ** 12n
      const assets = await vault.convertToAssets(oneShare)
      // Should be approximately 1 USDC (1e6)
      expect(assets).to.be.gte(ethers.parseUnits('0.99', 6))
      expect(assets).to.be.lte(ethers.parseUnits('1.01', 6))
    })
  })
})
