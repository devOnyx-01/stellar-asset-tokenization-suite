/**
 * Real Estate Tokenization Example
 * 
 * This example demonstrates how to tokenize a commercial property using the Stellar RWA Suite.
 * It shows the complete workflow from property registration to token deployment and trading.
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
const NETWORK = 'testnet'; // Use testnet for examples
/** Deploy RWA token WASM first, then set this contract ID. */
const EXAMPLE_RWA_TOKEN_CONTRACT = new Address(
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4'
);
const PROPERTY_VALUE = '10000000'; // $10M property
const TOKEN_SUPPLY = '1000000'; // 1M tokens representing ownership
const TOKEN_PRICE = parseFloat(PROPERTY_VALUE) / parseFloat(TOKEN_SUPPLY); // $10 per token

async function realEstateTokenizationExample() {
  console.log('🏢 Starting Real Estate Tokenization Example...\n');

  // Initialize SDK
  const sdk = createStellarRWASDK(NETWORK, {
    assetFactory: 'GC7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    complianceRegistry: 'GD7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    dividendDistributor: 'GE7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    secondaryMarket: 'GF7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    custodyValidator: 'GH7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
  });

  // Example addresses (in production, these would be real Stellar addresses)
  const propertyOwner = 'GAB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const investor1 = 'GCB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const investor2 = 'GDB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const complianceAdmin = 'GEB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';

  try {
    // Step 1: Initialize compliance registry
    console.log('📋 Step 1: Initializing Compliance Registry...');
    await sdk.complianceClient.initialize(
      propertyOwner,
      complianceAdmin,
      true, // KYC required
      true  // Transfer restrictions enabled
    );
    console.log('✅ Compliance registry initialized\n');

    // Step 2: Set up KYC for investors
    console.log('🔍 Step 2: Setting up KYC for Investors...');
    await sdk.complianceClient.updateKYCStatus(complianceAdmin, investor1, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 2,
      amlFlags: []
    });

    await sdk.complianceClient.updateKYCStatus(complianceAdmin, investor2, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 3,
      amlFlags: []
    });
    console.log('✅ KYC setup completed\n');

    // Step 3: Deploy the RWA token for the property
    console.log('🏠 Step 3: Deploying Real Estate Token...');
    const tokenDeployment = await sdk.assetFactory.deployRWAToken(propertyOwner, {
      tokenContract: EXAMPLE_RWA_TOKEN_CONTRACT,
      name: 'Manhattan Office Tower',
      symbol: 'MOT',
      totalSupply: TOKEN_SUPPLY,
      decimals: 18,
      assetType: AssetType.REAL_ESTATE,
      metadata: {
        property_address: '350 Fifth Avenue, New York, NY 10118',
        property_type: 'Commercial Office Building',
        square_footage: '500000',
        year_built: '2018',
        appraisal_value: PROPERTY_VALUE,
        cap_rate: '0.065', // 6.5% cap rate
        noi: '650000', // Net Operating Income $650K
        location_score: '95', // Prime location score
        lease_term: '10',
        occupancy_rate: '0.92'
      },
      complianceRegistry: sdk.getConfig().contracts.complianceRegistry,
      dividendDistributor: sdk.getConfig().contracts.dividendDistributor
    });
    console.log(`✅ Token deployed: ${tokenDeployment.tokenAddress}\n`);

    // Step 4: Create token client
    const tokenClient = sdk.createTokenClient(tokenDeployment.tokenAddress);

    // Step 5: Distribute tokens to investors (simulating initial offering)
    console.log('💰 Step 4: Distributing Tokens to Investors...');
    const investor1Tokens = '100000'; // 10% for investor 1
    const investor2Tokens = '50000';  // 5% for investor 2
    
    await tokenClient.transfer(propertyOwner, investor1, investor1Tokens);
    await tokenClient.transfer(propertyOwner, investor2, investor2Tokens);
    console.log(`✅ Distributed ${investor1Tokens} tokens to investor 1`);
    console.log(`✅ Distributed ${investor2Tokens} tokens to investor 2\n`);

    // Step 6: Add token to secondary market
    console.log('📈 Step 5: Adding Token to Secondary Market...');
    await sdk.marketClient.addSupportedToken(propertyOwner, tokenDeployment.tokenAddress);
    console.log('✅ Token added to secondary market\n');

    // Step 7: Create quarterly dividend distribution
    console.log('💸 Step 6: Creating Quarterly Dividend Distribution...');
    const quarterlyDistribution = await sdk.dividendClient.createDistribution(propertyOwner, {
      tokenAddress: tokenDeployment.tokenAddress,
      currency: Currency.USDC,
      amount: '162500', // Quarterly dividend ($650K NOI / 4)
      claimDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      metadata: {
        distribution_type: 'quarterly',
        period: 'Q1 2024',
        source: 'rental_income',
        yield_percentage: '0.01625' // 1.625% quarterly yield
      }
    });
    console.log(`✅ Dividend distribution created: ${quarterlyDistribution.distributionId}\n`);

    // Step 8: Investors claim dividends
    console.log('🎁 Step 7: Investors Claim Dividends...');
    const investor1Claim = await sdk.dividendClient.claimDividend(investor1, quarterlyDistribution.distributionId);
    console.log(`✅ Investor 1 claimed dividends: ${investor1Claim.amountClaimed}`);

    const investor2Claim = await sdk.dividendClient.claimDividend(investor2, quarterlyDistribution.distributionId);
    console.log(`✅ Investor 2 claimed dividends: ${investor2Claim.amountClaimed}\n`);

    // Step 9: Create buy and sell orders in secondary market
    console.log('🔄 Step 8: Creating Market Orders...');
    
    // Investor 1 places a sell order
    const sellOrder = await sdk.marketClient.createSellOrder(investor1, {
      tokenAddress: tokenDeployment.tokenAddress,
      amount: '1000', // Sell 1,000 tokens
      price: '10.50', // Slightly above current price
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });
    console.log(`✅ Sell order created: ${sellOrder.orderId}`);

    // New investor places a buy order
    const buyOrder = await sdk.marketClient.createBuyOrder(investor2, {
      tokenAddress: tokenDeployment.tokenAddress,
      amount: '500', // Buy 500 tokens
      price: '10.50',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`✅ Buy order created: ${buyOrder.orderId}\n`);

    // Step 10: Match orders
    console.log('⚡ Step 9: Matching Orders...');
    await sdk.marketClient.matchOrders(propertyOwner, tokenDeployment.tokenAddress);
    console.log('✅ Orders matched and trade executed\n');

    // Step 11: Get portfolio overview for investor 1
    console.log('📊 Step 10: Getting Portfolio Overview...');
    const portfolio = await sdk.getUserPortfolio(investor1);
    console.log(`Investor 1 Portfolio:`);
    console.log(`  Total Value: $${portfolio.totalValue}`);
    console.log(`  Total Dividends: $${portfolio.totalDividends}`);
    console.log(`  Voting Power: ${portfolio.votingPower}`);
    console.log(`  Number of Assets: ${portfolio.assets.length}\n`);

    // Step 12: Get market statistics
    console.log('📈 Step 11: Getting Market Statistics...');
    const marketStats = await sdk.marketClient.getMarketStats(tokenDeployment.tokenAddress);
    console.log(`Market Statistics:`);
    console.log(`  Total Orders: ${marketStats.totalOrders}`);
    console.log(`  Active Orders: ${marketStats.activeOrders}`);
    console.log(`  Total Trades: ${marketStats.totalTrades}`);
    console.log(`  24h Volume: $${marketStats.volume24h}`);
    console.log(`  Average Price: $${marketStats.avgPrice}`);
    console.log(`  Spread: $${marketStats.spread}\n`);

    console.log('🎉 Real Estate Tokenization Example Completed Successfully!');
    
    return {
      tokenAddress: tokenDeployment.tokenAddress,
      totalSupply: TOKEN_SUPPLY,
      propertyValue: PROPERTY_VALUE,
      tokenPrice: TOKEN_PRICE,
      marketStats,
      portfolio
    };

  } catch (error) {
    console.error('❌ Error in real estate tokenization example:', error);
    throw error;
  }
}

// Additional utility functions for real estate tokenization

async function validateProperty(propertyData: any) {
  console.log('🔍 Validating property data...');
  
  // In a real implementation, this would:
  // 1. Verify property documents
  // 2. Check legal ownership
  // 3. Validate appraisal
  // 4. Confirm zoning and permits
  
  const requiredFields = [
    'property_address',
    'property_type',
    'square_footage',
    'year_built',
    'appraisal_value',
    'cap_rate'
  ];
  
  for (const field of requiredFields) {
    if (!propertyData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  console.log('✅ Property validation passed');
  return true;
}

async function setupCustodyProof(sdk: StellarRWASDK, tokenAddress: string, propertyData: any) {
  console.log('🔒 Setting up custody proof...');
  
  // In a real implementation, this would:
  // 1. Register the property with custody validator
  // 2. Submit legal documents
  // 3. Create verification proof
  
  const custodyRegistration = {
    assetAddress: tokenAddress,
    assetType: AssetType.REAL_ESTATE,
    legalIdentifier: propertyData.property_address,
    jurisdiction: 'US',
    custodyRequirements: ['title_insurance', 'property_insurance', 'legal_verification'],
    verificationFrequency: 86400 * 30, // Monthly verification
    requiredOracles: 3,
    lastVerified: new Date(),
    isActive: true
  };
  
  console.log('✅ Custody proof setup completed');
  return custodyRegistration;
}

async function calculatePropertyYield(propertyData: any) {
  const noi = parseFloat(propertyData.noi);
  const value = parseFloat(propertyData.appraisal_value);
  const capRate = parseFloat(propertyData.cap_rate);
  
  return {
    annualYield: (noi / value) * 100,
    quarterlyYield: ((noi / value) * 100) / 4,
    monthlyYield: ((noi / value) * 100) / 12,
    capRate: capRate * 100
  };
}

// Run the example
if (require.main === module) {
  realEstateTokenizationExample()
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
  realEstateTokenizationExample,
  validateProperty,
  setupCustodyProof,
  calculatePropertyYield
};
