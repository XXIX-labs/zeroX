import { create } from 'zustand'

interface CreditLineData {
  isOpen:           boolean
  collateralVault:  string
  collateralShares: bigint
  principal:        bigint
  interestIndex:    bigint
  openedAt:         number
  currentDebt: {
    principal: bigint
    interest:  bigint
  }
  healthFactor:  bigint
  maxBorrowable: bigint
  collateralUSD: bigint
}

interface CreditStoreState {
  creditLine: CreditLineData | null
  loading:    boolean
  error:      string | null

  setCreditLine: (data: CreditLineData | null) => void
  setLoading:    (loading: boolean) => void
  setError:      (error: string | null) => void
}

export const useCreditStore = create<CreditStoreState>()((set) => ({
  creditLine: null,
  loading:    false,
  error:      null,

  setCreditLine: (data) => set({ creditLine: data }),
  setLoading:    (loading) => set({ loading }),
  setError:      (error)   => set({ error }),
}))
