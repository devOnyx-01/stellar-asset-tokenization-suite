import { 
  Server, 
  TransactionBuilder, 
  Networks, 
  Account, 
  Address,
  Contract,
  xdr,
  ScInt
} from 'stellar-sdk';
import { 
  DividendDistribution, 
  DividendConfig, 
  DividendOptions, 
  Currency, 
  ClaimInfo, 
  TransactionOptions, 
  RWASDKConfig, 
  RWASDKError, 
  ErrorCode 
} from './types';
import { RWASDKError as RWASDKErrorClass } from './errors';

export class DividendClient {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;

  constructor(config: RWASDKConfig) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.contract = new Contract(config.contracts.dividendDistributor);
  }

  /**
   * Create a new dividend distribution
   */
  async createDistribution(
    admin: Address,
    options: DividendOptions,
    txOptions: TransactionOptions = {}
  ): Promise<{ transactionHash: string; distributionId: number }> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      // Convert metadata to ScMap
      const metadataScMap = this.convertMetadataToScMap(options.metadata || {});
      
      const call = this.contract.call(
        'create_distribution',
        new Address(options.tokenAddress),
        xdr.ScVal.scvSymbol(options.currency),
        new ScInt(options.amount, xdr.ScValType.ScvI128),
        new ScInt(Math.floor(options.claimDeadline.getTime() / 1000)),
        metadataScMap
      );

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      // Extract distribution ID from result
      const distributionId = this.extractDistributionId(result.resultMetaXdr);

      return {
        transactionHash: result.hash,
        distributionId
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Claim dividend for a specific distribution
   */
  async claimDividend(
    claimer: Address,
    distributionId: number,
    txOptions: TransactionOptions = {}
  ): Promise<{ transactionHash: string; amountClaimed: string }> {
    try {
      const account = await this.server.getAccount(claimer.toString());
      
      const call = this.contract.call(
        'claim_dividend',
        new ScInt(distributionId),
        new Address(claimer)
      );

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, claimer);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      // Extract claimed amount from result
      const amountClaimed = this.extractClaimedAmount(result.resultMetaXdr);

      return {
        transactionHash: result.hash,
        amountClaimed
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Claim all available dividends for a user
   */
  async claimAllDividends(
    claimer: Address,
    txOptions: TransactionOptions = {}
  ): Promise<{ transactionHash: string; claimedAmounts: string[] }> {
    try {
      const account = await this.server.getAccount(claimer.toString());
      
      const call = this.contract.call('claim_all_dividends', new Address(claimer));

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, claimer);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      // Extract claimed amounts from result
      const claimedAmounts = this.extractClaimedAmounts(result.resultMetaXdr);

      return {
        transactionHash: result.hash,
        claimedAmounts
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get distribution information
   */
  async getDistribution(distributionId: number): Promise<DividendDistribution> {
    try {
      const result = await this.contract.call('get_distribution', new ScInt(distributionId));
      const distribution = this.convertScValToDistribution(result.result);
      return distribution;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get all active distributions for a token
   */
  async getActiveDistributions(tokenAddress: Address): Promise<DividendDistribution[]> {
    try {
      const result = await this.contract.call('get_active_distributions', new Address(tokenAddress));
      const distributions = this.convertScValToDistributionArray(result.result);
      return distributions;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get claim information
   */
  async getClaimInfo(distributionId: number, claimer: Address): Promise<ClaimInfo | null> {
    try {
      const result = await this.contract.call(
        'get_claim_info', 
        new ScInt(distributionId), 
        new Address(claimer)
      );
      
      if (result.result == null) {
        return null;
      }
      
      const claimInfo = this.convertScValToClaimInfo(result.result);
      return claimInfo;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Calculate available dividend amount for a user
   */
  async calculateAvailableDividend(
    distributionId: number,
    claimer: Address
  ): Promise<string> {
    try {
      const result = await this.contract.call(
        'calculate_available_dividend',
        new ScInt(distributionId),
        new Address(claimer)
      );
      
      const val = result.result;
      if (typeof val === 'string') return val;
      if (val && typeof val.toString === 'function') return val.toString();
      return '0';
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update configuration
   */
  async updateConfig(
    admin: Address,
    config: DividendConfig,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const configScVal = this.convertDividendConfigToScVal(config);
      
      const call = this.contract.call('update_config', configScVal);

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Deactivate a distribution
   */
  async deactivateDistribution(
    admin: Address,
    distributionId: number,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('deactivate_distribution', new ScInt(distributionId));

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get dividend statistics
   */
  async getDividendStats(tokenAddress?: Address): Promise<{
    totalDistributions: number;
    activeDistributions: number;
    totalDistributed: string;
    totalClaimed: string;
    pendingClaims: string;
  }> {
    try {
      // For now, return placeholder implementation
      // In a real implementation, you'd query events or storage for detailed stats
      return {
        totalDistributions: 0,
        activeDistributions: 0,
        totalDistributed: '0',
        totalClaimed: '0',
        pendingClaims: '0'
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get user's dividend history
   */
  async getUserDividendHistory(
    user: Address,
    limit: number = 50,
    cursor?: string
  ): Promise<{
    claims: ClaimInfo[];
    hasMore: boolean;
    nextCursor?: string;
  }> {
    try {
      // This would query dividend claim events from the contract
      // For now, return a placeholder implementation
      throw new Error('getUserDividendHistory not implemented');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Estimate dividend claim fee
   */
  async estimateClaimFee(
    distributionId: number,
    claimer: Address
  ): Promise<{
    baseFee: string;
    dividendFee: string;
    totalFee: string;
    feeCurrency: Currency;
  }> {
    try {
      // This would calculate fees based on the dividend configuration
      // For now, return a placeholder implementation
      return {
        baseFee: '100',
        dividendFee: '0',
        totalFee: '100',
        feeCurrency: Currency.XLM
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Private helper methods

  private convertMetadataToScMap(metadata: Record<string, string>): xdr.ScMap {
    if (!metadata || typeof metadata !== 'object') {
      return new xdr.ScMap({ map: [] });
    }
    const map = new xdr.ScMap({
      map: Object.entries(metadata).map(([key, value]) => ({
        key: xdr.ScVal.scvSymbol(key),
        val: xdr.ScVal.scvSymbol(value)
      }))
    });
    return map;
  }

  private convertDividendConfigToScVal(config: DividendConfig): xdr.ScVal {
    // This would convert DividendConfig to ScVal
    // For now, return a placeholder implementation
    throw new Error('convertDividendConfigToScVal not implemented');
  }

  private convertScValToDistribution(scVal: xdr.ScVal): DividendDistribution {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new Error('convertScValToDistribution not implemented');
  }

  private convertScValToDistributionArray(scVal: xdr.ScVal): DividendDistribution[] {
    // This would parse the ScVal array returned from the contract
    // For now, return a placeholder implementation
    throw new Error('convertScValToDistributionArray not implemented');
  }

  private convertScValToClaimInfo(scVal: xdr.ScVal): ClaimInfo {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new Error('convertScValToClaimInfo not implemented');
  }

  private extractDistributionId(resultMetaXdr: string): number {
    // This would extract the distribution ID from transaction result
    // For now, return a placeholder implementation
    throw new Error('extractDistributionId not implemented');
  }

  private extractClaimedAmount(resultMetaXdr: string): string {
    // This would extract the claimed amount from transaction result
    // For now, return a placeholder implementation
    throw new Error('extractClaimedAmount not implemented');
  }

  private extractClaimedAmounts(resultMetaXdr: string): string[] {
    // This would extract the claimed amounts from transaction result
    // For now, return a placeholder implementation
    throw new Error('extractClaimedAmounts not implemented');
  }

  private async signTransaction(transaction: any, signer: Address): Promise<any> {
    // This would sign the transaction with the signer's key
    // For now, return a placeholder implementation
    throw new Error('signTransaction not implemented');
  }

  private handleError(error: unknown): RWASDKErrorClass {
    if (error instanceof RWASDKErrorClass) {
      return error;
    }

    const message = (error && typeof error === 'object' && 'message' in error && typeof (error as Record<string, unknown>).message === 'string')
      ? (error as Record<string, string>).message
      : String(error);

    if (message.includes('timeout')) {
      return new RWASDKErrorClass(ErrorCode.TIMEOUT, message);
    }

    if (message.includes('insufficient')) {
      return new RWASDKErrorClass(ErrorCode.INSUFFICIENT_BALANCE, message);
    }

    if (message.includes('unauthorized')) {
      return new RWASDKErrorClass(ErrorCode.UNAUTHORIZED, message);
    }

    return new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, message);
  }
}
