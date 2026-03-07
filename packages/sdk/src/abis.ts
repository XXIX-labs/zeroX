import { parseAbi } from 'viem'

export const VAULT_ABI = parseAbi([
  // ERC-4626
  'function totalAssets() view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function convertToShares(uint256 assets) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function maxDeposit(address receiver) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function previewWithdraw(uint256 assets) view returns (uint256)',
  'function previewRedeem(uint256 shares) view returns (uint256)',
  'function asset() view returns (address)',
  'function balanceOf(address account) view returns (uint256)',
  'function deposit(uint256 assets, address receiver) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address owner) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address owner) returns (uint256 assets)',
  // ZeroX extensions
  'function getAaveAPY() view returns (uint256)',
  'function getBenqiAPY() view returns (uint256)',
  'function aaveAllocation() view returns (uint256)',
  'function benqiAllocation() view returns (uint256)',
  'function getUserPositionUSD(address user) view returns (uint256)',
  // Events
  'event Deposit(address indexed caller, address indexed owner, uint256 assets, uint256 shares)',
  'event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 assets, uint256 shares)',
])

export const CREDIT_ABI = parseAbi([
  // Structs returned as tuples
  'function getCreditLine(address user) view returns (tuple(address collateralVault, uint256 collateralShares, uint256 principal, uint256 interestIndex, uint256 openedAt, bool isOpen))',
  'function getHealthFactor(address user) view returns (uint256)',
  'function getCurrentDebt(address user) view returns (uint256 principal, uint256 interest)',
  'function getMaxBorrowable(address user) view returns (uint256)',
  'function getCollateralUSD(address user) view returns (uint256)',
  // Write
  'function openCreditLine(address collateralVault, uint256 sharesToDeposit) returns ()',
  'function borrow(uint256 amount) returns ()',
  'function repay(uint256 amount) returns ()',
  'function closeCreditLine() returns ()',
  // Events
  'event CreditLineOpened(address indexed user, address collateralVault, uint256 collateralShares)',
  'event Borrowed(address indexed user, uint256 amount)',
  'event Repaid(address indexed user, uint256 principal, uint256 interest)',
  'event Liquidated(address indexed user, address indexed liquidator, uint256 debt, uint256 collateralSeized)',
])

export const SCORE_ABI = parseAbi([
  'function getScore(address user) view returns (uint16)',
  'function getScoreData(address user) view returns (tuple(uint16 score, uint40 lastUpdated, uint32 repaymentSignal, uint32 utilizationSignal, uint32 accountAgeSignal, uint32 collateralSignal, uint32 diversificationSignal, uint32 totalRepayments, uint32 onTimeRepayments, uint32 totalVolumeUSD, uint8 liquidationCount, uint40 firstDepositAt))',
  'function getRiskTier(uint16 score) pure returns (string)',
  'function isInitialized(address user) view returns (bool)',
])

export const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
])
