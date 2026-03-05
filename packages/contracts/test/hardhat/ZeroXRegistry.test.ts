import { expect } from 'chai'
import { ethers } from 'hardhat'
import type { Signer } from 'ethers'
import type { ZeroXRegistry } from '../../typechain-types'

describe('ZeroXRegistry', () => {
  let signer1: Signer
  let signer2: Signer
  let signer3: Signer
  let signer4: Signer
  let signer5: Signer
  let outsider: Signer

  let registry: ZeroXRegistry

  const FAKE_CONTRACT = '0x1000000000000000000000000000000000000001'
  const KEY_VAULT_USDC = ethers.keccak256(ethers.toUtf8Bytes('VAULT_USDC'))
  const KEY_CREDIT     = ethers.keccak256(ethers.toUtf8Bytes('CREDIT'))

  const FORTY_EIGHT_HOURS = 48 * 60 * 60

  async function deploy() {
    const signers = await ethers.getSigners()
    ;[signer1, signer2, signer3, signer4, signer5, outsider] = signers

    const addrs = [
      await signer1.getAddress(),
      await signer2.getAddress(),
      await signer3.getAddress(),
      await signer4.getAddress(),
      await signer5.getAddress(),
    ] as [string, string, string, string, string]

    const RegistryF = await ethers.getContractFactory('ZeroXRegistry')
    registry = await RegistryF.deploy(addrs)
  }

  beforeEach(deploy)

  // ─── Constructor ──────────────────────────────────────────────────────────
  describe('Constructor', () => {
    it('registers all 5 signers', async () => {
      for (const signer of [signer1, signer2, signer3, signer4, signer5]) {
        expect(await registry.isSigner(await signer.getAddress())).to.be.true
      }
    })

    it('outsider is not a signer', async () => {
      expect(await registry.isSigner(await outsider.getAddress())).to.be.false
    })

    it('requiredApprovals is 3', async () => {
      expect(await registry.requiredApprovals()).to.equal(3n)
    })

    it('reverts on duplicate signer', async () => {
      const addr = await signer1.getAddress()
      const RegistryF = await ethers.getContractFactory('ZeroXRegistry')
      await expect(
        RegistryF.deploy([addr, addr, await signer3.getAddress(), await signer4.getAddress(), await signer5.getAddress()])
      ).to.be.revertedWith('ZeroXRegistry: duplicate signer')
    })

    it('reverts on zero signer address', async () => {
      const RegistryF = await ethers.getContractFactory('ZeroXRegistry')
      await expect(
        RegistryF.deploy([
          ethers.ZeroAddress,
          await signer2.getAddress(),
          await signer3.getAddress(),
          await signer4.getAddress(),
          await signer5.getAddress(),
        ])
      ).to.be.revertedWith('ZeroXRegistry: zero signer address')
    })
  })

  // ─── proposeRegistration ──────────────────────────────────────────────────
  describe('proposeRegistration', () => {
    it('creates proposal with correct fields', async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      const [key, value, proposer, approvalCount, executed] = await registry.getProposal(1)
      expect(key).to.equal(KEY_VAULT_USDC)
      expect(value).to.equal(FAKE_CONTRACT)
      expect(proposer).to.equal(await signer1.getAddress())
      expect(approvalCount).to.equal(1n)
      expect(executed).to.be.false
    })

    it('auto-approves from proposer', async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      expect(await registry.hasApproved(1, await signer1.getAddress())).to.be.true
    })

    it('increments proposalCount', async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      await registry.connect(signer1).proposeRegistration(KEY_CREDIT, FAKE_CONTRACT)
      expect(await registry.proposalCount()).to.equal(2n)
    })

    it('emits ProposalCreated', async () => {
      await expect(registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT))
        .to.emit(registry, 'ProposalCreated')
        .withArgs(1n, KEY_VAULT_USDC, FAKE_CONTRACT, await signer1.getAddress())
    })

    it('reverts for non-signer', async () => {
      await expect(
        registry.connect(outsider).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      ).to.be.revertedWith('ZeroXRegistry: caller is not a signer')
    })

    it('reverts on zero address', async () => {
      await expect(
        registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, ethers.ZeroAddress)
      ).to.be.revertedWith('ZeroXRegistry: zero address')
    })
  })

  // ─── approveProposal ──────────────────────────────────────────────────────
  describe('approveProposal', () => {
    beforeEach(async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
    })

    it('signer2 can approve', async () => {
      await registry.connect(signer2).approveProposal(1)
      const [, , , approvalCount] = await registry.getProposal(1)
      expect(approvalCount).to.equal(2n)
    })

    it('records approvedAt when 3rd approval triggers timelock', async () => {
      await registry.connect(signer2).approveProposal(1)
      await registry.connect(signer3).approveProposal(1)

      // Immediately after 3 approvals → timelock not elapsed
      await expect(registry.connect(signer1).executeProposal(1))
        .to.be.revertedWith('ZeroXRegistry: timelock not elapsed')
    })

    it('emits ProposalApproved', async () => {
      await expect(registry.connect(signer2).approveProposal(1))
        .to.emit(registry, 'ProposalApproved')
        .withArgs(1n, await signer2.getAddress(), 2n)
    })

    it('reverts for non-signer', async () => {
      await expect(registry.connect(outsider).approveProposal(1))
        .to.be.revertedWith('ZeroXRegistry: caller is not a signer')
    })

    it('reverts for double approval', async () => {
      await expect(registry.connect(signer1).approveProposal(1))
        .to.be.revertedWith('ZeroXRegistry: already approved')
    })

    it('reverts for non-existent proposal', async () => {
      await expect(registry.connect(signer2).approveProposal(999))
        .to.be.revertedWith('ZeroXRegistry: proposal does not exist')
    })
  })

  // ─── executeProposal (48h timelock — FIX H-02) ───────────────────────────
  describe('executeProposal — 48h timelock (FIX H-02)', () => {
    async function reach3Approvals() {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      await registry.connect(signer2).approveProposal(1)
      await registry.connect(signer3).approveProposal(1)
    }

    it('reverts immediately after reaching 3 approvals', async () => {
      await reach3Approvals()
      await expect(registry.connect(signer1).executeProposal(1))
        .to.be.revertedWith('ZeroXRegistry: timelock not elapsed')
    })

    it('reverts at 47h59m (one second before timelock expires)', async () => {
      await reach3Approvals()
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS - 2])
      await ethers.provider.send('evm_mine', [])
      await expect(registry.connect(signer1).executeProposal(1))
        .to.be.revertedWith('ZeroXRegistry: timelock not elapsed')
    })

    it('succeeds at exactly 48h after approval threshold', async () => {
      await reach3Approvals()
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])

      await expect(registry.connect(signer1).executeProposal(1))
        .to.emit(registry, 'ProposalExecuted')
        .withArgs(1n, KEY_VAULT_USDC, FAKE_CONTRACT)
    })

    it('registers the address after successful execution', async () => {
      await reach3Approvals()
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])

      await registry.connect(signer1).executeProposal(1)
      expect(await registry.resolve(KEY_VAULT_USDC)).to.equal(FAKE_CONTRACT)
    })

    it('reverts on second execution (already executed)', async () => {
      await reach3Approvals()
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])

      await registry.connect(signer1).executeProposal(1)
      await expect(registry.connect(signer1).executeProposal(1))
        .to.be.revertedWith('ZeroXRegistry: already executed')
    })

    it('reverts with only 2 approvals (even after 48h)', async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      await registry.connect(signer2).approveProposal(1)

      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS * 10])
      await ethers.provider.send('evm_mine', [])

      await expect(registry.connect(signer1).executeProposal(1))
        .to.be.revertedWith('ZeroXRegistry: insufficient approvals')
    })

    it('reverts for non-signer trying to execute', async () => {
      await reach3Approvals()
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])

      await expect(registry.connect(outsider).executeProposal(1))
        .to.be.revertedWith('ZeroXRegistry: caller is not a signer')
    })

    it('multiple proposals tracked independently', async () => {
      // Proposal 1 gets 3 approvals
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      await registry.connect(signer2).approveProposal(1)
      await registry.connect(signer3).approveProposal(1)

      // Proposal 2 gets only 1 (auto) approval
      await registry.connect(signer2).proposeRegistration(KEY_CREDIT, FAKE_CONTRACT)

      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])

      // Proposal 1 executes successfully
      await expect(registry.connect(signer1).executeProposal(1)).to.not.be.reverted

      // Proposal 2 still cannot execute
      await expect(registry.connect(signer2).executeProposal(2))
        .to.be.revertedWith('ZeroXRegistry: insufficient approvals')
    })

    it('4th and 5th signers can also approve (threshold already met, no effect on timer)', async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      await registry.connect(signer2).approveProposal(1)
      await registry.connect(signer3).approveProposal(1) // threshold reached

      // 4th approval doesn't reset the timer
      await registry.connect(signer4).approveProposal(1)
      const [, , , approvalCount] = await registry.getProposal(1)
      expect(approvalCount).to.equal(4n)

      // Timelock is still 48h from when signer3 approved (not signer4)
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])

      await expect(registry.connect(signer1).executeProposal(1)).to.not.be.reverted
    })
  })

  // ─── No registerDirect (FIX C-02) ────────────────────────────────────────
  describe('No direct registration bypass (FIX C-02)', () => {
    it('registerDirect function does not exist', () => {
      // TypeScript would error if you tried registry.registerDirect — this checks the ABI
      const fragment = registry.interface.getFunction('registerDirect')
      expect(fragment).to.be.null
    })

    it('single signer alone cannot register (always needs 3/5)', async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)

      // Even after a very long wait, 1 approval is never enough
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS * 100])
      await ethers.provider.send('evm_mine', [])

      await expect(registry.connect(signer1).executeProposal(1))
        .to.be.revertedWith('ZeroXRegistry: insufficient approvals')

      // Address NOT registered
      expect(await registry.resolve(KEY_VAULT_USDC)).to.equal(ethers.ZeroAddress)
    })
  })

  // ─── Emergency Pause ─────────────────────────────────────────────────────
  describe('emergencyPause', () => {
    it('any signer can pause', async () => {
      await registry.connect(signer3).emergencyPause()
      expect(await registry.paused()).to.be.true
    })

    it('non-signer cannot pause', async () => {
      await expect(registry.connect(outsider).emergencyPause())
        .to.be.revertedWith('ZeroXRegistry: caller is not a signer')
    })

    it('any signer can unpause', async () => {
      await registry.connect(signer1).emergencyPause()
      await registry.connect(signer2).unpause()
      expect(await registry.paused()).to.be.false
    })

    it('non-signer cannot unpause', async () => {
      await registry.connect(signer1).emergencyPause()
      await expect(registry.connect(outsider).unpause())
        .to.be.revertedWith('ZeroXRegistry: caller is not a signer')
    })
  })

  // ─── getAddress / address lookup ─────────────────────────────────────────
  describe('getAddress', () => {
    it('returns zero address for unregistered key', async () => {
      expect(await registry.resolve(KEY_VAULT_USDC)).to.equal(ethers.ZeroAddress)
    })

    it('returns registered address after full proposal flow', async () => {
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      await registry.connect(signer2).approveProposal(1)
      await registry.connect(signer3).approveProposal(1)

      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])

      await registry.connect(signer1).executeProposal(1)
      expect(await registry.resolve(KEY_VAULT_USDC)).to.equal(FAKE_CONTRACT)
    })

    it('can update existing registration via a new proposal', async () => {
      const SECOND_CONTRACT = '0x2000000000000000000000000000000000000002'

      // First registration
      await registry.connect(signer1).proposeRegistration(KEY_VAULT_USDC, FAKE_CONTRACT)
      await registry.connect(signer2).approveProposal(1)
      await registry.connect(signer3).approveProposal(1)
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])
      await registry.connect(signer1).executeProposal(1)
      expect(await registry.resolve(KEY_VAULT_USDC)).to.equal(FAKE_CONTRACT)

      // Update via second proposal
      await registry.connect(signer2).proposeRegistration(KEY_VAULT_USDC, SECOND_CONTRACT)
      await registry.connect(signer3).approveProposal(2)
      await registry.connect(signer4).approveProposal(2)
      await ethers.provider.send('evm_increaseTime', [FORTY_EIGHT_HOURS])
      await ethers.provider.send('evm_mine', [])
      await registry.connect(signer1).executeProposal(2)

      expect(await registry.resolve(KEY_VAULT_USDC)).to.equal(SECOND_CONTRACT)
    })
  })
})
