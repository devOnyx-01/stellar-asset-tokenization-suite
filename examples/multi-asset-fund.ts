import { 
  AssetFactory, 
  AssetClass, 
  AssetConfig, 
  RealEstateConfig, 
  CommodityConfig, 
  InvoiceConfig,
  SecurityConfig,
  Keypair 
} from '../sdk/src/assetFactory';
import { Server, TransactionBuilder } from '@stellar/stellar-sdk';

/**
 * Multi-Asset Fund Deployment Example
 * 
 * This example demonstrates how to deploy a diversified fund consisting of:
 * 1. Real Estate token (Commercial Property)
 * 2. Commodity token (Gold)
 * 3. Invoice token (Trade Receivables)
 * 
 * The fund represents a real-world investment portfolio with different
 * risk profiles and return characteristics.
 */

// Configuration
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const SERVER_URL = 'https://horizon-testnet.stellar.org';
const FACTORY_CONTRACT_ID = 'CDLZFC3SYJYDZTZXKZ7F5P5KXG5E2Y4O5T5Y7S2F7Q6Z3V7R2T5Q'; // Example contract ID

// Initialize the Asset Factory
const assetFactory = new AssetFactory(SERVER_URL, FACTORY_CONTRACT_ID, NETWORK_PASSPHRASE);

// Fund manager keypair (in production, use secure key management)
const fundManager = Keypair.fromSecret('SAFUND_MANAGER_SECRET_KEY_HERE'); // Replace with actual secret

/**
 * Main deployment function
 */
async function deployMultiAssetFund() {
  console.log('🚀 Starting Multi-Asset Fund Deployment...\n');

  try {
    // Deploy Real Estate Token
    const realEstateToken = await deployRealEstateAsset();
    console.log('✅ Real Estate Token deployed:', realEstateToken.address);

    // Deploy Commodity Token
    const commodityToken = await deployCommodityAsset();
    console.log('✅ Commodity Token deployed:', commodityToken.address);

    // Deploy Invoice Token
    const invoiceToken = await deployInvoiceAsset();
    console.log('✅ Invoice Token deployed:', invoiceToken.address);

    // Deploy Fund Token (Security token representing fund shares)
    const fundToken = await deployFundToken();
    console.log('✅ Fund Token deployed:', fundToken.address);

    // Display fund summary
    await displayFundSummary({
      realEstate: realEstateToken,
      commodity: commodityToken,
      invoice: invoiceToken,
      fund: fundToken
    });

    console.log('\n🎉 Multi-Asset Fund deployment completed successfully!');

  } catch (error) {
    console.error('❌ Deployment failed:', error);
    throw error;
  }
}

/**
 * Deploy Real Estate Token - Commercial Office Building
 */
async function deployRealEstateAsset() {
  console.log('🏢 Deploying Real Estate Token (Commercial Office Building)...');

  // Real estate specific configuration
  const realEstateConfig: RealEstateConfig = {
    property_address: '123 Main Street, New York, NY 10001',
    location_oracle: 'GBN2RX5GQK3WZQYNL5S5XK4KGOBZI2K3M6J5X2Q7J5V4K3R2T5Q', // Oracle contract
    rental_yield_rate: 650, // 6.5% annual yield in basis points
    property_management_voting: true,
    insurance_status: true,
    appraisal_value: BigInt('500000000000') // $5M in cents (18 decimals)
  };

  // Base asset configuration
  const baseConfig: AssetConfig = {
    name: 'Manhattan Commercial Property',
    symbol: 'MCP',
    decimals: 18,
    total_supply: BigInt('500000000000000000000000'), // 500 tokens representing $5M property
    asset_class: AssetClass.RealEstate,
    compliance_rules: {
      kyc_required: true,
      accredited_investor_only: false,
      geographic_restrictions: [],
      holding_period_days: 90,
      transfer_limits: BigInt('10000000000000000000000') // 10 tokens max transfer
    },
    dividend_schedule: {
      frequency_days: 90, // Quarterly distributions
      next_distribution_date: Math.floor(Date.now() / 1000) + (90 * 86400),
      total_distributed: BigInt(0),
      is_active: true
    },
    metadata: {
      property_type: 'Commercial Office',
      square_footage: '25000',
      year_built: '2018',
      occupancy_rate: '95',
      location: 'Manhattan, NY',
      cap_rate: '6.5'
    }
  };

  // Estimate deployment cost
  const cost = await assetFactory.estimateDeploymentCost(AssetClass.RealEstate);
  console.log(`   💰 Estimated cost: ${cost.gas_cost_xlm} XLM, ${cost.estimated_time_seconds}s`);

  // Deploy the token
  return await assetFactory.deployRealEstateToken(fundManager, realEstateConfig, baseConfig);
}

/**
 * Deploy Commodity Token - Gold
 */
async function deployCommodityAsset() {
  console.log('🥇 Deploying Commodity Token (Gold)...');

  // Commodity specific configuration
  const commodityConfig: CommodityConfig = {
    commodity_type: 'Gold',
    vault_location: 'London Bullion Market Association Vault',
    custody_vault: 'GBL2RX5GQK3WZQYNL5S5XK4KGOBZI2K3M6J5X2Q7J5V4K3R2T5Q', // Vault contract
    purity_grade: '999', // 24K gold
    physical_redemption_window: 86400 * 30, // 30 days
    quality_attestation: 'GBC2RX5GQK3WZQYNL5S5XK4KGOBZI2K3M6J5X2Q7J5V4K3R2T5Q' // Attestation contract
  };

  // Base asset configuration
  const baseConfig: AssetConfig = {
    name: 'Stellar Gold Token',
    symbol: 'SGT',
    decimals: 18,
    total_supply: BigInt('100000000000000000000000'), // 100 tokens representing 100 oz of gold
    asset_class: AssetClass.Commodity,
    compliance_rules: {
      kyc_required: true,
      accredited_investor_only: false,
      geographic_restrictions: [],
      holding_period_days: 0,
      transfer_limits: BigInt('50000000000000000000000') // 50 tokens max transfer
    },
    metadata: {
      metal_type: 'Gold',
      purity: '24K',
      weight_per_token: '1 ounce',
      vault_certification: 'LBMA Certified',
      insurance_provider: 'Lloyd\'s of London',
      audit_frequency: 'Quarterly'
    }
  };

  // Estimate deployment cost
  const cost = await assetFactory.estimateDeploymentCost(AssetClass.Commodity);
  console.log(`   💰 Estimated cost: ${cost.gas_cost_xlm} XLM, ${cost.estimated_time_seconds}s`);

  // Deploy the token
  return await assetFactory.deployCommodityToken(fundManager, commodityConfig, baseConfig);
}

/**
 * Deploy Invoice Token - Trade Receivables
 */
async function deployInvoiceAsset() {
  console.log('📄 Deploying Invoice Token (Trade Receivables)...');

  // Invoice specific configuration
  const invoiceConfig: InvoiceConfig = {
    invoice_number: 'INV-2024-001',
    debtor_address: 'GDEBTOR_ADDRESS_HERE', // Debtor's Stellar address
    due_date: Math.floor(Date.now() / 1000) + (90 * 86400), // 90 days from now
    credit_rating: 'A',
    automatic_settlement: true,
    invoice_amount: BigInt('100000000000') // $1M in cents (18 decimals)
  };

  // Base asset configuration
  const baseConfig: AssetConfig = {
    name: 'Trade Receivables Portfolio',
    symbol: 'TRP',
    decimals: 18,
    total_supply: BigInt('100000000000000000000000'), // 100 tokens representing $1M receivables
    asset_class: AssetClass.Invoice,
    compliance_rules: {
      kyc_required: true,
      accredited_investor_only: true,
      geographic_restrictions: [],
      holding_period_days: 30,
      transfer_limits: BigInt('25000000000000000000000') // 25 tokens max transfer
    },
    dividend_schedule: {
      frequency_days: 30, // Monthly distributions
      next_distribution_date: Math.floor(Date.now() / 1000) + (30 * 86400),
      total_distributed: BigInt(0),
      is_active: true
    },
    metadata: {
      portfolio_type: 'Trade Receivables',
      debtor_industry: 'Technology',
      invoice_count: '15',
      average_invoice_age: '45 days',
      discount_rate: '5.0',
      collection_history: '98% collected'
    }
  };

  // Estimate deployment cost
  const cost = await assetFactory.estimateDeploymentCost(AssetClass.Invoice);
  console.log(`   💰 Estimated cost: ${cost.gas_cost_xlm} XLM, ${cost.estimated_time_seconds}s`);

  // Deploy the token
  return await assetFactory.deployInvoiceToken(fundManager, invoiceConfig, baseConfig);
}

/**
 * Deploy Fund Token - Security token representing fund shares
 */
async function deployFundToken() {
  console.log('💼 Deploying Fund Token (Security)...');

  // Security specific configuration
  const securityConfig: SecurityConfig = {
    equity_type: 'Preferred Equity',
    regulation_framework: 'REG_D',
    accreditation_required: true,
    holding_period_days: 365,
    regulatory_reporting: true,
    isin: 'US1234567890' // Example ISIN
  };

  // Base asset configuration
  const baseConfig: AssetConfig = {
    name: 'Stellar Multi-Asset Fund',
    symbol: 'SMAF',
    decimals: 18,
    total_supply: BigInt('100000000000000000000000'), // 100 fund shares
    asset_class: AssetClass.Security,
    compliance_rules: {
      kyc_required: true,
      accredited_investor_only: true,
      geographic_restrictions: ['US', 'CA', 'GB'],
      holding_period_days: 365,
      transfer_limits: BigInt('10000000000000000000000') // 10 shares max transfer
    },
    dividend_schedule: {
      frequency_days: 90, // Quarterly distributions
      next_distribution_date: Math.floor(Date.now() / 1000) + (90 * 86400),
      total_distributed: BigInt(0),
      is_active: true
    },
    metadata: {
      fund_type: 'Multi-Asset Real-World Asset Fund',
      fund_manager: 'Stellar RWA Management LLC',
      inception_date: new Date().toISOString().split('T')[0],
      nav_frequency: 'Daily',
      management_fee: '1.5',
      performance_fee: '20',
      minimum_investment: '100000'
    }
  };

  // Estimate deployment cost
  const cost = await assetFactory.estimateDeploymentCost(AssetClass.Security);
  console.log(`   💰 Estimated cost: ${cost.gas_cost_xlm} XLM, ${cost.estimated_time_seconds}s`);

  // Deploy the token
  return await assetFactory.deploySecurityToken(fundManager, 'Preferred Equity', 'REG_D', baseConfig);
}

/**
 * Display comprehensive fund summary
 */
async function displayFundSummary(assets: {
  realEstate: { address: string; transactionId: string };
  commodity: { address: string; transactionId: string };
  invoice: { address: string; transactionId: string };
  fund: { address: string; transactionId: string };
}) {
  console.log('\n📊 FUND SUMMARY');
  console.log('=' .repeat(50));

  // Asset Allocation
  console.log('\n🏛️  ASSET ALLOCATION:');
  console.log('   Real Estate (MCP):  50% - $5M Commercial Property');
  console.log('   Commodities (SGT):  30% - 100 oz Gold');
  console.log('   Invoices (TRP):    20% - $1M Trade Receivables');
  console.log('   Total Fund Value:  $7M');

  // Risk Profile
  console.log('\n⚠️  RISK PROFILE:');
  console.log('   Overall Risk: Medium');
  console.log('   Real Estate: Low-Medium (Stable cash flow)');
  console.log('   Commodities: Medium (Market volatility)');
  console.log('   Invoices: Medium-High (Credit risk)');

  // Expected Returns
  console.log('\n📈 EXPECTED RETURNS:');
  console.log('   Annual Target Return: 8-12%');
  console.log('   Real Estate Yield: 6.5% (rental income)');
  console.log('   Commodity Return: 5-8% (price appreciation)');
  console.log('   Invoice Yield: 10-12% (discount rate)');

  // Liquidity
  console.log('\n💧 LIQUIDITY:');
  console.log('   Real Estate: Low (90-day lockup)');
  console.log('   Commodities: Medium (Physical redemption)');
  console.log('   Invoices: Medium (Monthly settlements)');
  console.log('   Fund Shares: Low (365-day lockup)');

  // Transaction Details
  console.log('\n🔗 TRANSACTION DETAILS:');
  console.log(`   Real Estate Token: ${assets.realEstate.address}`);
  console.log(`   Commodity Token:  ${assets.commodity.address}`);
  console.log(`   Invoice Token:    ${assets.invoice.address}`);
  console.log(`   Fund Token:       ${assets.fund.address}`);

  // Total Deployment Cost
  console.log('\n💰 DEPLOYMENT COSTS:');
  const realEstateCost = await assetFactory.estimateDeploymentCost(AssetClass.RealEstate);
  const commodityCost = await assetFactory.estimateDeploymentCost(AssetClass.Commodity);
  const invoiceCost = await assetFactory.estimateDeploymentCost(AssetClass.Invoice);
  const fundCost = await assetFactory.estimateDeploymentCost(AssetClass.Security);
  
  const totalGasCost = realEstateCost.gas_cost_xlm + commodityCost.gas_cost_xlm + 
                      invoiceCost.gas_cost_xlm + fundCost.gas_cost_xlm;
  
  console.log(`   Total Gas Cost: ${totalGasCost.toFixed(3)} XLM`);
  console.log(`   Real Estate: ${realEstateCost.gas_cost_xlm} XLM`);
  console.log(`   Commodities: ${commodityCost.gas_cost_xlm} XLM`);
  console.log(`   Invoices: ${invoiceCost.gas_cost_xlm} XLM`);
  console.log(`   Fund Token: ${fundCost.gas_cost_xlm} XLM`);

  // Next Steps
  console.log('\n📋 NEXT STEPS:');
  console.log('   1. Verify token deployments on Stellar Explorer');
  console.log('   2. Initialize compliance and dividend contracts');
  console.log('   3. Set up oracle feeds for real estate valuations');
  console.log('   4. Configure automated dividend distributions');
  console.log('   5. Implement investor onboarding process');
  console.log('   6. Set up monitoring and alerting systems');
}

/**
 * Utility function to verify deployment
 */
async function verifyDeployment(tokenAddress: string, expectedSymbol: string) {
  try {
    const server = new Server(SERVER_URL);
    const account = await server.getAccount(tokenAddress);
    
    // In a real implementation, you would verify the token details
    console.log(`   ✅ Token ${expectedSymbol} verified at ${tokenAddress}`);
    return true;
  } catch (error) {
    console.error(`   ❌ Failed to verify ${expectedSymbol}:`, error);
    return false;
  }
}

/**
 * Emergency functions for fund management
 */
async function emergencyProcedures() {
  console.log('\n🚨 EMERGENCY PROCEDURES');
  console.log('   Available emergency actions:');
  console.log('   1. Pause all token transfers');
  console.log('   2. Emergency redemption processing');
  console.log('   3. Asset valuation adjustments');
  console.log('   4. Regulatory compliance actions');

  // Example: Emergency pause all assets
  try {
    const pauseTx = await assetFactory.emergencyPauseAll(fundManager);
    console.log(`   🛑 Emergency pause executed: ${pauseTx}`);
  } catch (error) {
    console.error('   ❌ Failed to execute emergency pause:', error);
  }
}

// Main execution
if (require.main === module) {
  deployMultiAssetFund()
    .then(() => {
      console.log('\n✨ Deployment completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Deployment failed:', error);
      process.exit(1);
    });
}

export {
  deployMultiAssetFund,
  deployRealEstateAsset,
  deployCommodityAsset,
  deployInvoiceAsset,
  deployFundToken,
  emergencyProcedures
};
