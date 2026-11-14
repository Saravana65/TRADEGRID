import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Table, TableColumn } from '../components/common/Table';
import { Input } from '../components/common/Input';
import { Button } from '../components/common/Button';
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters';
import { useMarketStore } from '../store/marketStore';
import { Instrument, DataClassification } from '@tradegrid/shared-types';
import { StocksDataTable, StockItem } from '../components/ui/stocks-data-table';
import {
  Search,
  TrendingUp,
  TrendingDown,
  Layers,
  Activity,
  RefreshCw,
  ShieldCheck,
  Table as TableIcon,
  Sparkles,
} from 'lucide-react';

export const MarketsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExchange, setSelectedExchange] = useState<string>('');
  const [selectedSector, setSelectedSector] = useState<string>('');
  const [selectedClassification, setSelectedClassification] = useState<DataClassification | ''>('');
  const [viewMode, setViewMode] = useState<'animated' | 'classic'>('animated');

  const {
    instruments,
    quotes,
    summary,
    gainers,
    losers,
    mostActive,
    sectors,
    exchanges,
    isLoadingInstruments,
    isLoadingOverview,
    fetchInstruments,
    fetchMarketOverview,
    fetchQuotes,
    fetchMetadata,
  } = useMarketStore();

  useEffect(() => {
    fetchMetadata();
    fetchMarketOverview();
    fetchQuotes();
  }, [fetchMetadata, fetchMarketOverview, fetchQuotes]);

  useEffect(() => {
    fetchInstruments({
      q: searchTerm || undefined,
      exchange: selectedExchange || undefined,
      sector: selectedSector || undefined,
      classification: selectedClassification || undefined,
    });
  }, [searchTerm, selectedExchange, selectedSector, selectedClassification, fetchInstruments]);

  const handleRefresh = () => {
    fetchMarketOverview();
    fetchQuotes();
    fetchInstruments({
      q: searchTerm || undefined,
      exchange: selectedExchange || undefined,
      sector: selectedSector || undefined,
      classification: selectedClassification || undefined,
    });
  };

  const stockItems: StockItem[] = instruments.map((inst, idx) => {
    const quote = quotes[inst.symbol.toUpperCase()];
    const price = quote ? parseFloat(quote.lastPrice) : 100;
    const changePercent = quote ? parseFloat(quote.changePercent) : 0;
    const prevClose = quote ? parseFloat(quote.previousClose || quote.lastPrice) : price;
    const change = price - prevClose;
    const volume = quote ? parseInt(String(quote.volume || '100000'), 10) : 100000;
    const base = price - change;
    const sparkline = [
      base,
      base + change * 0.15,
      base + change * 0.3,
      base + change * 0.2,
      base + change * 0.5,
      base + change * 0.7,
      base + change * 0.65,
      base + change * 0.85,
      base + change * 0.95,
      price,
    ];
    const volatility: 'low' | 'mid' | 'high' =
      Math.abs(changePercent) > 2.5 ? 'high' : Math.abs(changePercent) > 0.8 ? 'mid' : 'low';
    const status: 'bullish' | 'bearish' | 'neutral' | 'volatile' | 'catalyst' =
      changePercent > 0.5 ? 'bullish' : changePercent < -0.5 ? 'bearish' : 'neutral';

    return {
      id: String(inst.id || idx),
      symbol: inst.symbol,
      name: inst.name,
      exchange: inst.exchange,
      sector: inst.sector || 'Equities',
      classification: (inst.dataClassification as any) || 'SIMULATED',
      price,
      change,
      changePercent,
      volume,
      sparkline,
      volatility,
      status,
      lastAction: 'Active Tick',
    };
  });

  const columns: TableColumn<Instrument>[] = [
    {
      key: 'symbol',
      header: 'Instrument / Symbol',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Link
            to={`/markets/${row.symbol}`}
            className="font-mono font-bold text-cyan-400 hover:text-cyan-300 text-sm"
          >
            {row.symbol}
          </Link>
          <Badge variant={row.dataClassification === 'REAL' ? 'cyan' : 'simulated'}>
            {row.dataClassification === 'REAL' ? 'NSE' : 'SIM'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Company Name',
      render: (row) => (
        <div className="max-w-xs">
          <span className="text-slate-200 text-xs font-medium truncate block">{row.name}</span>
          <span className="text-[10px] text-slate-400 font-mono">{row.sector}</span>
        </div>
      ),
    },
    {
      key: 'exchange',
      header: 'Exchange',
      render: (row) => (
        <span className="font-mono text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#0A0A0A] px-2 py-0.5 rounded border border-slate-200 dark:border-card-border">
          {row.exchange}
        </span>
      ),
    },
    {
      key: 'price',
      header: 'Last Price',
      align: 'right',
      render: (row) => {
        const quote = quotes[row.symbol.toUpperCase()];
        const price = quote ? quote.lastPrice : '0.0000';
        return (
          <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(price)}
          </span>
        );
      },
    },
    {
      key: 'change',
      header: '24h Change',
      align: 'right',
      render: (row) => {
        const quote = quotes[row.symbol.toUpperCase()];
        if (!quote) return <span className="font-mono text-slate-500 text-xs">-</span>;

        const changePct = parseFloat(quote.changePercent);
        const isPos = changePct >= 0;

        return (
          <span
            className={`font-mono font-bold tabular-nums text-xs ${
              isPos ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPos ? '+' : ''}
            {formatPercent(quote.changePercent)}
          </span>
        );
      },
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right',
      render: (row) => {
        const quote = quotes[row.symbol.toUpperCase()];
        return (
          <span className="font-mono text-slate-300 text-xs tabular-nums">
            {quote ? formatNumber(quote.volume) : '0'}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (row) => (
        <Badge variant={row.marketStatus === 'ACTIVE' ? 'gain' : 'loss'}>
          {row.marketStatus}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <Link
            to={`/markets/${row.symbol}`}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-[#141414] dark:hover:bg-[#1F1F1F] text-slate-800 dark:text-neutral-200 border border-slate-200 dark:border-[#262626] rounded-lg text-xs font-mono font-medium transition-colors"
          >
            Chart
          </Link>
          <Link
            to={`/trade?symbol=${row.symbol}`}
            className="px-2.5 py-1 bg-slate-900 hover:bg-black dark:bg-white dark:hover:bg-neutral-200 text-white dark:text-black rounded-lg text-xs font-mono font-semibold transition-colors shadow-sm"
          >
            Trade
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold  text-slate-900 dark:text-white  flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Market Instrument Master & Quotes
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative listing universe across Real NSE stocks and Simulated TradeGrid equities.
          </p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={handleRefresh}
          disabled={isLoadingInstruments || isLoadingOverview}
          leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isLoadingInstruments ? 'animate-spin' : ''}`} />}
        >
          Refresh Feeds
        </Button>
      </div>

      {/* Market Breadth & Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Total Listed</span>
            <div className="text-base font-bold font-mono text-white mt-0.5">
              {summary.totalInstruments} Instruments
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Real NSE Stocks</span>
            <div className="text-base font-bold font-mono text-cyan-400 mt-0.5">
              {summary.realInstrumentsCount} Reference
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Simulated Equities</span>
            <div className="text-base font-bold font-mono text-purple-400 mt-0.5">
              {summary.simulatedInstrumentsCount} Virtual
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Advancing (+%)</span>
            <div className="text-base font-bold font-mono text-emerald-400 mt-0.5">
              {summary.advancingCount} Stocks
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Declining (-%)</span>
            <div className="text-base font-bold font-mono text-rose-400 mt-0.5">
              {summary.decliningCount} Stocks
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Exchange Volume</span>
            <div className="text-base font-bold font-mono text-slate-200 mt-0.5">
              {formatNumber(summary.totalVolume)}
            </div>
          </div>
        </div>
      )}

      {/* Top Gainers, Losers, and Most Active Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Top Gainers */}
        <Card
          title="Top Gainers"
          subtitle="Highest positive percentage change"
          className="border-emerald-500/20"
        >
          <div className="space-y-2">
            {gainers.map((g) => (
              <Link
                key={g.symbol}
                to={`/markets/${g.symbol}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#0A0A0A] hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-card-border transition-colors text-xs font-sans shadow-sm"
              >
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-bold text-slate-900 dark:text-white font-sans">{g.symbol}</span>
                  <Badge variant={g.dataClassification === 'REAL' ? 'cyan' : 'simulated'}>
                    {g.dataClassification === 'REAL' ? 'NSE' : 'SIM'}
                  </Badge>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-slate-800 dark:text-white font-semibold mr-2">{formatCurrency(g.lastPrice)}</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">+{formatPercent(g.changePercent)}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Top Losers */}
        <Card
          title="Top Losers"
          subtitle="Highest negative percentage change"
          className="border-rose-500/20"
        >
          <div className="space-y-2">
            {losers.map((l) => (
              <Link
                key={l.symbol}
                to={`/markets/${l.symbol}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#0A0A0A] hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-card-border transition-colors text-xs font-sans shadow-sm"
              >
                <div className="flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                  <span className="font-bold text-slate-900 dark:text-white font-sans">{l.symbol}</span>
                  <Badge variant={l.dataClassification === 'REAL' ? 'cyan' : 'simulated'}>
                    {l.dataClassification === 'REAL' ? 'NSE' : 'SIM'}
                  </Badge>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <span className="text-slate-800 dark:text-white font-semibold mr-2">{formatCurrency(l.lastPrice)}</span>
                  <span className="text-rose-600 dark:text-rose-400 font-bold">{formatPercent(l.changePercent)}</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>

        {/* Most Active by Volume */}
        <Card
          title="Most Active"
          subtitle="Highest 24h trading volume"
          className="border-cyan-500/20"
        >
          <div className="space-y-2">
            {mostActive.map((m) => (
              <Link
                key={m.symbol}
                to={`/markets/${m.symbol}`}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-[#0A0A0A] hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-slate-200 dark:border-card-border transition-colors text-xs font-sans shadow-sm"
              >
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-500" />
                  <span className="font-bold text-slate-900 dark:text-white font-sans">{m.symbol}</span>
                  <Badge variant={m.dataClassification === 'REAL' ? 'cyan' : 'simulated'}>
                    {m.dataClassification === 'REAL' ? 'NSE' : 'SIM'}
                  </Badge>
                </div>
                <div className="text-right">
                  <span className="text-white font-semibold mr-2">{formatCurrency(m.lastPrice)}</span>
                  <span className="text-slate-400">{formatNumber(m.volume)} vol</span>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Filter Toolbar */}
      <Card
        title="Instrument Catalog"
        subtitle="Search, filter, and inspect market instruments across all supported exchanges"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="w-56">
              <Input
                type="text"
                placeholder="Search symbol or name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                leftIcon={<Search className="w-3.5 h-3.5 text-slate-400" />}
              />
            </div>

            {/* Classification Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-[#0A0A0A] border border-slate-200 dark:border-card-border rounded-xl p-0.5 shadow-sm">
              <button
                onClick={() => setSelectedClassification('')}
                className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors ${
                  selectedClassification === '' ? 'bg-cyan-50 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setSelectedClassification('REAL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors ${
                  selectedClassification === 'REAL' ? 'bg-cyan-50 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 font-bold shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Real NSE
              </button>
              <button
                onClick={() => setSelectedClassification('SIMULATED')}
                className={`px-3 py-1.5 rounded-lg text-xs font-sans font-medium transition-colors ${
                  selectedClassification === 'SIMULATED' ? 'bg-purple-50 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-bold shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Simulated
              </button>
            </div>

            {/* Exchange Dropdown */}
            <select
              value={selectedExchange}
              onChange={(e) => setSelectedExchange(e.target.value)}
              className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-card-border rounded-xl text-xs font-sans text-slate-800 dark:text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500 shadow-sm"
            >
              <option value="">All Exchanges</option>
              {exchanges.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>

            {/* Sector Dropdown */}
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-card-border rounded-xl text-xs font-sans text-slate-800 dark:text-slate-300 px-3 py-2 focus:outline-none focus:border-cyan-500 shadow-sm"
            >
              <option value="">All Sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-[#0A0A0A] border border-slate-200 dark:border-card-border rounded-xl p-0.5 shadow-sm">
              <button
                onClick={() => setViewMode('animated')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                  viewMode === 'animated'
                    ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                }`}
                title="Interactive animated stock table with sparklines"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Live Table
              </button>
              <button
                onClick={() => setViewMode('classic')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-sans transition-colors ${
                  viewMode === 'classic'
                    ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                }`}
                title="Compact grid view"
              >
                <TableIcon className="w-3.5 h-3.5" />
                Compact
              </button>
            </div>
          </div>
        }
      >
        {isLoadingInstruments ? (
          <div className="p-8 text-center text-slate-400 text-xs font-mono">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
            Loading instrument catalog...
          </div>
        ) : instruments.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs font-mono">
            No instruments found matching your search and filter criteria.
          </div>
        ) : viewMode === 'animated' ? (
          <div className="p-2 sm:p-4">
            <StocksDataTable stocks={stockItems} title="" />
          </div>
        ) : (
          <Table columns={columns} data={instruments} keyExtractor={(item) => String(item.id)} />
        )}
      </Card>

      {/* Regulatory & Educational Compliance Notice */}
      <div className="p-4 rounded-xl bg-card border border-card-border flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="font-semibold text-slate-200">
            Market Data Segregation (Engineering Rule #8):
          </span>
          <p className="leading-relaxed">
            TRADEGRID explicitly segregates authentic stock references from synthetic educational listings. Real-market instruments represent genuine entities with static reference pricing; they do not receive fabricated live trade prints. Fictional instruments are marked <code>SIMULATED</code> and powered by internal algorithmic simulation models.
          </p>
        </div>
      </div>
    </div>
  );
};
