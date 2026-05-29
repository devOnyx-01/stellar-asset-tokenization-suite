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
import { RWASDKError as RWASDKErrorClass, contractErrorToCode } from './errors';

/**
 * Client for interacting with the on-chain DividendDistributor contract.
 *
 * Provides methods for creating distributions, claiming dividends, querying
 * distribution state, and managing distributor configuration.
 *
 * @example
 * ```ts
 * const dividends = new DividendClient(sdkConfig);
 * const { distributionId } = await dividends.createDistribution(admin, options);
 * await dividends.claimDividend(holder, distributionId);
 * ```
 */
export class DividendClient {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;

  /**
   * Create a new DividendClient.
   *
   * @param config - SDK configuration. `config.contracts.dividendDistributor` must
   *   be set to the deployed DividendDistributor contract address.
   */
  constructor(config: RWASDKConfig) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.contract = new Contract(config.contracts.dividendDistributor);
  }

  /**
   * Create a new dividend distribution for a token.
   *
   * Deposits `options.amount` of `options.currency` into the distributor
   * contract and records a new distribution that token holders can claim
   * before `options.claimDeadline`.
   *
   * @param admin - Admin address that authorises and funds the distribution.
   * @param options - Distribution parameters: token address, currency, total
   *   amount, claim deadline, and optional metadata.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns An object with the Stellar `transactionHash` and the on-chain
   *   `distributionId` assigned to the new distribution.
   * @throws {RWASDKError} With code `INSUFFICIENT_FUNDS` if the admin lacks sufficient balance.
   * @throws {RWASDKError} With code `UNSUPPORTED_CURRENCY` if the currency is not configured.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
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
   * Claim the dividend owed to `claimer` from a specific distribution.
   *
   * The claimable amount is proportional to the claimer's token balance at
   * the time the distribution was created.
   *
   * @param claimer - Address claiming the dividend.
   * @param distributionId - On-chain ID of the distribution to claim from.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns An object with the Stellar `transactionHash` and the `amountClaimed`.
   * @throws {RWASDKError} With code `ALREADY_CLAIMED` if the claimer has already claimed.
   * @throws {RWASDKError} With code `DISTRIBUTION_NOT_ACTIVE` if the distribution is inactive.
   * @throws {RWASDKError} With code `NO_TOKENS_TO_CLAIM` if the claimer held no tokens.
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
   * Claim all available dividends across every active distribution for `claimer`.
   *
   * Iterates all active distributions and claims any unclaimed amounts in a
   * single transaction.
   *
   * @param claimer - Address claiming dividends.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns An object with the Stellar `transactionHash` and an array of
   *   `claimedAmounts` (one entry per distribution claimed).
   * @throws {RWASDKError} With code `NO_DIVIDEND_AVAILABLE` if there is nothing to claim.
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
   * Fetch details of a specific distribution by its on-chain ID.
   *
   * @param distributionId - On-chain ID of the distribution to query.
   * @returns A `DividendDistribution` object with full distribution details.
   * @throws {RWASDKError} With code `DISTRIBUTION_NOT_FOUND` if the ID does not exist.
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
   * Retrieve all active distributions for a specific token.
   *
   * @param tokenAddress - On-chain address of the RWA token to query.
   * @returns An array of active `DividendDistribution` objects.
   * @throws {RWASDKError} If the contract call fails.
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
   * Retrieve the claim record for a specific claimer and distribution.
   *
   * @param distributionId - On-chain ID of the distribution.
   * @param claimer - Address of the claimer to look up.
   * @returns A `ClaimInfo` object if the claimer has already claimed, or `null`
   *   if no claim has been made yet.
   * @throws {RWASDKError} If the contract call fails.
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
   * Calculate the dividend amount available for a claimer to claim.
   *
   * @param distributionId - On-chain ID of the distribution.
   * @param claimer - Address of the potential claimer.
   * @returns The claimable amount as a raw integer string (no decimals).
   * @throws {RWASDKError} With code `DISTRIBUTION_NOT_FOUND` if the ID does not exist.
   * @throws {RWASDKError} With code `ALREADY_CLAIMED` if the claimer has already claimed.
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
   * Update the distributor configuration (admin only).
   *
   * @param admin - Admin address that authorises the update.
   * @param config - New `DividendConfig` to apply (supported currencies, auto-distribute
   *   flag, minimum distribution amount, fee rate, etc.).
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the distributor admin.
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
   * Deactivate a distribution, preventing further claims (admin only).
   *
   * Any unclaimed amounts remain in the contract until manually withdrawn.
   *
   * @param admin - Admin address that authorises the deactivation.
   * @param distributionId - On-chain ID of the distribution to deactivate.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `DISTRIBUTION_NOT_FOUND` if the ID does not exist.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the distributor admin.
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
   * Retrieve aggregate dividend statistics, optionally scoped to a token.
   *
   * @param tokenAddress - Optional token address to scope the stats. If omitted,
   *   returns platform-wide totals.
   * @returns An object with `totalDistributions`, `activeDistributions`,
   *   `totalDistributed`, `totalClaimed`, and `pendingClaims`.
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
   * Retrieve paginated dividend claim history for a user.
   *
   * @param user - Address of the user to query.
   * @param limit - Maximum number of claim records to return (default `50`).
   * @param cursor - Paging token from a previous response for cursor-based pagination.
   * @returns An object with a `claims` array, `hasMore` flag, and optional `nextCursor`.
   * @throws {RWASDKError} With code `CONTRACT_ERROR` — not yet implemented.
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
      throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'getUserDividendHistory not implemented');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Estimate the fee for claiming a dividend.
   *
   * @param distributionId - On-chain ID of the distribution.
   * @param claimer - Address of the claimer.
   * @returns An object with `baseFee`, `dividendFee`, `totalFee`, and `feeCurrency`.
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
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertDividendConfigToScVal not implemented');
  }

  private convertScValToDistribution(scVal: xdr.ScVal): DividendDistribution {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToDistribution not implemented');
  }

  private convertScValToDistributionArray(scVal: xdr.ScVal): DividendDistribution[] {
    // This would parse the ScVal array returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToDistributionArray not implemented');
  }

  private convertScValToClaimInfo(scVal: xdr.ScVal): ClaimInfo {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToClaimInfo not implemented');
  }

  private extractDistributionId(resultMetaXdr: string): number {
    // This would extract the distribution ID from transaction result
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'extractDistributionId not implemented');
  }

  private extractClaimedAmount(resultMetaXdr: string): string {
    // This would extract the claimed amount from transaction result
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'extractClaimedAmount not implemented');
  }

  private extractClaimedAmounts(resultMetaXdr: string): string[] {
    // This would extract the claimed amounts from transaction result
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'extractClaimedAmounts not implemented');
  }

  private async signTransaction(transaction: any, signer: Address): Promise<any> {
    // This would sign the transaction with the signer's key
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'signTransaction not implemented');
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
