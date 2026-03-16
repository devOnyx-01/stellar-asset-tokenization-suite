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
import { AssetInfo, AssetType, DeploymentOptions, RWASDKConfig, TransactionOptions, RWASDKError, ErrorCode } from './types';
import { RWASDKError as RWASDKErrorClass } from './errors';

export class AssetFactory {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;

  constructor(config: RWASDKConfig) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.contract = new Contract(config.contracts.assetFactory);
  }

  /**
   * Deploy a new RWA token contract
   */
  async deployRWAToken(
    deployer: Address,
    options: DeploymentOptions,
    txOptions: TransactionOptions = {}
  ): Promise<{ transactionHash: string; tokenAddress: Address }> {
    try {
      const account = await this.server.getAccount(deployer.toString());
      
      // Build the contract call
      const call = this.contract.call(
        'deploy_rwa_token',
        new ScSymbol(options.name),
        new ScSymbol(options.symbol),
        new ScInt(options.totalSupply, xdr.ScValType.ScvI128),
        new ScInt(options.decimals),
        new ScSymbol(options.assetType),
        this.convertMetadataToScMap(options.metadata),
        new Address(options.complianceRegistry),
        new Address(options.dividendDistributor)
      );

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      // Sign and submit transaction
      const signedTx = await this.signTransaction(transaction, deployer);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      // Extract token address from result
      const tokenAddress = this.extractTokenAddress(result.resultMetaXdr);

      return {
        transactionHash: result.hash,
        tokenAddress
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get asset information by symbol
   */
  async getAssetInfo(symbol: string): Promise<AssetInfo> {
    try {
      const result = await this.contract.call('get_asset_info', new ScSymbol(symbol));
      const assetInfo = this.convertScValToAssetInfo(result.result);
      return assetInfo;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * List all deployed assets
   */
  async listAssets(): Promise<AssetInfo[]> {
    try {
      const result = await this.contract.call('list_assets');
      const assets = this.convertScValToAssetInfoArray(result.result);
      return assets;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Pause/unpause an asset
   */
  async setAssetPauseStatus(
    admin: Address,
    symbol: string,
    paused: boolean,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call(
        'set_asset_pause_status',
        new ScSymbol(symbol),
        paused
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
   * Update factory admin
   */
  async updateAdmin(
    currentAdmin: Address,
    newAdmin: Address,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(currentAdmin.toString());
      
      const call = this.contract.call('update_admin', new Address(newAdmin));

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, currentAdmin);
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
   * Initialize the asset factory (for first-time setup)
   */
  async initialize(
    deployer: Address,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(deployer.toString());
      
      const call = this.contract.call('initialize', new Address(deployer));

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
   * Get factory statistics
   */
  async getFactoryStats(): Promise<{
    totalAssets: number;
    activeAssets: number;
    pausedAssets: number;
    totalSupply: string;
  }> {
    try {
      const assets = await this.listAssets();
      const totalAssets = assets.length;
      const activeAssets = assets.filter(a => !a.isPaused && !a.isFrozen).length;
      const pausedAssets = assets.filter(a => a.isPaused).length;
      
      const totalSupply = assets.reduce((sum, asset) => {
        return sum + BigInt(asset.totalSupply);
      }, BigInt(0));

      return {
        totalAssets,
        activeAssets,
        pausedAssets,
        totalSupply: totalSupply.toString()
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Search assets by type or metadata
   */
  async searchAssets(filters: {
    assetType?: AssetType;
    metadata?: Record<string, string>;
    isActive?: boolean;
  }): Promise<AssetInfo[]> {
    try {
      const allAssets = await this.listAssets();
      
      return allAssets.filter(asset => {
        if (filters.assetType && asset.assetType !== filters.assetType) {
          return false;
        }
        
        if (filters.isActive !== undefined) {
          const isActive = !asset.isPaused && !asset.isFrozen;
          if (filters.isActive !== isActive) {
            return false;
          }
        }
        
        if (filters.metadata) {
          for (const [key, value] of Object.entries(filters.metadata)) {
            if (asset.metadata[key] !== value) {
              return false;
            }
          }
        }
        
        return true;
      });
    } catch (error) {
      throw this.handleError(error);
    }
  }

  // Private helper methods

  private convertMetadataToScMap(metadata: Record<string, string>): xdr.ScMap {
    const map = new xdr.ScMap({
      map: Object.entries(metadata).map(([key, value]) => ({
        key: xdr.ScVal.scvSymbol(new ScSymbol(key)),
        val: xdr.ScVal.scvSymbol(new ScSymbol(value))
      }))
    });
    return map;
  }

  private convertScValToAssetInfo(scVal: xdr.ScVal): AssetInfo {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new Error('convertScValToAssetInfo not implemented');
  }

  private convertScValToAssetInfoArray(scVal: xdr.ScVal): AssetInfo[] {
    // This would parse the ScVal array returned from the contract
    // For now, return a placeholder implementation
    throw new Error('convertScValToAssetInfoArray not implemented');
  }

  private extractTokenAddress(resultMetaXdr: string): Address {
    // This would extract the token address from transaction result
    // For now, return a placeholder implementation
    throw new Error('extractTokenAddress not implemented');
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

    return new RWASDKErrorClass(ErrorCode.NETWORK_ERROR, error.message);
  }
}
