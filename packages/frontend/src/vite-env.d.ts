/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WC_PROJECT_ID: string
  readonly VITE_WALLETCONNECT_PROJECT_ID: string
  readonly VITE_ALCHEMY_API_KEY: string
  readonly VITE_API_URL: string
  readonly VITE_CHAIN_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  avalanche?: {
    isAvalanche?: boolean
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    on: (event: string, handler: (...args: unknown[]) => void) => void
  }
}
