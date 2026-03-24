import { Address, Asset, Operation, Transaction, Server, Horizon } from 'stellar-sdk';

// Core Types
export interface AssetInfo {
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  assetType: AssetType;
  metadata: Record<string, string>;
  complianceRegistry: Address;
  dividendDistributor: Address;
  tokenAddress: Address;
  createdAt: Date;
  isPaused: boolean;
  isFrozen: boolean;
}

export enum AssetType {
  REAL_ESTATE = 'real_estate',
  COMMODITY = 'commodity',
  INVOICE = 'invoice',
  SECURITY = 'security',
  BOND = 'bond',
  ART = 'art',
  INTELLECTUAL_PROPERTY = 'intellectual_property'
}

export interface Balance {
  amount: string;
  lockedAmount: string;
  votingPower: string;
  lastDividendClaim: Date;
}

export interface KYCStatus {
  isVerified: boolean;
  verificationLevel: VerificationLevel;
  expiryDate: Date;
  jurisdiction: string;
  isAccredited: boolean;
  riskScore: number; // 1-5, 5=lowest risk
  amlFlags: string[];
}

export enum VerificationLevel {
  BASIC = 1,
  ENHANCED = 2,
  INSTITUTIONAL = 3
}

export interface TransferLimits {
  dailyLimit: string;
  monthlyLimit: string;
  annualLimit: string;
  remainingDaily: string;
  remainingMonthly: string;
  remainingAnnual: string;
  lastResetDaily: Date;
  lastResetMonthly: Date;
  lastResetAnnual: Date;
}

export interface ComplianceRule {
  ruleId: string;
  name: string;
  description: string;
  isActive: boolean;
  jurisdictions: string[];
  minVerificationLevel: VerificationLevel;
  requiresAccreditation: boolean;
  maxAmount: string;
}

export interface DividendDistribution {
  distributionId: number;
  tokenAddress: Address;
  currency: Currency;
  totalAmount: string;
  perTokenAmount: string;
  totalSupply: string;
  claimDeadline: Date;
  createdAt: Date;
  isActive: boolean;
  metadata: Record<string, string>;
}

export enum Currency {
  XLM = 'XLM',
  USDC = 'USDC',
  EURC = 'EURC',
  BTC = 'BTC',
  ETH = 'ETH'
}

export interface ClaimInfo {
  distributionId: number;
  claimer: Address;
  amountClaimed: string;
  claimedAt: Date;
  currency: Currency;
}

export interface DividendConfig {
  supportedCurrencies: Currency[];
  autoDistribute: boolean;
  minDistributionAmount: string;
  maxDistributionFrequency: number; // in seconds
  feeRate: number; // basis points (100 = 1%)
  feeRecipient: Address;
}

export interface Order {
  orderId: number;
  orderType: OrderType;
  tokenAddress: Address;
  trader: Address;
  amount: string;
  price: string; // Price in base currency (USDC)
  totalValue: string;
  filledAmount: string;
  remainingAmount: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  metadata: Record<string, string>;
}

export enum OrderType {
  BUY = 'buy',
  SELL = 'sell'
}

export interface Trade {
  tradeId: number;
  buyOrderId: number;
  sellOrderId: number;
  tokenAddress: Address;
  buyer: Address;
  seller: Address;
  amount: string;
  price: string;
  totalValue: string;
  feeAmount: string;
  executedAt: Date;
}

export interface MarketConfig {
  feeRate: number; // basis points (100 = 1%)
  feeRecipient: Address;
  minOrderSize: string;
  maxOrderSize: string;
  maxSpreadBps: number; // Maximum spread in basis points
  isPaused: boolean;
  supportedTokens: Address[];
  baseCurrency: Address; // USDC or similar
}

export interface OrderBook {
  tokenAddress: Address;
  buyOrders: Order[]; // Sorted by price descending
  sellOrders: Order[]; // Sorted by price ascending
  lastPrice: string;
  volume24h: string;
  lastUpdated: Date;
}

export interface CustodyProof {
  proofId: number;
  assetAddress: Address;
  assetType: AssetType;
  custodyProvider: Address;
  verificationTimestamp: Date;
  expiryTimestamp: Date;
  assetValue: string;
  assetLocation: string;
  legalTitle: string;
  insuranceCoverage: string;
  auditReportHash: string;
  oracleSignatures: string[];
  metadata: Record<string, string>;
  isValid: boolean;
}

export interface OracleInfo {
  oracleAddress: Address;
  name: string;
  jurisdiction: string;
  verificationMethods: string[];
  reputationScore: number; // 0-100
  feeRate: number; // basis points
  isActive: boolean;
  lastVerification: Date;
  totalVerifications: number;
}

export interface AssetRegistration {
  assetAddress: Address;
  assetType: AssetType;
  legalIdentifier: string; // Legal title number, registration ID, etc.
  jurisdiction: string;
  custodyRequirements: string[];
  verificationFrequency: number; // in seconds
  requiredOracles: number;
  lastVerified: Date;
  isActive: boolean;
}

export interface ValidationConfig {
  minOracleReputation: number;
  maxProofAge: number; // in seconds
  requiredVerificationMethods: string[];
  insuranceRequired: boolean;
  minInsuranceCoverage: string;
  auditRequired: boolean;
  multiOracleRequired: boolean;
  oracleConsensusThreshold: number; // percentage (0-100)
}

// Configuration Types
export interface StellarConfig {
  network: 'testnet' | 'mainnet' | 'futurenet' | 'standalone';
  serverUrl: string;
  passphrase: string;
  horizonUrl?: string;
}

export interface RWASDKConfig {
  stellar: StellarConfig;
  contracts: {
    assetFactory: Address;
    complianceRegistry: Address;
    dividendDistributor: Address;
    secondaryMarket: Address;
    custodyValidator: Address;
  };
  defaultFeeRate?: number;
  defaultTimeout?: number;
}

// Transaction Types
export interface TransactionOptions {
  fee?: number;
  timeout?: number;
  memo?: string;
  signers?: Address[];
}

export interface DeploymentOptions {
  /** Soroban contract address of the already-deployed RWA token WASM (linked by the factory). */
  tokenContract: Address;
  name: string;
  symbol: string;
  totalSupply: string;
  decimals: number;
  assetType: AssetType;
  metadata: Record<string, string>;
  complianceRegistry: Address;
  dividendDistributor: Address;
}

export interface TransferOptions {
  from?: Address;
  to?: Address;
  amount: string;
  timeout?: number;
  memo?: string;
}

export interface OrderOptions {
  tokenAddress: Address;
  amount: string;
  price: string;
  expiresAt?: Date;
  metadata?: Record<string, string>;
}

export interface DividendOptions {
  tokenAddress: Address;
  currency: Currency;
  amount: string;
  claimDeadline: Date;
  metadata?: Record<string, string>;
}

export interface ComplianceOptions {
  user: Address;
  kycStatus: KYCStatus;
  transferLimits?: TransferLimits;
}

// Event Types
export interface AssetEvent {
  type: 'mint' | 'burn' | 'transfer' | 'pause' | 'unpause' | 'freeze' | 'unfreeze';
  asset: Address;
  from?: Address;
  to?: Address;
  amount: string;
  timestamp: Date;
  txHash: string;
}

export interface DividendEvent {
  type: 'distribution_created' | 'dividend_claimed';
  distributionId: number;
  token: Address;
  amount: string;
  currency: Currency;
  claimer?: Address;
  timestamp: Date;
  txHash: string;
}

export interface MarketEvent {
  type: 'order_created' | 'order_cancelled' | 'trade_executed';
  orderId?: number;
  tradeId?: number;
  token: Address;
  trader?: Address;
  amount?: string;
  price?: string;
  timestamp: Date;
  txHash: string;
}

export interface ComplianceEvent {
  type: 'kyc_updated' | 'blacklisted' | 'unblacklisted' | 'whitelisted' | 'unwhitelisted';
  user: Address;
  reason?: string;
  kycStatus?: KYCStatus;
  timestamp: Date;
  txHash: string;
}

export interface CustodyEvent {
  type: 'proof_submitted' | 'oracle_registered' | 'asset_registered';
  proofId?: number;
  asset?: Address;
  oracle?: Address;
  assetValue?: string;
  timestamp: Date;
  txHash: string;
}

// Error Types
export interface RWASDKError extends Error {
  code: ErrorCode;
  details?: any;
}

export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  COMPLIANCE_FAILED = 'COMPLIANCE_FAILED',
  UNAUTHORIZED = 'UNAUTHORIZED',
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  TIMEOUT = 'TIMEOUT',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  ORACLE_ERROR = 'ORACLE_ERROR',
  ASSET_NOT_FOUND = 'ASSET_NOT_FOUND',
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  DISTRIBUTION_NOT_FOUND = 'DISTRIBUTION_NOT_FOUND',
  PROOF_NOT_FOUND = 'PROOF_NOT_FOUND'
}

// Utility Types
export interface PaginatedResult<T> {
  data: T[];
  cursor?: string;
  hasMore: boolean;
  limit: number;
}

export interface Statistics {
  totalAssets: number;
  totalVolume24h: string;
  totalMarketCap: string;
  activeOrders: number;
  activeDistributions: number;
  verifiedAssets: number;
}

export interface Portfolio {
  assets: AssetHolding[];
  totalValue: string;
  totalDividends: string;
  votingPower: string;
}

export interface AssetHolding {
  asset: AssetInfo;
  balance: Balance;
  value: string;
  percentage: number;
  dividends: string;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: RWASDKError;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// Webhook Types
export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: Date;
  data: any;
  signature: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
  active: boolean;
}
