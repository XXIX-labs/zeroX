import { parseAbi } from 'viem'

export const VAULT_ABI = parseAbi([
  'event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
  'event StrategyRebalanced(uint256 aaveAmount, uint256 benqiAmount)',
  'event YieldHarvested(uint256 yield)',
])

export const CREDIT_ABI = parseAbi([
  'event CreditLineOpened(address indexed user, address collateralVault, uint256 collateralShares)',
  'event Borrowed(address indexed user, uint256 amount)',
  'event Repaid(address indexed user, uint256 principal, uint256 interest)',
  'event Liquidated(address indexed user, address indexed liquidator, uint256 debt, uint256 collateralSeized)',
  'event CreditLineClosed(address indexed user)',
])

export const SCORE_ABI = parseAbi([
  'event ScoreInitialized(address indexed user, uint16 initialScore)',
  'event ScoreUpdated(address indexed user, uint16 oldScore, uint16 newScore, uint8 trigger)',
  'event SignalsUpdated(address indexed user, uint32[5] signals)',
])
