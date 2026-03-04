/**
 * deploy_fuji.ts — One-shot Fuji testnet deployment
 *
 * Deploys mock external dependencies (Benqi not on Fuji), then all protocol contracts.
 * Uses deployer as direct owner (no Registry multisig on testnet).
 *
 * Usage:
 *   npx hardhat run scripts/deploy/deploy_fuji.ts --network fuji
 *
 * Required .env:
 *   DEPLOYER_PRIVATE_KEY=0x...  (funded with Fuji AVAX from https://faucet.avax.network)
 *   FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
 */
import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'
import { FUJI } from '../utils/addresses'

const DEPLOYMENTS_DIR = path.resolve(__dirname, '../../deployments')

async function main() {
  if (network.name !== 'fuji' && network.name !== 'hardhat') {
    throw new Error(`This script is for Fuji testnet. Got: ${network.name}`)
  }

  const [deployer] = await ethers.getSigners()
  const balance = await ethers.provider.getBalance(deployer.address)

  console.log('\n========================================')
  console.log(' ZeroX Protocol — Fuji Testnet Deploy')
  console.log('========================================')
  console.log(`  Network:  ${network.name}`)
  console.log(`  Deployer: ${deployer.address}`)
  console.log(`  Balance:  ${ethers.formatEther(balance)} AVAX`)
  console.log('========================================\n')

  if (balance === 0n) {
    throw new Error('Deployer has 0 AVAX. Fund from https://faucet.avax.network')
  }

  const deployments: Record<string, { address: string; deployer: string; deployedAt: string }> = {}

  // ─── Step 1: Deploy Mock External Dependencies ────────────────────────────
  console.log('Step 1: Deploying mock external dependencies...\n')

  // On local Hardhat (no fork), deploy a mock USDC since Fuji addresses don't exist
  const MockERC20Factory = await ethers.getContractFactory('MockERC20')
  let usdcAddress = FUJI.USDC
  if (network.name === 'hardhat') {
    const mockUsdc = await MockERC20Factory.deploy('USD Coin', 'USDC', 6)
    await mockUsdc.waitForDeployment()
    usdcAddress = await mockUsdc.getAddress()
    console.log(`  MockUSDC:          ${usdcAddress} (local only)`)
    save(deployments, 'MockUSDC', usdcAddress, deployer.address)
  }

  // Mock Benqi qiUSDC (Benqi is not deployed on Fuji)
  const MockBenqi = await ethers.getContractFactory('MockBenqi')
  const mockBenqi = await MockBenqi.deploy(usdcAddress, 'Mock qiUSDC', 'qiUSDC')
  await mockBenqi.waitForDeployment()
  const benqiAddr = await mockBenqi.getAddress()
  console.log(`  MockBenqi (qiUSDC): ${benqiAddr}`)
  save(deployments, 'MockBenqiUSDC', benqiAddr, deployer.address)

  // Mock aToken for Aave (in case Fuji Aave V3 USDC market is inactive)
  const mockAToken = await MockERC20Factory.deploy('Mock aUSDC', 'aUSDC', 6)
  await mockAToken.waitForDeployment()
  const aTokenAddr = await mockAToken.getAddress()
  console.log(`  MockAToken (aUSDC): ${aTokenAddr}`)
  save(deployments, 'MockATokenUSDC', aTokenAddr, deployer.address)

  // Mock Chainlink feed (fallback if Fuji feed is stale/down)
  const MockFeed = await ethers.getContractFactory('MockChainlinkFeed')
  const mockFeed = await MockFeed.deploy(100000000n, 8) // $1.00 with 8 decimals
  await mockFeed.waitForDeployment()
  const feedAddr = await mockFeed.getAddress()
  console.log(`  MockChainlinkFeed: ${feedAddr} (USDC/USD = $1.00)`)
  save(deployments, 'MockPriceFeed', feedAddr, deployer.address)

  // Mock Aave Pool (in case Fuji Aave is inactive)
  const MockAavePool = await ethers.getContractFactory('MockAavePool')
  const mockAave = await MockAavePool.deploy(usdcAddress, aTokenAddr)
  await mockAave.waitForDeployment()
  const aavePoolAddr = await mockAave.getAddress()
  console.log(`  MockAavePool:      ${aavePoolAddr}`)
  save(deployments, 'MockAavePool', aavePoolAddr, deployer.address)

  // Decide: use real or mock external infra
  // For reliability, default to mocks (real Fuji Aave may have no USDC liquidity)
  const useMocks = process.env['USE_REAL_AAVE'] !== 'true'
  const priceFeedAddr = useMocks ? feedAddr : FUJI.CL_USDC_USD
  const aavePool = useMocks ? aavePoolAddr : FUJI.AAVE_V3_POOL
  const aToken = useMocks ? aTokenAddr : FUJI.AAVE_AUSDC
  const benqi = benqiAddr // always mock (not on Fuji)

  console.log(`\n  Using ${useMocks ? 'MOCK' : 'REAL'} Aave + Chainlink`)
  console.log(`  Using MOCK Benqi (always — not on Fuji)\n`)

  // ─── Step 2: Deploy ZeroXScore ────────────────────────────────────────────
  console.log('Step 2: Deploying ZeroXScore...')

  const Score = await ethers.getContractFactory('ZeroXScore')
  const score = await Score.deploy(deployer.address)
  await score.waitForDeployment()
  const scoreAddr = await score.getAddress()
  console.log(`  ZeroXScore: ${scoreAddr}\n`)
  save(deployments, 'ZeroXScore', scoreAddr, deployer.address)

  // ─── Step 3: Deploy ZeroXVault (USDC) ─────────────────────────────────────
  console.log('Step 3: Deploying ZeroXVault (USDC)...')

  const Vault = await ethers.getContractFactory('ZeroXVault')
  const vault = await Vault.deploy(
    usdcAddress,        // asset
    'ZeroX USDC Vault', // name
    'zxUSDC',           // symbol
    priceFeedAddr,      // price feed
    aavePool,           // Aave V3 pool
    benqi,              // Benqi qiUSDC (mock)
    aToken,             // Aave aUSDC
    deployer.address,   // fee recipient
    deployer.address    // owner
  )
  await vault.waitForDeployment()
  const vaultAddr = await vault.getAddress()
  console.log(`  ZeroXVault (USDC): ${vaultAddr}\n`)
  save(deployments, 'ZeroXVaultUSDC', vaultAddr, deployer.address)

  // ─── Step 4: Deploy ZeroXCredit ───────────────────────────────────────────
  console.log('Step 4: Deploying ZeroXCredit...')

  const Credit = await ethers.getContractFactory('ZeroXCredit')
  const credit = await Credit.deploy(
    usdcAddress,      // borrow token
    scoreAddr,        // score contract
    deployer.address  // owner
  )
  await credit.waitForDeployment()
  const creditAddr = await credit.getAddress()
  console.log(`  ZeroXCredit: ${creditAddr}\n`)
  save(deployments, 'ZeroXCredit', creditAddr, deployer.address)

  // ─── Step 5: Wire cross-contract references ───────────────────────────────
  console.log('Step 5: Wiring cross-contract references...')

  // Score: set credit as updater, vault as authorized
  await (await score.setScoreUpdater(creditAddr)).wait()
  console.log('  Score.setScoreUpdater(credit)')

  await (await score.setVaultAuthorized(vaultAddr, true)).wait()
  console.log('  Score.setVaultAuthorized(vault, true)')

  // Vault: set score contract
  await (await vault.setScoreContract(scoreAddr)).wait()
  console.log('  Vault.setScoreContract(score)')

  // Credit: add vault as allowed collateral
  await (await credit.addAllowedVault(vaultAddr)).wait()
  console.log('  Credit.addAllowedVault(vault)')

  // Credit: set treasury for liquidation fee split (2%)
  await (await credit.setTreasury(deployer.address)).wait()
  console.log('  Credit.setTreasury(deployer) — testnet treasury')

  // Vault: smoke-test harvestYield (should return 0 on fresh deploy)
  await (await vault.harvestYield()).wait()
  console.log('  Vault.harvestYield() — smoke test OK')

  // If using mock Aave, set the aToken mapping
  if (useMocks) {
    await (await mockAave.setAToken(FUJI.USDC, aTokenAddr)).wait()
    console.log('  MockAavePool.setAToken(USDC, aUSDC)')
  }

  console.log()

  // ─── Step 6: Deploy ZeroXRegistry (optional, for completeness) ────────────
  console.log('Step 6: Deploying ZeroXRegistry (5 test signers)...')

  // Generate 4 additional signer addresses for Registry (testnet only)
  const extraWallets = Array.from({ length: 4 }, () => ethers.Wallet.createRandom())
  const registrySigners: [string, string, string, string, string] = [
    deployer.address,
    extraWallets[0]!.address,
    extraWallets[1]!.address,
    extraWallets[2]!.address,
    extraWallets[3]!.address,
  ]

  const Registry = await ethers.getContractFactory('ZeroXRegistry')
  const registry = await Registry.deploy(registrySigners)
  await registry.waitForDeployment()
  const registryAddr = await registry.getAddress()
  console.log(`  ZeroXRegistry: ${registryAddr}`)
  console.log(`  Signer 1 (deployer): ${registrySigners[0]}`)
  console.log(`  Signers 2-5: test addresses (not funded)\n`)
  save(deployments, 'ZeroXRegistry', registryAddr, deployer.address)

  // ─── Save all deployments ─────────────────────────────────────────────────
  const filePath = path.join(DEPLOYMENTS_DIR, `${network.name}.json`)
  if (!fs.existsSync(DEPLOYMENTS_DIR)) {
    fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true })
  }
  fs.writeFileSync(filePath, JSON.stringify(deployments, null, 2))

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('========================================')
  console.log(' Deployment Complete!')
  console.log('========================================')
  console.log(`  ZeroXScore:      ${scoreAddr}`)
  console.log(`  ZeroXVaultUSDC:  ${vaultAddr}`)
  console.log(`  ZeroXCredit:     ${creditAddr}`)
  console.log(`  ZeroXRegistry:   ${registryAddr}`)
  console.log(`  MockBenqi:       ${benqiAddr}`)
  console.log(`  MockAavePool:    ${aavePoolAddr}`)
  console.log(`  MockPriceFeed:   ${feedAddr}`)
  console.log('========================================')
  console.log(`\n  Saved to: deployments/${network.name}.json`)
  console.log('\n  Next steps:')
  console.log('  1. Get Fuji USDC from faucet or bridge')
  console.log('  2. Fund credit reserve: credit.fundReserve(amount)')
  console.log('  3. Test: deposit → open credit line → borrow → repay')
  console.log('  4. Update packages/frontend/src/constants/addresses.ts')
}

function save(
  deployments: Record<string, { address: string; deployer: string; deployedAt: string }>,
  name: string,
  address: string,
  deployer: string
) {
  deployments[name] = { address, deployer, deployedAt: new Date().toISOString() }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
