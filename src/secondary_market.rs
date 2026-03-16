use soroban_sdk::{
    contract, contractimpl, Address, Env, Symbol, Vec, Map, BytesN, 
    contracttype, contracterror, token
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum MarketError {
    Unauthorized = 1,
    InvalidOrder = 2,
    InsufficientBalance = 3,
    OrderNotFound = 4,
    OrderExpired = 5,
    InsufficientLiquidity = 6,
    TradingPaused = 7,
    ComplianceFailed = 8,
}

#[contracttype]
pub struct Order {
    pub order_id: u64,
    pub order_type: Symbol, // "buy" or "sell"
    pub token_address: Address,
    pub trader: Address,
    pub amount: i128,
    pub price: i128, // Price in base currency (USDC)
    pub total_value: i128,
    pub filled_amount: i128,
    pub remaining_amount: i128,
    pub created_at: u64,
    pub expires_at: u64,
    pub is_active: bool,
    pub metadata: Map<Symbol, Symbol>,
}

#[contracttype]
pub struct Trade {
    pub trade_id: u64,
    pub buy_order_id: u64,
    pub sell_order_id: u64,
    pub token_address: Address,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub price: i128,
    pub total_value: i128,
    pub fee_amount: i128,
    pub executed_at: u64,
}

#[contracttype]
pub struct MarketConfig {
    pub fee_rate: i64, // basis points (100 = 1%)
    pub fee_recipient: Address,
    pub min_order_size: i128,
    pub max_order_size: i128,
    pub max_spread_bps: i64, // Maximum spread in basis points
    pub is_paused: bool,
    pub supported_tokens: Vec<Address>,
    pub base_currency: Address, // USDC or similar
}

#[contracttype]
pub struct OrderBook {
    pub token_address: Address,
    pub buy_orders: Vec<Order>, // Sorted by price descending
    pub sell_orders: Vec<Order>, // Sorted by price ascending
    pub last_price: i128,
    pub volume_24h: i128,
    pub last_updated: u64,
}

#[contract]
pub struct SecondaryMarket;

#[contractimpl]
impl SecondaryMarket {
    /// Initialize the secondary market
    pub fn initialize(env: Env, admin: Address, fee_rate: i64, min_order_size: i128) {
        if env.storage().instance().has(&Symbol::new(&env, "initialized")) {
            panic!("Market already initialized");
        }

        let config = MarketConfig {
            fee_rate,
            fee_recipient: admin.clone(),
            min_order_size,
            max_order_size: i128::MAX / 1000, // Prevent overflow
            max_spread_bps: 500, // 5% max spread
            is_paused: false,
            supported_tokens: Vec::new(&env),
            base_currency: Address::from_contract_id(&BytesN::from_array(&env, &[2; 32])), // USDC placeholder
        };

        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
        env.storage().instance().set(&Symbol::new(&env, "initialized"), &true);
        env.storage().instance().set(&Symbol::new(&env, "order_count"), &0u64);
        env.storage().instance().set(&Symbol::new(&env, "trade_count"), &0u64);
        env.storage().instance().set(&Symbol::new(&env, "orders"), &Vec::<Order>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "trades"), &Vec::<Trade>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "order_books"), &Map::<Address, OrderBook>::new(&env));
    }

    /// Create a buy order
    pub fn create_buy_order(
        env: Env,
        token_address: Address,
        amount: i128,
        price: i128,
        expires_at: u64,
    ) -> u64 {
        self.create_order(env, token_address, Symbol::new(&env, "buy"), amount, price, expires_at)
    }

    /// Create a sell order
    pub fn create_sell_order(
        env: Env,
        token_address: Address,
        amount: i128,
        price: i128,
        expires_at: u64,
    ) -> u64 {
        self.create_order(env, token_address, Symbol::new(&env, "sell"), amount, price, expires_at)
    }

    /// Create an order (internal function)
    fn create_order(
        env: Env,
        token_address: Address,
        order_type: Symbol,
        amount: i128,
        price: i128,
        expires_at: u64,
    ) -> u64 {
        if amount <= 0 || price <= 0 {
            panic!("Invalid amount or price");
        }

        let config: MarketConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        if config.is_paused {
            panic!("Trading is paused");
        }

        // Check if token is supported
        if !config.supported_tokens.iter().any(|t| t == &token_address) {
            panic!("Token not supported");
        }

        // Check order size limits
        if amount < config.min_order_size || amount > config.max_order_size {
            panic!("Order size outside limits");
        }

        let trader = env.invoker();
        let total_value = amount * price;

        // For buy orders, check if trader has enough base currency
        if order_type == Symbol::new(&env, "buy") {
            let base_client = soroban_token_contract::Client::new(&env, &config.base_currency);
            if base_client.balance(&trader) < total_value {
                panic!("Insufficient base currency balance");
            }
        } else {
            // For sell orders, check if trader has enough tokens
            let token_client = soroban_token_contract::Client::new(&env, &token_address);
            if token_client.balance(&trader) < amount {
                panic!("Insufficient token balance");
            }
        }

        // Create order
        let order_count: u64 = env.storage().instance()
            .get(&Symbol::new(&env, "order_count"))
            .unwrap_or(0u64);

        let order_id = order_count + 1;

        let order = Order {
            order_id,
            order_type,
            token_address: token_address.clone(),
            trader: trader.clone(),
            amount,
            price,
            total_value,
            filled_amount: 0,
            remaining_amount: amount,
            created_at: env.ledger().timestamp(),
            expires_at,
            is_active: true,
            metadata: Map::new(&env),
        };

        // Store order
        let mut orders: Vec<Order> = env.storage().instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        orders.push_back(order.clone());
        env.storage().instance().set(&Symbol::new(&env, "orders"), &orders);
        env.storage().instance().set(&Symbol::new(&env, "order_count"), &order_id);

        // Update order book
        self.update_order_book(env, token_address, order.clone());

        // Lock funds
        if order.order_type == Symbol::new(&env, "buy") {
            let base_client = soroban_token_contract::Client::new(&env, &config.base_currency);
            base_client.transfer(
                &trader,
                &env.current_contract_address(),
                &total_value,
            );
        } else {
            let token_client = soroban_token_contract::Client::new(&env, &token_address);
            token_client.transfer(
                &trader,
                &env.current_contract_address(),
                &amount,
            );
        }

        env.events().publish(
            (Symbol::new(&env, "order_created"), token_address),
            (order_id, order_type, amount, price),
        );

        // Try to match the order
        self.match_orders(env, token_address);

        order_id
    }

    /// Cancel an order
    pub fn cancel_order(env: Env, order_id: u64) {
        let orders: Vec<Order> = env.storage().instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        let order = orders.iter()
            .find(|o| o.order_id == order_id)
            .cloned()
            .unwrap_or_else(|| panic!("Order not found"));

        if order.trader != env.invoker() {
            panic!("Unauthorized: Only order creator can cancel");
        }

        if !order.is_active {
            panic!("Order already cancelled or filled");
        }

        let config: MarketConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        // Refund locked funds
        if order.order_type == Symbol::new(&env, "buy") {
            let base_client = soroban_token_contract::Client::new(&env, &config.base_currency);
            let refund_amount = order.remaining_amount * order.price;
            base_client.transfer(
                &env.current_contract_address(),
                &order.trader,
                &refund_amount,
            );
        } else {
            let token_client = soroban_token_contract::Client::new(&env, &order.token_address);
            token_client.transfer(
                &env.current_contract_address(),
                &order.trader,
                &order.remaining_amount,
            );
        }

        // Update order status
        self.update_order_status(env, order_id, false);
    }

    /// Match orders for a token
    pub fn match_orders(env: Env, token_address: Address) {
        let mut order_book: OrderBook = env.storage().instance()
            .get(&token_address)
            .unwrap_or(OrderBook {
                token_address: token_address.clone(),
                buy_orders: Vec::new(&env),
                sell_orders: Vec::new(&env),
                last_price: 0,
                volume_24h: 0,
                last_updated: env.ledger().timestamp(),
            });

        if order_book.buy_orders.is_empty() || order_book.sell_orders.is_empty() {
            return;
        }

        let config: MarketConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let mut trades_to_execute = Vec::<(Order, Order, i128)>::new(&env);

        // Find matching orders
        for buy_order in order_book.buy_orders.iter() {
            if !buy_order.is_active || buy_order.remaining_amount == 0 {
                continue;
            }

            for sell_order in order_book.sell_orders.iter() {
                if !sell_order.is_active || sell_order.remaining_amount == 0 {
                    continue;
                }

                // Check if prices match (buy price >= sell price)
                if buy_order.price >= sell_order.price {
                    let trade_amount = buy_order.remaining_amount.min(sell_order.remaining_amount);
                    
                    // Check spread limit
                    let spread_bps = ((buy_order.price - sell_order.price) * 10000) / buy_order.price;
                    if spread_bps > config.max_spread_bps {
                        continue;
                    }

                    trades_to_execute.push_back((buy_order.clone(), sell_order.clone(), trade_amount));
                }
            }
        }

        // Execute trades
        for (buy_order, sell_order, trade_amount) in trades_to_execute.iter() {
            self.execute_trade(env, buy_order.clone(), sell_order.clone(), *trade_amount);
        }
    }

    /// Execute a trade
    fn execute_trade(env: Env, buy_order: Order, sell_order: Order, trade_amount: i128) {
        let config: MarketConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let trade_price = sell_order.price; // Use seller's price
        let trade_value = trade_amount * trade_price;
        let fee_amount = (trade_value * config.fee_rate as i128) / 10000i128;
        let net_value = trade_value - fee_amount;

        // Transfer tokens from seller to buyer
        let token_client = soroban_token_contract::Client::new(&env, &buy_order.token_address);
        token_client.transfer(
            &env.current_contract_address(),
            &buy_order.trader,
            &trade_amount,
        );

        // Transfer base currency from contract to seller
        let base_client = soroban_token_contract::Client::new(&env, &config.base_currency);
        base_client.transfer(
            &env.current_contract_address(),
            &sell_order.trader,
            &net_value,
        );

        // Transfer fee to fee recipient
        if fee_amount > 0 {
            base_client.transfer(
                &env.current_contract_address(),
                &config.fee_recipient,
                &fee_amount,
            );
        }

        // Update orders
        self.update_order_fill(env, buy_order.order_id, trade_amount);
        self.update_order_fill(env, sell_order.order_id, trade_amount);

        // Create trade record
        let trade_count: u64 = env.storage().instance()
            .get(&Symbol::new(&env, "trade_count"))
            .unwrap_or(0u64);

        let trade_id = trade_count + 1;

        let trade = Trade {
            trade_id,
            buy_order_id: buy_order.order_id,
            sell_order_id: sell_order.order_id,
            token_address: buy_order.token_address.clone(),
            buyer: buy_order.trader,
            seller: sell_order.trader,
            amount: trade_amount,
            price: trade_price,
            total_value: trade_value,
            fee_amount,
            executed_at: env.ledger().timestamp(),
        };

        let mut trades: Vec<Trade> = env.storage().instance()
            .get(&Symbol::new(&env, "trades"))
            .unwrap_or(Vec::new(&env));

        trades.push_back(trade);
        env.storage().instance().set(&Symbol::new(&env, "trades"), &trades);
        env.storage().instance().set(&Symbol::new(&env, "trade_count"), &trade_id);

        // Update order book
        self.update_order_book_after_trade(env, buy_order.token_address.clone(), trade_price, trade_value);

        env.events().publish(
            (Symbol::new(&env, "trade_executed"), buy_order.token_address),
            (trade_id, trade_amount, trade_price),
        );
    }

    /// Update order book
    fn update_order_book(env: Env, token_address: Address, new_order: Order) {
        let mut order_book: OrderBook = env.storage().instance()
            .get(&token_address)
            .unwrap_or(OrderBook {
                token_address: token_address.clone(),
                buy_orders: Vec::new(&env),
                sell_orders: Vec::new(&env),
                last_price: 0,
                volume_24h: 0,
                last_updated: env.ledger().timestamp(),
            });

        if new_order.order_type == Symbol::new(&env, "buy") {
            order_book.buy_orders.push_back(new_order);
            // Sort by price descending
            order_book.buy_orders.sort_by(|a, b| b.price.cmp(&a.price));
        } else {
            order_book.sell_orders.push_back(new_order);
            // Sort by price ascending
            order_book.sell_orders.sort_by(|a, b| a.price.cmp(&b.price));
        }

        order_book.last_updated = env.ledger().timestamp();
        env.storage().instance().set(&token_address, &order_book);
    }

    /// Update order book after trade
    fn update_order_book_after_trade(env: Env, token_address: Address, price: i128, value: i128) {
        let mut order_book: OrderBook = env.storage().instance()
            .get(&token_address)
            .unwrap_or(OrderBook {
                token_address: token_address.clone(),
                buy_orders: Vec::new(&env),
                sell_orders: Vec::new(&env),
                last_price: 0,
                volume_24h: 0,
                last_updated: env.ledger().timestamp(),
            });

        order_book.last_price = price;
        order_book.volume_24h += value;
        order_book.last_updated = env.ledger().timestamp();

        env.storage().instance().set(&token_address, &order_book);
    }

    /// Update order fill status
    fn update_order_fill(env: Env, order_id: u64, fill_amount: i128) {
        let mut orders: Vec<Order> = env.storage().instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        let mut found = false;
        let mut new_orders = Vec::<Order>::new(&env);

        for order in orders.iter() {
            if order.order_id == order_id {
                let mut updated_order = order.clone();
                updated_order.filled_amount += fill_amount;
                updated_order.remaining_amount -= fill_amount;

                if updated_order.remaining_amount == 0 {
                    updated_order.is_active = false;
                }

                new_orders.push_back(updated_order);
                found = true;
            } else {
                new_orders.push_back(order.clone());
            }
        }

        if found {
            env.storage().instance().set(&Symbol::new(&env, "orders"), &new_orders);
        }
    }

    /// Update order status
    fn update_order_status(env: Env, order_id: u64, is_active: bool) {
        let mut orders: Vec<Order> = env.storage().instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        let mut found = false;
        let mut new_orders = Vec::<Order>::new(&env);

        for order in orders.iter() {
            if order.order_id == order_id {
                let mut updated_order = order.clone();
                updated_order.is_active = is_active;
                new_orders.push_back(updated_order);
                found = true;
            } else {
                new_orders.push_back(order.clone());
            }
        }

        if found {
            env.storage().instance().set(&Symbol::new(&env, "orders"), &new_orders);
        }
    }

    /// Get order book for a token
    pub fn get_order_book(env: Env, token_address: Address) -> OrderBook {
        env.storage().instance()
            .get(&token_address)
            .unwrap_or(OrderBook {
                token_address: token_address.clone(),
                buy_orders: Vec::new(&env),
                sell_orders: Vec::new(&env),
                last_price: 0,
                volume_24h: 0,
                last_updated: env.ledger().timestamp(),
            })
    }

    /// Get order information
    pub fn get_order(env: Env, order_id: u64) -> Order {
        let orders: Vec<Order> = env.storage().instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        orders.iter()
            .find(|o| o.order_id == order_id)
            .cloned()
            .unwrap_or_else(|| panic!("Order not found"))
    }

    /// Get user's orders
    pub fn get_user_orders(env: Env, user: Address) -> Vec<Order> {
        let orders: Vec<Order> = env.storage().instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        let mut user_orders = Vec::<Order>::new(&env);
        for order in orders.iter() {
            if order.trader == user {
                user_orders.push_back(order.clone());
            }
        }

        user_orders
    }

    /// Get recent trades
    pub fn get_recent_trades(env: Env, token_address: Address, limit: u32) -> Vec<Trade> {
        let trades: Vec<Trade> = env.storage().instance()
            .get(&Symbol::new(&env, "trades"))
            .unwrap_or(Vec::new(&env));

        let mut token_trades = Vec::<Trade>::new(&env);
        for trade in trades.iter().rev() {
            if trade.token_address == token_address && token_trades.len() < limit as usize {
                token_trades.push_back(trade.clone());
            }
        }

        token_trades
    }

    /// Add supported token
    pub fn add_supported_token(env: Env, token_address: Address) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Market not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can add supported tokens");
        }

        let mut config: MarketConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        if !config.supported_tokens.iter().any(|t| t == &token_address) {
            config.supported_tokens.push_back(token_address);
            env.storage().instance().set(&Symbol::new(&env, "config"), &config);
        }
    }

    /// Pause/unpause trading
    pub fn set_pause_status(env: Env, paused: bool) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Market not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can pause trading");
        }

        let mut config: MarketConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        config.is_paused = paused;
        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
    }

    /// Update market configuration
    pub fn update_config(env: Env, config: MarketConfig) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Market not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update config");
        }

        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
    }
}
