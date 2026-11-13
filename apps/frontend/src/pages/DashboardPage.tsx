import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { useOrderStore } from '../store/orderStore';
import { tradeApiService } from '../services/trade.service';
import { portfolioApiService } from '../services/portfolio.service';
import { socketService } from '../services/socket.service';
import { formatCurrency } from '../utils/formatters';
import { AdvancedTradingChart } from '../components/charting/AdvancedTradingChart';
import { DashboardWalletSummary } from '../components/dashboard/DashboardWalletSummary';
import { MarketWatchlistPanel } from '../components/dashboard/MarketWatchlistPanel';
import { QuickOrderModal } from '../components/trading/QuickOrderModal';
import { AITradingAssistant } from '../components/ai/AITradingAssistant';
import {
  Instrument,
  OrderSide,
  OrderBook,
  Trade,
  PortfolioPosition,
  ActiveCatalystSummary,
} from '@tradegrid/shared-types';
import { newsApiService } from '../services/news.service';
import {
  TrendingUp,
  TrendingDown,
  Maximize2,
  Radio,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbolParam = searchParams.get('symbol');

  // Stores
  const {
    instruments,
    quotes,
    selectedInstrument,
    selectedQuote,
    fetchInstruments,
    fetchQuotes,
    fetchInstrumentDetail,
  } = useMarketStore();

  const { orders, cancellingOrderId, cancelOrder, fetchOrders } = useOrderStore();

  // Active Symbol State
  const [activeSymbol, setActiveSymbol] = useState<string>(
    symbolParam?.toUpperCase() || 'TGRID'
  );

  // Quick Order Modal State
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [orderModalSide, setOrderModalSide] = useState<OrderSide>('BUY');

  // Under-Chart Dock Tab State
  const [dockTab, setDockTab] = useState<'overview' | 'depth' | 'positions' | 'trades'>('overview');

  // Market Depth & Tape Data
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [userPositions, setUserPositions] = useState<PortfolioPosition[]>([]);

  // Mobile Watchlist Tab Toggle
  const [mobileTab, setMobileTab] = useState<'chart' | 'watchlist'>('chart');

  // Live price flash indicator for active header
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  // Active Catalysts State (Phase 5C)
  const [activeCatalysts, setActiveCatalysts] = useState<ActiveCatalystSummary[]>([]);

  // Real-time Market News Catalyst Subscriptions
  useEffect(() => {
    const loadCatalysts = () => {
      newsApiService
        .getActiveCatalysts()
        .then((data) => {
          setActiveCatalysts(data || []);
        })
        .catch(() => {});
    };

    loadCatalysts();
    socketService.subscribe('news');

    socketService.on('news:published', loadCatalysts);
    socketService.on('news:catalyst:started', loadCatalysts);
    socketService.on('news:expired', loadCatalysts);
    socketService.on('news:catalyst:completed', loadCatalysts);

    return () => {
      socketService.off('news:published', loadCatalysts);
      socketService.off('news:catalyst:started', loadCatalysts);
      socketService.off('news:expired', loadCatalysts);
      socketService.off('news:catalyst:completed', loadCatalysts);
      socketService.unsubscribe('news');
    };
  }, []);

  // Initial Data Load
  useEffect(() => {
    fetchInstruments();
    fetchQuotes();
    fetchOrders();
    portfolioApiService.getPortfolioSummary().then((res) => {
      setUserPositions(res.positions || []);
    }).catch(() => {});
  }, [fetchInstruments, fetchQuotes, fetchOrders]);

  // Load active symbol details & depth
  useEffect(() => {
    if (!activeSymbol) return;
    fetchInstrumentDetail(activeSymbol);

    // Fetch Level 2 Depth & Recent Trades
    tradeApiService.getOrderBook(activeSymbol, 8).then(setOrderBook).catch(() => {});
    tradeApiService.getRecentMarketTrades(activeSymbol, 15).then(setRecentTrades).catch(() => {});

    // Subscribe to symbol WebSocket channels
    const marketRoom = `market:${activeSymbol}`;
    const bookRoom = `orderbook:${activeSymbol}`;
    const tradesRoom = `trades:${activeSymbol}`;

    socketService.subscribe(marketRoom);
    socketService.subscribe(bookRoom);
    socketService.subscribe(tradesRoom);

    const handlePriceUpdate = (event: any) => {
      if (event?.symbol?.toUpperCase() === activeSymbol.toUpperCase()) {
        const change = parseFloat(event.changeAmount || '0');
        setPriceFlash(change >= 0 ? 'up' : 'down');
        setTimeout(() => setPriceFlash(null), 800);
      }
    };

    const handleDepth = (depthEvent: any) => {
      if (depthEvent?.symbol?.toUpperCase() === activeSymbol.toUpperCase()) {
        setOrderBook((prev) => ({
          symbol: activeSymbol,
          instrumentId: prev?.instrumentId || 1,
          bids: depthEvent.depth?.bids || prev?.bids || [],
          asks: depthEvent.depth?.asks || prev?.asks || [],
          timestamp: depthEvent.timestamp || new Date().toISOString(),
        }));
      }
    };

    const handleTradeTape = (tradeEvent: any) => {
      if (tradeEvent?.symbol?.toUpperCase() === activeSymbol.toUpperCase() && tradeEvent?.trade) {
        setRecentTrades((prev) => [tradeEvent.trade, ...prev.slice(0, 14)]);
      }
    };

    socketService.on('market:price_update', handlePriceUpdate);
    socketService.on('orderbook:depth_update', handleDepth);
    socketService.on('trade:executed', handleTradeTape);

    return () => {
      socketService.unsubscribe(marketRoom);
      socketService.unsubscribe(bookRoom);
      socketService.unsubscribe(tradesRoom);
      socketService.off('market:price_update', handlePriceUpdate);
      socketService.off('orderbook:depth_update', handleDepth);
      socketService.off('trade:executed', handleTradeTape);
    };
  }, [activeSymbol, fetchInstrumentDetail]);

  // Handle symbol change from Watchlist or Search
  const handleSelectSymbol = (newSymbol: string) => {
    const sym = newSymbol.toUpperCase();
    setActiveSymbol(sym);
    setSearchParams({ symbol: sym });
    setMobileTab('chart'); // switch back to chart view on mobile
  };

  // Open Quick Order Modal
  const handleOpenOrder = (side: OrderSide) => {
    setOrderModalSide(side);
    setIsOrderModalOpen(true);
  };

  // Active Instrument & Quote Data
  const currentInstrument = useMemo((): Instrument => {
    const found =
      selectedInstrument ||
      instruments.find((i) => i.symbol.toUpperCase() === activeSymbol.toUpperCase());
    if (found) return found;

    return {
      id: 1,
      symbol: activeSymbol,
      name: `${activeSymbol} Corporation`,
      exchange: 'NSE',
      sector: 'Technology',
      instrumentType: 'EQUITY',
      currency: 'USD',
      marketStatus: 'ACTIVE',
      dataClassification: 'SIMULATED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }, [selectedInstrument, instruments, activeSymbol]);

  const currentQuote = quotes[activeSymbol.toUpperCase()] || selectedQuote;

  const lastPrice = currentQuote?.lastPrice ? parseFloat(currentQuote.lastPrice) : 142.50;
  const openPrice = currentQuote?.openPrice ? parseFloat(currentQuote.openPrice) : lastPrice * 0.995;
  const highPrice = currentQuote?.highPrice ? parseFloat(currentQuote.highPrice) : lastPrice * 1.018;
  const lowPrice = currentQuote?.lowPrice ? parseFloat(currentQuote.lowPrice) : lastPrice * 0.985;
  const prevClose = currentQuote?.previousClose ? parseFloat(currentQuote.previousClose) : lastPrice * 0.99;
  const changeAmt = currentQuote?.changeAmount ? parseFloat(currentQuote.changeAmount) : lastPrice - prevClose;
  const changePct = currentQuote?.changePercent ? parseFloat(currentQuote.changePercent) : (changeAmt / prevClose) * 100;
  const volume = currentQuote?.volume ? parseInt(String(currentQuote.volume), 10) : 1245000;

  const isPositive = changePct >= 0;

  // Day Range Calculation (Percentage slider)
  const dayRangeSpread = highPrice - lowPrice || 1;
  const dayRangeProgress = Math.min(
    100,
    Math.max(0, ((lastPrice - lowPrice) / dayRangeSpread) * 100)
  );

  // Active Symbol Positions & Open Orders
  const mySymbolPositions = userPositions.filter((p) => p.symbol.toUpperCase() === activeSymbol.toUpperCase());
  const mySymbolOpenOrders = orders.filter(
    (o) => (o.status === 'OPEN' || o.status === 'PENDING') && o.symbol?.toUpperCase() === activeSymbol.toUpperCase()
  );

  return (
    <div className="space-y-4 select-none font-sans transition-colors duration-200">
      {/* Mobile Tab Switcher (Visible on small screens only) */}
      <div className="lg:hidden flex items-center p-1 bg-neutral-100 dark:bg-[#141414] rounded-2xl border border-neutral-200 dark:border-[#222222]">
        <button
          onClick={() => setMobileTab('chart')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
            mobileTab === 'chart'
              ? 'bg-white dark:bg-[#222222] text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          Trading Terminal & Chart
        </button>
        <button
          onClick={() => setMobileTab('watchlist')}
          className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
            mobileTab === 'watchlist'
              ? 'bg-white dark:bg-[#222222] text-neutral-900 dark:text-white shadow-sm'
              : 'text-neutral-500 hover:text-neutral-900 dark:hover:text-white'
          }`}
        >
          Market Watchlist
        </button>
      </div>

      {/* Active Catalyst Market Alert Banner */}
      {activeCatalysts.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 sm:p-4 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm animate-fadeIn">
          <div className="flex items-center gap-3 overflow-hidden">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-600 text-white font-mono text-[11px] font-bold tracking-wider uppercase shrink-0">
              <Radio className="w-3 h-3 animate-ping" />
              MARKET CRASH ALERT
            </span>
            <div className="truncate">
              <p className="text-xs sm:text-sm font-bold text-rose-700 dark:text-rose-400 truncate">
                {activeCatalysts[0].headline}
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 font-medium">
                Scope: {activeCatalysts[0].targetScope} {activeCatalysts[0].targetSymbol ? `(${activeCatalysts[0].targetSymbol})` : ''} • Severity: {activeCatalysts[0].severity} • Direction: {activeCatalysts[0].impactDirection}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-700 dark:text-rose-300 font-bold">
              Vol: {activeCatalysts[0].volatilityFactor}x | Shock: {activeCatalysts[0].sentimentScore}
            </span>
            <Link
              to="/news"
              className="text-xs font-bold text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 whitespace-nowrap"
            >
              Wire Details →
            </Link>
          </div>
        </div>
      )}

      {/* Main Responsive Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ========================================================================= */}
        {/* LEFT / CENTER: Groww-Inspired Main Chart & Dock Area (Cols 1-8 / 1-9)      */}
        {/* ========================================================================= */}
        <div
          className={`lg:col-span-8 xl:col-span-9 space-y-4 ${
            mobileTab === 'watchlist' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* 1. GROWW-STYLE STOCK DETAIL HEADER */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors duration-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              {/* Left: Symbol, Name, Badges & Price */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-white">
                    {currentInstrument.symbol}
                  </h1>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-neutral-100 dark:bg-[#1A1A1A] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-[#262626]">
                    {currentInstrument.exchange || 'NSE'}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded ${
                      currentInstrument.dataClassification === 'REAL'
                        ? 'bg-neutral-100 dark:bg-[#1A1A1A] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-[#262626]'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                    }`}
                  >
                    {currentInstrument.dataClassification || 'SIMULATED'}
                  </span>
                </div>

                <p className="text-xs text-neutral-500 dark:text-neutral-400 font-medium">
                  {currentInstrument.name} • {currentInstrument.sector || 'Equities'}
                </p>

                {/* Live Price Display & Flash */}
                <div className="flex items-baseline gap-3 pt-1">
                  <span
                    className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums transition-colors duration-300 ${
                      priceFlash === 'up'
                        ? 'text-emerald-500'
                        : priceFlash === 'down'
                        ? 'text-rose-500'
                        : 'text-neutral-900 dark:text-white'
                    }`}
                  >
                    {formatCurrency(lastPrice)}
                  </span>

                  <div
                    className={`inline-flex items-center gap-1 font-mono font-bold text-sm tabular-nums ${
                      isPositive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    <span>
                      {isPositive ? '+' : ''}
                      {changeAmt.toFixed(2)} ({isPositive ? '+' : ''}
                      {changePct.toFixed(2)}%)
                    </span>
                    <span className="text-[11px] font-sans text-neutral-400 font-normal">
                      Today
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Quick Terminal Navigation & Action */}
              <div className="flex items-center gap-2">
                <Link
                  to={`/terminal?symbol=${activeSymbol}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-neutral-200 dark:border-[#262626] text-xs font-semibold text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1A1A1A] transition-colors shadow-sm"
                  title="Open in Dedicated Trading Terminal"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Advanced Studio</span>
                </Link>
              </div>
            </div>

            {/* Quick Metrics Bar & Day's Range Visual Bar */}
            <div className="mt-4 pt-3 border-t border-neutral-100 dark:border-[#1F1F1F] grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs font-mono">
              <div>
                <span className="text-[10px] text-neutral-400 uppercase font-sans font-bold block">
                  Today&apos;s Open
                </span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {formatCurrency(openPrice)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 uppercase font-sans font-bold block">
                  Prev. Close
                </span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {formatCurrency(prevClose)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-neutral-400 uppercase font-sans font-bold block">
                  Volume (Shares)
                </span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {volume.toLocaleString()}
                </span>
              </div>
              <div className="col-span-2 sm:col-span-1 lg:col-span-2">
                <div className="flex items-center justify-between text-[10px] text-neutral-400 mb-1">
                  <span>Low: {formatCurrency(lowPrice)}</span>
                  <span className="font-bold text-neutral-700 dark:text-neutral-300">
                    Day&apos;s Range
                  </span>
                  <span>High: {formatCurrency(highPrice)}</span>
                </div>
                {/* Visual Range Slider */}
                <div className="w-full h-1.5 bg-neutral-100 dark:bg-[#1F1F1F] rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${dayRangeProgress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2. MAIN CANDLESTICK CHART */}
          <div className="relative">
            <AdvancedTradingChart
              symbol={activeSymbol}
              height={500}
              showToolbar={true}
              dataClassification={currentInstrument.dataClassification}
            />
          </div>

          {/* 3. UNDER-CHART TABBED DOCK */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl p-4 shadow-sm transition-colors duration-200 space-y-3">
            {/* Dock Navigation Tabs */}
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100 dark:border-[#1F1F1F]">
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-[#141414] p-1 rounded-xl border border-neutral-200 dark:border-[#222222]">
                {(
                  [
                    { id: 'overview', label: 'Company Overview & Stats' },
                    { id: 'depth', label: 'Market Depth (L2 Book)' },
                    {
                      id: 'positions',
                      label: `My Holdings (${mySymbolPositions.length})`,
                    },
                    {
                      id: 'trades',
                      label: `Market Tape (${recentTrades.length})`,
                    },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setDockTab(t.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      dockTab === t.id
                        ? 'bg-white dark:bg-[#262626] text-neutral-900 dark:text-white shadow-sm'
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 1: Fundamentals & Stats */}
            {dockTab === 'overview' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 text-xs font-mono">
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#121212] border border-neutral-100 dark:border-[#1F1F1F]">
                  <span className="text-[10px] text-neutral-400 font-sans block uppercase font-bold">
                    52 Week High
                  </span>
                  <span className="text-sm font-bold text-neutral-900 dark:text-white tabular-nums">
                    {formatCurrency(highPrice * 1.35)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#121212] border border-neutral-100 dark:border-[#1F1F1F]">
                  <span className="text-[10px] text-neutral-400 font-sans block uppercase font-bold">
                    52 Week Low
                  </span>
                  <span className="text-sm font-bold text-neutral-900 dark:text-white tabular-nums">
                    {formatCurrency(lowPrice * 0.72)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#121212] border border-neutral-100 dark:border-[#1F1F1F]">
                  <span className="text-[10px] text-neutral-400 font-sans block uppercase font-bold">
                    Market Cap (Virtual)
                  </span>
                  <span className="text-sm font-bold text-neutral-900 dark:text-white tabular-nums">
                    {formatCurrency(lastPrice * 12500000)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-[#121212] border border-neutral-100 dark:border-[#1F1F1F]">
                  <span className="text-[10px] text-neutral-400 font-sans block uppercase font-bold">
                    Settlement Type
                  </span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    T+0 Instant Atomic
                  </span>
                </div>
              </div>
            )}

            {/* Tab 2: Market Depth L2 */}
            {dockTab === 'depth' && (
              <div className="pt-2">
                <div className="grid grid-cols-2 gap-4 text-xs font-mono tabular-nums">
                  {/* Bids Ladder */}
                  <div>
                    <span className="text-[10px] font-sans font-bold text-emerald-600 dark:text-emerald-400 block mb-1 uppercase">
                      Buyers (Bids)
                    </span>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-neutral-100 dark:border-[#1F1F1F] text-[10px] text-neutral-400">
                          <th className="py-1">Price</th>
                          <th className="py-1 text-right">Orders</th>
                          <th className="py-1 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-[#171717]">
                        {(orderBook?.bids || []).slice(0, 5).map((b, i) => (
                          <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-[#141414]">
                            <td className="py-1 font-bold text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(parseFloat(b.price))}
                            </td>
                            <td className="py-1 text-right text-neutral-400">{b.orderCount}</td>
                            <td className="py-1 text-right text-neutral-800 dark:text-neutral-200">
                              {b.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Asks Ladder */}
                  <div>
                    <span className="text-[10px] font-sans font-bold text-rose-600 dark:text-rose-400 block mb-1 uppercase">
                      Sellers (Asks)
                    </span>
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-neutral-100 dark:border-[#1F1F1F] text-[10px] text-neutral-400">
                          <th className="py-1">Price</th>
                          <th className="py-1 text-right">Orders</th>
                          <th className="py-1 text-right">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-[#171717]">
                        {(orderBook?.asks || []).slice(0, 5).map((a, i) => (
                          <tr key={i} className="hover:bg-neutral-50 dark:hover:bg-[#141414]">
                            <td className="py-1 font-bold text-rose-600 dark:text-rose-400">
                              {formatCurrency(parseFloat(a.price))}
                            </td>
                            <td className="py-1 text-right text-neutral-400">{a.orderCount}</td>
                            <td className="py-1 text-right text-neutral-800 dark:text-neutral-200">
                              {a.quantity}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Positions & Open Orders */}
            {dockTab === 'positions' && (
              <div className="pt-2 space-y-3">
                {mySymbolPositions.length === 0 && mySymbolOpenOrders.length === 0 ? (
                  <div className="py-8 text-center text-xs text-neutral-400 font-sans">
                    No active positions or pending orders for {activeSymbol}.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {mySymbolPositions.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-neutral-500 uppercase block mb-1">
                          Active Holdings
                        </span>
                        <table className="w-full text-left text-xs font-mono tabular-nums">
                          <thead>
                            <tr className="border-b border-neutral-100 dark:border-[#1F1F1F] text-[10px] text-neutral-400">
                              <th className="py-1">Shares</th>
                              <th className="py-1 text-right">Avg Cost</th>
                              <th className="py-1 text-right">LTP</th>
                              <th className="py-1 text-right">Unrealized P&L</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mySymbolPositions.map((pos) => {
                              const pnl = parseFloat(pos.unrealizedPnL || '0');
                              return (
                                <tr key={pos.id} className="border-b border-neutral-100 dark:border-[#171717]">
                                  <td className="py-1.5 font-bold text-neutral-900 dark:text-white">
                                    {pos.quantity}
                                  </td>
                                  <td className="py-1.5 text-right text-neutral-500">
                                    {formatCurrency(parseFloat(pos.averageBuyPrice))}
                                  </td>
                                  <td className="py-1.5 text-right font-bold text-neutral-900 dark:text-white">
                                    {formatCurrency(parseFloat(pos.currentPrice))}
                                  </td>
                                  <td
                                    className={`py-1.5 text-right font-bold ${
                                      pnl >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                    }`}
                                  >
                                    {pnl >= 0 ? '+' : ''}
                                    {formatCurrency(pnl)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {mySymbolOpenOrders.length > 0 && (
                      <div>
                        <span className="text-[11px] font-bold text-neutral-500 uppercase block mb-1">
                          Resting Open Orders
                        </span>
                        <div className="space-y-1.5">
                          {mySymbolOpenOrders.map((ord) => (
                            <div
                              key={ord.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-neutral-50 dark:bg-[#141414] border border-neutral-100 dark:border-[#1F1F1F] text-xs font-mono"
                            >
                              <div className="flex items-center gap-2">
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                    ord.side === 'BUY' ? 'text-emerald-500' : 'text-rose-500'
                                  }`}
                                >
                                  {ord.side}
                                </span>
                                <span>{ord.quantity} shares</span>
                                <span className="text-neutral-400">@</span>
                                <span>{ord.limitPrice ? formatCurrency(parseFloat(ord.limitPrice)) : 'MKT'}</span>
                              </div>
                              <button
                                onClick={() => cancelOrder(ord.id)}
                                disabled={cancellingOrderId === ord.id}
                                className="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-600 text-[10px] font-bold hover:bg-rose-600 hover:text-white transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Market Tape */}
            {dockTab === 'trades' && (
              <div className="pt-2">
                <table className="w-full text-left text-xs font-mono tabular-nums">
                  <thead>
                    <tr className="border-b border-neutral-100 dark:border-[#1F1F1F] text-[10px] text-neutral-400">
                      <th className="py-1">Time</th>
                      <th className="py-1 text-right">Price</th>
                      <th className="py-1 text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-[#171717]">
                    {recentTrades.slice(0, 8).map((t, i) => (
                      <tr key={t.id || i} className="hover:bg-neutral-50 dark:hover:bg-[#141414]">
                        <td className="py-1 text-neutral-400 text-[10px]">
                          {new Date(t.createdAt).toLocaleTimeString()}
                        </td>
                        <td className="py-1 text-right font-bold text-emerald-600 dark:text-emerald-400">
                          {formatCurrency(parseFloat(t.price))}
                        </td>
                        <td className="py-1 text-right text-neutral-800 dark:text-neutral-200">
                          {t.quantity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. GROWW-STYLE BOTTOM BUY & SELL TRADING ACTION CONSOLE */}
          <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl p-4 sm:p-5 shadow-sm transition-colors duration-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Left: Execution Context */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="p-2.5 rounded-xl bg-neutral-100 dark:bg-[#171717] border border-neutral-200 dark:border-[#262626] text-center min-w-[72px]">
                  <span className="text-[10px] text-neutral-400 font-sans uppercase font-bold block">
                    Symbol
                  </span>
                  <span className="text-sm font-extrabold font-mono text-neutral-900 dark:text-white">
                    {currentInstrument.symbol}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      Live Market Price:
                    </span>
                    <span className="text-sm font-bold font-mono text-neutral-900 dark:text-white tabular-nums">
                      {formatCurrency(lastPrice)}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-400 font-sans">
                    Atomic simulated execution • ₹0 brokerage • T+0 settlement
                  </p>
                </div>
              </div>

              {/* Right: Big Prominent BUY and SELL Buttons at Bottom */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => handleOpenOrder('BUY')}
                  className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-extrabold text-sm font-sans shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  <span>BUY {currentInstrument.symbol}</span>
                </button>
                <button
                  onClick={() => handleOpenOrder('SELL')}
                  className="flex-1 sm:flex-none px-8 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white font-extrabold text-sm font-sans shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  <TrendingDown className="w-4 h-4" />
                  <span>SELL {currentInstrument.symbol}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* RIGHT: Compact Wallet Summary & Scrollable Market Watchlist (Cols 9-12)    */}
        {/* ========================================================================= */}
        <div
          className={`lg:col-span-4 xl:col-span-3 space-y-4 ${
            mobileTab === 'chart' ? 'hidden lg:block' : 'block'
          }`}
        >
          {/* Top-Right Compact Wallet Summary */}
          <DashboardWalletSummary />

          {/* Right-Side Independently Scrollable Market Watchlist */}
          <MarketWatchlistPanel
            selectedSymbol={activeSymbol}
            onSelectSymbol={handleSelectSymbol}
          />
        </div>
      </div>

      {/* Quick Buy/Sell Order Modal */}
      <QuickOrderModal
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        instrument={currentInstrument}
        initialSide={orderModalSide}
        lastPrice={lastPrice}
      />

      {/* Floating AI Trading Assistant at Bottom-Right */}
      <AITradingAssistant
        selectedInstrument={currentInstrument}
        selectedQuote={currentQuote}
      />

      {/* Mobile Sticky Bottom Trade Bar (Only visible on mobile screens < lg) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-30 p-3 bg-white/95 dark:bg-[#0A0A0A]/95 backdrop-blur-md border-t border-neutral-200 dark:border-[#222222] flex items-center gap-3 shadow-lg">
        <button
          onClick={() => handleOpenOrder('BUY')}
          className="flex-1 py-3 rounded-xl bg-emerald-600 active:bg-emerald-700 text-white font-extrabold text-sm font-sans shadow-md flex items-center justify-center gap-2"
        >
          <TrendingUp className="w-4 h-4" />
          <span>BUY ({formatCurrency(lastPrice)})</span>
        </button>
        <button
          onClick={() => handleOpenOrder('SELL')}
          className="flex-1 py-3 rounded-xl bg-rose-600 active:bg-rose-700 text-white font-extrabold text-sm font-sans shadow-md flex items-center justify-center gap-2"
        >
          <TrendingDown className="w-4 h-4" />
          <span>SELL ({formatCurrency(lastPrice)})</span>
        </button>
      </div>
    </div>
  );
};
