import { Bell, ExternalLink } from 'lucide-react'
import { useAccount, useChainId } from 'wagmi'
import { avalanche, avalancheFuji } from 'wagmi/chains'
import { ConnectButton } from '../wallet/ConnectButton'

const CHAIN_META: Record<number, { name: string; color: string; explorer: string }> = {
  [avalanche.id]: {
    name: 'Avalanche',
    color: 'text-avax',
    explorer: 'https://snowtrace.io',
  },
  [avalancheFuji.id]: {
    name: 'Fuji Testnet',
    color: 'text-status-warning',
    explorer: 'https://testnet.snowtrace.io',
  },
}

export function TopBar() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const chain = CHAIN_META[chainId]

  return (
    <header className="flex items-center justify-between h-12 px-6 border-b border-border bg-bg/80 backdrop-blur-md">
      {/* Left: chain indicator */}
      <div className="flex items-center gap-3">
        {chain && (
          <a
            href={chain.explorer}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md
                       bg-surface border border-border
                       hover:border-border-bright transition-all duration-150 group"
          >
            <div
              className={`w-1.5 h-1.5 rounded-full bg-current ${chain.color}`}
            />
            <span className={`text-2xs font-mono font-medium ${chain.color}`}>{chain.name}</span>
            <ExternalLink size={9} className="text-text-dim group-hover:text-text-muted" />
          </a>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2">
        {isConnected && (
          <button className="relative w-8 h-8 rounded-lg bg-surface border border-border
                             hover:border-border-bright
                             flex items-center justify-center transition-all duration-150
                             text-text-muted hover:text-text">
            <Bell size={14} />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-status-danger" />
          </button>
        )}
        <ConnectButton />
      </div>
    </header>
  )
}
