import React, { useState, useEffect, useCallback } from 'react';
import {
  UserStrategy,
  StrategyVersion,
  DSLValidationResult,
  StrategyExecutionResult,
  StrategyExecution,
} from '@tradegrid/shared-types';
import { strategyApiService } from '../services/strategy.service';
import {
  Sliders,
  Plus,
  Play,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Copy,
  FileCode,
  History,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Layers,
  Edit3,
  X,
  BarChart2,
  Activity,
} from 'lucide-react';

interface IndicatorConfig {
  id: string;
  name: string;
  type: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BollingerBands' | 'VWAP';
  series: 'close' | 'open' | 'high' | 'low' | 'volume';
  period: number;
  // MACD extra
  slowPeriod?: number;
  signalPeriod?: number;
  // Bollinger Bands extra
  stdDev?: number;
}

interface ConditionConfig {
  id: string;
  left: string;
  operator: '>' | '<' | '>=' | '<=' | '==' | '!=' | 'crosses_above' | 'crosses_below';
  right: string;
}

const INSTRUMENT_OPTIONS = [
  'NSE:RELIANCE',
  'NSE:TCS',
  'NSE:INFY',
  'NSE:HDFCBANK',
  'NSE:ICICIBANK',
  'NSE:SBIN',
];

const TIMEFRAME_OPTIONS = ['1m', '5m', '15m', '1h', '1d'];

export const StrategyStudioPage: React.FC = () => {
  // Navigation / Tabs
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'BUILDER' | 'EXECUTIONS'>('DASHBOARD');

  // Strategy list & active strategy state
  const [strategies, setStrategies] = useState<UserStrategy[]>([]);
  const [loadingStrategies, setLoadingStrategies] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<UserStrategy | null>(null);

  // Studio Builder State
  const [builderMode, setBuilderMode] = useState<'VISUAL' | 'CODE'>('VISUAL');
  const [strategyId, setStrategyId] = useState<number | null>(null);
  const [strategyName, setStrategyName] = useState('My Momentum Strategy');
  const [strategyDesc, setStrategyDesc] = useState('Dual moving average crossover with RSI filter');
  const [instrument, setInstrument] = useState('NSE:RELIANCE');
  const [timeframe, setTimeframe] = useState('15m');

  // Visual builder components
  const [indicators, setIndicators] = useState<IndicatorConfig[]>([
    { id: '1', name: 'fast_ma', type: 'SMA', series: 'close', period: 10 },
    { id: '2', name: 'slow_ma', type: 'SMA', series: 'close', period: 30 },
    { id: '3', name: 'rsi_val', type: 'RSI', series: 'close', period: 14 },
  ]);

  const [entryConditions, setEntryConditions] = useState<ConditionConfig[]>([
    { id: 'e1', left: 'fast_ma', operator: 'crosses_above', right: 'slow_ma' },
    { id: 'e2', left: 'rsi_val', operator: '<', right: '70' },
  ]);

  const [exitConditions, setExitConditions] = useState<ConditionConfig[]>([
    { id: 'x1', left: 'fast_ma', operator: 'crosses_below', right: 'slow_ma' },
  ]);

  const [stopLossPercent, setStopLossPercent] = useState('2.0');
  const [takeProfitPercent, setTakeProfitPercent] = useState('5.0');
  const [maxPositionSizePercent, setMaxPositionSizePercent] = useState('25.0');

  // Raw DSL editor state
  const [rawDslCode, setRawDslCode] = useState('');

  // Validation State
  const [validationResult, setValidationResult] = useState<DSLValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Execution & Backtesting State
  const [executionResult, setExecutionResult] = useState<StrategyExecutionResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionsHistory, setExecutionsHistory] = useState<StrategyExecution[]>([]);

  // Version History Modal
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const [versionsList, setVersionsList] = useState<StrategyVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // ==========================================================================
  // DSL Code Generation from Visual Blocks
  // ==========================================================================
  const generateDslFromVisual = useCallback((): string => {
    let dsl = `strategy "${strategyName || 'Untitled Strategy'}"\n`;
    if (strategyDesc) {
      dsl += `description "${strategyDesc}"\n`;
    }
    dsl += `instrument "${instrument}"\n`;
    dsl += `timeframe "${timeframe}"\n\n`;

    // Indicators
    indicators.forEach((ind) => {
      if (ind.type === 'MACD') {
        const fast = ind.period || 12;
        const slow = ind.slowPeriod || 26;
        const sig = ind.signalPeriod || 9;
        dsl += `indicator ${ind.name} = MACD(${ind.series}, ${fast}, ${slow}, ${sig})\n`;
      } else if (ind.type === 'BollingerBands') {
        const per = ind.period || 20;
        const std = ind.stdDev || 2.0;
        dsl += `indicator ${ind.name} = BollingerBands(${ind.series}, ${per}, ${std})\n`;
      } else if (ind.type === 'VWAP') {
        dsl += `indicator ${ind.name} = VWAP()\n`;
      } else {
        dsl += `indicator ${ind.name} = ${ind.type}(${ind.series}, ${ind.period || 14})\n`;
      }
    });

    dsl += '\nentry:\n';
    if (entryConditions.length === 0) {
      dsl += '  close > 0\n';
    } else {
      entryConditions.forEach((cond) => {
        dsl += `  ${cond.left} ${cond.operator} ${cond.right}\n`;
      });
    }

    dsl += '\nexit:\n';
    if (exitConditions.length === 0) {
      dsl += '  close < 0\n';
    } else {
      exitConditions.forEach((cond) => {
        dsl += `  ${cond.left} ${cond.operator} ${cond.right}\n`;
      });
    }

    dsl += '\nrisk:\n';
    if (stopLossPercent) {
      dsl += `  stop_loss = ${parseFloat(stopLossPercent) / 100}\n`;
    }
    if (takeProfitPercent) {
      dsl += `  take_profit = ${parseFloat(takeProfitPercent) / 100}\n`;
    }
    if (maxPositionSizePercent) {
      dsl += `  max_position_size = ${parseFloat(maxPositionSizePercent) / 100}\n`;
    }

    return dsl;
  }, [
    strategyName,
    strategyDesc,
    instrument,
    timeframe,
    indicators,
    entryConditions,
    exitConditions,
    stopLossPercent,
    takeProfitPercent,
    maxPositionSizePercent,
  ]);

  // Keep rawDslCode in sync when in Visual mode
  useEffect(() => {
    if (builderMode === 'VISUAL') {
      const generated = generateDslFromVisual();
      setRawDslCode(generated);
    }
  }, [builderMode, generateDslFromVisual]);

  // Load Strategies on Mount
  const loadStrategies = useCallback(async () => {
    setLoadingStrategies(true);
    try {
      const data = await strategyApiService.getStrategies();
      setStrategies(data);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.message || 'Failed to load user strategies' });
    } finally {
      setLoadingStrategies(false);
    }
  }, []);

  useEffect(() => {
    loadStrategies();
  }, [loadStrategies]);

  // Handle Validate DSL
  const handleValidate = async () => {
    setIsValidating(true);
    setFeedbackMessage(null);
    try {
      const code = builderMode === 'VISUAL' ? generateDslFromVisual() : rawDslCode;
      const res = await strategyApiService.validateDsl(code);
      setValidationResult(res);
      if (res.isValid) {
        setFeedbackMessage({ type: 'success', text: 'Strategy DSL is valid and ready to execute!' });
      } else {
        setFeedbackMessage({
          type: 'error',
          text: `Validation failed: ${res.errors.length} issue(s) detected.`,
        });
      }
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.response?.data?.message || err?.message || 'Validation request failed' });
    } finally {
      setIsValidating(false);
    }
  };

  // Handle Save Strategy (Create or Update)
  const handleSave = async () => {
    setIsSaving(true);
    setFeedbackMessage(null);
    try {
      const codeToSave = builderMode === 'VISUAL' ? generateDslFromVisual() : rawDslCode;

      if (strategyId) {
        // Update existing strategy
        const updated = await strategyApiService.updateStrategy(strategyId, {
          name: strategyName,
          description: strategyDesc,
          dslCode: codeToSave,
          instrumentSymbol: instrument,
          timeframe,
        });
        setSelectedStrategy(updated);
        setFeedbackMessage({ type: 'success', text: `Strategy "${updated.name}" updated (v${updated.version})` });
      } else {
        // Create new strategy
        const created = await strategyApiService.createStrategy({
          name: strategyName,
          description: strategyDesc,
          dslCode: codeToSave,
          instrumentSymbol: instrument,
          timeframe,
        });
        setStrategyId(created.id);
        setSelectedStrategy(created);
        setFeedbackMessage({ type: 'success', text: `Strategy "${created.name}" created successfully!` });
      }
      await loadStrategies();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.response?.data?.message || err?.message || 'Failed to save strategy' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Load Strategy into Builder
  const handleEditStrategy = (strat: UserStrategy) => {
    setStrategyId(strat.id);
    setSelectedStrategy(strat);
    setStrategyName(strat.name);
    setStrategyDesc(strat.description || '');
    setInstrument(strat.instrumentSymbol || 'NSE:RELIANCE');
    setTimeframe(strat.timeframe || '15m');
    setRawDslCode(strat.dslCode);
    setBuilderMode('CODE'); // Default to code view for loaded raw DSL
    setActiveTab('BUILDER');
    setValidationResult(null);
    setFeedbackMessage(null);
  };

  // Handle Duplicate Strategy
  const handleDuplicate = async (strat: UserStrategy) => {
    try {
      const cloned = await strategyApiService.duplicateStrategy(strat.id);
      setFeedbackMessage({ type: 'success', text: `Strategy duplicated as "${cloned.name}"` });
      await loadStrategies();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.message || 'Failed to duplicate strategy' });
    }
  };

  // Handle Delete Strategy
  const handleDelete = async (stratId: number) => {
    if (!window.confirm('Are you sure you want to delete this strategy? All versions and executions will be lost.')) return;
    try {
      await strategyApiService.deleteStrategy(stratId);
      setFeedbackMessage({ type: 'success', text: 'Strategy deleted successfully' });
      if (strategyId === stratId) {
        handleResetBuilder();
      }
      await loadStrategies();
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.message || 'Failed to delete strategy' });
    }
  };

  // Handle Run Simulation / Backtest
  const handleExecuteSimulation = async (stratId?: number) => {
    const targetId = stratId || strategyId;
    if (!targetId) {
      setFeedbackMessage({ type: 'error', text: 'Please save the strategy before executing simulation' });
      return;
    }

    setIsExecuting(true);
    setFeedbackMessage(null);
    try {
      const res = await strategyApiService.executeStrategy(targetId, {
        timeframe,
        initialCapital: '100000.0000',
      });
      setExecutionResult(res);
      setActiveTab('EXECUTIONS');
      setFeedbackMessage({
        type: 'success',
        text: `Simulation complete: ${res.signals.length} signals generated across ${res.diagnostics.barsProcessed} bars in ${res.diagnostics.executionTimeMs}ms`,
      });

      // Refresh executions history
      const hist = await strategyApiService.getExecutions(targetId);
      setExecutionsHistory(hist);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err?.response?.data?.message || err?.message || 'Strategy execution simulation failed',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  // Open Version History Modal
  const handleOpenVersions = async (strat: UserStrategy) => {
    setSelectedStrategy(strat);
    setVersionsModalOpen(true);
    setLoadingVersions(true);
    try {
      const versions = await strategyApiService.getVersions(strat.id);
      setVersionsList(versions);
    } catch (err: any) {
      setFeedbackMessage({ type: 'error', text: err?.message || 'Failed to fetch version history' });
    } finally {
      setLoadingVersions(false);
    }
  };

  // Reset Builder to default new strategy
  const handleResetBuilder = () => {
    setStrategyId(null);
    setSelectedStrategy(null);
    setStrategyName('My Momentum Strategy');
    setStrategyDesc('Dual moving average crossover with RSI filter');
    setInstrument('NSE:RELIANCE');
    setTimeframe('15m');
    setIndicators([
      { id: '1', name: 'fast_ma', type: 'SMA', series: 'close', period: 10 },
      { id: '2', name: 'slow_ma', type: 'SMA', series: 'close', period: 30 },
      { id: '3', name: 'rsi_val', type: 'RSI', series: 'close', period: 14 },
    ]);
    setEntryConditions([
      { id: 'e1', left: 'fast_ma', operator: 'crosses_above', right: 'slow_ma' },
      { id: 'e2', left: 'rsi_val', operator: '<', right: '70' },
    ]);
    setExitConditions([
      { id: 'x1', left: 'fast_ma', operator: 'crosses_below', right: 'slow_ma' },
    ]);
    setStopLossPercent('2.0');
    setTakeProfitPercent('5.0');
    setMaxPositionSizePercent('25.0');
    setBuilderMode('VISUAL');
    setValidationResult(null);
    setFeedbackMessage(null);
    setExecutionResult(null);
  };

  // Helper: Add indicator
  const addIndicator = () => {
    const id = Date.now().toString();
    setIndicators([
      ...indicators,
      { id, name: `ind_${indicators.length + 1}`, type: 'SMA', series: 'close', period: 14 },
    ]);
  };

  // Helper: Remove indicator
  const removeIndicator = (id: string) => {
    setIndicators(indicators.filter((i) => i.id !== id));
  };

  // Helper: Add condition
  const addCondition = (type: 'entry' | 'exit') => {
    const id = Date.now().toString();
    const newCond: ConditionConfig = { id, left: 'close', operator: '>', right: '100' };
    if (type === 'entry') setEntryConditions([...entryConditions, newCond]);
    else setExitConditions([...exitConditions, newCond]);
  };

  // Helper: Remove condition
  const removeCondition = (type: 'entry' | 'exit', id: string) => {
    if (type === 'entry') setEntryConditions(entryConditions.filter((c) => c.id !== id));
    else setExitConditions(exitConditions.filter((c) => c.id !== id));
  };

  return (
    <div className="min-h-screen bg-[#070A12] text-slate-200 pb-16">
      {/* Top Banner Header */}
      <div className="border-b border-card-border bg-[#0A0E1A]/80 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-lg shadow-cyan-500/5">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-white font-mono">
                    STRATEGY <span className="text-cyan-400">STUDIO</span>
                  </h1>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    PHASE 9C
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Visual rule-based strategy builder & sandboxed algorithmic simulation engine
                </p>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-card-border">
              <button
                onClick={() => setActiveTab('DASHBOARD')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'DASHBOARD'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-4 h-4" />
                Strategies Dashboard ({strategies.length})
              </button>
              <button
                onClick={() => setActiveTab('BUILDER')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'BUILDER'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Edit3 className="w-4 h-4" />
                {strategyId ? `Edit (${strategyName})` : 'New Strategy'}
              </button>
              {executionResult && (
                <button
                  onClick={() => setActiveTab('EXECUTIONS')}
                  className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'EXECUTIONS'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Activity className="w-4 h-4" />
                  Simulation Results
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Global Feedback Alert Banner */}
      {feedbackMessage && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-medium ${
              feedbackMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {feedbackMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              )}
              <span>{feedbackMessage.text}</span>
            </div>
            <button onClick={() => setFeedbackMessage(null)} className="text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* =================================================================== */}
        {/* 1. STRATEGIES DASHBOARD TAB */}
        {/* =================================================================== */}
        {activeTab === 'DASHBOARD' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">My Custom Strategies</h2>
                <p className="text-xs text-slate-400">
                  Manage, duplicate, test, and version your automated trading logic
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadStrategies}
                  disabled={loadingStrategies}
                  className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
                  title="Refresh Strategies"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingStrategies ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={() => {
                    handleResetBuilder();
                    setActiveTab('BUILDER');
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs hover:bg-cyan-400 transition shadow-lg shadow-cyan-500/20"
                >
                  <Plus className="w-4 h-4" />
                  Create New Strategy
                </button>
              </div>
            </div>

            {loadingStrategies ? (
              <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
                <span className="text-sm">Loading user strategies...</span>
              </div>
            ) : strategies.length === 0 ? (
              <div className="bg-[#0D1220] border border-card-border rounded-2xl p-12 text-center max-w-xl mx-auto">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                  <Sliders className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-white font-mono">No Strategies Authored Yet</h3>
                <p className="text-xs text-slate-400 mt-2 mb-6">
                  Build algorithmic trading strategies using the visual block builder or write custom TradeGrid DSL scripts.
                </p>
                <button
                  onClick={() => {
                    handleResetBuilder();
                    setActiveTab('BUILDER');
                  }}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Build First Strategy
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {strategies.map((strat) => (
                  <div
                    key={strat.id}
                    className="bg-[#0D1220] border border-card-border rounded-xl p-5 hover:border-cyan-500/40 transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-bold text-white font-mono group-hover:text-cyan-300 transition">
                            {strat.name}
                          </h3>
                          <span className="text-[10px] text-slate-400 font-mono">
                            v{strat.version} • {new Date(strat.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono rounded-full border ${
                            strat.isValid
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          }`}
                        >
                          {strat.isValid ? 'VALID' : 'UNVALIDATED'}
                        </span>
                      </div>

                      {strat.description && (
                        <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                          {strat.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 mt-4">
                        <span className="px-2 py-1 text-[11px] font-mono bg-slate-800 text-slate-300 rounded border border-slate-700">
                          {strat.instrumentSymbol}
                        </span>
                        <span className="px-2 py-1 text-[11px] font-mono bg-slate-800 text-cyan-400 rounded border border-slate-700">
                          {strat.timeframe}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-card-border flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleExecuteSimulation(strat.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
                          title="Simulate & Backtest"
                        >
                          <Play className="w-3.5 h-3.5 fill-emerald-400" />
                          Simulate
                        </button>
                        <button
                          onClick={() => handleEditStrategy(strat)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs transition"
                          title="Edit Strategy"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenVersions(strat)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs transition"
                          title="Version History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDuplicate(strat)}
                          className="p-1.5 rounded text-slate-400 hover:text-cyan-300 transition"
                          title="Duplicate Strategy"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(strat.id)}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-400 transition"
                          title="Delete Strategy"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =================================================================== */}
        {/* 2. VISUAL STRATEGY BUILDER & DSL STUDIO */}
        {/* =================================================================== */}
        {activeTab === 'BUILDER' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Builder Form / Visual Controls (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* Header card with mode switcher */}
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-white font-mono">
                      {strategyId ? `Edit Strategy: ${strategyName}` : 'Design New Strategy'}
                    </h2>
                    <span className="text-xs text-slate-400">
                      Configure indicators, condition rules, and risk guardrails
                    </span>
                  </div>

                  <div className="flex items-center bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setBuilderMode('VISUAL')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                        builderMode === 'VISUAL'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Visual Builder
                    </button>
                    <button
                      onClick={() => setBuilderMode('CODE')}
                      className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                        builderMode === 'CODE'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Raw DSL Editor
                    </button>
                  </div>
                </div>

                {/* Core Parameters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                      Strategy Name
                    </label>
                    <input
                      type="text"
                      value={strategyName}
                      onChange={(e) => setStrategyName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                      placeholder="e.g. Trend Momentum Alpha"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                      Instrument
                    </label>
                    <select
                      value={instrument}
                      onChange={(e) => setInstrument(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      {INSTRUMENT_OPTIONS.map((sym) => (
                        <option key={sym} value={sym}>
                          {sym}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                      Timeframe
                    </label>
                    <select
                      value={timeframe}
                      onChange={(e) => setTimeframe(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      {TIMEFRAME_OPTIONS.map((tf) => (
                        <option key={tf} value={tf}>
                          {tf}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block mb-1">
                      Description
                    </label>
                    <input
                      type="text"
                      value={strategyDesc}
                      onChange={(e) => setStrategyDesc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                      placeholder="Summary of trading hypothesis"
                    />
                  </div>
                </div>
              </div>

              {builderMode === 'VISUAL' ? (
                <>
                  {/* Section: Technical Indicators */}
                  <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BarChart2 className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                          1. Technical Indicators
                        </h3>
                      </div>
                      <button
                        onClick={addIndicator}
                        className="px-2.5 py-1 rounded bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 text-xs font-semibold flex items-center gap-1 border border-cyan-500/30"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Indicator
                      </button>
                    </div>

                    <div className="space-y-3">
                      {indicators.map((ind, idx) => (
                        <div
                          key={ind.id}
                          className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center"
                        >
                          <div className="sm:col-span-3">
                            <span className="text-[10px] text-slate-500 font-mono block">Variable Name</span>
                            <input
                              type="text"
                              value={ind.name}
                              onChange={(e) => {
                                const copy = [...indicators];
                                copy[idx].name = e.target.value;
                                setIndicators(copy);
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-cyan-300"
                            />
                          </div>

                          <div className="sm:col-span-3">
                            <span className="text-[10px] text-slate-500 font-mono block">Function</span>
                            <select
                              value={ind.type}
                              onChange={(e) => {
                                const copy = [...indicators];
                                copy[idx].type = e.target.value as any;
                                setIndicators(copy);
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                            >
                              <option value="SMA">SMA</option>
                              <option value="EMA">EMA</option>
                              <option value="RSI">RSI</option>
                              <option value="MACD">MACD</option>
                              <option value="BollingerBands">Bollinger Bands</option>
                              <option value="VWAP">VWAP</option>
                            </select>
                          </div>

                          <div className="sm:col-span-3">
                            <span className="text-[10px] text-slate-500 font-mono block">Input Series</span>
                            <select
                              value={ind.series}
                              onChange={(e) => {
                                const copy = [...indicators];
                                copy[idx].series = e.target.value as any;
                                setIndicators(copy);
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                            >
                              <option value="close">close</option>
                              <option value="open">open</option>
                              <option value="high">high</option>
                              <option value="low">low</option>
                              <option value="volume">volume</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <span className="text-[10px] text-slate-500 font-mono block">Period</span>
                            <input
                              type="number"
                              min={1}
                              value={ind.period}
                              onChange={(e) => {
                                const copy = [...indicators];
                                copy[idx].period = parseInt(e.target.value, 10) || 14;
                                setIndicators(copy);
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-white"
                            />
                          </div>

                          <div className="sm:col-span-1 flex justify-end">
                            <button
                              onClick={() => removeIndicator(ind.id)}
                              className="p-1 text-slate-500 hover:text-rose-400"
                              title="Remove"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section: Entry Conditions */}
                  <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                          2. Entry Rules (All conditions required)
                        </h3>
                      </div>
                      <button
                        onClick={() => addCondition('entry')}
                        className="px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-semibold flex items-center gap-1 border border-emerald-500/30"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Rule
                      </button>
                    </div>

                    <div className="space-y-3">
                      {entryConditions.map((cond, idx) => (
                        <div
                          key={cond.id}
                          className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-wrap sm:flex-nowrap items-center gap-2"
                        >
                          <input
                            type="text"
                            value={cond.left}
                            onChange={(e) => {
                              const copy = [...entryConditions];
                              copy[idx].left = e.target.value;
                              setEntryConditions(copy);
                            }}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300 w-full sm:w-1/3"
                            placeholder="Left operand (e.g. fast_ma)"
                          />

                          <select
                            value={cond.operator}
                            onChange={(e) => {
                              const copy = [...entryConditions];
                              copy[idx].operator = e.target.value as any;
                              setEntryConditions(copy);
                            }}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-amber-300 w-full sm:w-1/3"
                          >
                            <option value="crosses_above">crosses_above</option>
                            <option value="crosses_below">crosses_below</option>
                            <option value=">">&gt; (Greater than)</option>
                            <option value="<">&lt; (Less than)</option>
                            <option value=">=">&gt;= (Greater or eq)</option>
                            <option value="<=">&lt;= (Less or eq)</option>
                            <option value="==">== (Equal)</option>
                            <option value="!=">!= (Not equal)</option>
                          </select>

                          <input
                            type="text"
                            value={cond.right}
                            onChange={(e) => {
                              const copy = [...entryConditions];
                              copy[idx].right = e.target.value;
                              setEntryConditions(copy);
                            }}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300 w-full sm:w-1/3"
                            placeholder="Right operand (e.g. slow_ma)"
                          />

                          <button
                            onClick={() => removeCondition('entry', cond.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 flex-shrink-0"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section: Exit Conditions */}
                  <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ArrowDownRight className="w-4 h-4 text-rose-400" />
                        <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                          3. Exit Rules (Any condition triggers exit)
                        </h3>
                      </div>
                      <button
                        onClick={() => addCondition('exit')}
                        className="px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold flex items-center gap-1 border border-rose-500/30"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Rule
                      </button>
                    </div>

                    <div className="space-y-3">
                      {exitConditions.map((cond, idx) => (
                        <div
                          key={cond.id}
                          className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 flex flex-wrap sm:flex-nowrap items-center gap-2"
                        >
                          <input
                            type="text"
                            value={cond.left}
                            onChange={(e) => {
                              const copy = [...exitConditions];
                              copy[idx].left = e.target.value;
                              setExitConditions(copy);
                            }}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300 w-full sm:w-1/3"
                            placeholder="Left operand"
                          />

                          <select
                            value={cond.operator}
                            onChange={(e) => {
                              const copy = [...exitConditions];
                              copy[idx].operator = e.target.value as any;
                              setExitConditions(copy);
                            }}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-amber-300 w-full sm:w-1/3"
                          >
                            <option value="crosses_below">crosses_below</option>
                            <option value="crosses_above">crosses_above</option>
                            <option value=">">&gt; (Greater than)</option>
                            <option value="<">&lt; (Less than)</option>
                            <option value=">=">&gt;= (Greater or eq)</option>
                            <option value="<=">&lt;= (Less or eq)</option>
                            <option value="==">== (Equal)</option>
                          </select>

                          <input
                            type="text"
                            value={cond.right}
                            onChange={(e) => {
                              const copy = [...exitConditions];
                              copy[idx].right = e.target.value;
                              setExitConditions(copy);
                            }}
                            className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs font-mono text-cyan-300 w-full sm:w-1/3"
                            placeholder="Right operand"
                          />

                          <button
                            onClick={() => removeCondition('exit', cond.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 flex-shrink-0"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section: Risk Settings */}
                  <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-amber-400" />
                      <h3 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                        4. Risk Guardrails
                      </h3>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Stop Loss (%)</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="100"
                          value={stopLossPercent}
                          onChange={(e) => setStopLossPercent(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-white mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Take Profit (%)</span>
                        <input
                          type="number"
                          step="0.1"
                          min="0.1"
                          max="1000"
                          value={takeProfitPercent}
                          onChange={(e) => setTakeProfitPercent(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-white mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-mono block">Max Position Size (%)</span>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          max="100"
                          value={maxPositionSizePercent}
                          onChange={(e) => setMaxPositionSizePercent(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-white mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* Raw DSL Code Editor Mode */
                <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-sm font-bold text-white font-mono">Strategy DSL Source Code</h3>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">Language: TradeGrid DSL v1.0</span>
                  </div>

                  <textarea
                    rows={18}
                    value={rawDslCode}
                    onChange={(e) => setRawDslCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-cyan-300 focus:outline-none focus:border-cyan-500 leading-relaxed shadow-inner"
                    spellCheck={false}
                  />
                </div>
              )}
            </div>

            {/* Right Column: Validation & Action Inspector (5 cols) */}
            <div className="lg:col-span-5 space-y-6">
              {/* Actions Card */}
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-white font-mono">Actions & Operations</h3>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={handleValidate}
                    disabled={isValidating}
                    className="px-4 py-2.5 rounded-lg bg-slate-800 text-cyan-300 border border-cyan-500/30 hover:bg-slate-700 text-xs font-bold flex items-center justify-center gap-2 transition"
                  >
                    <CheckCircle2 className={`w-4 h-4 ${isValidating ? 'animate-spin' : ''}`} />
                    Validate DSL
                  </button>

                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-4 py-2.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-cyan-500/20"
                  >
                    <Plus className="w-4 h-4" />
                    {strategyId ? 'Update Strategy' : 'Save Strategy'}
                  </button>
                </div>

                {strategyId && (
                  <button
                    onClick={() => handleExecuteSimulation()}
                    disabled={isExecuting}
                    className="w-full px-4 py-2.5 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 text-xs font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20"
                  >
                    <Play className={`w-4 h-4 fill-slate-950 ${isExecuting ? 'animate-spin' : ''}`} />
                    Run Backtest Simulation
                  </button>
                )}
              </div>

              {/* Validation Diagnostics Card */}
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white font-mono">Server Validation Status</h3>
                  {validationResult && (
                    <span
                      className={`px-2 py-0.5 text-[10px] font-mono rounded-full border ${
                        validationResult.isValid
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      }`}
                    >
                      {validationResult.isValid ? 'PASSED' : 'FAILED'}
                    </span>
                  )}
                </div>

                {!validationResult ? (
                  <div className="p-4 bg-slate-900/40 rounded-lg border border-slate-800 text-xs text-slate-500 text-center font-mono">
                    Click "Validate DSL" to run the server AST parser and semantic type checker.
                  </div>
                ) : validationResult.isValid ? (
                  <div className="p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      AST parsed and type-checked successfully
                    </div>
                    {validationResult.ast && (
                      <div className="text-[11px] font-mono text-slate-400 space-y-1">
                        <div>Indicators: {validationResult.ast.indicators.length}</div>
                        <div>Entry Conditions: {validationResult.ast.entryConditions.length}</div>
                        <div>Exit Conditions: {validationResult.ast.exitConditions.length}</div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {validationResult.errors.map((err, i) => (
                      <div
                        key={i}
                        className="p-3 bg-rose-500/5 rounded-lg border border-rose-500/20 text-xs font-mono text-rose-300"
                      >
                        <div className="font-semibold text-rose-400">
                          Line {err.line}, Col {err.column}: [{err.code}]
                        </div>
                        <div className="mt-1 text-slate-300">{err.message}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live DSL Code Preview (in Visual mode) */}
              {builderMode === 'VISUAL' && (
                <div className="bg-[#0D1220] border border-card-border rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white font-mono">Live Generated DSL</h3>
                    <span className="text-[10px] text-cyan-400 font-mono">Auto-synced</span>
                  </div>
                  <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-64 leading-relaxed">
                    {rawDslCode}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* 3. SIMULATION & EXECUTIONS TAB */}
        {/* =================================================================== */}
        {activeTab === 'EXECUTIONS' && executionResult && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white font-mono">Strategy Simulation Run</h2>
                <p className="text-xs text-slate-400">
                  Execution ID: <span className="font-mono text-cyan-400">{executionResult.execution.executionId}</span> •{' '}
                  Symbol: <span className="font-mono text-white">{executionResult.execution.instrumentSymbol}</span>
                </p>
              </div>

              <button
                onClick={() => handleExecuteSimulation()}
                disabled={isExecuting}
                className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs hover:bg-emerald-400 transition flex items-center gap-2"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isExecuting ? 'animate-spin' : ''}`} />
                Rerun Simulation
              </button>
            </div>

            {/* Performance & Execution Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-4">
                <span className="text-[11px] text-slate-400 font-mono block">Status</span>
                <span className="text-base font-bold text-emerald-400 font-mono mt-1 block">
                  {executionResult.execution.status}
                </span>
              </div>
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-4">
                <span className="text-[11px] text-slate-400 font-mono block">Total Signals</span>
                <span className="text-base font-bold text-white font-mono mt-1 block">
                  {executionResult.signals.length}
                </span>
              </div>
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-4">
                <span className="text-[11px] text-slate-400 font-mono block">Bars Evaluated</span>
                <span className="text-base font-bold text-cyan-400 font-mono mt-1 block">
                  {executionResult.diagnostics.barsProcessed}
                </span>
              </div>
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-4">
                <span className="text-[11px] text-slate-400 font-mono block">Compute Duration</span>
                <span className="text-base font-bold text-amber-400 font-mono mt-1 block">
                  {executionResult.diagnostics.executionTimeMs} ms
                </span>
              </div>
            </div>

            {/* Signals Chronological Table */}
            <div className="bg-[#0D1220] border border-card-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-card-border flex items-center justify-between">
                <h3 className="text-sm font-bold text-white font-mono">
                  Generated Trading Signals ({executionResult.signals.length})
                </h3>
                <span className="text-xs text-slate-400 font-mono">Chronological Bar-by-Bar Execution</span>
              </div>

              {executionResult.signals.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  No BUY or SELL signals generated for the evaluated candle period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900/60 text-slate-400 text-[10px] uppercase border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-4">Action</th>
                        <th className="py-2.5 px-4">Timestamp</th>
                        <th className="py-2.5 px-4">Price</th>
                        <th className="py-2.5 px-4">Reason</th>
                        <th className="py-2.5 px-4">Indicator Snapshot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-200">
                      {executionResult.signals.map((sig, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/30 transition">
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                sig.signalType === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {sig.signalType}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-400">
                            {new Date(sig.timestamp).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4 text-white font-bold">
                            ₹{sig.price.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4 text-slate-300">{sig.reason}</td>
                          <td className="py-2.5 px-4 text-cyan-400">
                            {Object.entries(sig.indicatorValues || {})
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(' | ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Previous Executions History */}
            {executionsHistory.length > 0 && (
              <div className="bg-[#0D1220] border border-card-border rounded-xl p-4">
                <h4 className="text-xs font-bold font-mono text-slate-300 uppercase tracking-wider mb-3">
                  Historical Execution Runs ({executionsHistory.length})
                </h4>
                <div className="space-y-2">
                  {executionsHistory.map((run) => (
                    <div
                      key={run.id}
                      className="p-2.5 rounded bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-cyan-400 font-bold">{run.executionId}</span>
                        <span className="text-slate-400">v{run.strategyVersion}</span>
                        <span className="text-slate-400">{run.instrumentSymbol}</span>
                        <span className="text-slate-400">{run.timeframe}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-300">{run.totalSignalsCount} signals</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] ${
                            run.status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {run.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 4. STRATEGY VERSION HISTORY MODAL */}
      {/* =================================================================== */}
      {versionsModalOpen && selectedStrategy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#0D1220] border border-card-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-card-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white font-mono">
                  Version History: {selectedStrategy.name}
                </h3>
                <span className="text-xs text-slate-400 font-mono">Immutable snapshots of strategy iterations</span>
              </div>
              <button
                onClick={() => setVersionsModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingVersions ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-cyan-400 mb-2" />
                  Loading version history...
                </div>
              ) : versionsList.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  No historical versions saved for this strategy.
                </div>
              ) : (
                versionsList.map((ver) => (
                  <div
                    key={ver.id}
                    className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold font-mono text-cyan-300">
                        Version {ver.version}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(ver.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {ver.changelog && (
                      <p className="text-xs text-slate-400">{ver.changelog}</p>
                    )}
                    <pre className="p-2.5 bg-slate-950 rounded border border-slate-800 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-36">
                      {ver.dslCode}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
