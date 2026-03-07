import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { useState } from 'react'
import { Wallet, ChevronDown, LogOut, Copy, ExternalLink } from 'lucide-react'
import { truncateAddress } from '../../lib/formatters'

interface ConnectButtonProps {
  compact?: boolean
}

export function ConnectButton({ compact = false }: ConnectButtonProps) {
  const { address, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showConnectors, setShowConnectors] = useState(false)

  if (isConnected && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                     bg-surface border border-border
                     hover:border-border-bright
                     transition-all duration-150"
        >
          <div className="w-5 h-5 rounded bg-accent/15 flex items-center justify-center">
            <span className="text-2xs font-mono font-bold text-accent">
              {address.slice(2, 4).toUpperCase()}
            </span>
          </div>
          {!compact && (
            <span className="text-xs font-mono text-text">
              {truncateAddress(address)}
            </span>
          )}
          <ChevronDown
            size={12}
            className={`text-text-dim transition-transform duration-150 ${
              showDropdown ? 'rotate-180' : ''
            }`}
          />
        </button>

        {showDropdown && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowDropdown(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-surface-elevated
                            border border-border shadow-card-hover z-20 overflow-hidden
                            animate-slide-up">
              <div className="px-3 py-2 border-b border-border">
                <div className="text-2xs font-mono text-text-dim uppercase tracking-widest">Wallet</div>
                <div className="text-xs font-mono text-text mt-0.5">
                  {truncateAddress(address, 6)}
                </div>
              </div>
              <div className="p-1">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(address)
                    setShowDropdown(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md
                             text-xs text-text-muted hover:text-text hover:bg-surface
                             transition-colors"
                >
                  <Copy size={12} />
                  Copy address
                </button>
                <a
                  href={`https://snowtrace.io/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md
                             text-xs text-text-muted hover:text-text hover:bg-surface
                             transition-colors"
                >
                  <ExternalLink size={12} />
                  Snowtrace
                </a>
                <button
                  onClick={() => {
                    disconnect()
                    setShowDropdown(false)
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md
                             text-xs text-status-danger hover:bg-status-danger/10
                             transition-colors"
                >
                  <LogOut size={12} />
                  Disconnect
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  if (showConnectors) {
    return (
      <div className="relative">
        <div className="absolute right-0 top-0 w-52 rounded-lg bg-surface-elevated
                        border border-border shadow-card-hover z-20 overflow-hidden
                        animate-slide-up">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
            <span className="text-xs font-medium text-text">Connect</span>
            <button
              onClick={() => setShowConnectors(false)}
              className="text-text-dim hover:text-text transition-colors text-sm leading-none"
            >
              ×
            </button>
          </div>
          <div className="p-1">
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                onClick={() => {
                  connect({ connector })
                  setShowConnectors(false)
                }}
                disabled={isPending}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md
                           text-xs font-medium text-text-muted hover:text-text
                           hover:bg-surface transition-all duration-150
                           disabled:opacity-40"
              >
                <div className="w-7 h-7 rounded-md bg-surface border border-border
                                flex items-center justify-center">
                  <Wallet size={12} className="text-text-muted" />
                </div>
                {connector.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setShowConnectors(true)}
      className={compact
        ? 'w-full btn-primary text-2xs py-1.5'
        : 'btn-primary text-xs'
      }
    >
      <Wallet size={13} />
      {compact ? 'Connect' : 'Connect Wallet'}
    </button>
  )
}
