import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'
import { MAINNET, FUJI } from '../utils/addresses'

async function main() {
  const [deployer] = await ethers.getSigners()
  const addresses = network.name === 'mainnet' ? MAINNET : FUJI

  console.log(`\n📦 Deploying ZeroXCredit`)
  console.log(`   Network: ${network.name}`)
  console.log(`   Deployer: ${deployer.address}`)
  console.log(`   Borrow token: USDC (${addresses.USDC})`)

  const deployments = loadDeployments(network.name)
  const owner = (deployments['ZeroXRegistry'] as { address: string })?.address ?? deployer.address
  const scoreAddress = (deployments['ZeroXScore'] as { address: string })?.address

  if (!scoreAddress) throw new Error('ZeroXScore must be deployed before ZeroXCredit (run 03_deploy_score.ts first)')

  console.log(`   Owner: ${owner}`)
  console.log(`   Score: ${scoreAddress}`)

  const Credit = await ethers.getContractFactory('ZeroXCredit')
  const credit = await Credit.deploy(
    addresses.USDC,   // borrow token (USDC on Avalanche)
    scoreAddress,
    owner
  )
  await credit.waitForDeployment()

  const address = await credit.getAddress()
  console.log(`\n✅ ZeroXCredit deployed: ${address}`)
  console.log(`   APR: 10% (1000 bps)`)
  console.log(`   Max LTV: 50% (5000 bps)`)
  console.log(`   Liquidation threshold: 105% collateral ratio`)
  console.log(`   Liquidation bonus: 5% (500 bps)`)
  console.log(`   Reserve factor: 5% of interest (500 bps)`)
  console.log(`\n   ⚠️  Fund the reserve before users can borrow:`)
  console.log(`   credit.fundReserve(amount) — transfer USDC to the contract`)

  saveDeployment(network.name, 'ZeroXCredit', address, deployer.address)
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
