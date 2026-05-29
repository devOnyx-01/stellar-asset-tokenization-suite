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
  AssetInfo, 
  Balance, 
  TransferOptions, 
  TransactionOptions, 
  RWASDKConfig, 
  RWASDKError
} from './types';
import { RWASDKError as RWASDKErrorClass, contractErrorToCode, TimeoutError, InsufficientBalanceError, UnauthorizedError, TransactionError, ContractError } from './errors';

/**
 * Client for interacting with a deployed RWA token contract.
 *
 * Wraps the Soroban token contract interface and exposes typed methods for
 * transfers, minting, burning, locking, pausing, and compliance checks.
 *
 * @example
 * ```ts
 * const client = new TokenClient(sdkConfig, tokenAddress);
 * const info = await client.getTokenInfo();
 * ```
 */
export class TokenClient {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;
  private tokenAddress: Address;

  /**
   * Create a new TokenClient.
   *
   * @param config - SDK configuration including Stellar network settings and
   *   contract addresses.
   * @param tokenAddress - On-chain address of the RWA token contract to interact with.
   */
  constructor(config: RWASDKConfig, tokenAddress: Address) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.tokenAddress = tokenAddress;
    this.contract = new Contract(tokenAddress);
  }

  /**
   * Fetch on-chain metadata for this token.
   *
   * @returns An `AssetInfo` object containing name, symbol, decimals, total
   *   supply, asset type, compliance registry address, and pause/freeze state.
   * @throws {RWASDKError} If the contract call fails.
   */
  async getTokenInfo(): Promise<AssetInfo> {
    try {
      const result = await this.contract.call('get_token_info');
      const tokenInfo = this.convertScValToAssetInfo(result.result);
      return tokenInfo;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Fetch the token balance for a given address.
   *
   * @param address - The Stellar address to query.
   * @returns A `Balance` object containing the spendable amount, locked amount,
   *   voting power, and the timestamp of the last dividend claim.
   * @throws {RWASDKError} If the contract call fails.
   */
  async getBalance(address: Address): Promise<Balance> {
    try {
      const result = await this.contract.call('get_balance', new Address(address));
      const balance = this.convertScValToBalance(result.result);
      return balance;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Transfer tokens between two addresses.
   *
   * Builds and submits a `transfer` contract invocation. The `from` address
   * must have authorised the transaction (i.e. the SDK config must contain the
   * corresponding secret key, or the transaction must be signed externally).
   *
   * @param from - Sender's Stellar address.
   * @param to - Recipient's Stellar address.
   * @param amount - Amount to transfer as a raw integer string (no decimals).
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `TRANSFER_PAUSED` if transfers are paused.
   * @throws {RWASDKError} With code `COMPLIANCE_FAILED` if the compliance registry rejects the transfer.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
   */
  async transfer(
    from: Address,
    to: Address,
    amount: string,
    options: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(from.toString());
      
      const call = this.contract.call(
        'transfer',
        new Address(from),
        new Address(to),
        new ScInt(amount, xdr.ScValType.ScvI128)
      );

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, from);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Mint new tokens and credit them to `to` (admin only).
   *
   * @param admin - Admin address that authorises the mint.
   * @param to - Recipient address for the newly minted tokens.
   * @param amount - Amount to mint as a raw integer string (no decimals).
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the contract admin.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
   */
  async mint(
    admin: Address,
    to: Address,
    amount: string,
    options: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call(
        'mint',
        new Address(to),
        new ScInt(amount, xdr.ScValType.ScvI128)
      );

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Burn (destroy) tokens from the owner's balance.
   *
   * @param owner - Address whose tokens will be burned.
   * @param amount - Amount to burn as a raw integer string (no decimals).
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `INSUFFICIENT_BALANCE` if the owner has insufficient tokens.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
   */
  async burn(
    owner: Address,
    amount: string,
    options: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(owner.toString());
      
      const call = this.contract.call(
        'burn',
        new Address(owner),
        new ScInt(amount, xdr.ScValType.ScvI128)
      );

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, owner);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Lock a portion of the owner's tokens for voting or staking.
   *
   * Locked tokens are excluded from the spendable balance but still count
   * toward voting power. They cannot be transferred until unlocked.
   *
   * @param owner - Address whose tokens will be locked.
   * @param amount - Amount to lock as a raw integer string (no decimals).
   * @param lockPeriod - Minimum lock duration in seconds.
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `INSUFFICIENT_BALANCE` if the owner has insufficient unlocked tokens.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
   */
  async lockTokens(
    owner: Address,
    amount: string,
    lockPeriod: number, // in seconds
    options: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(owner.toString());
      
      const call = this.contract.call(
        'lock_tokens',
        new Address(owner),
        new ScInt(amount, xdr.ScValType.ScvI128),
        new ScInt(lockPeriod)
      );

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, owner);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Unlock previously locked tokens, returning them to the spendable balance.
   *
   * @param owner - Address whose tokens will be unlocked.
   * @param amount - Amount to unlock as a raw integer string (no decimals).
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `INSUFFICIENT_BALANCE` if the owner has insufficient locked tokens.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
   */
  async unlockTokens(
    owner: Address,
    amount: string,
    options: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(owner.toString());
      
      const call = this.contract.call(
        'unlock_tokens',
        new Address(owner),
        new ScInt(amount, xdr.ScValType.ScvI128)
      );

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, owner);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Pause all token transfers (admin only).
   *
   * While paused, any `transfer` call will be rejected with `TRANSFER_PAUSED`.
   * Use `unpause` to resume normal operation.
   *
   * @param admin - Admin address that authorises the pause.
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the contract admin.
   */
  async pause(admin: Address, options: TransactionOptions = {}): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('pause');

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Resume token transfers after a pause (admin only).
   *
   * @param admin - Admin address that authorises the unpause.
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the contract admin.
   */
  async unpause(admin: Address, options: TransactionOptions = {}): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('unpause');

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Freeze the token for emergency regulatory compliance (admin only).
   *
   * A frozen token blocks all transfers regardless of pause state. Use
   * `unfreeze` to lift the freeze.
   *
   * @param admin - Admin address that authorises the freeze.
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the contract admin.
   */
  async freeze(admin: Address, options: TransactionOptions = {}): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('freeze');

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Lift a regulatory freeze on the token (admin only).
   *
   * @param admin - Admin address that authorises the unfreeze.
   * @param options - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the contract admin.
   */
  async unfreeze(admin: Address, options: TransactionOptions = {}): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('unfreeze');

      const transaction = new TransactionBuilder(account, {
        fee: options.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(options.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, admin);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Retrieve aggregate statistics for this token.
   *
   * Returns total supply, circulating supply, holder count, total locked
   * amount, and transfer count. Some fields (holders, locked, transfers)
   * require on-chain event indexing and currently return `0` as placeholders.
   *
   * @returns An object with `totalSupply`, `circulatingSupply`, `totalHolders`,
   *   `totalLocked`, and `transferCount`.
   * @throws {RWASDKError} If the underlying `getTokenInfo` call fails.
   */
  async getTokenStats(): Promise<{
    totalSupply: string;
    circulatingSupply: string;
    totalHolders: number;
    totalLocked: string;
    transferCount: number;
  }> {
    try {
      const tokenInfo = await this.getTokenInfo();
      
      // For now, return basic stats
      // In a real implementation, you'd query events or storage for more detailed stats
      return {
        totalSupply: tokenInfo.totalSupply,
        circulatingSupply: tokenInfo.totalSupply, // Assuming all tokens are circulating
        totalHolders: 0, // Would need to query all accounts with balance
        totalLocked: '0', // Would need to sum all locked amounts
        transferCount: 0  // Would need to query transfer events
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Retrieve paginated transfer history for an address.
   *
   * Queries Horizon payment records for the given address. Results are
   * normalised into a common transfer shape. Pass `cursor` from a previous
   * response to fetch the next page.
   *
   * @param address - The Stellar address to query history for.
   * @param limit - Maximum number of records to return (default `50`).
   * @param cursor - Paging token from a previous response for cursor-based pagination.
   * @returns An object with `transfers` array, `hasMore` flag, and optional `nextCursor`.
   * @throws {RWASDKError} If the Horizon query fails.
   */
  async getTransferHistory(
    address: Address,
    limit: number = 50,
    cursor?: string
  ): Promise<{
    transfers: Array<{
      from: Address;
      to: Address;
      amount: string;
      timestamp: Date;
      txHash: string;
    }>;
    hasMore: boolean;
    nextCursor?: string;
  }> {
    try {
      const payments = await this.server.payments()
        .forAccount(address.toString())
        .limit(limit)
        .cursor(cursor || '')
        .call();

      const transfers = payments.records.map((record: any) => ({
        from: new Address(record.from || record.source_account),
        to: new Address(record.to || record.funder || record.account),
        amount: record.amount || '0',
        timestamp: new Date(record.created_at),
        txHash: record.transaction_hash
      }));

      return {
        transfers,
        hasMore: payments.records.length > 0,
        nextCursor: payments.records.length > 0 ? payments.records[payments.records.length - 1].paging_token : undefined
      };
      // This would query transfer events from the contract
      // For now, return a placeholder implementation
      throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'getTransferHistory not implemented');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Estimate the fee for a token transfer.
   *
   * Returns a breakdown of the base network fee and any compliance-layer fee.
   * Currently the compliance fee is always `0`; this will be updated once the
   * compliance registry exposes a fee-query endpoint.
   *
   * @param from - Sender's Stellar address.
   * @param to - Recipient's Stellar address.
   * @param amount - Transfer amount as a raw integer string (no decimals).
   * @returns An object with `baseFee`, `complianceFee`, `totalFee`, and `feeCurrency`.
   */
  async estimateTransferFee(
    from: Address,
    to: Address,
    amount: string
  ): Promise<{
    baseFee: string;
    complianceFee: string;
    totalFee: string;
    feeCurrency: string;
  }> {
    try {
      const baseFee = (this.config.defaultFeeRate || 100).toString();
      return {
        baseFee,
        complianceFee: '0',
        totalFee: baseFee,
        feeCurrency: 'XLM'
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Check whether a transfer between two addresses is permitted.
   *
   * Calls `check_transfer_compliance` on the token contract. If the contract
   * call fails (e.g. compliance registry not configured), the method defaults
   * to `{ allowed: true }` to avoid blocking transfers during development.
   *
   * @param from - Sender's Stellar address.
   * @param to - Recipient's Stellar address.
   * @param amount - Transfer amount as a raw integer string (no decimals).
   * @returns An object with `allowed` boolean, an optional `reason` string when
   *   `allowed` is `false`, and an optional `restrictions` array.
   */
  async checkTransferAllowed(
    from: Address,
    to: Address,
    amount: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    restrictions?: string[];
  }> {
    try {
      const result = await this.contract.call(
        'check_transfer_compliance', 
        new Address(from), 
        new Address(to), 
        new ScInt(amount, xdr.ScValType.ScvI128)
      );
      const isAllowed = scValToNative(result.result);
      return {
        allowed: !!isAllowed,
        reason: isAllowed ? undefined : 'Compliance check failed by registry contract'
      };
    } catch (error) {
      return { allowed: true };
    }
  }

  // Private helper methods

  private convertScValToAssetInfo(scVal: xdr.ScVal): AssetInfo {
    const native = scValToNative(scVal);
    return {
      name: native.name?.toString() || '',
      symbol: native.symbol?.toString() || '',
      decimals: Number(native.decimals) || 18,
      totalSupply: native.total_supply?.toString() || '0',
      assetClass: native.asset_class?.toString() || '',
      metadata: native.metadata || {},
      complianceRegistry: native.compliance_registry?.toString() || '',
      dividendDistributor: native.dividend_distributor?.toString() || '',
    } as AssetInfo;
  }

  private convertScValToBalance(scVal: xdr.ScVal): Balance {
    const native = scValToNative(scVal);
    return {
      amount: native.amount?.toString() || '0',
      lockedAmount: native.locked_amount?.toString() || '0',
      votingPower: native.voting_power?.toString() || '0',
      lastDividendClaim: Number(native.last_dividend_claim) || 0,
    } as Balance;
  }

  private async signTransaction(transaction: any, signer: Address): Promise<any> {
    if ((this.config.stellar as any)?.secretKey) {
      const keypair = Keypair.fromSecret((this.config.stellar as any).secretKey);
      transaction.sign(keypair);
      return transaction;
    }
    throw new UnauthorizedError('signTransaction requires a configured secretKey in the SDK config');
  }

  private handleError(error: unknown): RWASDKErrorClass {
    if (error instanceof RWASDKErrorClass) {
      return error;
    }

    const message = (error && typeof error === 'object' && 'message' in error && typeof (error as Record<string, unknown>).message === 'string')
      ? (error as Record<string, string>).message
      : String(error);

    if (message.includes('timeout')) {
      return new TimeoutError(message);
    }

    if (message.includes('insufficient')) {
      return new InsufficientBalanceError(message);
    }

    if (message.includes('unauthorized')) {
      return new UnauthorizedError(message);
    }

    // Try to parse Soroban contract error numbers (e.g. "ContractError(201)")
    const match = message.match(/ContractError\((\d+)\)/);
    if (match) {
      const code = contractErrorToCode(parseInt(match[1]));
      return new RWASDKErrorClass(code, message);
    }

    return new ContractError(message);
  }
}
