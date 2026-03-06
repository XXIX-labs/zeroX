import { AlertTriangle, X } from 'lucide-react'
import { useChainId, useSwitchChain } from 'wagmi'
import { useState } from 'react'
import { ACTIVE_CHAIN_ID } from '../../wagmi.config'
import { useAccount } from 'wagmi'

export function NetworkBanner() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending } = useSwitchChain()
  const [dismissed, setDismissed] = useState(false)

  if (!isConnected || chainId === ACTIVE_CHAIN_ID || dismissed) return null

  return (
    <div className="flex items-center justify-between px-6 py-2 bg-status-warning/5 border-b border-status-warning/15">
      <div className="flex items-center gap-2">
        <AlertTriangle size={14} className="text-status-warning flex-shrink-0" />
        <span className="text-xs font-mono text-status-warning">
          Wrong network — switch to {ACTIVE_CHAIN_ID === 43113 ? 'Fuji Testnet' : 'Avalanche C-Chain'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => switchChain({ chainId: ACTIVE_CHAIN_ID })}
          disabled={isPending}
          className="px-2.5 py-1 rounded bg-status-warning/15 text-status-warning
                     text-2xs font-mono font-medium border border-status-warning/20
                     hover:bg-status-warning/25 transition-colors disabled:opacity-50"
        >
          {isPending ? 'Switching...' : 'Switch'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-text-dim hover:text-text-muted transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}
