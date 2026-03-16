use soroban_sdk::{
    contract, contractimpl, Address, Env, Symbol, Vec, Map, BytesN, 
    contracttype, contracterror, token
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum RWATokenError {
    InsufficientBalance = 1,
    ComplianceCheckFailed = 2,
    TransferPaused = 3,
    Unauthorized = 4,
    InvalidAmount = 5,
    AssetFrozen = 6,
    KYCRequired = 7,
    TransferRestriction = 8,
}

#[contracttype]
pub struct TokenInfo {
    pub name: Symbol,
    pub symbol: Symbol,
    pub total_supply: i128,
    pub decimals: u32,
    pub asset_type: Symbol,
    pub metadata: Map<Symbol, Symbol>,
    pub compliance_registry: Address,
    pub dividend_distributor: Address,
    pub created_at: u64,
    pub is_paused: bool,
    pub is_frozen: bool,
}

#[contracttype]
pub struct Balance {
    pub amount: i128,
    pub locked_amount: i128,
    pub voting_power: i128,
    pub last_dividend_claim: u64,
}

#[contracttype]
pub struct TransferRestriction {
    pub max_daily_amount: i128,
    pub max_monthly_amount: i128,
    pub requires_accreditation: bool,
    pub geographic_restrictions: Vec<Symbol>,
}

#[contract]
pub struct RWAToken;

#[contractimpl]
impl RWAToken {
    /// Initialize the RWA token
    pub fn initialize(
        env: Env,
        name: Symbol,
        symbol: Symbol,
        total_supply: i128,
        decimals: u32,
        asset_type: Symbol,
        metadata: Map<Symbol, Symbol>,
        compliance_registry: Address,
        dividend_distributor: Address,
    ) {
        if env.storage().instance().has(&Symbol::new(&env, "initialized")) {
            panic!("Token already initialized");
        }

        // Validate parameters
        if total_supply <= 0 || decimals > 18 {
            panic!("Invalid token parameters");
        }

        // Store token info
        let token_info = TokenInfo {
            name,
            symbol,
            total_supply,
            decimals,
            asset_type,
            metadata,
            compliance_registry,
            dividend_distributor,
            created_at: env.ledger().timestamp(),
            is_paused: false,
            is_frozen: false,
        };

        env.storage().instance().set(&Symbol::new(&env, "token_info"), &token_info);
        env.storage().instance().set(&Symbol::new(&env, "initialized"), &true);

        // Mint total supply to the contract creator
        let admin = env.invoker();
        self.mint(env, admin.clone(), total_supply);
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
    }

    /// Mint tokens (admin only)
    pub fn mint(env: Env, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("Invalid amount");
        }

        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Token not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can mint");
        }

        // Update total supply
        let mut token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));
        
        token_info.total_supply += amount;
        env.storage().instance().set(&Symbol::new(&env, "token_info"), &token_info);

        // Update balance
        let mut balance = self.get_balance(env, to.clone());
        balance.amount += amount;
        env.storage().instance().set(&to, &balance);

        // Emit mint event
        env.events().publish(
            (Symbol::new(&env, "mint"), to.clone()),
            amount,
        );
    }

    /// Burn tokens
    pub fn burn(env: Env, from: Address, amount: i128) {
        if amount <= 0 {
            panic!("Invalid amount");
        }

        let mut balance = self.get_balance(env, from.clone());
        if balance.amount < amount {
            panic!("Insufficient balance");
        }

        // Check compliance
        if !self.check_compliance(env, from.clone(), amount) {
            panic!("Compliance check failed");
        }

        // Update balance
        balance.amount -= amount;
        env.storage().instance().set(&from, &balance);

        // Update total supply
        let mut token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));
        
        token_info.total_supply -= amount;
        env.storage().instance().set(&Symbol::new(&env, "token_info"), &token_info);

        // Emit burn event
        env.events().publish(
            (Symbol::new(&env, "burn"), from.clone()),
            amount,
        );
    }

    /// Transfer tokens
    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        if amount <= 0 {
            panic!("Invalid amount");
        }

        let token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));

        // Check if token is paused or frozen
        if token_info.is_paused || token_info.is_frozen {
            panic!("Token transfers are paused or frozen");
        }

        // Check compliance for both sender and receiver
        if !self.check_compliance(env, from.clone(), amount) ||
           !self.check_compliance(env, to.clone(), amount) {
            panic!("Compliance check failed");
        }

        // Check transfer restrictions
        if !self.check_transfer_restrictions(env, from.clone(), amount) {
            panic!("Transfer restriction violation");
        }

        // Update balances
        let mut from_balance = self.get_balance(env, from.clone());
        let mut to_balance = self.get_balance(env, to.clone());

        if from_balance.amount < amount {
            panic!("Insufficient balance");
        }

        from_balance.amount -= amount;
        to_balance.amount += amount;

        env.storage().instance().set(&from, &from_balance);
        env.storage().instance().set(&to, &to_balance);

        // Emit transfer event
        env.events().publish(
            (Symbol::new(&env, "transfer"), from, to),
            amount,
        );
    }

    /// Get token information
    pub fn get_token_info(env: Env) -> TokenInfo {
        env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"))
    }

    /// Get balance for an address
    pub fn get_balance(env: Env, address: Address) -> Balance {
        env.storage().instance()
            .get(&address)
            .unwrap_or(Balance {
                amount: 0,
                locked_amount: 0,
                voting_power: 0,
                last_dividend_claim: 0,
            })
    }

    /// Lock tokens for voting or staking
    pub fn lock_tokens(env: Env, owner: Address, amount: i128, lock_period: u64) {
        if amount <= 0 {
            panic!("Invalid amount");
        }

        if env.invoker() != owner {
            panic!("Unauthorized");
        }

        let mut balance = self.get_balance(env, owner.clone());
        if balance.amount < amount {
            panic!("Insufficient balance");
        }

        balance.amount -= amount;
        balance.locked_amount += amount;
        balance.voting_power += amount;

        env.storage().instance().set(&owner, &balance);

        // Store lock information
        let lock_info = (amount, env.ledger().timestamp() + lock_period);
        let lock_key = Symbol::new(&env, &format!("lock_{}", owner.clone()));
        env.storage().instance().set(&lock_key, &lock_info);

        env.events().publish(
            (Symbol::new(&env, "tokens_locked"), owner),
            (amount, lock_period),
        );
    }

    /// Unlock tokens
    pub fn unlock_tokens(env: Env, owner: Address, amount: i128) {
        if amount <= 0 {
            panic!("Invalid amount");
        }

        if env.invoker() != owner {
            panic!("Unauthorized");
        }

        let mut balance = self.get_balance(env, owner.clone());
        if balance.locked_amount < amount {
            panic!("Insufficient locked tokens");
        }

        balance.locked_amount -= amount;
        balance.amount += amount;
        balance.voting_power -= amount;

        env.storage().instance().set(&owner, &balance);

        env.events().publish(
            (Symbol::new(&env, "tokens_unlocked"), owner),
            amount,
        );
    }

    /// Pause token transfers (admin only)
    pub fn pause(env: Env) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Token not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can pause");
        }

        let mut token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));

        token_info.is_paused = true;
        env.storage().instance().set(&Symbol::new(&env, "token_info"), &token_info);
    }

    /// Unpause token transfers (admin only)
    pub fn unpause(env: Env) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Token not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can unpause");
        }

        let mut token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));

        token_info.is_paused = false;
        env.storage().instance().set(&Symbol::new(&env, "token_info"), &token_info);
    }

    /// Freeze token (emergency regulatory compliance)
    pub fn freeze(env: Env) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Token not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can freeze");
        }

        let mut token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));

        token_info.is_frozen = true;
        env.storage().instance().set(&Symbol::new(&env, "token_info"), &token_info);
    }

    /// Unfreeze token
    pub fn unfreeze(env: Env) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Token not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can unfreeze");
        }

        let mut token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));

        token_info.is_frozen = false;
        env.storage().instance().set(&Symbol::new(&env, "token_info"), &token_info);
    }

    /// Check compliance with registry
    fn check_compliance(env: Env, address: Address, amount: i128) -> bool {
        let token_info: TokenInfo = env.storage().instance()
            .get(&Symbol::new(&env, "token_info"))
            .unwrap_or_else(|| panic!("Token info not found"));

        // This would make a cross-contract call to the compliance registry
        // For now, return true (passing compliance)
        true
    }

    /// Check transfer restrictions
    fn check_transfer_restrictions(env: Env, address: Address, amount: i128) -> bool {
        // This would implement Rule 144, Reg D, Reg S restrictions
        // For now, return true (no restrictions)
        true
    }
}
