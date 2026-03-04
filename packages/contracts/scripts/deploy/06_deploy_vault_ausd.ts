/**
 * 06_deploy_vault_ausd.ts
 *
 * Deploys a ZeroX vault for Agora USD (AUSD) on Avalanche C-Chain.
 *
 * AUSD is a T-bill-backed dollar stablecoin by Agora Finance.
 * The vault holds AUSD directly — yield accrues automatically as AUSD appreciates vs USD.
 * No Aave/Benqi strategy needed; Agora allocation = 10000 bps, others = 0.
 *
 * Prerequisites:
 *   1. AUSD is live on Avalanche: 0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a
 *   2. This vault does NOT need the Agora StableSwap — users deposit AUSD directly.
 *   3. For USDC→AUSD routing, enable via vault.setAgoraStrategy() after Agora whitelist.
 *
 * See: https://agora.finance | https://docs.agora.finance
 */
import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'
import { MAINNET, FUJI } from '../utils/addresses'

async function main() {
  const [deployer] = await ethers.getSigners()
  const addresses = network.name === 'mainnet' ? MAINNET : FUJI

  const AUSD = addresses.AUSD
  if (!AUSD) throw new Error('AUSD address not configured for this network')

  console.log(`\n📦 Deploying ZeroXVault (AUSD — Agora USD)`)
  console.log(`   Network: ${network.name}`)
  console.log(`   Deployer: ${deployer.address}`)
  console.log(`   Asset: AUSD (${AUSD})`)
  console.log(`   Yield source: Agora T-bill reserves (auto-accruing)`)

  const deployments = loadDeployments(network.name)
  const feeRecipient = process.env['FEE_RECIPIENT'] ?? deployer.address
  const owner = (deployments['ZeroXRegistry'] as { address: string })?.address ?? deployer.address

  // For AUSD vault: use USDC/USD feed as price proxy (AUSD ≈ $1.00)
  // No Benqi or Aave integration — vault holds AUSD directly
  // We still need Benqi + aToken constructor args; use zero addresses guarded by agoraAllocation
  const clAusdUsd = (addresses as typeof MAINNET).CL_AUSD_USD

  // For the AUSD vault, we pass placeholder Benqi + aToken (vault won't deploy to them)
  // because aaveAllocation + benqiAllocation = 0, agoraAllocation = 10000
  // But since we're not using Benqi/Aave, pass AUSD token itself as a safe dummy
  // (The vault constructor requires non-zero addresses)
  // In practice: deploy with real BENQI_USDC / AAVE_AUSDC but set both allocations to 0
  const benqiDummy = (addresses as typeof MAINNET).BENQI_USDC ?? AUSD
  const aTokenDummy = (addresses as typeof MAINNET).AAVE_AUSDC ?? AUSD

  const Vault = await ethers.getContractFactory('ZeroXVault')
  const vault = await Vault.deploy(
    AUSD,                   // asset = AUSD
    'ZeroX AUSD Vault',     // name
    'zxAUSD',               // symbol
    clAusdUsd,              // price feed (USDC/USD as proxy)
    addresses.AAVE_V3_POOL, // Aave V3 pool (placeholder, allocation = 0)
    benqiDummy,             // Benqi placeholder (allocation = 0)
    aTokenDummy,            // Aave aToken placeholder (allocation = 0)
    feeRecipient,
    owner
  )
  await vault.waitForDeployment()

  const address = await vault.getAddress()
  console.log(`\n✅ ZeroXVault (AUSD) deployed: ${address}`)

  // Set allocation: 0% Aave, 0% Benqi — all funds remain as AUSD (which self-yields)
  // Note: This requires calling setAllocation after deployment since default is 60/40
  console.log(`\n   ⚠️  IMPORTANT: Set allocations to (0, 0) after deployment:`)
  console.log(`   vault.setAgoraStrategy(ZERO_ADDRESS, ZERO_ADDRESS, 0, 0, 0)`)
  console.log(`   OR update the vault constructor to accept custom defaults.`)
  console.log(`\n   The AUSD vault holds AUSD natively — Agora T-bill yield accrues automatically.`)
  console.log(`   APY range: ~4-5% (tracks short-term US T-bill rate)`)

  saveDeployment(network.name, 'ZeroXVaultAUSD', address, deployer.address)
}

function loadDeployments(networkName: string): Record<string, unknown> {
  const filePath = path.resolve(__dirname, `../../deployments/${networkName}.json`)
  if (!fs.existsSync(filePath)) return {}
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
}

function saveDeployment(networkName: string, contractName: string, address: string, deployer: string) {
  const filePath = path.resolve(__dirname, `../../deployments/${networkName}.json`)
  const deployments = loadDeployments(networkName)
  deployments[contractName] = { address, deployer, deployedAt: new Date().toISOString() }
  fs.writeFileSync(filePath, JSON.stringify(deployments, null, 2))
  console.log(`   💾 Saved to deployments/${networkName}.json`)
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
