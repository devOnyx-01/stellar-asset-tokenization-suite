// Main SDK exports
export { Address } from 'stellar-sdk';
import { AssetFactory } from './assetFactory';
import { TokenClient } from './tokenClient';
import { DividendClient } from './dividendClient';
import { MarketClient } from './marketClient';
import { ComplianceClient } from './complianceClient';

// Type exports
export * from './types';

// Error exports - avoid re-exporting RWASDKError since it's already exported from types
export * from './errors';

// Configuration utilities
export class StellarRWASDK {
  private config: RWASDKConfig;
  
  // Client instances
  public assetFactory: AssetFactory;
  public complianceClient: ComplianceClient;
  public dividendClient: DividendClient;
  public marketClient: MarketClient;

  constructor(config: RWASDKConfig) {
    this.config = config;
    
    // Initialize all clients
    this.assetFactory = new AssetFactory(config);
    this.complianceClient = new ComplianceClient(config);
    this.dividendClient = new DividendClient(config);
    this.marketClient = new MarketClient(config);
  }

  /**
   * Create a token client for a specific RWA token
   */
  createTokenClient(tokenAddress: Address): TokenClient {
    return new TokenClient(this.config, tokenAddress);
  }

  /**
   * Get current configuration
   */
  getConfig(): RWASDKConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<RWASDKConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize clients with new config
    this.assetFactory = new AssetFactory(this.config);
    this.complianceClient = new ComplianceClient(this.config);
    this.dividendClient = new DividendClient(this.config);
    this.marketClient = new MarketClient(this.config);
  }

  /**
   * Get network information
   */
  async getNetworkInfo(): Promise<{
    network: string;
    serverUrl: string;
    horizonUrl?: string;
    latestLedger: number;
    protocolVersion: number;
  }> {
    try {
      const server = new (await import('stellar-sdk')).Server(this.config.stellar.serverUrl);
      const network = await server.network();
      
      return {
        network: this.config.stellar.network,
        serverUrl: this.config.stellar.serverUrl,
        horizonUrl: this.config.stellar.horizonUrl,
        latestLedger: network.latestLedger,
        protocolVersion: network.protocolVersion
      };
    } catch (error) {
      throw new Error(`Failed to get network info: ${error.message}`);
    }
  }

  /**
   * Validate configuration
   */
  validateConfig(): void {
    if (!this.config.stellar) {
      throw new Error('Stellar configuration is required');
    }

    if (!this.config.stellar.network) {
      throw new Error('Stellar network is required');
    }

    if (!this.config.stellar.serverUrl) {
      throw new Error('Stellar server URL is required');
    }

    if (!this.config.stellar.passphrase) {
      throw new Error('Stellar passphrase is required');
    }

    if (!this.config.contracts) {
      throw new Error('Contracts configuration is required');
    }

    const requiredContracts = [
      'assetFactory',
      'complianceRegistry',
      'dividendDistributor',
      'secondaryMarket',
      'custodyValidator'
    ];

    for (const contract of requiredContracts) {
      if (!this.config.contracts[contract]) {
        throw new Error(`${contract} contract address is required`);
      }
    }
  }

  /**
   * Create a complete RWA token deployment workflow
   */
  async deployCompleteRWAToken(
    deployer: Address,
    options: DeploymentOptions,
    txOptions: TransactionOptions = {}
  ): Promise<{
    tokenAddress: Address;
    assetFactoryHash: string;
    complianceHash: string;
    dividendHash: string;
    marketHash: string;
  }> {
    try {
      // Step 1: Deploy the RWA token
      const tokenResult = await this.assetFactory.deployRWAToken(
        deployer,
        options,
        txOptions
      );

      // Step 2: Initialize compliance for the token (if needed)
      let complianceHash = '';
      if (options.initializeCompliance) {
        complianceHash = await this.complianceClient.initialize(
          deployer,
          deployer, // Use deployer as admin
          options.kycRequired || true,
          options.transferRestrictions || true,
          txOptions
        );
      }

      // Step 3: Add token to secondary market
      const marketHash = await this.marketClient.addSupportedToken(
        deployer,
        tokenResult.tokenAddress,
        txOptions
      );

      // Step 4: Initialize dividend distributor (if needed)
      let dividendHash = '';
      if (options.initializeDividends) {
        // This would be handled by the asset factory during token deployment
        dividendHash = tokenResult.assetFactoryHash;
      }

      return {
        tokenAddress: tokenResult.tokenAddress,
        assetFactoryHash: tokenResult.transactionHash,
        complianceHash,
        dividendHash,
        marketHash
      };
    } catch (error) {
      throw new Error(`Complete deployment failed: ${error.message}`);
    }
  }

  /**
   * Get comprehensive portfolio overview for a user
   */
  async getUserPortfolio(user: Address): Promise<{
    totalValue: string;
    totalDividends: string;
    votingPower: string;
    assets: Array<{
      asset: AssetInfo;
      balance: Balance;
      value: string;
      percentage: number;
      dividends: string;
    }>;
  }> {
    try {
      // This would aggregate data from all contracts
      // For now, return a placeholder implementation
      throw new Error('getUserPortfolio not implemented');
    } catch (error) {
      throw new Error(`Failed to get user portfolio: ${error.message}`);
    }
  }

  /**
   * Get platform-wide statistics
   */
  async getPlatformStats(): Promise<{
    totalAssets: number;
    totalVolume24h: string;
    totalMarketCap: string;
    activeOrders: number;
    activeDistributions: number;
    verifiedAssets: number;
    totalUsers: number;
    complianceRate: number;
  }> {
    try {
      // This would aggregate data from all contracts
      // For now, return a placeholder implementation
      throw new Error('getPlatformStats not implemented');
    } catch (error) {
      throw new Error(`Failed to get platform stats: ${error.message}`);
    }
  }
}

// Re-export types for convenience
import type { 
  RWASDKConfig, 
  Address, 
  AssetInfo, 
  Balance, 
  KYCStatus, 
  DividendDistribution, 
  Order, 
  Trade, 
  TransactionOptions, 
  DeploymentOptions,
  AssetType,
  Currency,
  OrderType,
  VerificationLevel
} from './types';

// Factory function to create SDK instance with common configurations
export function createStellarRWASDK(
  network: 'testnet' | 'mainnet' | 'futurenet' | 'standalone',
  contracts: {
    assetFactory: Address;
    complianceRegistry: Address;
    dividendDistributor: Address;
    secondaryMarket: Address;
    custodyValidator: Address;
  },
  options?: {
    serverUrl?: string;
    horizonUrl?: string;
    defaultFeeRate?: number;
    defaultTimeout?: number;
  }
): StellarRWASDK {
  const networkConfigs = {
    testnet: {
      serverUrl: 'https://horizon-testnet.stellar.org',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      passphrase: 'Test SDF Network ; September 2015'
    },
    mainnet: {
      serverUrl: 'https://horizon.stellar.org',
      horizonUrl: 'https://horizon.stellar.org',
      passphrase: 'Public Global Stellar Network ; September 2015'
    },
    futurenet: {
      serverUrl: 'https://horizon-futurenet.stellar.org',
      horizonUrl: 'https://horizon-futurenet.stellar.org',
      passphrase: 'Test SDF Future Network ; October 2022'
    },
    standalone: {
      serverUrl: 'http://localhost:8000',
      horizonUrl: 'http://localhost:8000',
      passphrase: 'Standalone Network ; February 2017'
    }
  };

  const config = networkConfigs[network];
  
  const sdkConfig: RWASDKConfig = {
    stellar: {
      network,
      serverUrl: options?.serverUrl || config.serverUrl,
      horizonUrl: options?.horizonUrl || config.horizonUrl,
      passphrase: config.passphrase
    },
    contracts,
    defaultFeeRate: options?.defaultFeeRate || 100,
    defaultTimeout: options?.defaultTimeout || 30
  };

  return new StellarRWASDK(sdkConfig);
}

// Utility functions
export function isValidAddress(address: string): boolean {
  try {
    new (require('stellar-sdk')).Address(address);
    return true;
  } catch {
    return false;
  }
}

export function formatAmount(amount: string | number, decimals: number = 18): string {
  const num = typeof amount === 'string' ? BigInt(amount) : BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fractional = num % divisor;
  
  if (fractional === 0n) {
    return whole.toString();
  }
  
  const fractionalStr = fractional.toString().padStart(decimals, '0');
  const trimmedFractional = fractionalStr.replace(/0+$/, '');
  
  return `${whole}.${trimmedFractional}`;
}

export function parseAmount(amount: string, decimals: number = 18): string {
  const [whole, fractional = ''] = amount.split('.');
  const wholeBigInt = BigInt(whole);
  const fractionalBigInt = fractional ? BigInt(fractional.padEnd(decimals, '0').slice(0, decimals)) : 0n;
  const divisor = BigInt(10 ** decimals);
  
  return (wholeBigInt * divisor + fractionalBigInt).toString();
}

// Export all types and classes
export {
  // Types
  type RWASDKConfig,
  type Address,
  type AssetInfo,
  type Balance,
  type KYCStatus,
  type DividendDistribution,
  type Order,
  type Trade,
  type TransactionOptions,
  type DeploymentOptions,
  type AssetType,
  type Currency,
  type OrderType,
  type VerificationLevel,
  
  // Classes
  StellarRWASDK as default
};
