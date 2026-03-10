import type { PublicClient, WalletClient, Address } from 'viem'
import { CREDIT_ABI } from '../abis'
import type { CreditLineInfo, TxResult, ZeroXClientConfig } from '../types'

interface CreditLineRaw {
  collateralVault: Address
  collateralShares: bigint
  principal: bigint
  interestIndex: bigint
  openedAt: bigint
  isOpen: boolean
}

interface DebtRaw {
  principal: bigint
  interest: bigint
}

export class CreditModule {
  private client: PublicClient
  private wallet?: WalletClient
  private address?: Address

  constructor(config: ZeroXClientConfig) {
    this.client  = config.publicClient
    this.wallet  = config.walletClient
    this.address = config.addresses.credit
  }

  private ensureAddress(): Address {
    if (!this.address) throw new Error('Credit contract address not configured')
    return this.address
  }

  private ensureWallet(): WalletClient {
    if (!this.wallet) throw new Error('WalletClient required for write operations')
    return this.wallet
  }

  async getCreditLine(user: Address): Promise<CreditLineInfo> {
    const addr = this.ensureAddress()

    const [line, currentDebt, healthFactor, maxBorrowable, collateralUSD] = await Promise.all([
      this.client.readContract({ address: addr, abi: CREDIT_ABI, functionName: 'getCreditLine', args: [user] }) as Promise<CreditLineRaw>,
      this.client.readContract({ address: addr, abi: CREDIT_ABI, functionName: 'getCurrentDebt', args: [user] }) as Promise<DebtRaw>,
      this.client.readContract({ address: addr, abi: CREDIT_ABI, functionName: 'getHealthFactor', args: [user] }) as Promise<bigint>,
      this.client.readContract({ address: addr, abi: CREDIT_ABI, functionName: 'getMaxBorrowable', args: [user] }) as Promise<bigint>,
      this.client.readContract({ address: addr, abi: CREDIT_ABI, functionName: 'getCollateralUSD', args: [user] }) as Promise<bigint>,
    ])

    return {
      isOpen:           line.isOpen,
      collateralVault:  line.collateralVault,
      collateralShares: line.collateralShares,
      principal:        line.principal,
      interestIndex:    line.interestIndex,
      openedAt:         Number(line.openedAt),
      currentDebt: {
        principal: currentDebt.principal,
        interest:  currentDebt.interest,
      },
      healthFactor,
      maxBorrowable,
      collateralUSD,
    }
  }

  async getHealthFactor(user: Address): Promise<bigint> {
    const addr = this.ensureAddress()
    return this.client.readContract({ address: addr, abi: CREDIT_ABI, functionName: 'getHealthFactor', args: [user] }) as Promise<bigint>
  }

  async openCreditLine(collateralVault: Address, sharesToDeposit: bigint): Promise<TxResult> {
    const addr = this.ensureAddress()
    const wallet = this.ensureWallet()
    const [account] = await wallet.getAddresses()
    if (!account) throw new Error('No wallet account')

    const hash = await wallet.writeContract({
      address: addr, abi: CREDIT_ABI, functionName: 'openCreditLine',
      args: [collateralVault, sharesToDeposit], account, chain: this.client.chain!,
    })

    return { hash, wait: async () => { await this.client.waitForTransactionReceipt({ hash }) } }
  }

  async borrow(amount: bigint): Promise<TxResult> {
    const addr = this.ensureAddress()
    const wallet = this.ensureWallet()
    const [account] = await wallet.getAddresses()
    if (!account) throw new Error('No wallet account')

    const hash = await wallet.writeContract({
      address: addr, abi: CREDIT_ABI, functionName: 'borrow',
      args: [amount], account, chain: this.client.chain!,
    })

    return { hash, wait: async () => { await this.client.waitForTransactionReceipt({ hash }) } }
  }

  async repay(amount: bigint): Promise<TxResult> {
    const addr = this.ensureAddress()
    const wallet = this.ensureWallet()
    const [account] = await wallet.getAddresses()
    if (!account) throw new Error('No wallet account')

    const hash = await wallet.writeContract({
      address: addr, abi: CREDIT_ABI, functionName: 'repay',
      args: [amount], account, chain: this.client.chain!,
    })

    return { hash, wait: async () => { await this.client.waitForTransactionReceipt({ hash }) } }
  }

  async closeCreditLine(): Promise<TxResult> {
    const addr = this.ensureAddress()
    const wallet = this.ensureWallet()
    const [account] = await wallet.getAddresses()
    if (!account) throw new Error('No wallet account')

    const hash = await wallet.writeContract({
      address: addr, abi: CREDIT_ABI, functionName: 'closeCreditLine',
      args: [], account, chain: this.client.chain!,
    })

    return { hash, wait: async () => { await this.client.waitForTransactionReceipt({ hash }) } }
  }
}
