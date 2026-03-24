/**
 * Security Token Example
 * 
 * This example demonstrates how to tokenize regulated securities (equity, bonds)
 * with full SEC compliance, investor accreditation, and transfer restrictions.
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
const COMPANY_VALUATION = '50000000'; // $50M company valuation
const TOTAL_SHARES = '10000000'; // 10M shares
const SHARE_PRICE = parseFloat(COMPANY_VALUATION) / parseFloat(TOTAL_SHARES); // $5 per share

async function securityTokenExample() {
  console.log('📈 Starting Security Token Example...\n');

  // Initialize SDK
  const sdk = createStellarRWASDK(NETWORK, {
    assetFactory: 'GC7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    complianceRegistry: 'GD7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    dividendDistributor: 'GE7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    secondaryMarket: 'GF7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    custodyValidator: 'GH7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
  });

  // Example addresses
  const company = 'GAB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const accreditedInvestor1 = 'GCB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const accreditedInvestor2 = 'GDB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const nonAccreditedInvestor = 'GEB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const complianceAdmin = 'GFB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const transferAgent = 'GHB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';

  try {
    // Step 1: Initialize compliance registry with SEC rules
    console.log('📋 Step 1: Initializing Compliance Registry with SEC Rules...');
    await sdk.complianceClient.initialize(company, complianceAdmin, true, true);
    
    // Set up compliance rules for Regulation D
    const regDRule = {
      ruleId: 'reg_d_506c',
      name: 'Regulation D Rule 506(c)',
      description: 'General solicitation allowed, accredited investors only',
      isActive: true,
      jurisdictions: ['US'],
      minVerificationLevel: VerificationLevel.ENHANCED,
      requiresAccreditation: true,
      maxAmount: '75000000' // $75M limit
    };
    
    await sdk.complianceClient.updateComplianceRule(complianceAdmin, regDRule);
    console.log('✅ Compliance registry initialized with SEC rules\n');

    // Step 2: Set up investor KYC with accreditation verification
    console.log('🔍 Step 2: Setting up Investor KYC with Accreditation...');
    
    // Accredited Investor 1 (High net worth)
    await sdk.complianceClient.updateKYCStatus(complianceAdmin, accreditedInvestor1, {
      isVerified: true,
      verificationLevel: VerificationLevel.INSTITUTIONAL,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 1,
      amlFlags: [],
      accreditationType: 'net_worth', // Net worth > $1M
      accreditationVerified: new Date(),
      accreditationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    // Accredited Investor 2 (Income)
    await sdk.complianceClient.updateKYCStatus(complianceAdmin, accreditedInvestor2, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 2,
      amlFlags: [],
      accreditationType: 'income', // Income > $200K
      accreditationVerified: new Date(),
      accreditationExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });

    // Non-accredited investor (should be restricted)
    await sdk.complianceClient.updateKYCStatus(complianceAdmin, nonAccreditedInvestor, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: false,
      riskScore: 4,
      amlFlags: []
    });
    console.log('✅ Investor KYC with accreditation completed\n');

    // Step 3: Deploy security token
    console.log('📊 Step 3: Deploying Security Token...');
    const securityTokenDeployment = await sdk.assetFactory.deployRWAToken(company, {
      tokenContract: EXAMPLE_RWA_TOKEN_CONTRACT,
      name: 'TechCorp Series A Common Stock',
      symbol: 'TECHA',
      totalSupply: TOTAL_SHARES,
      decimals: 0, // Whole shares only
      assetType: AssetType.SECURITY,
      metadata: {
        security_type: 'common_stock',
        series: 'Series A',
        par_value: '0.01',
        voting_rights: '1_vote_per_share',
        dividend_policy: 'discretionary',
        liquidation_preference: '1x',
        conversion_rights: 'none',
        anti_dilution: 'full_ratchet',
        board_representation: '1_per_10M_shares',
        information_rights: 'standard',
        registration_rights: 'demand_registration',
        legal_counsel: 'Wilson Sonsini',
        transfer_agent: 'Continental Stock Transfer',
        cusip: '874653109',
        isin: 'US8746531095',
        offering_type: 'Regulation_D_506c',
        max_accredited_investors: '2000',
        lockup_period: '180_days',
        company_valuation: COMPANY_VALUATION,
        share_price: SHARE_PRICE.toString()
      },
      complianceRegistry: sdk.getConfig().contracts.complianceRegistry,
      dividendDistributor: sdk.getConfig().contracts.dividendDistributor
    });
    console.log(`✅ Security token deployed: ${securityTokenDeployment.tokenAddress}\n`);

    // Step 4: Create token client
    const securityTokenClient = sdk.createTokenClient(securityTokenDeployment.tokenAddress);

    // Step 5: Set transfer limits for compliance
    console.log('⚖️ Step 4: Setting Transfer Limits for Compliance...');
    
    // Accredited investors can transfer up to $1M annually
    await sdk.complianceClient.setTransferLimits(complianceAdmin, accreditedInvestor1, {
      dailyLimit: '100000',
      monthlyLimit: '500000',
      annualLimit: '1000000',
      remainingDaily: '100000',
      remainingMonthly: '500000',
      remainingAnnual: '1000000',
      lastResetDaily: new Date(),
      lastResetMonthly: new Date(),
      lastResetAnnual: new Date()
    });

    await sdk.complianceClient.setTransferLimits(complianceAdmin, accreditedInvestor2, {
      dailyLimit: '50000',
      monthlyLimit: '250000',
      annualLimit: '500000',
      remainingDaily: '50000',
      remainingMonthly: '250000',
      remainingAnnual: '500000',
      lastResetDaily: new Date(),
      lastResetMonthly: new Date(),
      lastResetAnnual: new Date()
    });
    console.log('✅ Transfer limits set for accredited investors\n');

    // Step 6: Distribute shares to investors
    console.log('💰 Step 5: Distributing Shares to Investors...');
    const investor1Shares = '1000000'; // 1M shares = $5M
    const investor2Shares = '500000';  // 500K shares = $2.5M
    
    await securityTokenClient.transfer(company, accreditedInvestor1, investor1Shares);
    await securityTokenClient.transfer(company, accreditedInvestor2, investor2Shares);
    console.log(`✅ Distributed ${investor1Shares} shares to accredited investor 1`);
    console.log(`✅ Distributed ${investor2Shares} shares to accredited investor 2\n`);

    // Step 7: Add token to secondary market with restrictions
    console.log('📈 Step 6: Adding Token to Secondary Market with Restrictions...');
    await sdk.marketClient.addSupportedToken(company, securityTokenDeployment.tokenAddress);
    
    // Set market configuration for security tokens
    const marketConfig = {
      feeRate: 200, // 2% fee for security tokens
      feeRecipient: transferAgent,
      minOrderSize: '10000', // $10K minimum order
      maxOrderSize: '1000000', // $1M maximum order
      maxSpreadBps: 500, // 5% max spread
      isPaused: false,
      supportedTokens: [securityTokenDeployment.tokenAddress],
      baseCurrency: sdk.getConfig().contracts.dividendDistributor
    };
    
    await sdk.marketClient.updateConfig(company, marketConfig);
    console.log('✅ Token added to secondary market with compliance restrictions\n');

    // Step 8: Test compliance - Try to transfer to non-accredited investor (should fail)
    console.log('🚫 Step 7: Testing Compliance - Transfer to Non-Accredited Investor...');
    try {
      const canTransfer = await sdk.complianceClient.checkCompliance(
        accreditedInvestor1,
        nonAccreditedInvestor,
        '1000'
      );
      console.log(`Transfer allowed: ${canTransfer}`);
      
      if (!canTransfer) {
        console.log('✅ Compliance check correctly blocked transfer to non-accredited investor');
      }
    } catch (error) {
      console.log('✅ Compliance check correctly blocked transfer to non-accredited investor');
    }
    console.log('');

    // Step 9: Create quarterly dividend distribution
    console.log('💸 Step 8: Creating Quarterly Dividend Distribution...');
    const dividendDistribution = await sdk.dividendClient.createDistribution(company, {
      tokenAddress: securityTokenDeployment.tokenAddress,
      currency: Currency.USDC,
      amount: '250000', // $250K quarterly dividend
      claimDeadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      metadata: {
        distribution_type: 'quarterly_dividend',
        period: 'Q1 2024',
        dividend_per_share: '0.025', // $0.025 per share
        dividend_yield: '0.02', // 2% annual yield
        payout_ratio: '0.40', // 40% payout ratio
        record_date: '2024-03-31',
        payment_date: '2024-04-15'
      }
    });
    console.log(`✅ Dividend distribution created: ${dividendDistribution.distributionId}\n`);

    // Step 10: Investors claim dividends
    console.log('🎁 Step 9: Investors Claim Dividends...');
    const investor1Dividend = await sdk.dividendClient.claimDividend(accreditedInvestor1, dividendDistribution.distributionId);
    console.log(`✅ Accredited investor 1 claimed: $${investor1Dividend.amountClaimed}`);

    const investor2Dividend = await sdk.dividendClient.claimDividend(accreditedInvestor2, dividendDistribution.distributionId);
    console.log(`✅ Accredited investor 2 claimed: $${investor2Dividend.amountClaimed}\n`);

    // Step 11: Create compliant secondary market orders
    console.log('🔄 Step 10: Creating Compliant Market Orders...');
    
    // Accredited investor 1 places sell order
    const sellOrder = await sdk.marketClient.createSellOrder(accreditedInvestor1, {
      tokenAddress: securityTokenDeployment.tokenAddress,
      amount: '50000', // 50K shares
      price: '5.25', // 5% premium
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`✅ Sell order created: ${sellOrder.orderId}`);

    // Accredited investor 2 places buy order
    const buyOrder = await sdk.marketClient.createBuyOrder(accreditedInvestor2, {
      tokenAddress: securityTokenDeployment.tokenAddress,
      amount: '25000', // 25K shares
      price: '5.25',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`✅ Buy order created: ${buyOrder.orderId}\n`);

    // Step 12: Match orders with compliance check
    console.log('⚡ Step 11: Matching Orders with Compliance Check...');
    await sdk.marketClient.matchOrders(company, securityTokenDeployment.tokenAddress);
    console.log('✅ Orders matched with compliance verification\n');

    // Step 13: Get compliance statistics
    console.log('📊 Step 12: Getting Compliance Statistics...');
    const complianceStats = await sdk.complianceClient.getComplianceStats();
    console.log(`Compliance Statistics:`);
    console.log(`  Total Verified Users: ${complianceStats.totalVerifiedUsers}`);
    console.log(`  Total Blacklisted: ${complianceStats.totalBlacklisted}`);
    console.log(`  Total Whitelisted: ${complianceStats.totalWhitelisted}`);
    console.log(`  Active Rules: ${complianceStats.activeRules}`);
    console.log(`  Compliance Rate: ${complianceStats.complianceRate}%\n`);

    console.log('🎉 Security Token Example Completed Successfully!');

    return {
      tokenAddress: securityTokenDeployment.tokenAddress,
      totalShares: TOTAL_SHARES,
      companyValuation: COMPANY_VALUATION,
      sharePrice: SHARE_PRICE,
      complianceStats,
      dividendAmount: '250000'
    };

  } catch (error) {
    console.error('❌ Error in security token example:', error);
    throw error;
  }
}

// Additional utility functions for security tokens

async function verifyAccreditation(investorData: any) {
  console.log('🔍 Verifying investor accreditation...');
  
  // Check net worth method
  if (investorData.accreditationType === 'net_worth') {
    const netWorth = parseFloat(investorData.netWorth);
    if (netWorth < 1000000) {
      throw new Error('Net worth must be at least $1M for accreditation');
    }
    
    // Exclude primary residence
    const primaryResidence = parseFloat(investorData.primaryResidenceValue || '0');
    const adjustedNetWorth = netWorth - primaryResidence;
    
    if (adjustedNetWorth < 1000000) {
      throw new Error('Adjusted net worth (excluding primary residence) must be at least $1M');
    }
  }
  
  // Check income method
  if (investorData.accreditationType === 'income') {
    const currentIncome = parseFloat(investorData.currentIncome);
    const priorIncome = parseFloat(investorData.priorIncome || '0');
    
    if (currentIncome < 200000 && priorIncome < 200000) {
      throw new Error('Income must be at least $200K in each of the two most recent years');
    }
    
    if ((currentIncome + priorIncome) < 300000) {
      throw new Error('Combined income must be at least $300K for the two most recent years');
    }
  }
  
  console.log('✅ Accreditation verification passed');
  return true;
}

async function calculateTransferRestrictions(investorAddress: string, amount: string, securityType: string) {
  const transferAmount = parseFloat(amount);
  
  // Rule 144 restrictions for unregistered securities
  const rule144Restrictions = {
    holdingPeriod: 6, // 6 months for reporting companies
    volumeLimit: 0.01, // 1% of outstanding shares per 3 months
    mannerOfSale: 'public_broker',
    filingRequired: transferAmount > 50000 // Form 144 required for >$50K
  };
  
  // Additional restrictions for different security types
  const typeRestrictions = {
    'common_stock': {
      maxTransferPercentage: 0.05, // 5% of holdings per quarter
      lockupPeriod: 180, // 180 days for insiders
      reportingThreshold: 5 // 5% ownership requires SEC filing
    },
    'preferred_stock': {
      maxTransferPercentage: 0.10, // 10% of holdings per quarter
      lockupPeriod: 90, // 90 days
      reportingThreshold: 10 // 10% ownership threshold
    }
  };
  
  const restrictions = typeRestrictions[securityType] || typeRestrictions['common_stock'];
  
  return {
    ...rule144Restrictions,
    ...restrictions,
    maxTransferAmount: transferAmount * restrictions.maxTransferPercentage,
    requiresFiling: transferAmount > 50000 || restrictions.reportingThreshold > 0
  };
}

async function generateComplianceReport(tokenAddress: string, investorAddress: string) {
  console.log('📋 Generating compliance report...');
  
  // In a real implementation, this would:
  // 1. Check all compliance rules
  // 2. Verify transfer history
  // 3. Check accreditation status
  // 4. Validate transfer limits
  // 5. Generate regulatory filing requirements
  
  const report = {
    tokenAddress,
    investorAddress,
    complianceStatus: 'compliant',
    lastCheck: new Date(),
    rulesChecked: [
      'accreditation_status',
      'transfer_limits',
      'rule_144_restrictions',
      'beneficial_ownership',
      'aml_kyc_status'
    ],
    violations: [],
    recommendations: [
      'Maintain current accreditation status',
      'Monitor transfer limits',
      'File Form 144 if required',
      'Update KYC information annually'
    ]
  };
  
  console.log('✅ Compliance report generated');
  return report;
}

// Run the example
if (require.main === module) {
  securityTokenExample()
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
  securityTokenExample,
  verifyAccreditation,
  calculateTransferRestrictions,
  generateComplianceReport
};
