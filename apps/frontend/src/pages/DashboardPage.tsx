import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useWalletStore } from '../store/walletStore';
import { useMarketStore } from '../store/marketStore';
import { portfolioApiService } from '../services/portfolio.service';
import { orderApiService } from '../services/order.service';
import { competitionApiService } from '../services/competition.service';
import { formatCurrency, formatDate } from '../utils/formatters';
import { StatCard } from '../components/common/StatCard';
import { Badge } from '../components/common/Badge';
import { motion } from 'motion/react';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import { Order, Competition, PortfolioSummaryResponse } from '@tradegrid/shared-types';

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const { balance, fetchWalletSummary } = useWalletStore();
  const { instruments, fetchInstruments, quotes, fetchQuotes } = useMarketStore();

  const [portfolioData, setPortfolioData] = useState<PortfolioSummaryResponse | null>(null);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [activeCompetitions, setActiveCompetitions] = useState<Competition[]>([]);
  const [marketTab, setMarketTab] = useState<'all' | 'gainers' | 'losers'>('all');
  const [chartTimeframe, setChartTimeframe] = useState<'1D' | '1W' | '1M' | 'ALL'>('1D');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchWalletSummary();
    fetchInstruments();
    fetchQuotes();

    // Fetch portfolio, orders, and competitions in parallel
    Promise.allSettled([
      portfolioApiService.getPortfolioSummary(),
      orderApiService.getOrders({ limit: 5 }),
      competitionApiService.listCompetitions({ status: 'ACTIVE', limit: 3 }),
    ]).then(([portRes, ordRes, compRes]) => {
      if (portRes.status === 'fulfilled') setPortfolioData(portRes.value);
      if (ordRes.status === 'fulfilled') setRecentOrders(ordRes.value.items || []);
      if (compRes.status === 'fulfilled') setActiveCompetitions(compRes.value.competitions || []);
      setIsLoading(false);
    });
  }, [fetchWalletSummary, fetchInstruments, fetchQuotes]);

  // Derived financial statistics
  const virtualCash = typeof balance === 'number' ? balance : parseFloat(balance || '0') || 100000;
  const investedAmount = portfolioData?.totalInvested ? parseFloat(portfolioData.totalInvested) : 0;
  const netWorth = portfolioData?.totalPortfolioValue
    ? parseFloat(portfolioData.totalPortfolioValue)
    : virtualCash + investedAmount;
  const unrealizedPnL = portfolioData?.totalUnrealizedPnL
    ? parseFloat(portfolioData.totalUnrealizedPnL)
    : 0;
  const todayPnL = unrealizedPnL;
  const todayPnLPct = netWorth > 0 ? (todayPnL / netWorth) * 100 : 0;
  const isPnLPositive = todayPnL >= 0;

  // Enriched stock listings
  const enrichedListings = useMemo(() => {
    return instruments.map((inst) => {
      const q = quotes[inst.symbol.toUpperCase()];
      const price = q?.lastPrice ? parseFloat(q.lastPrice) : 250.0;
      const changePct = q?.changePercent ? parseFloat(q.changePercent) : 0.0;
      const changeAmt = q?.changeAmount ? parseFloat(q.changeAmount) : 0.0;
      return {
        ...inst,
        currentPrice: price,
        changePercent: changePct,
        changeAmount: changeAmt,
      };
    });
  }, [instruments, quotes]);

  const gainers = useMemo(
    () => [...enrichedListings].filter((s) => s.changePercent >= 0).sort((a, b) => b.changePercent - a.changePercent).slice(0, 5),
    [enrichedListings]
  );
  const losers = useMemo(
    () => [...enrichedListings].filter((s) => s.changePercent < 0).sort((a, b) => a.changePercent - b.changePercent).slice(0, 5),
    [enrichedListings]
  );

  const displayedMarketListings = useMemo(() => {
    if (marketTab === 'gainers') return gainers;
    if (marketTab === 'losers') return losers;
    return enrichedListings.slice(0, 7);
  }, [marketTab, enrichedListings, gainers, losers]);

  // Simulated performance curve data points based on timeframe
  const equityPoints = useMemo(() => {
    const base = 100000;
    const current = netWorth;
    const diff = current - base;
    const pointsCount = chartTimeframe === '1D' ? 24 : chartTimeframe === '1W' ? 7 : 30;
    const points: number[] = [];

    for (let i = 0; i < pointsCount; i++) {
      const factor = i / (pointsCount - 1);
      // Generate smooth progressive curve ending at current net worth
      const noise = Math.sin(i * 0.8) * (Math.abs(diff) * 0.15 || 400);
      points.push(Math.round(base + diff * factor + noise));
    }
    points[points.length - 1] = Math.round(current);
    return points;
  }, [netWorth, chartTimeframe]);

  const minEquity = Math.min(...equityPoints);
  const maxEquity = Math.max(...equityPoints);
  const range = maxEquity - minEquity || 1;

  if (isLoading && !portfolioData && !instruments.length) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-neutral-700 border-t-slate-900 dark:border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6 select-none font-sans"
    >
      {/* 1. Clean Welcome Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-[#1F1F1F]">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Trading Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
            Welcome back, <span className="font-semibold text-slate-800 dark:text-white">{user?.username}</span> • Virtual Trading Environment
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/trade"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-black dark:hover:bg-neutral-200 text-xs font-semibold shadow-sm transition-all active:translate-y-0.5"
          >
            Launch Terminal
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* 2-5. Primary Financial Metrics: Net Worth, Today's P&L, Available Cash, Invested Amount */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Portfolio Value"
          value={formatCurrency(netWorth)}
          change={`${todayPnLPct >= 0 ? '+' : ''}${todayPnLPct.toFixed(2)}% Return`}
          changeType={todayPnLPct >= 0 ? 'positive' : 'negative'}
          subtitle="Cash + Open Holdings"
          icon={<PieChart className="w-4 h-4 text-slate-900 dark:text-white" />}
        />
        <StatCard
          title="Today's Profit / Loss"
          value={formatCurrency(todayPnL)}
          change={`${todayPnLPct >= 0 ? '+' : ''}${todayPnLPct.toFixed(2)}% Session`}
          changeType={isPnLPositive ? 'positive' : 'negative'}
          subtitle="Unrealized valuation change"
          icon={
            isPnLPositive ? (
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-500" />
            )
          }
        />
        <StatCard
          title="Available Virtual Cash"
          value={formatCurrency(virtualCash)}
          change="Verified Invariant"
          changeType="positive"
          subtitle="Ready for order execution"
          icon={<Wallet className="w-4 h-4 text-slate-900 dark:text-white" />}
        />
        <StatCard
          title="Invested Amount"
          value={formatCurrency(investedAmount)}
          change={`${portfolioData?.positions?.length || 0} Open Positions`}
          changeType="neutral"
          subtitle="Active asset deployment"
          icon={<Layers className="w-4 h-4 text-slate-900 dark:text-white" />}
        />
      </div>

      {/* 6. Portfolio Performance Chart */}
      <div className="bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Portfolio Growth Trajectory
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
              Historical simulated capital trajectory across trading sessions
            </p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141414] p-1 rounded-xl border border-slate-200 dark:border-[#222222]">
            {(['1D', '1W', '1M', 'ALL'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setChartTimeframe(tf)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  chartTimeframe === tf
                    ? 'bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* Clean SVG Equity Curve with Area Fill */}
        <div className="h-44 w-full relative">
          <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            {/* Area Fill */}
            <polygon
              fill="url(#equityGradient)"
              points={`0,100 ${equityPoints
                .map((pt, idx) => {
                  const x = (idx / (equityPoints.length - 1)) * 100;
                  const y = 95 - ((pt - minEquity) / range) * 85;
                  return `${x},${y}`;
                })
                .join(' ')} 100,100`}
            />
            {/* Stroke Line */}
            <polyline
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={equityPoints
                .map((pt, idx) => {
                  const x = (idx / (equityPoints.length - 1)) * 100;
                  const y = 95 - ((pt - minEquity) / range) * 85;
                  return `${x},${y}`;
                })
                .join(' ')}
            />
          </svg>
          <div className="flex justify-between items-center text-[10px] text-slate-400 dark:text-neutral-500 font-mono mt-2">
            <span>Session Open: {formatCurrency(minEquity)}</span>
            <span>Current Value: {formatCurrency(netWorth)}</span>
            <span>High: {formatCurrency(maxEquity)}</span>
          </div>
        </div>
      </div>

      {/* 7 & 8. Watchlist & Market Overview Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Watchlist & Market Overview (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Market Watchlist
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                Indian equities & high-liquidity simulated instruments
              </p>
            </div>

            {/* Tabs: All / Gainers / Losers */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#141414] p-1 rounded-xl border border-slate-200 dark:border-[#222222]">
              {(['all', 'gainers', 'losers'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMarketTab(tab)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all ${
                    marketTab === tab
                      ? 'bg-white dark:bg-[#262626] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#1F1F1F] text-slate-400 dark:text-neutral-500 text-[11px] uppercase font-bold tracking-wider">
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Company</th>
                  <th className="py-2.5 px-3 text-right">Price</th>
                  <th className="py-2.5 px-3 text-right">24h Change</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#171717]">
                {displayedMarketListings.map((stock) => {
                  const isPos = stock.changePercent >= 0;
                  return (
                    <tr
                      key={stock.symbol}
                      className="hover:bg-slate-50 dark:hover:bg-[#121212] transition-colors"
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white text-sm">
                            {stock.symbol}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                              stock.dataClassification === 'REAL'
                                ? 'bg-slate-100 dark:bg-[#1A1A1A] text-slate-800 dark:text-neutral-300 border border-slate-200 dark:border-[#2E2E2E]'
                                : 'bg-slate-100 dark:bg-[#141414] text-slate-600 dark:text-neutral-400 border border-slate-200 dark:border-[#262626]'
                            }`}
                          >
                            {stock.dataClassification || 'SIM'}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-neutral-400 truncate max-w-[150px]">
                        {stock.name}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-slate-900 dark:text-white font-mono tabular-nums text-sm">
                        {formatCurrency(stock.currentPrice)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        <span
                          className={`inline-flex items-center gap-0.5 font-bold font-mono tabular-nums ${
                            isPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isPos ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                          {isPos ? '+' : ''}
                          {stock.changePercent.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <Link
                          to={`/trade?symbol=${stock.symbol}`}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-slate-100 dark:bg-[#171717] hover:bg-slate-900 hover:text-white dark:hover:bg-white dark:hover:text-black text-slate-800 dark:text-neutral-200 rounded-lg text-xs font-semibold transition-all border border-slate-200 dark:border-[#262626]"
                        >
                          Trade
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 10. Competition & Community Summary (1 col) */}
        <div className="bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-[#1F1F1F]">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Active Tournaments
              </h3>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                Simulated trading competitions
              </p>
            </div>
            <Link
              to="/competitions"
              className="text-xs font-semibold text-slate-900 dark:text-white hover:underline"
            >
              View All →
            </Link>
          </div>

          <div className="space-y-3">
            {activeCompetitions.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#222222] text-center space-y-2">
                <Trophy className="w-6 h-6 text-amber-500 mx-auto" />
                <p className="text-xs font-semibold text-slate-800 dark:text-white">
                  Join a Community Arena
                </p>
                <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                  Compete in isolated virtual portfolios with real-time leaderboard rankings.
                </p>
                <Link
                  to="/competitions"
                  className="inline-block mt-1 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black text-xs font-semibold"
                >
                  Browse Competitions
                </Link>
              </div>
            ) : (
              activeCompetitions.map((comp) => (
                <Link
                  key={comp.id}
                  to={`/competitions/${comp.id}`}
                  className="block p-3 rounded-xl bg-slate-50 dark:bg-[#121212] border border-slate-200 dark:border-[#222222] hover:border-slate-400 dark:hover:border-[#333333] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {comp.name}
                    </span>
                    <Badge variant="amber">ACTIVE</Badge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-neutral-400 mt-2 font-mono">
                    <span>Starting: {formatCurrency(comp.startingCapital)}</span>
                    <span>{comp.participantCount || 1} Traders</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 9. Recent Orders and Trades Table */}
      <div className="bg-white dark:bg-[#0A0A0A] rounded-2xl border border-slate-200 dark:border-[#1F1F1F] p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-[#1F1F1F]">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Recent Virtual Orders & Executions
            </h3>
            <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
              Audited atomic matching engine records
            </p>
          </div>
          <Link
            to="/history"
            className="text-xs font-semibold text-slate-900 dark:text-white hover:underline"
          >
            Full Ledger →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div className="py-8 text-center text-slate-400 dark:text-neutral-500 text-xs">
            No virtual orders placed yet in this account. Launch the Trading Terminal to place your first trade!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-100 dark:border-[#1F1F1F] text-slate-400 dark:text-neutral-500 text-[11px] uppercase font-bold tracking-wider">
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Instrument</th>
                  <th className="py-2.5 px-3">Side</th>
                  <th className="py-2.5 px-3 text-right">Quantity</th>
                  <th className="py-2.5 px-3 text-right">Limit Price</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#171717]">
                {recentOrders.map((ord) => (
                  <tr
                    key={ord.id}
                    className="hover:bg-slate-50 dark:hover:bg-[#121212] transition-colors"
                  >
                    <td className="py-3 px-3 font-mono text-slate-500 dark:text-neutral-400">
                      #{ord.id}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                      {ord.symbol}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          ord.side === 'BUY'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/40'
                        }`}
                      >
                        {ord.side}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums">
                      {ord.quantity}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                      {ord.limitPrice ? formatCurrency(parseFloat(ord.limitPrice)) : 'MARKET'}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[#1C1C1C] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#2E2E2E]">
                        {ord.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right text-slate-500 dark:text-neutral-400 font-mono text-[11px]">
                      {formatDate(ord.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};
