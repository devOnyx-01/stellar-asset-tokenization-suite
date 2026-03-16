use soroban_sdk::{
    contract, contractimpl, Address, Env, Symbol, Vec, Map, BytesN, 
    contracttype, contracterror, token
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum DividendError {
    Unauthorized = 1,
    InsufficientFunds = 2,
    InvalidAmount = 3,
    DistributionNotFound = 4,
    AlreadyClaimed = 5,
    UnsupportedCurrency = 6,
    DistributionNotActive = 7,
}

#[contracttype]
pub struct DividendDistribution {
    pub distribution_id: u64,
    pub token_address: Address,
    pub currency: Symbol,
    pub total_amount: i128,
    pub per_token_amount: i128,
    pub total_supply: i128,
    pub claim_deadline: u64,
    pub created_at: u64,
    pub is_active: bool,
    pub metadata: Map<Symbol, Symbol>,
}

#[contracttype]
pub struct ClaimInfo {
    pub distribution_id: u64,
    pub claimer: Address,
    pub amount_claimed: i128,
    pub claimed_at: u64,
    pub currency: Symbol,
}

#[contracttype]
pub struct DividendConfig {
    pub supported_currencies: Vec<Symbol>,
    pub auto_distribute: bool,
    pub min_distribution_amount: i128,
    pub max_distribution_frequency: u64, // in seconds
    pub fee_rate: i64, // basis points (100 = 1%)
    pub fee_recipient: Address,
}

#[contract]
pub struct DividendDistributor;

#[contractimpl]
impl DividendDistributor {
    /// Initialize the dividend distributor
    pub fn initialize(env: Env, admin: Address, supported_currencies: Vec<Symbol>) {
        if env.storage().instance().has(&Symbol::new(&env, "initialized")) {
            panic!("Distributor already initialized");
        }

        let config = DividendConfig {
            supported_currencies: supported_currencies.clone(),
            auto_distribute: false,
            min_distribution_amount: 1000, // Minimum $10 equivalent
            max_distribution_frequency: 86400, // Once per day
            fee_rate: 50, // 0.5% fee
            fee_recipient: admin.clone(),
        };

        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
        env.storage().instance().set(&Symbol::new(&env, "initialized"), &true);
        env.storage().instance().set(&Symbol::new(&env, "distribution_count"), &0u64);
        env.storage().instance().set(&Symbol::new(&env, "distributions"), &Vec::<DividendDistribution>::new(&env));
    }

    /// Create a new dividend distribution
    pub fn create_distribution(
        env: Env,
        token_address: Address,
        currency: Symbol,
        amount: i128,
        claim_deadline: u64,
        metadata: Map<Symbol, Symbol>,
    ) -> u64 {
        if amount <= 0 {
            panic!("Invalid amount");
        }

        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Distributor not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can create distributions");
        }

        let config: DividendConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        // Check if currency is supported
        if !config.supported_currencies.iter().any(|c| c == &currency) {
            panic!("Unsupported currency");
        }

        // Check minimum distribution amount
        if amount < config.min_distribution_amount {
            panic!("Amount below minimum distribution threshold");
        }

        // Get total supply of the token
        let token_client = soroban_token_contract::Client::new(&env, &token_address);
        let total_supply = token_client.total_supply();

        if total_supply == 0 {
            panic!("Token has zero total supply");
        }

        // Calculate per-token dividend amount (18 decimal precision)
        let per_token_amount = (amount * 1000000000000000000i128) / total_supply;

        // Create distribution
        let distribution_count: u64 = env.storage().instance()
            .get(&Symbol::new(&env, "distribution_count"))
            .unwrap_or(0u64);

        let distribution_id = distribution_count + 1;

        let distribution = DividendDistribution {
            distribution_id,
            token_address: token_address.clone(),
            currency,
            total_amount: amount,
            per_token_amount,
            total_supply,
            claim_deadline,
            created_at: env.ledger().timestamp(),
            is_active: true,
            metadata,
        };

        // Store distribution
        let mut distributions: Vec<DividendDistribution> = env.storage().instance()
            .get(&Symbol::new(&env, "distributions"))
            .unwrap_or(Vec::new(&env));

        distributions.push_back(distribution);
        env.storage().instance().set(&Symbol::new(&env, "distributions"), &distributions);
        env.storage().instance().set(&Symbol::new(&env, "distribution_count"), &distribution_id);

        // Transfer funds to this contract
        let currency_token_address = self.get_currency_token_address(env, currency);
        let currency_client = soroban_token_contract::Client::new(&env, &currency_token_address);
        
        currency_client.transfer(
            &admin,
            &env.current_contract_address(),
            &amount,
        );

        env.events().publish(
            (Symbol::new(&env, "distribution_created"), token_address),
            (distribution_id, amount, currency),
        );

        distribution_id
    }

    /// Claim dividend for a specific distribution
    pub fn claim_dividend(env: Env, distribution_id: u64, claimer: Address) -> i128 {
        let distributions: Vec<DividendDistribution> = env.storage().instance()
            .get(&Symbol::new(&env, "distributions"))
            .unwrap_or(Vec::new(&env));

        let distribution = distributions.iter()
            .find(|d| d.distribution_id == distribution_id)
            .unwrap_or_else(|| panic!("Distribution not found"));

        if !distribution.is_active {
            panic!("Distribution is not active");
        }

        let current_time = env.ledger().timestamp();
        if current_time > distribution.claim_deadline {
            panic!("Claim deadline passed");
        }

        // Check if already claimed
        let claim_key = Symbol::new(&env, &format!("claim_{}_{}", distribution_id, claimer));
        if env.storage().instance().has(&claim_key) {
            panic!("Already claimed");
        }

        // Get claimer's token balance
        let token_client = soroban_token_contract::Client::new(&env, &distribution.token_address);
        let balance = token_client.balance(&claimer);

        if balance == 0 {
            panic!("No tokens to claim dividend for");
        }

        // Calculate claimable amount
        let claimable_amount = (balance * distribution.per_token_amount) / 1000000000000000000i128;

        if claimable_amount <= 0 {
            panic!("No dividend available");
        }

        // Apply fee
        let config: DividendConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let fee_amount = (claimable_amount * config.fee_rate as i128) / 10000i128;
        let net_amount = claimable_amount - fee_amount;

        // Transfer dividend to claimer
        let currency_token_address = self.get_currency_token_address(env, distribution.currency);
        let currency_client = soroban_token_contract::Client::new(&env, &currency_token_address);

        currency_client.transfer(
            &env.current_contract_address(),
            &claimer,
            &net_amount,
        );

        // Transfer fee if applicable
        if fee_amount > 0 {
            currency_client.transfer(
                &env.current_contract_address(),
                &config.fee_recipient,
                &fee_amount,
            );
        }

        // Record claim
        let claim_info = ClaimInfo {
            distribution_id,
            claimer: claimer.clone(),
            amount_claimed: net_amount,
            claimed_at: current_time,
            currency: distribution.currency,
        };

        env.storage().instance().set(&claim_key, &claim_info);

        // Update total claimed amount
        let claimed_key = Symbol::new(&env, &format!("claimed_total_{}", distribution_id));
        let mut total_claimed: i128 = env.storage().instance()
            .get(&claimed_key)
            .unwrap_or(0i128);
        total_claimed += net_amount;
        env.storage().instance().set(&claimed_key, &total_claimed);

        env.events().publish(
            (Symbol::new(&env, "dividend_claimed"), claimer),
            (distribution_id, net_amount, distribution.currency),
        );

        net_amount
    }

    /// Claim all available dividends for a user
    pub fn claim_all_dividends(env: Env, claimer: Address) -> Vec<i128> {
        let distributions: Vec<DividendDistribution> = env.storage().instance()
            .get(&Symbol::new(&env, "distributions"))
            .unwrap_or(Vec::new(&env));

        let mut claimed_amounts = Vec::<i128>::new(&env);
        let current_time = env.ledger().timestamp();

        for distribution in distributions.iter() {
            if distribution.is_active && current_time <= distribution.claim_deadline {
                let claim_key = Symbol::new(&env, &format!("claim_{}_{}", distribution.distribution_id, claimer));
                
                if !env.storage().instance().has(&claim_key) {
                    // Try to claim this distribution
                    match self.claim_dividend(env.clone(), distribution.distribution_id, claimer.clone()) {
                        amount => claimed_amounts.push_back(amount),
                        _ => {} // Skip if claim fails
                    }
                }
            }
        }

        claimed_amounts
    }

    /// Get distribution information
    pub fn get_distribution(env: Env, distribution_id: u64) -> DividendDistribution {
        let distributions: Vec<DividendDistribution> = env.storage().instance()
            .get(&Symbol::new(&env, "distributions"))
            .unwrap_or(Vec::new(&env));

        distributions.iter()
            .find(|d| d.distribution_id == distribution_id)
            .cloned()
            .unwrap_or_else(|| panic!("Distribution not found"))
    }

    /// Get all active distributions for a token
    pub fn get_active_distributions(env: Env, token_address: Address) -> Vec<DividendDistribution> {
        let distributions: Vec<DividendDistribution> = env.storage().instance()
            .get(&Symbol::new(&env, "distributions"))
            .unwrap_or(Vec::new(&env));

        let mut active_distributions = Vec::<DividendDistribution>::new(&env);
        let current_time = env.ledger().timestamp();

        for distribution in distributions.iter() {
            if distribution.token_address == token_address && 
               distribution.is_active && 
               current_time <= distribution.claim_deadline {
                active_distributions.push_back(distribution.clone());
            }
        }

        active_distributions
    }

    /// Get claim information
    pub fn get_claim_info(env: Env, distribution_id: u64, claimer: Address) -> Option<ClaimInfo> {
        let claim_key = Symbol::new(&env, &format!("claim_{}_{}", distribution_id, claimer));
        env.storage().instance().get(&claim_key)
    }

    /// Calculate available dividend amount for a user
    pub fn calculate_available_dividend(env: Env, distribution_id: u64, claimer: Address) -> i128 {
        let distributions: Vec<DividendDistribution> = env.storage().instance()
            .get(&Symbol::new(&env, "distributions"))
            .unwrap_or(Vec::new(&env));

        let distribution = distributions.iter()
            .find(|d| d.distribution_id == distribution_id)
            .unwrap_or_else(|| panic!("Distribution not found"));

        if !distribution.is_active {
            return 0;
        }

        let current_time = env.ledger().timestamp();
        if current_time > distribution.claim_deadline {
            return 0;
        }

        // Check if already claimed
        let claim_key = Symbol::new(&env, &format!("claim_{}_{}", distribution_id, claimer));
        if env.storage().instance().has(&claim_key) {
            return 0;
        }

        // Get claimer's token balance
        let token_client = soroban_token_contract::Client::new(&env, &distribution.token_address);
        let balance = token_client.balance(&claimer);

        if balance == 0 {
            return 0;
        }

        // Calculate claimable amount
        let claimable_amount = (balance * distribution.per_token_amount) / 1000000000000000000i128;
        
        // Apply fee
        let config: DividendConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let fee_amount = (claimable_amount * config.fee_rate as i128) / 10000i128;
        claimable_amount - fee_amount
    }

    /// Update configuration
    pub fn update_config(env: Env, config: DividendConfig) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Distributor not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update config");
        }

        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
    }

    /// Deactivate a distribution
    pub fn deactivate_distribution(env: Env, distribution_id: u64) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Distributor not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can deactivate distributions");
        }

        let mut distributions: Vec<DividendDistribution> = env.storage().instance()
            .get(&Symbol::new(&env, "distributions"))
            .unwrap_or(Vec::new(&env));

        let mut found = false;
        let mut new_distributions = Vec::<DividendDistribution>::new(&env);
        
        for distribution in distributions.iter() {
            if distribution.distribution_id == distribution_id {
                let mut updated_distribution = distribution.clone();
                updated_distribution.is_active = false;
                new_distributions.push_back(updated_distribution);
                found = true;
            } else {
                new_distributions.push_back(distribution.clone());
            }
        }

        if found {
            env.storage().instance().set(&Symbol::new(&env, "distributions"), &new_distributions);
        }
    }

    /// Get currency token address (helper function)
    fn get_currency_token_address(env: Env, currency: Symbol) -> Address {
        // This would map currency symbols to actual token addresses
        // For now, return a placeholder
        match currency.to_string().as_str() {
            "XLM" => Address::from_contract_id(&BytesN::from_array(&env, &[1; 32])),
            "USDC" => Address::from_contract_id(&BytesN::from_array(&env, &[2; 32])),
            "EURC" => Address::from_contract_id(&BytesN::from_array(&env, &[3; 32])),
            _ => panic!("Unknown currency"),
        }
    }
}
