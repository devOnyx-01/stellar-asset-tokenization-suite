import React, { useState, useEffect } from 'react';
import { StellarRWASDK } from '../../sdk/src';
import { AssetInfo, OrderBook, Trade, Order } from '../../sdk/src/types';

interface SecondaryMarketProps {
  sdk: StellarRWASDK;
  asset: AssetInfo;
  userAddress: string;
}

const SecondaryMarket: React.FC<SecondaryMarketProps> = ({ sdk, asset, userAddress }) => {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [vwap, setVwap] = useState<string>('0');
  const [userOrders, setUserOrders] = useState<Order[]>([]);
  const [kycStatus, setKycStatus] = useState<boolean>(false);
  const [dividendHalt, setDividendHalt] = useState<boolean>(false);

  // Form State
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [price, setPrice] = useState<string>('');
  const [amount, setAmount] = useState<string>('');

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 5000);
    return () => clearInterval(interval);
  }, [asset]);

  const fetchMarketData = async () => {
    const ob = await sdk.marketClient.getOrderBook(asset.token_address);
    const tr = await sdk.marketClient.getRecentTrades(asset.token_address);
    const v = await sdk.marketClient.getVWAP(asset.token_address);
    const kyc = await sdk.complianceClient.getKYCStatus(userAddress);

    setOrderBook(ob);
    setTrades(tr);
    setVwap(v);
    setKycStatus(kyc.is_verified);
    // setDividendHalt(await sdk.dividendClient.isHalted(asset.token_address));
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycStatus) {
      alert("KYC verification required to trade.");
      return;
    }
    if (dividendHalt) {
      alert("Trading is halted during dividend record dates.");
      return;
    }

    try {
      await sdk.marketClient.placeLimitOrder(
        userAddress,
        asset.token_address,
        side,
        price,
        amount,
        Math.floor(Date.now() / 1000) + 86400 * 7 // 7 days expiry
      );
      fetchMarketData();
    } catch (err: any) {
      alert("Failed to place order: " + err.message);
    }
  };

  return (
    <div className="secondary-market-container">
      <header className="market-header">
        <h1>{asset.symbol} - Secondary Market</h1>
        <div className="token-stats">
          <span>VWAP: {vwap}</span>
          <span className={`status ${kycStatus ? 'verified' : 'unverified'}`}>
            KYC: {kycStatus ? 'Verified' : 'Required'}
          </span>
          {dividendHalt && <span className="halt-badge">DIVIDEND HALT</span>}
        </div>
      </header>

      <main className="market-grid">
        {/* TradingView-style Chart Placeholder */}
        <section className="price-chart">
          <h2>Price Chart</h2>
          <div className="chart-placeholder">
            {/* Real TradingView widget would go here */}
            <div className="vwap-line" style={{ top: '50%' }}>VWAP: {vwap}</div>
          </div>
        </section>

        {/* Order Book Depth */}
        <section className="order-book">
          <h2>Order Book</h2>
          <div className="depth-visualization">
            <div className="asks">
              {orderBook?.asks.map((ask, i) => (
                <div key={i} className="book-row ask" style={{ width: `${(ask.amount / 1000) * 100}%` }}>
                  <span>{ask.price}</span>
                  <span>{ask.amount}</span>
                </div>
              ))}
            </div>
            <div className="bids">
              {orderBook?.bids.map((bid, i) => (
                <div key={i} className="book-row bid" style={{ width: `${(bid.amount / 1000) * 100}%` }}>
                  <span>{bid.price}</span>
                  <span>{bid.amount}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Order Entry */}
        <section className="order-entry">
          <h2>Place Order</h2>
          <form onSubmit={handlePlaceOrder}>
            <div className="side-toggle">
              <button type="button" className={side === 'buy' ? 'active buy' : ''} onClick={() => setSide('buy')}>BUY</button>
              <button type="button" className={side === 'sell' ? 'active sell' : ''} onClick={() => setSide('sell')}>SELL</button>
            </div>
            <input type="number" step="any" placeholder="Price" value={price} onChange={e => setPrice(e.target.value)} />
            <input type="number" step="any" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} />
            <button type="submit" className="submit-order">Place {side} Limit Order</button>
          </form>
        </section>

        {/* Trade History */}
        <section className="trade-history">
          <h2>Recent Trades</h2>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Price</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, i) => (
                <tr key={i} className={trade.side}>
                  <td>{new Date(trade.timestamp * 1000).toLocaleTimeString()}</td>
                  <td>{trade.fill_price}</td>
                  <td>{trade.fill_amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Portfolio & P&L */}
        <section className="portfolio-overview">
          <h2>Your Portfolio</h2>
          <div className="portfolio-stats">
            <div className="stat">
              <label>Holdings</label>
              <span>{vwap} {asset.symbol}</span>
            </div>
            <div className="stat">
              <label>Unrealized P&L</label>
              <span className="pnl positive">+12.4%</span>
            </div>
          </div>
        </section>
      </main>

      <style jsx>{`
        .secondary-market-container { color: #f0f0f0; background: #121212; padding: 20px; font-family: 'Inter', sans-serif; }
        .market-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 20px; }
        .token-stats span { margin-left:15px; font-size: 14px; }
        .market-grid { display: grid; grid-template-columns: 2fr 1fr; grid-template-rows: 400px 300px; gap: 20px; }
        .price-chart { border: 1px solid #333; border-radius: 8px; overflow: hidden; position: relative; }
        .chart-placeholder { height: 100%; background: #1a1a1a; display: flex; align-items: center; justify-content: center; }
        .order-book { border: 1px solid #333; padding: 10px; }
        .book-row { display: flex; justify-content: space-between; padding: 4px; font-size: 12px; margin-bottom: 2px; }
        .book-row.ask { background: rgba(255, 0, 0, 0.1); border-right: 2px solid #ff4444; }
        .book-row.bid { background: rgba(0, 255, 0, 0.1); border-right: 2px solid #00c853; }
        .order-entry form { display: flex; flex-direction: column; gap: 10px; }
        .side-toggle { display: flex; gap: 10px; }
        .side-toggle button { flex: 1; padding: 10px; border: none; background: #333; color: #fff; cursor: pointer; border-radius: 4px; }
        .side-toggle button.active.buy { background: #00c853; }
        .side-toggle button.active.sell { background: #ff4444; }
        input { background: #222; border: 1px solid #444; color: #fff; padding: 10px; border-radius: 4px; }
        .submit-order { background: #2962ff; color: #fff; padding: 12px; border: none; cursor: pointer; border-radius: 4px; font-weight: bold; }
        .halt-badge { background: #ffea00; color: #000; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
        .pnl.positive { color: #00c853; font-weight: bold; }
      `}</style>
    </div>
  );
};

export default SecondaryMarket;
