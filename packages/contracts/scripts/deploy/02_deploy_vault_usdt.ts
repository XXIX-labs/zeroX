import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { MAINNET, FUJI } from '../utils/addresses'

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

async function main() {
  const [deployer] = await ethers.getSigners()
  const addresses = network.name === 'mainnet' ? MAINNET : FUJI

  console.log(`\n📦 Deploying ZeroXVault (USDT)`)
  console.log(`   Network: ${network.name}`)
  console.log(`   Deployer: ${deployer.address}`)
  console.log(`   Asset: USDT (${addresses.USDT})`)

  const deployments = loadDeployments(network.name)
  const feeRecipient = process.env['FEE_RECIPIENT'] ?? deployer.address
  const owner = (deployments['ZeroXRegistry'] as { address: string })?.address ?? deployer.address

  // Mainnet Benqi USDT token (qiUSDT)
  const benqiUsdt = (addresses as typeof MAINNET).BENQI_USDT ?? ''
  const aaveAusdt = (addresses as typeof MAINNET).AAVE_AUSDT ?? ''
  const clUsdt    = (addresses as typeof MAINNET).CL_USDT_USD ?? ''

  if (!benqiUsdt) throw new Error('BENQI_USDT address not configured for this network')
  if (!aaveAusdt) throw new Error('AAVE_AUSDT address not configured for this network')
  if (!clUsdt)    throw new Error('CL_USDT_USD address not configured for this network')

  const Vault = await ethers.getContractFactory('ZeroXVault')
  const vault = await Vault.deploy(
    addresses.USDT,         // asset
    'ZeroX USDT Vault',     // name
    'zxUSDT',               // symbol
    clUsdt,                 // Chainlink USDT/USD price feed
    addresses.AAVE_V3_POOL, // Aave V3 pool
    benqiUsdt,              // Benqi qiUSDT
    aaveAusdt,              // Aave aUSDT
    feeRecipient,
    owner                   // owner = registry (multisig controlled)
  )
  await vault.waitForDeployment()

  const address = await vault.getAddress()
  console.log(`\n✅ ZeroXVault (USDT) deployed: ${address}`)
  console.log(`   Strategies: Aave V3 (60%) + Benqi (40%)`)
  console.log(`   Agora AUSD strategy: disabled by default`)
  console.log(`   Enable with: vault.setAgoraStrategy(...) after Agora whitelist approval`)

  saveDeployment(network.name, 'ZeroXVaultUSDT', address, deployer.address)
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
