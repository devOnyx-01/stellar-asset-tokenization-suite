use soroban_sdk::{contracttype, Address, Env, Symbol, panic_with_error, String};
use crate::asset_factory::AssetConfig;
use crate::asset_class_handlers::AssetClassError;

#[contracttype]
#[derive(Clone)]
pub struct RealEstateConfig {
    pub property_address: Symbol,
    pub location_oracle: Address,
    pub rental_yield_rate: i64, // in basis points
    pub property_management_voting: bool,
    pub insurance_status: bool,
    pub appraisal_value: i128,
}

pub fn create_real_estate_config(
    env: Env,
    base_config: AssetConfig,
    real_estate_config: RealEstateConfig,
) -> AssetConfig {
    // Validate location oracle
    if real_estate_config.location_oracle == Address::from_contract_id(&[0u8; 32]) {
        panic_with_error!(&env, AssetClassError::InvalidLocation);
    }

    // Validate rental yield rate (should be between 0 and 10000 basis points)
    if real_estate_config.rental_yield_rate < 0 || real_estate_config.rental_yield_rate > 10000 {
        panic_with_error!(&env, AssetClassError::InvalidParameters);
    }

    // Add real estate specific metadata
    let mut metadata = base_config.metadata;
    metadata.set(Symbol::new(&env, "property_address"), String::from_str(&env, &real_estate_config.property_address.to_string()));
    metadata.set(Symbol::new(&env, "location_oracle"), String::from_str(&env, &format!("{:?}", real_estate_config.location_oracle)));
    metadata.set(Symbol::new(&env, "rental_yield"), String::from_str(&env, &real_estate_config.rental_yield_rate.to_string()));
    metadata.set(Symbol::new(&env, "insurance_status"), String::from_str(&env, &real_estate_config.insurance_status.to_string()));
    metadata.set(Symbol::new(&env, "appraisal_value"), String::from_str(&env, &real_estate_config.appraisal_value.to_string()));

    AssetConfig {
        metadata,
        ..base_config
    }
}