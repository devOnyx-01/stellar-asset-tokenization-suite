use soroban_sdk::{
    contract, contractimpl, Address, Env, Symbol, Vec, Map, BytesN, 
    contracttype, contracterror
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum ComplianceError {
    Unauthorized = 1,
    UserNotFound = 2,
    KYCNotVerified = 3,
    Blacklisted = 4,
    InvalidJurisdiction = 5,
    AccreditationRequired = 6,
    TransferLimitExceeded = 7,
}

#[contracttype]
pub struct KYCStatus {
    pub is_verified: bool,
    pub verification_level: u32, // 1=Basic, 2=Enhanced, 3=Institutional
    pub expiry_date: u64,
    pub jurisdiction: Symbol,
    pub is_accredited: bool,
    pub risk_score: u32, // 1-5, 5=lowest risk
    pub aml_flags: Vec<Symbol>,
}

#[contracttype]
pub struct TransferLimits {
    pub daily_limit: i128,
    pub monthly_limit: i128,
    pub annual_limit: i128,
    pub remaining_daily: i128,
    pub remaining_monthly: i128,
    pub remaining_annual: i128,
    pub last_reset_daily: u64,
    pub last_reset_monthly: u64,
    pub last_reset_annual: u64,
}

#[contracttype]
pub struct ComplianceRule {
    pub rule_id: Symbol,
    pub name: Symbol,
    pub description: Symbol,
    pub is_active: bool,
    pub jurisdictions: Vec<Symbol>,
    pub min_verification_level: u32,
    pub requires_accreditation: bool,
    pub max_amount: i128,
}

#[contract]
pub struct ComplianceRegistry;

#[contractimpl]
impl ComplianceRegistry {
    /// Initialize the compliance registry
    pub fn initialize(env: Env, admin: Address, kyc_required: bool, transfer_restrictions: bool) {
        if env.storage().instance().has(&Symbol::new(&env, "initialized")) {
            panic!("Registry already initialized");
        }

        env.storage().instance().set(&Symbol::new(&env, "admin"), &admin);
        env.storage().instance().set(&Symbol::new(&env, "kyc_required"), &kyc_required);
        env.storage().instance().set(&Symbol::new(&env, "transfer_restrictions"), &transfer_restrictions);
        env.storage().instance().set(&Symbol::new(&env, "initialized"), &true);
        
        // Initialize default compliance rules
        let mut rules = Vec::<ComplianceRule>::new(&env);
        
        // Rule 144 compliance
        rules.push_back(ComplianceRule {
            rule_id: Symbol::new(&env, "rule_144"),
            name: Symbol::new(&env, "SEC Rule 144"),
            description: Symbol::new(&env, "Restricted securities resale limitations"),
            is_active: true,
            jurisdictions: vec![&env, Symbol::new(&env, "US")],
            min_verification_level: 2,
            requires_accreditation: true,
            max_amount: 1000000, // $1M limit per 6 months
        });

        // Reg D compliance
        rules.push_back(ComplianceRule {
            rule_id: Symbol::new(&env, "reg_d"),
            name: Symbol::new(&env, "Regulation D"),
            description: Symbol::new(&env, "Private placement exemptions"),
            is_active: true,
            jurisdictions: vec![&env, Symbol::new(&env, "US")],
            min_verification_level: 2,
            requires_accreditation: true,
            max_amount: 50000000, // $50M limit
        });

        // Reg S compliance
        rules.push_back(ComplianceRule {
            rule_id: Symbol::new(&env, "reg_s"),
            name: Symbol::new(&env, "Regulation S"),
            description: Symbol::new(&env, "Non-US offerings"),
            is_active: true,
            jurisdictions: vec![&env, Symbol::new(&env, "EU"), Symbol::new(&env, "UK"), Symbol::new(&env, "JP")],
            min_verification_level: 1,
            requires_accreditation: false,
            max_amount: i128::MAX, // No limit for non-US
        });

        env.storage().instance().set(&Symbol::new(&env, "compliance_rules"), &rules);
        env.storage().instance().set(&Symbol::new(&env, "blacklist"), &Vec::<Address>::new(&env));
        env.storage().instance().set(&Symbol::new(&env, "whitelist"), &Vec::<Address>::new(&env));
    }

    /// Add or update KYC status for a user
    pub fn update_kyc_status(env: Env, user: Address, kyc_status: KYCStatus) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Registry not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update KYC status");
        }

        env.storage().instance().set(&user, &kyc_status);

        // Emit KYC update event
        env.events().publish(
            (Symbol::new(&env, "kyc_updated"), user),
            (kyc_status.is_verified, kyc_status.verification_level),
        );
    }

    /// Get KYC status for a user
    pub fn get_kyc_status(env: Env, user: Address) -> KYCStatus {
        env.storage().instance()
            .get(&user)
            .unwrap_or(KYCStatus {
                is_verified: false,
                verification_level: 0,
                expiry_date: 0,
                jurisdiction: Symbol::new(&env, "UNKNOWN"),
                is_accredited: false,
                risk_score: 5, // Highest risk by default
                aml_flags: Vec::new(&env),
            })
    }

    /// Add address to blacklist
    pub fn add_to_blacklist(env: Env, address: Address, reason: Symbol) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Registry not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can manage blacklist");
        }

        let mut blacklist: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, "blacklist"))
            .unwrap_or(Vec::new(&env));

        blacklist.push_back(address.clone());
        env.storage().instance().set(&Symbol::new(&env, "blacklist"), &blacklist);

        // Store blacklist reason
        let reason_key = Symbol::new(&env, &format!("blacklist_reason_{}", address.clone()));
        env.storage().instance().set(&reason_key, &reason);

        env.events().publish(
            (Symbol::new(&env, "blacklisted"), address),
            reason,
        );
    }

    /// Remove address from blacklist
    pub fn remove_from_blacklist(env: Env, address: Address) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Registry not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can manage blacklist");
        }

        let mut blacklist: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, "blacklist"))
            .unwrap_or(Vec::new(&env));

        let mut found = false;
        let mut new_blacklist = Vec::<Address>::new(&env);
        for addr in blacklist.iter() {
            if addr == address {
                found = true;
            } else {
                new_blacklist.push_back(addr);
            }
        }

        if found {
            env.storage().instance().set(&Symbol::new(&env, "blacklist"), &new_blacklist);
            
            // Remove blacklist reason
            let reason_key = Symbol::new(&env, &format!("blacklist_reason_{}", address));
            env.storage().instance().remove(&reason_key);

            env.events().publish(
                (Symbol::new(&env, "unblacklisted"), address),
                Symbol::new(&env, "removed"),
            );
        }
    }

    /// Add address to whitelist
    pub fn add_to_whitelist(env: Env, address: Address) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Registry not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can manage whitelist");
        }

        let mut whitelist: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, "whitelist"))
            .unwrap_or(Vec::new(&env));

        whitelist.push_back(address.clone());
        env.storage().instance().set(&Symbol::new(&env, "whitelist"), &whitelist);

        env.events().publish(
            (Symbol::new(&env, "whitelisted"), address),
            Symbol::new(&env, "added"),
        );
    }

    /// Remove address from whitelist
    pub fn remove_from_whitelist(env: Env, address: Address) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Registry not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can manage whitelist");
        }

        let mut whitelist: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, "whitelist"))
            .unwrap_or(Vec::new(&env));

        let mut found = false;
        let mut new_whitelist = Vec::<Address>::new(&env);
        for addr in whitelist.iter() {
            if addr == address {
                found = true;
            } else {
                new_whitelist.push_back(addr);
            }
        }

        if found {
            env.storage().instance().set(&Symbol::new(&env, "whitelist"), &new_whitelist);
            env.events().publish(
                (Symbol::new(&env, "unwhitelisted"), address),
                Symbol::new(&env, "removed"),
            );
        }
    }

    /// Check if an address is compliant for transfers
    pub fn check_compliance(env: Env, from: Address, to: Address, amount: i128) -> bool {
        let kyc_required: bool = env.storage().instance()
            .get(&Symbol::new(&env, "kyc_required"))
            .unwrap_or(true);

        // Check blacklist
        let blacklist: Vec<Address> = env.storage().instance()
            .get(&Symbol::new(&env, "blacklist"))
            .unwrap_or(Vec::new(&env));

        for addr in blacklist.iter() {
            if addr == from || addr == to {
                return false;
            }
        }

        // Check whitelist if KYC is required
        if kyc_required {
            let whitelist: Vec<Address> = env.storage().instance()
                .get(&Symbol::new(&env, "whitelist"))
                .unwrap_or(Vec::new(&env));

            let from_whitelisted = whitelist.iter().any(|addr| addr == &from);
            let to_whitelisted = whitelist.iter().any(|addr| addr == &to);

            if !from_whelisted || !to_whitelisted {
                // Check KYC status if not whitelisted
                let from_kyc = self.get_kyc_status(env, from.clone());
                let to_kyc = self.get_kyc_status(env, to.clone());

                if !from_kyc.is_verified || !to_kyc.is_verified {
                    return false;
                }

                // Check KYC expiry
                let current_time = env.ledger().timestamp();
                if from_kyc.expiry_date < current_time || to_kyc.expiry_date < current_time {
                    return false;
                }
            }
        }

        // Check transfer limits if enabled
        let transfer_restrictions: bool = env.storage().instance()
            .get(&Symbol::new(&env, "transfer_restrictions"))
            .unwrap_or(false);

        if transfer_restrictions {
            if !self.check_transfer_limits(env, from.clone(), amount) {
                return false;
            }
        }

        true
    }

    /// Check transfer limits for a user
    pub fn check_transfer_limits(env: Env, user: Address, amount: i128) -> bool {
        let limits_key = Symbol::new(&env, &format!("limits_{}", user));
        let mut limits: TransferLimits = env.storage().instance()
            .get(&limits_key)
            .unwrap_or(TransferLimits {
                daily_limit: 10000,
                monthly_limit: 100000,
                annual_limit: 1000000,
                remaining_daily: 10000,
                remaining_monthly: 100000,
                remaining_annual: 1000000,
                last_reset_daily: 0,
                last_reset_monthly: 0,
                last_reset_annual: 0,
            });

        let current_time = env.ledger().timestamp();
        let day_in_seconds = 86400;
        let month_in_seconds = 30 * day_in_seconds;
        let year_in_seconds = 365 * day_in_seconds;

        // Reset daily limit if needed
        if current_time - limits.last_reset_daily >= day_in_seconds {
            limits.remaining_daily = limits.daily_limit;
            limits.last_reset_daily = current_time;
        }

        // Reset monthly limit if needed
        if current_time - limits.last_reset_monthly >= month_in_seconds {
            limits.remaining_monthly = limits.monthly_limit;
            limits.last_reset_monthly = current_time;
        }

        // Reset annual limit if needed
        if current_time - limits.last_reset_annual >= year_in_seconds {
            limits.remaining_annual = limits.annual_limit;
            limits.last_reset_annual = current_time;
        }

        // Check if amount exceeds limits
        if amount > limits.remaining_daily || 
           amount > limits.remaining_monthly || 
           amount > limits.remaining_annual {
            return false;
        }

        // Update remaining limits
        limits.remaining_daily -= amount;
        limits.remaining_monthly -= amount;
        limits.remaining_annual -= amount;

        env.storage().instance().set(&limits_key, &limits);
        true
    }

    /// Set transfer limits for a user
    pub fn set_transfer_limits(env: Env, user: Address, limits: TransferLimits) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Registry not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can set transfer limits");
        }

        let limits_key = Symbol::new(&env, &format!("limits_{}", user));
        env.storage().instance().set(&limits_key, &limits);
    }

    /// Get all compliance rules
    pub fn get_compliance_rules(env: Env) -> Vec<ComplianceRule> {
        env.storage().instance()
            .get(&Symbol::new(&env, "compliance_rules"))
            .unwrap_or(Vec::new(&env))
    }

    /// Update compliance rule
    pub fn update_compliance_rule(env: Env, rule: ComplianceRule) {
        let admin: Address = env.storage().instance()
            .get(&Symbol::new(&env, "admin"))
            .unwrap_or_else(|| panic!("Registry not initialized"));

        if env.invoker() != admin {
            panic!("Unauthorized: Only admin can update compliance rules");
        }

        let mut rules: Vec<ComplianceRule> = env.storage().instance()
            .get(&Symbol::new(&env, "compliance_rules"))
            .unwrap_or(Vec::new(&env));

        let mut found = false;
        let mut new_rules = Vec::<ComplianceRule>::new(&env);
        for existing_rule in rules.iter() {
            if existing_rule.rule_id == rule.rule_id {
                new_rules.push_back(rule);
                found = true;
            } else {
                new_rules.push_back(existing_rule);
            }
        }

        if found {
            env.storage().instance().set(&Symbol::new(&env, "compliance_rules"), &new_rules);
        }
    }
}
