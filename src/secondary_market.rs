use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, token::TokenClient, Address, Env, Map,
    Symbol, Vec,
};

use crate::auth::assert_admin;
use crate::rwa_token::RWATokenClient;

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
#[derive(Clone)]
pub struct Order {
    pub order_id: u64,
    pub order_type: Symbol,
    pub token_address: Address,
    pub trader: Address,
    pub amount: i128,
    pub price: i128,
    pub total_value: i128,
    pub filled_amount: i128,
    pub remaining_amount: i128,
    pub created_at: u64,
    pub expires_at: u64,
    pub is_active: bool,
    pub metadata: Map<Symbol, Symbol>,
}

#[contracttype]
#[derive(Clone)]
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
#[derive(Clone)]
pub struct MarketConfig {
    pub fee_rate: i64,
    pub fee_recipient: Address,
    pub min_order_size: i128,
    pub max_order_size: i128,
    pub max_spread_bps: i64,
    pub is_paused: bool,
    pub supported_tokens: Vec<Address>,
    pub base_currency: Address,
}

#[contracttype]
#[derive(Clone)]
pub struct OrderBook {
    pub token_address: Address,
    pub buy_orders: Vec<Order>,
    pub sell_orders: Vec<Order>,
    pub last_price: i128,
    pub volume_24h: i128,
    pub last_updated: u64,
}

#[contract]
pub struct SecondaryMarket;

#[contractimpl]
impl SecondaryMarket {
    pub fn initialize(
        env: Env,
        auth: Address,
        admin: Address,
        fee_rate: i64,
        min_order_size: i128,
    ) {
        auth.require_auth();
        if env
            .storage()
            .instance()
            .has(&Symbol::new(&env, "initialized"))
        {
            panic!("Market already initialized");
        }

        // Placeholder until `update_config` sets a real settlement token; avoids private Address ctors.
        let base_currency = admin.clone();
        let config = MarketConfig {
            fee_rate,
            fee_recipient: admin.clone(),
            min_order_size,
            max_order_size: i128::MAX / 1000,
            max_spread_bps: 500,
            is_paused: false,
            supported_tokens: Vec::new(&env),
            base_currency,
        };

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "config"), &config);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "order_count"), &0u64);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "trade_count"), &0u64);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "orders"), &Vec::<Order>::new(&env));
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "trades"), &Vec::<Trade>::new(&env));
        env.storage().instance().set(
            &Symbol::new(&env, "order_books"),
            &Map::<Address, OrderBook>::new(&env),
        );
    }

    pub fn create_buy_order(
        env: Env,
        auth: Address,
        token_address: Address,
        amount: i128,
        price: i128,
        expires_at: u64,
    ) -> u64 {
        auth.require_auth();
        let order_type = Symbol::new(&env, "buy");
        Self::create_order(
            env,
            auth,
            token_address,
            order_type,
            amount,
            price,
            expires_at,
        )
    }

    pub fn create_sell_order(
        env: Env,
        auth: Address,
        token_address: Address,
        amount: i128,
        price: i128,
        expires_at: u64,
    ) -> u64 {
        auth.require_auth();
        let order_type = Symbol::new(&env, "sell");
        Self::create_order(
            env,
            auth,
            token_address,
            order_type,
            amount,
            price,
            expires_at,
        )
    }

    fn create_order(
        env: Env,
        auth: Address,
        token_address: Address,
        order_type: Symbol,
        amount: i128,
        price: i128,
        expires_at: u64,
    ) -> u64 {
        if amount <= 0 || price <= 0 {
            panic!("Invalid amount or price");
        }

        let config: MarketConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        if config.is_paused {
            panic!("Trading is paused");
        }

        if !config
            .supported_tokens
            .iter()
            .any(|t| t.clone() == token_address)
        {
            panic!("Token not supported");
        }

        if amount < config.min_order_size || amount > config.max_order_size {
            panic!("Order size outside limits");
        }

        let trader = auth;
        let total_value = amount * price;

        if order_type == Symbol::new(&env, "buy") {
            let base_client = TokenClient::new(&env, &config.base_currency);
            if base_client.balance(&trader) < total_value {
                panic!("Insufficient base currency balance");
            }
        } else {
            let rwa_client = RWATokenClient::new(&env, &token_address);
            if rwa_client.get_balance(&trader).amount < amount {
                panic!("Insufficient token balance");
            }
        }

        let order_count: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "order_count"))
            .unwrap_or(0u64);

        let order_id = order_count + 1;

        let order = Order {
            order_id,
            order_type: order_type.clone(),
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

        let mut orders: Vec<Order> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        orders.push_back(order.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "orders"), &orders);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "order_count"), &order_id);

        Self::update_order_book(env.clone(), token_address.clone(), order.clone());

        if order.order_type == Symbol::new(&env, "buy") {
            let base_client = TokenClient::new(&env, &config.base_currency);
            base_client.transfer(&trader, &env.current_contract_address(), &total_value);
        } else {
            let rwa_client = RWATokenClient::new(&env, &token_address);
            rwa_client.transfer(&trader, &env.current_contract_address(), &amount);
        }

        env.events().publish(
            (Symbol::new(&env, "order_created"), token_address.clone()),
            (order_id, order_type, amount, price),
        );

        Self::match_orders(env.clone(), token_address);

        order_id
    }

    pub fn cancel_order(env: Env, auth: Address, order_id: u64) {
        auth.require_auth();

        let orders: Vec<Order> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        let mut order: Option<Order> = None;
        for o in orders.iter() {
            if o.order_id == order_id {
                order = Some(o.clone());
                break;
            }
        }
        let order = order.unwrap_or_else(|| panic!("Order not found"));

        if order.trader != auth {
            panic!("Unauthorized: Only order creator can cancel");
        }

        if !order.is_active {
            panic!("Order already cancelled or filled");
        }

        let config: MarketConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        if order.order_type == Symbol::new(&env, "buy") {
            let base_client = TokenClient::new(&env, &config.base_currency);
            let refund_amount = order.remaining_amount * order.price;
            base_client.transfer(
                &env.current_contract_address(),
                &order.trader,
                &refund_amount,
            );
        } else {
            let rwa_client = RWATokenClient::new(&env, &order.token_address);
            rwa_client.transfer(
                &env.current_contract_address(),
                &order.trader,
                &order.remaining_amount,
            );
        }

        Self::update_order_status(env, order_id, false);
    }

    pub fn match_orders(env: Env, token_address: Address) {
        let order_book: OrderBook =
            env.storage()
                .instance()
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

        let config: MarketConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let mut trades_to_execute = Vec::<(Order, Order, i128)>::new(&env);

        for buy_order in order_book.buy_orders.iter() {
            if !buy_order.is_active || buy_order.remaining_amount == 0 {
                continue;
            }

            for sell_order in order_book.sell_orders.iter() {
                if !sell_order.is_active || sell_order.remaining_amount == 0 {
                    continue;
                }

                if buy_order.price >= sell_order.price {
                    let trade_amount = buy_order.remaining_amount.min(sell_order.remaining_amount);

                    let spread_bps: i64 = if buy_order.price > 0 {
                        (((buy_order.price - sell_order.price) * 10000) / buy_order.price) as i64
                    } else {
                        i64::MAX
                    };
                    if spread_bps > config.max_spread_bps {
                        continue;
                    }

                    trades_to_execute.push_back((
                        buy_order.clone(),
                        sell_order.clone(),
                        trade_amount,
                    ));
                }
            }
        }

        for i in 0..trades_to_execute.len() {
            let tri = trades_to_execute.get(i).unwrap();
            let bo = tri.0.clone();
            let so = tri.1.clone();
            let amt = tri.2;
            Self::execute_trade(env.clone(), bo, so, amt);
        }
    }

    fn execute_trade(env: Env, buy_order: Order, sell_order: Order, trade_amount: i128) {
        let config: MarketConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let trade_price = sell_order.price;
        let trade_value = trade_amount * trade_price;
        let fee_amount = (trade_value * config.fee_rate as i128) / 10000i128;
        let net_value = trade_value - fee_amount;

        let rwa_client = RWATokenClient::new(&env, &buy_order.token_address);
        rwa_client.transfer(
            &env.current_contract_address(),
            &buy_order.trader,
            &trade_amount,
        );

        let base_client = TokenClient::new(&env, &config.base_currency);
        base_client.transfer(
            &env.current_contract_address(),
            &sell_order.trader,
            &net_value,
        );

        if fee_amount > 0 {
            base_client.transfer(
                &env.current_contract_address(),
                &config.fee_recipient,
                &fee_amount,
            );
        }

        Self::update_order_fill(env.clone(), buy_order.order_id, trade_amount);
        Self::update_order_fill(env.clone(), sell_order.order_id, trade_amount);

        let trade_count: u64 = env
            .storage()
            .instance()
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

        let mut trades: Vec<Trade> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "trades"))
            .unwrap_or(Vec::new(&env));

        trades.push_back(trade);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "trades"), &trades);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "trade_count"), &trade_id);

        Self::update_order_book_after_trade(
            env.clone(),
            buy_order.token_address.clone(),
            trade_price,
            trade_value,
        );

        env.events().publish(
            (Symbol::new(&env, "trade_executed"), buy_order.token_address),
            (trade_id, trade_amount, trade_price),
        );
    }

    fn update_order_book(env: Env, token_address: Address, new_order: Order) {
        let mut order_book: OrderBook =
            env.storage()
                .instance()
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
        } else {
            order_book.sell_orders.push_back(new_order);
        }

        order_book.last_updated = env.ledger().timestamp();
        env.storage().instance().set(&token_address, &order_book);
    }

    fn update_order_book_after_trade(env: Env, token_address: Address, price: i128, value: i128) {
        let mut order_book: OrderBook =
            env.storage()
                .instance()
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

    fn update_order_fill(env: Env, order_id: u64, fill_amount: i128) {
        let orders: Vec<Order> = env
            .storage()
            .instance()
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
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "orders"), &new_orders);
        }
    }

    fn update_order_status(env: Env, order_id: u64, is_active: bool) {
        let orders: Vec<Order> = env
            .storage()
            .instance()
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
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "orders"), &new_orders);
        }
    }

    pub fn get_order_book(env: Env, token_address: Address) -> OrderBook {
        env.storage()
            .instance()
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

    pub fn get_order(env: Env, order_id: u64) -> Order {
        let orders: Vec<Order> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "orders"))
            .unwrap_or(Vec::new(&env));

        for o in orders.iter() {
            if o.order_id == order_id {
                return o.clone();
            }
        }
        panic!("Order not found")
    }

    pub fn get_user_orders(env: Env, user: Address) -> Vec<Order> {
        let orders: Vec<Order> = env
            .storage()
            .instance()
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

    pub fn get_recent_trades(env: Env, token_address: Address, limit: u32) -> Vec<Trade> {
        let trades: Vec<Trade> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "trades"))
            .unwrap_or(Vec::new(&env));

        let mut token_trades = Vec::<Trade>::new(&env);
        let mut n: u32 = 0;
        let mut i = trades.len();
        while i > 0 {
            i -= 1;
            let trade = trades.get(i).unwrap();
            if trade.token_address == token_address && n < limit {
                token_trades.push_back(trade.clone());
                n += 1;
            }
        }

        token_trades
    }

    pub fn add_supported_token(env: Env, auth: Address, token_address: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Market not initialized"));

        assert_admin(&auth, &admin);

        let mut config: MarketConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        if !config
            .supported_tokens
            .iter()
            .any(|t| t.clone() == token_address)
        {
            config.supported_tokens.push_back(token_address);
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "config"), &config);
        }
    }

    pub fn set_pause_status(env: Env, auth: Address, paused: bool) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Market not initialized"));

        assert_admin(&auth, &admin);

        let mut config: MarketConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        config.is_paused = paused;
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "config"), &config);
    }

    pub fn update_config(env: Env, auth: Address, config: MarketConfig) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Market not initialized"));

        assert_admin(&auth, &admin);

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "config"), &config);
    }
}
