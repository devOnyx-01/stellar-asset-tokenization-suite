/**
 * Commodity Vault Tokenization Example
 * 
 * This example demonstrates how to tokenize physical commodities (gold, oil, etc.)
 * using the Stellar RWA Suite with comprehensive custody verification.
 */

import { 
  StellarRWASDK, 
  createStellarRWASDK, 
  AssetType, 
  Currency,
  VerificationLevel
} from '../sdk/src';

// Configuration for the example
const NETWORK = 'testnet';
const GOLD_OUNCES = '1000'; // 1000 ounces of gold
const GOLD_VALUE_PER_OUNCE = '2000'; // $2000 per ounce
const TOTAL_GOLD_VALUE = (parseFloat(GOLD_OUNCES) * parseFloat(GOLD_VALUE_PER_OUNCE)).toString();

async function commodityVaultTokenizationExample() {
  console.log('🏆 Starting Commodity Vault Tokenization Example...\n');

  // Initialize SDK
  const sdk = createStellarRWASDK(NETWORK, {
    assetFactory: 'GC7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    complianceRegistry: 'GD7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    dividendDistributor: 'GE7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    secondaryMarket: 'GF7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    custodyValidator: 'GH7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
  });

  // Example addresses
  const vaultOperator = 'GAB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const investor1 = 'GCB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const investor2 = 'GDB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const complianceAdmin = 'GEB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const oracleAddress = 'GFB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';

  try {
    // Step 1: Initialize compliance registry
    console.log('📋 Step 1: Initializing Compliance Registry...');
    await sdk.complianceClient.initialize(vaultOperator, complianceAdmin, true, true);
    console.log('✅ Compliance registry initialized\n');

    // Step 2: Set up custody validator with oracle
    console.log('🔒 Step 2: Setting up Custody Validator...');
    await sdk.custodyValidator.initialize(vaultOperator, [oracleAddress]);
    
    // Register oracle for gold verification
    await sdk.custodyValidator.registerOracle(vaultOperator, oracleAddress, 'GoldVault Oracle', 'US');
    console.log('✅ Custody validator and oracle registered\n');

    // Step 3: Register the commodity asset
    console.log('🏆 Step 3: Registering Commodity Asset...');
    const assetRegistration = {
      assetAddress: '', // Will be set after token deployment
      assetType: AssetType.COMMODITY,
      legalIdentifier: 'GOLD-VAULT-001',
      jurisdiction: 'US',
      custodyRequirements: ['physical_audit', 'insurance_verification', 'storage_certification'],
      verificationFrequency: 86400 * 7, // Weekly verification
      requiredOracles: 1,
      lastVerified: new Date(),
      isActive: true
    };
    console.log('✅ Commodity asset registered\n');

    // Step 4: Deploy the commodity token
    console.log('🪙 Step 4: Deploying Gold-Backed Token...');
    const tokenDeployment = await sdk.assetFactory.deployRWAToken(vaultOperator, {
      name: 'Gold Vault Token',
      symbol: 'GVT',
      totalSupply: GOLD_OUNCES, // 1 token = 1 ounce of gold
      decimals: 8, // Higher precision for commodities
      assetType: AssetType.COMMODITY,
      metadata: {
        commodity_type: 'gold',
        backing_type: 'physical',
        total_ounces: GOLD_OUNCES,
        vault_location: 'Zurich, Switzerland',
        vault_certification: 'LBMA Certified',
        insurance_provider: 'Zurich Insurance',
        insurance_coverage: TOTAL_GOLD_VALUE,
        audit_frequency: 'weekly',
        storage_type: 'allocated',
        purity: '0.9999', // 24K gold
        refinery: 'Valcambi',
        serial_numbers: 'GVT-001-001 to GVT-001-1000'
      },
      complianceRegistry: sdk.getConfig().contracts.complianceRegistry,
      dividendDistributor: sdk.getConfig().contracts.dividendDistributor
    });
    console.log(`✅ Gold token deployed: ${tokenDeployment.tokenAddress}\n`);

    // Update asset registration with token address
    assetRegistration.assetAddress = tokenDeployment.tokenAddress;

    // Step 5: Submit custody proof
    console.log('🔍 Step 5: Submitting Custody Proof...');
    const custodyProof = {
      proofId: 1,
      assetAddress: tokenDeployment.tokenAddress,
      assetType: AssetType.COMMODITY,
      custodyProvider: oracleAddress,
      verificationTimestamp: new Date(),
      expiryTimestamp: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      assetValue: TOTAL_GOLD_VALUE,
      assetLocation: 'Zurich, Switzerland',
      legalTitle: 'Gold Vault Certificate #001',
      insuranceCoverage: TOTAL_GOLD_VALUE,
      auditReportHash: '0x1234567890abcdef1234567890abcdef12345678',
      oracleSignatures: ['0xabcdef1234567890abcdef1234567890abcdef12'],
      metadata: {
        audit_date: new Date().toISOString(),
        auditor: 'SGS Switzerland',
        vault_id: 'ZRH-001',
        bar_count: '20',
        total_weight_kg: (parseFloat(GOLD_OUNCES) * 31.1035).toString() // Convert to kg
      },
      isValid: true
    };
    
    const proofId = await sdk.custodyValidator.submitCustodyProof(vaultOperator, custodyProof);
    console.log(`✅ Custody proof submitted: ${proofId}\n`);

    // Step 6: Set up investor KYC
    console.log('🔍 Step 6: Setting up Investor KYC...');
    await sdk.complianceClient.updateKYCStatus(complianceAdmin, investor1, {
      isVerified: true,
      verificationLevel: VerificationLevel.INSTITUTIONAL,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 1, // Low risk for institutional
      amlFlags: []
    });

    await sdk.complianceClient.updateKYCStatus(complianceAdmin, investor2, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'UK',
      isAccredited: true,
      riskScore: 2,
      amlFlags: []
    });
    console.log('✅ Investor KYC completed\n');

    // Step 7: Distribute tokens to investors
    console.log('💰 Step 7: Distributing Tokens to Investors...');
    const tokenClient = sdk.createTokenClient(tokenDeployment.tokenAddress);
    
    await tokenClient.transfer(vaultOperator, investor1, '100'); // 100 ounces
    await tokenClient.transfer(vaultOperator, investor2, '50');  // 50 ounces
    console.log('✅ Tokens distributed to investors\n');

    // Step 8: Add to secondary market
    console.log('📈 Step 8: Adding Token to Secondary Market...');
    await sdk.marketClient.addSupportedToken(vaultOperator, tokenDeployment.tokenAddress);
    console.log('✅ Token added to secondary market\n');

    // Step 9: Create storage fee dividend (negative dividend representing fees)
    console.log('💸 Step 9: Creating Storage Fee Distribution...');
    const storageFeeDistribution = await sdk.dividendClient.createDistribution(vaultOperator, {
      tokenAddress: tokenDeployment.tokenAddress,
      currency: Currency.USDC,
      amount: '5000', // $5,000 monthly storage fee
      claimDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: {
        distribution_type: 'storage_fee',
        period: 'January 2024',
        fee_type: 'vault_storage',
        fee_per_ounce: '5.00',
        vault_location: 'Zurich'
      }
    });
    console.log(`✅ Storage fee distribution created: ${storageFeeDistribution.distributionId}\n`);

    // Step 10: Create trading orders
    console.log('🔄 Step 10: Creating Market Orders...');
    
    // Investor 1 places a sell order at premium
    const sellOrder = await sdk.marketClient.createSellOrder(investor1, {
      tokenAddress: tokenDeployment.tokenAddress,
      amount: '10', // 10 ounces
      price: '2050', // $50 premium per ounce
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`✅ Sell order created: ${sellOrder.orderId}`);

    // Investor 2 places a buy order
    const buyOrder = await sdk.marketClient.createBuyOrder(investor2, {
      tokenAddress: tokenDeployment.tokenAddress,
      amount: '5', // 5 ounces
      price: '2025', // $25 premium
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`✅ Buy order created: ${buyOrder.orderId}\n`);

    // Step 11: Match orders
    console.log('⚡ Step 11: Matching Orders...');
    await sdk.marketClient.matchOrders(vaultOperator, tokenDeployment.tokenAddress);
    console.log('✅ Orders matched and trade executed\n');

    // Step 12: Verify custody status
    console.log('🔒 Step 12: Verifying Custody Status...');
    const isCustodyValid = await sdk.custodyValidator.isCustodyValid(tokenDeployment.tokenAddress);
    console.log(`✅ Custody valid: ${isCustodyValid}`);

    const latestProof = await sdk.custodyValidator.getLatestProof(tokenDeployment.tokenAddress);
    if (latestProof) {
      console.log(`Latest proof: ${latestProof.proofId}, Valid: ${latestProof.isValid}`);
      console.log(`Asset value: $${latestProof.assetValue}`);
      console.log(`Verification: ${latestProof.verificationTimestamp}`);
    }
    console.log('');

    // Step 13: Get oracle information
    console.log('🔮 Step 13: Getting Oracle Information...');
    const oracleInfo = await sdk.custodyValidator.getOracleInfo(oracleAddress);
    console.log(`Oracle: ${oracleInfo.name}`);
    console.log(`Jurisdiction: ${oracleInfo.jurisdiction}`);
    console.log(`Reputation Score: ${oracleInfo.reputationScore}`);
    console.log(`Total Verifications: ${oracleInfo.totalVerifications}`);
    console.log('');

    console.log('🎉 Commodity Vault Tokenization Example Completed Successfully!');

    return {
      tokenAddress: tokenDeployment.tokenAddress,
      totalSupply: GOLD_OUNCES,
      totalValue: TOTAL_GOLD_VALUE,
      backingPerToken: GOLD_VALUE_PER_OUNCE,
      custodyProofId: proofId,
      isCustodyValid,
      oracleInfo
    };

  } catch (error) {
    console.error('❌ Error in commodity vault tokenization example:', error);
    throw error;
  }
}

// Additional utility functions for commodity tokenization

async function auditCommodity(sdk: StellarRWASDK, tokenAddress: string, auditData: any) {
  console.log('🔍 Conducting commodity audit...');
  
  // In a real implementation, this would:
  // 1. Physical verification of commodity
  // 2. Weight and purity testing
  // 3. Serial number verification
  // 4. Storage condition check
  
  const auditProof = {
    proofId: Date.now(),
    assetAddress: tokenAddress,
    assetType: AssetType.COMMODITY,
    custodyProvider: auditData.auditor,
    verificationTimestamp: new Date(),
    expiryTimestamp: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    assetValue: auditData.totalValue,
    assetLocation: auditData.location,
    legalTitle: auditData.certificateNumber,
    insuranceCoverage: auditData.insuranceValue,
    auditReportHash: auditData.reportHash,
    oracleSignatures: auditData.signatures,
    metadata: {
      audit_date: new Date().toISOString(),
      auditor: auditData.auditor,
      physical_count: auditData.physicalCount,
      measured_weight: auditData.measuredWeight,
      purity_test: auditData.purityResult,
      storage_condition: auditData.storageCondition,
      temperature: auditData.temperature,
      humidity: auditData.humidity
    },
    isValid: true
  };
  
  const proofId = await sdk.custodyValidator.submitCustodyProof(
    auditData.vaultOperator, 
    auditProof
  );
  
  console.log(`✅ Audit completed: ${proofId}`);
  return proofId;
}

async function calculateStorageFees(totalOunces: string, feePerOunce: string) {
  const total = parseFloat(totalOunces) * parseFloat(feePerOunce);
  return {
    monthlyFee: total,
    annualFee: total * 12,
    dailyFee: total / 30
  };
}

async function verifyInsuranceCoverage(sdk: StellarRWASDK, tokenAddress: string, coverageData: any) {
  console.log('🛡️ Verifying insurance coverage...');
  
  // In a real implementation, this would:
  // 1. Verify insurance policy
  // 2. Check coverage amount
  // 3. Validate policy dates
  // 4. Confirm coverage for specific risks
  
  const requiredCoverage = parseFloat(coverageData.assetValue);
  const actualCoverage = parseFloat(coverageData.insuranceAmount);
  const coverageRatio = actualCoverage / requiredCoverage;
  
  if (coverageRatio < 1.0) {
    throw new Error(`Insufficient insurance coverage: ${(coverageRatio * 100).toFixed(2)}% of required amount`);
  }
  
  console.log(`✅ Insurance coverage verified: ${(coverageRatio * 100).toFixed(2)}% coverage`);
  return coverageRatio;
}

// Run the example
if (require.main === module) {
  commodityVaultTokenizationExample()
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
  commodityVaultTokenizationExample,
  auditCommodity,
  calculateStorageFees,
  verifyInsuranceCoverage
};
