import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') })

async function main() {
  const [deployer] = await ethers.getSigners()
  console.log(`\n📦 Deploying ZeroXRegistry`)
  console.log(`   Network: ${network.name}`)
  console.log(`   Deployer: ${deployer.address}`)

  // Load multisig signer addresses from environment
  const signers: [string, string, string, string, string] = [
    process.env['MULTISIG_SIGNER_1'] ?? deployer.address,
    process.env['MULTISIG_SIGNER_2'] ?? deployer.address,
    process.env['MULTISIG_SIGNER_3'] ?? deployer.address,
    process.env['MULTISIG_SIGNER_4'] ?? deployer.address,
    process.env['MULTISIG_SIGNER_5'] ?? deployer.address,
  ]

  // Deduplicate for testnet (all 5 may be the same deployer)
  const uniqueSigners = [...new Set(signers)]
  console.log(`   Signers: ${uniqueSigners.length} unique`)
  console.log(`   Required approvals: 3`)

  const Registry = await ethers.getContractFactory('ZeroXRegistry')
  const registry = await Registry.deploy(signers)
  await registry.waitForDeployment()

  const address = await registry.getAddress()
  console.log(`\n✅ ZeroXRegistry deployed: ${address}`)

  // Save to deployments file
  saveDeployment(network.name, 'ZeroXRegistry', address, deployer.address)
}

function saveDeployment(networkName: string, contractName: string, address: string, deployer: string) {
  const deploymentsDir = path.resolve(__dirname, '../../deployments')
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true })
  }

  const filePath = path.join(deploymentsDir, `${networkName}.json`)
  let deployments: Record<string, unknown> = {}

  if (fs.existsSync(filePath)) {
    deployments = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
  }

  deployments[contractName] = {
    address,
    deployer,
    deployedAt: new Date().toISOString(),
    network: networkName,
  }

  fs.writeFileSync(filePath, JSON.stringify(deployments, null, 2))
  console.log(`   💾 Saved to deployments/${networkName}.json`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
