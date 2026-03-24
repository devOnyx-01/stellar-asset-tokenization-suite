use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, Address, BytesN, Env, Map, Symbol, Vec,
};

use crate::auth::assert_admin;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum CustodyError {
    Unauthorized = 1,
    InvalidProof = 2,
    OracleOffline = 3,
    VerificationFailed = 4,
    AssetNotRegistered = 5,
    StaleData = 6,
    InvalidSignature = 7,
}

#[contracttype]
#[derive(Clone)]
pub struct CustodyProof {
    pub proof_id: u64,
    pub asset_address: Address,
    pub asset_type: Symbol,
    pub custody_provider: Address,
    pub verification_timestamp: u64,
    pub expiry_timestamp: u64,
    pub asset_value: i128,
    pub asset_location: Symbol,
    pub legal_title: Symbol,
    pub insurance_coverage: i128,
    pub audit_report_hash: BytesN<32>,
    pub oracle_signatures: Vec<BytesN<64>>,
    pub metadata: Map<Symbol, Symbol>,
    pub is_valid: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct OracleInfo {
    pub oracle_address: Address,
    pub name: Symbol,
    pub jurisdiction: Symbol,
    pub verification_methods: Vec<Symbol>,
    pub reputation_score: u32,
    pub fee_rate: i64,
    pub is_active: bool,
    pub last_verification: u64,
    pub total_verifications: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct AssetRegistration {
    pub asset_address: Address,
    pub asset_type: Symbol,
    pub legal_identifier: Symbol,
    pub jurisdiction: Symbol,
    pub custody_requirements: Vec<Symbol>,
    pub verification_frequency: u64,
    pub required_oracles: u32,
    pub last_verified: u64,
    pub is_active: bool,
}

#[contracttype]
#[derive(Clone)]
pub struct ValidationConfig {
    pub min_oracle_reputation: u32,
    pub max_proof_age: u64,
    pub required_verification_methods: Vec<Symbol>,
    pub insurance_required: bool,
    pub min_insurance_coverage: i128,
    pub audit_required: bool,
    pub multi_oracle_required: bool,
    pub oracle_consensus_threshold: u32,
}

#[contract]
pub struct CustodyValidator;

#[contractimpl]
impl CustodyValidator {
    fn put_oracle(env: Env, oracle_address: Address, name: Symbol, jurisdiction: Symbol) {
        let mut methods = Vec::<Symbol>::new(&env);
        methods.push_back(Symbol::new(&env, "physical_inspection"));
        methods.push_back(Symbol::new(&env, "document_verification"));
        methods.push_back(Symbol::new(&env, "blockchain_audit"));

        let oracle_info = OracleInfo {
            oracle_address: oracle_address.clone(),
            name,
            jurisdiction,
            verification_methods: methods,
            reputation_score: 80,
            fee_rate: 25,
            is_active: true,
            last_verification: 0,
            total_verifications: 0,
        };

        let mut oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        oracles.set(oracle_address, oracle_info);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "oracles"), &oracles);
    }

    pub fn initialize(env: Env, auth: Address, admin: Address, oracle_addresses: Vec<Address>) {
        auth.require_auth();
        if env
            .storage()
            .instance()
            .has(&Symbol::new(&env, "initialized"))
        {
            panic!("Validator already initialized");
        }

        let mut req_methods = Vec::<Symbol>::new(&env);
        req_methods.push_back(Symbol::new(&env, "physical_inspection"));
        req_methods.push_back(Symbol::new(&env, "document_verification"));
        req_methods.push_back(Symbol::new(&env, "blockchain_audit"));

        let config = ValidationConfig {
            min_oracle_reputation: 70,
            max_proof_age: 86400 * 30,
            required_verification_methods: req_methods,
            insurance_required: true,
            min_insurance_coverage: 1000000,
            audit_required: true,
            multi_oracle_required: true,
            oracle_consensus_threshold: 75,
        };

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "admin"), &admin);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "config"), &config);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "initialized"), &true);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "proof_count"), &0u64);
        env.storage().instance().set(
            &Symbol::new(&env, "proofs"),
            &Vec::<CustodyProof>::new(&env),
        );
        env.storage().instance().set(
            &Symbol::new(&env, "oracles"),
            &Map::<Address, OracleInfo>::new(&env),
        );
        env.storage().instance().set(
            &Symbol::new(&env, "registered_assets"),
            &Map::<Address, AssetRegistration>::new(&env),
        );

        for oracle_addr in oracle_addresses.iter() {
            Self::put_oracle(
                env.clone(),
                oracle_addr.clone(),
                Symbol::new(&env, "Default"),
                Symbol::new(&env, "US"),
            );
        }
    }

    pub fn register_oracle(
        env: Env,
        auth: Address,
        oracle_address: Address,
        name: Symbol,
        jurisdiction: Symbol,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        assert_admin(&auth, &admin);

        Self::put_oracle(env, oracle_address, name, jurisdiction);
    }

    pub fn register_asset(
        env: Env,
        auth: Address,
        asset_address: Address,
        registration: AssetRegistration,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        assert_admin(&auth, &admin);

        let mut registered_assets: Map<Address, AssetRegistration> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        registered_assets.set(asset_address, registration);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "registered_assets"), &registered_assets);
    }

    pub fn submit_custody_proof(env: Env, proof: CustodyProof) -> u64 {
        if !Self::validate_proof(env.clone(), proof.clone()) {
            panic!("Invalid custody proof");
        }

        let proof_count: u64 = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proof_count"))
            .unwrap_or(0u64);

        let proof_id = proof_count + 1;

        let mut proofs: Vec<CustodyProof> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        let mut valid_proof = proof;
        let asset_addr = valid_proof.asset_address.clone();
        let provider = valid_proof.custody_provider.clone();
        let value = valid_proof.asset_value;
        valid_proof.proof_id = proof_id;
        valid_proof.is_valid = true;

        proofs.push_back(valid_proof.clone());
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "proofs"), &proofs);
        env.storage()
            .instance()
            .set(&Symbol::new(&env, "proof_count"), &proof_id);

        let mut registered_assets: Map<Address, AssetRegistration> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        if let Some(mut asset_reg) = registered_assets.get(asset_addr.clone()) {
            asset_reg.last_verified = env.ledger().timestamp();
            registered_assets.set(asset_addr, asset_reg);
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "registered_assets"), &registered_assets);
        }

        Self::update_oracle_stats(env.clone(), provider.clone());

        env.events().publish(
            (
                Symbol::new(&env, "custody_proof_submitted"),
                valid_proof.asset_address,
            ),
            (proof_id, provider, value),
        );

        proof_id
    }

    pub fn validate_proof(env: Env, proof: CustodyProof) -> bool {
        let config: ValidationConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let registered_assets: Map<Address, AssetRegistration> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        if registered_assets.get(proof.asset_address.clone()).is_none() {
            return false;
        }

        let oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        match oracles.get(proof.custody_provider.clone()) {
            Some(oracle_info) => {
                if oracle_info.reputation_score < config.min_oracle_reputation {
                    return false;
                }
                if !oracle_info.is_active {
                    return false;
                }
            }
            None => return false,
        }

        let current_time = env.ledger().timestamp();
        if current_time - proof.verification_timestamp > config.max_proof_age {
            return false;
        }

        if current_time > proof.expiry_timestamp {
            return false;
        }

        if config.insurance_required && proof.insurance_coverage < config.min_insurance_coverage {
            return false;
        }

        if config.audit_required && proof.audit_report_hash == BytesN::from_array(&env, &[0; 32]) {
            return false;
        }

        if config.multi_oracle_required
            && !Self::verify_oracle_signatures(env.clone(), proof.clone())
        {
            return false;
        }

        true
    }

    fn verify_oracle_signatures(env: Env, proof: CustodyProof) -> bool {
        let config: ValidationConfig = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let valid_signatures = proof.oracle_signatures.len();
        let total_signatures = proof.oracle_signatures.len();

        if total_signatures == 0 {
            return false;
        }

        let consensus_percentage = (valid_signatures * 100) / total_signatures as u32;
        consensus_percentage >= config.oracle_consensus_threshold
    }

    fn update_oracle_stats(env: Env, oracle_address: Address) {
        let mut oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        if let Some(mut oracle_info) = oracles.get(oracle_address.clone()) {
            oracle_info.last_verification = env.ledger().timestamp();
            oracle_info.total_verifications += 1;
            if oracle_info.total_verifications % 10 == 0 {
                oracle_info.reputation_score = (oracle_info.reputation_score + 1).min(100);
            }
            oracles.set(oracle_address, oracle_info);
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "oracles"), &oracles);
        }
    }

    pub fn get_custody_proof(env: Env, proof_id: u64) -> CustodyProof {
        let proofs: Vec<CustodyProof> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        for p in proofs.iter() {
            if p.proof_id == proof_id {
                return p.clone();
            }
        }
        panic!("Proof not found")
    }

    pub fn get_latest_proof(env: Env, asset_address: Address) -> Option<CustodyProof> {
        let proofs: Vec<CustodyProof> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        let mut latest_proof: Option<CustodyProof> = None;
        let mut latest_timestamp = 0u64;

        for proof in proofs.iter() {
            if proof.asset_address == asset_address
                && proof.is_valid
                && proof.verification_timestamp > latest_timestamp
            {
                latest_timestamp = proof.verification_timestamp;
                latest_proof = Some(proof.clone());
            }
        }

        latest_proof
    }

    pub fn is_custody_valid(env: Env, asset_address: Address) -> bool {
        if let Some(proof) = Self::get_latest_proof(env.clone(), asset_address) {
            let current_time = env.ledger().timestamp();
            current_time <= proof.expiry_timestamp && proof.is_valid
        } else {
            false
        }
    }

    pub fn get_oracle_info(env: Env, oracle_address: Address) -> OracleInfo {
        let oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        oracles
            .get(oracle_address)
            .unwrap_or_else(|| panic!("Oracle not found"))
    }

    pub fn list_active_oracles(env: Env) -> Vec<OracleInfo> {
        let oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        let mut active_oracles = Vec::<OracleInfo>::new(&env);
        for (_, oracle_info) in oracles.iter() {
            if oracle_info.is_active {
                active_oracles.push_back(oracle_info.clone());
            }
        }

        active_oracles
    }

    pub fn update_oracle_status(env: Env, auth: Address, oracle_address: Address, is_active: bool) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        assert_admin(&auth, &admin);

        let mut oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        if let Some(mut oracle_info) = oracles.get(oracle_address.clone()) {
            oracle_info.is_active = is_active;
            oracles.set(oracle_address, oracle_info);
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "oracles"), &oracles);
        }
    }

    pub fn update_oracle_reputation(
        env: Env,
        auth: Address,
        oracle_address: Address,
        reputation_score: u32,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        assert_admin(&auth, &admin);

        if reputation_score > 100 {
            panic!("Invalid reputation score");
        }

        let mut oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        if let Some(mut oracle_info) = oracles.get(oracle_address.clone()) {
            oracle_info.reputation_score = reputation_score;
            oracles.set(oracle_address, oracle_info);
            env.storage()
                .instance()
                .set(&Symbol::new(&env, "oracles"), &oracles);
        }
    }

    pub fn get_asset_registration(env: Env, asset_address: Address) -> AssetRegistration {
        let registered_assets: Map<Address, AssetRegistration> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        registered_assets
            .get(asset_address)
            .unwrap_or_else(|| panic!("Asset not registered"))
    }

    pub fn update_config(env: Env, auth: Address, config: ValidationConfig) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        assert_admin(&auth, &admin);

        env.storage()
            .instance()
            .set(&Symbol::new(&env, "config"), &config);
    }

    pub fn get_validation_stats(env: Env) -> Map<Symbol, u64> {
        let proofs: Vec<CustodyProof> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        let oracles: Map<Address, OracleInfo> = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        let mut stats = Map::<Symbol, u64>::new(&env);

        stats.set(Symbol::new(&env, "total_proofs"), proofs.len() as u64);
        stats.set(Symbol::new(&env, "total_oracles"), oracles.len() as u64);

        let mut valid_proofs = 0u64;
        let mut expired_proofs = 0u64;
        let current_time = env.ledger().timestamp();

        for proof in proofs.iter() {
            if proof.is_valid && current_time <= proof.expiry_timestamp {
                valid_proofs += 1;
            } else if current_time > proof.expiry_timestamp {
                expired_proofs += 1;
            }
        }

        stats.set(Symbol::new(&env, "valid_proofs"), valid_proofs);
        stats.set(Symbol::new(&env, "expired_proofs"), expired_proofs);
        stats
    }
}
