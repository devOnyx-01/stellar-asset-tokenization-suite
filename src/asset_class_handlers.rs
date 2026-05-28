use soroban_sdk::{
    contract, contracterror, contractimpl, Env, Symbol, Vec,
};

use crate::asset_factory::{AssetClass, AssetConfig, ComplianceRules, DividendSchedule};

pub use crate::real_estate;
pub use crate::commodity;
pub use crate::invoice;
pub use crate::security;
pub use crate::art;
pub use crate::carbon_credit;
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, Map, Symbol, Vec, BytesN,
};

use crate::asset_factory::{AssetClass, AssetConfig, ComplianceRules, DividendSchedule};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum AssetClassError {
    InvalidLocation = 1,
    InvalidPurityGrade = 2,
    InvalidDueDate = 3,
    InvalidCreditRating = 4,
    InvalidProvenance = 5,
    InvalidVintage = 6,
    UnauthorizedAccess = 7,
    InvalidParameters = 8,
    InvalidRegulationFramework = 9,
    InvalidVerificationStandard = 10,
}

#[contract]
pub struct AssetClassHandlers;

#[contractimpl]
impl AssetClassHandlers {
    pub fn create_real_estate_config(
        env: Env,
        base_config: AssetConfig,
        real_estate_config: real_estate::RealEstateConfig,
    ) -> AssetConfig {
        real_estate::create_real_estate_config(env, base_config, real_estate_config)
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
        metadata.set(
            Symbol::new(&env, "property_address"),
            real_estate_config.property_address,
        );
        metadata.set(
            Symbol::new(&env, "location_oracle"),
            Symbol::new(&env, &real_estate_config.location_oracle.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "rental_yield"),
            Symbol::new(&env, &real_estate_config.rental_yield_rate.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "insurance_status"),
            Symbol::new(&env, &real_estate_config.insurance_status.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "appraisal_value"),
            Symbol::new(&env, &real_estate_config.appraisal_value.to_string()),
        );

        AssetConfig {
            metadata,
            ..base_config
        }
    }

    pub fn create_commodity_config(
        env: Env,
        base_config: AssetConfig,
        commodity_config: commodity::CommodityConfig,
    ) -> AssetConfig {
        commodity::create_commodity_config(env, base_config, commodity_config)
        // Validate purity grade
        let valid_grades = Vec::from_array(&env, [
            Symbol::new(&env, "999"),
            Symbol::new(&env, "995"),
            Symbol::new(&env, "990"),
            Symbol::new(&env, "750"),
        ]);
        
        if !valid_grades.contains(&commodity_config.purity_grade) {
            panic_with_error!(&env, AssetClassError::InvalidPurityGrade);
        }

        // Add commodity specific metadata
        let mut metadata = base_config.metadata;
        metadata.set(
            Symbol::new(&env, "commodity_type"),
            commodity_config.commodity_type,
        );
        metadata.set(
            Symbol::new(&env, "vault_location"),
            commodity_config.vault_location,
        );
        metadata.set(
            Symbol::new(&env, "purity_grade"),
            commodity_config.purity_grade,
        );
        metadata.set(
            Symbol::new(&env, "redemption_window"),
            Symbol::new(&env, &commodity_config.physical_redemption_window.to_string()),
        );

        AssetConfig {
            metadata,
            ..base_config
        }
    }

    pub fn create_invoice_config(
        env: Env,
        base_config: AssetConfig,
        invoice_config: invoice::InvoiceConfig,
    ) -> AssetConfig {
        invoice::create_invoice_config(env, base_config, invoice_config)
        let current_time = env.ledger().timestamp();
        
        // Validate due date is in the future
        if invoice_config.due_date <= current_time {
            panic_with_error!(&env, AssetClassError::InvalidDueDate);
        }

        // Validate credit rating
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
            panic_with_error!(&env, AssetClassError::InvalidCreditRating);
        }

        // Add invoice specific metadata
        let mut metadata = base_config.metadata;
        metadata.set(
            Symbol::new(&env, "invoice_number"),
            invoice_config.invoice_number,
        );
        metadata.set(
            Symbol::new(&env, "debtor_address"),
            Symbol::new(&env, &invoice_config.debtor_address.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "due_date"),
            Symbol::new(&env, &invoice_config.due_date.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "credit_rating"),
            invoice_config.credit_rating,
        );
        metadata.set(
            Symbol::new(&env, "invoice_amount"),
            Symbol::new(&env, &invoice_config.invoice_amount.to_string()),
        );

        AssetConfig {
            metadata,
            ..base_config
        }
    }

    pub fn create_security_config(
        env: Env,
        base_config: AssetConfig,
        security_config: security::SecurityConfig,
    ) -> AssetConfig {
        security::create_security_config(env, base_config, security_config)
        // Validate regulation framework
        let valid_frameworks = Vec::from_array(&env, [
            Symbol::new(&env, "REG_D"),
            Symbol::new(&env, "REG_S"),
            Symbol::new(&env, "RULE_144"),
            Symbol::new(&env, "REG_A+"),
        ]);
        
        if !valid_frameworks.contains(&security_config.regulation_framework) {
            panic_with_error!(&env, AssetClassError::InvalidRegulationFramework);
        }

        // Update compliance rules for securities
        let mut compliance_rules = base_config.compliance_rules;
        compliance_rules.accredited_investor_only = security_config.accreditation_required;
        compliance_rules.holding_period_days = security_config.holding_period_days;

        // Add security specific metadata
        let mut metadata = base_config.metadata;
        metadata.set(
            Symbol::new(&env, "equity_type"),
            security_config.equity_type,
        );
        metadata.set(
            Symbol::new(&env, "regulation_framework"),
            security_config.regulation_framework,
        );
        metadata.set(
            Symbol::new(&env, "isin"),
            security_config.isin,
        );
        metadata.set(
            Symbol::new(&env, "regulatory_reporting"),
            Symbol::new(&env, &security_config.regulatory_reporting.to_string()),
        );

        AssetConfig {
            compliance_rules,
            metadata,
            ..base_config
        }
    }

    pub fn create_art_config(
        env: Env,
        base_config: AssetConfig,
        art_config: art::ArtConfig,
    ) -> AssetConfig {
        art::create_art_config(env, base_config, art_config)
        // Validate provenance hash is not empty
        if art_config.provenance_hash == BytesN::from_array(&env, &[0u8; 32]) {
            panic_with_error!(&env, AssetClassError::InvalidProvenance);
        }

        // Add art specific metadata
        let mut metadata = base_config.metadata;
        metadata.set(
            Symbol::new(&env, "artist_name"),
            art_config.artist_name,
        );
        metadata.set(
            Symbol::new(&env, "provenance_hash"),
            Symbol::new(&env, &std::str::from_utf8(&art_config.provenance_hash.to_array()).unwrap_or("invalid")),
        );
        metadata.set(
            Symbol::new(&env, "insurance_status"),
            Symbol::new(&env, &art_config.insurance_status.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "exhibition_voting"),
            Symbol::new(&env, &art_config.exhibition_voting.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "appraisal_value"),
            Symbol::new(&env, &art_config.appraisal_value.to_string()),
        );

        AssetConfig {
            metadata,
            ..base_config
        }
    }

    pub fn create_carbon_credit_config(
        env: Env,
        base_config: AssetConfig,
        carbon_config: carbon_credit::CarbonCreditConfig,
    ) -> AssetConfig {
        carbon_credit::create_carbon_credit_config(env, base_config, carbon_config)
        // Validate vintage year is reasonable
        let current_year = (env.ledger().timestamp() / 31536000) + 1970; // Approximate current year
        if carbon_config.vintage_year < 1990 || carbon_config.vintage_year > current_year {
            panic_with_error!(&env, AssetClassError::InvalidVintage);
        }

        // Validate verification standard
        let valid_standards = Vec::from_array(&env, [
            Symbol::new(&env, "VCS"),
            Symbol::new(&env, "GS"),
            Symbol::new(&env, "CDM"),
            Symbol::new(&env, "ACR"),
        ]);
        
        if !valid_standards.contains(&carbon_config.verification_standard) {
            panic_with_error!(&env, AssetClassError::InvalidVerificationStandard);
        }

        // Add carbon credit specific metadata
        let mut metadata = base_config.metadata;
        metadata.set(
            Symbol::new(&env, "project_id"),
            carbon_config.project_id,
        );
        metadata.set(
            Symbol::new(&env, "vintage_year"),
            Symbol::new(&env, &carbon_config.vintage_year.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "retirement_functionality"),
            Symbol::new(&env, &carbon_config.retirement_functionality.to_string()),
        );
        metadata.set(
            Symbol::new(&env, "verification_standard"),
            carbon_config.verification_standard,
        );
        metadata.set(
            Symbol::new(&env, "carbon_offset_amount"),
            Symbol::new(&env, &carbon_config.carbon_offset_amount.to_string()),
        );

        // Merge project metadata
        for (key, value) in carbon_config.project_metadata {
            metadata.set(key, value);
        }

        AssetConfig {
            metadata,
            ..base_config
        }
    }

    /// Get default compliance rules for asset class
    pub fn get_default_compliance_rules(env: Env, asset_class: AssetClass) -> ComplianceRules {
        match asset_class {
            AssetClass::RealEstate => ComplianceRules {
                kyc_required: true,
                accredited_investor_only: false,
                geographic_restrictions: Vec::new(&env),
                holding_period_days: 90,
                transfer_limits: 1000000, // 1M tokens
            },
            AssetClass::Commodity => ComplianceRules {
                kyc_required: true,
                accredited_investor_only: false,
                geographic_restrictions: Vec::new(&env),
                holding_period_days: 0,
                transfer_limits: 5000000, // 5M tokens
            },
            AssetClass::Invoice => ComplianceRules {
                kyc_required: true,
                accredited_investor_only: true,
                geographic_restrictions: Vec::new(&env),
                holding_period_days: 30,
                transfer_limits: 2500000, // 2.5M tokens
            },
            AssetClass::Security => ComplianceRules {
                kyc_required: true,
                accredited_investor_only: true,
                geographic_restrictions: Vec::from_array(&env, [
                    Symbol::new(&env, "US"),
                    Symbol::new(&env, "EU"),
                    Symbol::new(&env, "UK"),
                ]),
                holding_period_days: 365,
                transfer_limits: 100000, // 100K tokens
            },
            AssetClass::Art => ComplianceRules {
                kyc_required: true,
                accredited_investor_only: false,
                geographic_restrictions: Vec::new(&env),
                holding_period_days: 180,
                transfer_limits: 500000, // 500K tokens
            },
            AssetClass::CarbonCredit => ComplianceRules {
                kyc_required: true,
                accredited_investor_only: false,
                geographic_restrictions: Vec::new(&env),
                holding_period_days: 0,
                transfer_limits: 10000000, // 10M tokens
            },
        }
    }

    /// Get default dividend schedule for asset class
    pub fn get_default_dividend_schedule(env: Env, asset_class: AssetClass) -> Option<DividendSchedule> {
        match asset_class {
            AssetClass::RealEstate => Some(DividendSchedule {
                frequency_days: 90, // Quarterly
                next_distribution_date: env.ledger().timestamp() + (90 * 86400),
                total_distributed: 0,
                is_active: true,
            }),
            AssetClass::Commodity => None, // Commodities typically don't pay dividends
            AssetClass::Invoice => Some(DividendSchedule {
                frequency_days: 30, // Monthly
                next_distribution_date: env.ledger().timestamp() + (30 * 86400),
                total_distributed: 0,
                is_active: true,
            }),
            AssetClass::Security => Some(DividendSchedule {
                frequency_days: 90, // Quarterly
                next_distribution_date: env.ledger().timestamp() + (90 * 86400),
                total_distributed: 0,
                is_active: true,
            }),
            AssetClass::Art => None, // Art typically doesn't pay dividends
            AssetClass::CarbonCredit => None, // Carbon credits don't pay dividends
        }
    }
}
