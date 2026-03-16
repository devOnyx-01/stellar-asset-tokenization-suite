'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  LineChart, 
  Line, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpDown, 
  Clock, 
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { Order, Trade, OrderBook, AssetInfo, OrderType } from '@/lib/types';

interface SecondaryMarketProps {
  asset: AssetInfo;
  orderBook: OrderBook;
  userOrders: Order[];
  recentTrades: Trade[];
  onCreateOrder?: (type: OrderType, amount: string, price: string, expiresAt?: Date) => Promise<string>;
  onCancelOrder?: (orderId: number) => Promise<string>;
  onMatchOrders?: () => Promise<string>;
  isLoading?: boolean;
}

export default function SecondaryMarket({
  asset,
  orderBook,
  userOrders,
  recentTrades,
  onCreateOrder,
  onCancelOrder,
  onMatchOrders,
  isLoading = false
}: SecondaryMarketProps) {
  const [orderType, setOrderType] = useState<OrderType>('buy');
  const [orderAmount, setOrderAmount] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Calculate market statistics
  const lastPrice = parseFloat(orderBook.lastPrice) || 0;
  const volume24h = parseFloat(orderBook.volume24h) || 0;
  const spread = orderBook.buyOrders.length > 0 && orderBook.sellOrders.length > 0
    ? parseFloat(orderBook.sellOrders[0].price) - parseFloat(orderBook.buyOrders[0].price)
    : 0;

  const priceChange = recentTrades.length > 1
    ? ((lastPrice - parseFloat(recentTrades[recentTrades.length - 1].price)) / parseFloat(recentTrades[recentTrades.length - 1].price)) * 100
    : 0;

  // Prepare chart data
  const priceHistoryData = recentTrades.slice(-20).map((trade, index) => ({
    time: new Date(trade.executedAt).toLocaleTimeString(),
    price: parseFloat(trade.price),
    volume: parseFloat(trade.amount),
  }));

  const depthData = {
    bids: orderBook.buyOrders.slice(0, 10).map(order => ({
      price: parseFloat(order.price),
      amount: parseFloat(order.remainingAmount),
      total: parseFloat(order.price) * parseFloat(order.remainingAmount),
    })),
    asks: orderBook.sellOrders.slice(0, 10).map(order => ({
      price: parseFloat(order.price),
      amount: parseFloat(order.remainingAmount),
      total: parseFloat(order.price) * parseFloat(order.remainingAmount),
    })),
  };

  const handleCreateOrder = async () => {
    if (!orderAmount || !orderPrice || !onCreateOrder) return;

    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await onCreateOrder(orderType, orderAmount, orderPrice, expiresAt);
      
      // Reset form
      setOrderAmount('');
      setOrderPrice('');
    } catch (error) {
      console.error('Failed to create order:', error);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    if (!onCancelOrder) return;

    try {
      await onCancelOrder(orderId);
    } catch (error) {
      console.error('Failed to cancel order:', error);
    }
  };

  const calculateTotal = () => {
    if (!orderAmount || !orderPrice) return '0';
    return (parseFloat(orderAmount) * parseFloat(orderPrice)).toFixed(2);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Market Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Last Price</p>
                <p className="text-2xl font-bold">${lastPrice.toFixed(4)}</p>
                <p className={`text-sm ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                </p>
              </div>
              {priceChange >= 0 ? 
                <TrendingUp className="h-8 w-8 text-green-600" /> : 
                <TrendingDown className="h-8 w-8 text-red-600" />
              }
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">24h Volume</p>
                <p className="text-2xl font-bold">${volume24h.toLocaleString()}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Spread</p>
                <p className="text-2xl font-bold">${spread.toFixed(4)}</p>
                <p className="text-sm text-gray-600">
                  {spread > 0 && lastPrice > 0 ? ((spread / lastPrice) * 100).toFixed(2) : '0'}%
                </p>
              </div>
              <ArrowUpDown className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Orders</p>
                <p className="text-2xl font-bold">{userOrders.filter(o => o.isActive).length}</p>
              </div>
              <Clock className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trading" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trading">Trading</TabsTrigger>
          <TabsTrigger value="orderbook">Order Book</TabsTrigger>
          <TabsTrigger value="orders">My Orders</TabsTrigger>
          <TabsTrigger value="history">Trade History</TabsTrigger>
        </TabsList>

        <TabsContent value="trading" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Order Form */}
            <Card>
              <CardHeader>
                <CardTitle>Place Order</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={orderType === 'buy' ? 'default' : 'outline'}
                      onClick={() => setOrderType('buy')}
                      className="flex-1"
                    >
                      Buy
                    </Button>
                    <Button
                      variant={orderType === 'sell' ? 'default' : 'outline'}
                      onClick={() => setOrderType('sell')}
                      className="flex-1"
                    >
                      Sell
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount</Label>
                    <Input
                      id="amount"
                      type="number"
                      value={orderAmount}
                      onChange={(e) => setOrderAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="price">Price (USD)</Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.0001"
                      value={orderPrice}
                      onChange={(e) => setOrderPrice(e.target.value)}
                      placeholder="0.0000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Total</Label>
                    <div className="p-3 bg-gray-50 rounded">
                      <p className="text-lg font-medium">${calculateTotal()}</p>
                    </div>
                  </div>

                  <Button 
                    onClick={handleCreateOrder}
                    disabled={!orderAmount || !orderPrice || isLoading}
                    className="w-full"
                  >
                    {isLoading ? 'Processing...' : `Place ${orderType} Order`}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Price Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Price Chart</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={priceHistoryData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip formatter={(value) => [`$${Number(value).toFixed(4)}`, 'Price']} />
                    <Area type="monotone" dataKey="price" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Market Depth */}
          <Card>
            <CardHeader>
              <CardTitle>Market Depth</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-medium mb-4 text-green-600">Buy Orders (Bids)</h4>
                  <div className="space-y-2">
                    {orderBook.buyOrders.slice(0, 10).map((order, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-green-50 rounded">
                        <span>${parseFloat(order.price).toFixed(4)}</span>
                        <span>{parseFloat(order.remainingAmount).toLocaleString()}</span>
                        <span>${(parseFloat(order.price) * parseFloat(order.remainingAmount)).toFixed(2)}</span>
                      </div>
                    ))}
                    {orderBook.buyOrders.length === 0 && (
                      <p className="text-center text-gray-500 py-4">No buy orders</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-medium mb-4 text-red-600">Sell Orders (Asks)</h4>
                  <div className="space-y-2">
                    {orderBook.sellOrders.slice(0, 10).map((order, index) => (
                      <div key={index} className="flex justify-between items-center p-2 bg-red-50 rounded">
                        <span>${parseFloat(order.price).toFixed(4)}</span>
                        <span>{parseFloat(order.remainingAmount).toLocaleString()}</span>
                        <span>${(parseFloat(order.price) * parseFloat(order.remainingAmount)).toFixed(2)}</span>
                      </div>
                    ))}
                    {orderBook.sellOrders.length === 0 && (
                      <p className="text-center text-gray-500 py-4">No sell orders</p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orderbook" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-green-600">Buy Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {orderBook.buyOrders.map((order, index) => (
                    <div key={order.orderId} className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                      <div>
                        <p className="font-medium">${parseFloat(order.price).toFixed(4)}</p>
                        <p className="text-sm text-gray-600">
                          {parseFloat(order.remainingAmount).toLocaleString()} {asset.symbol}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          ${(parseFloat(order.price) * parseFloat(order.remainingAmount)).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {orderBook.buyOrders.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No buy orders available</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-red-600">Sell Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {orderBook.sellOrders.map((order, index) => (
                    <div key={order.orderId} className="flex justify-between items-center p-3 border rounded hover:bg-gray-50">
                      <div>
                        <p className="font-medium">${parseFloat(order.price).toFixed(4)}</p>
                        <p className="text-sm text-gray-600">
                          {parseFloat(order.remainingAmount).toLocaleString()} {asset.symbol}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          ${(parseFloat(order.price) * parseFloat(order.remainingAmount)).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                  {orderBook.sellOrders.length === 0 && (
                    <p className="text-center text-gray-500 py-8">No sell orders available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>My Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {userOrders.map((order) => (
                  <div key={order.orderId} className="flex justify-between items-center p-4 border rounded">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant={order.orderType === 'buy' ? 'default' : 'destructive'}>
                          {order.orderType.toUpperCase()}
                        </Badge>
                        <Badge variant={order.isActive ? 'secondary' : 'outline'}>
                          {order.isActive ? 'Active' : 'Closed'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Price</p>
                          <p className="font-medium">${parseFloat(order.price).toFixed(4)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Amount</p>
                          <p className="font-medium">
                            {parseFloat(order.remainingAmount).toLocaleString()} / {parseFloat(order.amount).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Total</p>
                          <p className="font-medium">
                            ${(parseFloat(order.price) * parseFloat(order.remainingAmount)).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Created</p>
                          <p className="font-medium">{new Date(order.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      {order.isActive && onCancelOrder && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleCancelOrder(order.orderId)}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {userOrders.length === 0 && (
                  <p className="text-center text-gray-500 py-8">You have no orders</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {recentTrades.slice(0, 50).map((trade, index) => (
                  <div key={trade.tradeId} className="flex justify-between items-center p-3 border rounded">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">${parseFloat(trade.price).toFixed(4)}</span>
                        <span className="text-sm text-gray-600">
                          {parseFloat(trade.amount).toLocaleString()} {asset.symbol}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        ${(parseFloat(trade.price) * parseFloat(trade.amount)).toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(trade.executedAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                {recentTrades.length === 0 && (
                  <p className="text-center text-gray-500 py-8">No trades yet</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {onMatchOrders && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Orders are matched automatically, but you can trigger manual matching if needed.
            <Button 
              size="sm" 
              variant="outline" 
              className="ml-2"
              onClick={onMatchOrders}
              disabled={isLoading}
            >
              {isLoading ? 'Matching...' : 'Match Orders Now'}
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
