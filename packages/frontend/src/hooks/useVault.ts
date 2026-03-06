import { useReadContract, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { useAccount, useChainId } from 'wagmi'
import { parseUnits, formatUnits, type Address } from 'viem'
import { useCallback, useState } from 'react'
import { ADDRESSES } from '../constants/addresses'
import { TOKENS } from '../constants/tokens'
import toast from 'react-hot-toast'

// Minimal ABIs for vault interaction
const VAULT_ABI = [
  { type: 'function', name: 'totalAssets',      inputs: [],                    outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'totalSupply',      inputs: [],                    outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'balanceOf',        inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'convertToAssets',  inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'previewDeposit',   inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'previewRedeem',    inputs: [{ type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getAaveAPY',       inputs: [],                    outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getBenqiAPY',      inputs: [],                    outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'aaveAllocation',   inputs: [],                    outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'benqiAllocation',  inputs: [],                    outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'getUserPositionUSD', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'deposit',          inputs: [{ type: 'uint256' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'redeem',           inputs: [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'nonpayable' },
] as const

const ERC20_ABI = [
  { type: 'function', name: 'allowance', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve',   inputs: [{ type: 'address' }, { type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' },
] as const

export type VaultToken = 'USDC' | 'USDT'

export function useVaultInfo(token: VaultToken) {
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const vaultAddress = token === 'USDC' ? addrs?.vaultUSDC : addrs?.vaultUSDT

  const { data: totalAssets } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'totalAssets',
    query: { refetchInterval: 30_000 },
  })

  const { data: totalSupply } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'totalSupply',
    query: { refetchInterval: 30_000 },
  })

  const { data: aaveApy } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'getAaveAPY',
    query: { refetchInterval: 60_000 },
  })

  const { data: benqiApy } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'getBenqiAPY',
    query: { refetchInterval: 60_000 },
  })

  const { data: aaveAlloc } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'aaveAllocation',
    query: { staleTime: Infinity },
  })

  const { data: benqiAlloc } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'benqiAllocation',
    query: { staleTime: Infinity },
  })

  const decimals = token === 'USDC' || token === 'USDT' ? 6 : 18

  // Blended APY: (aaveApy * aaveAlloc + benqiApy * benqiAlloc) / 10000
  const totalAlloc = (aaveAlloc ?? 0n) + (benqiAlloc ?? 0n)
  const blendedApyBps = totalAlloc > 0n
    ? ((aaveApy ?? 0n) * (aaveAlloc ?? 0n) + (benqiApy ?? 0n) * (benqiAlloc ?? 0n)) / totalAlloc
    : 0n

  return {
    vaultAddress,
    totalAssets: totalAssets ?? 0n,
    totalSupply: totalSupply ?? 0n,
    tvlFormatted: formatUnits(totalAssets ?? 0n, decimals),
    blendedApyBps,
    aaveApyBps:    aaveApy ?? 0n,
    benqiApyBps:   benqiApy ?? 0n,
    aaveAllocBps:  aaveAlloc ?? 0n,
    benqiAllocBps: benqiAlloc ?? 0n,
  }
}

export function useUserVaultPosition(token: VaultToken) {
  const { address: user } = useAccount()
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const vaultAddress = token === 'USDC' ? addrs?.vaultUSDC : addrs?.vaultUSDT

  const { data: shares, refetch: refetchShares } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: !!user && !!vaultAddress, refetchInterval: 15_000 },
  })

  const { data: assetsUSD } = useReadContract({
    address: vaultAddress, abi: VAULT_ABI, functionName: 'convertToAssets',
    args: shares && shares > 0n ? [shares] : undefined,
    query: { enabled: !!shares && shares > 0n, refetchInterval: 15_000 },
  })

  return {
    shares:      shares ?? 0n,
    assetsUSD:   assetsUSD ?? 0n,
    refetchShares,
  }
}

export function useDeposit(token: VaultToken) {
  const { address: user } = useAccount()
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const vaultAddress = token === 'USDC' ? addrs?.vaultUSDC : addrs?.vaultUSDT
  const tokenMeta = TOKENS[token]

  const { writeContractAsync } = useWriteContract()
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>()
  const [depositHash, setDepositHash] = useState<`0x${string}` | undefined>()
  const [isPending, setIsPending] = useState(false)

  const { isLoading: waitingApproval } = useWaitForTransactionReceipt({ hash: approvalHash })
  const { isLoading: waitingDeposit }  = useWaitForTransactionReceipt({ hash: depositHash })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address:      tokenMeta?.address as Address | undefined,
    abi:          [{ type: 'function', name: 'allowance', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }] as const,
    functionName: 'allowance',
    args: user && vaultAddress ? [user, vaultAddress] : undefined,
    query: { enabled: !!user && !!vaultAddress },
  })

  const deposit = useCallback(async (amountFormatted: string) => {
    if (!user || !vaultAddress || !tokenMeta) return
    const amount = parseUnits(amountFormatted, tokenMeta.decimals)
    setIsPending(true)

    try {
      // Step 1: Approve if needed
      if ((allowance ?? 0n) < amount) {
        toast.loading('Approving token spend…', { id: 'deposit' })
        const appHash = await writeContractAsync({
          address:      tokenMeta.address as Address,
          abi:          [{ type: 'function', name: 'approve', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'nonpayable' }] as const,
          functionName: 'approve',
          args:         [vaultAddress, amount],
        })
        setApprovalHash(appHash)
        // Wait for confirmation
        toast.loading('Waiting for approval…', { id: 'deposit' })
        // Re-check allowance will happen via refetch
        await refetchAllowance()
      }

      // Step 2: Deposit
      toast.loading('Depositing…', { id: 'deposit' })
      const depHash = await writeContractAsync({
        address:      vaultAddress,
        abi:          VAULT_ABI,
        functionName: 'deposit',
        args:         [amount, user],
      })
      setDepositHash(depHash)
      toast.success('Deposit submitted!', { id: 'deposit' })
      return depHash
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      toast.error(message.slice(0, 100), { id: 'deposit' })
      throw err
    } finally {
      setIsPending(false)
    }
  }, [user, vaultAddress, tokenMeta, allowance, writeContractAsync, refetchAllowance])

  return {
    deposit,
    isPending: isPending || waitingApproval || waitingDeposit,
    approvalHash,
    depositHash,
  }
}

export function useWithdraw(token: VaultToken) {
  const { address: user } = useAccount()
  const chainId = useChainId()
  const addrs = ADDRESSES[chainId]
  const vaultAddress = token === 'USDC' ? addrs?.vaultUSDC : addrs?.vaultUSDT

  const { writeContractAsync } = useWriteContract()
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [isPending, setIsPending] = useState(false)

  const { isLoading: waiting } = useWaitForTransactionReceipt({ hash: txHash })

  const withdraw = useCallback(async (shares: bigint) => {
    if (!user || !vaultAddress) return
    setIsPending(true)

    try {
      toast.loading('Withdrawing…', { id: 'withdraw' })
      const hash = await writeContractAsync({
        address:      vaultAddress,
        abi:          VAULT_ABI,
        functionName: 'redeem',
        args:         [shares, user, user],
      })
      setTxHash(hash)
      toast.success('Withdrawal submitted!', { id: 'withdraw' })
      return hash
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      toast.error(message.slice(0, 100), { id: 'withdraw' })
      throw err
    } finally {
      setIsPending(false)
    }
  }, [user, vaultAddress, writeContractAsync])

  return { withdraw, isPending: isPending || waiting, txHash }
}
