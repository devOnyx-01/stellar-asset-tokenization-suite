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
  Order, 
  OrderType, 
  Trade, 
  OrderBook, 
  MarketConfig, 
  OrderOptions, 
  TransactionOptions, 
  RWASDKConfig, 
  RWASDKError
} from './types';
import { RWASDKError as RWASDKErrorClass, contractErrorToCode, TimeoutError, InsufficientBalanceError, UnauthorizedError, ContractError, TransactionError } from './errors';

/**
 * Client for interacting with the on-chain SecondaryMarket contract.
 *
 * Provides methods for placing and cancelling orders, triggering order
 * matching, querying the order book, and managing market configuration.
 *
 * @example
 * ```ts
 * const market = new MarketClient(sdkConfig);
 * const { orderId } = await market.createBuyOrder(trader, orderOptions);
 * ```
 */
export class MarketClient {
  private server: Server;
  private contract: Contract;
  private config: RWASDKConfig;

  /**
   * Create a new MarketClient.
   *
   * @param config - SDK configuration. `config.contracts.secondaryMarket` must
   *   be set to the deployed SecondaryMarket contract address.
   */
  constructor(config: RWASDKConfig) {
    this.config = config;
    this.server = new Server(config.stellar.serverUrl);
    this.contract = new Contract(config.contracts.secondaryMarket);
  }

  /**
   * Place a buy (bid) limit order on the secondary market.
   *
   * @param trader - Address placing the order.
   * @param options - Order parameters: token address, amount, price (in base
   *   currency), optional expiry date, and optional metadata.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns An object with the Stellar `transactionHash` and the on-chain `orderId`.
   * @throws {RWASDKError} With code `TRADING_PAUSED` if the market is paused.
   * @throws {RWASDKError} With code `MIN_ORDER_SIZE_NOT_MET` if the amount is below the minimum.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
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
        throw new TransactionError(`Transaction failed: ${result.error}`);
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
   * Place a sell (ask) limit order on the secondary market.
   *
   * @param trader - Address placing the order. Must hold sufficient token balance.
   * @param options - Order parameters: token address, amount, price (in base
   *   currency), optional expiry date, and optional metadata.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns An object with the Stellar `transactionHash` and the on-chain `orderId`.
   * @throws {RWASDKError} With code `INSUFFICIENT_BALANCE` if the trader lacks sufficient tokens.
   * @throws {RWASDKError} With code `TRADING_PAUSED` if the market is paused.
   * @throws {RWASDKError} With code `TRANSACTION_FAILED` if the transaction is rejected on-chain.
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
        throw new TransactionError(`Transaction failed: ${result.error}`);
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
   * Cancel an existing open order.
   *
   * Only the original order maker can cancel their own order.
   *
   * @param trader - Address of the order maker.
   * @param orderId - On-chain ID of the order to cancel.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `ORDER_NOT_FOUND` if the order does not exist.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `trader` is not the order maker.
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
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Trigger the on-chain order matching engine for a token.
   *
   * Can be called by any address. The contract will attempt to match the best
   * available buy and sell orders for the given token.
   *
   * @param caller - Address submitting the match request (pays the transaction fee).
   * @param tokenAddress - On-chain address of the token whose orders should be matched.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `TRADING_PAUSED` if the market is paused.
   * @throws {RWASDKError} With code `INSUFFICIENT_LIQUIDITY` if no matching orders exist.
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
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Fetch the current order book for a token.
   *
   * Buy orders are sorted by price descending (best bid first); sell orders
   * are sorted by price ascending (best ask first).
   *
   * @param tokenAddress - On-chain address of the token to query.
   * @returns An `OrderBook` object with `buyOrders`, `sellOrders`, `lastPrice`,
   *   `volume24h`, and `lastUpdated`.
   * @throws {RWASDKError} If the contract call fails.
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
   * Fetch details of a specific order by its on-chain ID.
   *
   * @param orderId - On-chain ID of the order to query.
   * @returns An `Order` object with full order details.
   * @throws {RWASDKError} With code `ORDER_NOT_FOUND` if the order does not exist.
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
   * Retrieve all open orders placed by a specific user.
   *
   * @param user - Address of the trader to query.
   * @returns An array of `Order` objects for all open orders belonging to `user`.
   * @throws {RWASDKError} If the contract call fails.
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
   * Retrieve the most recent trades for a token.
   *
   * @param tokenAddress - On-chain address of the token to query.
   * @param limit - Maximum number of trades to return (default `50`).
   * @returns An array of `Trade` objects sorted by execution time descending.
   * @throws {RWASDKError} If the contract call fails.
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
   * Register a token as tradeable on the secondary market (admin only).
   *
   * @param admin - Admin address that authorises the operation.
   * @param tokenAddress - On-chain address of the token to add.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the market admin.
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
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Pause or resume trading on the secondary market (admin only).
   *
   * When paused, all `createBuyOrder`, `createSellOrder`, and `matchOrders`
   * calls will be rejected with `TRADING_PAUSED`.
   *
   * @param admin - Admin address that authorises the status change.
   * @param paused - `true` to pause trading, `false` to resume.
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the market admin.
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
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Update the market configuration (admin only).
   *
   * @param admin - Admin address that authorises the update.
   * @param config - New `MarketConfig` to apply (fee rate, min/max order size,
   *   max spread, supported tokens, base currency, etc.).
   * @param txOptions - Optional transaction overrides (fee, timeout, memo).
   * @returns The Stellar transaction hash.
   * @throws {RWASDKError} With code `UNAUTHORIZED` if `admin` is not the market admin.
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
        throw new TransactionError(`Transaction failed: ${result.error}`);
      }

      return result.hash;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Retrieve aggregate market statistics, optionally scoped to a token.
   *
   * @param tokenAddress - Optional token address to scope the stats. If omitted,
   *   returns platform-wide totals.
   * @returns An object with `totalOrders`, `activeOrders`, `totalTrades`,
   *   `volume24h`, `avgPrice`, and `spread`.
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
   * Retrieve OHLCV (candlestick) price history for a token.
   *
   * @param tokenAddress - On-chain address of the token to query.
   * @param interval - Candle interval: `'1m'`, `'5m'`, `'15m'`, `'1h'`, `'4h'`, or `'1d'`.
   *   Defaults to `'1h'`.
   * @param limit - Maximum number of candles to return (default `100`).
   * @returns An array of OHLCV objects, each with `timestamp`, `open`, `high`,
   *   `low`, `close`, and `volume`.
   * @throws {RWASDKError} With code `CONTRACT_ERROR` — not yet implemented.
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
      throw new ContractError('getPriceHistory not implemented');
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Estimate the trading fee for a given order.
   *
   * @param orderType - `OrderType.BUY` or `OrderType.SELL`.
   * @param amount - Order amount as a raw integer string (no decimals).
   * @param price - Order price in base currency as a raw integer string.
   * @returns An object with `baseFee`, `tradingFee`, `totalFee`, and `feeCurrency`.
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
   * Retrieve the top N price levels from the order book (market depth).
   *
   * @param tokenAddress - On-chain address of the token to query.
   * @param depth - Number of price levels to return on each side (default `10`).
   * @returns An object with `bids` and `asks` arrays, each entry containing
   *   `price`, `amount`, and `total` (price × amount).
   * @throws {RWASDKError} If the underlying `getOrderBook` call fails.
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
      
      const toBigInt = (val: string): bigint => {
        try { return BigInt(val); } catch { return 0n; }
      };

      const bids = orderBook.buyOrders.slice(0, depth).map(order => ({
        price: order.price,
        amount: order.remainingAmount,
        total: (toBigInt(order.price) * toBigInt(order.remainingAmount)).toString()
      }));

      const asks = orderBook.sellOrders.slice(0, depth).map(order => ({
        price: order.price,
        amount: order.remainingAmount,
        total: (toBigInt(order.price) * toBigInt(order.remainingAmount)).toString()
      }));

      return { bids, asks };
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

  private convertMarketConfigToScVal(config: MarketConfig): xdr.ScVal {
    throw new ContractError('convertMarketConfigToScVal not implemented');
  }

  private convertScValToOrderBook(scVal: xdr.ScVal): OrderBook {
    throw new ContractError('convertScValToOrderBook not implemented');
  }

  private convertScValToOrder(scVal: xdr.ScVal): Order {
    throw new ContractError('convertScValToOrder not implemented');
  }

  private convertScValToOrderArray(scVal: xdr.ScVal): Order[] {
    throw new ContractError('convertScValToOrderArray not implemented');
  }

  private convertScValToTradeArray(scVal: xdr.ScVal): Trade[] {
    throw new ContractError('convertScValToTradeArray not implemented');
  }

  private extractOrderId(resultMetaXdr: string): number {
    throw new ContractError('extractOrderId not implemented');
  }

  private async signTransaction(transaction: any, signer: Address): Promise<any> {
    throw new ContractError('signTransaction not implemented');
  }

  private handleError(error: unknown): RWASDKErrorClass {
    if (error instanceof RWASDKErrorClass) {
      return error;
    }

    const message = error.message || String(error);

    if (message.includes('timeout')) {
      return new TimeoutError(message);
    }

    if (message.includes('insufficient')) {
      return new InsufficientBalanceError(message);
    }

    if (message.includes('unauthorized')) {
      return new UnauthorizedError(message);
    }

    // Try to parse Soroban contract error numbers (e.g. "ContractError(501)")
    const match = message.match(/ContractError\((\d+)\)/);
    if (match) {
      const code = contractErrorToCode(parseInt(match[1]));
      return new RWASDKErrorClass(code, message);
    }

    return new ContractError(message);
  }
}
