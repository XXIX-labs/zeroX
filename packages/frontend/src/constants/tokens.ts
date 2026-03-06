export interface TokenMeta {
  symbol: string
  name: string
  decimals: number
  icon: string  // URL or SVG data URI
  coingeckoId: string
}

export const TOKENS: Record<string, TokenMeta> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg',
    coingeckoId: 'usd-coin',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    icon: 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
    coingeckoId: 'tether',
  },
  AUSD: {
    symbol: 'AUSD',
    name: 'Agora USD',
    decimals: 6,
    // Agora brand icon — use their official SVG
    icon: 'https://agora.finance/favicon.ico',
    coingeckoId: 'agora-usd',
  },
  AVAX: {
    symbol: 'AVAX',
    name: 'Avalanche',
    decimals: 18,
    icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg',
    coingeckoId: 'avalanche-2',
  },
}

export const VAULT_TOKENS = [TOKENS['USDC']!, TOKENS['USDT']!, TOKENS['AUSD']!] as const
