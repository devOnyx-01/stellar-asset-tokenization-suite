/**
 * Invoice Factoring Tokenization Example
 * 
 * This example demonstrates how to tokenize accounts receivable for invoice factoring,
 * allowing businesses to get immediate liquidity by selling their invoices.
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
const INVOICE_FACE_VALUE = '100000'; // $100,000 invoice
const ADVANCE_RATE = 0.85; // 85% advance rate
const ADVANCE_AMOUNT = (INVOICE_FACE_VALUE * ADVANCE_RATE).toString();
const DISCOUNT_RATE = 0.08; // 8% annual discount rate

async function invoiceFactoringExample() {
  console.log('🧾 Starting Invoice Factoring Tokenization Example...\n');

  // Initialize SDK
  const sdk = createStellarRWASDK(NETWORK, {
    assetFactory: 'GC7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    complianceRegistry: 'GD7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    dividendDistributor: 'GE7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    secondaryMarket: 'GF7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
    custodyValidator: 'GH7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3',
  });

  // Example addresses
  const business = 'GAB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const investor1 = 'GCB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const investor2 = 'GDB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const factor = 'GEB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';
  const complianceAdmin = 'GFB7Q5F5JQ3KXQ3YQ3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3Q3';

  try {
    // Step 1: Initialize compliance registry
    console.log('📋 Step 1: Initializing Compliance Registry...');
    await sdk.complianceClient.initialize(factor, complianceAdmin, true, true);
    console.log('✅ Compliance registry initialized\n');

    // Step 2: Set up KYC for participants
    console.log('🔍 Step 2: Setting up KYC for Participants...');
    
    // Business (invoice seller)
    await sdk.complianceClient.updateKYCStatus(complianceAdmin, business, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 3,
      amlFlags: []
    });

    // Investors
    await sdk.complianceClient.updateKYCStatus(complianceAdmin, investor1, {
      isVerified: true,
      verificationLevel: VerificationLevel.INSTITUTIONAL,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'US',
      isAccredited: true,
      riskScore: 1,
      amlFlags: []
    });

    await sdk.complianceClient.updateKYCStatus(complianceAdmin, investor2, {
      isVerified: true,
      verificationLevel: VerificationLevel.ENHANCED,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      jurisdiction: 'EU',
      isAccredited: true,
      riskScore: 2,
      amlFlags: []
    });
    console.log('✅ KYC setup completed\n');

    // Step 3: Deploy invoice token
    console.log('🧾 Step 3: Deploying Invoice Token...');
    const invoiceTokenDeployment = await sdk.assetFactory.deployRWAToken(factor, {
      name: 'TechCorp Invoice #INV-2024-001',
      symbol: 'INV001',
      totalSupply: '100000', // 100,000 tokens representing $1 each
      decimals: 2,
      assetType: AssetType.INVOICE,
      metadata: {
        invoice_number: 'INV-2024-001',
        invoice_date: '2024-01-15',
        due_date: '2024-03-15',
        face_value: INVOICE_FACE_VALUE,
        debtor_name: 'TechCorp Industries',
        debtor_credit_rating: 'A-',
        industry: 'Technology',
        payment_terms: 'NET 60',
        advance_rate: ADVANCE_RATE.toString(),
        discount_rate: DISCOUNT_RATE.toString(),
        factor_fee: '0.02', // 2% factor fee
        collateral_type: 'accounts_receivable',
        verification_status: 'verified',
        legal_enforceability: 'confirmed'
      },
      complianceRegistry: sdk.getConfig().contracts.complianceRegistry,
      dividendDistributor: sdk.getConfig().contracts.dividendDistributor
    });
    console.log(`✅ Invoice token deployed: ${invoiceTokenDeployment.tokenAddress}\n`);

    // Step 4: Create token client
    const invoiceTokenClient = sdk.createTokenClient(invoiceTokenDeployment.tokenAddress);

    // Step 5: Distribute advance to business
    console.log('💰 Step 4: Distributing Advance to Business...');
    await invoiceTokenClient.transfer(factor, business, ADVANCE_AMOUNT);
    console.log(`✅ Advance of $${ADVANCE_AMOUNT} transferred to business\n`);

    // Step 6: Distribute remaining tokens to investors
    console.log('👥 Step 5: Distributing Tokens to Investors...');
    const investor1Tokens = '50000'; // 50% of remaining
    const investor2Tokens = '15000'; // 15% of remaining
    
    await invoiceTokenClient.transfer(factor, investor1, investor1Tokens);
    await invoiceTokenClient.transfer(factor, investor2, investor2Tokens);
    console.log(`✅ Distributed ${investor1Tokens} tokens to investor 1`);
    console.log(`✅ Distributed ${investor2Tokens} tokens to investor 2\n`);

    // Step 7: Add token to secondary market
    console.log('📈 Step 6: Adding Token to Secondary Market...');
    await sdk.marketClient.addSupportedToken(factor, invoiceTokenDeployment.tokenAddress);
    console.log('✅ Token added to secondary market\n');

    // Step 8: Create payment distribution (simulating invoice payment)
    console.log('💸 Step 7: Creating Payment Distribution...');
    const paymentDistribution = await sdk.dividendClient.createDistribution(factor, {
      tokenAddress: invoiceTokenDeployment.tokenAddress,
      currency: Currency.USDC,
      amount: '100000', // Full invoice payment
      claimDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: {
        distribution_type: 'invoice_payment',
        payment_date: '2024-03-14',
        payment_amount: INVOICE_FACE_VALUE,
        discount_applied: (parseFloat(INVOICE_FACE_VALUE) * (1 - ADVANCE_RATE)).toString(),
        factor_fee: (parseFloat(INVOICE_FACE_VALUE) * 0.02).toString(),
        net_payment: (parseFloat(INVOICE_FACE_VALUE) * ADVANCE_RATE * (1 - 0.02)).toString()
      }
    });
    console.log(`✅ Payment distribution created: ${paymentDistribution.distributionId}\n`);

    // Step 9: Create trading orders
    console.log('🔄 Step 8: Creating Market Orders...');
    
    // Investor 1 sells some tokens
    const sellOrder = await sdk.marketClient.createSellOrder(investor1, {
      tokenAddress: invoiceTokenDeployment.tokenAddress,
      amount: '10000', // Sell $10,000 worth
      price: '0.98', // 2% discount
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`✅ Sell order created: ${sellOrder.orderId}`);

    // New investor buys tokens
    const buyOrder = await sdk.marketClient.createBuyOrder(investor2, {
      tokenAddress: invoiceTokenDeployment.tokenAddress,
      amount: '5000', // Buy $5,000 worth
      price: '0.98',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    console.log(`✅ Buy order created: ${buyOrder.orderId}\n`);

    // Step 10: Match orders
    console.log('⚡ Step 9: Matching Orders...');
    await sdk.marketClient.matchOrders(factor, invoiceTokenDeployment.tokenAddress);
    console.log('✅ Orders matched and trade executed\n');

    // Step 11: Claim payments
    console.log('🎁 Step 10: Claiming Payments...');
    const businessClaim = await sdk.dividendClient.claimDividend(business, paymentDistribution.distributionId);
    console.log(`✅ Business claimed: $${businessClaim.amountClaimed}`);

    const investor1Claim = await sdk.dividendClient.claimDividend(investor1, paymentDistribution.distributionId);
    console.log(`✅ Investor 1 claimed: $${investor1Claim.amountClaimed}`);

    const investor2Claim = await sdk.dividendClient.claimDividend(investor2, paymentDistribution.distributionId);
    console.log(`✅ Investor 2 claimed: $${investor2Claim.amountClaimed}\n`);

    // Step 12: Create new invoice for next cycle
    console.log('📄 Step 11: Creating Next Invoice Token...');
    const nextInvoiceDeployment = await sdk.assetFactory.deployRWAToken(factor, {
      name: 'TechCorp Invoice #INV-2024-002',
      symbol: 'INV002',
      totalSupply: '150000',
      decimals: 2,
      assetType: AssetType.INVOICE,
      metadata: {
        invoice_number: 'INV-2024-002',
        invoice_date: '2024-02-01',
        due_date: '2024-04-01',
        face_value: '150000',
        debtor_name: 'TechCorp Industries',
        debtor_credit_rating: 'A-',
        payment_terms: 'NET 60',
        advance_rate: '0.85',
        discount_rate: '0.08',
        factor_fee: '0.02'
      },
      complianceRegistry: sdk.getConfig().contracts.complianceRegistry,
      dividendDistributor: sdk.getConfig().contracts.dividendDistributor
    });
    console.log(`✅ Next invoice token deployed: ${nextInvoiceDeployment.tokenAddress}\n`);

    // Step 13: Get portfolio overview
    console.log('📊 Step 12: Getting Portfolio Overview...');
    const investor1Portfolio = await sdk.getUserPortfolio(investor1);
    console.log(`Investor 1 Portfolio:`);
    console.log(`  Total Value: $${investor1Portfolio.totalValue}`);
    console.log(`  Total Dividends: $${investor1Portfolio.totalDividends}`);
    console.log(`  Number of Assets: ${investor1Portfolio.assets.length}\n`);

    console.log('🎉 Invoice Factoring Tokenization Example Completed Successfully!');

    return {
      invoiceToken: invoiceTokenDeployment.tokenAddress,
      nextInvoiceToken: nextInvoiceDeployment.tokenAddress,
      advanceAmount: ADVANCE_AMOUNT,
      totalPayments: INVOICE_FACE_VALUE,
      investorPortfolio: investor1Portfolio
    };

  } catch (error) {
    console.error('❌ Error in invoice factoring example:', error);
    throw error;
  }
}

// Additional utility functions for invoice factoring

async function verifyInvoice(invoiceData: any) {
  console.log('🔍 Verifying invoice...');
  
  // In a real implementation, this would:
  // 1. Verify invoice authenticity
  // 2. Check debtor creditworthiness
  // 3. Confirm payment terms
  // 4. Validate legal enforceability
  
  const requiredFields = [
    'invoice_number',
    'invoice_date',
    'due_date',
    'face_value',
    'debtor_name',
    'payment_terms'
  ];
  
  for (const field of requiredFields) {
    if (!invoiceData[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Check if invoice is not overdue
  const dueDate = new Date(invoiceData.due_date);
  const today = new Date();
  if (dueDate < today) {
    throw new Error('Invoice is already overdue');
  }
  
  console.log('✅ Invoice verification passed');
  return true;
}

async function calculateAdvanceRate(faceValue: string, debtorRating: string, industryRisk: string) {
  let baseRate = 0.85; // Base 85% advance rate
  
  // Adjust based on debtor credit rating
  const ratingAdjustments: Record<string, number> = {
    'AAA': 0.95,
    'AA': 0.90,
    'A': 0.85,
    'BBB': 0.80,
    'BB': 0.75,
    'B': 0.70,
    'CCC': 0.65,
    'CC': 0.60,
    'C': 0.55,
    'D': 0.50
  };
  
  const ratingAdjustment = ratingAdjustments[debtorRating] || 0.70;
  
  // Adjust based on industry risk
  const industryAdjustments: Record<string, number> = {
    'Technology': 0.90,
    'Healthcare': 0.85,
    'Manufacturing': 0.80,
    'Retail': 0.75,
    'Construction': 0.70,
    'Transportation': 0.75,
    'Financial': 0.85
  };
  
  const industryAdjustment = industryAdjustments[industryRisk] || 0.75;
  
  const finalRate = Math.min(ratingAdjustment, industryAdjustment);
  
  return {
    advanceRate: finalRate,
    advanceAmount: parseFloat(faceValue) * finalRate,
    reserveAmount: parseFloat(faceValue) * (1 - finalRate)
  };
}

async function createPaymentSchedule(invoiceData: any, advanceRate: number) {
  const faceValue = parseFloat(invoiceData.face_value);
  const advanceAmount = faceValue * advanceRate;
  const discountRate = 0.08; // 8% annual
  const factorFee = 0.02; // 2% fee
  
  // Calculate discount for the period
  const invoiceDate = new Date(invoiceData.invoice_date);
  const dueDate = new Date(invoiceData.due_date);
  const daysToMaturity = (dueDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24);
  const periodDiscount = (discountRate * daysToMaturity) / 365;
  
  return {
    advanceAmount,
    discountAmount: advanceAmount * periodDiscount,
    factorFeeAmount: advanceAmount * factorFee,
    netAdvance: advanceAmount - (advanceAmount * periodDiscount) - (advanceAmount * factorFee),
    reserveAmount: faceValue - advanceAmount,
    expectedPayment: faceValue,
    expectedReturn: faceValue - advanceAmount - (advanceAmount * periodDiscount) - (advanceAmount * factorFee)
  };
}

// Run the example
if (require.main === module) {
  invoiceFactoringExample()
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
  invoiceFactoringExample,
  verifyInvoice,
  calculateAdvanceRate,
  createPaymentSchedule
};
