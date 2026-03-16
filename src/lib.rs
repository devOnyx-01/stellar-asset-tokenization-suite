use soroban_sdk::{contract, contractimpl, Address, Env, Symbol, Vec, Map, BytesN};

mod asset_factory;
mod rwa_token;
mod compliance_registry;
mod dividend_distributor;
mod secondary_market;
mod custody_validator;

use asset_factory::AssetFactory;
use rwa_token::RWAToken;
use compliance_registry::ComplianceRegistry;
use dividend_distributor::DividendDistributor;
use secondary_market::SecondaryMarket;
use custody_validator::CustodyValidator;

#[contract]
pub struct StellarRWASuite;

#[contractimpl]
impl StellarRWASuite {
    /// Deploy a new RWA token contract
    pub fn deploy_rwa_token(
        env: Env,
        asset_factory: Address,
        asset_name: Symbol,
        asset_symbol: Symbol,
        total_supply: i128,
        decimals: u32,
        asset_type: Symbol,
        metadata: Map<Symbol, Symbol>,
        compliance_registry: Address,
        dividend_distributor: Address,
    ) -> Address {
        let factory = AssetFactory::new(env, asset_factory);
        factory.deploy_rwa_token(
            asset_name,
            asset_symbol,
            total_supply,
            decimals,
            asset_type,
            metadata,
            compliance_registry,
            dividend_distributor,
        )
    }

    /// Initialize compliance registry
    pub fn init_compliance_registry(
        env: Env,
        registry: Address,
        admin: Address,
        kyc_required: bool,
        transfer_restrictions: bool,
    ) {
        let compliance = ComplianceRegistry::new(env, registry);
        compliance.initialize(admin, kyc_required, transfer_restrictions);
    }

    /// Initialize dividend distributor
    pub fn init_dividend_distributor(
        env: Env,
        distributor: Address,
        admin: Address,
        supported_currencies: Vec<Symbol>,
    ) {
        let dividend = DividendDistributor::new(env, distributor);
        dividend.initialize(admin, supported_currencies);
    }

    /// Initialize secondary market
    pub fn init_secondary_market(
        env: Env,
        market: Address,
        admin: Address,
        fee_rate: i64,
        min_order_size: i128,
    ) {
        let market_contract = SecondaryMarket::new(env, market);
        market_contract.initialize(admin, fee_rate, min_order_size);
    }

    /// Initialize custody validator
    pub fn init_custody_validator(
        env: Env,
        validator: Address,
        admin: Address,
        oracle_addresses: Vec<Address>,
    ) {
        let custody = CustodyValidator::new(env, validator);
        custody.initialize(admin, oracle_addresses);
    }
}
