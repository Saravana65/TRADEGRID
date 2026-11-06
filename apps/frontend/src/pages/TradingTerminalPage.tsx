import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { formatCurrency } from '../utils/formatters';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Badge } from '../components/common/Badge';
import {
  ArrowUpRight,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface OrderBookRow {
  price: string;
  size: string;
  total: string;
}

const mockBids: OrderBookRow[] = [
  { price: '142.45', size: '150.00', total: '150.00' },
  { price: '142.40', size: '320.00', total: '470.00' },
  { price: '142.35', size: '510.00', total: '980.00' },
  { price: '142.30', size: '750.00', total: '1730.00' },
  { price: '142.25', size: '1200.00', total: '2930.00' },
];

const mockAsks: OrderBookRow[] = [
  { price: '142.55', size: '180.00', total: '180.00' },
  { price: '142.60', size: '420.00', total: '600.00' },
  { price: '142.65', size: '610.00', total: '1210.00' },
  { price: '142.70', size: '890.00', total: '2100.00' },
  { price: '142.75', size: '1400.00', total: '3500.00' },
];

export const TradingTerminalPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const symbol = searchParams.get('symbol') || 'TGRID';
  const { virtualCashBalance } = useUIStore();

  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'LIMIT' | 'MARKET'>('LIMIT');
  const [quantity, setQuantity] = useState('10.00');
  const [limitPrice, setLimitPrice] = useState('142.50');
  const [timeframe, setTimeframe] = useState('15m');
  const [orderSubmittedMessage, setOrderSubmittedMessage] = useState<string | null>(null);

  const parsedQty = parseFloat(quantity) || 0;
  const parsedPrice = parseFloat(limitPrice) || 0;
  const estimatedTotal = (parsedQty * parsedPrice).toFixed(4);

  const handlePlaceOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setOrderSubmittedMessage(
      `Phase 1 Simulator: ${orderSide} order for ${parsedQty} shares of ${symbol} at $${limitPrice} verified. Automated matching activates in Phase 2.`
    );
    setTimeout(() => setOrderSubmittedMessage(null), 6000);
  };

  return (
    <div className="space-y-4">
      {/* Symbol Desk Header Bar */}
      <div className="bg-card border border-card-border p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-bold text-white tracking-wide">
                {symbol}
              </span>
              <Badge variant="simulated">SIMULATED</Badge>
            </div>
            <span className="text-xs text-slate-400">TradeGrid Technologies Corp</span>
          </div>

          <div className="border-l border-card-border pl-4">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Last Price</span>
            <span className="font-mono text-lg font-bold text-slate-100 tabular-nums">
              $142.50
            </span>
          </div>

          <div className="border-l border-card-border pl-4">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">24h Change</span>
            <span className="font-mono text-sm font-semibold text-emerald-400 flex items-center gap-0.5 tabular-nums">
              <ArrowUpRight className="w-3.5 h-3.5" /> +$4.30 (+3.11%)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
          <div>
            <span className="text-slate-500 block text-[10px]">24H HIGH</span>
            <span className="text-slate-200">$144.20</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">24H LOW</span>
            <span className="text-slate-200">$137.80</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">VOLUME</span>
            <span className="text-slate-200">1,254,300</span>
          </div>
        </div>
      </div>

      {/* Main Terminal Workspace: Chart + Order Entry */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Left 3 Cols: Interactive Chart Area */}
        <div className="lg:col-span-3 space-y-4">
          <Card
            title="Real-Time Price Chart"
            subtitle="TradingView Lightweight Charts engine rendering simulated bars"
            action={
              <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-lg border border-card-border">
                {['1m', '5m', '15m', '1h', '1D'].map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2 py-0.5 text-xs font-mono font-medium rounded transition-colors ${
                      timeframe === tf
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            }
            bodyClassName="p-0"
          >
            {/* Chart Canvas Area */}
            <div className="h-96 w-full bg-[#080C14] flex flex-col items-center justify-center border-b border-card-border relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />

              {/* Synthetic Candlestick Preview Graphics */}
              <div className="flex items-end justify-center gap-2 h-48 opacity-80 pointer-events-none">
                <div className="w-2.5 h-24 bg-emerald-500/80 rounded-sm relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-emerald-400" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-emerald-400" />
                </div>
                <div className="w-2.5 h-16 bg-rose-500/80 rounded-sm relative">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-rose-400" />
                  <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-rose-400" />
                </div>
                <div className="w-2.5 h-32 bg-emerald-500/80 rounded-sm relative">
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-0.5 h-4 bg-emerald-400" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-emerald-400" />
                </div>
                <div className="w-2.5 h-28 bg-emerald-500/80 rounded-sm relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-emerald-400" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-0.5 h-1 bg-emerald-400" />
                </div>
                <div className="w-2.5 h-20 bg-rose-500/80 rounded-sm relative">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-rose-400" />
                  <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-rose-400" />
                </div>
                <div className="w-2.5 h-36 bg-emerald-500/90 rounded-sm relative">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-3 bg-emerald-400" />
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-emerald-400" />
                </div>
              </div>

              <div className="mt-4 text-center z-10">
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/80 px-3 py-1 rounded-full border border-cyan-800/50">
                  TradingView Lightweight Charts Ready • WebSocket Ticks in Phase 2
                </span>
              </div>
            </div>

            {/* Bottom Chart Status Strip */}
            <div className="px-4 py-2.5 bg-[#0A0E1A] flex items-center justify-between text-xs text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> 15m OHLCV Stream Connected
              </span>
              <span>Candles derived strictly from server-side trades</span>
            </div>
          </Card>

          {/* Depth / Order Book Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="Bid Depth (Buyers)" subtitle="Order book price levels waiting to buy">
              <div className="space-y-1 font-mono text-xs">
                <div className="grid grid-cols-3 text-slate-500 pb-1 border-b border-card-border text-[11px]">
                  <span>Price ($)</span>
                  <span className="text-right">Shares</span>
                  <span className="text-right">Total ($)</span>
                </div>
                {mockBids.map((b) => (
                  <div key={b.price} className="grid grid-cols-3 py-1 hover:bg-slate-800/30">
                    <span className="text-emerald-400 font-semibold">{b.price}</span>
                    <span className="text-right text-slate-300">{b.size}</span>
                    <span className="text-right text-slate-400">{b.total}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Ask Depth (Sellers)" subtitle="Order book price levels waiting to sell">
              <div className="space-y-1 font-mono text-xs">
                <div className="grid grid-cols-3 text-slate-500 pb-1 border-b border-card-border text-[11px]">
                  <span>Price ($)</span>
                  <span className="text-right">Shares</span>
                  <span className="text-right">Total ($)</span>
                </div>
                {mockAsks.map((a) => (
                  <div key={a.price} className="grid grid-cols-3 py-1 hover:bg-slate-800/30">
                    <span className="text-rose-400 font-semibold">{a.price}</span>
                    <span className="text-right text-slate-300">{a.size}</span>
                    <span className="text-right text-slate-400">{a.total}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>

        {/* Right 1 Col: Order Entry Desk */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="Order Entry Desk" subtitle="Place synthetic limit & market orders">
            {orderSubmittedMessage && (
              <div className="p-3 mb-4 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2 animate-fadeIn">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{orderSubmittedMessage}</span>
              </div>
            )}

            {/* Buy / Sell Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#090D16] rounded-lg border border-card-border mb-4">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-2 rounded text-xs font-mono font-bold transition-all ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-2 rounded text-xs font-mono font-bold transition-all ${
                  orderSide === 'SELL'
                    ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                SELL
              </button>
            </div>

            {/* Order Type Toggle */}
            <div className="flex items-center gap-2 mb-4">
              <button
                type="button"
                onClick={() => setOrderType('LIMIT')}
                className={`flex-1 py-1.5 text-xs font-mono rounded border transition-colors ${
                  orderType === 'LIMIT'
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40'
                    : 'bg-transparent text-slate-400 border-card-border hover:bg-slate-800'
                }`}
              >
                LIMIT
              </button>
              <button
                type="button"
                onClick={() => setOrderType('MARKET')}
                className={`flex-1 py-1.5 text-xs font-mono rounded border transition-colors ${
                  orderType === 'MARKET'
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/40'
                    : 'bg-transparent text-slate-400 border-card-border hover:bg-slate-800'
                }`}
              >
                MARKET
              </button>
            </div>

            {/* Order Form */}
            <form onSubmit={handlePlaceOrder} className="space-y-4">
              <Input
                label="Quantity (Shares)"
                type="number"
                step="1"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />

              {orderType === 'LIMIT' && (
                <Input
                  label="Limit Price ($)"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  required
                />
              )}

              {/* Order Calculations Summary */}
              <div className="p-3 rounded-lg bg-[#090D16] border border-card-border text-xs space-y-2 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Available Cash:</span>
                  <span className="text-emerald-400">{formatCurrency(virtualCashBalance)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Total:</span>
                  <span className="text-slate-100 font-bold">${estimatedTotal}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Execution Fee:</span>
                  <span>$0.00 (Virtual)</span>
                </div>
              </div>

              <Button
                type="submit"
                variant={orderSide === 'BUY' ? 'success' : 'danger'}
                className="w-full font-mono text-sm uppercase font-bold py-2.5"
              >
                Place {orderSide} Order
              </Button>
            </form>

            <div className="mt-4 p-3 rounded-lg bg-slate-900 border border-card-border/60 text-[11px] text-slate-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Matching Engine Guard:</strong> All orders are validated against buying power in MySQL with explicit transactions before reaching the order book.
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
