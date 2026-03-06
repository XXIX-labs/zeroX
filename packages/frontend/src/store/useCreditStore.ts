import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

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

export const useCreditStore = create<CreditStoreState>()(
  immer((set) => ({
    creditLine: null,
    loading:    false,
    error:      null,

    setCreditLine: (data) => set((state) => { state.creditLine = data }),
    setLoading:    (loading) => set((state) => { state.loading   = loading }),
    setError:      (error)   => set((state) => { state.error     = error   }),
  }))
)
