import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { avalanche } from 'wagmi/chains'
import { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { AppShell } from './components/layout/AppShell'
import { Landing } from './pages/Landing'
import { Dashboard } from './pages/Dashboard'
import { Vaults } from './pages/Vaults'
import { Credit } from './pages/Credit'
import { Score } from './pages/Score'
import { Leaderboard } from './pages/Leaderboard'
import { ACTIVE_CHAIN_ID } from './wagmi.config'

export default function App() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const { setIsWrongNetwork } = useAppStore()

  // Auto-prompt network switch if on wrong chain
  useEffect(() => {
    if (isConnected && chainId !== ACTIVE_CHAIN_ID) {
      setIsWrongNetwork(true)
      switchChain({ chainId: ACTIVE_CHAIN_ID as typeof avalanche.id })
    } else {
      setIsWrongNetwork(false)
    }
  }, [isConnected, chainId, switchChain, setIsWrongNetwork])

  return (
    <BrowserRouter>
      <Routes>
        {/* Landing page — shown to unconnected users */}
        <Route path="/" element={<Landing />} />

        {/* App routes — require connection (handled inside components) */}
        <Route
          path="/app"
          element={<AppShell />}
        >
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="vaults" element={<Vaults />} />
          <Route path="credit" element={<Credit />} />
          <Route path="score" element={<Score />} />
          <Route path="leaderboard" element={<Leaderboard />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
