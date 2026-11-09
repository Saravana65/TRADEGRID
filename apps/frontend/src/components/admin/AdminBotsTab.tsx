import React, { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  BotExecutionLog,
  BotMetricsSummary,
  BotStrategyType,
  Instrument,
} from '@tradegrid/shared-types';
import { CreateBotInput } from '@tradegrid/validation';
import { botApiService } from '../../services/bot.service';
import { marketApiService } from '../../services/market.service';
import { socketService } from '../../services/socket.service';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Input } from '../common/Input';
import { Table, TableColumn } from '../common/Table';
import { formatCurrency, formatDate } from '../../utils/formatters';
import {
  Bot as BotIcon,
  Play,
  Pause,
  AlertOctagon,
  RefreshCw,
  Plus,
  FileText,
  Activity,
  Zap,
  X,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';

export const AdminBotsTab: React.FC = () => {
  const [bots, setBots] = useState<Bot[]>([]);
  const [metrics, setMetrics] = useState<BotMetricsSummary | null>(null);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Create Bot Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<CreateBotInput>({
    name: '',
    strategyType: 'CONSERVATIVE_MM',
    allocatedCapital: '100000.0000',
    initialInventoryShares: '100.0000',
    instrumentIds: [],
    configuration: {
      quoteRefreshIntervalMs: 3000,
      spreadBps: 20,
      orderQuantity: '10.0000',
      maxOrderQuantity: '50.0000',
      maxOrderNotional: '10000.0000',
      maxInventoryPerInstrument: '500.0000',
      maxTotalExposure: '150000.0000',
      maxOpenOrders: 8,
      maxDailyLoss: '5000.0000',
      skewFactor: '1.0000',
    },
  });
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

  // Logs Modal State
  const [selectedBotForLogs, setSelectedBotForLogs] = useState<Bot | null>(null);
  const [logs, setLogs] = useState<BotExecutionLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logFilterAction, setLogFilterAction] = useState<string>('ALL');

  // Load Data
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [botsList, metricsData, instData] = await Promise.allSettled([
        botApiService.getBots(),
        botApiService.getMetrics(),
        marketApiService.getInstruments({ limit: 100 }),
      ]);

      if (botsList.status === 'fulfilled') {
        setBots(botsList.value);
      }
      if (metricsData.status === 'fulfilled') {
        setMetrics(metricsData.value);
      }
      if (instData.status === 'fulfilled') {
        setInstruments(instData.value.instruments);
      }
    } catch {
      // Handled gracefully
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time WebSocket connection to admin:bots
  useEffect(() => {
    socketService.connect();
    socketService.subscribe('admin:bots');

    const handleBotStatus = (data: any) => {
      setActionNotice(`⚡ Bot #${data.botId} status changed to ${data.status}`);
      fetchData();
    };

    const handleBotWarning = (data: any) => {
      setActionError(`⚠️ Bot Risk Warning: ${data.message} (Rule: ${data.rule})`);
    };

    socketService.on('bot:status', handleBotStatus);
    socketService.on('bot:risk_warning', handleBotWarning);

    return () => {
      socketService.off('bot:status', handleBotStatus);
      socketService.off('bot:risk_warning', handleBotWarning);
    };
  }, [fetchData]);

  // Bot Action Handlers
  const handleEnableBot = async (id: number) => {
    try {
      await botApiService.enableBot(id);
      setActionNotice(`Bot #${id} enabled successfully.`);
      fetchData();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || err.message || 'Failed to enable bot');
    }
  };

  const handleDisableBot = async (id: number) => {
    try {
      await botApiService.disableBot(id);
      setActionNotice(`Bot #${id} paused.`);
      fetchData();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || err.message || 'Failed to pause bot');
    }
  };

  const handleKillBot = async (id: number) => {
    if (!window.confirm(`Are you sure you want to trigger EMERGENCY KILL for Bot #${id}? All open orders will be cancelled immediately.`)) {
      return;
    }
    try {
      await botApiService.killBot(id);
      setActionNotice(`🚨 Bot #${id} KILLED. Resting orders cancelled.`);
      fetchData();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || err.message || 'Failed to kill bot');
    }
  };

  const handleTriggerBot = async (id: number) => {
    try {
      await botApiService.triggerBot(id);
      setActionNotice(`Quote cycle triggered for Bot #${id}.`);
      fetchData();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || err.message || 'Failed to trigger cycle');
    }
  };

  const handleKillAllBots = async () => {
    if (!window.confirm('CRITICAL ACTION: Are you sure you want to KILL ALL MARKET-MAKING BOTS? All active bots will be shut down and their open limit orders will be cancelled immediately.')) {
      return;
    }
    try {
      const res = await botApiService.killAllBots();
      setActionNotice(`🚨 EMERGENCY KILL COMPLETED: ${res.killedCount} bots killed.`);
      fetchData();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || err.message || 'Failed to kill all bots');
    }
  };

  // Open Logs
  const handleOpenLogs = async (bot: Bot) => {
    setSelectedBotForLogs(bot);
    setIsLoadingLogs(true);
    setLogFilterAction('ALL');
    try {
      const res = await botApiService.getBotLogs(bot.id, { limit: 50 });
      setLogs(res.logs);
    } catch {
      setLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleFilterLogs = async (action: string) => {
    if (!selectedBotForLogs) return;
    setLogFilterAction(action);
    setIsLoadingLogs(true);
    try {
      const res = await botApiService.getBotLogs(selectedBotForLogs.id, {
        limit: 50,
        action: action === 'ALL' ? undefined : action,
      });
      setLogs(res.logs);
    } catch {
      setLogs([]);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Handle Create Bot Submit
  const handleCreateBotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createForm.instrumentIds.length === 0) {
      setActionError('Please select at least one instrument for the bot.');
      return;
    }
    setIsSubmittingCreate(true);
    setActionError(null);
    try {
      await botApiService.createBot(createForm);
      setShowCreateModal(false);
      setActionNotice(`Bot "${createForm.name}" created and funded successfully.`);
      // Reset form
      setCreateForm({
        name: '',
        strategyType: 'CONSERVATIVE_MM',
        allocatedCapital: '100000.0000',
        initialInventoryShares: '100.0000',
        instrumentIds: [],
        configuration: {
          quoteRefreshIntervalMs: 3000,
          spreadBps: 20,
          orderQuantity: '10.0000',
          maxOrderQuantity: '50.0000',
          maxOrderNotional: '10000.0000',
          maxInventoryPerInstrument: '500.0000',
          maxTotalExposure: '150000.0000',
          maxOpenOrders: 8,
          maxDailyLoss: '5000.0000',
          skewFactor: '1.0000',
        },
      });
      fetchData();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || err.message || 'Failed to create bot');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const columns: TableColumn<Bot>[] = [
    {
      key: 'id',
      header: 'Bot ID',
      render: (bot) => (
        <span className="font-mono text-cyan-400 text-xs font-semibold">#{bot.id}</span>
      ),
    },
    {
      key: 'name',
      header: 'Bot Name',
      render: (bot) => (
        <div>
          <div className="font-bold text-white text-xs">{bot.name}</div>
          <div className="text-[10px] text-slate-400 font-mono">User ID #{bot.userId}</div>
        </div>
      ),
    },
    {
      key: 'strategyType',
      header: 'Strategy',
      render: (bot) => {
        const variantMap: Record<BotStrategyType, 'cyan' | 'simulated' | 'amber' | 'neutral'> = {
          CONSERVATIVE_MM: 'cyan',
          BALANCED_MM: 'simulated',
          AGGRESSIVE_LP: 'amber',
          RANDOM_LIQUIDITY: 'neutral',
        };
        return <Badge variant={variantMap[bot.strategyType] || 'cyan'}>{bot.strategyType}</Badge>;
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (bot) => {
        const variant =
          bot.status === 'ACTIVE' ? 'gain' : bot.status === 'PAUSED' ? 'amber' : 'loss';
        return <Badge variant={variant}>{bot.status}</Badge>;
      },
    },
    {
      key: 'allocatedCapital',
      header: 'Allocated Capital',
      render: (bot) => (
        <span className="font-mono text-slate-200 text-xs">
          {formatCurrency(bot.allocatedCapital)}
        </span>
      ),
    },
    {
      key: 'currentCashBalance',
      header: 'Cash Balance',
      render: (bot) => (
        <span className="font-mono text-emerald-400 text-xs font-medium">
          {bot.currentCashBalance ? formatCurrency(bot.currentCashBalance) : '---'}
        </span>
      ),
    },
    {
      key: 'openOrdersCount',
      header: 'Open Orders',
      render: (bot) => (
        <span className="font-mono text-cyan-300 text-xs font-semibold">
          {bot.openOrdersCount ?? 0}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Controls',
      align: 'right',
      render: (bot) => (
        <div className="flex items-center justify-end gap-1">
          {bot.status === 'PAUSED' && (
            <button
              onClick={() => handleEnableBot(bot.id)}
              className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 transition-colors"
              title="Resume Bot"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          {bot.status === 'ACTIVE' && (
            <button
              onClick={() => handleDisableBot(bot.id)}
              className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
              title="Pause Bot"
            >
              <Pause className="w-3.5 h-3.5" />
            </button>
          )}
          {bot.status !== 'KILLED' && (
            <button
              onClick={() => handleTriggerBot(bot.id)}
              className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 transition-colors"
              title="Trigger Quote Cycle"
            >
              <Zap className="w-3.5 h-3.5" />
            </button>
          )}
          {bot.status !== 'KILLED' && (
            <button
              onClick={() => handleKillBot(bot.id)}
              className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 border border-rose-500/30 transition-colors"
              title="Emergency Kill Switch"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => handleOpenLogs(bot)}
            className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-card-border transition-colors"
            title="View Audit Logs"
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Notice & Error Alerts */}
      {actionNotice && (
        <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/50 text-cyan-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/50 text-rose-200 text-xs flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Aggregate Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 rounded-xl bg-[#0A0A0A] border border-card-border">
          <span className="text-[11px] font-mono text-slate-400 uppercase">Total Bots</span>
          <div className="font-mono text-xl font-bold text-white mt-1">
            {metrics?.totalBots ?? bots.length}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[#0A0A0A] border border-card-border">
          <span className="text-[11px] font-mono text-slate-400 uppercase">Active Bots</span>
          <div className="font-mono text-xl font-bold text-emerald-400 mt-1">
            {metrics?.activeBots ?? bots.filter((b) => b.status === 'ACTIVE').length}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[#0A0A0A] border border-card-border">
          <span className="text-[11px] font-mono text-slate-400 uppercase">Allocated Capital</span>
          <div className="font-mono text-sm font-bold text-cyan-400 mt-1 truncate">
            {metrics?.totalAllocatedCapital ? formatCurrency(metrics.totalAllocatedCapital) : '$0.00'}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[#0A0A0A] border border-card-border">
          <span className="text-[11px] font-mono text-slate-400 uppercase">Active Working Capital</span>
          <div className="font-mono text-sm font-bold text-white mt-1 truncate">
            {metrics?.totalActiveCapital ? formatCurrency(metrics.totalActiveCapital) : '$0.00'}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[#0A0A0A] border border-card-border">
          <span className="text-[11px] font-mono text-slate-400 uppercase">Open Orders</span>
          <div className="font-mono text-xl font-bold text-amber-400 mt-1">
            {metrics?.totalOpenBotOrders ?? 0}
          </div>
        </div>
        <div className="p-4 rounded-xl bg-[#0A0A0A] border border-card-border">
          <span className="text-[11px] font-mono text-slate-400 uppercase">Realized P&L</span>
          <div className="font-mono text-sm font-bold text-emerald-400 mt-1 truncate">
            {metrics?.totalRealizedPnL ? formatCurrency(metrics.totalRealizedPnL) : '$0.00'}
          </div>
        </div>
      </div>

      {/* Main Bot Table Card */}
      <Card
        title="Autonomous Market-Making Fleet"
        subtitle="Manage simulated liquidity generators, adjust risk parameters, and monitor continuous quotation cycles"
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={handleKillAllBots}
              leftIcon={<AlertOctagon className="w-3.5 h-3.5" />}
            >
              Kill All Bots
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowCreateModal(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Register Bot
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              isLoading={isLoading}
              leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Refresh
            </Button>
          </div>
        }
      >
        <Table columns={columns} data={bots} keyExtractor={(bot) => bot.id} />
      </Card>

      {/* Create Bot Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <div className="flex items-center gap-2">
                <BotIcon className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Register Autonomous Market-Maker</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateBotSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Bot Name"
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g. Apex Alpha MM"
                  required
                />

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Strategy Profile
                  </label>
                  <select
                    value={createForm.strategyType}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        strategyType: e.target.value as BotStrategyType,
                      })
                    }
                    className="w-full bg-[#0A0A0A] border border-card-border rounded-xl text-xs text-slate-200 p-2.5 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="CONSERVATIVE_MM">CONSERVATIVE_MM (Wide Spread, Safe)</option>
                    <option value="BALANCED_MM">BALANCED_MM (Medium Spread, Balanced)</option>
                    <option value="AGGRESSIVE_LP">AGGRESSIVE_LP (Tight Spread, High Vol)</option>
                    <option value="RANDOM_LIQUIDITY">RANDOM_LIQUIDITY (Jitter Bounded)</option>
                  </select>
                </div>

                <Input
                  label="Allocated Capital (USD)"
                  type="text"
                  value={createForm.allocatedCapital}
                  onChange={(e) => setCreateForm({ ...createForm, allocatedCapital: e.target.value })}
                  placeholder="e.g. 100000.0000"
                  helperText="Funded via balanced SYSTEM_EQUITY_ISSUANCE grant."
                  required
                />

                <Input
                  label="Initial Inventory (Shares)"
                  type="text"
                  value={createForm.initialInventoryShares}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, initialInventoryShares: e.target.value })
                  }
                  placeholder="e.g. 100.0000"
                  helperText="Initial share position per assigned instrument."
                  required
                />
              </div>

              {/* Instrument Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Assigned Instruments
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2 bg-[#0A0A0A] rounded-xl border border-card-border">
                  {instruments.map((inst) => {
                    const isSelected = createForm.instrumentIds.includes(inst.id);
                    return (
                      <button
                        type="button"
                        key={inst.id}
                        onClick={() => {
                          const nextIds = isSelected
                            ? createForm.instrumentIds.filter((id) => id !== inst.id)
                            : [...createForm.instrumentIds, inst.id];
                          setCreateForm({ ...createForm, instrumentIds: nextIds });
                        }}
                        className={`py-1 px-2 rounded-lg text-xs font-mono font-medium border text-left transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50'
                            : 'bg-card text-slate-400 border-card-border hover:text-white'
                        }`}
                      >
                        <span>{inst.symbol}</span>
                        {isSelected && <CheckCircle className="w-3.5 h-3.5 text-cyan-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Risk & Execution Configuration */}
              <div className="p-3 bg-[#0A0A0A] rounded-xl border border-card-border space-y-3">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase block">
                  Risk & Execution Parameters
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Refresh Interval (ms)
                    </label>
                    <input
                      type="number"
                      min={500}
                      max={60000}
                      value={createForm.configuration?.quoteRefreshIntervalMs || 3000}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          configuration: {
                            ...createForm.configuration,
                            quoteRefreshIntervalMs: parseInt(e.target.value, 10) || 3000,
                          },
                        })
                      }
                      className="w-full bg-card border border-card-border rounded-lg text-xs text-white p-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Spread (bps)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={2000}
                      value={createForm.configuration?.spreadBps || 20}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          configuration: {
                            ...createForm.configuration,
                            spreadBps: parseInt(e.target.value, 10) || 20,
                          },
                        })
                      }
                      className="w-full bg-card border border-card-border rounded-lg text-xs text-white p-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Order Quantity
                    </label>
                    <input
                      type="text"
                      value={createForm.configuration?.orderQuantity || '10.0000'}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          configuration: {
                            ...createForm.configuration,
                            orderQuantity: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-card border border-card-border rounded-lg text-xs text-white p-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Max Inventory
                    </label>
                    <input
                      type="text"
                      value={createForm.configuration?.maxInventoryPerInstrument || '500.0000'}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          configuration: {
                            ...createForm.configuration,
                            maxInventoryPerInstrument: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-card border border-card-border rounded-lg text-xs text-white p-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Max Open Orders
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={createForm.configuration?.maxOpenOrders || 8}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          configuration: {
                            ...createForm.configuration,
                            maxOpenOrders: parseInt(e.target.value, 10) || 8,
                          },
                        })
                      }
                      className="w-full bg-card border border-card-border rounded-lg text-xs text-white p-2 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">
                      Max Daily Loss ($)
                    </label>
                    <input
                      type="text"
                      value={createForm.configuration?.maxDailyLoss || '5000.0000'}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          configuration: {
                            ...createForm.configuration,
                            maxDailyLoss: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-card border border-card-border rounded-lg text-xs text-white p-2 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-card-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmittingCreate}
                >
                  Register & Activate Bot
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Execution Logs Modal */}
      {selectedBotForLogs && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl max-w-4xl w-full p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col animate-fadeIn">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <div>
                  <h3 className="font-bold text-white text-base">
                    Execution Audit Logs: {selectedBotForLogs.name} (#{selectedBotForLogs.id})
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    Strategy: {selectedBotForLogs.strategyType} | Status: {selectedBotForLogs.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedBotForLogs(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Log Actions Filter */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                'ALL',
                'QUOTE_CYCLE',
                'ORDER_SUBMITTED',
                'ORDER_CANCELLED',
                'RISK_REJECTED',
                'KILL_SWITCH',
                'STATUS_CHANGE',
                'ERROR',
              ].map((act) => (
                <button
                  key={act}
                  onClick={() => handleFilterLogs(act)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-colors ${
                    logFilterAction === act
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50'
                      : 'bg-[#0A0A0A] text-slate-400 border border-card-border hover:text-white'
                  }`}
                >
                  {act}
                </button>
              ))}
            </div>

            {/* Logs Table / List */}
            <div className="flex-1 overflow-y-auto min-h-[300px] border border-card-border rounded-xl bg-[#0A0A0A] p-2">
              {isLoadingLogs ? (
                <div className="py-12 text-center text-slate-400 text-xs font-mono flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" /> Loading logs...
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs font-mono">
                  No execution logs recorded matching this filter.
                </div>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  {logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 rounded bg-card/60 hover:bg-card border border-card-border/60 flex items-start justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              log.action === 'RISK_REJECTED' || log.action === 'KILL_SWITCH' || log.action === 'ERROR'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : log.action === 'ORDER_SUBMITTED'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                            }`}
                          >
                            {log.action}
                          </span>
                          {log.symbol && (
                            <span className="text-cyan-300 text-[11px] font-bold">
                              {log.symbol}
                            </span>
                          )}
                          {log.instrumentId && (
                            <span className="text-slate-400 text-[11px]">
                              Inst #{log.instrumentId}
                            </span>
                          )}
                          {typeof log.details === 'object' && log.details !== null && (log.details as any).orderId && (
                            <span className="text-slate-400 text-[11px]">
                              Order #{(log.details as any).orderId}
                            </span>
                          )}
                        </div>
                        {log.details && (
                          <pre className="text-[11px] text-slate-300 whitespace-pre-wrap font-mono mt-1 bg-black/30 p-1.5 rounded">
                            {typeof log.details === 'string'
                              ? log.details
                              : JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {formatDate(log.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-card-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedBotForLogs(null)}
              >
                Close Logs
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
