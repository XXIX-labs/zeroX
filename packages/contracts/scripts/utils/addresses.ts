// Avalanche C-Chain mainnet addresses (canonical)
export const MAINNET = {
  // Tokens
  USDC:  '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  USDT:  '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  WAVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
  // Agora USD — T-bill-backed stablecoin; same address across all EVM chains
  AUSD:  '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',

  // External Protocols
  AAVE_V3_POOL: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  AAVE_AUSDC:   '0x625E7708f30cA75bfd92586e17077590C60eb4cD',
  AAVE_AUSDT:   '0x6ab707Aca953eDAeFBc4fD23bA73294241490620',
  BENQI_USDC:   '0xB715808a78F6041E46d61Cb123C9B4A27056AE9C',
  BENQI_USDT:   '0x9B7b3D8ccE5F5eFB578FE38Bfb7b7D61fE68c09b',

  // Agora StableSwap (USDC/AUSD pair on Avalanche)
  // Deploy the pair address after coordinating with Agora for APPROVED_SWAPPER whitelist
  // See: https://docs.agora.finance/stable-swaps/smart-contracts
  AGORA_SWAP_USDC_AUSD: '' as string, // TBD — contact Agora team

  // Chainlink Price Feeds
  CL_AVAX_USD: '0x0A77230d17318075983913bC2145DB16C7366156',
  CL_USDC_USD: '0xF096872672F44d6EBA71527d2ae83EB827571358',
  CL_USDT_USD: '0xEBE676ee90Fe1112671f19b6B7459bC678B67e8a',
  // AUSD uses the USDC/USD feed as a proxy ($1.00 peg) — no dedicated Chainlink AUSD feed on Avalanche
  CL_AUSD_USD: '0xF096872672F44d6EBA71527d2ae83EB827571358',
} as const

// Fuji testnet addresses (for testing — tokens may differ)
export const FUJI = {
  USDC: '0x5425890298aed601595a70AB815c96711a31Bc65',
  USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  AUSD: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', // same address, Avalanche testnet

  // Aave V3 on Fuji
  AAVE_V3_POOL: '0x1775ECC8362dB6CaB0c7A9C0957cF656A5276c29',
  AAVE_AUSDC:   '0x8Be59D90A7Dc679C5cE5a7963cD1082dAB499918',

  // Benqi on Fuji (approximate — verify before deploy)
  BENQI_USDC: '0xB715808a78F6041E46d61Cb123C9B4A27056AE9C',

  // Agora StableSwap on Fuji (TBD — contact Agora for testnet deployment)
  AGORA_SWAP_USDC_AUSD: '' as string,

  // Chainlink on Fuji
  CL_AVAX_USD: '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD',
  CL_USDC_USD: '0x7898AcCC83587C3C55116c5230C17a07CD018F53',
  CL_USDT_USD: '0x7898AcCC83587C3C55116c5230C17a07CD018F53', // fallback same feed
  CL_AUSD_USD: '0x7898AcCC83587C3C55116c5230C17a07CD018F53', // proxy same as USDC
} as const
