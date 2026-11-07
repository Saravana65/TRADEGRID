import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { useWalletStore } from '../store/walletStore';
import { useOrderStore } from '../store/orderStore';
import { useAuthStore } from '../store/authStore';
import { tradeApiService } from '../services/trade.service';
import { socketService } from '../services/socket.service';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Badge } from '../components/common/Badge';
import { OrderSide, OrderType, OrderBook, Trade } from '@tradegrid/shared-types';
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
  Activity,
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

  const { user } = useAuthStore();
  const lastBookSeq = useRef<number>(0);

  // Phase 4B / 5A: Live Order Book & Trade Tape State
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [isLoadingBook, setIsLoadingBook] = useState(false);

  // Fetch Order Book & Market Tape Initial Baseline
  const fetchMarketDepth = useCallback(async () => {
    if (!symbol) return;
    try {
      setIsLoadingBook(true);
      const [bookData, tapeData] = await Promise.allSettled([
        tradeApiService.getOrderBook(symbol, 10),
        tradeApiService.getRecentMarketTrades(symbol, 30),
      ]);
      if (bookData.status === 'fulfilled') {
        setOrderBook(bookData.value);
        if ((bookData.value as any).sequence) {
          lastBookSeq.current = (bookData.value as any).sequence;
        }
      }
      if (tapeData.status === 'fulfilled') {
        setRecentTrades(tapeData.value);
      }
    } catch {
      // Silently catch baseline errors
    } finally {
      setIsLoadingBook(false);
    }
  }, [symbol]);

  // Initial Data Fetching
  useEffect(() => {
    fetchInstruments();
    fetchWalletSummary();
    fetchOrders();
  }, [fetchInstruments, fetchWalletSummary, fetchOrders]);

  // Load details & order book when symbol changes
  useEffect(() => {
    if (symbol) {
      fetchInstrumentDetail(symbol);
      fetchMarketDepth();
    }
  }, [symbol, fetchInstrumentDetail, fetchMarketDepth]);

  // Phase 5A: Real-Time WebSocket Streaming Subscriptions & Handlers
  useEffect(() => {
    if (!symbol) return;
    const normSymbol = symbol.toUpperCase();
    const obChannel = `orderbook:${normSymbol}`;
    const tradesChannel = `trades:${normSymbol}`;
    const marketChannel = `market:${normSymbol}`;
    const userChannel = user?.id ? `user:${user.id}` : null;

    // Connect and subscribe to symbol channels
    socketService.connect();
    socketService.subscribe(obChannel);
    socketService.subscribe(tradesChannel);
    socketService.subscribe(marketChannel);
    if (userChannel) {
      socketService.subscribe(userChannel);
    }

    // 1. Order Book Snapshot Handler
    const handleSnapshot = (snap: any) => {
      if (snap.symbol?.toUpperCase() === normSymbol) {
        lastBookSeq.current = snap.sequence || 0;
        setOrderBook(snap);
      }
    };

    // 2. Order Book Depth Incremental Update Handler (with Sequence Gap Recovery)
    const handleDepthUpdate = (update: any) => {
      if (update.symbol?.toUpperCase() === normSymbol) {
        // Detect sequence gap for recovery
        if (lastBookSeq.current > 0 && update.prevSequence && update.prevSequence !== lastBookSeq.current) {
          console.warn(
            `[WS] OrderBook sequence gap detected on ${normSymbol} (expected #${lastBookSeq.current}, got prev #${update.prevSequence}). Requesting snapshot recovery.`
          );
          socketService.requestOrderBookSnapshot(normSymbol);
          return;
        }

        lastBookSeq.current = update.sequence;
        setOrderBook({
          symbol: update.symbol,
          instrumentId: update.instrumentId,
          bids: update.bids,
          asks: update.asks,
          spread: update.spread,
          midPrice: update.midPrice,
          timestamp: update.timestamp,
        });
      }
    };

    // 3. Trade Tape Stream Handler
    const handleTapeUpdate = (trade: any) => {
      if (trade.symbol?.toUpperCase() === normSymbol) {
        setRecentTrades((prev) => [trade, ...prev.slice(0, 29)]);
      }
    };

    // 4. Private Order Lifecycle Handlers
    const handleOrderEvent = () => {
      fetchOrders();
    };

    // 5. Portfolio & Cash Update Handler
    const handlePortfolioEvent = () => {
      fetchWalletSummary();
    };

    socketService.on('orderbook:snapshot', handleSnapshot);
    socketService.on('orderbook:depth_update', handleDepthUpdate);
    socketService.on('trade:tape_update', handleTapeUpdate);
    socketService.on('order:accepted', handleOrderEvent);
    socketService.on('order:partially_filled', handleOrderEvent);
    socketService.on('order:filled', handleOrderEvent);
    socketService.on('order:cancelled', handleOrderEvent);
    socketService.on('portfolio:updated', handlePortfolioEvent);

    return () => {
      socketService.unsubscribe(obChannel);
      socketService.unsubscribe(tradesChannel);
      socketService.unsubscribe(marketChannel);
      if (userChannel) {
        socketService.unsubscribe(userChannel);
      }
      socketService.off('orderbook:snapshot', handleSnapshot);
      socketService.off('orderbook:depth_update', handleDepthUpdate);
      socketService.off('trade:tape_update', handleTapeUpdate);
      socketService.off('order:accepted', handleOrderEvent);
      socketService.off('order:partially_filled', handleOrderEvent);
      socketService.off('order:filled', handleOrderEvent);
      socketService.off('order:cancelled', handleOrderEvent);
      socketService.off('portfolio:updated', handlePortfolioEvent);
    };
  }, [symbol, user?.id, fetchOrders, fetchWalletSummary]);

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

      // Refresh orders, wallet, and order book
      fetchOrders();
      fetchWalletSummary();
      fetchMarketDepth();
    } catch {
      // Error handled by store
    }
  };

  // Order Cancellation Handler
  const handleCancelOrder = async (orderId: number) => {
    try {
      await cancelOrder(orderId);
      fetchOrders();
      fetchMarketDepth();
    } catch {
      // Error handled by store
    }
  };

  // Filter Orders
  const openOrders = orders.filter(
    (o) => o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED' || o.status === 'PENDING'
  );
  const orderHistory = orders.filter(
    (o) => o.status !== 'OPEN' && o.status !== 'PARTIALLY_FILLED' && o.status !== 'PENDING'
  );

  const filteredInstruments = instruments.filter(
    (inst) =>
      inst.symbol.toLowerCase().includes(symbolSearch.toLowerCase()) ||
      inst.name.toLowerCase().includes(symbolSearch.toLowerCase())
  );

  // Maximum quantity for relative depth bars
  const maxAskQty = Math.max(
    ...(orderBook?.asks.map((a) => parseFloat(a.quantity)) || [1]),
    1
  );
  const maxBidQty = Math.max(
    ...(orderBook?.bids.map((b) => parseFloat(b.quantity)) || [1]),
    1
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

      {/* Main Terminal Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Terminal Summary, LOB & Trade Tape */}
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
                  <strong>Continuous Matching Engine & Atomic Settlement (Phase 4B):</strong> Orders
                  submitted match against resting counterparty orders according to strict price-time
                  priority. Trades atomically settle through the double-entry virtual cash ledger and
                  real-time equity positions.
                </div>
              </div>
            </div>
          </Card>

          {/* Phase 4B: Live Order Book & Trade Tape Deck */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Order Book */}
            <Card
              title="Order Book (LOB)"
              subtitle="Live bids & asks depth ladder (FIFO)"
              action={
                <button
                  onClick={fetchMarketDepth}
                  className="p-1 rounded bg-[#090D16] border border-card-border text-slate-400 hover:text-slate-200"
                  title="Refresh Depth"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBook ? 'animate-spin' : ''}`} />
                </button>
              }
            >
              <div className="p-3 bg-[#080C14] rounded-xl border border-card-border font-mono text-xs space-y-2">
                <div className="grid grid-cols-3 text-[10px] text-slate-500 uppercase border-b border-card-border/60 pb-1.5 font-semibold">
                  <span>Price (USD)</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Total</span>
                </div>

                {/* Asks (Sell Orders) - Display in reverse to place best ask closest to mid price */}
                <div className="space-y-1">
                  {!orderBook || orderBook.asks.length === 0 ? (
                    <div className="py-3 text-center text-slate-500 text-[11px]">
                      No resting asks on the book
                    </div>
                  ) : (
                    [...orderBook.asks].reverse().slice(0, 6).map((ask, idx) => {
                      const depthPct = Math.min(
                        100,
                        Math.round((parseFloat(ask.quantity) / maxAskQty) * 100)
                      );
                      return (
                        <div
                          key={`ask-${idx}`}
                          className="relative grid grid-cols-3 py-0.5 px-1 rounded hover:bg-rose-950/20 tabular-nums overflow-hidden"
                        >
                          <div
                            className="absolute top-0 right-0 bottom-0 bg-rose-500/10 pointer-events-none"
                            style={{ width: `${depthPct}%` }}
                          />
                          <span className="text-rose-400 font-semibold relative z-10">
                            {formatCurrency(ask.price)}
                          </span>
                          <span className="text-right text-slate-300 relative z-10">
                            {parseFloat(ask.quantity).toFixed(2)}
                          </span>
                          <span className="text-right text-slate-400 relative z-10">
                            {parseFloat(ask.total).toFixed(2)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Spread & Mid-Price Bar */}
                <div className="py-1.5 px-2 bg-card rounded border border-card-border/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">
                    Spread:{' '}
                    <strong className="text-slate-200">
                      {orderBook?.spread ? formatCurrency(orderBook.spread) : '---'}
                    </strong>
                  </span>
                  <span className="text-cyan-400 font-bold">
                    Mid: {orderBook?.midPrice ? formatCurrency(orderBook.midPrice) : '---'}
                  </span>
                </div>

                {/* Bids (Buy Orders) */}
                <div className="space-y-1">
                  {!orderBook || orderBook.bids.length === 0 ? (
                    <div className="py-3 text-center text-slate-500 text-[11px]">
                      No resting bids on the book
                    </div>
                  ) : (
                    orderBook.bids.slice(0, 6).map((bid, idx) => {
                      const depthPct = Math.min(
                        100,
                        Math.round((parseFloat(bid.quantity) / maxBidQty) * 100)
                      );
                      return (
                        <div
                          key={`bid-${idx}`}
                          className="relative grid grid-cols-3 py-0.5 px-1 rounded hover:bg-emerald-950/20 tabular-nums overflow-hidden"
                        >
                          <div
                            className="absolute top-0 right-0 bottom-0 bg-emerald-500/10 pointer-events-none"
                            style={{ width: `${depthPct}%` }}
                          />
                          <span className="text-emerald-400 font-semibold relative z-10">
                            {formatCurrency(bid.price)}
                          </span>
                          <span className="text-right text-slate-300 relative z-10">
                            {parseFloat(bid.quantity).toFixed(2)}
                          </span>
                          <span className="text-right text-slate-400 relative z-10">
                            {parseFloat(bid.total).toFixed(2)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </Card>

            {/* Recent Executed Trades Tape */}
            <Card
              title="Recent Trades"
              subtitle="Live exchange executions tape"
              action={
                <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <Activity className="w-3.5 h-3.5 animate-pulse" /> Live
                </div>
              }
            >
              <div className="p-3 bg-[#080C14] rounded-xl border border-card-border font-mono text-xs space-y-2">
                <div className="grid grid-cols-3 text-[10px] text-slate-500 uppercase border-b border-card-border/60 pb-1.5 font-semibold">
                  <span>Price (USD)</span>
                  <span className="text-right">Quantity</span>
                  <span className="text-right">Time</span>
                </div>

                <div className="space-y-1 max-h-[268px] overflow-y-auto pr-1">
                  {recentTrades.length === 0 ? (
                    <div className="py-12 text-center text-slate-500 text-[11px]">
                      No recent trade executions yet
                    </div>
                  ) : (
                    recentTrades.slice(0, 10).map((trd) => {
                      const dateObj = new Date(trd.createdAt);
                      const timeStr = dateObj.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      });
                      return (
                        <div
                          key={trd.id}
                          className="grid grid-cols-3 py-1 px-1 rounded hover:bg-slate-800/40 tabular-nums items-center text-[11px]"
                        >
                          <span className="font-semibold text-emerald-400 flex items-center gap-1">
                            {formatCurrency(trd.price)}
                            {(trd as any).isBot && (
                              <span className="px-1 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                BOT
                              </span>
                            )}
                          </span>
                          <span className="text-right text-slate-200">
                            {parseFloat(trd.quantity).toFixed(2)}
                          </span>
                          <span className="text-right text-slate-500 text-[10px]">
                            {timeStr}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Quick Stats Banner */}
          <div className="p-4 rounded-xl bg-card border border-card-border flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-300">Matching Engine & Settlement Active</span>
            </div>
            <div className="text-slate-400">
              Open / Partial Orders: <strong className="text-white">{openOrders.length}</strong> | Executed Trades:{' '}
              <strong className="text-white">{recentTrades.length}</strong>
            </div>
            <button
              onClick={() => {
                fetchOrders();
                fetchMarketDepth();
              }}
              className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingOrders ? 'animate-spin' : ''}`} /> Sync All
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

            <form onSubmit={handlePlaceOrder} className="space-y-4">
              {/* Buy / Sell Tabs */}
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#090D16] rounded-xl border border-card-border">
                <button
                  type="button"
                  onClick={() => setOrderSide('BUY')}
                  className={`py-2 text-xs font-mono font-bold rounded-lg transition-colors ${
                    orderSide === 'BUY'
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setOrderSide('SELL')}
                  className={`py-2 text-xs font-mono font-bold rounded-lg transition-colors ${
                    orderSide === 'SELL'
                      ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SELL
                </button>
              </div>

              {/* Order Type Tabs */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOrderType('LIMIT')}
                  className={`py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                    orderType === 'LIMIT'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-card border-card-border text-slate-400 hover:text-white'
                  }`}
                >
                  LIMIT ORDER
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType('MARKET')}
                  className={`py-1.5 text-xs font-mono rounded-lg border transition-colors ${
                    orderType === 'MARKET'
                      ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                      : 'bg-card border-card-border text-slate-400 hover:text-white'
                  }`}
                >
                  MARKET ORDER
                </button>
              </div>

              {/* Limit Price Input (Only for LIMIT orders) */}
              {orderType === 'LIMIT' && (
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1.5">
                    Limit Price (USD)
                  </label>
                  <Input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder="Enter limit price"
                    required
                  />
                  <div className="flex justify-between items-center mt-1 text-[11px] text-slate-500 font-mono">
                    <span>Last Market Price:</span>
                    <span>
                      {selectedQuote ? formatCurrency(selectedQuote.lastPrice) : '$0.00'}
                    </span>
                  </div>
                </div>
              )}

              {/* Quantity Input */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5">
                  Quantity (Shares)
                </label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="Enter share count"
                  required
                />
                <div className="flex gap-2 mt-1.5">
                  {['1', '5', '10', '25', '50'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setQuantity(`${preset}.0000`)}
                      className="flex-1 py-1 text-[10px] font-mono bg-card border border-card-border rounded hover:border-cyan-500 text-slate-400 hover:text-white transition-colors"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated Total Calculation */}
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
                Active Orders ({openOrders.length})
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
                      <td className="py-2.5 px-3 font-bold text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{ord.symbol || '---'}</span>
                          {(ord as any).isBot && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                              BOT
                            </span>
                          )}
                        </div>
                      </td>
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
                      <td className="py-2.5 px-3 text-right font-bold text-cyan-300">
                        {parseFloat(ord.remainingQuantity).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-white">
                        {ord.limitPrice ? formatCurrency(ord.limitPrice) : 'MARKET'}
                      </td>
                      <td className="py-2.5 px-3">
                        {ord.status === 'PARTIALLY_FILLED' ? (
                          <Badge variant="amber">
                            PARTIAL ({parseFloat(ord.remainingQuantity).toFixed(2)} left)
                          </Badge>
                        ) : (
                          <Badge variant="cyan">{ord.status}</Badge>
                        )}
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
                    <td className="py-2.5 px-3 font-bold text-white">
                      <div className="flex items-center gap-1.5">
                        <span>{ord.symbol || '---'}</span>
                        {(ord as any).isBot && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                            BOT
                          </span>
                        )}
                      </div>
                    </td>
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
                            : ord.status === 'PARTIALLY_FILLED'
                            ? 'amber'
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
