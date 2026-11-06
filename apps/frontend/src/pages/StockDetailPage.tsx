import React, { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useMarketStore } from '../store/marketStore';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { formatCurrency, formatPercent, formatNumber, formatDate } from '../utils/formatters';
import { CandleInterval } from '@tradegrid/shared-types';
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
} from 'lucide-react';

const intervals: Array<{ key: CandleInterval; label: string }> = [
  { key: '1m', label: '1M' },
  { key: '5m', label: '5M' },
  { key: '15m', label: '15M' },
  { key: '1h', label: '1H' },
  { key: '1d', label: '1D' },
];

export const StockDetailPage: React.FC = () => {
  const { symbol } = useParams<{ symbol: string }>();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const {
    selectedInstrument,
    selectedQuote,
    selectedCandles,
    selectedInterval,
    isLoadingDetail,
    isLoadingCandles,
    error,
    fetchInstrumentDetail,
    setSelectedInterval,
  } = useMarketStore();

  useEffect(() => {
    if (symbol) {
      fetchInstrumentDetail(symbol);
    }
  }, [symbol, fetchInstrumentDetail]);

  // Initialize and update Lightweight Charts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Clean up previous chart instance if exists
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 420,
      layout: {
        background: { color: '#090D16' },
        textColor: '#94A3B8',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1E293B' },
        horzLines: { color: '#1E293B' },
      },
      crosshair: {
        vertLine: { color: '#38BDF8', width: 1, style: 3 },
        horzLine: { color: '#38BDF8', width: 1, style: 3 },
      },
      timeScale: {
        borderColor: '#1E293B',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#1E293B',
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
    });

    // Add Candlestick Series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    // Add Volume Histogram Subseries
    const volumeSeries = chart.addHistogramSeries({
      color: '#38BDF8',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    chartInstanceRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;

    // Handle responsive resize
    const handleResize = () => {
      if (chartContainerRef.current && chartInstanceRef.current) {
        chartInstanceRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [symbol]);

  // Feed candles and volume data to the chart
  useEffect(() => {
    if (
      !candleSeriesRef.current ||
      !volumeSeriesRef.current ||
      !selectedCandles ||
      selectedCandles.length === 0
    ) {
      return;
    }

    // Format candles for lightweight-charts: time can be unix timestamp in seconds
    const formattedCandles = selectedCandles.map((c) => ({
      time: Math.floor(new Date(c.timestamp).getTime() / 1000) as any,
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
    }));

    const formattedVolume = selectedCandles.map((c) => ({
      time: Math.floor(new Date(c.timestamp).getTime() / 1000) as any,
      value: parseFloat(c.volume),
      color: parseFloat(c.close) >= parseFloat(c.open) ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
    }));

    candleSeriesRef.current.setData(formattedCandles);
    volumeSeriesRef.current.setData(formattedVolume);

    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [selectedCandles]);

  if (isLoadingDetail) {
    return (
      <div className="p-12 text-center text-slate-400 font-mono text-sm">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
        Loading instrument metadata and market quote...
      </div>
    );
  }

  if (error || !selectedInstrument) {
    return (
      <div className="space-y-4 max-w-xl mx-auto p-8 text-center">
        <h2 className="text-lg font-bold text-white">Instrument Not Found</h2>
        <p className="text-xs text-slate-400">{error || `No instrument matching '${symbol}'`}</p>
        <Link
          to="/markets"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-mono font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Markets
        </Link>
      </div>
    );
  }

  const isReal = selectedInstrument.dataClassification === 'REAL';
  const priceChange = selectedQuote ? parseFloat(selectedQuote.changeAmount) : 0;
  const isPos = priceChange >= 0;

  return (
    <div className="space-y-6">
      {/* Top Navigation & Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          to="/markets"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Market Instruments
        </Link>

        <div className="flex items-center gap-2">
          <Badge variant={isReal ? 'cyan' : 'simulated'}>
            {isReal ? 'REAL NSE REFERENCE' : 'SIMULATED INSTRUMENT'}
          </Badge>
          <Badge variant={selectedInstrument.marketStatus === 'ACTIVE' ? 'gain' : 'loss'}>
            {selectedInstrument.marketStatus}
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
        <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <span className="font-bold">
            {isReal ? 'Authentic NSE Stock Reference' : 'Synthetic Educational Equity'}
          </span>
          <p className="leading-relaxed opacity-90">
            {isReal
              ? 'This instrument mirrors a genuine NSE/BSE listed enterprise. Quotes represent static reference data or licensed feed snapshots. Do not use for real financial trading decisions.'
              : 'This is a fictional synthetic enterprise generated specifically for TRADEGRID trading mechanics, algorithmic volatility studies, and educational matching tests.'}
          </p>
        </div>
      </div>

      {/* Instrument Header & Quote Card */}
      <div className="bg-card border border-card-border p-6 rounded-2xl shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-mono text-white tracking-tight">
              {selectedInstrument.symbol}
            </h1>
            <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-[#090D16] border border-card-border text-slate-400">
              {selectedInstrument.exchange}
            </span>
            <span className="text-xs font-medium text-slate-400">
              {selectedInstrument.sector}
            </span>
          </div>
          <p className="text-sm text-slate-300 font-medium">{selectedInstrument.name}</p>
        </div>

        {/* Price Display */}
        {selectedQuote && (
          <div className="flex items-baseline gap-4">
            <div className="text-right">
              <span className="text-xs font-mono uppercase text-slate-400 block leading-none mb-1">
                Last Price ({selectedInstrument.currency})
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

        <div>
          <Link
            to={`/trade?symbol=${selectedInstrument.symbol}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-mono font-bold tracking-wider uppercase transition-colors shadow-lg shadow-cyan-600/20"
          >
            <Sparkles className="w-4 h-4" /> Trade on Terminal
          </Link>
        </div>
      </div>

      {/* Candlestick Chart Area */}
      <Card
        title={`${selectedInstrument.symbol} Candlestick Chart`}
        subtitle={`Historical price action with volume histogram (${selectedInterval} interval)`}
        action={
          <div className="flex items-center gap-1 bg-[#090D16] p-1 rounded-xl border border-card-border">
            {intervals.map((int) => (
              <button
                key={int.key}
                onClick={() => setSelectedInterval(int.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                  selectedInterval === int.key
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {int.label}
              </button>
            ))}
          </div>
        }
      >
        <div className="relative">
          {isLoadingCandles && (
            <div className="absolute inset-0 bg-background/60 backdrop-blur-xs flex items-center justify-center z-10 text-xs font-mono text-cyan-400">
              <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading candles...
            </div>
          )}
          <div ref={chartContainerRef} className="w-full rounded-xl overflow-hidden" />
        </div>
      </Card>

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
      <div className="p-4 rounded-xl bg-card border border-card-border grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-cyan-400" />
          <span>Sector: <strong className="text-slate-200">{selectedInstrument.sector}</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span>Type: <strong className="text-slate-200">{selectedInstrument.instrumentType} ({selectedInstrument.currency})</strong></span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          <span>Quote Timestamp: <strong className="text-slate-200">{formatDate(selectedQuote?.timestamp || selectedInstrument.updatedAt)}</strong></span>
        </div>
      </div>
    </div>
  );
};
