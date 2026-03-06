import { NavLink, useLocation } from 'react-router-dom'
import { useAccount, useBalance } from 'wagmi'
import { ACTIVE_CHAIN_ID } from '../../wagmi.config'
import {
  LayoutDashboard,
  Vault,
  CreditCard,
  BarChart3,
  Trophy,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { truncateAddress, formatTokenAmount } from '../../lib/formatters'
import { ConnectButton } from '../wallet/ConnectButton'

const NAV_ITEMS = [
  { path: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/app/vaults', label: 'Vaults', icon: Vault },
  { path: '/app/credit', label: 'Credit', icon: CreditCard },
  { path: '/app/score', label: 'Score', icon: BarChart3 },
  { path: '/app/leaderboard', label: 'Leaderboard', icon: Trophy },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useAppStore()
  const { address, isConnected } = useAccount()
  const location = useLocation()

  const { data: avaxBalance } = useBalance({
    address,
    chainId: ACTIVE_CHAIN_ID,
  })

  return (
    <aside
      className={`relative flex flex-col h-full border-r border-border bg-bg
                  transition-all duration-300 ease-in-out flex-shrink-0
                  ${sidebarCollapsed ? 'w-[64px]' : 'w-[220px]'}`}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-4 border-b border-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center">
            <span className="text-xs font-bold text-accent font-mono tracking-tighter">0X</span>
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text leading-none tracking-tight">ZeroX</div>
              <div className="text-2xs text-text-dim font-mono leading-none mt-0.5">protocol</div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto no-scrollbar">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const isActive = location.pathname === path ||
            (path !== '/app/dashboard' && location.pathname.startsWith(path))

          return (
            <NavLink
              key={path}
              to={path}
              className={({ isActive: routerActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium
                 transition-all duration-150 group relative
                 ${routerActive || isActive
                   ? 'bg-accent-dim text-accent'
                   : 'text-text-muted hover:bg-surface hover:text-text'
                 }`
              }
              title={sidebarCollapsed ? label : undefined}
            >
              {(isActive || location.pathname === path) && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-accent rounded-r" />
              )}
              <Icon
                size={16}
                strokeWidth={isActive ? 2.5 : 2}
                className="flex-shrink-0"
              />
              {!sidebarCollapsed && (
                <span className="truncate">{label}</span>
              )}
            </NavLink>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border p-2 space-y-1.5">
        {/* Chain indicator */}
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-glow" />
            <span className="text-2xs font-mono text-text-muted">AVAX C-Chain</span>
          </div>
        )}

        {/* Connected wallet */}
        {isConnected && address ? (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-border
            ${sidebarCollapsed ? 'justify-center' : ''}`}
          >
            <div className="flex-shrink-0 w-6 h-6 rounded bg-accent/15 flex items-center justify-center">
              <span className="text-2xs font-mono font-bold text-accent">
                {address.slice(2, 4).toUpperCase()}
              </span>
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-mono text-text truncate">
                  {truncateAddress(address)}
                </div>
                {avaxBalance && (
                  <div className="text-2xs font-mono text-text-dim">
                    {formatTokenAmount(avaxBalance.value, 18, 4)} AVAX
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className={sidebarCollapsed ? 'flex justify-center' : ''}>
            {sidebarCollapsed ? (
              <button className="w-8 h-8 rounded-lg bg-accent/10 border border-accent/20
                flex items-center justify-center text-accent text-xs font-mono font-bold">
                +
              </button>
            ) : (
              <ConnectButton compact />
            )}
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-16 w-5 h-5 rounded-full
                   bg-surface border border-border
                   flex items-center justify-center
                   text-text-muted hover:text-accent hover:border-accent/30
                   transition-all duration-150
                   z-10"
      >
        {sidebarCollapsed ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
      </button>
    </aside>
  )
}
