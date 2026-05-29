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
  Order, 
  OrderType, 
  Trade, 
  OrderBook, 
  MarketConfig, 
  OrderOptions, 
  TransactionOptions, 
  RWASDKConfig, 
  RWASDKError, 
  ErrorCode 
} from './types';
import { RWASDKError as RWASDKErrorClass, contractErrorToCode } from './errors';

export class MarketClient {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;

  constructor(config: RWASDKConfig) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.contract = new Contract(config.contracts.secondaryMarket);
  }

  /**
   * Create a buy order
   */
  async createBuyOrder(
    trader: Address,
    options: OrderOptions,
    txOptions: TransactionOptions = {}
  ): Promise<{ transactionHash: string; orderId: number }> {
    try {
      const account = await this.server.getAccount(trader.toString());
      
      const expiresAt = options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default
      const metadataScMap = this.convertMetadataToScMap(options.metadata || {});
      
      const call = this.contract.call(
        'create_buy_order',
        new Address(options.tokenAddress),
        new ScInt(options.amount, xdr.ScValType.ScvI128),
        new ScInt(options.price, xdr.ScValType.ScvI128),
        new ScInt(Math.floor(expiresAt.getTime() / 1000))
      );

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, trader);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      // Extract order ID from result
      const orderId = this.extractOrderId(result.resultMetaXdr);

      return {
        transactionHash: result.hash,
        orderId
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Create a sell order
   */
  async createSellOrder(
    trader: Address,
    options: OrderOptions,
    txOptions: TransactionOptions = {}
  ): Promise<{ transactionHash: string; orderId: number }> {
    try {
      const account = await this.server.getAccount(trader.toString());
      
      const expiresAt = options.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours default
      const metadataScMap = this.convertMetadataToScMap(options.metadata || {});
      
      const call = this.contract.call(
        'create_sell_order',
        new Address(options.tokenAddress),
        new ScInt(options.amount, xdr.ScValType.ScvI128),
        new ScInt(options.price, xdr.ScValType.ScvI128),
        new ScInt(Math.floor(expiresAt.getTime() / 1000))
      );

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, trader);
      const result = await this.server.sendTransaction(signedTx);

      if (result.status === 'ERROR') {
        throw new RWASDKErrorClass(ErrorCode.TRANSACTION_FAILED, `Transaction failed: ${result.error}`);
      }

      // Extract order ID from result
      const orderId = this.extractOrderId(result.resultMetaXdr);

      return {
        transactionHash: result.hash,
        orderId
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    trader: Address,
    orderId: number,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(trader.toString());
      
      const call = this.contract.call('cancel_order', new ScInt(orderId));

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, trader);
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
   * Match orders for a token (can be called by anyone to trigger matching)
   */
  async matchOrders(
    caller: Address,
    tokenAddress: Address,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(caller.toString());
      
      const call = this.contract.call('match_orders', new Address(tokenAddress));

      const transaction = new TransactionBuilder(account, {
        fee: txOptions.fee || this.config.defaultFeeRate || 100,
        networkPassphrase: this.config.stellar.passphrase
      })
        .addOperation(call)
        .setTimeout(txOptions.timeout || 30)
        .build();

      const signedTx = await this.signTransaction(transaction, caller);
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
   * Get order book for a token
   */
  async getOrderBook(tokenAddress: Address): Promise<OrderBook> {
    try {
      const result = await this.contract.call('get_order_book', new Address(tokenAddress));
      const orderBook = this.convertScValToOrderBook(result.result);
      return orderBook;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get order information
   */
  async getOrder(orderId: number): Promise<Order> {
    try {
      const result = await this.contract.call('get_order', new ScInt(orderId));
      const order = this.convertScValToOrder(result.result);
      return order;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get user's orders
   */
  async getUserOrders(user: Address): Promise<Order[]> {
    try {
      const result = await this.contract.call('get_user_orders', new Address(user));
      const orders = this.convertScValToOrderArray(result.result);
      return orders;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(
    tokenAddress: Address,
    limit: number = 50
  ): Promise<Trade[]> {
    try {
      const result = await this.contract.call(
        'get_recent_trades', 
        new Address(tokenAddress), 
        new ScInt(limit)
      );
      const trades = this.convertScValToTradeArray(result.result);
      return trades;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Add supported token
   */
  async addSupportedToken(
    admin: Address,
    tokenAddress: Address,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('add_supported_token', new Address(tokenAddress));

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
   * Pause/unpause trading
   */
  async setPauseStatus(
    admin: Address,
    paused: boolean,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const call = this.contract.call('set_pause_status', paused);

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
   * Update market configuration
   */
  async updateConfig(
    admin: Address,
    config: MarketConfig,
    txOptions: TransactionOptions = {}
  ): Promise<string> {
    try {
      const account = await this.server.getAccount(admin.toString());
      
      const configScVal = this.convertMarketConfigToScVal(config);
      
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
   * Get market statistics
   */
  async getMarketStats(tokenAddress?: Address): Promise<{
    totalOrders: number;
    activeOrders: number;
    totalTrades: number;
    volume24h: string;
    avgPrice: string;
    spread: string;
  }> {
    try {
      // For now, return placeholder implementation
      // In a real implementation, you'd query events or storage for detailed stats
      return {
        totalOrders: 0,
        activeOrders: 0,
        totalTrades: 0,
        volume24h: '0',
        avgPrice: '0',
        spread: '0'
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get price history for a token
   */
  async getPriceHistory(
    tokenAddress: Address,
    interval: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' = '1h',
    limit: number = 100
  ): Promise<Array<{
    timestamp: Date;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>> {
    try {
      // This would query trade history and aggregate it into OHLCV data
      // For now, return a placeholder implementation
      throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'getPriceHistory not implemented');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Estimate trading fee
   */
  async estimateTradingFee(
    orderType: OrderType,
    amount: string,
    price: string
  ): Promise<{
    baseFee: string;
    tradingFee: string;
    totalFee: string;
    feeCurrency: string;
  }> {
    try {
      // This would calculate fees based on the market configuration
      // For now, return a placeholder implementation
      return {
        baseFee: '100',
        tradingFee: '0',
        totalFee: '100',
        feeCurrency: 'XLM'
      };
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get market depth (order book depth)
   */
  async getMarketDepth(
    tokenAddress: Address,
    depth: number = 10
  ): Promise<{
    bids: Array<{ price: string; amount: string; total: string }>;
    asks: Array<{ price: string; amount: string; total: string }>;
  }> {
    try {
      const orderBook = await this.getOrderBook(tokenAddress);
      
      const bids = orderBook.buyOrders.slice(0, depth).map(order => ({
        price: order.price,
        amount: order.remainingAmount,
        total: (BigInt(order.price) * BigInt(order.remainingAmount)).toString()
      }));

      const asks = orderBook.sellOrders.slice(0, depth).map(order => ({
        price: order.price,
        amount: order.remainingAmount,
        total: (BigInt(order.price) * BigInt(order.remainingAmount)).toString()
      }));

      return { bids, asks };
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

  private convertMarketConfigToScVal(config: MarketConfig): xdr.ScVal {
    // This would convert MarketConfig to ScVal
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertMarketConfigToScVal not implemented');
  }

  private convertScValToOrderBook(scVal: xdr.ScVal): OrderBook {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToOrderBook not implemented');
  }

  private convertScValToOrder(scVal: xdr.ScVal): Order {
    // This would parse the ScVal returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToOrder not implemented');
  }

  private convertScValToOrderArray(scVal: xdr.ScVal): Order[] {
    // This would parse the ScVal array returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToOrderArray not implemented');
  }

  private convertScValToTradeArray(scVal: xdr.ScVal): Trade[] {
    // This would parse the ScVal array returned from the contract
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'convertScValToTradeArray not implemented');
  }

  private extractOrderId(resultMetaXdr: string): number {
    // This would extract the order ID from transaction result
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'extractOrderId not implemented');
  }

  private async signTransaction(transaction: any, signer: Address): Promise<any> {
    // This would sign the transaction with the signer's key
    // For now, return a placeholder implementation
    throw new RWASDKErrorClass(ErrorCode.CONTRACT_ERROR, 'signTransaction not implemented');
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
