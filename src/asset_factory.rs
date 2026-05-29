use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Map, Symbol, Vec, BytesN,
};

use crate::rwa_token::RWATokenClient;
use crate::RwaDeploySpec;

const STORAGE_VERSION: u32 = 1;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AssetFactoryError {
    InvalidParameters = 1,
    Unauthorized = 2,
    AssetAlreadyExists = 3,
    ComplianceCheckFailed = 4,
    AssetNotFound = 5,
    UpgradeNotApproved = 6,
    TemplateNotFound = 7,
    GovernanceThresholdNotMet = 8,
    AlreadyInitialized = 9,
    TemplateNotActive = 10,
    NotInitialized = 11,
    Overflow = 12,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AssetClass {
    RealEstate = 0,
    Commodity = 1,
    Invoice = 2,
    Security = 3,
    Art = 4,
    CarbonCredit = 5,
}

#[contracttype]
#[derive(Clone)]
pub struct ComplianceRules {
    pub kyc_required: bool,
    pub accredited_investor_only: bool,
    pub geographic_restrictions: Vec<Symbol>,
    pub holding_period_days: u32,
    pub transfer_limits: i128,
}

#[contracttype]
#[derive(Clone)]
pub struct DividendSchedule {
    pub frequency_days: u32,
    pub next_distribution_date: u64,
    pub total_distributed: i128,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct AssetConfig {
    pub name: Symbol,
    pub symbol: Symbol,
    pub decimals: u32,
    pub total_supply: i128,
    pub asset_class: AssetClass,
    pub compliance_rules: ComplianceRules,
    pub dividend_schedule: Option<DividendSchedule>,
    pub metadata: Map<Symbol, Symbol>,
}

#[contracttype]
#[derive(Clone)]
pub struct AssetTemplate {
    pub asset_class: AssetClass,
    pub base_config: AssetConfig,
    pub wasm_hash: BytesN<32>,
    pub is_active: bool,
    pub version: u32,
}

#[contracttype]
#[derive(Clone)]
pub struct AssetInfo {
    pub name: Symbol,
    pub symbol: Symbol,
    pub total_supply: i128,
    pub decimals: u32,
    pub asset_class: AssetClass,
    pub metadata: Map<Symbol, Symbol>,
    pub compliance_registry: Address,
    pub dividend_distributor: Address,
    pub token_address: Address,
    pub created_at: u64,
    pub is_paused: bool,
    pub template_version: u32,
    pub upgrade_proposals: Vec<Address>,
}

#[contract]
pub struct AssetFactory;

#[contractimpl]
impl AssetFactory {
    pub fn initialize(env: Env, auth: Address, admin: Address) {
        crate::shared_admin::write_admin(&env, &auth, &admin);
        
        auth.require_auth();
        if env.storage().instance().has(&Symbol::new(&env, "admin")) {
            panic_with_error!(&env, AssetFactoryError::AlreadyInitialized);
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
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "templates"), &Map::<AssetClass, AssetTemplate>::new(&env));
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "registry"), &Map::<Symbol, AssetInfo>::new(&env));
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "version"), &STORAGE_VERSION);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "governance_threshold"), &6600u32); // 66% in basis points
    }

    /// Create a new RWA asset with deterministic address deployment
    pub fn create_asset(env: Env, auth: Address, config: AssetConfig) -> Address {
        crate::shared_admin::require_admin(&env, &auth);
    fn read_version(env: &Env) -> u32 {
        env.storage()
            .instance()
            .get(&Symbol::new(env, "version"))
            .unwrap_or(0)
    }

    fn check_version(env: &Env) {
        if Self::read_version(env) < STORAGE_VERSION {
            panic!("Contract storage is outdated. Call migrate().");
        }
    }

    pub fn migrate(env: Env, auth: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Factory not initialized"));

        assert_admin(&auth, &admin);

        let ver = Self::read_version(&env);
        if ver >= STORAGE_VERSION {
            panic!("Already at latest version");
        }

        let mut current = ver;
        while current < STORAGE_VERSION {
            current += 1;
        }

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "version"), &STORAGE_VERSION);
    }

    /// Create a new RWA asset with deterministic address deployment
    pub fn create_asset(env: Env, auth: Address, config: AssetConfig) -> Address {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::NotInitialized); });

        assert_admin(&env, &auth, &admin);

        Self::check_version(&env);

        // Validate parameters
        if config.total_supply <= 0 || config.decimals > 18 {
            panic_with_error!(&env, AssetFactoryError::InvalidParameters);
        }

        // Check if asset already exists
        let registry: Map<Symbol, AssetInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "registry"))
            .unwrap_or(Map::new(&env));
        
        if registry.has(&config.symbol) {
            panic_with_error!(&env, AssetFactoryError::AssetAlreadyExists);
        }

        // Get template for asset class
        let templates: Map<AssetClass, AssetTemplate> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "templates"))
            .unwrap_or(Map::new(&env));
        
        let template = templates.get(config.asset_class)
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::TemplateNotFound); });
        
        if !template.is_active {
            panic_with_error!(&env, AssetFactoryError::TemplateNotActive);
        }

        // Deploy token with deterministic address using salt
        let salt = env.crypto().sha256(&(
            &config.symbol,
            &config.name,
            &env.ledger().timestamp()
        ).into());
        
        let token_address = env.deployer()
            .with_current_contract(salt)
            .deploy_v2(template.wasm_hash);

        // Initialize token
        let token_client = RWATokenClient::new(&env, &token_address);
        token_client.initialize(
            &auth,
            &config.name,
            &config.symbol,
            &config.total_supply,
            &config.decimals,
            &Symbol::new(&env, &format!("{:?}", config.asset_class)),
            &config.metadata,
            &Address::from_contract_id(&[0u8; 32]), // Placeholder compliance registry
            &Address::from_contract_id(&[0u8; 32]), // Placeholder dividend distributor
        );

        // Create asset info
        let asset_info = AssetInfo {
            name: config.name,
            symbol: config.symbol,
            total_supply: config.total_supply,
            decimals: config.decimals,
            asset_class: config.asset_class,
            metadata: config.metadata.clone(),
            compliance_registry: Address::from_contract_id(&[0u8; 32]),
            dividend_distributor: Address::from_contract_id(&[0u8; 32]),
            token_address: token_address.clone(),
            created_at: env.ledger().timestamp(),
            is_paused: false,
            template_version: template.version,
            upgrade_proposals: Vec::new(&env),
        };

        // Update registry
        let mut registry = registry;
        registry.set(config.symbol, asset_info);
        env.storage().instance().set(&Symbol::new(&env, "registry"), &registry);

        // Update assets list
        let mut assets: Vec<Address> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "assets"))
            .unwrap_or(Vec::new(&env));
        assets.push_back(token_address.clone());
        env.storage().instance().set(&Symbol::new(&env, "assets"), &assets);

        // Update count
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "asset_count"))
            .unwrap_or(0u32);
        count = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, AssetFactoryError::Overflow));
        env.storage().instance().set(&Symbol::new(&env, "asset_count"), &count);

        token_address
    }

    /// Link and initialize a `token_contract` that was already deployed on-chain.
    pub fn deploy_rwa_token(env: Env, auth: Address, spec: RwaDeploySpec) -> Address {
        if spec.total_supply <= 0 || spec.decimals > 18 {
            panic_with_error!(&env, AssetFactoryError::InvalidParameters);
        }

        crate::shared_admin::require_admin(&env, &auth);
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::NotInitialized); });

        assert_admin(&env, &auth, &admin);

        Self::check_version(&env);

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
        count = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, AssetFactoryError::Overflow));
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
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::AssetNotFound); })
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
        crate::shared_admin::require_admin(&env, &auth);
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::NotInitialized); });

        assert_admin(&env, &auth, &admin);

        Self::check_version(&env);

        let asset_key = Symbol::new(&env, &symbol.to_string());
        let mut asset_info: AssetInfo = env
            .storage()
            .instance()
            .get(&asset_key)
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::AssetNotFound); });

        asset_info.is_paused = paused;
        env.storage().instance().set(&asset_key, &asset_info);
    }

    pub fn update_admin(env: Env, auth: Address, new_admin: Address) {
        crate::shared_admin::require_admin(&env, &auth);
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::NotInitialized); });

        assert_admin(&env, &auth, &admin);

        Self::check_version(&env);

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &new_admin);
    }

    /// Register a new template for an asset class
    pub fn register_template(env: Env, auth: Address, template: AssetTemplate) {
        crate::shared_admin::require_admin(&env, &auth);
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::NotInitialized); });

        assert_admin(&env, &auth, &admin);

        Self::check_version(&env);

        let mut templates: Map<AssetClass, AssetTemplate> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "templates"))
            .unwrap_or(Map::new(&env));
        
        templates.set(template.asset_class, template);
        env.storage().instance().set(&Symbol::new(&env, "templates"), &templates);
    }

    /// Get template for a specific asset class
    pub fn get_template(env: Env, asset_class: AssetClass) -> AssetTemplate {
        let templates: Map<AssetClass, AssetTemplate> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "templates"))
            .unwrap_or(Map::new(&env));
        
        templates.get(asset_class)
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::TemplateNotFound); })
    }

    /// Upgrade an asset with governance approval
    pub fn upgrade_asset(env: Env, auth: Address, symbol: Symbol, new_wasm_hash: BytesN<32>) {
        crate::shared_admin::require_admin(&env, &auth);
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::NotInitialized); });

        assert_admin(&env, &auth, &admin);

        Self::check_version(&env);

        let registry: Map<Symbol, AssetInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "registry"))
            .unwrap_or(Map::new(&env));
        
        let mut asset_info = registry.get(symbol)
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::AssetNotFound); });

        // Check governance threshold (simplified - in real implementation would check token holder votes)
        let threshold: u32 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "governance_threshold"))
            .unwrap_or(6600u32);

        // For now, assume admin approval meets threshold
        // In production, this would involve actual voting mechanism

        // Deploy new contract version
        let salt = env.crypto().sha256(&(
            &symbol,
            &asset_info.name,
            &env.ledger().timestamp(),
            &new_wasm_hash
        ).into());
        
        let new_token_address = env.deployer()
            .with_current_contract(salt)
            .deploy_v2(new_wasm_hash);

        // Update asset info
        asset_info.token_address = new_token_address;
        asset_info.template_version = asset_info.template_version
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, AssetFactoryError::Overflow));

        // Update registry
        let mut registry = registry;
        registry.set(symbol, asset_info);
        env.storage().instance().set(&Symbol::new(&env, "registry"), &registry);
    }

    /// Emergency pause all assets
    pub fn emergency_pause_all(env: Env, auth: Address) {
        crate::shared_admin::require_admin(&env, &auth);
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| { panic_with_error!(&env, AssetFactoryError::NotInitialized); });

        assert_admin(&env, &auth, &admin);

        Self::check_version(&env);

        let registry: Map<Symbol, AssetInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "registry"))
            .unwrap_or(Map::new(&env));

        let mut updated_registry = Map::<Symbol, AssetInfo>::new(&env);
        
        for (symbol, mut asset_info) in registry {
            asset_info.is_paused = true;
            updated_registry.set(symbol, asset_info);
        }

        env.storage().instance().set(&Symbol::new(&env, "registry"), &updated_registry);
    }

    /// Get all assets from registry
    pub fn get_all_assets(env: Env) -> Map<Symbol, AssetInfo> {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "registry"))
            .unwrap_or(Map::new(&env))
    }

    /// Get asset count
    pub fn get_asset_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&Symbol::new(&env, "asset_count"))
            .unwrap_or(0u32)
    }
}
