import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { useAccount, useChainId } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { useCallback, useState } from 'react'
import { ADDRESSES } from '../constants/addresses'
import toast from 'react-hot-toast'

const CREDIT_ABI = [
  { type: 'function', name: 'getCreditLine',    inputs: [{ type: 'address' }], outputs: [{ type: 'tuple', components: [{ name: 'collateralVault', type: 'address' }, { name: 'collateralShares', type: 'uint256' }, { name: 'principal', type: 'uint256' }, { name: 'interestIndex', type: 'uint256' }, { name: 'openedAt', type: 'uint256' }, { name: 'isOpen', type: 'bool' }] }], stateMutability: 'view' },
  { type: 'function', name: 'getCurrentDebt',   inputs: [{ type: 'address' }], outputs: [{ name: 'principal', type: 'uint256' }, { name: 'interest', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getHealthFactor',  inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getMaxBorrowable', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getCollateralUSD', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'openCreditLine',   inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'borrow',           inputs: [{ type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'repay',            inputs: [{ type: 'uint256' }], outputs: [], stateMutability: 'nonpayable' },
  { type: 'function', name: 'closeCreditLine',  inputs: [], outputs: [], stateMutability: 'nonpayable' },
] as const

export function useCreditLine() {
  const { address: user } = useAccount()
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const creditAddress = addrs?.credit

  const { data: creditLine, refetch: refetchLine } = useReadContract({
    address:      creditAddress,
    abi:          CREDIT_ABI,
    functionName: 'getCreditLine',
    args:         user ? [user] : undefined,
    query: { enabled: !!user && !!creditAddress, refetchInterval: 15_000 },
  })

  const { data: debt } = useReadContract({
    address:      creditAddress,
    abi:          CREDIT_ABI,
    functionName: 'getCurrentDebt',
    args:         user ? [user] : undefined,
    query: { enabled: !!user && !!creditAddress && creditLine?.isOpen, refetchInterval: 15_000 },
  })

  const { data: healthFactor } = useReadContract({
    address:      creditAddress,
    abi:          CREDIT_ABI,
    functionName: 'getHealthFactor',
    args:         user ? [user] : undefined,
    query: { enabled: !!user && !!creditAddress && creditLine?.isOpen, refetchInterval: 10_000 },
  })

  const { data: maxBorrowable } = useReadContract({
    address:      creditAddress,
    abi:          CREDIT_ABI,
    functionName: 'getMaxBorrowable',
    args:         user ? [user] : undefined,
    query: { enabled: !!user && !!creditAddress && creditLine?.isOpen, refetchInterval: 15_000 },
  })

  const { data: collateralUSD } = useReadContract({
    address:      creditAddress,
    abi:          CREDIT_ABI,
    functionName: 'getCollateralUSD',
    args:         user ? [user] : undefined,
    query: { enabled: !!user && !!creditAddress && creditLine?.isOpen, refetchInterval: 15_000 },
  })

  const totalDebt = (debt?.principal ?? 0n) + (debt?.interest ?? 0n)

  // LTV in bps: (totalDebt / collateralUSD) * 10000
  const ltvBps = collateralUSD && collateralUSD > 0n
    ? (totalDebt * 10_000n) / collateralUSD
    : 0n

  return {
    isOpen:         creditLine?.isOpen ?? false,
    collateralVault: creditLine?.collateralVault,
    collateralShares: creditLine?.collateralShares ?? 0n,
    principal:      debt?.principal ?? 0n,
    interest:       debt?.interest ?? 0n,
    totalDebt,
    healthFactor:   healthFactor ?? 0n,
    maxBorrowable:  maxBorrowable ?? 0n,
    collateralUSD:  collateralUSD ?? 0n,
    ltvBps,
    refetchLine,
  }
}

export function useOpenCreditLine() {
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const creditAddress = addrs?.credit
  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [isPending, setIsPending] = useState(false)
  const { isLoading: waiting } = useWaitForTransactionReceipt({ hash: txHash })

  const openCreditLine = useCallback(async (collateralVault: Address, shares: bigint) => {
    if (!creditAddress) return
    setIsPending(true)
    try {
      toast.loading('Opening credit line…', { id: 'credit-open' })
      const hash = await writeContractAsync({
        address: creditAddress, abi: CREDIT_ABI, functionName: 'openCreditLine',
        args: [collateralVault, shares],
      })
      setTxHash(hash)
      toast.success('Credit line opened!', { id: 'credit-open' })
      return hash
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed'
      toast.error(message.slice(0, 100), { id: 'credit-open' })
      throw err
    } finally {
      setIsPending(false)
    }
  }, [creditAddress, writeContractAsync])

  return { openCreditLine, isPending: isPending || waiting, txHash }
}

export function useBorrow() {
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const creditAddress = addrs?.credit
  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [isPending, setIsPending] = useState(false)
  const { isLoading: waiting } = useWaitForTransactionReceipt({ hash: txHash })

  const borrow = useCallback(async (amountFormatted: string) => {
    if (!creditAddress) return
    const amount = parseUnits(amountFormatted, 6) // USDC/USDT 6 decimals
    setIsPending(true)
    try {
      toast.loading('Submitting borrow…', { id: 'borrow' })
      const hash = await writeContractAsync({
        address: creditAddress, abi: CREDIT_ABI, functionName: 'borrow', args: [amount],
      })
      setTxHash(hash)
      toast.success('Borrow submitted!', { id: 'borrow' })
      return hash
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed'
      toast.error(message.slice(0, 100), { id: 'borrow' })
      throw err
    } finally {
      setIsPending(false)
    }
  }, [creditAddress, writeContractAsync])

  return { borrow, isPending: isPending || waiting, txHash }
}

export function useRepay() {
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const creditAddress = addrs?.credit
  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [isPending, setIsPending] = useState(false)
  const { isLoading: waiting } = useWaitForTransactionReceipt({ hash: txHash })

  const repay = useCallback(async (amountFormatted: string) => {
    if (!creditAddress) return
    const amount = parseUnits(amountFormatted, 6)
    setIsPending(true)
    try {
      toast.loading('Repaying…', { id: 'repay' })
      const hash = await writeContractAsync({
        address: creditAddress, abi: CREDIT_ABI, functionName: 'repay', args: [amount],
      })
      setTxHash(hash)
      toast.success('Repayment submitted!', { id: 'repay' })
      return hash
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed'
      toast.error(message.slice(0, 100), { id: 'repay' })
      throw err
    } finally {
      setIsPending(false)
    }
  }, [creditAddress, writeContractAsync])

  return { repay, isPending: isPending || waiting, txHash }
}
