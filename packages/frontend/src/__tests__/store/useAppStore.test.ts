import { describe, it, expect, beforeEach } from 'vitest'
import { useAppStore } from '@/store/useAppStore'

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAppStore.setState({
      activeModal: null,
      modalContext: {},
      sidebarCollapsed: false,
      pendingTx: null,
      isWrongNetwork: false,
    })
  })

  // ─── Modal ──────────────────────────────────────────────────────────────

  describe('modal actions', () => {
    it('initializes with no active modal', () => {
      expect(useAppStore.getState().activeModal).toBeNull()
      expect(useAppStore.getState().modalContext).toEqual({})
    })

    it('opens a modal', () => {
      useAppStore.getState().openModal('deposit')
      expect(useAppStore.getState().activeModal).toBe('deposit')
    })

    it('opens a modal with context', () => {
      useAppStore.getState().openModal('withdraw', { vaultAddress: '0x123' })
      expect(useAppStore.getState().activeModal).toBe('withdraw')
      expect(useAppStore.getState().modalContext).toEqual({ vaultAddress: '0x123' })
    })

    it('opens modal with empty context when none provided', () => {
      useAppStore.getState().openModal('borrow')
      expect(useAppStore.getState().modalContext).toEqual({})
    })

    it('closes a modal and clears context', () => {
      useAppStore.getState().openModal('deposit', { amount: 100 })
      useAppStore.getState().closeModal()
      expect(useAppStore.getState().activeModal).toBeNull()
      expect(useAppStore.getState().modalContext).toEqual({})
    })

    it('can switch modals', () => {
      useAppStore.getState().openModal('deposit')
      useAppStore.getState().openModal('withdraw')
      expect(useAppStore.getState().activeModal).toBe('withdraw')
    })

    it('supports all modal types', () => {
      const modals = ['deposit', 'withdraw', 'borrow', 'repay', 'openCredit', 'addCollateral'] as const
      for (const modal of modals) {
        useAppStore.getState().openModal(modal)
        expect(useAppStore.getState().activeModal).toBe(modal)
      }
    })
  })

  // ─── Sidebar ────────────────────────────────────────────────────────────

  describe('sidebar', () => {
    it('initializes with sidebar expanded', () => {
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    })

    it('toggles sidebar collapsed', () => {
      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)
    })

    it('toggles sidebar back to expanded', () => {
      useAppStore.getState().toggleSidebar()
      useAppStore.getState().toggleSidebar()
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
    })

    it('toggles multiple times correctly', () => {
      const toggle = useAppStore.getState().toggleSidebar
      toggle()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)
      toggle()
      expect(useAppStore.getState().sidebarCollapsed).toBe(false)
      toggle()
      expect(useAppStore.getState().sidebarCollapsed).toBe(true)
    })
  })

  // ─── Pending Transaction ────────────────────────────────────────────────

  describe('pendingTx', () => {
    it('initializes with no pending transaction', () => {
      expect(useAppStore.getState().pendingTx).toBeNull()
    })

    it('sets a pending transaction hash', () => {
      useAppStore.getState().setPendingTx('0xabc123')
      expect(useAppStore.getState().pendingTx).toBe('0xabc123')
    })

    it('clears a pending transaction', () => {
      useAppStore.getState().setPendingTx('0xabc123')
      useAppStore.getState().setPendingTx(null)
      expect(useAppStore.getState().pendingTx).toBeNull()
    })

    it('replaces a pending transaction', () => {
      useAppStore.getState().setPendingTx('0xfirst')
      useAppStore.getState().setPendingTx('0xsecond')
      expect(useAppStore.getState().pendingTx).toBe('0xsecond')
    })
  })

  // ─── Network ────────────────────────────────────────────────────────────

  describe('isWrongNetwork', () => {
    it('initializes as false', () => {
      expect(useAppStore.getState().isWrongNetwork).toBe(false)
    })

    it('sets wrong network to true', () => {
      useAppStore.getState().setIsWrongNetwork(true)
      expect(useAppStore.getState().isWrongNetwork).toBe(true)
    })

    it('sets wrong network back to false', () => {
      useAppStore.getState().setIsWrongNetwork(true)
      useAppStore.getState().setIsWrongNetwork(false)
      expect(useAppStore.getState().isWrongNetwork).toBe(false)
    })
  })
})
