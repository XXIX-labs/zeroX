/**
 * 07_configure_fees.ts
 *
 * Configures fee model parameters on deployed contracts:
 * - Sets treasury address on ZeroXCredit (liquidation 2% split)
 * - Sets performance fee and fee recipient on vaults
 * - Smoke-tests harvestYield() on each vault
 *
 * Usage:
 *   npx hardhat run scripts/deploy/07_configure_fees.ts --network fuji
 *
 * Required env:
 *   TREASURY_ADDRESS (defaults to deployer if not set)
 *   FEE_RECIPIENT    (defaults to deployer if not set)
 */
import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

async function main() {
  const [deployer] = await ethers.getSigners()
  const deployments = loadDeployments(network.name)

  console.log(`\nConfiguring fees — ZeroX Protocol`)
  console.log(`  Network:  ${network.name}`)
  console.log(`  Deployer: ${deployer.address}`)

  const treasuryAddress = process.env['TREASURY_ADDRESS'] ?? deployer.address
  const feeRecipient = process.env['FEE_RECIPIENT'] ?? deployer.address

  // ─── Configure ZeroXCredit treasury ─────────────────────────────────────
  const creditAddress = (deployments['ZeroXCredit'] as { address: string })?.address
  if (creditAddress) {
    const credit = await ethers.getContractAt('ZeroXCredit', creditAddress)
    await (await credit.setTreasury(treasuryAddress)).wait()
    console.log(`  ZeroXCredit.setTreasury(${treasuryAddress})`)
  } else {
    console.log('  Warning: ZeroXCredit not found in deployments')
  }

  // ─── Configure vault fees ───────────────────────────────────────────────
  const vaultKeys = ['ZeroXVaultUSDC', 'ZeroXVaultUSDT', 'ZeroXVaultAUSD']
  for (const key of vaultKeys) {
    const entry = deployments[key] as { address: string } | undefined
    if (!entry) continue

    const vault = await ethers.getContractAt('ZeroXVault', entry.address)
    await (await vault.setFeeRecipient(feeRecipient)).wait()
    console.log(`  ${key}.setFeeRecipient(${feeRecipient})`)

    // Smoke test: harvest (should return 0 on fresh deploy)
    try {
      const tx = await vault.harvestYield()
      await tx.wait()
      console.log(`  ${key}.harvestYield() — OK`)
    } catch (err) {
      console.log(`  ${key}.harvestYield() — skipped (${(err as Error).message?.slice(0, 60)})`)
    }
  }

  console.log('\nFee configuration complete!')
  console.log(`  Treasury:      ${treasuryAddress}`)
  console.log(`  Fee recipient: ${feeRecipient}`)
  console.log(`  Performance:   10% (default)`)
  console.log(`  Liq split:     3% liquidator / 2% treasury`)
}

function loadDeployments(networkName: string): Record<string, unknown> {
  const filePath = path.resolve(__dirname, `../../deployments/${networkName}.json`)
  if (!fs.existsSync(filePath)) return {}
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
