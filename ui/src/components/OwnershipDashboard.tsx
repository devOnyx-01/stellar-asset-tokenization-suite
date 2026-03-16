'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  LineChart, 
  Line 
} from 'recharts';
import { 
  Wallet, 
  TrendingUp, 
  PieChart as PieChartIcon, 
  Vote, 
  Lock, 
  DollarSign,
  Calendar,
  Building2,
  Package
} from 'lucide-react';
import { AssetInfo, Balance, AssetHolding, Portfolio } from '@/lib/types';

interface OwnershipDashboardProps {
  userAddress: string;
  portfolio: Portfolio;
  onLockTokens?: (assetAddress: string, amount: string, lockPeriod: number) => Promise<void>;
  onUnlockTokens?: (assetAddress: string, amount: string) => Promise<void>;
  onClaimDividends?: (assetAddress: string, distributionId: number) => Promise<void>;
  isLoading?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function OwnershipDashboard({ 
  userAddress, 
  portfolio, 
  onLockTokens, 
  onUnlockTokens, 
  onClaimDividends,
  isLoading = false 
}: OwnershipDashboardProps) {
  const [selectedAsset, setSelectedAsset] = useState<AssetHolding | null>(null);
  const [lockAmount, setLockAmount] = useState('');
  const [lockPeriod, setLockPeriod] = useState('');

  // Prepare data for charts
  const pieChartData = portfolio.assets.map(holding => ({
    name: holding.asset.name,
    value: parseFloat(holding.value),
    percentage: holding.percentage,
  }));

  const barChartData = portfolio.assets.map(holding => ({
    name: holding.asset.symbol,
    balance: parseFloat(holding.balance.amount),
    value: parseFloat(holding.value),
    dividends: parseFloat(holding.dividends),
  }));

  const totalValue = parseFloat(portfolio.totalValue);
  const totalDividends = parseFloat(portfolio.totalDividends);
  const totalVotingPower = parseFloat(portfolio.votingPower);

  const handleLockTokens = async () => {
    if (!selectedAsset || !lockAmount || !lockPeriod) return;
    
    try {
      await onLockTokens?.(selectedAsset.asset.tokenAddress, lockAmount, parseInt(lockPeriod));
      setLockAmount('');
      setLockPeriod('');
    } catch (error) {
      console.error('Failed to lock tokens:', error);
    }
  };

  const handleUnlockTokens = async (assetAddress: string, amount: string) => {
    try {
      await onUnlockTokens?.(assetAddress, amount);
    } catch (error) {
      console.error('Failed to unlock tokens:', error);
    }
  };

  const handleClaimDividends = async (assetAddress: string, distributionId: number) => {
    try {
      await onClaimDividends?.(assetAddress, distributionId);
    } catch (error) {
      console.error('Failed to claim dividends:', error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Portfolio Value</p>
                <p className="text-2xl font-bold">${totalValue.toLocaleString()}</p>
              </div>
              <DollarSign className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Dividends</p>
                <p className="text-2xl font-bold">${totalDividends.toLocaleString()}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Voting Power</p>
                <p className="text-2xl font-bold">{totalVotingPower.toLocaleString()}</p>
              </div>
              <Vote className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Assets Held</p>
                <p className="text-2xl font-bold">{portfolio.assets.length}</p>
              </div>
              <Wallet className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="dividends">Dividends</TabsTrigger>
          <TabsTrigger value="voting">Voting</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Portfolio Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5" />
                  Portfolio Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${name} ${percentage.toFixed(1)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Asset Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Asset Performance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={barChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip formatter={(value) => `$${Number(value).toLocaleString()}`} />
                    <Bar dataKey="value" fill="#8884d8" />
                    <Bar dataKey="dividends" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="assets" className="space-y-6">
          <div className="grid grid-cols-1 gap-4">
            {portfolio.assets.map((holding, index) => (
              <Card key={index} className="cursor-pointer hover:shadow-lg transition-shadow"
                    onClick={() => setSelectedAsset(holding)}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                          {holding.asset.assetType === 'real_estate' && <Building2 className="h-5 w-5" />}
                          {holding.asset.assetType === 'commodity' && <Package className="h-5 w-5" />}
                          {(holding.asset.assetType === 'invoice' || holding.asset.assetType === 'security') && 
                           <DollarSign className="h-5 w-5" />}
                        </div>
                        <div>
                          <h3 className="font-semibold text-lg">{holding.asset.name}</h3>
                          <p className="text-sm text-gray-600">{holding.asset.symbol}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                        <div>
                          <p className="text-sm text-gray-600">Balance</p>
                          <p className="font-medium">{parseFloat(holding.balance.amount).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Value</p>
                          <p className="font-medium">${parseFloat(holding.value).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Dividends</p>
                          <p className="font-medium">${parseFloat(holding.dividends).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Percentage</p>
                          <p className="font-medium">{holding.percentage.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4">
                        <Badge variant={holding.balance.lockedAmount === '0' ? 'secondary' : 'default'}>
                          {holding.balance.lockedAmount === '0' ? 'Unlocked' : `${parseFloat(holding.balance.lockedAmount).toLocaleString()} Locked`}
                        </Badge>
                        <Badge variant="outline">
                          {holding.asset.isPaused ? 'Paused' : 'Active'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="dividends" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Dividend Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg">
                  <span className="font-medium">Total Dividends Earned</span>
                  <span className="text-2xl font-bold text-green-600">
                    ${totalDividends.toLocaleString()}
                  </span>
                </div>
                
                <div className="space-y-2">
                  {portfolio.assets.map((holding, index) => (
                    <div key={index} className="flex justify-between items-center p-3 border rounded">
                      <div>
                        <p className="font-medium">{holding.asset.name}</p>
                        <p className="text-sm text-gray-600">{holding.asset.symbol}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">${parseFloat(holding.dividends).toLocaleString()}</p>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {/* Handle claim all dividends */}}
                        >
                          Claim All
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="voting" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Vote className="h-5 w-5" />
                Voting Power & Token Locking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="text-center p-6 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-2">Total Voting Power</p>
                  <p className="text-3xl font-bold text-purple-600">{totalVotingPower.toLocaleString()}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    {totalValue > 0 ? ((totalVotingPower / totalValue) * 100).toFixed(2) : 0}% of portfolio
                  </p>
                </div>

                {selectedAsset && (
                  <div className="space-y-4 p-4 border rounded-lg">
                    <h4 className="font-medium">Lock Tokens for {selectedAsset.asset.name}</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium">Amount</label>
                        <input
                          type="number"
                          value={lockAmount}
                          onChange={(e) => setLockAmount(e.target.value)}
                          placeholder="Amount to lock"
                          className="w-full p-2 border rounded"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Lock Period (days)</label>
                        <input
                          type="number"
                          value={lockPeriod}
                          onChange={(e) => setLockPeriod(e.target.value)}
                          placeholder="Lock period"
                          className="w-full p-2 border rounded"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button onClick={handleLockTokens} disabled={!lockAmount || !lockPeriod}>
                          Lock Tokens
                        </Button>
                      </div>
                    </div>

                    <div className="text-sm text-gray-600">
                      Available: {selectedAsset.balance.amount} | 
                      Locked: {selectedAsset.balance.lockedAmount} | 
                      Voting Power: {selectedAsset.balance.votingPower}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {portfolio.assets.map((holding, index) => (
                    <div key={index} className="flex justify-between items-center p-3 border rounded">
                      <div>
                        <p className="font-medium">{holding.asset.name}</p>
                        <p className="text-sm text-gray-600">
                          Locked: {holding.balance.lockedAmount} | Voting: {holding.balance.votingPower}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {parseFloat(holding.balance.lockedAmount) > 0 && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleUnlockTokens(holding.asset.tokenAddress, holding.balance.lockedAmount)}
                          >
                            Unlock
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
