import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { useWalletStore } from '../store/walletStore';
import { useOrderStore } from '../store/orderStore';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Badge } from '../components/common/Badge';
import { OrderSide, OrderType } from '@tradegrid/shared-types';
import {
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  ExternalLink,
  Ban,
} from 'lucide-react';

export const TradingTerminalPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = searchParams.get('symbol') || 'TGRID';

  // Stores
  const {
    instruments,
    selectedInstrument,
    selectedQuote,
    fetchInstruments,
    fetchInstrumentDetail,
    isLoadingDetail,
  } = useMarketStore();

  const { balance: availableCash, fetchWalletSummary } = useWalletStore();
  const {
    orders,
    isLoading: isLoadingOrders,
    isSubmitting,
    cancellingOrderId,
    error: orderError,
    successMessage,
    fetchOrders,
    createOrder,
    cancelOrder,
    clearError,
    clearSuccess,
  } = useOrderStore();

  // Local Form State
  const [orderSide, setOrderSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [quantity, setQuantity] = useState('10.0000');
  const [limitPrice, setLimitPrice] = useState('250.0000');
  const [activeTab, setActiveTab] = useState<'open' | 'history'>('open');
  const [symbolSearch, setSymbolSearch] = useState('');
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);

  // Initial Data Fetching
  useEffect(() => {
    fetchInstruments();
    fetchWalletSummary();
    fetchOrders();
  }, [fetchInstruments, fetchWalletSummary, fetchOrders]);

  // Load details when symbol changes
  useEffect(() => {
    if (symbol) {
      fetchInstrumentDetail(symbol);
    }
  }, [symbol, fetchInstrumentDetail]);

  // Update limit price default when quote loads
  useEffect(() => {
    if (selectedQuote && parseFloat(selectedQuote.lastPrice) > 0) {
      setLimitPrice(parseFloat(selectedQuote.lastPrice).toFixed(4));
    }
  }, [selectedQuote]);

  // Calculations
  const parsedQty = parseFloat(quantity) || 0;
  const effectivePrice =
    orderType === 'LIMIT'
      ? parseFloat(limitPrice) || 0
      : parseFloat(selectedQuote?.lastPrice || '0') || 0;
  const estimatedTotal = (parsedQty * effectivePrice).toFixed(4);
  const parsedCash = parseFloat(availableCash || '0');
  const hasInsufficientFunds = orderSide === 'BUY' && parseFloat(estimatedTotal) > parsedCash;

  // Order Submission Handler
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    clearSuccess();

    if (!selectedInstrument) return;

    try {
      await createOrder({
        instrumentId: selectedInstrument.id,
        side: orderSide,
        orderType,
        quantity: parsedQty.toFixed(4),
        limitPrice: orderType === 'LIMIT' ? (parseFloat(limitPrice) || 0).toFixed(4) : null,
      });

      // Refresh orders and wallet
      fetchOrders();
      fetchWalletSummary();
    } catch {
      // Error handled by store
    }
  };

  // Order Cancellation Handler
  const handleCancelOrder = async (orderId: number) => {
    try {
      await cancelOrder(orderId);
      fetchOrders();
    } catch {
      // Error handled by store
    }
  };

  // Filter Orders
  const openOrders = orders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING');
  const orderHistory = orders.filter((o) => o.status !== 'OPEN' && o.status !== 'PENDING');

  const filteredInstruments = instruments.filter(
    (inst) =>
      inst.symbol.toLowerCase().includes(symbolSearch.toLowerCase()) ||
      inst.name.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Symbol Desk Header Bar */}
      <div className="bg-card border border-card-border p-4 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setShowSymbolPicker(!showSymbolPicker)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#090D16] border border-card-border hover:border-cyan-500/50 transition-colors"
            >
              <span className="font-mono text-xl font-bold text-white tracking-wide">
                {selectedInstrument?.symbol || symbol}
              </span>
              <Badge
                variant={
                  selectedInstrument?.dataClassification === 'REAL' ? 'cyan' : 'simulated'
                }
              >
                {selectedInstrument?.dataClassification || 'SIMULATED'}
              </Badge>
              <Search className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {/* Quick Symbol Picker Dropdown */}
            {showSymbolPicker && (
              <div className="absolute top-full left-0 mt-2 w-72 max-h-80 bg-card border border-card-border rounded-xl shadow-2xl p-2 z-50 overflow-y-auto">
                <input
                  type="text"
                  placeholder="Search symbols..."
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-[#090D16] border border-card-border rounded-lg text-xs font-mono text-white mb-2 focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
                <div className="space-y-1">
                  {filteredInstruments.slice(0, 8).map((inst) => (
                    <button
                      key={inst.id}
                      onClick={() => {
                        setSearchParams({ symbol: inst.symbol });
                        setShowSymbolPicker(false);
                      }}
                      className="w-full text-left p-2 rounded-lg hover:bg-slate-800 flex items-center justify-between text-xs font-mono transition-colors"
                    >
                      <div>
                        <span className="font-bold text-white mr-2">{inst.symbol}</span>
                        <span className="text-[10px] text-slate-400 truncate block">
                          {inst.name}
                        </span>
                      </div>
                      <Badge variant={inst.dataClassification === 'REAL' ? 'cyan' : 'simulated'}>
                        {inst.dataClassification}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-l border-card-border pl-4">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Last Price</span>
            <span className="font-mono text-lg font-bold text-slate-100 tabular-nums">
              {selectedQuote ? formatCurrency(selectedQuote.lastPrice) : '---'}
            </span>
          </div>

          <div className="border-l border-card-border pl-4">
            <span className="text-[10px] text-slate-400 uppercase font-mono block">24h Change</span>
            {selectedQuote ? (
              <span
                className={`font-mono text-sm font-semibold flex items-center gap-0.5 tabular-nums ${
                  parseFloat(selectedQuote.changePercent) >= 0
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }`}
              >
                {parseFloat(selectedQuote.changePercent) >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {formatCurrency(selectedQuote.changeAmount)} (
                {selectedQuote.changePercent}%)
              </span>
            ) : (
              <span className="font-mono text-sm text-slate-400">---</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400 font-mono">
          <div>
            <span className="text-slate-500 block text-[10px]">24H HIGH</span>
            <span className="text-emerald-400 font-semibold">
              {selectedQuote ? formatCurrency(selectedQuote.highPrice) : '---'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">24H LOW</span>
            <span className="text-rose-400 font-semibold">
              {selectedQuote ? formatCurrency(selectedQuote.lowPrice) : '---'}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block text-[10px]">VOLUME</span>
            <span className="text-cyan-400 font-semibold">
              {selectedQuote ? formatNumber(selectedQuote.volume) : '---'}
            </span>
          </div>
          <Link
            to={`/markets/${selectedInstrument?.symbol || symbol}`}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs border border-cyan-500/30 px-2 py-1 rounded-lg hover:bg-cyan-500/10 transition-colors"
          >
            Full Chart <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Main Terminal Workspace: Chart Preview + Order Entry Desk */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Terminal Summary & OMS Information */}
        <div className="lg:col-span-2 space-y-4">
          <Card
            title={`${selectedInstrument?.symbol || symbol} Instrument Overview`}
            subtitle={`${selectedInstrument?.name || 'Loading company...'} • ${selectedInstrument?.exchange || 'TRADEGRID'} • ${selectedInstrument?.sector || 'General'}`}
          >
            <div className="p-4 bg-[#080C14] rounded-xl border border-card-border space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-3 bg-card rounded-lg border border-card-border">
                  <span className="text-[10px] text-slate-400 block uppercase">Exchange</span>
                  <span className="text-white font-bold">{selectedInstrument?.exchange}</span>
                </div>
                <div className="p-3 bg-card rounded-lg border border-card-border">
                  <span className="text-[10px] text-slate-400 block uppercase">Trading Status</span>
                  <span
                    className={`font-bold ${
                      selectedInstrument?.marketStatus === 'ACTIVE'
                        ? 'text-emerald-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {selectedInstrument?.marketStatus}
                  </span>
                </div>
                <div className="p-3 bg-card rounded-lg border border-card-border">
                  <span className="text-[10px] text-slate-400 block uppercase">Previous Close</span>
                  <span className="text-slate-200 font-bold">
                    {selectedQuote ? formatCurrency(selectedQuote.previousClose) : '---'}
                  </span>
                </div>
                <div className="p-3 bg-card rounded-lg border border-card-border">
                  <span className="text-[10px] text-slate-400 block uppercase">Currency</span>
                  <span className="text-indigo-400 font-bold">
                    {selectedInstrument?.currency || 'USD'}
                  </span>
                </div>
              </div>

              <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-lg flex items-start gap-2.5 text-xs font-mono text-cyan-300">
                <AlertCircle className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong>Order Management System (Phase 4A):</strong> Orders submitted here
                  are validated against buying power in MySQL and accepted as resting <code>OPEN</code>{' '}
                  orders. Continuous matching engine execution activates in Phase 4B.
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Stats Banner */}
          <div className="p-4 rounded-xl bg-card border border-card-border flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span className="text-slate-300">OMS Engine Connected</span>
            </div>
            <div className="text-slate-400">
              Open Orders: <strong className="text-white">{openOrders.length}</strong> | Order History:{' '}
              <strong className="text-white">{orderHistory.length}</strong>
            </div>
            <button
              onClick={() => fetchOrders()}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} /> Sync
            </button>
          </div>
        </div>

        {/* Right 1 Col: Live Order Entry Desk */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="Order Entry Desk" subtitle="Submit validated limit & market orders">
            {/* Feedback Notifications */}
            {successMessage && (
              <div className="p-3 mb-4 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{successMessage}</span>
                  <button
                    onClick={clearSuccess}
                    className="block text-[10px] underline text-emerald-400 mt-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {orderError && (
              <div className="p-3 mb-4 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{orderError}</span>
                  <button
                    onClick={clearError}
                    className="block text-[10px] underline text-rose-400 mt-1"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {/* Buy / Sell Tab Buttons */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-[#090D16] rounded-xl border border-card-border mb-4">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-2 rounded-lg text-xs font-mono font-bold transition-all ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-2 rounded-lg text-xs font-mono font-bold transition-all ${
                  orderSide === 'SELL'
                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
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
                className={`flex-1 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                  orderType === 'LIMIT'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 font-semibold'
                    : 'bg-transparent text-slate-400 border-card-border hover:bg-slate-800'
                }`}
              >
                LIMIT ORDER
              </button>
              <button
                type="button"
                onClick={() => setOrderType('MARKET')}
                className={`flex-1 py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                  orderType === 'MARKET'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 font-semibold'
                    : 'bg-transparent text-slate-400 border-card-border hover:bg-slate-800'
                }`}
              >
                MARKET ORDER
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
                disabled={isSubmitting}
              />

              {orderType === 'LIMIT' ? (
                <Input
                  label="Limit Price ($)"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              ) : (
                <div className="p-3 rounded-lg bg-[#090D16] border border-card-border text-xs font-mono">
                  <span className="text-[10px] text-slate-500 block uppercase">
                    Execution Mode
                  </span>
                  <span className="text-cyan-400 font-semibold">
                    Market Execution (Best available price)
                  </span>
                </div>
              )}

              {/* Order Calculations Summary */}
              <div className="p-3.5 rounded-xl bg-[#090D16] border border-card-border text-xs space-y-2 font-mono">
                <div className="flex justify-between text-slate-400">
                  <span>Available Virtual Cash:</span>
                  <span className="text-emerald-400 font-bold">
                    {formatCurrency(availableCash)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Total:</span>
                  <span
                    className={`font-bold ${
                      hasInsufficientFunds ? 'text-rose-400' : 'text-slate-100'
                    }`}
                  >
                    ${estimatedTotal}
                  </span>
                </div>
                {hasInsufficientFunds && (
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Insufficient funds to place this BUY order</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Execution Fee:</span>
                  <span>$0.00 (Virtual)</span>
                </div>
              </div>

              <Button
                type="submit"
                variant={orderSide === 'BUY' ? 'success' : 'danger'}
                className="w-full font-mono text-sm uppercase font-bold py-2.5"
                disabled={
                  isSubmitting ||
                  hasInsufficientFunds ||
                  parsedQty <= 0 ||
                  isLoadingDetail ||
                  selectedInstrument?.marketStatus !== 'ACTIVE'
                }
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Submitting...
                  </span>
                ) : (
                  `Submit ${orderSide} Order`
                )}
              </Button>
            </form>
          </Card>
        </div>
      </div>

      {/* Bottom Full-Width Orders Management Deck */}
      <Card
        title="Order Management Center"
        subtitle="Manage resting open orders and review historical order activity"
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-lg border border-card-border">
              <button
                onClick={() => setActiveTab('open')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                  activeTab === 'open'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Open Orders ({openOrders.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 text-xs font-mono rounded transition-colors ${
                  activeTab === 'history'
                    ? 'bg-cyan-500/20 text-cyan-300 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Order History ({orderHistory.length})
              </button>
            </div>
            <button
              onClick={() => fetchOrders()}
              className="p-1.5 rounded-lg bg-[#090D16] border border-card-border text-slate-400 hover:text-slate-200"
              title="Refresh Orders"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
            </button>
          </div>
        }
      >
        {activeTab === 'open' ? (
          openOrders.length === 0 ? (
            <div className="py-12 text-center text-slate-400 font-mono text-xs">
              <Clock className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <span>No open orders resting on the book. Submit an order above to begin trading.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-card-border text-slate-400 text-[11px] uppercase">
                    <th className="py-2.5 px-3">Order ID</th>
                    <th className="py-2.5 px-3">Symbol</th>
                    <th className="py-2.5 px-3">Side</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Remaining</th>
                    <th className="py-2.5 px-3 text-right">Price</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Submitted</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-card-border/60">
                  {openOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-2.5 px-3 text-slate-400">#{ord.id}</td>
                      <td className="py-2.5 px-3 font-bold text-white">{ord.symbol || '---'}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ord.side === 'BUY'
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {ord.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">{ord.orderType}</td>
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {parseFloat(ord.quantity).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-200">
                        {parseFloat(ord.remainingQuantity).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white">
                        {ord.limitPrice ? formatCurrency(ord.limitPrice) : 'MARKET'}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="cyan">{ord.status}</Badge>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        {formatDate(ord.createdAt)}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleCancelOrder(ord.id)}
                          disabled={cancellingOrderId === ord.id}
                          className="px-2.5 py-1 text-[11px]"
                        >
                          {cancellingOrderId === ord.id ? (
                            <RefreshCw className="w-3 h-3 animate-spin" />
                          ) : (
                            <span className="flex items-center gap-1">
                              <Ban className="w-3 h-3" /> Cancel
                            </span>
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : orderHistory.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs">
            <CheckCircle className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <span>No historical order executions or cancellations recorded yet.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-card-border text-slate-400 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3 text-right">Quantity</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/60">
                {orderHistory.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-2.5 px-3 text-slate-400">#{ord.id}</td>
                    <td className="py-2.5 px-3 font-bold text-white">{ord.symbol || '---'}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ord.side === 'BUY'
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-rose-500/15 text-rose-400'
                        }`}
                      >
                        {ord.side}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-300">{ord.orderType}</td>
                    <td className="py-2.5 px-3 text-right text-slate-200">
                      {parseFloat(ord.quantity).toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-white">
                      {ord.limitPrice ? formatCurrency(ord.limitPrice) : 'MARKET'}
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge
                        variant={
                          ord.status === 'FILLED'
                            ? 'gain'
                            : ord.status === 'CANCELLED'
                            ? 'neutral'
                            : 'loss'
                        }
                      >
                        {ord.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {formatDate(ord.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
