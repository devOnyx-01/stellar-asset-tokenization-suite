import { 
  Server, 
  TransactionBuilder, 
  Networks, 
  Account, 
  Address,
  Contract,
  xdr,
  ScInt,
  ScSymbol
} from 'stellar-sdk';
import { 
  AssetInfo, 
  Balance, 
  TransferOptions, 
  TransactionOptions, 
  RWASDKConfig, 
  RWASDKError, 
  ErrorCode 
} from './types';
import { RWASDKError as RWASDKErrorClass } from './errors';

export class TokenClient {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;
  private tokenAddress: Address;

  constructor(config: RWASDKConfig, tokenAddress: Address) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.tokenAddress = tokenAddress;
    this.contract = new Contract(tokenAddress);
  }

  /**
   * Get token information
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
   * Get balance for an address
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
   * Transfer tokens
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Mint tokens (admin only)
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Burn tokens
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Lock tokens for voting or staking
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Unlock tokens
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Pause token transfers (admin only)
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Unpause token transfers (admin only)
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Freeze token (emergency regulatory compliance)
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Unfreeze token
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
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get token statistics
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
   * Get transfer history for an address
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
      // This would query transfer events from the contract
      // For now, return a placeholder implementation
      throw new Error('getTransferHistory not implemented');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Estimate transfer fee
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
      // This would calculate fees based on compliance rules and market conditions
      // For now, return a placeholder implementation
      return {
        baseFee: '100',
        complianceFee: '0',
        totalFee: '100',
        feeCurrency: 'XLM'
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Check if transfer is allowed
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
      // This would check compliance rules and transfer restrictions
      // For now, return a placeholder implementation
      return {
        allowed: true
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Private helper methods

  private convertScValToAssetInfo(scVal: xdr.ScVal): AssetInfo {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new Error('convertScValToAssetInfo not implemented');
  }

  private convertScValToBalance(scVal: xdr.ScVal): Balance {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new Error('convertScValToBalance not implemented');
  }

  private async signTransaction(transaction: any, signer: Address): Promise<any> {
    // This would sign the transaction with the signer's key
    // For now, return a placeholder implementation
    throw new Error('signTransaction not implemented');
  }

  private handleError(error: any): RWASDKErrorClass {
    if (error instanceof RWASDKErrorClass) {
      return error;
    }

    // Convert different error types to RWASDKError
    if (error.message?.includes('timeout')) {
      return new RWASDKErrorClass(ErrorCode.TIMEOUT, error.message);
    }

    if (error.message?.includes('insufficient')) {
      return new RWASDKErrorClass(ErrorCode.INSUFFICIENT_BALANCE, error.message);
    }

    if (error.message?.includes('unauthorized')) {
      return new RWASDKErrorClass(ErrorCode.UNAUTHORIZED, error.message);
    }

    return new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, error.message);
  }
}
