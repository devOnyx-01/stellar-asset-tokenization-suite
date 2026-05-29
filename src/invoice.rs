use soroban_sdk::{contracttype, Address, Env, Symbol, Vec};
use crate::asset_factory::AssetConfig;

#[contracttype]
#[derive(Clone)]
pub struct InvoiceConfig {
    pub invoice_number: Symbol,
    pub debtor_address: Address,
    pub due_date: u64,
    pub credit_rating: Symbol,
    pub automatic_settlement: bool,
    pub invoice_amount: i128,
}

pub fn create_invoice_config(
    env: Env,
    base_config: AssetConfig,
    invoice_config: InvoiceConfig,
) -> AssetConfig {
    let current_time = env.ledger().timestamp();
    if invoice_config.due_date <= current_time {
        panic!("Due date must be in the future");
    }

    let valid_ratings = Vec::from_array(&env, [
        Symbol::new(&env, "AAA"),
        Symbol::new(&env, "AA"),
        Symbol::new(&env, "A"),
        Symbol::new(&env, "BBB"),
        Symbol::new(&env, "BB"),
        Symbol::new(&env, "B"),
        Symbol::new(&env, "CCC"),
    ]);
    
    if !valid_ratings.contains(&invoice_config.credit_rating) {
        panic!("Invalid credit rating");
    }

    let mut metadata = base_config.metadata;
    metadata.set(Symbol::new(&env, "invoice_number"), invoice_config.invoice_number);
    metadata.set(Symbol::new(&env, "debtor_address"), Symbol::new(&env, &invoice_config.debtor_address.to_string()));
    metadata.set(Symbol::new(&env, "due_date"), Symbol::new(&env, &invoice_config.due_date.to_string()));
    metadata.set(Symbol::new(&env, "credit_rating"), invoice_config.credit_rating);
    metadata.set(Symbol::new(&env, "invoice_amount"), Symbol::new(&env, &invoice_config.invoice_amount.to_string()));

    AssetConfig {
        metadata,
        ..base_config
    }
}