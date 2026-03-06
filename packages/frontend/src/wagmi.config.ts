import { createConfig, http } from 'wagmi'
import { avalanche, avalancheFuji } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'

const walletConnectProjectId = import.meta.env['VITE_WC_PROJECT_ID'] ?? ''
const alchemyApiKey = import.meta.env['VITE_ALCHEMY_API_KEY'] ?? ''

// Avalanche C-Chain RPC endpoints (with Alchemy fallback)
const avalancheRpc = alchemyApiKey
  ? `https://avax-mainnet.g.alchemy.com/v2/${alchemyApiKey}`
  : 'https://api.avax.network/ext/bc/C/rpc'

const fujiRpc = alchemyApiKey
  ? `https://avax-fuji.g.alchemy.com/v2/${alchemyApiKey}`
  : 'https://api.avax-test.network/ext/bc/C/rpc'

export const wagmiConfig = createConfig({
  chains: [avalanche, avalancheFuji],
  connectors: [
    // MetaMask / injected wallets (includes Core Wallet)
    injected({
      target: 'metaMask',
    }),
    // Core Wallet (Avalanche native)
    injected({
      target: {
        id: 'coreWallet',
        name: 'Core Wallet',
        provider(window) {
          return window?.avalanche
        },
      },
    }),
    // WalletConnect v2 (all mobile wallets)
    walletConnect({
      projectId: walletConnectProjectId,
      metadata: {
        name: 'ZeroX Protocol',
        description: 'Yield vaults, credit lines, and on-chain credit scoring on Avalanche',
        url: 'https://app.zeroxprotocol.xyz',
        icons: ['https://app.zeroxprotocol.xyz/logo.svg'],
      },
    }),
    // Coinbase Wallet
    coinbaseWallet({
      appName: 'ZeroX Protocol',
      appLogoUrl: 'https://app.zeroxprotocol.xyz/logo.svg',
    }),
  ],
  transports: {
    [avalanche.id]: http(avalancheRpc),
    [avalancheFuji.id]: http(fujiRpc),
  },
})

// Chain ID for the active network
export const ACTIVE_CHAIN_ID = Number(
  import.meta.env['VITE_CHAIN_ID'] ?? avalanche.id
)
