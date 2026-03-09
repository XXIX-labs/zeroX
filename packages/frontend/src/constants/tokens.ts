export interface TokenMeta {
  symbol: string
  name: string
  decimals: number
  address: string
  icon: string  // URL or SVG data URI
  coingeckoId: string
}

export const TOKENS: Record<string, TokenMeta> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    address: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.svg',
    coingeckoId: 'usd-coin',
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    address: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    icon: 'https://cryptologos.cc/logos/tether-usdt-logo.svg',
    coingeckoId: 'tether',
  },
  AUSD: {
    symbol: 'AUSD',
    name: 'Agora USD',
    decimals: 6,
    address: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
    // Agora brand icon — use their official SVG
    icon: 'https://agora.finance/favicon.ico',
    coingeckoId: 'agora-usd',
  },
  AVAX: {
    symbol: 'AVAX',
    name: 'Avalanche',
    decimals: 18,
    address: '0x0000000000000000000000000000000000000000',
    icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.svg',
    coingeckoId: 'avalanche-2',
  },
}

export const VAULT_TOKENS = [TOKENS['USDC']!, TOKENS['USDT']!, TOKENS['AUSD']!] as const
