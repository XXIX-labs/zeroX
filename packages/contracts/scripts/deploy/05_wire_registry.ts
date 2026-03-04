/**
 * 05_wire_registry.ts
 *
 * Registers all deployed contracts in ZeroXRegistry and wires cross-contract references.
 *
 * MAINNET: Creates multisig proposals (requires 3/5 signers + 48h timelock).
 *          Run this script to print proposal calldata, then execute via Safe UI.
 *          After 48h, set EXECUTE_PROPOSALS=true and re-run to execute proposals.
 *
 * FUJI / HARDHAT: Uses full proposal flow; Hardhat network time is advanced by 48h automatically.
 */
import { ethers, network } from 'hardhat'
import * as fs from 'fs'
import * as path from 'path'

const FORTY_EIGHT_HOURS = 48 * 60 * 60

async function main() {
  const signers = await ethers.getSigners()
  const deployments = loadDeployments(network.name)

  console.log(`\n🔗 Wiring Registry — ZeroX Protocol`)
  console.log(`   Network: ${network.name}`)

  const registryAddress  = (deployments['ZeroXRegistry']  as { address: string })?.address
  const vaultUsdcAddress = (deployments['ZeroXVaultUSDC'] as { address: string })?.address
  const vaultUsdtAddress = (deployments['ZeroXVaultUSDT'] as { address: string })?.address
  const vaultAusdAddress = (deployments['ZeroXVaultAUSD'] as { address: string })?.address
  const creditAddress    = (deployments['ZeroXCredit']    as { address: string })?.address
  const scoreAddress     = (deployments['ZeroXScore']     as { address: string })?.address

  if (!registryAddress) throw new Error('ZeroXRegistry not deployed — run 00_deploy_registry.ts first')
  if (!creditAddress)   throw new Error('ZeroXCredit not deployed — run 04_deploy_credit.ts first')
  if (!scoreAddress)    throw new Error('ZeroXScore not deployed — run 03_deploy_score.ts first')

  const registry = await ethers.getContractAt('ZeroXRegistry', registryAddress)
  const credit   = await ethers.getContractAt('ZeroXCredit', creditAddress)
  const score    = await ethers.getContractAt('ZeroXScore', scoreAddress)

  const KEY_VAULT_USDC = ethers.keccak256(ethers.toUtf8Bytes('VAULT_USDC'))
  const KEY_VAULT_USDT = ethers.keccak256(ethers.toUtf8Bytes('VAULT_USDT'))
  const KEY_CREDIT     = ethers.keccak256(ethers.toUtf8Bytes('CREDIT'))
  const KEY_SCORE      = ethers.keccak256(ethers.toUtf8Bytes('SCORE'))

  if (network.name === 'mainnet') {
    // ─── Mainnet: print calldata for multisig signers to execute manually ───
    console.log('\n   Mainnet: use 3-of-5 multisig proposal flow (48h timelock)')
    console.log('\n   Step 1 — Signer 1 proposes (then signers 2 + 3 approve, wait 48h, any signer executes):\n')

    const proposals = [
      vaultUsdcAddress && { key: 'VAULT_USDC', hash: KEY_VAULT_USDC, value: vaultUsdcAddress },
      vaultUsdtAddress && { key: 'VAULT_USDT', hash: KEY_VAULT_USDT, value: vaultUsdtAddress },
      { key: 'CREDIT', hash: KEY_CREDIT, value: creditAddress },
      { key: 'SCORE',  hash: KEY_SCORE,  value: scoreAddress  },
    ].filter(Boolean) as Array<{ key: string; hash: string; value: string }>

    for (const p of proposals) {
      console.log(`   registry.proposeRegistration("${p.hash}", "${p.value}")  // ${p.key}`)
    }
    console.log('\n   See docs/IMPLEMENTATION_PLAN.md §Deployment for the full sequence.')
    return
  }

  // ─── Testnet / Hardhat: run full proposal flow with available signers ─────
  console.log('\n   Testnet/Hardhat: running full proposal + approve + execute flow')

  const s1 = signers[0]!
  const s2 = signers[1] ?? s1
  const s3 = signers[2] ?? s1
  const s4 = signers[3] ?? s1

  const proposalIds: bigint[] = []

  if (vaultUsdcAddress) {
    const id = await proposeAndApprove(registry, s1, s2, s3, KEY_VAULT_USDC, vaultUsdcAddress)
    proposalIds.push(id)
    console.log(`   ✅ VAULT_USDC proposal #${id}`)
  }

  if (vaultUsdtAddress) {
    const id = await proposeAndApprove(registry, s1, s2, s3, KEY_VAULT_USDT, vaultUsdtAddress)
    proposalIds.push(id)
    console.log(`   ✅ VAULT_USDT proposal #${id}`)
  }

  {
    const id = await proposeAndApprove(registry, s1, s2, s3, KEY_CREDIT, creditAddress)
    proposalIds.push(id)
    console.log(`   ✅ CREDIT proposal #${id}`)
  }

  {
    const id = await proposeAndApprove(registry, s1, s2, s3, KEY_SCORE, scoreAddress)
    proposalIds.push(id)
    console.log(`   ✅ SCORE proposal #${id}`)
  }

  // Advance time past 48h timelock (Hardhat only)
  if (network.name === 'hardhat') {
    await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS + 1])
    await ethers.provider.send('evm_mine', [])
    console.log('\n   ⏱  Advanced hardhat time by 48h')
  } else {
    // Fuji: require explicit flag to avoid accidental re-execution
    if (process.env['EXECUTE_PROPOSALS'] !== 'true') {
      console.log('\n   ⏱  Fuji: 48h timelock in progress.')
      console.log('   Re-run with EXECUTE_PROPOSALS=true after 48h to execute and wire.')
      return
    }
  }

  // Execute all proposals
  for (const id of proposalIds) {
    await (await registry.connect(s4).executeProposal(id)).wait()
    console.log(`   ✅ Proposal #${id} executed`)
  }

  // Wire cross-contract references
  console.log('\n   Wiring cross-contract references...')

  await (await score.setScoreUpdater(creditAddress)).wait()
  console.log('   ✅ ZeroXScore → updater = ZeroXCredit')

  // Authorize all vaults so each can call initializeScore on first deposit
  // (FIX NEW-L-02: setVaultAuthorized replaces single-slot setVaultUpdater)
  if (vaultUsdcAddress) {
    await (await score.setVaultAuthorized(vaultUsdcAddress, true)).wait()
    const vaultUsdc = await ethers.getContractAt('ZeroXVault', vaultUsdcAddress)
    await (await vaultUsdc.setScoreContract(scoreAddress)).wait()
    await (await credit.addAllowedVault(vaultUsdcAddress)).wait()
    console.log('   ✅ USDC vault wired (Score + Credit)')
  }

  if (vaultUsdtAddress) {
    await (await score.setVaultAuthorized(vaultUsdtAddress, true)).wait()
    const vaultUsdt = await ethers.getContractAt('ZeroXVault', vaultUsdtAddress)
    await (await vaultUsdt.setScoreContract(scoreAddress)).wait()
    await (await credit.addAllowedVault(vaultUsdtAddress)).wait()
    console.log('   ✅ USDT vault wired (Score + Credit)')
  }

  if (vaultAusdAddress) {
    await (await score.setVaultAuthorized(vaultAusdAddress, true)).wait()
    const vaultAusd = await ethers.getContractAt('ZeroXVault', vaultAusdAddress)
    await (await vaultAusd.setScoreContract(scoreAddress)).wait()
    await (await credit.addAllowedVault(vaultAusdAddress)).wait()
    console.log('   ✅ AUSD vault wired (Score + Credit)')
  }

  console.log('\n🎉 Registry wiring complete!')
  console.log(`\n   ⚠️  Fund ZeroXCredit reserve before launch:`)
  console.log(`   credit.fundReserve(amount) — transfer USDC liquidity to ${creditAddress}`)
}

async function proposeAndApprove(
  registry: Awaited<ReturnType<typeof ethers.getContractAt>>,
  s1: Awaited<ReturnType<typeof ethers.getSigner>>,
  s2: Awaited<ReturnType<typeof ethers.getSigner>>,
  s3: Awaited<ReturnType<typeof ethers.getSigner>>,
  key: string,
  value: string
): Promise<bigint> {
  await (await registry.connect(s1).proposeRegistration(key, value)).wait()
  const id = await registry.proposalCount()

  // s2 and s3 approve (silently skip if same address as s1 — testnet with single key)
  for (const signer of [s2, s3]) {
    const addr = await signer.getAddress()
    const already = await registry.hasApproved(id, addr)
    if (!already) {
      await (await registry.connect(signer).approveProposal(id)).wait()
    }
  }

  return id
}

function loadDeployments(networkName: string): Record<string, unknown> {
  const filePath = path.resolve(__dirname, `../../deployments/${networkName}.json`)
  if (!fs.existsSync(filePath)) return {}
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
