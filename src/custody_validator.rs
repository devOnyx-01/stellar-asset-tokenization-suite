use soroban_sdk::{
    contract, contractimpl, Address, Env, Symbol, Vec, Map, BytesN, 
    contracttype, contracterror
};

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
pub struct OracleInfo {
    pub oracle_address: Address,
    pub name: Symbol,
    pub jurisdiction: Symbol,
    pub verification_methods: Vec<Symbol>,
    pub reputation_score: u32, // 0-100
    pub fee_rate: i64, // basis points
    pub is_active: bool,
    pub last_verification: u64,
    pub total_verifications: u64,
}

#[contracttype]
pub struct AssetRegistration {
    pub asset_address: Address,
    pub asset_type: Symbol,
    pub legal_identifier: Symbol, // Legal title number, registration ID, etc.
    pub jurisdiction: Symbol,
    pub custody_requirements: Vec<Symbol>,
    pub verification_frequency: u64, // in seconds
    pub required_oracles: u32,
    pub last_verified: u64,
    pub is_active: bool,
}

#[contracttype]
pub struct ValidationConfig {
    pub min_oracle_reputation: u32,
    pub max_proof_age: u64, // in seconds
    pub required_verification_methods: Vec<Symbol>,
    pub insurance_required: bool,
    pub min_insurance_coverage: i128,
    pub audit_required: bool,
    pub multi_oracle_required: bool,
    pub oracle_consensus_threshold: u32, // percentage (0-100)
}

#[contract]
pub struct CustodyValidator;

#[contractimpl]
impl CustodyValidator {
    /// Initialize the custody validator
    pub fn initialize(env: Env, admin: Address, oracle_addresses: Vec<Address>) {
        if env.storage().instance().has(&Symbol::new(&env, "initialized")) {
            panic!("Validator already initialized");
        }

        let config = ValidationConfig {
            min_oracle_reputation: 70, // Minimum 70% reputation
            max_proof_age: 86400 * 30, // 30 days
            required_verification_methods: vec![&env, 
                Symbol::new(&env, "physical_inspection"),
                Symbol::new(&env, "document_verification"),
                Symbol::new(&env, "blockchain_audit")
            ],
            insurance_required: true,
            min_insurance_coverage: 1000000, // $1M minimum
            audit_required: true,
            multi_oracle_required: true,
            oracle_consensus_threshold: 75, // 75% consensus required
        };

        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
        env.storage().instance().set(&Symbol::new(&env, "initialized"), &true);
        env.storage().instance().set(&Symbol::new(&env, "proof_count"), &0u64);
        env.storage().instance().set(&Symbol::new(&env, "proofs"), &Vec::<CustodyProof>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "oracles"), &Map::<Address, OracleInfo>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "registered_assets"), &Map::<Address, AssetRegistration>::new(&env));

        // Register initial oracles
        for oracle_addr in oracle_addresses.iter() {
            self.register_oracle(env, oracle_addr.clone(), Symbol::new(&env, "Default"), Symbol::new(&env, "US"));
        }
    }

    /// Register an oracle
    pub fn register_oracle(env: Env, oracle_address: Address, name: Symbol, jurisdiction: Symbol) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can register oracles");
        }

        let oracle_info = OracleInfo {
            oracle_address: oracle_address.clone(),
            name,
            jurisdiction,
            verification_methods: vec![&env,
                Symbol::new(&env, "physical_inspection"),
                Symbol::new(&env, "document_verification"),
                Symbol::new(&env, "blockchain_audit")
            ],
            reputation_score: 80, // Default reputation
            fee_rate: 25, // 0.25% fee
            is_active: true,
            last_verification: 0,
            total_verifications: 0,
        };

        let mut oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        oracles.set(oracle_address, oracle_info);
        env.storage().instance().set(&Symbol::new(&env, "oracles"), &oracles);
    }

    /// Register an asset for custody validation
    pub fn register_asset(env: Env, asset_address: Address, registration: AssetRegistration) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can register assets");
        }

        let mut registered_assets: Map<Address, AssetRegistration> = env.storage().instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        registered_assets.set(asset_address, registration);
        env.storage().instance().set(&Symbol::new(&env, "registered_assets"), &registered_assets);
    }

    /// Submit custody proof
    pub fn submit_custody_proof(env: Env, proof: CustodyProof) -> u64 {
        // Validate the proof
        if !self.validate_proof(env, proof.clone()) {
            panic!("Invalid custody proof");
        }

        let proof_count: u64 = env.storage().instance()
            .get(&Symbol::new(&env, "proof_count"))
            .unwrap_or(0u64);

        let proof_id = proof_count + 1;

        // Store the proof
        let mut proofs: Vec<CustodyProof> = env.storage().instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        let mut valid_proof = proof;
        valid_proof.proof_id = proof_id;
        valid_proof.is_valid = true;

        proofs.push_back(valid_proof.clone());
        env.storage().instance().set(&Symbol::new(&env, "proofs"), &proofs);
        env.storage().instance().set(&Symbol::new(&env, "proof_count"), &proof_id);

        // Update asset registration
        let mut registered_assets: Map<Address, AssetRegistration> = env.storage().instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        if let Some(mut asset_reg) = registered_assets.get(proof.asset_address) {
            asset_reg.last_verified = env.ledger().timestamp();
            registered_assets.set(proof.asset_address, asset_reg);
        }

        // Update oracle statistics
        self.update_oracle_stats(env, proof.custody_provider);

        env.events().publish(
            (Symbol::new(&env, "custody_proof_submitted"), proof.asset_address),
            (proof_id, proof.custody_provider, proof.asset_value),
        );

        proof_id
    }

    /// Validate a custody proof
    pub fn validate_proof(env: Env, proof: CustodyProof) -> bool {
        let config: ValidationConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        // Check if asset is registered
        let registered_assets: Map<Address, AssetRegistration> = env.storage().instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        if !registered_assets.contains_key(&proof.asset_address) {
            return false;
        }

        // Check oracle reputation
        let oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        if let Some(oracle_info) = oracles.get(&proof.custody_provider) {
            if oracle_info.reputation_score < config.min_oracle_reputation {
                return false;
            }
            if !oracle_info.is_active {
                return false;
            }
        } else {
            return false;
        }

        // Check proof age
        let current_time = env.ledger().timestamp();
        if current_time - proof.verification_timestamp > config.max_proof_age {
            return false;
        }

        // Check expiry
        if current_time > proof.expiry_timestamp {
            return false;
        }

        // Check insurance coverage if required
        if config.insurance_required && proof.insurance_coverage < config.min_insurance_coverage {
            return false;
        }

        // Check audit report if required
        if config.audit_required && proof.audit_report_hash == BytesN::from_array(&env, &[0; 32]) {
            return false;
        }

        // Verify oracle signatures
        if config.multi_oracle_required {
            if !self.verify_oracle_signatures(env, proof.clone()) {
                return false;
            }
        }

        true
    }

    /// Verify oracle signatures
    fn verify_oracle_signatures(env: Env, proof: CustodyProof) -> bool {
        let config: ValidationConfig = env.storage().instance()
            .get(&Symbol::new(&env, "config"))
            .unwrap_or_else(|| panic!("Config not found"));

        let oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        let mut valid_signatures = 0;
        let total_signatures = proof.oracle_signatures.len();

        for signature in proof.oracle_signatures.iter() {
            // This would implement actual signature verification
            // For now, we'll assume all signatures are valid
            valid_signatures += 1;
        }

        // Check consensus threshold
        if total_signatures == 0 {
            return false;
        }

        let consensus_percentage = (valid_signatures * 100) / total_signatures as u32;
        consensus_percentage >= config.oracle_consensus_threshold
    }

    /// Update oracle statistics
    fn update_oracle_stats(env: Env, oracle_address: Address) {
        let mut oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        if let Some(mut oracle_info) = oracles.get(oracle_address) {
            oracle_info.last_verification = env.ledger().timestamp();
            oracle_info.total_verifications += 1;
            
            // Update reputation based on successful verifications
            if oracle_info.total_verifications % 10 == 0 {
                oracle_info.reputation_score = (oracle_info.reputation_score + 1).min(100);
            }

            oracles.set(oracle_address, oracle_info);
            env.storage().instance().set(&Symbol::new(&env, "oracles"), &oracles);
        }
    }

    /// Get custody proof
    pub fn get_custody_proof(env: Env, proof_id: u64) -> CustodyProof {
        let proofs: Vec<CustodyProof> = env.storage().instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        proofs.iter()
            .find(|p| p.proof_id == proof_id)
            .cloned()
            .unwrap_or_else(|| panic!("Proof not found"))
    }

    /// Get latest custody proof for an asset
    pub fn get_latest_proof(env: Env, asset_address: Address) -> Option<CustodyProof> {
        let proofs: Vec<CustodyProof> = env.storage().instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        let mut latest_proof: Option<CustodyProof> = None;
        let mut latest_timestamp = 0u64;

        for proof in proofs.iter() {
            if proof.asset_address == asset_address && 
               proof.is_valid && 
               proof.verification_timestamp > latest_timestamp {
                latest_timestamp = proof.verification_timestamp;
                latest_proof = Some(proof.clone());
            }
        }

        latest_proof
    }

    /// Check if asset custody is valid
    pub fn is_custody_valid(env: Env, asset_address: Address) -> bool {
        if let Some(proof) = self.get_latest_proof(env, asset_address) {
            let current_time = env.ledger().timestamp();
            current_time <= proof.expiry_timestamp && proof.is_valid
        } else {
            false
        }
    }

    /// Get oracle information
    pub fn get_oracle_info(env: Env, oracle_address: Address) -> OracleInfo {
        let oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        oracles.get(oracle_address)
            .unwrap_or_else(|| panic!("Oracle not found"))
    }

    /// List all active oracles
    pub fn list_active_oracles(env: Env) -> Vec<OracleInfo> {
        let oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        let mut active_oracles = Vec::<OracleInfo>::new(&env);
        for (_, oracle_info) in oracles.iter() {
            if oracle_info.is_active {
                active_oracles.push_back(oracle_info);
            }
        }

        active_oracles
    }

    /// Update oracle status
    pub fn update_oracle_status(env: Env, oracle_address: Address, is_active: bool) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update oracle status");
        }

        let mut oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        if let Some(mut oracle_info) = oracles.get(oracle_address) {
            oracle_info.is_active = is_active;
            oracles.set(oracle_address, oracle_info);
            env.storage().instance().set(&Symbol::new(&env, "oracles"), &oracles);
        }
    }

    /// Update oracle reputation
    pub fn update_oracle_reputation(env: Env, oracle_address: Address, reputation_score: u32) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update oracle reputation");
        }

        if reputation_score > 100 {
            panic!("Invalid reputation score");
        }

        let mut oracles: Map<Address, OracleInfo> = env.storage().instance()
            .get(&Symbol::new(&env, "oracles"))
            .unwrap_or(Map::new(&env));

        if let Some(mut oracle_info) = oracles.get(oracle_address) {
            oracle_info.reputation_score = reputation_score;
            oracles.set(oracle_address, oracle_info);
            env.storage().instance().set(&Symbol::new(&env, "oracles"), &oracles);
        }
    }

    /// Get asset registration
    pub fn get_asset_registration(env: Env, asset_address: Address) -> AssetRegistration {
        let registered_assets: Map<Address, AssetRegistration> = env.storage().instance()
            .get(&Symbol::new(&env, "registered_assets"))
            .unwrap_or(Map::new(&env));

        registered_assets.get(asset_address)
            .unwrap_or_else(|| panic!("Asset not registered"))
    }

    /// Update validation configuration
    pub fn update_config(env: Env, config: ValidationConfig) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Validator not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update config");
        }

        env.storage().instance().set(&Symbol::new(&env, "config"), &config);
    }

    /// Get validation statistics
    pub fn get_validation_stats(env: Env) -> Map<Symbol, u64> {
        let proofs: Vec<CustodyProof> = env.storage().instance()
            .get(&Symbol::new(&env, "proofs"))
            .unwrap_or(Vec::new(&env));

        let oracles: Map<Address, OracleInfo> = env.storage().instance()
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
