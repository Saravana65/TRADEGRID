import React, { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { AdvancedTradingChart } from '../components/charting/AdvancedTradingChart';
import { Badge } from '../components/common/Badge';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '../utils/formatters';
import {
  ArrowLeft,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Layers,
  Clock,
  ShieldCheck,
  Building2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

export const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const activeSymbol = symbol || 'TGRID';

  const {
    selectedInstrument,
    selectedQuote,
    isLoadingDetail,
    error,
    fetchInstrumentDetail,
  } = useMarketStore();

  useEffect(() => {
    if (activeSymbol) {
      fetchInstrumentDetail(activeSymbol);
    }
  }, [activeSymbol, fetchInstrumentDetail]);

  if (isLoadingDetail && !selectedInstrument) {
    return (
      <div className="p-16 text-center text-slate-400 font-mono text-sm flex flex-col items-center justify-center gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
        <span>Loading {activeSymbol} market telemetry & orderbook data...</span>
      </div>
    );
  }

  if (error && !selectedInstrument) {
    return (
      <div className="space-y-4 max-w-xl mx-auto p-8 text-center bg-card rounded-2xl border border-card-border mt-8">
        <h2 className="text-lg font-bold text-white">Instrument Not Found</h2>
        <p className="text-xs text-slate-400">{error || `No instrument matching '${activeSymbol}'`}</p>
        <Link
          to="/markets"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-mono font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Markets
        </Link>
      </div>
    );
  }

  const isReal = selectedInstrument?.dataClassification === 'REAL';
  const priceChange = selectedQuote ? parseFloat(selectedQuote.changeAmount) : 0;
  const isPos = priceChange >= 0;

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/markets"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Market Instruments
        </Link>

        <div className="flex items-center gap-2">
          <Badge variant={isReal ? 'cyan' : 'simulated'}>
            {isReal ? 'REAL NSE REFERENCE' : 'SIMULATED INSTRUMENT'}
          </Badge>
          <Badge variant={selectedInstrument?.marketStatus === 'ACTIVE' ? 'gain' : 'loss'}>
            {selectedInstrument?.marketStatus || 'ACTIVE'}
          </Badge>
        </div>
      </div>

      {/* Classification & Regulatory Banner */}
      <div
        className={`p-4 rounded-xl border flex items-start gap-3 ${
          isReal
            ? 'bg-blue-950/30 border-blue-800/40 text-blue-200'
            : 'bg-purple-950/30 border-purple-800/40 text-purple-200'
        }`}
      >
        <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5 text-cyan-400" />
        <div className="text-xs space-y-1">
          <span className="font-bold">
            {isReal ? 'Authentic NSE Stock Reference' : 'Synthetic Educational Equity'}
          </span>
          <p className="leading-relaxed opacity-90">
            {isReal
              ? 'This instrument mirrors a genuine NSE/BSE listed enterprise. Quotes represent reference data or licensed feed snapshots. Designed for paper-trading simulations.'
              : 'This is a simulated enterprise engineered specifically for TRADEGRID trading mechanics, algorithmic volatility studies, and educational matching tests.'}
          </p>
        </div>
      </div>

      {/* Instrument Header & Quote Card */}
      <div className="bg-card border border-card-border p-6 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono text-white tracking-tight">
              {selectedInstrument?.symbol || activeSymbol}
            </h1>
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-[#090D16] border border-card-border text-slate-400">
              {selectedInstrument?.exchange || 'NSE'}
            </span>
            <span className="text-xs font-medium text-slate-400">
              {selectedInstrument?.sector || 'Equities'}
            </span>
          </div>
          <p className="text-sm text-slate-300 font-medium">
            {selectedInstrument?.name || 'Loading Enterprise...'}
          </p>
        </div>

        {/* Price Display */}
        {selectedQuote && (
          <div className="flex items-baseline gap-4">
            <div className="text-right">
              <span className="text-xs font-mono uppercase text-slate-400 block leading-none mb-1">
                Last Price ({selectedInstrument?.currency || 'INR'})
              </span>
              <div className="text-3xl font-bold font-mono text-white tabular-nums tracking-tight">
                {formatCurrency(selectedQuote.lastPrice)}
              </div>
            </div>

            <div
              className={`p-2 rounded-xl border text-right font-mono ${
                isPos
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              }`}
            >
              <div className="text-xs font-bold flex items-center gap-1 justify-end">
                {isPos ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {isPos ? '+' : ''}
                {formatPercent(selectedQuote.changePercent)}
              </div>
              <div className="text-[11px] font-semibold">
                {isPos ? '+' : ''}
                {formatCurrency(selectedQuote.changeAmount)}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Link
            to={`/trade?symbol=${selectedInstrument?.symbol || activeSymbol}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-colors shadow-lg shadow-cyan-600/20"
          >
            <Sparkles className="w-4 h-4" /> Open In Terminal
          </Link>
          <Link
            to={`/chart?symbol=${selectedInstrument?.symbol || activeSymbol}`}
            className="inline-flex items-center gap-1.5 px-3 py-2.5 bg-[#0A0F1D] hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-mono border border-card-border hover:border-cyan-500/40 transition-colors"
          >
            <ExternalLink className="w-4 h-4" /> Studio
          </Link>
        </div>
      </div>

      {/* Live Market Chart Embed */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-200 font-mono">
            Live Interactive Technical Chart
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Powered by TradingView Lightweight Charts & WebSocket Feeds
          </span>
        </div>
        <AdvancedTradingChart
          symbol={selectedInstrument?.symbol || activeSymbol}
          height={480}
          showToolbar={true}
          dataClassification={isReal ? 'REAL' : 'SIMULATED'}
        />
      </div>

      {/* Quote Breakdown Stats Grid */}
      {selectedQuote && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Previous Close</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {formatCurrency(selectedQuote.previousClose)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Open Price</span>
            <div className="text-sm font-bold font-mono text-white mt-0.5">
              {formatCurrency(selectedQuote.openPrice)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">24h High</span>
            <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
              {formatCurrency(selectedQuote.highPrice)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">24h Low</span>
            <div className="text-sm font-bold font-mono text-rose-400 mt-0.5">
              {formatCurrency(selectedQuote.lowPrice)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Total Volume</span>
            <div className="text-sm font-bold font-mono text-cyan-400 mt-0.5">
              {formatNumber(selectedQuote.volume)}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-card border border-card-border">
            <span className="text-[10px] font-mono uppercase text-slate-400">Data Source</span>
            <div className="text-xs font-bold font-mono text-slate-300 mt-0.5 truncate" title={selectedQuote.dataSource}>
              {selectedQuote.dataSource}
            </div>
          </div>
        </div>
      )}

      {/* Metadata & Audit Information */}
      {selectedInstrument && (
        <div className="p-4 rounded-xl bg-card border border-card-border grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-400" />
            <span>
              Sector: <strong className="text-slate-200">{selectedInstrument.sector}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>
              Type: <strong className="text-slate-200">{selectedInstrument.instrumentType} ({selectedInstrument.currency})</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400" />
            <span>
              Quote Timestamp: <strong className="text-slate-200">{formatDate(selectedQuote?.timestamp || selectedInstrument.updatedAt)}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
