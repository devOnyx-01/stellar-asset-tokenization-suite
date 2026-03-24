use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, Env, Map, Symbol, Vec,
};

use crate::auth::assert_admin;
use crate::rwa_token::RWATokenClient;
use crate::RwaDeploySpec;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AssetFactoryError {
    InvalidParameters = 1,
    Unauthorized = 2,
    AssetAlreadyExists = 3,
    ComplianceCheckFailed = 4,
}

#[contracttype]
#[derive(Clone)]
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
    pub fn initialize(env: Env, auth: Address, admin: Address) {
        auth.require_auth();
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic!("Factory already initialized");
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "assets"), &Vec::<Address>::new(&env));
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "asset_count"), &0u32);
    }

    /// Link and initialize a `token_contract` that was already deployed on-chain.
    pub fn deploy_rwa_token(env: Env, auth: Address, spec: RwaDeploySpec) -> Address {
        if spec.total_supply <= 0 || spec.decimals > 18 {
            panic!("Invalid token parameters");
        }

        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Factory not initialized"));

        assert_admin(&auth, &admin);

        let token_client = RWATokenClient::new(&env, &spec.token_contract);
        token_client.initialize(
            &auth,
            &spec.asset_name,
            &spec.asset_symbol,
            &spec.total_supply,
            &spec.decimals,
            &spec.asset_type,
            &spec.metadata,
            &spec.compliance_registry,
            &spec.dividend_distributor,
        );

        let asset_key = Symbol::new(&env, &spec.asset_symbol.to_string());
        let asset_info = AssetInfo {
            name: spec.asset_name,
            symbol: spec.asset_symbol,
            total_supply: spec.total_supply,
            decimals: spec.decimals,
            asset_type: spec.asset_type,
            metadata: spec.metadata.clone(),
            compliance_registry: spec.compliance_registry,
            dividend_distributor: spec.dividend_distributor,
            token_address: spec.token_contract.clone(),
            created_at: env.ledger().timestamp(),
            is_paused: false,
        };
        env.storage().instance().set(&asset_key, &asset_info);

        let mut assets: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "assets"))
            .unwrap_or(Vec::new(&env));
        assets.push_back(spec.token_contract.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "assets"), &assets);

        let mut count: u32 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "asset_count"))
            .unwrap_or(0u32);
        count += 1;
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "asset_count"), &count);

        spec.token_contract
    }

    pub fn get_asset_info(env: Env, symbol: Symbol) -> AssetInfo {
        let asset_key = Symbol::new(&env, &symbol.to_string());
        env.storage()
            .instance()
            .get(&asset_key)
            .unwrap_or_else(|| panic!("Asset not found"))
    }

    pub fn list_assets(env: Env) -> Vec<AssetInfo> {
        let _assets: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "assets"))
            .unwrap_or(Vec::new(&env));

        Vec::<AssetInfo>::new(&env)
    }

    pub fn set_asset_pause_status(env: Env, auth: Address, symbol: Symbol, paused: bool) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Factory not initialized"));

        assert_admin(&auth, &admin);

        let asset_key = Symbol::new(&env, &symbol.to_string());
        let mut asset_info: AssetInfo = env
            .storage()
            .instance()
            .get(&asset_key)
            .unwrap_or_else(|| panic!("Asset not found"));

        asset_info.is_paused = paused;
        env.storage().instance().set(&asset_key, &asset_info);
    }

    pub fn update_admin(env: Env, auth: Address, new_admin: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Factory not initialized"));

        assert_admin(&auth, &admin);

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &new_admin);
    }
}
