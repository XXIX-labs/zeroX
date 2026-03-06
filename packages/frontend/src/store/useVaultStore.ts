import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface VaultData {
  address:    string
  token:      'USDC' | 'USDT'
  tvl:        string
  apy:        string
  sharePrice: string
  aaveApy:    string | null
  benqiApy:   string | null
  aaveAlloc:  number | null
  benqiAlloc: number | null
}

interface UserVaultPosition {
  shares:    bigint
  assetsUSD: bigint
}

interface VaultStoreState {
  vaults:    Record<string, VaultData>          // keyed by address
  positions: Record<string, UserVaultPosition>  // keyed by `${vaultAddress}:${userAddress}`
  loading:   boolean
  error:     string | null

  setVault:    (data: VaultData) => void
  setPosition: (vaultAddress: string, userAddress: string, position: UserVaultPosition) => void
  setLoading:  (loading: boolean) => void
  setError:    (error: string | null) => void
}

export const useVaultStore = create<VaultStoreState>()(
  immer((set) => ({
    vaults:    {},
    positions: {},
    loading:   false,
    error:     null,

    setVault: (data) => set((state) => {
      state.vaults[data.address.toLowerCase()] = data
    }),

    setPosition: (vaultAddress, userAddress, position) => set((state) => {
      const key = `${vaultAddress.toLowerCase()}:${userAddress.toLowerCase()}`
      state.positions[key] = position
    }),

    setLoading: (loading) => set((state) => { state.loading = loading }),
    setError:   (error)   => set((state) => { state.error   = error   }),
  }))
)
