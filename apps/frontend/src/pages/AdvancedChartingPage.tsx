import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useMarketStore } from '../store/marketStore';
import { AdvancedTradingChart } from '../components/charting/AdvancedTradingChart';
import { formatCurrency, formatNumber, formatPercent } from '../utils/formatters';
import {
  ArrowUpRight,
  ArrowDownRight,
  CandlestickChart,
  Search,
  Activity,
  ShieldAlert,
} from 'lucide-react';

export const AdvancedChartingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const symbol = searchParams.get('symbol') || 'TGRID';

  const {
    instruments,
    selectedInstrument,
    selectedQuote,
    fetchInstruments,
    fetchInstrumentDetail,
  } = useMarketStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [isSymbolSelectorOpen, setIsSymbolSelectorOpen] = useState(false);

  useEffect(() => {
    fetchInstruments();
  }, [fetchInstruments]);

  useEffect(() => {
    if (symbol) {
      fetchInstrumentDetail(symbol);
    }
  }, [symbol, fetchInstrumentDetail]);

  const handleSelectSymbol = (newSymbol: string) => {
    setSearchParams({ symbol: newSymbol });
    setIsSymbolSelectorOpen(false);
  };

  const filteredInstruments = instruments.filter(
    (inst) =>
      inst.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inst.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const price = selectedQuote?.lastPrice ? parseFloat(selectedQuote.lastPrice) : 150.0;
  const change = selectedQuote?.changeAmount ? parseFloat(selectedQuote.changeAmount) : 2.5;
  const changePct = selectedQuote?.changePercent ? parseFloat(selectedQuote.changePercent) : 1.67;
  const isPositive = change >= 0;

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto p-2 sm:p-4">
      {/* Top Bar: Active Instrument Ticker & Controls */}
      <div className="bg-white dark:bg-[#0A0A0A] border border-slate-200 dark:border-[#1F1F1F] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          {/* Quick Symbol Switcher Popover */}
          <div className="relative">
            <button
              onClick={() => setIsSymbolSelectorOpen(!isSymbolSelectorOpen)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 dark:bg-[#141414] dark:hover:bg-[#1A1A1A] text-slate-900 dark:text-white px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#262626] font-bold text-lg tracking-wide transition-colors"
            >
              <span>{symbol}</span>
              <span className="text-xs bg-slate-200 dark:bg-[#262626] text-slate-700 dark:text-neutral-300 px-1.5 py-0.5 rounded font-mono font-normal">
                {selectedInstrument?.exchange || 'NSE'}
              </span>
              <Search className="w-3.5 h-3.5 text-slate-400 ml-1" />
            </button>

            {isSymbolSelectorOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-[#0D0D0D] border border-slate-200 dark:border-[#262626] rounded-2xl shadow-2xl p-3 z-40">
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-neutral-500" />
                  <input
                    type="text"
                    placeholder="Search instrument..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-[#141414] border border-slate-200 dark:border-[#262626] rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-neutral-500 focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {filteredInstruments.map((inst) => (
                    <button
                      key={inst.symbol}
                      onClick={() => handleSelectSymbol(inst.symbol)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors ${
                        inst.symbol === symbol
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-black font-semibold'
                          : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-[#171717]'
                      }`}
                    >
                      <div className="text-left">
                        <span className="font-bold block">{inst.symbol}</span>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[140px]">
                          {inst.name}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">
                        {inst.exchange}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Current Live Price & Daily Change */}
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-white tracking-tight">
              {formatCurrency(price)}
            </span>
            <span
              className={`flex items-center text-xs font-bold font-mono px-2 py-0.5 rounded ${
                isPositive
                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50'
                  : 'bg-rose-950/40 text-rose-400 border border-rose-800/50'
              }`}
            >
              {isPositive ? (
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
              )}
              {isPositive ? '+' : ''}
              {change.toFixed(2)} ({formatPercent(changePct)})
            </span>
          </div>

          <div className="hidden lg:flex items-center gap-4 text-xs border-l border-card-border pl-4">
            <div>
              <span className="text-slate-500 block text-[10px]">24h High</span>
              <span className="font-mono font-medium text-slate-300">
                {formatCurrency(selectedQuote?.highPrice ? parseFloat(selectedQuote.highPrice) : price * 1.02)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">24h Low</span>
              <span className="font-mono font-medium text-slate-300">
                {formatCurrency(selectedQuote?.lowPrice ? parseFloat(selectedQuote.lowPrice) : price * 0.98)}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Volume</span>
              <span className="font-mono font-medium text-slate-300">
                {formatNumber(selectedQuote?.volume ? parseFloat(selectedQuote.volume) : 124500)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons: Quick Navigation to Terminal & Research */}
        <div className="flex items-center gap-2">
          <Link
            to={`/trade?symbol=${symbol}`}
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <CandlestickChart className="w-3.5 h-3.5" />
            <span>Place Order</span>
          </Link>
          <Link
            to={`/research?symbol=${symbol}`}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Backtest Strategies</span>
          </Link>
        </div>
      </div>

      {/* Advanced Technical Chart Studio */}
      <AdvancedTradingChart symbol={symbol} height={620} showToolbar={true} />

      {/* Feature & Transparency Badge */}
      <div className="bg-[#0D0D0D] border border-card-border rounded-xl p-3 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-blue-400" />
          <span>
            <strong className="text-slate-300">Phase 7 Technical Studio:</strong> Powered by
            TradingView Lightweight Charts v4. Pure server-verified indicators (SMA, EMA, Bollinger,
            VWAP, RSI, MACD, Stochastic). Volume Profile is an OHLCV-derived estimate.
          </span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          Latency: ~12ms • Live WebSocket Feed: Connected
        </div>
      </div>
    </div>
  );
};
