import React from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { formatCurrency, formatPercent, formatDate } from '../utils/formatters';
import { StatCard } from '../components/common/StatCard';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Table, TableColumn } from '../components/common/Table';
import { StockListing, NewsItem } from '@tradegrid/shared-types';
import {
  Wallet,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Clock,
  Sparkles,
} from 'lucide-react';

// Simulated Equities for Educational Display (Clearly marked as simulated)
const mockListings: StockListing[] = [
  {
    id: 1,
    symbol: 'TGRID',
    name: 'TradeGrid Technologies Corp',
    sector: 'Financial Technology',
    currentPrice: '142.50',
    previousClose: '138.20',
    change: '4.30',
    changePercent: '3.11',
    volume: 1254300,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 2,
    symbol: 'NEXUS',
    name: 'Nexus Quantum Systems',
    sector: 'Semiconductors',
    currentPrice: '310.80',
    previousClose: '298.50',
    change: '12.30',
    changePercent: '4.12',
    volume: 890200,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 3,
    symbol: 'SOLARIS',
    name: 'Solaris Energy Dynamic',
    sector: 'Clean Energy',
    currentPrice: '88.40',
    previousClose: '92.10',
    change: '-3.70',
    changePercent: '-4.02',
    volume: 450100,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 4,
    symbol: 'AERO',
    name: 'AeroDynamics Hypersonic',
    sector: 'Aerospace',
    currentPrice: '215.00',
    previousClose: '210.00',
    change: '5.00',
    changePercent: '2.38',
    volume: 672000,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 5,
    symbol: 'BIOGEN',
    name: 'BioGen Therapeutics',
    sector: 'Biotechnology',
    currentPrice: '64.20',
    previousClose: '67.80',
    change: '-3.60',
    changePercent: '-5.31',
    volume: 910400,
    isSimulated: true,
    status: 'ACTIVE',
  },
];

const mockNews: NewsItem[] = [
  {
    id: 'news-1',
    title: 'Nexus Quantum announces breakthrough in synthetic core processing',
    summary: 'Preliminary simulated benchmarks report 35% efficiency gains in high-throughput matching algorithms.',
    source: 'TRADEGRID Simulation Feed',
    publishedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    isSimulated: true,
    affectedSymbols: ['NEXUS'],
  },
  {
    id: 'news-2',
    title: 'Clean Energy sector faces regulatory review in simulated committee',
    summary: 'Sector-wide volatility anticipated as simulated compliance deadlines approach.',
    source: 'TRADEGRID Simulation Feed',
    publishedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    isSimulated: true,
    affectedSymbols: ['SOLARIS'],
  },
];

export const DashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const { virtualCashBalance } = useUIStore();

  const gainers = [...mockListings].filter((s) => parseFloat(s.changePercent) > 0);
  const losers = [...mockListings].filter((s) => parseFloat(s.changePercent) < 0);

  const marketColumns: TableColumn<StockListing>[] = [
    {
      key: 'symbol',
      header: 'Ticker',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Link
            to={`/trade?symbol=${row.symbol}`}
            className="font-mono font-bold text-cyan-400 hover:text-cyan-300"
          >
            {row.symbol}
          </Link>
          <Badge variant="simulated">SIM</Badge>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Company Name',
      render: (row) => <span className="text-slate-300">{row.name}</span>,
    },
    {
      key: 'sector',
      header: 'Sector',
      render: (row) => <span className="text-slate-400 text-xs">{row.sector}</span>,
    },
    {
      key: 'currentPrice',
      header: 'Last Price',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-semibold text-slate-100 tabular-nums">
          {formatCurrency(row.currentPrice)}
        </span>
      ),
    },
    {
      key: 'changePercent',
      header: '24h Change',
      align: 'right',
      render: (row) => {
        const isPos = parseFloat(row.changePercent) >= 0;
        return (
          <span
            className={`font-mono font-medium tabular-nums ${
              isPos ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatPercent(row.changePercent)}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-card via-[#111A2E] to-card border border-card-border p-6 rounded-2xl shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">
              Welcome back, <span className="text-cyan-400">{user?.username}</span>
            </h1>
            <Badge variant="cyan">Phase 1 Foundation</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            TRADEGRID is configured in Modular Monolith mode on Node.js + Express + TypeScript. All financial values use 4-decimal precision representation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/trade"
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-cyan-600/20"
          >
            <Sparkles className="w-4 h-4" />
            Launch Terminal
          </Link>
        </div>
      </div>

      {/* Stat Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Portfolio Value"
          value={formatCurrency(virtualCashBalance)}
          change="+0.00%"
          changeType="neutral"
          subtitle="All assets virtual"
          icon={<PieChart className="w-5 h-5 text-cyan-400" />}
        />
        <StatCard
          title="Available Virtual Cash"
          value={formatCurrency(virtualCashBalance)}
          change="Unencumbered"
          changeType="neutral"
          subtitle="Ready for order deployment"
          icon={<Wallet className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Daily Profit / Loss"
          value="+$0.00"
          change="+0.00%"
          changeType="neutral"
          subtitle="Session baseline"
          icon={<ArrowUpRight className="w-5 h-5 text-slate-400" />}
        />
        <StatCard
          title="Active Listings"
          value={`${mockListings.length} Equities`}
          change="Simulation Mode"
          changeType="neutral"
          subtitle="Phase 2 market matcher"
          icon={<Layers className="w-5 h-5 text-indigo-400" />}
        />
      </div>

      {/* Market Overview Table */}
      <Card
        title="Simulated Exchange Listings"
        subtitle="Sample equity universe for trading simulation testing"
        action={
          <Link
            to="/markets"
            className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
          >
            View All Markets →
          </Link>
        }
      >
        <Table
          columns={marketColumns}
          data={mockListings}
          keyExtractor={(item) => item.id}
        />
      </Card>

      {/* Gainers, Losers & Simulated News Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Gainers */}
        <Card
          title="Top Gainers"
          subtitle="Simulated 24h momentum"
          className="lg:col-span-1"
        >
          <div className="space-y-3">
            {gainers.map((g) => (
              <div
                key={g.symbol}
                className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-card-border/60 hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-sm text-white">
                      {g.symbol}
                    </span>
                    <Badge variant="gain">+{g.changePercent}%</Badge>
                  </div>
                  <span className="text-xs text-slate-400">{g.name}</span>
                </div>
                <div className="text-right font-mono">
                  <div className="text-sm font-semibold text-slate-200">
                    {formatCurrency(g.currentPrice)}
                  </div>
                  <div className="text-xs text-emerald-400 flex items-center justify-end">
                    <ArrowUpRight className="w-3 h-3" /> +${g.change}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top Losers */}
        <Card
          title="Top Decliners"
          subtitle="Simulated pullback movement"
          className="lg:col-span-1"
        >
          <div className="space-y-3">
            {losers.map((l) => (
              <div
                key={l.symbol}
                className="flex items-center justify-between p-2.5 rounded-lg bg-background border border-card-border/60 hover:border-slate-700 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-sm text-white">
                      {l.symbol}
                    </span>
                    <Badge variant="loss">{l.changePercent}%</Badge>
                  </div>
                  <span className="text-xs text-slate-400">{l.name}</span>
                </div>
                <div className="text-right font-mono">
                  <div className="text-sm font-semibold text-slate-200">
                    {formatCurrency(l.currentPrice)}
                  </div>
                  <div className="text-xs text-rose-400 flex items-center justify-end">
                    <ArrowDownRight className="w-3 h-3" /> ${l.change}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Simulated News Feed Preview */}
        <Card
          title="Simulated Catalyst Feed"
          subtitle="Synthetic events injected for market dynamics"
          action={
            <Link to="/news" className="text-xs text-cyan-400 hover:text-cyan-300">
              Full Feed →
            </Link>
          }
          className="lg:col-span-1"
        >
          <div className="space-y-3">
            {mockNews.map((news) => (
              <div
                key={news.id}
                className="p-3 rounded-lg bg-background border border-card-border/60 space-y-1.5"
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <Badge variant="simulated">SIMULATED</Badge>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {formatDate(news.publishedAt)}
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-slate-200 line-clamp-2">
                  {news.title}
                </h4>
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                  {news.summary}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
