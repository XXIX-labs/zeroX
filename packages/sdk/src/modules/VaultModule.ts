import type { PublicClient, WalletClient, Address } from 'viem'
import { VAULT_ABI, ERC20_ABI } from '../abis'
import type { VaultInfo, UserPosition, TxResult, ZeroXClientConfig } from '../types'

export class VaultModule {
  private client: PublicClient
  private wallet?: WalletClient
  private vaults: Map<string, Address>

  constructor(config: ZeroXClientConfig) {
    this.client = config.publicClient
    this.wallet = config.walletClient
    this.vaults = new Map()
    if (config.addresses.vaultUSDC) this.vaults.set('USDC', config.addresses.vaultUSDC)
    if (config.addresses.vaultUSDT) this.vaults.set('USDT', config.addresses.vaultUSDT)
  }

  getVaultAddress(token: 'USDC' | 'USDT'): Address {
    const addr = this.vaults.get(token)
    if (!addr) throw new Error(`Vault address for ${token} not configured`)
    return addr
  }

  async getVaultInfo(token: 'USDC' | 'USDT'): Promise<VaultInfo> {
    const address = this.getVaultAddress(token)

    const [totalAssets, totalSupply, aaveApy, benqiApy, aaveAlloc, benqiAlloc] =
      await Promise.all([
        this.client.readContract({ address, abi: VAULT_ABI, functionName: 'totalAssets' }),
        this.client.readContract({ address, abi: VAULT_ABI, functionName: 'totalSupply' }),
        this.client.readContract({ address, abi: VAULT_ABI, functionName: 'getAaveAPY' }),
        this.client.readContract({ address, abi: VAULT_ABI, functionName: 'getBenqiAPY' }),
        this.client.readContract({ address, abi: VAULT_ABI, functionName: 'aaveAllocation' }),
        this.client.readContract({ address, abi: VAULT_ABI, functionName: 'benqiAllocation' }),
      ])

    return { address, token, totalAssets, totalSupply, aaveApy, benqiApy, aaveAlloc, benqiAlloc }
  }

  async getUserPosition(token: 'USDC' | 'USDT', user: Address): Promise<UserPosition> {
    const address = this.getVaultAddress(token)

    const [shares, positionUSD, totalAssets, totalSupply] = await Promise.all([
      this.client.readContract({ address, abi: VAULT_ABI, functionName: 'balanceOf', args: [user] }),
      this.client.readContract({ address, abi: VAULT_ABI, functionName: 'getUserPositionUSD', args: [user] }),
      this.client.readContract({ address, abi: VAULT_ABI, functionName: 'totalAssets' }),
      this.client.readContract({ address, abi: VAULT_ABI, functionName: 'totalSupply' }),
    ])

    const sharePrice = totalSupply > 0n
      ? (totalAssets * 10n ** 18n) / totalSupply
      : 10n ** 18n

    return { vaultAddress: address, token, shares, assetsUSD: positionUSD, sharePrice }
  }

  async previewDeposit(token: 'USDC' | 'USDT', assets: bigint): Promise<bigint> {
    const address = this.getVaultAddress(token)
    return this.client.readContract({ address, abi: VAULT_ABI, functionName: 'previewDeposit', args: [assets] })
  }

  async previewWithdraw(token: 'USDC' | 'USDT', assets: bigint): Promise<bigint> {
    const address = this.getVaultAddress(token)
    return this.client.readContract({ address, abi: VAULT_ABI, functionName: 'previewWithdraw', args: [assets] })
  }

  async previewRedeem(token: 'USDC' | 'USDT', shares: bigint): Promise<bigint> {
    const address = this.getVaultAddress(token)
    return this.client.readContract({ address, abi: VAULT_ABI, functionName: 'previewRedeem', args: [shares] })
  }

  async checkAllowance(token: 'USDC' | 'USDT', owner: Address, underlyingToken: Address): Promise<bigint> {
    const spender = this.getVaultAddress(token)
    return this.client.readContract({
      address: underlyingToken, abi: ERC20_ABI, functionName: 'allowance', args: [owner, spender],
    })
  }

  async approve(underlyingToken: Address, spender: Address, amount: bigint): Promise<TxResult> {
    if (!this.wallet) throw new Error('WalletClient required for write operations')
    const [account] = await this.wallet.getAddresses()
    if (!account) throw new Error('No wallet account')

    const hash = await this.wallet.writeContract({
      address: underlyingToken,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amount],
      account,
      chain: this.client.chain!,
    })

    return {
      hash,
      wait: async () => { await this.client.waitForTransactionReceipt({ hash }) },
    }
  }

  async deposit(token: 'USDC' | 'USDT', assets: bigint, receiver: Address): Promise<TxResult> {
    if (!this.wallet) throw new Error('WalletClient required for write operations')
    const address = this.getVaultAddress(token)
    const [account] = await this.wallet.getAddresses()
    if (!account) throw new Error('No wallet account')

    const hash = await this.wallet.writeContract({
      address, abi: VAULT_ABI, functionName: 'deposit',
      args: [assets, receiver], account, chain: this.client.chain!,
    })

    return {
      hash,
      wait: async () => { await this.client.waitForTransactionReceipt({ hash }) },
    }
  }

  async redeem(token: 'USDC' | 'USDT', shares: bigint, receiver: Address, owner: Address): Promise<TxResult> {
    if (!this.wallet) throw new Error('WalletClient required for write operations')
    const address = this.getVaultAddress(token)
    const [account] = await this.wallet.getAddresses()
    if (!account) throw new Error('No wallet account')

    const hash = await this.wallet.writeContract({
      address, abi: VAULT_ABI, functionName: 'redeem',
      args: [shares, receiver, owner], account, chain: this.client.chain!,
    })

    return {
      hash,
      wait: async () => { await this.client.waitForTransactionReceipt({ hash }) },
    }
  }
}
