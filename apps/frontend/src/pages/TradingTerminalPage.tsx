import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { useWalletStore } from '../store/walletStore';
import { useOrderStore } from '../store/orderStore';
import { tradeApiService } from '../services/trade.service';
import { portfolioApiService } from '../services/portfolio.service';
import { socketService } from '../services/socket.service';
import { formatCurrency, formatNumber, formatDate } from '../utils/formatters';
import { Button } from '../components/common/Button';
import { AdvancedTradingChart } from '../components/charting/AdvancedTradingChart';
import {
  OrderSide,
  OrderType,
  OrderBook,
  Trade,
  PortfolioPosition,
} from '@tradegrid/shared-types';
import {
  ArrowUpRight,
  ArrowDownRight,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';

export const TradingTerminalPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'TGRID').toUpperCase();

  // Stores
  const {
    instruments,
    selectedInstrument,
    selectedQuote,
    fetchInstruments,
    fetchInstrumentDetail,
    quotes,
  } = useMarketStore();

  const { balance: availableCash, fetchWalletSummary } = useWalletStore();
  const {
    orders,
    isLoading: isSubmitting,
    cancellingOrderId,
    error: orderError,
    successMessage,
    fetchOrders,
    createOrder,
    cancelOrder,
    clearError,
    clearSuccess,
  } = useOrderStore();

  // Panels visibility state
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [leftTab, setLeftTab] = useState<'ALL' | 'SIMULATED' | 'REAL'>('ALL');
  const [symbolSearch, setSymbolSearch] = useState('');

  // Order Form State
  const [orderSide, setOrderSide] = useState<OrderSide>('BUY');
  const [orderType, setOrderType] = useState<OrderType>('LIMIT');
  const [quantity, setQuantity] = useState('10');
  const [limitPrice, setLimitPrice] = useState('142.50');

  // Bottom dock active tab
  const [bottomTab, setBottomTab] = useState<'open' | 'positions' | 'history' | 'trades'>('open');

  // Market Depth & Tape
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [portfolioPositions, setPortfolioPositions] = useState<PortfolioPosition[]>([]);

  // Initial load
  useEffect(() => {
    fetchWalletSummary();
    fetchOrders();
    fetchInstruments();
    portfolioApiService.getPortfolioSummary().then((res) => {
      setPortfolioPositions(res.positions || []);
    }).catch(() => {});
  }, [fetchWalletSummary, fetchOrders, fetchInstruments]);

  // Load symbol detail & market depth
  useEffect(() => {
    fetchInstrumentDetail(symbol);

    tradeApiService.getOrderBook(symbol, 10).then(setOrderBook).catch(() => {});
    tradeApiService.getRecentMarketTrades(symbol, 20).then(setRecentTrades).catch(() => {});

    // Subscribe to symbol channels
    const bookChannel = `orderbook:${symbol}`;
    const tradesChannel = `trades:${symbol}`;
    socketService.subscribe(bookChannel);
    socketService.subscribe(tradesChannel);

    const handleDepth = (depthEvent: any) => {
      if (depthEvent?.symbol?.toUpperCase() === symbol) {
        setOrderBook((prev) => ({
          symbol,
          instrumentId: prev?.instrumentId || selectedInstrument?.id || 1,
          bids: depthEvent.depth?.bids || prev?.bids || [],
          asks: depthEvent.depth?.asks || prev?.asks || [],
          timestamp: depthEvent.timestamp || new Date().toISOString(),
        }));
      }
    };

    const handleTradeTape = (tradeEvent: any) => {
      if (tradeEvent?.symbol?.toUpperCase() === symbol && tradeEvent?.trade) {
        setRecentTrades((prev) => [tradeEvent.trade, ...prev.slice(0, 24)]);
      }
    };

    socketService.on('orderbook:depth_update', handleDepth);
    socketService.on('trade:tape_update', handleTradeTape);

    return () => {
      socketService.unsubscribe(bookChannel);
      socketService.unsubscribe(tradesChannel);
      socketService.off('orderbook:depth_update', handleDepth);
      socketService.off('trade:tape_update', handleTradeTape);
    };
  }, [symbol, fetchInstrumentDetail]);

  // Pre-fill limit price with current quote price when symbol changes
  useEffect(() => {
    if (selectedQuote?.lastPrice) {
      setLimitPrice(parseFloat(selectedQuote.lastPrice).toFixed(2));
    }
  }, [selectedQuote?.lastPrice, symbol]);

  // Filter instruments on LEFT panel
  const filteredInstruments = useMemo(() => {
    return instruments.filter((inst) => {
      const matchesSearch =
        inst.symbol.toLowerCase().includes(symbolSearch.toLowerCase()) ||
        inst.name.toLowerCase().includes(symbolSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (leftTab === 'ALL') return true;
      return inst.dataClassification === leftTab;
    });
  }, [instruments, symbolSearch, leftTab]);

  // Order execution handler
  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    clearSuccess();

    const targetInstrument = selectedInstrument || instruments.find((i) => i.symbol === symbol);
    if (!targetInstrument) return;

    const parsedQty = parseFloat(quantity);
    const parsedPrice = orderType === 'MARKET' ? undefined : parseFloat(limitPrice);

    if (isNaN(parsedQty) || parsedQty <= 0) return;

    try {
      await createOrder({
        instrumentId: targetInstrument.id,
        side: orderSide,
        orderType: orderType,
        quantity: parsedQty.toFixed(4),
        limitPrice: parsedPrice ? parsedPrice.toFixed(4) : null,
      });
      // Refresh wallet & orders
      fetchWalletSummary();
      fetchOrders();
    } catch {
      // Handled by orderStore
    }
  };

  // Quick allocation helper
  const handleSetAllocation = (percent: number) => {
    const price = parseFloat(limitPrice) || 100;
    const cash = typeof availableCash === 'number' ? availableCash : parseFloat(availableCash || '0') || 100000;
    const maxAffordable = (cash * (percent / 100)) / price;
    setQuantity(Math.max(1, Math.floor(maxAffordable)).toString());
  };

  const estimatedTotal = (parseFloat(quantity) || 0) * (parseFloat(limitPrice) || 0);

  // Filtered orders
  const openOrders = orders.filter((o) => o.status === 'OPEN' || o.status === 'PENDING');
  const pastOrders = orders.filter((o) => o.status !== 'OPEN' && o.status !== 'PENDING');

  const isRealEquity = selectedInstrument?.dataClassification === 'REAL';
  const ltp = selectedQuote ? parseFloat(selectedQuote.lastPrice) : 142.50;
  const changeAmt = selectedQuote ? parseFloat(selectedQuote.changeAmount) : 0.0;
  const changePct = selectedQuote ? parseFloat(selectedQuote.changePercent) : 0.0;
  const isPos = changePct >= 0;

  return (
    <div className="space-y-4 select-none font-sans">
      {/* 1. Symbol Header Bar */}
      <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Symbol & Classification Badge */}
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold font-sans text-slate-900 dark:text-white tracking-tight">
              {symbol}
            </h1>
            <span className="text-xs text-slate-500 dark:text-neutral-400 font-medium hidden sm:inline">
              {selectedInstrument?.name}
            </span>
            <span
              className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                isRealEquity
                  ? 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-800 dark:text-neutral-200 border border-slate-200 dark:border-[#2E2E2E]'
                  : 'bg-slate-100 dark:bg-[#141414] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#262626]'
              }`}
            >
              {selectedInstrument?.dataClassification || 'SIMULATED'}
            </span>
          </div>

          <div className="h-6 w-px bg-slate-200 dark:bg-[#1F1F1F] hidden md:block" />

          {/* LTP & 24h Change */}
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
              {formatCurrency(ltp)}
            </span>
            <span
              className={`inline-flex items-center text-xs font-bold font-mono tabular-nums ${
                isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {isPos ? <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> : <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />}
              {isPos ? '+' : ''}
              {changeAmt.toFixed(2)} ({isPos ? '+' : ''}
              {changePct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* 24h High/Low/Volume + Technical Studio Link */}
        <div className="flex items-center gap-4 text-xs font-mono tabular-nums">
          <div className="hidden sm:block">
            <span className="text-[10px] text-slate-400 dark:text-neutral-500 uppercase block font-sans">
              24h High
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              {selectedQuote?.highPrice ? formatCurrency(parseFloat(selectedQuote.highPrice)) : '---'}
            </span>
          </div>
          <div className="hidden sm:block">
            <span className="text-[10px] text-slate-400 dark:text-neutral-500 uppercase block font-sans">
              24h Low
            </span>
            <span className="font-semibold text-rose-600 dark:text-rose-400">
              {selectedQuote?.lowPrice ? formatCurrency(parseFloat(selectedQuote.lowPrice)) : '---'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 dark:text-neutral-500 uppercase block font-sans">
              Volume
            </span>
            <span className="font-semibold text-slate-800 dark:text-neutral-200">
              {selectedQuote?.volume ? formatNumber(selectedQuote.volume) : '---'}
            </span>
          </div>
          <Link
            to={`/chart?symbol=${symbol}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#141414] hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-black text-slate-800 dark:text-neutral-200 border border-slate-200 dark:border-[#262626] text-xs font-sans font-semibold transition-colors"
          >
            Technical Studio
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* 2. Main 3-Column Work Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* LEFT PANEL: Watchlist & Search (Collapsible, 3 cols) */}
        {!isLeftPanelCollapsed ? (
          <div className="lg:col-span-3 bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl p-3.5 shadow-sm flex flex-col h-[540px]">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-[#1F1F1F]">
              <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Watchlist
              </span>
              <button
                onClick={() => setIsLeftPanelCollapsed(true)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#171717] transition-colors"
                title="Collapse Watchlist"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Category Filter Chips */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141414] p-0.5 rounded-xl mb-2.5 border border-slate-200 dark:border-[#222222]">
              {(['ALL', 'SIMULATED', 'REAL'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setLeftTab(t)}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                    leftTab === t
                      ? 'bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t === 'ALL' ? 'All' : t === 'SIMULATED' ? 'Simulated' : 'NSE'}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-neutral-500" />
              <input
                type="text"
                placeholder="Search symbol..."
                value={symbolSearch}
                onChange={(e) => setSymbolSearch(e.target.value)}
                className="w-full bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-xl pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none"
              />
            </div>

            {/* Instruments Scroll List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              {filteredInstruments.map((inst) => {
                const q = quotes[inst.symbol];
                const price = q?.lastPrice ? parseFloat(q.lastPrice) : 100.0;
                const pct = q?.changePercent ? parseFloat(q.changePercent) : 0.0;
                const isItemPos = pct >= 0;
                const isSelected = inst.symbol === symbol;

                return (
                  <button
                    key={inst.id}
                    onClick={() => setSearchParams({ symbol: inst.symbol })}
                    className={`w-full text-left p-2 rounded-xl transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-slate-100 dark:bg-[#171717] border border-slate-300 dark:border-[#2E2E2E]'
                        : 'hover:bg-slate-50 dark:hover:bg-[#121212] border border-transparent'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 dark:text-white">
                          {inst.symbol}
                        </span>
                        <span className="text-[9px] px-1 py-0.2 rounded font-mono text-slate-500 dark:text-neutral-400">
                          {inst.exchange}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 dark:text-neutral-400 truncate block max-w-[110px]">
                        {inst.name}
                      </span>
                    </div>

                    <div className="text-right font-mono tabular-nums text-xs">
                      <span className="font-bold text-slate-900 dark:text-white block">
                        {formatCurrency(price)}
                      </span>
                      <span
                        className={`text-[10px] font-semibold ${
                          isItemPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {isItemPos ? '+' : ''}
                        {pct.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="lg:col-span-1 flex flex-col items-center py-4 bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl h-[540px]">
            <button
              onClick={() => setIsLeftPanelCollapsed(false)}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#171717] transition-colors"
              title="Expand Watchlist"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-[10px] text-slate-400 [writing-mode:vertical-rl] mt-6 font-bold tracking-wider uppercase">
              Watchlist
            </span>
          </div>
        )}

        {/* CENTER PANEL: Large Candlestick Chart (6 to 8 cols) */}
        <div className={isLeftPanelCollapsed ? 'lg:col-span-8' : 'lg:col-span-6'}>
          <AdvancedTradingChart
            symbol={symbol}
            height={540}
            showToolbar={true}
            dataClassification={selectedInstrument?.dataClassification || 'SIMULATED'}
          />
        </div>

        {/* RIGHT PANEL: Order Execution & Order Book (3 cols) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Order Placement Box */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl p-4 shadow-sm space-y-3.5">
            {/* BUY / SELL Action Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-[#141414] rounded-xl border border-slate-200 dark:border-[#222222]">
              <button
                type="button"
                onClick={() => setOrderSide('BUY')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                  orderSide === 'BUY'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                BUY
              </button>
              <button
                type="button"
                onClick={() => setOrderSide('SELL')}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all ${
                  orderSide === 'SELL'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                SELL
              </button>
            </div>

            {/* Error / Success Feedback */}
            {orderError && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-400 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{orderError}</span>
              </div>
            )}
            {successMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleOrderSubmit} className="space-y-3">
              {/* Order Type Chips */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-neutral-400 font-semibold text-[11px]">Type</span>
                <div className="flex items-center gap-1">
                  {(['LIMIT', 'MARKET'] as OrderType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setOrderType(t)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        orderType === t
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                          : 'text-slate-500 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-[#1A1A1A]'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <label className="text-slate-600 dark:text-neutral-400 font-semibold">Quantity</label>
                  <span className="text-slate-400 dark:text-neutral-500 font-mono">Shares</span>
                </div>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                  required
                />
              </div>

              {/* Quick % Chips */}
              <div className="grid grid-cols-4 gap-1">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => handleSetAllocation(pct)}
                    className="py-1 rounded-lg bg-slate-100 dark:bg-[#141414] hover:bg-slate-200 dark:hover:bg-[#1F1F1F] text-[10px] font-mono text-slate-700 dark:text-neutral-300 transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              {/* Limit Price */}
              {orderType === 'LIMIT' && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <label className="text-slate-600 dark:text-neutral-400 font-semibold">Price (INR)</label>
                    <span className="text-slate-400 dark:text-neutral-500 font-mono">Limit</span>
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-slate-400"
                    required
                  />
                </div>
              )}

              {/* Order Preview Summary */}
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#222222] text-xs font-mono space-y-1 text-slate-600 dark:text-neutral-400">
                <div className="flex items-center justify-between">
                  <span>Est. Total</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {formatCurrency(estimatedTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span>Brokerage</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">₹0.00 (Free)</span>
                </div>
                <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-200 dark:border-[#262626]">
                  <span>Avail. Cash</span>
                  <span className="text-slate-800 dark:text-white">{formatCurrency(availableCash)}</span>
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant={orderSide === 'BUY' ? 'success' : 'danger'}
                className="w-full py-2 font-bold text-xs"
                isLoading={isSubmitting}
              >
                Place {orderSide} Order
              </Button>
            </form>
          </div>

          {/* Level 2 Order Book */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl p-3.5 shadow-sm space-y-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-[#1F1F1F] text-xs">
              <span className="font-bold text-slate-900 dark:text-white text-[11px] uppercase tracking-wider">
                Order Book
              </span>
              <span className="text-[10px] text-slate-400 font-mono">L2 Depth</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono tabular-nums">
              {/* Bids */}
              <div>
                <span className="text-[10px] text-emerald-600 font-bold block mb-1">BIDS</span>
                <div className="space-y-0.5">
                  {(orderBook?.bids || []).slice(0, 5).map((b, i) => (
                    <div key={i} className="flex justify-between text-slate-700 dark:text-neutral-300">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{b.price}</span>
                      <span className="text-slate-500">{b.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Asks */}
              <div>
                <span className="text-[10px] text-rose-600 font-bold block mb-1 text-right">ASKS</span>
                <div className="space-y-0.5">
                  {(orderBook?.asks || []).slice(0, 5).map((a, i) => (
                    <div key={i} className="flex justify-between text-slate-700 dark:text-neutral-300">
                      <span className="text-slate-500">{a.quantity}</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">{a.price}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM PANEL: Open Orders, Positions, Order History, Trades */}
      <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl p-4 shadow-sm space-y-3">
        {/* Navigation Tabs */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-[#1F1F1F]">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141414] p-1 rounded-xl border border-slate-200 dark:border-[#222222]">
            {(
              [
                { id: 'open', label: `Open Orders (${openOrders.length})` },
                { id: 'positions', label: `Positions (${portfolioPositions.length})` },
                { id: 'history', label: `Order History (${pastOrders.length})` },
                { id: 'trades', label: `Market Trades (${recentTrades.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setBottomTab(t.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  bottomTab === t.id
                    ? 'bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab 1: Open Orders */}
        {bottomTab === 'open' && (
          <div className="overflow-x-auto">
            {openOrders.length === 0 ? (
              <div className="py-6 text-center text-slate-400 dark:text-neutral-500 text-xs">
                No active open orders in this session.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#1F1F1F] text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2 px-3">Order ID</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3">Side</th>
                    <th className="py-2 px-3 text-right">Qty</th>
                    <th className="py-2 px-3 text-right">Price</th>
                    <th className="py-2 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#171717]">
                  {openOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-[#121212]">
                      <td className="py-2.5 px-3 font-mono text-slate-500">#{ord.id}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{ord.symbol}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                            ord.side === 'BUY'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                          }`}
                        >
                          {ord.side}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{ord.quantity}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                        {ord.limitPrice ? formatCurrency(parseFloat(ord.limitPrice)) : 'MARKET'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => cancelOrder(ord.id)}
                          disabled={cancellingOrderId === ord.id}
                          className="px-2.5 py-1 rounded bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-600 hover:text-white text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 text-[11px] font-semibold transition-colors"
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 2: Positions / Holdings */}
        {bottomTab === 'positions' && (
          <div className="overflow-x-auto">
            {portfolioPositions.length === 0 ? (
              <div className="py-6 text-center text-slate-400 dark:text-neutral-500 text-xs">
                No active stock holdings in your portfolio.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#1F1F1F] text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3 text-right">Shares</th>
                    <th className="py-2 px-3 text-right">Avg Cost</th>
                    <th className="py-2 px-3 text-right">Current LTP</th>
                    <th className="py-2 px-3 text-right">Unrealized P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#171717]">
                  {portfolioPositions.map((h) => {
                    const pnlNum = parseFloat(h.unrealizedPnL || '0');
                    const isProfit = pnlNum >= 0;
                    return (
                      <tr key={h.symbol} className="hover:bg-slate-50 dark:hover:bg-[#121212]">
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{h.symbol}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">{h.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                          {formatCurrency(parseFloat(h.averageBuyPrice || '0'))}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold">
                          {formatCurrency(parseFloat(h.currentPrice || '0'))}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold">
                          <span className={isProfit ? 'text-emerald-600' : 'text-rose-600'}>
                            {isProfit ? '+' : ''}
                            {formatCurrency(pnlNum)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 3: Order History */}
        {bottomTab === 'history' && (
          <div className="overflow-x-auto">
            {pastOrders.length === 0 ? (
              <div className="py-6 text-center text-slate-400 dark:text-neutral-500 text-xs">
                No past executions recorded yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#1F1F1F] text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2 px-3">Order ID</th>
                    <th className="py-2 px-3">Symbol</th>
                    <th className="py-2 px-3">Side</th>
                    <th className="py-2 px-3 text-right">Quantity</th>
                    <th className="py-2 px-3 text-center">Status</th>
                    <th className="py-2 px-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#171717]">
                  {pastOrders.slice(0, 10).map((ord) => (
                    <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-[#121212]">
                      <td className="py-2.5 px-3 font-mono text-slate-500">#{ord.id}</td>
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">{ord.symbol}</td>
                      <td className="py-2.5 px-3 font-bold text-[10px]">{ord.side}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">{ord.quantity}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[#1C1C1C] text-slate-700 dark:text-neutral-300">
                          {ord.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 text-[11px] font-mono">
                        {formatDate(ord.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 4: Market Trades */}
        {bottomTab === 'trades' && (
          <div className="overflow-x-auto">
            {recentTrades.length === 0 ? (
              <div className="py-6 text-center text-slate-400 dark:text-neutral-500 text-xs">
                Waiting for trade prints...
              </div>
            ) : (
              <table className="w-full text-left text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-[#1F1F1F] text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-2 px-3">Execution Price</th>
                    <th className="py-2 px-3 text-right">Quantity</th>
                    <th className="py-2 px-3 text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#171717]">
                  {recentTrades.slice(0, 15).map((t, idx) => (
                    <tr key={t.id || idx} className="hover:bg-slate-50 dark:hover:bg-[#121212]">
                      <td className="py-2 px-3 font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(parseFloat(t.price))}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-800 dark:text-neutral-200">
                        {t.quantity}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400 text-[11px]">
                        {new Date(t.createdAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
