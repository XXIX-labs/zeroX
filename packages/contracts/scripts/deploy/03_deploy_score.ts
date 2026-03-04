import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const [deployer] = await ethers.getSigners()

  console.log(`\n📦 Deploying ZeroXScore`)
  console.log(`   Network: ${network.name}`)
  console.log(`   Deployer: ${deployer.address}`)

  const deployments = loadDeployments(network.name)
  const owner = (deployments['ZeroXRegistry'] as { address: string })?.address ?? deployer.address

  console.log(`   Owner: ${owner}`)

  const Score = await ethers.getContractFactory('ZeroXScore')
  const score = await Score.deploy(owner)
  await score.waitForDeployment()

  const address = await score.getAddress()
  console.log(`\n✅ ZeroXScore deployed: ${address}`)
  console.log(`   Score range: [300, 850]`)
  console.log(`   Initial score: 600 (on first deposit)`)
  console.log(`   Weights: Repayment 35% | Utilization 30% | Age 15% | Collateral 10% | Diversity 10%`)

  saveDeployment(network.name, 'ZeroXScore', address, deployer.address)
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
