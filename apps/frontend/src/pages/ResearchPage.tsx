import React, { useState, useEffect } from 'react';
import {
  QuantitativeStrategyType,
  BacktestResult,
  QuantitativeSignal,
  PortfolioInsight,
  AIStrategyComparison,
} from '@tradegrid/shared-types';
import { researchService } from '../services/research.service';
import {
  Cpu,
  TrendingUp,
  BarChart2,
  PieChart,
  GitCompare,
  Play,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Sliders,
  Activity,
} from 'lucide-react';

export const ResearchPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'backtest' | 'signals' | 'portfolio' | 'compare'>('backtest');

  // Available symbols & strategies
  const symbols = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'TGRID'];
  const intervals = ['1d', '1h', '15m', '5m'];

  // Backtester state
  const [selectedSymbol, setSelectedSymbol] = useState('RELIANCE');
  const [selectedInterval, setSelectedInterval] = useState('1d');
  const [selectedStrategy, setSelectedStrategy] = useState<QuantitativeStrategyType>('SMA_CROSSOVER');
  const [initialCapital, setInitialCapital] = useState(100000);
  const [positionSizePct, setPositionSizePct] = useState(25);
  const [stopLossPct, setStopLossPct] = useState<number | undefined>(undefined);
  const [takeProfitPct, setTakeProfitPct] = useState<number | undefined>(undefined);
  const [slippagePct, setSlippagePct] = useState(0.05);
  const [commissionPct, setCommissionPct] = useState(0.1);

  // Strategy specific parameters
  const [smaFast, setSmaFast] = useState(10);
  const [smaSlow, setSmaSlow] = useState(30);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [rsiOversold, setRsiOversold] = useState(30);
  const [rsiOverbought, setRsiOverbought] = useState(70);
  const [macdFast, setMacdFast] = useState(12);
  const [macdSlow, setMacdSlow] = useState(26);
  const [macdSignal, setMacdSignal] = useState(9);
  const [bbPeriod, setBbPeriod] = useState(20);
  const [bbMultiplier, setBbMultiplier] = useState(2.0);
  const [breakoutPeriod, setBreakoutPeriod] = useState(20);

  // Results state
  const [backtestResult, setBacktestResult] = useState<BacktestResult | null>(null);
  const [isBacktesting, setIsBacktesting] = useState(false);
  const [backtestError, setBacktestError] = useState<string | null>(null);

  // Signals Scanner state
  const [signals, setSignals] = useState<QuantitativeSignal[]>([]);
  const [isLoadingSignals, setIsLoadingSignals] = useState(false);
  const [signalFilterType, setSignalFilterType] = useState<string>('ALL');

  // Portfolio Insights state
  const [portfolioInsight, setPortfolioInsight] = useState<PortfolioInsight | null>(null);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false);

  // Strategy Comparison state
  const [comparisonSymbol, setComparisonSymbol] = useState('RELIANCE');
  const [comparisonData, setComparisonData] = useState<{
    symbol: string;
    results: BacktestResult[];
    aiComparison: AIStrategyComparison;
  } | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  // Initial load
  useEffect(() => {
    loadSignals();
    loadPortfolioInsights();
  }, []);

  const handleRunBacktest = async () => {
    setIsBacktesting(true);
    setBacktestError(null);

    // Build strategy parameters based on selection
    let strategyParams: Record<string, any> = {};
    if (selectedStrategy === 'SMA_CROSSOVER' || selectedStrategy === 'EMA_CROSSOVER') {
      strategyParams = { fastPeriod: smaFast, slowPeriod: smaSlow };
    } else if (selectedStrategy === 'RSI_MOMENTUM') {
      strategyParams = { period: rsiPeriod, oversold: rsiOversold, overbought: rsiOverbought };
    } else if (selectedStrategy === 'MACD_TREND') {
      strategyParams = { fastPeriod: macdFast, slowPeriod: macdSlow, signalPeriod: macdSignal };
    } else if (selectedStrategy === 'BOLLINGER_REVERSION') {
      strategyParams = { period: bbPeriod, multiplier: bbMultiplier };
    } else if (selectedStrategy === 'BREAKOUT') {
      strategyParams = { period: breakoutPeriod };
    }

    try {
      const res = await researchService.runBacktest({
        symbol: selectedSymbol,
        interval: selectedInterval,
        strategyType: selectedStrategy,
        strategyParams,
        initialCapital,
        positionSizing: { type: 'FIXED_PERCENT', value: positionSizePct },
        stopLossPercent: stopLossPct ? Number(stopLossPct) : null,
        takeProfitPercent: takeProfitPct ? Number(takeProfitPct) : null,
        slippagePercent: slippagePct,
        commissionPercent: commissionPct,
        includeAIAnalysis: true,
      });
      setBacktestResult(res);
    } catch (err: any) {
      setBacktestError(err.response?.data?.error?.message || err.message || 'Backtest execution failed');
    } finally {
      setIsBacktesting(false);
    }
  };

  const loadSignals = async () => {
    setIsLoadingSignals(true);
    try {
      const res = await researchService.getSignals({ limit: 12 });
      setSignals(res);
    } catch {
      // Ignore
    } finally {
      setIsLoadingSignals(false);
    }
  };

  const loadPortfolioInsights = async () => {
    setIsLoadingPortfolio(true);
    try {
      const res = await researchService.getPortfolioInsights();
      setPortfolioInsight(res);
    } catch {
      // Ignore if not logged in
    } finally {
      setIsLoadingPortfolio(false);
    }
  };

  const handleRunComparison = async () => {
    setIsComparing(true);
    try {
      const res = await researchService.compareStrategies({
        symbol: comparisonSymbol,
        strategies: [
          'SMA_CROSSOVER',
          'EMA_CROSSOVER',
          'RSI_MOMENTUM',
          'MACD_TREND',
          'BOLLINGER_REVERSION',
          'BREAKOUT',
        ],
      });
      setComparisonData(res);
    } catch {
      // Ignore
    } finally {
      setIsComparing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-100 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                Quantitative Research & Strategy Backtester
                <span className="text-xs font-mono uppercase bg-cyan-500/20 text-cyan-400 px-2.5 py-0.5 rounded-full border border-cyan-500/30">
                  Phase 6
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Evaluate algorithmic trading strategies against historical data, scan quantitative signals, and analyze portfolio risk.
              </p>
            </div>
          </div>
        </div>

        {/* Global Educational Disclaimer */}
        <div className="flex items-center gap-2 bg-slate-900/80 border border-amber-500/30 rounded-lg px-3 py-1.5 text-xs text-amber-300">
          <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>Educational Virtual Simulator. Historical simulation does not guarantee future live returns.</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-2">
        <button
          onClick={() => setActiveTab('backtest')}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'backtest'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Strategy Backtester
        </button>

        <button
          onClick={() => setActiveTab('signals')}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'signals'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Signals Scanner
          {signals.length > 0 && (
            <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-cyan-300 font-mono">
              {signals.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('portfolio')}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'portfolio'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieChart className="w-4 h-4" />
          Portfolio Risk & Health
        </button>

        <button
          onClick={() => setActiveTab('compare')}
          className={`flex items-center gap-2 px-4 py-2.5 font-medium text-sm transition-all border-b-2 ${
            activeTab === 'compare'
              ? 'border-cyan-400 text-cyan-400 bg-cyan-500/5'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <GitCompare className="w-4 h-4" />
          Strategy Comparison
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: STRATEGY BACKTESTER */}
      {/* ==================================================================== */}
      {activeTab === 'backtest' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls Column (4 cols) */}
          <div className="lg:col-span-4 space-y-5 bg-[#0D121F] border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-cyan-400" />
                Backtest Configuration
              </h2>
            </div>

            {/* Instrument & Timeframe */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase">Instrument</label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {symbols.map((sym) => (
                    <option key={sym} value={sym}>
                      {sym}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 uppercase">Timeframe</label>
                <select
                  value={selectedInterval}
                  onChange={(e) => setSelectedInterval(e.target.value)}
                  className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 font-mono"
                >
                  {intervals.map((inv) => (
                    <option key={inv} value={inv}>
                      {inv.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Strategy Selection */}
            <div>
              <label className="text-xs font-medium text-slate-400 uppercase">Strategy Algorithm</label>
              <select
                value={selectedStrategy}
                onChange={(e) => setSelectedStrategy(e.target.value as QuantitativeStrategyType)}
                className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-cyan-300 font-medium focus:outline-none focus:border-cyan-500"
              >
                <option value="SMA_CROSSOVER">SMA Crossover (Golden/Death Cross)</option>
                <option value="EMA_CROSSOVER">EMA Crossover (Fast Momentum)</option>
                <option value="RSI_MOMENTUM">RSI Momentum & Mean Reversion</option>
                <option value="MACD_TREND">MACD Trend & Momentum</option>
                <option value="BOLLINGER_REVERSION">Bollinger Bands Mean Reversion</option>
                <option value="BREAKOUT">Donchian Channel Breakout</option>
              </select>
            </div>

            {/* Dynamic Strategy Parameters */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 space-y-3">
              <span className="text-xs font-medium text-cyan-400 uppercase tracking-wide">
                Algorithm Parameters
              </span>

              {(selectedStrategy === 'SMA_CROSSOVER' || selectedStrategy === 'EMA_CROSSOVER') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">Fast Period</label>
                    <input
                      type="number"
                      value={smaFast}
                      onChange={(e) => setSmaFast(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-sm text-white font-mono"
                      min={2}
                      max={50}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Slow Period</label>
                    <input
                      type="number"
                      value={smaSlow}
                      onChange={(e) => setSmaSlow(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-sm text-white font-mono"
                      min={5}
                      max={200}
                    />
                  </div>
                </div>
              )}

              {selectedStrategy === 'RSI_MOMENTUM' && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-400">Period</label>
                    <input
                      type="number"
                      value={rsiPeriod}
                      onChange={(e) => setRsiPeriod(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      min={2}
                      max={50}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Oversold</label>
                    <input
                      type="number"
                      value={rsiOversold}
                      onChange={(e) => setRsiOversold(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      min={5}
                      max={45}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Overbought</label>
                    <input
                      type="number"
                      value={rsiOverbought}
                      onChange={(e) => setRsiOverbought(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                      min={55}
                      max={95}
                    />
                  </div>
                </div>
              )}

              {selectedStrategy === 'MACD_TREND' && (
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-400">Fast EMA</label>
                    <input
                      type="number"
                      value={macdFast}
                      onChange={(e) => setMacdFast(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Slow EMA</label>
                    <input
                      type="number"
                      value={macdSlow}
                      onChange={(e) => setMacdSlow(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Signal</label>
                    <input
                      type="number"
                      value={macdSignal}
                      onChange={(e) => setMacdSignal(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {selectedStrategy === 'BOLLINGER_REVERSION' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400">Period</label>
                    <input
                      type="number"
                      value={bbPeriod}
                      onChange={(e) => setBbPeriod(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-sm text-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Std Dev Multiplier</label>
                    <input
                      type="number"
                      step="0.1"
                      value={bbMultiplier}
                      onChange={(e) => setBbMultiplier(Number(e.target.value))}
                      className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-sm text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {selectedStrategy === 'BREAKOUT' && (
                <div>
                  <label className="text-xs text-slate-400">Donchian Lookback Bars</label>
                  <input
                    type="number"
                    value={breakoutPeriod}
                    onChange={(e) => setBreakoutPeriod(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-sm text-white font-mono"
                  />
                </div>
              )}
            </div>

            {/* Financial & Risk Parameters */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase">Virtual Capital ($)</label>
                  <input
                    type="number"
                    value={initialCapital}
                    onChange={(e) => setInitialCapital(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    min={1000}
                    step={10000}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase">Position Size (% Equity)</label>
                  <input
                    type="number"
                    value={positionSizePct}
                    onChange={(e) => setPositionSizePct(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                    min={5}
                    max={100}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase">Stop Loss (% Optional)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="None"
                    value={stopLossPct || ''}
                    onChange={(e) => setStopLossPct(e.target.value ? Number(e.target.value) : undefined)}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase">Take Profit (% Optional)</label>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="None"
                    value={takeProfitPct || ''}
                    onChange={(e) => setTakeProfitPct(e.target.value ? Number(e.target.value) : undefined)}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs text-slate-400">
                <div>
                  <label className="text-slate-400">Slippage (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={slippagePct}
                    onChange={(e) => setSlippagePct(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400">Commission (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={commissionPct}
                    onChange={(e) => setCommissionPct(Number(e.target.value))}
                    className="mt-1 w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Error notice */}
            {backtestError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{backtestError}</span>
              </div>
            )}

            {/* Run Button */}
            <button
              onClick={handleRunBacktest}
              disabled={isBacktesting}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50"
            >
              {isBacktesting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Running Server Simulation...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  Execute Strategy Backtest
                </>
              )}
            </button>
          </div>

          {/* Results Column (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {!backtestResult && !isBacktesting && (
              <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-12 text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
                  <BarChart2 className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-white">No Backtest Executed Yet</h3>
                <p className="text-sm text-slate-400 max-w-md mx-auto">
                  Configure your algorithm parameters on the left and click <strong>Execute Strategy Backtest</strong> to evaluate performance against historical market candles with strict anti-lookahead verification.
                </p>
              </div>
            )}

            {isBacktesting && (
              <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-16 text-center space-y-3">
                <RefreshCw className="w-10 h-10 mx-auto text-cyan-400 animate-spin" />
                <h4 className="text-base font-semibold text-white">Analyzing Historical Candles...</h4>
                <p className="text-xs text-slate-400 font-mono">
                  Calculating indicators • Simulating slippage & commission • Computing Sharpe & Sortino ratios
                </p>
              </div>
            )}

            {backtestResult && (
              <>
                {/* Performance Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">Total Return</span>
                    <div
                      className={`text-xl font-bold font-mono mt-1 flex items-center gap-1 ${
                        backtestResult.metrics.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {backtestResult.metrics.totalReturnPercent >= 0 ? (
                        <ArrowUpRight className="w-5 h-5" />
                      ) : (
                        <ArrowDownRight className="w-5 h-5" />
                      )}
                      {backtestResult.metrics.totalReturnPercent.toFixed(2)}%
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Bench: {backtestResult.metrics.benchmarkReturnPercent.toFixed(2)}%
                    </span>
                  </div>

                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">Max Drawdown</span>
                    <div className="text-xl font-bold font-mono mt-1 text-rose-400">
                      -{backtestResult.metrics.maxDrawdownPercent.toFixed(2)}%
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">Peak capital drop</span>
                  </div>

                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">Sharpe Ratio</span>
                    <div className="text-xl font-bold font-mono mt-1 text-cyan-400">
                      {backtestResult.metrics.sharpeRatio.toFixed(2)}
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Sortino: {backtestResult.metrics.sortinoRatio.toFixed(2)}
                    </span>
                  </div>

                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-4">
                    <span className="text-xs font-medium text-slate-400">Win Rate</span>
                    <div className="text-xl font-bold font-mono mt-1 text-amber-400">
                      {backtestResult.metrics.winRatePercent.toFixed(1)}%
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Profit Factor: {backtestResult.metrics.profitFactorDisplay}
                    </span>
                  </div>
                </div>

                {/* Additional Stats row */}
                <div className="grid grid-cols-3 gap-3 text-xs bg-slate-900/60 border border-slate-800 rounded-lg p-3">
                  <div>
                    <span className="text-slate-400">Final Equity: </span>
                    <strong className="text-white font-mono">
                      ${backtestResult.metrics.finalEquity.toLocaleString()}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Total Trades: </span>
                    <strong className="text-white font-mono">
                      {backtestResult.metrics.totalTrades} ({backtestResult.metrics.winningTrades}W / {backtestResult.metrics.losingTrades}L)
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400">Market Exposure: </span>
                    <strong className="text-white font-mono">
                      {backtestResult.metrics.exposurePercent}%
                    </strong>
                  </div>
                </div>

                {/* Equity Curve SVG Chart */}
                <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-cyan-400" />
                      Simulated Equity Curve vs Benchmark
                    </h3>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span className="flex items-center gap-1.5 text-cyan-400">
                        <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Strategy Equity
                      </span>
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-600"></span> Benchmark (Buy & Hold)
                      </span>
                    </div>
                  </div>

                  {/* Render SVG Equity Curve */}
                  <div className="h-64 w-full relative">
                    {backtestResult.equityCurve.length > 1 ? (
                      (() => {
                        const pts = backtestResult.equityCurve;
                        const equities = pts.map((p) => p.equity);
                        const benchmarks = pts.map((p) => p.benchmarkEquity);
                        const allVals = [...equities, ...benchmarks];
                        const min = Math.min(...allVals) * 0.98;
                        const max = Math.max(...allVals) * 1.02;
                        const range = max - min || 1;

                        const width = 800;
                        const height = 240;

                        const equityPath = pts
                          .map((p, idx) => {
                            const x = (idx / (pts.length - 1)) * width;
                            const y = height - ((p.equity - min) / range) * height;
                            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                          })
                          .join(' ');

                        const benchPath = pts
                          .map((p, idx) => {
                            const x = (idx / (pts.length - 1)) * width;
                            const y = height - ((p.benchmarkEquity - min) / range) * height;
                            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                          })
                          .join(' ');

                        return (
                          <svg
                            viewBox={`0 0 ${width} ${height}`}
                            className="w-full h-full overflow-visible"
                            preserveAspectRatio="none"
                          >
                            {/* Grid lines */}
                            <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#1E293B" strokeDasharray="4 4" />
                            <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="#1E293B" strokeDasharray="4 4" />
                            <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#1E293B" strokeDasharray="4 4" />

                            {/* Benchmark line */}
                            <path d={benchPath} fill="none" stroke="#475569" strokeWidth="1.5" strokeDasharray="3 3" />

                            {/* Equity line */}
                            <path d={equityPath} fill="none" stroke="#38BDF8" strokeWidth="2.5" />
                          </svg>
                        );
                      })()
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                        Insufficient equity points to plot
                      </div>
                    )}
                  </div>
                </div>

                {/* AI Analysis Card */}
                {backtestResult.aiAnalysis && (
                  <div className="bg-gradient-to-br from-slate-900 to-[#0F172A] border border-cyan-500/30 rounded-xl p-5 space-y-4 shadow-xl shadow-cyan-950/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                          <Sparkles className="w-5 h-5" />
                        </div>
                        <h4 className="text-base font-semibold text-white">AI Quantitative Analysis</h4>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-mono font-semibold uppercase border ${
                          backtestResult.aiAnalysis.verdict === 'STRONG_CANDIDATE'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : backtestResult.aiAnalysis.verdict === 'MODERATE_POTENTIAL'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {backtestResult.aiAnalysis.verdict.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                      {backtestResult.aiAnalysis.summary}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <span className="font-semibold text-emerald-400 uppercase tracking-wide">Key Strengths</span>
                        <ul className="space-y-1 text-slate-300">
                          {backtestResult.aiAnalysis.strategyStrengths.map((s, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-1.5">
                        <span className="font-semibold text-rose-400 uppercase tracking-wide">Risk Considerations</span>
                        <ul className="space-y-1 text-slate-300">
                          {backtestResult.aiAnalysis.riskFactors.map((r, idx) => (
                            <li key={idx} className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
                              <span>{r}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800 text-xs text-slate-400">
                      <strong>Optimization Suggestion: </strong>
                      {backtestResult.aiAnalysis.optimizationSuggestions[0]}
                    </div>
                  </div>
                )}

                {/* Simulated Trades Table */}
                <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-5 space-y-3">
                  <h4 className="text-sm font-semibold text-white">Simulated Trade History</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-slate-900/80 text-slate-400 uppercase border-b border-slate-800">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">Entry Date</th>
                          <th className="p-2.5">Exit Date</th>
                          <th className="p-2.5">Entry</th>
                          <th className="p-2.5">Exit</th>
                          <th className="p-2.5">Qty</th>
                          <th className="p-2.5">Net P&L</th>
                          <th className="p-2.5">Return</th>
                          <th className="p-2.5">Exit Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {backtestResult.trades.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="p-6 text-center text-slate-500 font-sans">
                              No trades triggered with current parameter thresholds.
                            </td>
                          </tr>
                        ) : (
                          backtestResult.trades.map((t) => (
                            <tr key={t.id} className="hover:bg-slate-800/40">
                              <td className="p-2.5 text-slate-500">{t.tradeNumber}</td>
                              <td className="p-2.5 text-slate-300">{new Date(t.entryTimestamp).toLocaleDateString()}</td>
                              <td className="p-2.5 text-slate-300">{new Date(t.exitTimestamp).toLocaleDateString()}</td>
                              <td className="p-2.5 text-white">${t.entryPrice.toFixed(2)}</td>
                              <td className="p-2.5 text-white">${t.exitPrice.toFixed(2)}</td>
                              <td className="p-2.5 text-slate-300">{t.quantity}</td>
                              <td
                                className={`p-2.5 font-bold ${
                                  t.netProfitLoss >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {t.netProfitLoss >= 0 ? '+' : ''}${t.netProfitLoss.toFixed(2)}
                              </td>
                              <td
                                className={`p-2.5 font-bold ${
                                  t.returnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {t.returnPercent >= 0 ? '+' : ''}{t.returnPercent.toFixed(2)}%
                              </td>
                              <td className="p-2.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold ${
                                    t.exitReason === 'STOP_LOSS'
                                      ? 'bg-rose-500/20 text-rose-400'
                                      : t.exitReason === 'TAKE_PROFIT'
                                      ? 'bg-emerald-500/20 text-emerald-400'
                                      : 'bg-slate-800 text-slate-300'
                                  }`}
                                >
                                  {t.exitReason}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: QUANTITATIVE SIGNALS SCANNER */}
      {/* ==================================================================== */}
      {activeTab === 'signals' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#0D121F] border border-slate-800 rounded-xl p-4">
            <div>
              <h3 className="text-base font-semibold text-white">Rule-Based Quantitative Signal Scanner</h3>
              <p className="text-xs text-slate-400">
                Live technical momentum, mean-reversion, and breakout indicators evaluated across active instruments.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={signalFilterType}
                onChange={(e) => setSignalFilterType(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
              >
                <option value="ALL">All Signals</option>
                <option value="BUY">BUY Only</option>
                <option value="SELL">SELL Only</option>
                <option value="HOLD">HOLD Only</option>
              </select>
              <button
                onClick={loadSignals}
                disabled={isLoadingSignals}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                title="Refresh Signals"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingSignals ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {signals
              .filter((s) => signalFilterType === 'ALL' || s.signalType === signalFilterType)
              .map((s) => (
                <div
                  key={s.id}
                  className="bg-[#0D121F] border border-slate-800 hover:border-slate-700 transition-all rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-bold text-white font-mono">{s.symbol}</h4>
                      <span className="text-xs text-slate-400">{s.name}</span>
                    </div>
                    <span
                      className={`text-xs font-bold uppercase px-2.5 py-1 rounded-md border font-mono ${
                        s.signalType === 'BUY'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : s.signalType === 'SELL'
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {s.signalType}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-400">Current Price: ${s.currentPrice.toFixed(2)}</span>
                    <span
                      className={`font-semibold ${
                        s.strength === 'STRONG'
                          ? 'text-cyan-400'
                          : s.strength === 'MODERATE'
                          ? 'text-amber-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {s.strength} STRENGTH
                    </span>
                  </div>

                  {/* Score gauge bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Bearish (-100)</span>
                      <span>Bullish (+100)</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden relative">
                      <div
                        className={`h-full ${s.score >= 0 ? 'bg-emerald-400' : 'bg-rose-400'}`}
                        style={{
                          width: `${Math.abs(s.score)}%`,
                          marginLeft: s.score < 0 ? `${50 - Math.abs(s.score) / 2}%` : '50%',
                        }}
                      ></div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded border border-slate-800/80">
                    {s.explanation}
                  </p>

                  <div className="text-[10px] text-slate-500 uppercase font-mono">
                    Strategy: {s.strategyType.replace(/_/g, ' ')}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: PORTFOLIO RISK & INSIGHTS */}
      {/* ==================================================================== */}
      {activeTab === 'portfolio' && (
        <div className="space-y-6">
          {isLoadingPortfolio && (
            <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
              <RefreshCw className="w-8 h-8 mx-auto text-cyan-400 animate-spin mb-2" />
              Calculating portfolio risk and concentration metrics...
            </div>
          )}

          {!isLoadingPortfolio && !portfolioInsight && (
            <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-12 text-center text-slate-400">
              <PieChart className="w-12 h-12 mx-auto text-slate-600 mb-2" />
              No active holdings found in portfolio.
            </div>
          )}

          {!isLoadingPortfolio && portfolioInsight && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Health Overview & AI Review (7 cols) */}
              <div className="lg:col-span-7 space-y-5">
                {/* Score & Metrics Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-slate-400 font-medium">Diversification</span>
                      <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
                        {portfolioInsight.diversificationScore}/100
                      </div>
                    </div>
                    <div className="text-3xl font-extrabold text-white bg-cyan-500/20 border border-cyan-500/30 rounded-xl w-12 h-12 flex items-center justify-center font-mono">
                      {portfolioInsight.aiReview?.healthGrade || 'B'}
                    </div>
                  </div>

                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-4">
                    <span className="text-xs text-slate-400 font-medium">Concentration HHI</span>
                    <div className="text-2xl font-bold font-mono text-white mt-1">
                      {portfolioInsight.concentrationHhi.toFixed(0)}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {portfolioInsight.concentrationHhi > 2500 ? 'High' : 'Moderate'}
                    </span>
                  </div>

                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-4">
                    <span className="text-xs text-slate-400 font-medium">Top Asset Weight</span>
                    <div className="text-2xl font-bold font-mono text-amber-400 mt-1">
                      {portfolioInsight.maxAssetWeightPercent.toFixed(1)}%
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {portfolioInsight.maxAssetSymbol}
                    </span>
                  </div>
                </div>

                {/* AI Review Card */}
                {portfolioInsight.aiReview && (
                  <div className="bg-gradient-to-br from-slate-900 to-[#0F172A] border border-cyan-500/30 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-cyan-400" />
                      <h4 className="text-base font-semibold text-white">AI Portfolio Review</h4>
                    </div>

                    <p className="text-sm text-slate-300 leading-relaxed">
                      {portfolioInsight.aiReview.summary}
                    </p>

                    <div className="space-y-2 text-xs">
                      <span className="font-semibold text-cyan-400 uppercase tracking-wide">
                        Actionable Recommendations
                      </span>
                      <ul className="space-y-1.5 text-slate-300">
                        {portfolioInsight.aiReview.actionableRecommendations.map((rec, i) => (
                          <li key={i} className="flex items-start gap-2 bg-slate-950/60 p-2.5 rounded border border-slate-800">
                            <CheckCircle2 className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                            <span>{rec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Risk Warnings */}
                {portfolioInsight.riskWarnings.length > 0 && (
                  <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-5 space-y-3">
                    <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      Risk Warnings & Exposure Alerts
                    </h4>
                    <div className="space-y-2">
                      {portfolioInsight.riskWarnings.map((w, idx) => (
                        <div
                          key={idx}
                          className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                            w.level === 'CRITICAL'
                              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                              : w.level === 'WARNING'
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                              : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                          }`}
                        >
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{w.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Asset & Sector Breakdown (5 cols) */}
              <div className="lg:col-span-5 space-y-5">
                {/* Asset Allocation */}
                <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-white">Asset Allocation</h4>
                  <div className="space-y-2.5">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400">Cash Reserve</span>
                      <span className="text-cyan-400 font-bold">{portfolioInsight.cashRatioPercent}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-400"
                        style={{ width: `${portfolioInsight.cashRatioPercent}%` }}
                      ></div>
                    </div>

                    {portfolioInsight.assetAllocation.map((item) => (
                      <div key={item.instrumentId} className="pt-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span className="text-slate-300">{item.symbol} ({item.sector})</span>
                          <span className="text-white font-bold">{item.weightPercent}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full bg-blue-500"
                            style={{ width: `${item.weightPercent}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sector Allocation */}
                <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-white">Sector Allocation</h4>
                  <div className="space-y-2.5">
                    {portfolioInsight.sectorAllocation.map((sec, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs border-b border-slate-800/60 pb-2">
                        <span className="text-slate-300">{sec.sector}</span>
                        <span className="font-mono text-white font-bold">{sec.weightPercent}% (${sec.marketValue.toLocaleString()})</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: STRATEGY COMPARISON MATRIX */}
      {/* ==================================================================== */}
      {activeTab === 'compare' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#0D121F] border border-slate-800 rounded-xl p-5">
            <div>
              <h3 className="text-base font-semibold text-white">Multi-Strategy Comparison Matrix</h3>
              <p className="text-xs text-slate-400">
                Execute all 6 quantitative strategies simultaneously against the same symbol to determine optimal risk-adjusted alpha.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={comparisonSymbol}
                onChange={(e) => setComparisonSymbol(e.target.value)}
                className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
              >
                {symbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <button
                onClick={handleRunComparison}
                disabled={isComparing}
                className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-2 px-4 rounded-lg text-sm shadow transition-all disabled:opacity-50"
              >
                {isComparing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Comparing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    Run Matrix Comparison
                  </>
                )}
              </button>
            </div>
          </div>

          {comparisonData && (
            <div className="space-y-6">
              {/* AI Comparison narrative */}
              <div className="bg-gradient-to-br from-slate-900 to-[#0F172A] border border-cyan-500/30 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <h4 className="text-base font-semibold text-white">
                    AI Strategy Verdict for {comparisonData.symbol}
                  </h4>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {comparisonData.aiComparison.comparisonSummary}
                </p>
                <div className="text-xs text-cyan-300 bg-slate-950/60 p-3 rounded border border-slate-800 font-mono">
                  {comparisonData.aiComparison.recommendation}
                </div>
              </div>

              {/* Side-by-side Table */}
              <div className="bg-[#0D121F] border border-slate-800 rounded-xl p-5 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900/80 text-slate-400 uppercase border-b border-slate-800">
                    <tr>
                      <th className="p-3">Strategy</th>
                      <th className="p-3">Total Return</th>
                      <th className="p-3">Benchmark</th>
                      <th className="p-3">Max Drawdown</th>
                      <th className="p-3">Sharpe Ratio</th>
                      <th className="p-3">Sortino Ratio</th>
                      <th className="p-3">Win Rate</th>
                      <th className="p-3">Trades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {comparisonData.results.map((res, idx) => {
                      const isWinner = res.parameters.strategyType === comparisonData.aiComparison.bestPerformingStrategy;
                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            isWinner ? 'bg-cyan-500/5 font-semibold' : ''
                          }`}
                        >
                          <td className="p-3 text-white flex items-center gap-2">
                            {res.parameters.strategyType.replace(/_/g, ' ')}
                            {isWinner && (
                              <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/30">
                                TOP
                              </span>
                            )}
                          </td>
                          <td
                            className={`p-3 font-bold ${
                              res.metrics.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {res.metrics.totalReturnPercent >= 0 ? '+' : ''}
                            {res.metrics.totalReturnPercent.toFixed(2)}%
                          </td>
                          <td className="p-3 text-slate-400">
                            {res.metrics.benchmarkReturnPercent.toFixed(2)}%
                          </td>
                          <td className="p-3 text-rose-400">
                            -{res.metrics.maxDrawdownPercent.toFixed(2)}%
                          </td>
                          <td className="p-3 text-cyan-400 font-bold">
                            {res.metrics.sharpeRatio.toFixed(2)}
                          </td>
                          <td className="p-3 text-slate-300">
                            {res.metrics.sortinoRatio.toFixed(2)}
                          </td>
                          <td className="p-3 text-amber-400">
                            {res.metrics.winRatePercent.toFixed(1)}%
                          </td>
                          <td className="p-3 text-slate-300">
                            {res.metrics.totalTrades}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
