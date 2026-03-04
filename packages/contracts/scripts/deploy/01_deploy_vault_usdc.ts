import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { MAINNET, FUJI } from '../utils/addresses'

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

async function main() {
  const [deployer] = await ethers.getSigners()
  const addresses = network.name === 'mainnet' ? MAINNET : FUJI

  console.log(`\n📦 Deploying ZeroXVault (USDC)`)
  console.log(`   Network: ${network.name}`)
  console.log(`   Deployer: ${deployer.address}`)
  console.log(`   Asset: USDC (${addresses.USDC})`)

  const deployments = loadDeployments(network.name)
  const feeRecipient = process.env['FEE_RECIPIENT'] ?? deployer.address
  const owner = (deployments['ZeroXRegistry'] as { address: string })?.address ?? deployer.address

  const Vault = await ethers.getContractFactory('ZeroXVault')
  const vault = await Vault.deploy(
    addresses.USDC,               // asset
    'ZeroX USDC Vault',           // name
    'zxUSDC',                     // symbol
    addresses.CL_USDC_USD,        // price feed
    addresses.AAVE_V3_POOL,             // aave v3 pool
    (addresses as typeof MAINNET).BENQI_USDC,  // benqi qiUSDC
    (addresses as typeof MAINNET).AAVE_AUSDC,  // aave aUSDC
    feeRecipient,
    owner                         // owner = registry address (multisig controlled)
  )
  await vault.waitForDeployment()

  const address = await vault.getAddress()
  console.log(`\n✅ ZeroXVault (USDC) deployed: ${address}`)

  saveDeployment(network.name, 'ZeroXVaultUSDC', address, deployer.address)
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
