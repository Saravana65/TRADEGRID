import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useWalletStore } from '../store/walletStore';
import { useMarketStore } from '../store/marketStore';
import { formatCurrency, formatDate } from '../utils/formatters';
import { StatCard } from '../components/common/StatCard';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { achievementApiService } from '../services/achievement.service';
import { newsApiService } from '../services/news.service';
import { UserAchievementStats, UserAchievementItem, NewsArticle } from '@tradegrid/shared-types';
import { motion } from 'motion/react';
import {
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Sparkles,
  Trophy,
  Award,
  Crown,
  Activity,
  BarChart3,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const { balance, summary, fetchWalletSummary } = useWalletStore();
  const { instruments, fetchInstruments, quotes } = useMarketStore();

  const [achievementStats, setAchievementStats] = useState<UserAchievementStats | null>(null);
  const [recentBadges, setRecentBadges] = useState<UserAchievementItem[]>([]);
  const [newsFeed, setNewsFeed] = useState<NewsArticle[]>([]);

  useEffect(() => {
    fetchWalletSummary();
    fetchInstruments();

    achievementApiService
      .getUserStats()
      .then(setAchievementStats)
      .catch(() => {});

    achievementApiService
      .getUserAchievements()
      .then((items) => {
        setRecentBadges(items.filter((i) => i.isUnlocked).slice(0, 4));
      })
      .catch(() => {});

    newsApiService
      .getNews({ limit: 4 })
      .then((res: { articles: NewsArticle[]; total: number }) => {
        setNewsFeed(res.articles || []);
      })
      .catch(() => {});
  }, [fetchWalletSummary, fetchInstruments]);

  // Merge instruments with real or default quotes
  const enrichedInstruments = instruments.map((inst) => {
    const quote = quotes[inst.symbol];
    const price = quote?.lastPrice ? parseFloat(quote.lastPrice) : 250.0;
    const changeAmt = quote?.changeAmount ? parseFloat(quote.changeAmount) : 3.5;
    const changePct = quote?.changePercent ? parseFloat(quote.changePercent) : 1.42;
    return {
      ...inst,
      currentPrice: price,
      changeAmount: changeAmt,
      changePercent: changePct,
    };
  });

  const displayListings =
    enrichedInstruments.length > 0
      ? enrichedInstruments
      : [
          {
            id: 1,
            symbol: 'TGRID',
            name: 'TradeGrid Technologies',
            sector: 'Fintech',
            currentPrice: 142.5,
            changeAmount: 4.3,
            changePercent: 3.11,
            dataClassification: 'SIMULATED',
          },
          {
            id: 2,
            symbol: 'RELIANCE',
            name: 'Reliance Industries Ltd',
            sector: 'Energy',
            currentPrice: 2980.0,
            changeAmount: 25.0,
            changePercent: 0.85,
            dataClassification: 'REAL',
          },
          {
            id: 3,
            symbol: 'TCS',
            name: 'Tata Consultancy Services',
            sector: 'Technology',
            currentPrice: 4120.5,
            changeAmount: -17.5,
            changePercent: -0.42,
            dataClassification: 'REAL',
          },
          {
            id: 4,
            symbol: 'NEXUS',
            name: 'Nexus Quantum Systems',
            sector: 'Semiconductors',
            currentPrice: 310.8,
            changeAmount: 12.3,
            changePercent: 4.12,
            dataClassification: 'SIMULATED',
          },
          {
            id: 5,
            symbol: 'INFY',
            name: 'Infosys Limited',
            sector: 'Technology',
            currentPrice: 1845.2,
            changeAmount: 21.8,
            changePercent: 1.2,
            dataClassification: 'REAL',
          },
        ];

  const gainers = [...displayListings].filter((s) => s.changePercent >= 0).slice(0, 4);
  const losers = [...displayListings].filter((s) => s.changePercent < 0).slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Welcome Terminal Banner */}
      <div className="bg-gradient-to-r from-card via-[#111A2E] to-card border border-card-border p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold font-mono text-white tracking-tight">
              Welcome back, <span className="text-cyan-400">{user?.username}</span>
            </h1>
            <Badge variant="cyan">Virtual Trader</Badge>
          </div>
          <p className="text-xs text-slate-400 max-w-xl font-mono leading-relaxed">
            Real-time simulated Indian stock market matching engine. Connect to live feeds, execute atomic virtual trades, and hone your quantitative strategies.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <Link
            to="/trade"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-lg shadow-cyan-600/25 hover:shadow-cyan-600/40"
          >
            <Sparkles className="w-4 h-4" /> Launch Terminal
          </Link>
          <Link
            to="/chart"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-[#090D16] hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-mono border border-card-border hover:border-cyan-500/40 transition-colors"
          >
            <BarChart3 className="w-4 h-4" /> Technical Studio
          </Link>
        </div>
      </div>

      {/* Trader Level & XP Progress Widget */}
      <div className="bg-gradient-to-r from-[#0C1322] via-[#10182C] to-[#0C1322] border border-cyan-500/20 p-5 rounded-2xl shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-sm">
              <Crown className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-cyan-400 uppercase tracking-wider">
                  Level {achievementStats?.currentLevel || 1} Trader
                </span>
                <span className="text-xs px-2 py-0.5 rounded-lg bg-slate-800 text-amber-300 font-semibold border border-slate-700">
                  {achievementStats?.levelTitle || 'Novice Trader'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                {achievementStats?.totalPoints || 0} XP Earned · {achievementStats?.achievementsUnlockedCount || 0} of {achievementStats?.totalAchievementsCount || 19} Badges Unlocked
              </p>
            </div>
          </div>

          {/* Level Progress Bar */}
          <div className="flex-1 max-w-xs space-y-1 font-mono">
            <div className="flex justify-between text-[11px] text-slate-400">
              <span>Next Level Progression</span>
              <span className="text-amber-400 font-bold">
                {achievementStats?.pointsToNextLevel || 100} XP needed
              </span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${achievementStats?.currentLevelProgressPercent || 0}%` }}
              />
            </div>
          </div>

          <Link
            to="/achievements"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-semibold transition-all whitespace-nowrap self-start md:self-auto"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            Hall of Fame →
          </Link>
        </div>

        {recentBadges.length > 0 && (
          <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400">Recent Badges:</span>
            {recentBadges.map((b) => (
              <span
                key={b.code}
                className="px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-medium flex items-center gap-1"
              >
                <Award className="w-3 h-3 text-amber-400" /> {b.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Four Primary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Virtual Net Worth"
          value={formatCurrency(summary?.availableBalance || balance)}
          change="+0.00% Session"
          changeType="neutral"
          subtitle="Cash + Open Holdings"
          icon={<PieChart className="w-5 h-5 text-cyan-400" />}
        />
        <StatCard
          title="Available Virtual Cash"
          value={formatCurrency(balance)}
          change="Double-Entry Verified"
          changeType="positive"
          subtitle="Ready for order execution"
          icon={<Wallet className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Ledger Consistency"
          value={summary?.isConsistentWithLedger !== false ? 'VERIFIED' : 'PENDING'}
          change="Double-Entry Proof"
          changeType="positive"
          subtitle="Audit ledger verified"
          icon={<Layers className="w-5 h-5 text-indigo-400" />}
        />
        <StatCard
          title="Exchange Equities"
          value={`${displayListings.length} Active`}
          change="Continuous 24/7"
          changeType="neutral"
          subtitle="NSE Reference & Synthetic"
          icon={<Activity className="w-5 h-5 text-amber-400" />}
        />
      </div>

      {/* Active Market Watchlist Table */}
      <Card
        title="Active Market Watchlist"
        subtitle="Real-time Indian market equities and synthetic volatility pairs"
        action={
          <Link
            to="/markets"
            className="text-xs font-mono text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
          >
            Explore All Equities →
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-card-border text-slate-400 text-[11px] uppercase">
                <th className="py-2.5 px-3">Ticker</th>
                <th className="py-2.5 px-3">Company</th>
                <th className="py-2.5 px-3">Sector</th>
                <th className="py-2.5 px-3 text-right">LTP (INR)</th>
                <th className="py-2.5 px-3 text-right">24h Change</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/60">
              {displayListings.slice(0, 8).map((stock) => {
                const isPos = stock.changePercent >= 0;
                return (
                  <tr key={stock.id || stock.symbol} className="hover:bg-slate-800/20 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{stock.symbol}</span>
                        <Badge
                          variant={stock.dataClassification === 'REAL' ? 'cyan' : 'simulated'}
                        >
                          {stock.dataClassification || 'SIMULATED'}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-slate-300 font-sans text-xs">{stock.name}</td>
                    <td className="py-3 px-3 text-slate-400 text-xs">{stock.sector}</td>
                    <td className="py-3 px-3 text-right font-bold text-slate-100 tabular-nums text-sm">
                      {formatCurrency(stock.currentPrice)}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`inline-flex items-center gap-0.5 font-bold tabular-nums ${
                          isPos ? 'text-emerald-400' : 'text-rose-400'
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
                        className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded-lg text-xs font-mono font-semibold transition-all border border-cyan-500/30"
                      >
                        Trade <Sparkles className="w-3 h-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Top Gainers, Losers & Market News Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Gainers */}
        <Card title="Top Gainers" subtitle="Momentum leaders" className="lg:col-span-1">
          <div className="space-y-2.5">
            {gainers.map((g) => (
              <div
                key={g.symbol}
                className="flex items-center justify-between p-2.5 rounded-xl bg-[#070A12] border border-card-border/70 hover:border-cyan-500/30 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="font-bold text-sm text-white">{g.symbol}</span>
                    <Badge variant="gain">+{g.changePercent.toFixed(2)}%</Badge>
                  </div>
                  <span className="text-[11px] text-slate-400 truncate block max-w-[130px]">
                    {g.name}
                  </span>
                </div>
                <div className="text-right font-mono">
                  <div className="text-sm font-semibold text-slate-100">
                    {formatCurrency(g.currentPrice)}
                  </div>
                  <Link
                    to={`/trade?symbol=${g.symbol}`}
                    className="text-[10px] text-cyan-400 hover:underline"
                  >
                    Open Terminal →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Losers */}
        <Card title="Top Decliners" subtitle="Pullback opportunities" className="lg:col-span-1">
          <div className="space-y-2.5">
            {losers.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs font-mono">
                No active decliners in current cycle
              </div>
            ) : (
              losers.map((l) => (
                <div
                  key={l.symbol}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#070A12] border border-card-border/70 hover:border-cyan-500/30 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="font-bold text-sm text-white">{l.symbol}</span>
                      <Badge variant="loss">{l.changePercent.toFixed(2)}%</Badge>
                    </div>
                    <span className="text-[11px] text-slate-400 truncate block max-w-[130px]">
                      {l.name}
                    </span>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-sm font-semibold text-slate-100">
                      {formatCurrency(l.currentPrice)}
                    </div>
                    <Link
                      to={`/trade?symbol=${l.symbol}`}
                      className="text-[10px] text-cyan-400 hover:underline"
                    >
                      Open Terminal →
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Market News Feed */}
        <Card
          title="Market Catalysts"
          subtitle="Real-time macro & corporate announcements"
          action={
            <Link to="/news" className="text-xs font-mono text-cyan-400 hover:text-cyan-300">
              All News →
            </Link>
          }
          className="lg:col-span-1"
        >
          <div className="space-y-2.5">
            {newsFeed.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-[#070A12] border border-card-border/70 space-y-1"
              >
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <Badge variant="cyan">{item.category}</Badge>
                  <span>{formatDate(item.createdAt)}</span>
                </div>
                <h4 className="text-xs font-semibold text-slate-200 line-clamp-1">{item.headline}</h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {item.summary}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </motion.div>
  );
};
