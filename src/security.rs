use soroban_sdk::{contracttype, Env, Symbol, Vec, panic_with_error};
use crate::asset_factory::AssetConfig;
use crate::asset_class_handlers::AssetClassError;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum SecurityError {
    InvalidRegulationFramework = 1,
}

#[contracttype]
#[derive(Clone)]
pub struct SecurityConfig {
    pub equity_type: Symbol,
    pub regulation_framework: Symbol,
    pub accreditation_required: bool,
    pub holding_period_days: u32,
    pub regulatory_reporting: bool,
    pub isin: Symbol,
}

pub fn create_security_config(
    env: Env,
    base_config: AssetConfig,
    security_config: SecurityConfig,
) -> AssetConfig {
    let valid_frameworks = Vec::from_array(&env, [
        Symbol::new(&env, "REG_D"),
        Symbol::new(&env, "REG_S"),
        Symbol::new(&env, "RULE_144"),
        Symbol::new(&env, "REG_A+"),
    ]);
    
    if !valid_frameworks.contains(&security_config.regulation_framework) {
        panic_with_error!(&env, AssetClassError::InvalidRegulationFramework);
    }

    let mut compliance_rules = base_config.compliance_rules;
    compliance_rules.accredited_investor_only = security_config.accreditation_required;
    compliance_rules.holding_period_days = security_config.holding_period_days;

    let mut metadata = base_config.metadata;
    metadata.set(Symbol::new(&env, "equity_type"), security_config.equity_type);
    metadata.set(Symbol::new(&env, "regulation_framework"), security_config.regulation_framework);
    metadata.set(Symbol::new(&env, "isin"), security_config.isin);
    metadata.set(Symbol::new(&env, "regulatory_reporting"), Symbol::new(&env, &security_config.regulatory_reporting.to_string()));

    AssetConfig {
        compliance_rules,
        metadata,
        ..base_config
    }
}
