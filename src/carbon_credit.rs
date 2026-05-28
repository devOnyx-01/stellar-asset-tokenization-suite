use soroban_sdk::{contracttype, Env, Map, Symbol, Vec};
use crate::asset_factory::AssetConfig;

#[contracttype]
#[derive(Clone)]
pub struct CarbonCreditConfig {
    pub project_id: Symbol,
    pub vintage_year: u32,
    pub retirement_functionality: bool,
    pub project_metadata: Map<Symbol, Symbol>,
    pub verification_standard: Symbol,
    pub carbon_offset_amount: i128,
}

pub fn create_carbon_credit_config(
    env: Env,
    base_config: AssetConfig,
    carbon_config: CarbonCreditConfig,
) -> AssetConfig {
    let current_year = (env.ledger().timestamp() / 31536000) + 1970; // Approximate current year
    if carbon_config.vintage_year < 1990 || carbon_config.vintage_year > current_year {
        panic!("Invalid vintage year");
    }

    let valid_standards = Vec::from_array(&env, [
        Symbol::new(&env, "VCS"),
        Symbol::new(&env, "GS"),
        Symbol::new(&env, "CDM"),
        Symbol::new(&env, "ACR"),
    ]);
    
    if !valid_standards.contains(&carbon_config.verification_standard) {
        panic!("Invalid verification standard");
    }

    let mut metadata = base_config.metadata;
    metadata.set(Symbol::new(&env, "project_id"), carbon_config.project_id);
    metadata.set(Symbol::new(&env, "vintage_year"), Symbol::new(&env, &carbon_config.vintage_year.to_string()));
    metadata.set(Symbol::new(&env, "retirement_functionality"), Symbol::new(&env, &carbon_config.retirement_functionality.to_string()));
    metadata.set(Symbol::new(&env, "verification_standard"), carbon_config.verification_standard);
    metadata.set(Symbol::new(&env, "carbon_offset_amount"), Symbol::new(&env, &carbon_config.carbon_offset_amount.to_string()));

    for (key, value) in carbon_config.project_metadata {
        metadata.set(key, value);
    }

    AssetConfig {
        metadata,
        ..base_config
    }
}