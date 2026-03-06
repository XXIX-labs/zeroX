import { create } from 'zustand'

type Modal = 'deposit' | 'withdraw' | 'borrow' | 'repay' | 'openCredit' | 'addCollateral' | null

interface AppState {
  // Active modal
  activeModal: Modal
  modalContext: Record<string, unknown>
  openModal: (modal: Modal, context?: Record<string, unknown>) => void
  closeModal: () => void

  // Sidebar
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Transaction states
  pendingTx: string | null
  setPendingTx: (tx: string | null) => void

  // Network
  isWrongNetwork: boolean
  setIsWrongNetwork: (wrong: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  activeModal: null,
  modalContext: {},
  openModal: (modal, context = {}) =>
    set({ activeModal: modal, modalContext: context }),
  closeModal: () =>
    set({ activeModal: null, modalContext: {} }),

  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  pendingTx: null,
  setPendingTx: (tx) => set({ pendingTx: tx }),

  isWrongNetwork: false,
  setIsWrongNetwork: (wrong) => set({ isWrongNetwork: wrong }),
}))
