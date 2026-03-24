/**
 * Cross-Border Property Tokenization Example
 * 
 * This example demonstrates how to tokenize international real estate assets
 * with multi-jurisdictional compliance, currency conversion, and regulatory frameworks.
 */

import {
  StellarRWASDK,
  createStellarRWASDK,
  AssetType,
  Currency,
  VerificationLevel,
  Address,
} from '../sdk/src';

// Configuration for the example
const NETWORK = 'testnet';
/** Deploy RWA token WASM first, then set this contract ID. */
const EXAMPLE_RWA_TOKEN_CONTRACT = new Address(
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'
);
const PROPERTY_VALUE_EUR = '5000000'; // €5M property in Germany
const PROPERTY_VALUE_USD = '5500000'; // $5.5M equivalent (1.1 exchange rate)
const TOKEN_SUPPLY = '500000'; // 500K tokens
const TOKEN_PRICE_EUR = parseFloat(PROPERTY_VALUE_EUR) / parseFloat(TOKEN_SUPPLY); // €10 per token

async function crossBorderPropertyExample() {
  console.log('🌍 Starting Cross-Border Property Tokenization Example...\n');

  // Initialize SDK
  const sdk = createStellarRWASDK(NETWORK, {
    assetFactory: 'GC7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    complianceRegistry: 'GD7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    dividendDistributor: 'GE7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    secondaryMarket: 'GF7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    custodyValidator: 'GH7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
  });

  // Example addresses
  const propertyOwner = 'GAB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const usInvestor = 'GCB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const euInvestor = 'GDB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const asianInvestor = 'GEB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const complianceAdminEU = 'GFB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const complianceAdminUS = 'GHB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';

  try {
    // Step 1: Initialize compliance registry with multi-jurisdictional rules
    console.log('📋 Step 1: Initializing Multi-Jurisdictional Compliance...');
    await sdk.complianceClient.initialize(propertyOwner, complianceAdminEU, true, true);
    
    // Set up EU compliance rules (MiFID II)
    const mifidRule = {
      ruleId: 'mifid_ii',
      name: 'EU MiFID II Compliance',
      description: 'European Union financial instruments directive',
      isActive: true,
      jurisdictions: ['EU', 'DE', 'FR', 'IT', 'ES'],
      minVerificationLevel: VerificationLevel.ENHANCED,
      requiresAccreditation: false, // EU allows retail investors with proper disclosure
      maxAmount: '10000000' // €10M limit
    };
    
    // Set up US compliance rules (Reg S for foreign offerings)
    const regSRule = {
      ruleId: 'reg_s',
      name: 'Regulation S',
      description: 'Non-US offerings exemption',
      isActive: true,
      jurisdictions: ['US'],
      minVerificationLevel: VerificationLevel.ENHANCED,
      requiresAccreditation: true,
      maxAmount: '50000000' // $50M limit
    };
    
    await sdk.complianceClient.updateComplianceRule(complianceAdminEU, mifidRule);
    await sdk.complianceClient.updateComplianceRule(complianceAdminEU, regSRule);
    console.log('✅ Multi-jurisdictional compliance rules set up\n');

    // Step 2: Set up investor KYC for different jurisdictions
    console.log('🔍 Step 2: Setting up Multi-Jurisdictional Investor KYC...');
    
    // US Investor (needs accreditation for Reg S)
    await sdk.complianceClient.updateKYCStatus(complianceAdminUS, usInvestor, {
      isVerified: true,
      verificationLevel: VerificationLevel.INSTITUTIONAL,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 1,
      amlFlags: []
    });

    // EU Investor (MiFID II compliant)
    await sdk.complianceClient.updateKYCStatus(complianceAdminEU, euInvestor, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'DE',
      isAccredited: false, // Not required in EU
      riskScore: 2,
      amlFlags: [],
      mifidClassification: 'retail',
      riskAppetite: 'moderate',
      knowledgeExperience: 'experienced'
    });

    // Asian Investor (high net worth individual)
    await sdk.complianceClient.updateKYCStatus(complianceAdminEU, asianInvestor, {
      isVerified: true,
      verificationLevel: VerificationLevel.INSTITUTIONAL,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'SG', // Singapore
      isAccredited: true,
      riskScore: 2,
      amlFlags: [],
      netWorth: '5000000', // $5M net worth
      annualIncome: '1000000' // $1M annual income
    });
    console.log('✅ Multi-jurisdictional KYC completed\n');

    // Step 3: Deploy cross-border property token
    console.log('🏢 Step 3: Deploying Cross-Border Property Token...');
    const propertyTokenDeployment = await sdk.assetFactory.deployRWAToken(propertyOwner, {
      tokenContract: EXAMPLE_RWA_TOKEN_CONTRACT,
      name: 'Berlin Commercial Complex',
      symbol: 'BCC',
      totalSupply: TOKEN_SUPPLY,
      decimals: 8,
      assetType: AssetType.REAL_ESTATE,
      metadata: {
        property_address: 'Kurfürstendamm 1, 10719 Berlin, Germany',
        property_type: 'commercial_mixed_use',
        square_footage: '150000',
        year_built: '2019',
        local_currency: 'EUR',
        property_value_eur: PROPERTY_VALUE_EUR,
        property_value_usd: PROPERTY_VALUE_USD,
        exchange_rate: '1.10', // EUR to USD
        jurisdiction: 'DE',
        local_regulations: 'German Real Estate Transfer Tax (3.5%)',
        foreign_investor_restrictions: 'none',
        tax_treaty: 'US-Germany Tax Treaty',
        property_management: 'JLL Germany',
        rental_income_eur: '300000', // €300K annual rental income
        occupancy_rate: '0.95',
        cap_rate: '0.06', // 6% cap rate
        noi_eur: '300000',
        property_tax_rate: '0.035', // 3.5% German property tax
        maintenance_reserve: '0.05' // 5% maintenance reserve
      },
      complianceRegistry: sdk.getConfig().contracts.complianceRegistry,
      dividendDistributor: sdk.getConfig().contracts.dividendDistributor
    });
    console.log(`✅ Cross-border property token deployed: ${propertyTokenDeployment.tokenAddress}\n`);

    // Step 4: Set up custody validator with international oracles
    console.log('🔒 Step 4: Setting up International Custody Validation...');
    await sdk.custodyValidator.initialize(propertyOwner, [
      'GC7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3', // EU oracle
      'GD7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3', // US oracle
      'GE7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3'  // Asia oracle
    ]);
    
    // Register international oracles
    await sdk.custodyValidator.registerOracle(propertyOwner, 
      'GC7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3', 
      'EuroLand Registry', 'DE');
    await sdk.custodyValidator.registerOracle(propertyOwner, 
      'GD7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3', 
      'US Property Valuation', 'US');
    console.log('✅ International custody validation set up\n');

    // Step 5: Create token client and distribute tokens
    console.log('💰 Step 5: Distributing Tokens to International Investors...');
    const tokenClient = sdk.createTokenClient(propertyTokenDeployment.tokenAddress);
    
    const usInvestorTokens = '50000'; // 10% for US investor
    const euInvestorTokens = '100000'; // 20% for EU investor
    const asianInvestorTokens = '75000'; // 15% for Asian investor
    
    await tokenClient.transfer(propertyOwner, usInvestor, usInvestorTokens);
    await tokenClient.transfer(propertyOwner, euInvestor, euInvestorTokens);
    await tokenClient.transfer(propertyOwner, asianInvestor, asianInvestorTokens);
    console.log(`✅ Distributed tokens to international investors\n`);

    // Step 6: Add to secondary market with currency support
    console.log('📈 Step 6: Adding Token to Secondary Market with Multi-Currency Support...');
    await sdk.marketClient.addSupportedToken(propertyOwner, propertyTokenDeployment.tokenAddress);
    console.log('✅ Token added to secondary market\n');

    // Step 7: Create multi-currency dividend distributions
    console.log('💸 Step 7: Creating Multi-Currency Dividend Distributions...');
    
    // EUR dividend for EU investors
    const eurDividend = await sdk.dividendClient.createDistribution(propertyOwner, {
      tokenAddress: propertyTokenDeployment.tokenAddress,
      currency: Currency.EURC,
      amount: '150000', // €150K quarterly rental income distribution
      claimDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      metadata: {
        distribution_type: 'rental_income',
        period: 'Q1 2024',
        currency: 'EUR',
        source: 'berlin_property',
        gross_rental_income: '300000',
        operating_expenses: '75000',
        net_operating_income: '225000',
        maintenance_reserve: '37500',
        distribution_amount: '150000',
        tax_withholding_rate: '0.15', // 15% withholding for non-EU investors
        tax_treaty_benefit: 'US-Germany Treaty (15% reduced from 20%)'
      }
    });
    console.log(`✅ EUR dividend distribution created: ${eurDividend.distributionId}`);

    // USD dividend for US investors (with tax withholding)
    const usdDividend = await sdk.dividendClient.createDistribution(propertyOwner, {
      tokenAddress: propertyTokenDeployment.tokenAddress,
      currency: Currency.USDC,
      amount: '148500', // $148.5K (€150K converted at 1.1 rate, minus 15% withholding)
      claimDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      metadata: {
        distribution_type: 'rental_income_converted',
        period: 'Q1 2024',
        currency: 'USD',
        exchange_rate: '1.10',
        gross_amount_usd: '165000', // €150K * 1.1
        tax_withholding_rate: '0.10', // 10% additional US tax
        net_amount_usd: '148500',
        total_tax_rate: '0.25' // 15% EU + 10% US
      }
    });
    console.log(`✅ USD dividend distribution created: ${usdDividend.distributionId}\n`);

    // Step 8: Investors claim dividends in their preferred currencies
    console.log('🎁 Step 8: Investors Claim Multi-Currency Dividends...');
    
    // EU investor claims EUR dividend
    const euDividendClaim = await sdk.dividendClient.claimDividend(euInvestor, eurDividend.distributionId);
    console.log(`✅ EU investor claimed EUR dividend: €${euDividendClaim.amountClaimed}`);

    // US investor claims USD dividend
    const usDividendClaim = await sdk.dividendClient.claimDividend(usInvestor, usdDividend.distributionId);
    console.log(`✅ US investor claimed USD dividend: $${usDividendClaim.amountClaimed}`);

    // Asian investor can choose either
    const asianDividendClaim = await sdk.dividendClient.claimDividend(asianInvestor, eurDividend.distributionId);
    console.log(`✅ Asian investor claimed EUR dividend: €${asianDividendClaim.amountClaimed}\n`);

    // Step 9: Create cross-border trading orders
    console.log('🔄 Step 9: Creating Cross-Border Trading Orders...');
    
    // EU investor places sell order in EUR
    const sellOrderEUR = await sdk.marketClient.createSellOrder(euInvestor, {
      tokenAddress: propertyTokenDeployment.tokenAddress,
      amount: '5000', // 5K tokens
      price: '10.50', // €10.50 per token (5% premium)
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        preferred_currency: 'EUR',
        settlement_currency: 'EUR',
        cross_border_fee: '0.02' // 2% cross-border fee
      }
    });
    console.log(`✅ EUR sell order created: ${sellOrderEUR.orderId}`);

    // US investor places buy order (will need currency conversion)
    const buyOrderUSD = await sdk.marketClient.createBuyOrder(usInvestor, {
      tokenAddress: propertyTokenDeployment.tokenAddress,
      amount: '2500', // 2.5K tokens
      price: '11.55', // $11.55 (€10.50 * 1.1 exchange rate)
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        preferred_currency: 'USD',
        settlement_currency: 'USD',
        exchange_rate: '1.10',
        cross_border_fee: '0.02'
      }
    });
    console.log(`✅ USD buy order created: ${buyOrderUSD.orderId}\n`);

    // Step 10: Match orders with currency conversion
    console.log('⚡ Step 10: Matching Orders with Currency Conversion...');
    await sdk.marketClient.matchOrders(propertyOwner, propertyTokenDeployment.tokenAddress);
    console.log('✅ Cross-border order matched with currency conversion\n');

    // Step 11: Generate tax and compliance reports
    console.log('📊 Step 11: Generating Tax and Compliance Reports...');
    
    const taxReport = {
      investor_jurisdictions: {
        'US': {
          investor: usInvestor,
          tax_rate: '0.25', // 25% total withholding
          treaty_benefit: 'US-Germany Tax Treaty',
          reporting_requirements: 'Form 8938 (FATCA)',
          currency: 'USD'
        },
        'DE': {
          investor: euInvestor,
          tax_rate: '0.15', // 15% withholding
          treaty_benefit: 'EU Tax Directive',
          reporting_requirements: 'DAC6 reporting',
          currency: 'EUR'
        },
        'SG': {
          investor: asianInvestor,
          tax_rate: '0.15', // 15% withholding
          treaty_benefit: 'Singapore-Germany DTA',
          reporting_requirements: 'CRS reporting',
          currency: 'EUR'
        }
      },
      total_distributions_eur: '150000',
      total_distributions_usd: '165000',
      total_tax_withheld_eur: '37500',
      total_tax_withheld_usd: '41250',
      net_distributions_eur: '112500',
      net_distributions_usd: '123750'
    };
    
    console.log('✅ Tax and compliance reports generated\n');

    // Step 12: Get international market statistics
    console.log('📈 Step 12: Getting International Market Statistics...');
    const marketStats = await sdk.marketClient.getMarketStats(propertyTokenDeployment.tokenAddress);
    console.log(`International Market Statistics:`);
    console.log(`  Total Orders: ${marketStats.totalOrders}`);
    console.log(`  Cross-Border Orders: ${Math.floor(marketStats.totalOrders * 0.6)}`); // Estimate
    console.log(`  Total Volume: $${marketStats.volume24h}`);
    console.log(`  Currency Distribution: 40% EUR, 35% USD, 25% Other\n`);

    console.log('🎉 Cross-Border Property Tokenization Example Completed Successfully!');

    return {
      tokenAddress: propertyTokenDeployment.tokenAddress,
      propertyValueEUR: PROPERTY_VALUE_EUR,
      propertyValueUSD: PROPERTY_VALUE_USD,
      tokenSupply: TOKEN_SUPPLY,
      tokenPriceEUR: TOKEN_PRICE_EUR,
      taxReport,
      marketStats
    };

  } catch (error) {
    console.error('❌ Error in cross-border property example:', error);
    throw error;
  }
}

// Additional utility functions for cross-border tokenization

async function calculateTaxWithholding(investorJurisdiction: string, assetJurisdiction: string, amount: string) {
  console.log('🧮 Calculating tax withholding...');
  
  // Tax treaty matrix (simplified)
  const taxTreaties: Record<string, Record<string, number>> = {
    'US': {
      'DE': 0.15, // US-Germany treaty: 15%
      'FR': 0.15, // US-France treaty: 15%
      'UK': 0.15, // US-UK treaty: 15%
      'JP': 0.10, // US-Japan treaty: 10%
      'SG': 0.15, // US-Singapore treaty: 15%
    },
    'DE': {
      'US': 0.15,
      'UK': 0.10, // Germany-UK treaty: 10%
      'FR': 0.00, // Germany-France: 0% (EU)
      'IT': 0.00, // Germany-Italy: 0% (EU)
    },
    'SG': {
      'US': 0.15,
      'DE': 0.15,
      'JP': 0.10, // Singapore-Japan treaty: 10%
      'AU': 0.10, // Singapore-Australia treaty: 10%
    }
  };
  
  const defaultWithholding = 0.30; // 30% default withholding
  const treatyRate = taxTreaties[investorJurisdiction]?.[assetJurisdiction] || defaultWithholding;
  
  const grossAmount = parseFloat(amount);
  const withholdingAmount = grossAmount * treatyRate;
  const netAmount = grossAmount - withholdingAmount;
  
  return {
    grossAmount,
    withholdingRate: treatyRate,
    withholdingAmount,
    netAmount,
    treatyBenefit: treatyRate < defaultWithholding
  };
}

async function convertCurrency(amount: string, fromCurrency: string, toCurrency: string, exchangeRate: number) {
  console.log(`💱 Converting ${amount} ${fromCurrency} to ${toCurrency}...`);
  
  const sourceAmount = parseFloat(amount);
  
  if (fromCurrency === toCurrency) {
    return {
      sourceAmount,
      targetAmount: sourceAmount,
      exchangeRate: 1.0,
      conversionFee: 0
    };
  }
  
  // Apply conversion fee (typically 0.5-1%)
  const conversionFeeRate = 0.01;
  const conversionFee = sourceAmount * conversionFeeRate;
  const netAmount = sourceAmount - conversionFee;
  
  let targetAmount: number;
  
  if (fromCurrency === 'EUR' && toCurrency === 'USD') {
    targetAmount = netAmount * exchangeRate;
  } else if (fromCurrency === 'USD' && toCurrency === 'EUR') {
    targetAmount = netAmount / exchangeRate;
  } else {
    // For other conversions, would need actual FX rates
    targetAmount = netAmount * exchangeRate;
  }
  
  return {
    sourceAmount,
    targetAmount,
    exchangeRate,
    conversionFee,
    netAmount
  };
}

async function validateCrossBorderTransfer(fromJurisdiction: string, toJurisdiction: string, amount: string) {
  console.log(`🔍 Validating cross-border transfer from ${fromJurisdiction} to ${toJurisdiction}...`);
  
  // Check for sanctions
  const sanctionedCountries = ['IR', 'KP', 'CU', 'SY'];
  if (sanctionedCountries.includes(fromJurisdiction) || sanctionedCountries.includes(toJurisdiction)) {
    throw new Error('Transfer not allowed due to sanctions');
  }
  
  // Check for capital controls
  const capitalControlLimits: Record<string, number> = {
    'CN': 50000, // China: $50K annual limit
    'IN': 250000, // India: $250K annual limit
    'BR': 100000, // Brazil: $100K annual limit
  };
  
  const transferAmount = parseFloat(amount);
  const limit = capitalControlLimits[toJurisdiction] || Infinity;
  
  if (transferAmount > limit) {
    throw new Error(`Transfer amount exceeds capital control limit for ${toJurisdiction}: $${limit}`);
  }
  
  // Check for AML/KYC requirements
  const enhancedDueDiligenceThreshold = 10000; // $10K
  if (transferAmount > enhancedDueDiligenceThreshold) {
    console.log('⚠️ Enhanced due diligence required for transfer amount');
    return {
      allowed: true,
      enhancedDueDiligence: true,
      additionalDocumentation: ['source_of_funds', 'purpose_of_transfer', 'beneficial_owner']
    };
  }
  
  return {
    allowed: true,
    enhancedDueDiligence: false,
    additionalDocumentation: []
  };
}

// Run the example
if (require.main === module) {
  crossBorderPropertyExample()
    .then((result) => {
      console.log('\n📋 Example Results:');
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error('Example failed:', error);
      process.exit(1);
    });
}

export {
  crossBorderPropertyExample,
  calculateTaxWithholding,
  convertCurrency,
  validateCrossBorderTransfer
};
