use soroban_sdk::{
    contract, contractimpl, Address, Env, Symbol, Vec, Map, BytesN, 
    contracttype, contracterror
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AssetFactoryError {
    InvalidParameters = 1,
    Unauthorized = 2,
    AssetAlreadyExists = 3,
    ComplianceCheckFailed = 4,
}

#[contracttype]
pub struct AssetInfo {
    pub name: Symbol,
    pub symbol: Symbol,
    pub total_supply: i128,
    pub decimals: u32,
    pub asset_type: Symbol,
    pub metadata: Map<Symbol, Symbol>,
    pub compliance_registry: Address,
    pub dividend_distributor: Address,
    pub token_address: Address,
    pub created_at: u64,
    pub is_paused: bool,
}

#[contract]
pub struct AssetFactory;

#[contractimpl]
impl AssetFactory {
    /// Initialize the asset factory
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Factory already initialized");
        }
        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "assets"), &Vec::<Address>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "asset_count"), &0u32);
    }

    /// Deploy a new RWA token contract
    pub fn deploy_rwa_token(
        env: Env,
        asset_name: Symbol,
        asset_symbol: Symbol,
        total_supply: i128,
        decimals: u32,
        asset_type: Symbol,
        metadata: Map<Symbol, Symbol>,
        compliance_registry: Address,
        dividend_distributor: Address,
    ) -> Address {
        // Validate parameters
        if total_supply <= 0 || decimals > 18 {
            panic!("Invalid token parameters");
        }

        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Factory not initialized"));

        // Check if caller is admin
        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can deploy tokens");
        }

        // Deploy new RWA token contract
        let token_address = env.register_contract(None, RWAToken);
        
        // Initialize the token
        let token_client = RWATokenClient::new(&env, &token_address);
        token_client.initialize(
            asset_name,
            asset_symbol,
            total_supply,
            decimals,
            asset_type,
            metadata.clone(),
            compliance_registry,
            dividend_distributor,
        );

        // Store asset info
        let asset_info = AssetInfo {
            name: asset_name,
            symbol: asset_symbol,
            total_supply,
            decimals,
            asset_type,
            metadata,
            compliance_registry,
            dividend_distributor,
            token_address: token_address.clone(),
            created_at: env.ledger().timestamp(),
            is_paused: false,
        };

        let asset_key = Symbol::new(&env, &asset_symbol.to_string());
        env.storage().instance().set(&asset_key, &asset_info);

        // Update assets list
        let mut assets: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, "assets"))
            .unwrap_or(Vec::new(&env));
        assets.push_back(token_address.clone());
        env.storage().instance().set(&Symbol::new(&env, "assets"), &assets);

        // Update asset count
        let mut count: u32 = env.storage().instance()
            .get(&Symbol::new(&env, "asset_count"))
            .unwrap_or(0u32);
        count += 1;
        env.storage().instance().set(&Symbol::new(&env, "asset_count"), &count);

        token_address
    }

    /// Get asset information by symbol
    pub fn get_asset_info(env: Env, symbol: Symbol) -> AssetInfo {
        let asset_key = Symbol::new(&env, &symbol.to_string());
        env.storage().instance()
            .get(&asset_key)
            .unwrap_or_else(|| panic!("Asset not found"))
    }

    /// List all deployed assets
    pub fn list_assets(env: Env) -> Vec<AssetInfo> {
        let assets: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, "assets"))
            .unwrap_or(Vec::new(&env));

        let mut asset_list = Vec::<AssetInfo>::new(&env);
        for asset_address in assets.iter() {
            // This would require cross-contract calls to get asset info
            // For now, return empty list
        }
        asset_list
    }

    /// Pause/unpause an asset
    pub fn set_asset_pause_status(env: Env, symbol: Symbol, paused: bool) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Factory not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can pause assets");
        }

        let asset_key = Symbol::new(&env, &symbol.to_string());
        let mut asset_info: AssetInfo = env.storage().instance()
            .get(&asset_key)
            .unwrap_or_else(|| panic!("Asset not found"));

        asset_info.is_paused = paused;
        env.storage().instance().set(&asset_key, &asset_info);
    }

    /// Update factory admin
    pub fn update_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Factory not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update admin");
        }

        env.storage().instance().set(&Symbol::new(&env, "admin"), &new_admin);
    }
}

// Import the RWA token contract
use crate::rwa_token::{RWAToken, RWATokenClient};
