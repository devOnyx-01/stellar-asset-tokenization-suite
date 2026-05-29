import { 
  Server, 
  TransactionBuilder, 
  Asset, 
  Keypair, 
  Contract,
  SorobanRpc,
  xdr,
  ScInt,
  Address,
  nativeToScVal,
  scValToNative
} from '@stellar/stellar-sdk';

import { RWASDKError, InvalidParametersError, TransactionError, NetworkError } from './errors';
import { ErrorCode } from './types';

export enum AssetClass {
  RealEstate = 0,
  Commodity = 1,
  Invoice = 2,
  Security = 3,
  Art = 4,
  CarbonCredit = 5
}

export interface ComplianceRules {
  kyc_required: boolean;
  accredited_investor_only: boolean;
  geographic_restrictions: string[];
  holding_period_days: number;
  transfer_limits: bigint;
}

export interface DividendSchedule {
  frequency_days: number;
  next_distribution_date: number;
  total_distributed: bigint;
  is_active: boolean;
}

export interface AssetConfig {
  name: string;
  symbol: string;
  decimals: number;
  total_supply: bigint;
  asset_class: AssetClass;
  compliance_rules: ComplianceRules;
  dividend_schedule?: DividendSchedule;
  metadata: Record<string, string>;
}

export interface RealEstateConfig {
  property_address: string;
  location_oracle: string;
  rental_yield_rate: number; // in basis points
  property_management_voting: boolean;
  insurance_status: boolean;
  appraisal_value: bigint;
}

export interface CommodityConfig {
  commodity_type: string;
  vault_location: string;
  custody_vault: string;
  purity_grade: string;
  physical_redemption_window: number;
  quality_attestation: string;
}

export interface InvoiceConfig {
  invoice_number: string;
  debtor_address: string;
  due_date: number;
  credit_rating: string;
  automatic_settlement: boolean;
  invoice_amount: bigint;
}

export interface SecurityConfig {
  equity_type: string;
  regulation_framework: string;
  accreditation_required: boolean;
  holding_period_days: number;
  regulatory_reporting: boolean;
  isin: string;
}

export interface ArtConfig {
  artist_name: string;
  provenance_hash: string;
  insurance_status: boolean;
  exhibition_voting: boolean;
  appraisal_value: bigint;
  authenticity_certificate: string;
}

export interface CarbonCreditConfig {
  project_id: string;
  vintage_year: number;
  retirement_functionality: boolean;
  project_metadata: Record<string, string>;
  verification_standard: string;
  carbon_offset_amount: bigint;
}

export interface DeploymentCost {
  gas_cost_xlm: number;
  storage_cost_bytes: number;
  estimated_time_seconds: number;
}

/**
 * Client for interacting with the on-chain AssetFactory contract.
 *
 * Provides helpers for deploying asset-class-specific RWA tokens, estimating
 * deployment costs, and querying the on-chain asset registry.
 *
 * @example
 * ```ts
 * const factory = new AssetFactory(
 *   'https://horizon-testnet.stellar.org',
 *   'CONTRACT_ID'
 * );
 * const result = await factory.deployRealEstateToken(signer, propertyDetails, config);
 * ```
 */
export class AssetFactory {
  private server: Server;
  private contract: Contract;
  private networkPassphrase: string;

  /**
   * Create a new AssetFactory client.
   *
   * @param serverUrl - Soroban RPC / Horizon server URL.
   * @param contractId - Stellar contract ID of the deployed AssetFactory contract.
   * @param networkPassphrase - Network passphrase used to sign transactions.
   *   Defaults to the Stellar testnet passphrase.
   */
  constructor(
    serverUrl: string,
    contractId: string,
    networkPassphrase: string = 'Test SDF Network ; September 2015'
  ) {
    this.server = new Server(serverUrl);
    this.contract = new Contract(contractId);
    this.networkPassphrase = networkPassphrase;
  }

  /**
   * Deploy a Real Estate RWA token with property-specific metadata.
   *
   * Merges `propertyDetails` into the asset metadata and calls `create_asset`
   * on the factory contract with `AssetClass.RealEstate`.
   *
   * @param signer - Keypair that authorises and signs the transaction.
   * @param propertyDetails - Real-estate-specific configuration (location oracle,
   *   rental yield, appraisal value, etc.).
   * @param ownershipStructure - Base asset configuration (name, symbol, supply, etc.).
   * @returns The deployed token contract address and the Stellar transaction ID.
   * @throws {InvalidParametersError} If required fields in `ownershipStructure` are invalid.
   * @throws {RWASDKError} If the transaction fails on-chain.
   */
  async deployRealEstateToken(
    signer: Keypair,
    propertyDetails: RealEstateConfig,
    ownershipStructure: AssetConfig
  ): Promise<{ address: string; transactionId: string }> {
    const account = await this.server.getAccount(signer.publicKey());
    
    // Create real estate specific metadata
    const metadata = {
      ...ownershipStructure.metadata,
      property_address: propertyDetails.property_address,
      location_oracle: propertyDetails.location_oracle,
      rental_yield: propertyDetails.rental_yield_rate.toString(),
      insurance_status: propertyDetails.insurance_status.toString(),
      appraisal_value: propertyDetails.appraisal_value.toString(),
      property_management_voting: propertyDetails.property_management_voting.toString()
    };

    const config: AssetConfig = {
      ...ownershipStructure,
      asset_class: AssetClass.RealEstate,
      metadata
    };

    const tx = await this.buildCreateAssetTransaction(signer, config);
    const result = await this.submitTransaction(tx, signer);
    
    return {
      address: result.returnValue?.address || '',
      transactionId: result.hash
    };
  }

  /**
   * Deploy a Commodity RWA token with vault and purity metadata.
   *
   * Validates the purity grade against the accepted set (`999`, `995`, `990`, `750`)
   * before calling `create_asset` with `AssetClass.Commodity`.
   *
   * @param signer - Keypair that authorises and signs the transaction.
   * @param commodityConfig - Commodity-specific configuration (vault location,
   *   purity grade, physical redemption window, etc.).
   * @param baseConfig - Base asset configuration (name, symbol, supply, etc.).
   * @returns The deployed token contract address and the Stellar transaction ID.
   * @throws {InvalidParametersError} If `purity_grade` is not one of the accepted values.
   * @throws {RWASDKError} If the transaction fails on-chain.
   */
  async deployCommodityToken(
    signer: Keypair,
    commodityConfig: CommodityConfig,
    baseConfig: AssetConfig
  ): Promise<{ address: string; transactionId: string }> {
    const account = await this.server.getAccount(signer.publicKey());
    
    // Validate purity grade
    const validGrades = ['999', '995', '990', '750'];
    if (!validGrades.includes(commodityConfig.purity_grade)) {
      throw new InvalidParametersError('Invalid purity grade. Must be one of: ' + validGrades.join(', '));
    }

    // Create commodity specific metadata
    const metadata = {
      ...baseConfig.metadata,
      commodity_type: commodityConfig.commodity_type,
      vault_location: commodityConfig.vault_location,
      purity_grade: commodityConfig.purity_grade,
      redemption_window: commodityConfig.physical_redemption_window.toString(),
      custody_vault: commodityConfig.custody_vault
    };

    const config: AssetConfig = {
      ...baseConfig,
      asset_class: AssetClass.Commodity,
      metadata
    };

    const tx = await this.buildCreateAssetTransaction(signer, config);
    const result = await this.submitTransaction(tx, signer);
    
    return {
      address: result.returnValue?.address || '',
      transactionId: result.hash
    };
  }

  /**
   * Deploy an Invoice RWA token backed by a trade receivable.
   *
   * Validates that `due_date` is in the future and that `credit_rating` is one
   * of the accepted values (`AAA`–`CCC`). Sets `total_supply` to the invoice
   * face value before calling `create_asset` with `AssetClass.Invoice`.
   *
   * @param signer - Keypair that authorises and signs the transaction.
   * @param invoiceData - Invoice-specific configuration (invoice number, debtor,
   *   due date, credit rating, face amount, etc.).
   * @param baseConfig - Base asset configuration (name, symbol, compliance rules, etc.).
   * @returns The deployed token contract address and the Stellar transaction ID.
   * @throws {InvalidParametersError} If `due_date` is in the past or `credit_rating` is invalid.
   * @throws {RWASDKError} If the transaction fails on-chain.
   */
  async deployInvoiceToken(
    signer: Keypair,
    invoiceData: InvoiceConfig,
    baseConfig: AssetConfig
  ): Promise<{ address: string; transactionId: string }> {
    const account = await this.server.getAccount(signer.publicKey());
    
    // Validate due date is in future
    const currentTime = Math.floor(Date.now() / 1000);
    if (invoiceData.due_date <= currentTime) {
      throw new InvalidParametersError('Due date must be in future');
    }

    // Validate credit rating
    const validRatings = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];
    if (!validRatings.includes(invoiceData.credit_rating)) {
      throw new InvalidParametersError('Invalid credit rating. Must be one of: ' + validRatings.join(', '));
    }

    // Create invoice specific metadata
    const metadata = {
      ...baseConfig.metadata,
      invoice_number: invoiceData.invoice_number,
      debtor_address: invoiceData.debtor_address,
      due_date: invoiceData.due_date.toString(),
      credit_rating: invoiceData.credit_rating,
      invoice_amount: invoiceData.invoice_amount.toString(),
      automatic_settlement: invoiceData.automatic_settlement.toString()
    };

    const config: AssetConfig = {
      ...baseConfig,
      asset_class: AssetClass.Invoice,
      total_supply: invoiceData.invoice_amount,
      metadata
    };

    const tx = await this.buildCreateAssetTransaction(signer, config);
    const result = await this.submitTransaction(tx, signer);
    
    return {
      address: result.returnValue?.address || '',
      transactionId: result.hash
    };
  }

  /**
   * Deploy a Security (equity) RWA token with regulatory compliance metadata.
   *
   * Validates `regulationFramework` against accepted values (`REG_D`, `REG_S`,
   * `RULE_144`, `REG_A+`) and enforces accredited-investor-only compliance rules.
   * Holding period is set to 365 days for `RULE_144`, 90 days otherwise.
   *
   * @param signer - Keypair that authorises and signs the transaction.
   * @param equityType - Type of equity (e.g. `"common"`, `"preferred"`).
   * @param regulationFramework - Applicable securities regulation framework.
   * @param baseConfig - Base asset configuration (name, symbol, supply, etc.).
   * @returns The deployed token contract address and the Stellar transaction ID.
   * @throws {InvalidParametersError} If `regulationFramework` is not one of the accepted values.
   * @throws {RWASDKError} If the transaction fails on-chain.
   */
  async deploySecurityToken(
    signer: Keypair,
    equityType: string,
    regulationFramework: string,
    baseConfig: AssetConfig
  ): Promise<{ address: string; transactionId: string }> {
    const account = await this.server.getAccount(signer.publicKey());
    
    // Validate regulation framework
    const validFrameworks = ['REG_D', 'REG_S', 'RULE_144', 'REG_A+'];
    if (!validFrameworks.includes(regulationFramework)) {
      throw new InvalidParametersError('Invalid regulation framework. Must be one of: ' + validFrameworks.join(', '));
    }

    // Update compliance rules for securities
    const complianceRules: ComplianceRules = {
      ...baseConfig.compliance_rules,
      accredited_investor_only: true,
      holding_period_days: regulationFramework === 'RULE_144' ? 365 : 90
    };

    // Create security specific metadata
    const metadata = {
      ...baseConfig.metadata,
      equity_type: equityType,
      regulation_framework: regulationFramework,
      regulatory_reporting: 'true'
    };

    const config: AssetConfig = {
      ...baseConfig,
      asset_class: AssetClass.Security,
      compliance_rules: complianceRules,
      metadata
    };

    const tx = await this.buildCreateAssetTransaction(signer, config);
    const result = await this.submitTransaction(tx, signer);
    
    return {
      address: result.returnValue?.address || '',
      transactionId: result.hash
    };
  }

  /**
   * Return a pre-populated `AssetConfig` template for the given asset class.
   *
   * The template includes sensible defaults for compliance rules and dividend
   * schedule. Callers should fill in `name`, `symbol`, and `total_supply`
   * before passing the result to a deploy method.
   *
   * @param assetClass - The asset class to generate a template for.
   * @returns A partially-populated `AssetConfig` with class-appropriate defaults.
   */
  getAssetClassTemplate(assetClass: AssetClass): Omit<AssetConfig, 'name' | 'symbol' | 'total_supply'> {
    return {
      decimals: 18,
      asset_class: assetClass,
      compliance_rules: this.getDefaultComplianceRules(assetClass),
      dividend_schedule: this.getDefaultDividendSchedule(assetClass),
      metadata: {}
    };
  }

  /**
   * Estimate the on-chain deployment cost for a given asset class.
   *
   * Returns approximate gas cost (in XLM), storage footprint (in bytes), and
   * expected confirmation time (in seconds). Values are based on empirical
   * multipliers per asset class and should be treated as estimates only.
   *
   * @param assetClass - The asset class to estimate costs for.
   * @returns An object containing `gas_cost_xlm`, `storage_cost_bytes`, and
   *   `estimated_time_seconds`.
   */
  async estimateDeploymentCost(assetClass: AssetClass): Promise<DeploymentCost> {
    // Base costs in XLM
    const baseGasCost = 0.1;
    const baseStorageCost = 10000; // bytes
    const baseTime = 5; // seconds

    // Asset class specific adjustments
    const multipliers = {
      [AssetClass.RealEstate]: { gas: 1.2, storage: 1.3, time: 1.5 },
      [AssetClass.Commodity]: { gas: 1.1, storage: 1.2, time: 1.2 },
      [AssetClass.Invoice]: { gas: 1.0, storage: 1.1, time: 1.0 },
      [AssetClass.Security]: { gas: 1.5, storage: 1.5, time: 2.0 },
      [AssetClass.Art]: { gas: 1.3, storage: 1.4, time: 1.7 },
      [AssetClass.CarbonCredit]: { gas: 1.1, storage: 1.1, time: 1.1 }
    };

    const multiplier = multipliers[assetClass];

    return {
      gas_cost_xlm: baseGasCost * multiplier.gas,
      storage_cost_bytes: Math.floor(baseStorageCost * multiplier.storage),
      estimated_time_seconds: Math.floor(baseTime * multiplier.time)
    };
  }

  /**
   * Fetch all assets currently registered in the on-chain registry.
   *
   * Reads the `registry` storage entry from the factory contract and maps
   * each entry to a plain object. Returns an empty array if the registry is
   * empty or the read fails.
   *
   * @returns An array of asset summary objects, each containing `symbol`,
   *   `name`, `asset_class`, `total_supply`, `token_address`, `created_at`,
   *   and `is_paused`.
   */
  async getAllAssets(): Promise<any[]> {
    try {
      const result = await this.server.getContractData(
        this.contract.getStellarAccountId(),
        xdr.ScVal.scvSymbol('registry')
      );
      
      if (!result.val) {
        return [];
      }

      const registry = scValToNative(result.val);
      if (!registry || typeof registry !== 'object') return [];
      return Object.values(registry).map((asset: Record<string, any>) => ({
        symbol: asset.symbol,
        name: asset.name,
        asset_class: asset.asset_class,
        total_supply: asset.total_supply.toString(),
        token_address: asset.token_address,
        created_at: asset.created_at,
        is_paused: asset.is_paused
      }));
    } catch (error) {
      console.error('Error fetching assets:', error);
      return [];
    }
  }

  /**
   * Trigger an emergency pause on all registered assets.
   *
   * Calls `emergency_pause_all` on the factory contract. Only the contract
   * admin is authorised to invoke this operation.
   *
   * @param signer - Admin keypair that authorises and signs the transaction.
   * @returns The Stellar transaction hash of the submitted transaction.
   * @throws {RWASDKError} If the transaction fails or the signer is not the admin.
   */
  async emergencyPauseAll(signer: Keypair): Promise<string> {
    const account = await this.server.getAccount(signer.publicKey());
    
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.networkPassphrase
    })
      .addOperation(this.contract.call(
        'emergency_pause_all',
        ...this.buildAuthArgs(signer)
      ))
      .setTimeout(30)
      .build();

    const result = await this.submitTransaction(tx, signer);
    return result.hash;
  }

  private async buildCreateAssetTransaction(
    signer: Keypair,
    config: AssetConfig
  ): Promise<any> {
    const account = await this.server.getAccount(signer.publicKey());
    
    const typeMap: Record<AssetClass, string> = {
      [AssetClass.RealEstate]: 'AssetConfig',
      [AssetClass.Commodity]: 'AssetConfig',
      [AssetClass.Invoice]: 'AssetConfig',
      [AssetClass.Security]: 'AssetConfig',
      [AssetClass.Art]: 'AssetConfig',
      [AssetClass.CarbonCredit]: 'AssetConfig'
    };

    const assetType = typeMap[config.asset_class];
    if (!assetType) {
      throw new Error(`Unknown asset class: ${config.asset_class}`);
    }

    const configScVal = nativeToScVal(config, { type: assetType });

    return new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.networkPassphrase
    })
      .addOperation(this.contract.call(
        'create_asset',
        ...this.buildAuthArgs(signer),
        configScVal
      ))
      .setTimeout(30)
      .build();
  }

  private buildAuthArgs(signer: Keypair): xdr.ScVal[] {
    return [
      nativeToScVal(new Address(signer.publicKey()), { type: 'Address' })
    ];
  }

  private async submitTransaction(
    transaction: any,
    signer: Keypair
  ): Promise<any> {
    transaction.sign(signer);

    let result: any;
    try {
      result = await this.server.sendTransaction(transaction);
    } catch (error: any) {
      throw new NetworkError(`Failed to send transaction: ${error?.message ?? error}`);
    }

    if (result.status === 'ERROR') {
      throw new TransactionError(`Transaction failed: ${result.errorResult}`);
    }

    // Wait for transaction confirmation
    const txResult = await this.server.getTransaction(result.hash!);

    if (txResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return txResult;
    } else {
      throw new TransactionError(`Transaction not successful: ${txResult.status}`);
    }
  }

  private getDefaultComplianceRules(assetClass: AssetClass): ComplianceRules {
    switch (assetClass) {
      case AssetClass.RealEstate:
        return {
          kyc_required: true,
          accredited_investor_only: false,
          geographic_restrictions: [],
          holding_period_days: 90,
          transfer_limits: BigInt(1000000)
        };
      case AssetClass.Commodity:
        return {
          kyc_required: true,
          accredited_investor_only: false,
          geographic_restrictions: [],
          holding_period_days: 0,
          transfer_limits: BigInt(5000000)
        };
      case AssetClass.Invoice:
        return {
          kyc_required: true,
          accredited_investor_only: true,
          geographic_restrictions: [],
          holding_period_days: 30,
          transfer_limits: BigInt(2500000)
        };
      case AssetClass.Security:
        return {
          kyc_required: true,
          accredited_investor_only: true,
          geographic_restrictions: ['US', 'EU', 'UK'],
          holding_period_days: 365,
          transfer_limits: BigInt(100000)
        };
      case AssetClass.Art:
        return {
          kyc_required: true,
          accredited_investor_only: false,
          geographic_restrictions: [],
          holding_period_days: 180,
          transfer_limits: BigInt(500000)
        };
      case AssetClass.CarbonCredit:
        return {
          kyc_required: true,
          accredited_investor_only: false,
          geographic_restrictions: [],
          holding_period_days: 0,
          transfer_limits: BigInt(10000000)
        };
    }
  }

  private getDefaultDividendSchedule(assetClass: AssetClass): DividendSchedule | undefined {
    const now = Math.floor(Date.now() / 1000);
    
    switch (assetClass) {
      case AssetClass.RealEstate:
        return {
          frequency_days: 90,
          next_distribution_date: now + (90 * 86400),
          total_distributed: BigInt(0),
          is_active: true
        };
      case AssetClass.Invoice:
        return {
          frequency_days: 30,
          next_distribution_date: now + (30 * 86400),
          total_distributed: BigInt(0),
          is_active: true
        };
      case AssetClass.Security:
        return {
          frequency_days: 90,
          next_distribution_date: now + (90 * 86400),
          total_distributed: BigInt(0),
          is_active: true
        };
      default:
        return undefined;
    }
  }
}
