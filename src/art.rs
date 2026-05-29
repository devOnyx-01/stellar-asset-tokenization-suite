use soroban_sdk::{contracttype, Address, BytesN, Env, Symbol};
use crate::asset_factory::AssetConfig;

#[contracttype]
#[derive(Clone)]
pub struct ArtConfig {
    pub artist_name: Symbol,
    pub provenance_hash: BytesN<32>,
    pub insurance_status: bool,
    pub exhibition_voting: bool,
    pub appraisal_value: i128,
    pub authenticity_certificate: Address,
}

pub fn create_art_config(
    env: Env,
    base_config: AssetConfig,
    art_config: ArtConfig,
) -> AssetConfig {
    if art_config.provenance_hash == BytesN::from_array(&env, &[0u8; 32]) {
        panic!("Invalid provenance hash");
    }

    let mut metadata = base_config.metadata;
    metadata.set(Symbol::new(&env, "artist_name"), art_config.artist_name);
    metadata.set(Symbol::new(&env, "provenance_hash"), Symbol::new(&env, &std::str::from_utf8(&art_config.provenance_hash.to_array()).unwrap_or("invalid")));
    metadata.set(Symbol::new(&env, "insurance_status"), Symbol::new(&env, &art_config.insurance_status.to_string()));
    metadata.set(Symbol::new(&env, "exhibition_voting"), Symbol::new(&env, &art_config.exhibition_voting.to_string()));
    metadata.set(Symbol::new(&env, "appraisal_value"), Symbol::new(&env, &art_config.appraisal_value.to_string()));

    AssetConfig {
        metadata,
        ..base_config
    }
}