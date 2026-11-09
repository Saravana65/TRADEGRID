import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { useWalletStore } from '../store/walletStore';
import { useOrderStore } from '../store/orderStore';
import { useAuthStore } from '../store/authStore';
import { tradeApiService } from '../services/trade.service';
import { newsApiService } from '../services/news.service';
import { socketService } from '../services/socket.service';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Badge } from '../components/common/Badge';
import { AdvancedTradingChart } from '../components/charting/AdvancedTradingChart';
import { OrderSide, OrderType, OrderBook, Trade, ActiveCatalystSummary } from '@tradegrid/shared-types';
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
  Radio,
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

  // Live Order Book & Trade Tape State
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [isLoadingBook, setIsLoadingBook] = useState(false);
  const [activeCatalyst, setActiveCatalyst] = useState<ActiveCatalystSummary | null>(null);

  // Active Catalyst Impact for Current Symbol / Sector
  const checkActiveCatalysts = useCallback(async () => {
    try {
      const catalysts = await newsApiService.getActiveCatalysts();
      const sym = (selectedInstrument?.symbol || symbol).toUpperCase();
      const sec = selectedInstrument?.sector;
      const matching = catalysts.find(
        (c) =>
          (c.targetScope === 'INSTRUMENT' && c.targetSymbol?.toUpperCase() === sym) ||
          (c.targetScope === 'SECTOR' &&
            c.targetSector &&
            sec &&
            c.targetSector.toLowerCase() === sec.toLowerCase()) ||
          c.targetScope === 'MARKET'
      );
      setActiveCatalyst(matching || null);
    } catch {
      // Silently catch catalyst lookup
    }
  }, [selectedInstrument, symbol]);

  // Fetch Order Book & Market Tape Initial Baseline
  const fetchMarketDepth = useCallback(async () => {
    const sym = selectedInstrument?.symbol || symbol;
    if (!sym) return;
    setIsLoadingBook(true);
    try {
      const [bookData, tradesData] = await Promise.all([
        tradeApiService.getOrderBook(sym, 12),
        tradeApiService.getRecentMarketTrades(sym, 20),
      ]);
      setOrderBook(bookData);
      setRecentTrades(tradesData);
      lastBookSeq.current = (bookData as any).sequenceNumber || 0;
    } catch {
      // Fallback
    } finally {
      setIsLoadingBook(false);
    }
  }, [selectedInstrument, symbol]);

  // Initial Boot & Route Param Listeners
  useEffect(() => {
    fetchInstruments();
    fetchOrders();
    fetchWalletSummary();
  }, [fetchInstruments, fetchOrders, fetchWalletSummary]);

  useEffect(() => {
    if (symbol) {
      fetchInstrumentDetail(symbol);
    }
  }, [symbol, fetchInstrumentDetail]);

  useEffect(() => {
    fetchMarketDepth();
    checkActiveCatalysts();
  }, [fetchMarketDepth, checkActiveCatalysts]);

  // Real-time WebSocket Channel Bindings
  useEffect(() => {
    const activeSym = symbol.toUpperCase();
    const obChannel = `orderbook:${activeSym}`;
    const tradesChannel = `trades:${activeSym}`;
    const marketChannel = `market:${activeSym}`;
    const userChannel = user?.id ? `user:${user.id}` : null;

    socketService.subscribe(obChannel);
    socketService.subscribe(tradesChannel);
    socketService.subscribe(marketChannel);
    socketService.subscribe('news');
    if (userChannel) {
      socketService.subscribe(userChannel);
    }

    const handleSnapshot = (snapshot: OrderBook) => {
      if (snapshot.symbol.toUpperCase() === activeSym) {
        setOrderBook(snapshot);
        lastBookSeq.current = (snapshot as any).sequenceNumber || 0;
      }
    };

    const handleDepthUpdate = (delta: { symbol: string; sequenceNumber: number; orderBook: OrderBook }) => {
      if (delta.symbol.toUpperCase() === activeSym) {
        setOrderBook(delta.orderBook);
        lastBookSeq.current = delta.sequenceNumber || 0;
      }
    };

    const handleTapeUpdate = (newTrades: Trade[]) => {
      setRecentTrades((prev) => {
        const filtered = newTrades.filter(
          (t) => t.symbol?.toUpperCase() === activeSym || !t.symbol
        );
        const combined = [...filtered, ...prev];
        const unique = Array.from(new Map(combined.map((t) => [t.id, t])).values());
        return unique.slice(0, 30);
      });
    };

    const handleOrderEvent = () => {
      fetchOrders();
    };

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

    const handleNewsChange = () => {
      checkActiveCatalysts();
    };

    socketService.on('news:published', handleNewsChange);
    socketService.on('news:updated', handleNewsChange);
    socketService.on('news:expired', handleNewsChange);
    socketService.on('news:catalyst:started', handleNewsChange);
    socketService.on('news:catalyst:completed', handleNewsChange);

    return () => {
      socketService.unsubscribe(obChannel);
      socketService.unsubscribe(tradesChannel);
      socketService.unsubscribe(marketChannel);
      socketService.unsubscribe('news');
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
      socketService.off('news:published', handleNewsChange);
      socketService.off('news:updated', handleNewsChange);
      socketService.off('news:expired', handleNewsChange);
      socketService.off('news:catalyst:started', handleNewsChange);
      socketService.off('news:catalyst:completed', handleNewsChange);
    };
  }, [symbol, user?.id, fetchOrders, fetchWalletSummary, checkActiveCatalysts]);

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

  // Percentage preset calculation
  const handleQuickPercent = (pct: number) => {
    if (orderSide === 'BUY') {
      if (effectivePrice <= 0) return;
      const budget = parsedCash * pct;
      const calculatedShares = Math.floor((budget / effectivePrice) * 100) / 100;
      setQuantity(calculatedShares.toFixed(4));
    } else {
      setQuantity((10 * pct * 2).toFixed(4));
    }
  };

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
      // Handled by store
    }
  };

  // Order Cancellation Handler
  const handleCancelOrder = async (orderId: number) => {
    try {
      await cancelOrder(orderId);
      fetchOrders();
      fetchMarketDepth();
    } catch {
      // Handled by store
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
      <div className="bg-card border border-card-border p-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setShowSymbolPicker(!showSymbolPicker)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#070A12] border border-slate-200 dark:border-card-border hover:border-cyan-500/50 transition-colors shadow-sm"
            >
              <span className="font-sans text-xl font-bold text-slate-900 dark:text-white tracking-tight">
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
              <div className="absolute top-full left-0 mt-2 w-80 max-h-80 bg-white dark:bg-card border border-slate-200 dark:border-card-border rounded-2xl shadow-2xl p-2 z-50 overflow-y-auto">
                <input
                  type="text"
                  placeholder="Search NSE / Simulated symbols..."
                  value={symbolSearch}
                  onChange={(e) => setSymbolSearch(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#070A12] border border-slate-200 dark:border-card-border rounded-xl text-xs font-sans text-slate-900 dark:text-white mb-2 focus:outline-none focus:border-cyan-500"
                  autoFocus
                />
                <div className="space-y-1">
                  {filteredInstruments.slice(0, 10).map((inst) => (
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
                        <span className="text-[10px] text-slate-400 truncate block max-w-[150px]">
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
            to={`/chart?symbol=${selectedInstrument?.symbol || symbol}`}
            className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300 text-xs border border-cyan-500/30 px-2.5 py-1.5 rounded-lg hover:bg-cyan-500/10 transition-colors font-mono font-semibold"
          >
            Technical Studio <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Active News Catalyst Banner for Current Symbol */}
      {activeCatalyst && (
        <div className="bg-purple-950/40 border border-purple-800/50 p-3 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-mono shadow-md">
          <div className="flex items-center gap-2.5 text-purple-200">
            <Radio className="w-4 h-4 text-purple-400 animate-pulse flex-shrink-0" />
            <div>
              <span className="font-bold text-purple-300 mr-2">
                ACTIVE NEWS CATALYST ({activeCatalyst.targetScope === 'INSTRUMENT' ? `$${activeCatalyst.targetSymbol}` : activeCatalyst.targetScope}):
              </span>
              <span>{activeCatalyst.headline}</span>
              <span className="text-purple-400 ml-2 font-semibold">
                (Vol: {activeCatalyst.volatilityFactor}x • Decay: {activeCatalyst.decayRemainingPercent}% remaining)
              </span>
            </div>
          </div>
          <Badge variant="simulated">PARTICIPATION SHIFT</Badge>
        </div>
      )}

      {/* Main Terminal Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: Central Trading Chart + Order Book + Recent Trades */}
        <div className="lg:col-span-2 space-y-4">
          {/* PRIMARY LIVE TRADING CHART */}
          <AdvancedTradingChart
            symbol={selectedInstrument?.symbol || symbol}
            height={440}
            showToolbar={true}
            dataClassification={
              selectedInstrument?.dataClassification === 'REAL' ? 'REAL' : 'SIMULATED'
            }
          />

          {/* Live Order Book & Trade Tape Deck */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Order Book */}
            <Card
              title="Order Book (Depth)"
              subtitle="Live bids & asks depth ladder (FIFO)"
              action={
                <button
                  onClick={fetchMarketDepth}
                  className="p-1.5 rounded-xl bg-slate-100 dark:bg-[#070A12] border border-slate-200 dark:border-card-border text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-sm"
                  title="Refresh Depth"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBook ? 'animate-spin' : ''}`} />
                </button>
              }
            >
              <div className="p-3.5 bg-slate-50 dark:bg-[#070A12] rounded-2xl border border-slate-200 dark:border-card-border font-sans text-xs space-y-2">
                <div className="grid grid-cols-3 text-[10px] text-slate-500 uppercase border-b border-slate-200 dark:border-card-border/60 pb-1.5 font-bold">
                  <span>Price ({selectedInstrument?.currency || 'INR'})</span>
                  <span className="text-right">Size</span>
                  <span className="text-right">Total</span>
                </div>

                {/* Asks (Sell Orders) */}
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
              title="Recent Executions"
              subtitle="Live exchange trade tape"
              action={
                <div className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <Activity className="w-3.5 h-3.5 animate-pulse" /> Live
                </div>
              }
            >
              <div className="p-3.5 bg-slate-50 dark:bg-[#070A12] rounded-2xl border border-slate-200 dark:border-card-border font-sans text-xs space-y-2">
                <div className="grid grid-cols-3 text-[10px] text-slate-500 uppercase border-b border-slate-200 dark:border-card-border/60 pb-1.5 font-bold">
                  <span>Price</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Time</span>
                </div>

                <div className="space-y-1 max-h-[250px] overflow-y-auto pr-1">
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
        </div>

        {/* Right 1 Col: Live Order Entry Desk */}
        <div className="lg:col-span-1 space-y-4">
          <Card title="Order Entry Ticket" subtitle="Place virtual market & limit orders">
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
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-[#070A12] rounded-xl border border-slate-200 dark:border-card-border">
                <button
                  type="button"
                  onClick={() => setOrderSide('BUY')}
                  className={`py-2 text-xs font-sans font-bold rounded-lg transition-colors ${
                    orderSide === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  BUY
                </button>
                <button
                  type="button"
                  onClick={() => setOrderSide('SELL')}
                  className={`py-2 text-xs font-sans font-bold rounded-lg transition-colors ${
                    orderSide === 'SELL'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
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
                  LIMIT
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
                  MARKET
                </button>
              </div>

              {/* Limit Price Input */}
              {orderType === 'LIMIT' && (
                <div>
                  <label className="block text-xs font-mono text-slate-400 mb-1.5">
                    Limit Price ({selectedInstrument?.currency || 'INR'})
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
                    <span>LTP:</span>
                    <span>
                      {selectedQuote ? formatCurrency(selectedQuote.lastPrice) : '---'}
                    </span>
                  </div>
                </div>
              )}

              {/* Quantity Input with Percentage Presets */}
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
                <div className="grid grid-cols-4 gap-1.5 mt-1.5">
                  {[
                    { label: '25%', val: 0.25 },
                    { label: '50%', val: 0.5 },
                    { label: '75%', val: 0.75 },
                    { label: '100%', val: 1.0 },
                  ].map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleQuickPercent(p.val)}
                      className="py-1 text-xs font-mono font-medium bg-slate-100 dark:bg-[#070A12] border border-slate-200 dark:border-card-border rounded-lg hover:border-cyan-500 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated Total Calculation */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#070A12] border border-slate-200 dark:border-card-border text-xs space-y-2 font-sans">
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Available Virtual Cash:</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold font-mono tabular-nums">
                    {formatCurrency(availableCash)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400">
                  <span>Order Consideration:</span>
                  <span
                    className={`font-bold font-mono tabular-nums ${
                      hasInsufficientFunds ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    ${estimatedTotal}
                  </span>
                </div>
                {hasInsufficientFunds && (
                  <div className="p-2 rounded bg-rose-950/40 border border-rose-800/40 text-rose-300 text-[11px] flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Insufficient virtual cash for this order</span>
                  </div>
                )}
                <div className="flex justify-between text-slate-500 text-[10px]">
                  <span>Execution Fee:</span>
                  <span>$0.00 (Zero Commissions)</span>
                </div>
              </div>

              <Button
                type="submit"
                variant={orderSide === 'BUY' ? 'success' : 'danger'}
                className="w-full font-mono text-sm uppercase font-bold py-2.5 shadow-lg"
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
                  `Execute ${orderSide} Order`
                )}
              </Button>
            </form>
          </Card>

          {/* Instrument Metadata Details Card */}
          <div className="p-4 bg-card rounded-xl border border-card-border text-xs font-mono space-y-2.5">
            <div className="flex justify-between text-slate-400">
              <span>Exchange / Sector</span>
              <span className="text-slate-200 font-bold">
                {selectedInstrument?.exchange || 'NSE'} • {selectedInstrument?.sector || 'General'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Instrument Type</span>
              <span className="text-slate-200 font-bold">
                {selectedInstrument?.instrumentType || 'EQUITY'}
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Trading Session</span>
              <span className="text-emerald-400 font-bold">Continuous 24/7 Virtual</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Full-Width Orders Management Deck */}
      <Card
        title="Order Management Center"
        subtitle="Manage resting open orders and review historical executions"
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#070A12] p-1 rounded-xl border border-slate-200 dark:border-card-border">
              <button
                onClick={() => setActiveTab('open')}
                className={`px-3 py-1.5 text-xs font-sans rounded-lg transition-colors ${
                  activeTab === 'open'
                    ? 'bg-cyan-50 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Active Orders ({openOrders.length})
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1.5 text-xs font-sans rounded-lg transition-colors ${
                  activeTab === 'history'
                    ? 'bg-cyan-50 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Order History ({orderHistory.length})
              </button>
            </div>
            <button
              onClick={() => fetchOrders()}
              className="p-2 rounded-xl bg-slate-100 dark:bg-[#070A12] border border-slate-200 dark:border-card-border text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-sm"
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
            <span>No historical executions or cancellations recorded yet.</span>
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
