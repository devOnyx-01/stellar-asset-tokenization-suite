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
  KYCStatus, 
  VerificationLevel, 
  TransferLimits, 
  ComplianceRule, 
  ComplianceOptions, 
  TransactionOptions, 
  RWASDKConfig, 
  RWASDKError, 
  ErrorCode 
} from './types';
import { RWASDKError as RWASDKErrorClass, contractErrorToCode } from './errors';

/**
 * Client for interacting with the on-chain ComplianceRegistry contract.
 *
 * Provides methods for managing KYC status, blacklists, whitelists, transfer
 * limits, and compliance rules for RWA token holders.
 *
 * @example
 * ```ts
 * const compliance = new ComplianceClient(sdkConfig);
 * await compliance.updateKYCStatus(admin, user, kycStatus);
 * ```
 */
export class ComplianceClient {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;

  /**
   * Create a new ComplianceClient.
   *
   * @param config - SDK configuration. `config.contracts.complianceRegistry` must
   *   be set to the deployed ComplianceRegistry contract address.
   */
  constructor(config: RWASDKConfig) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.contract = new Contract(config.contracts.complianceRegistry);
  }

  /**
   * Initialise the compliance registry contract.
   *
   * Must be called once after deployment before any other registry operations.
   *
   * @param deployer - Address that pays for and submits the transaction.
   * @param admin - Address that will be set as the registry admin.
   * @param kycRequired - Whether KYC verification is required for all transfers.
   * @param transferRestrictions - Whether transfer restrictions are enabled globally.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `REGISTRY_ALREADY_INITIALIZED` if already initialised.
   */
  async initialize(
    deployer: Address,
    admin: Address,
    kycRequired: boolean,
    transferRestrictions: boolean,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(deployer.toString());
      
      const call = this.contract.call(
        'initialize',
        new Address(admin),
        kycRequired,
        transferRestrictions
      );

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, deployer);
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
   * Create or update the KYC status record for a user.
   *
   * @param admin - Admin address that authorises the update.
   * @param user - Address of the user whose KYC record is being updated.
   * @param kycStatus - New KYC status to store (verification level, jurisdiction,
   *   accreditation, risk score, AML flags, etc.).
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   */
  async updateKYCStatus(
    admin: Address,
    user: Address,
    kycStatus: KYCStatus,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const kycStatusScVal = this.convertKYCStatusToScVal(kycStatus);
      
      const call = this.contract.call(
        'update_kyc_status',
        new Address(user),
        kycStatusScVal
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

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Retrieve the KYC status record for a user.
   *
   * @param user - Address of the user to query.
   * @returns The user's `KYCStatus` record.
   * @throws {RWASDKError} With code `USER_NOT_FOUND` if the user has no KYC record.
   */
  async getKYCStatus(user: Address): Promise<KYCStatus> {
    try {
      const result = await this.contract.call('get_kyc_status', new Address(user));
      const kycStatus = this.convertScValToKYCStatus(result.result);
      return kycStatus;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Add an address to the compliance blacklist.
   *
   * Blacklisted addresses cannot send or receive tokens regardless of KYC status.
   *
   * @param admin - Admin address that authorises the operation.
   * @param address - Address to blacklist.
   * @param reason - Human-readable reason for blacklisting (stored on-chain as a Symbol).
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   */
  async addToBlacklist(
    admin: Address,
    address: Address,
    reason: string,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call(
        'add_to_blacklist',
        new Address(address),
        xdr.ScVal.scvSymbol(reason)
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

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Remove an address from the compliance blacklist.
   *
   * @param admin - Admin address that authorises the operation.
   * @param address - Address to remove from the blacklist.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   */
  async removeFromBlacklist(
    admin: Address,
    address: Address,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('remove_from_blacklist', new Address(address));

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
   * Add an address to the compliance whitelist.
   *
   * Whitelisted addresses may bypass certain compliance checks depending on
   * the active compliance rules.
   *
   * @param admin - Admin address that authorises the operation.
   * @param address - Address to whitelist.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   */
  async addToWhitelist(
    admin: Address,
    address: Address,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('add_to_whitelist', new Address(address));

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
   * Remove an address from the compliance whitelist.
   *
   * @param admin - Admin address that authorises the operation.
   * @param address - Address to remove from the whitelist.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   */
  async removeFromWhitelist(
    admin: Address,
    address: Address,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('remove_from_whitelist', new Address(address));

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
   * Check whether a transfer between two addresses is compliant.
   *
   * Evaluates KYC status, blacklist/whitelist membership, transfer limits, and
   * any active compliance rules for both parties.
   *
   * @param from - Sender's Stellar address.
   * @param to - Recipient's Stellar address.
   * @param amount - Transfer amount as a raw integer string (no decimals).
   * @returns `true` if the transfer is permitted, `false` otherwise.
   * @throws {RWASDKError} If the contract call fails.
   */
  async checkCompliance(
    from: Address,
    to: Address,
    amount: string
  ): Promise<boolean> {
    try {
      const result = await this.contract.call(
        'check_compliance',
        new Address(from),
        new Address(to),
        new ScInt(amount, xdr.ScValType.ScvI128)
      );
      
      return typeof result.result === 'boolean' ? result.result : false;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Check whether a user is within their configured transfer limits for a given amount.
   *
   * @param user - Address of the user to check.
   * @param amount - Proposed transfer amount as a raw integer string (no decimals).
   * @returns `true` if the amount is within the user's remaining limits, `false` otherwise.
   * @throws {RWASDKError} If the contract call fails.
   */
  async checkTransferLimits(
    user: Address,
    amount: string
  ): Promise<boolean> {
    try {
      const result = await this.contract.call(
        'check_transfer_limits',
        new Address(user),
        new ScInt(amount, xdr.ScValType.ScvI128)
      );
      
      return typeof result.result === 'boolean' ? result.result : false;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Set or update transfer limits for a specific user (admin only).
   *
   * @param admin - Admin address that authorises the update.
   * @param user - Address of the user whose limits are being set.
   * @param limits - New `TransferLimits` object (daily, monthly, and annual caps).
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   */
  async setTransferLimits(
    admin: Address,
    user: Address,
    limits: TransferLimits,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const limitsScVal = this.convertTransferLimitsToScVal(limits);
      
      const call = this.contract.call(
        'set_transfer_limits',
        new Address(user),
        limitsScVal
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

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Retrieve all active compliance rules from the registry.
   *
   * @returns An array of `ComplianceRule` objects currently stored on-chain.
   * @throws {RWASDKError} If the contract call fails.
   */
  async getComplianceRules(): Promise<ComplianceRule[]> {
    try {
      const result = await this.contract.call('get_compliance_rules');
      const rules = this.convertScValToComplianceRuleArray(result.result);
      return rules;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create or update a compliance rule (admin only).
   *
   * @param admin - Admin address that authorises the update.
   * @param rule - The `ComplianceRule` to create or update. The `ruleId` field
   *   is used as the key; an existing rule with the same ID will be overwritten.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   */
  async updateComplianceRule(
    admin: Address,
    rule: ComplianceRule,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const ruleScVal = this.convertComplianceRuleToScVal(rule);
      
      const call = this.contract.call('update_compliance_rule', ruleScVal);

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
   * Retrieve aggregate compliance statistics for the registry.
   *
   * Returns counts of verified users, blacklisted/whitelisted addresses, active
   * rules, and an overall compliance rate. Currently returns placeholder values
   * pending on-chain event indexing.
   *
   * @returns An object with `totalVerifiedUsers`, `totalBlacklisted`,
   *   `totalWhitelisted`, `activeRules`, and `complianceRate` (0–100).
   */
  async getComplianceStats(): Promise<{
    totalVerifiedUsers: number;
    totalBlacklisted: number;
    totalWhitelisted: number;
    activeRules: number;
    complianceRate: number;
  }> {
    try {
      // For now, return placeholder implementation
      // In a real implementation, you'd query events or storage for detailed stats
      return {
        totalVerifiedUsers: 0,
        totalBlacklisted: 0,
        totalWhitelisted: 0,
        activeRules: 0,
        complianceRate: 0
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Retrieve paginated compliance event history for a user.
   *
   * @param user - Address of the user to query.
   * @param limit - Maximum number of events to return (default `50`).
   * @param cursor - Paging token from a previous response for cursor-based pagination.
   * @returns An object with an `events` array, `hasMore` flag, and optional `nextCursor`.
   * @throws {RWASDKError} With code `CONTRACT_ERROR` — not yet implemented.
   */
  async getUserComplianceHistory(
    user: Address,
    limit: number = 50,
    cursor?: string
  ): Promise<{
    events: Array<{
      type: string;
      timestamp: Date;
      details: any;
    }>;
    hasMore: boolean;
    nextCursor?: string;
  }> {
    try {
      // This would query compliance events from the contract
      // For now, return a placeholder implementation
      throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'getUserComplianceHistory not implemented');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update KYC status for multiple users in a single transaction.
   *
   * Batches all `update_kyc_status` operations into one Stellar transaction,
   * reducing the number of round-trips and total fees.
   *
   * @param admin - Admin address that authorises all updates.
   * @param updates - Array of `{ user, kycStatus }` pairs to apply.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the registry admin.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
   */
  async batchUpdateKYCStatus(
    admin: Address,
    updates: Array<{ user: Address; kycStatus: KYCStatus }>,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      // Create multiple operations in a single transaction
      let transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      });

      for (const update of updates) {
        const kycStatusScVal = this.convertKYCStatusToScVal(update.kycStatus);
        const call = this.contract.call(
          'update_kyc_status',
          new Address(update.user),
          kycStatusScVal
        );
        transaction = transaction.addOperation(call);
      }

      transaction = transaction.setTimeout(txOptions.timeout || 30).build();

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

  // Private helper methods

  private convertKYCStatusToScVal(kycStatus: KYCStatus): xdr.ScVal {
    // This would convert KYCStatus to ScVal
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertKYCStatusToScVal not implemented');
  }

  private convertTransferLimitsToScVal(limits: TransferLimits): xdr.ScVal {
    // This would convert TransferLimits to ScVal
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertTransferLimitsToScVal not implemented');
  }

  private convertComplianceRuleToScVal(rule: ComplianceRule): xdr.ScVal {
    // This would convert ComplianceRule to ScVal
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertComplianceRuleToScVal not implemented');
  }

  private convertScValToKYCStatus(scVal: xdr.ScVal): KYCStatus {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToKYCStatus not implemented');
  }

  private convertScValToComplianceRuleArray(scVal: xdr.ScVal): ComplianceRule[] {
    // This would parse the ScVal array returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToComplianceRuleArray not implemented');
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

    return new RWASDKErrorClass(ErrorCode.COMPLIANCE_FAILED, message);
  }
}
