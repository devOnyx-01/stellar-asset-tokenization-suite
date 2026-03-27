import { createStellarRWASDK } from '../sdk/src';
import { AssetType } from '../sdk/src/types';

async function propertyTradingExample() {
  const sdk = createStellarRWASDK('testnet', {
    assetFactory: 'GC...',
    complianceRegistry: 'GD...',
    dividendDistributor: 'GE...',
    secondaryMarket: 'GF...',
    custodyValidator: 'GH...'
  });

  const propertyAddress = 'GA123...'; // Address of a real estate RWA token
  const investor1 = 'GB...';
  const investor2 = 'GC...';

  console.log("🏠 Starting Fractional Real Estate Trading Example...");

  // 1. Investor 1 places a sell order for 100 shares at $50/share
  console.log("📉 Investor 1 placing sell order...");
  const sellOrderId = await sdk.marketClient.placeLimitOrder(
    investor1,
    propertyAddress,
    'sell',
    '50.00',
    '100',
    Math.floor(Date.now() / 1000) + 3600 // 1 hour expiry
  );

  // 2. Investor 2 views the order book
  console.log("📋 Investor 2 viewing order book...");
  const orderBook = await sdk.marketClient.getOrderBook(propertyAddress);
  console.log(`Top ask: ${orderBook.asks[0]?.price} for ${orderBook.asks[0]?.amount} shares`);

  // 3. Investor 2 fills the order
  console.log("🚀 Investor 2 filling order...");
  await sdk.marketClient.fillOrder(investor2, sellOrderId, '100');

  console.log("✅ Trade complete! Atomic settlement executed.");
  
  // 4. Check new VWAP
  const vwap = await sdk.marketClient.getVWAP(propertyAddress);
  console.log(`New Market VWAP: ${vwap}`);
}

propertyTradingExample().catch(console.error);
