import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { apiClient } from '../services/api';
import { walletApiService } from '../services/wallet.service';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Input } from '../components/common/Input';
import { Table, TableColumn } from '../components/common/Table';
import { formatDate, formatCurrency } from '../utils/formatters';
import { AdminBotsTab } from '../components/admin/AdminBotsTab';
import { AdminNewsTab } from '../components/admin/AdminNewsTab';
import {
  ShieldAlert,
  Power,
  Zap,
  Activity,
  CheckCircle,
  AlertOctagon,
  RefreshCw,
  Wallet,
  X,
  ArrowUpRight,
  ArrowDownLeft,
  Bot as BotIcon,
  Sliders,
  Newspaper,
} from 'lucide-react';

interface ManagedUser {
  id: number;
  email: string;
  username: string;
  role: 'TRADER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  created_at: string;
}

export const AdminDashboardPage: React.FC = () => {
  const { user } = useAuthStore();
  const { exchangeStatus, setExchangeStatus } = useUIStore();

  const [usersList, setUsersList] = useState<ManagedUser[]>([
    {
      id: 1,
      email: 'admin@tradegrid.internal',
      username: 'admin',
      role: 'ADMIN',
      status: 'ACTIVE',
      created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
    },
    {
      id: 2,
      email: 'trader@tradegrid.internal',
      username: 'trader_demo',
      role: 'TRADER',
      status: 'ACTIVE',
      created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
  ]);

  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'BOTS' | 'NEWS' | 'OPERATIONS'>('BOTS');

  // Wallet adjustment modal state
  const [targetUser, setTargetUser] = useState<ManagedUser | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [amount, setAmount] = useState<string>('5000.0000');
  const [reason, setReason] = useState<string>('Administrative tournament award');
  const [idempotencyKey, setIdempotencyKey] = useState<string>('');
  const [isSubmittingAdjustment, setIsSubmittingAdjustment] = useState<boolean>(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const [adjustmentSuccess, setAdjustmentSuccess] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await apiClient.get('/users');
      if (res.data?.data?.users) {
        setUsersList(res.data.data.users);
      }
    } catch {
      // Keep initial users if backend DB is not reachable
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleExchange = () => {
    if (exchangeStatus === 'OPEN') {
      setExchangeStatus('HALTED');
      setAdminNotice('🚨 MARKET HALTED: All order submissions and matching paused across all symbols.');
    } else {
      setExchangeStatus('OPEN');
      setAdminNotice('✅ MARKET RESUMED: Continuous matching engine operational.');
    }
    setTimeout(() => setAdminNotice(null), 5000);
  };

  const handleToggleUserStatus = (target: ManagedUser) => {
    const nextStatus = target.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setUsersList(
      usersList.map((u) => (u.id === target.id ? { ...u, status: nextStatus } : u))
    );
    setAdminNotice(`Trader @${target.username} status updated to ${nextStatus}.`);
    setTimeout(() => setAdminNotice(null), 5000);
  };

  const handleInjectShock = (type: string) => {
    setAdminNotice(`⚡ SIMULATED SHOCK: Triggered [${type}]. Market Simulation Engine prepared for Phase 2.`);
    setTimeout(() => setAdminNotice(null), 5000);
  };

  const openAdjustmentModal = (selectedUser: ManagedUser, type: 'CREDIT' | 'DEBIT') => {
    setTargetUser(selectedUser);
    setAdjustmentType(type);
    setAmount('5000.0000');
    setReason(
      type === 'CREDIT'
        ? 'Administrative virtual grant / prize'
        : 'Administrative virtual clawback / fee'
    );
    setIdempotencyKey(`adm-${selectedUser.id}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);
    setAdjustmentError(null);
    setAdjustmentSuccess(null);
  };

  const handleExecuteAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;

    setIsSubmittingAdjustment(true);
    setAdjustmentError(null);
    setAdjustmentSuccess(null);

    try {
      const input = {
        amount,
        reason,
        idempotencyKey: idempotencyKey || undefined,
      };

      const result =
        adjustmentType === 'CREDIT'
          ? await walletApiService.adminCredit(targetUser.id, input)
          : await walletApiService.adminDebit(targetUser.id, input);

      setAdjustmentSuccess(
        `Successfully ${adjustmentType.toLowerCase()}ed ${formatCurrency(result.amount)} to @${targetUser.username}. New balance: ${formatCurrency(result.newBalance)}. Ref: ${result.transactionReference}`
      );
      setAdminNotice(
        `✅ LEDGER AUDIT: ${adjustmentType} of ${formatCurrency(result.amount)} posted to @${targetUser.username} (Tx: ${result.transactionReference})`
      );

      // Close modal after brief pause
      setTimeout(() => {
        setTargetUser(null);
        setAdjustmentSuccess(null);
      }, 2500);
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message ||
        err.message ||
        `Failed to execute ${adjustmentType.toLowerCase()}`;
      setAdjustmentError(message);
    } finally {
      setIsSubmittingAdjustment(false);
    }
  };

  const columns: TableColumn<ManagedUser>[] = [
    {
      key: 'id',
      header: 'User ID',
      render: (row) => <span className="font-mono text-cyan-400 text-xs">#{row.id}</span>,
    },
    {
      key: 'username',
      header: 'Username',
      render: (row) => <span className="font-mono font-bold text-white">{row.username}</span>,
    },
    {
      key: 'email',
      header: 'Email',
      render: (row) => <span className="text-slate-300 text-xs">{row.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <Badge variant={row.role === 'ADMIN' ? 'amber' : 'cyan'}>{row.role}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status === 'ACTIVE' ? 'gain' : 'loss'}>{row.status}</Badge>
      ),
    },
    {
      key: 'created_at',
      header: 'Registered At',
      render: (row) => (
        <span className="font-mono text-slate-400 text-xs">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Operations & Ledger',
      align: 'right',
      render: (row) => {
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => openAdjustmentModal(row, 'CREDIT')}
              className="px-2 py-1 rounded text-xs font-mono font-medium bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 transition-colors"
              title="Credit Virtual Funds"
            >
              + Credit
            </button>
            <button
              onClick={() => openAdjustmentModal(row, 'DEBIT')}
              className="px-2 py-1 rounded text-xs font-mono font-medium bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/30 transition-colors"
              title="Debit Virtual Funds"
            >
              - Debit
            </button>
            {row.role !== 'ADMIN' && (
              <button
                onClick={() => handleToggleUserStatus(row)}
                className={`px-2 py-1 rounded text-xs font-mono font-medium transition-colors ${
                  row.status === 'ACTIVE'
                    ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 border border-emerald-500/30'
                }`}
              >
                {row.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
              </button>
            )}
          </div>
        );
      },
    },
  ];

  if (user?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
        <h2 className="text-lg font-bold text-white">Access Denied</h2>
        <p className="text-xs text-slate-400">
          The Admin Control Center requires role <code>ADMIN</code>. Please log in with an administrator account.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold  text-slate-900 dark:text-white  flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            Exchange Operations & Market Controls
          </h1>
          <Badge variant="amber">ADMIN PRIVILEGE</Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Supervisory cockpit for circuit breakers, session halts, trader management, and double-entry virtual fund adjustments.
        </p>
      </div>

      {adminNotice && (
        <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/50 text-cyan-200 text-xs flex items-center gap-2 animate-fadeIn">
          <Activity className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span>{adminNotice}</span>
        </div>
      )}

      {/* Top Administration Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-card-border pb-3">
        <button
          onClick={() => setActiveTab('BOTS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === 'BOTS'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-lg shadow-cyan-500/10'
              : 'text-slate-400 hover:text-white bg-[#0A0A0A] border border-card-border'
          }`}
        >
          <BotIcon className="w-4 h-4 text-cyan-400" />
          Autonomous Market-Making Bots (Phase 5B)
        </button>
        <button
          onClick={() => setActiveTab('NEWS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === 'NEWS'
              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-lg shadow-purple-500/10'
              : 'text-slate-400 hover:text-white bg-[#0A0A0A] border border-card-border'
          }`}
        >
          <Newspaper className="w-4 h-4 text-purple-400" />
          News Catalyst Engine (Phase 5C)
        </button>
        <button
          onClick={() => setActiveTab('OPERATIONS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all ${
            activeTab === 'OPERATIONS'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-lg shadow-amber-500/10'
              : 'text-slate-400 hover:text-white bg-[#0A0A0A] border border-card-border'
          }`}
        >
          <Sliders className="w-4 h-4 text-amber-400" />
          Exchange Operations & Virtual Ledger
        </button>
      </div>

      {activeTab === 'BOTS' ? (
        <AdminBotsTab />
      ) : activeTab === 'NEWS' ? (
        <AdminNewsTab />
      ) : (
        <>
          {/* Global Exchange Halt / Circuit Breaker Desk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title="Circuit Breaker & Session State"
          subtitle="Global execution matching switch"
          className="md:col-span-2"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-[#0A0A0A] border border-card-border">
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl border ${
                  exchangeStatus === 'OPEN'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                }`}
              >
                <Power className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-mono text-slate-400 uppercase">Current Session Status</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className={`font-mono text-lg font-bold ${
                      exchangeStatus === 'OPEN' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    EXCHANGE {exchangeStatus}
                  </span>
                  <Badge variant={exchangeStatus === 'OPEN' ? 'gain' : 'loss'}>
                    {exchangeStatus === 'OPEN' ? 'Active Matching' : 'Halted'}
                  </Badge>
                </div>
              </div>
            </div>

            <Button
              variant={exchangeStatus === 'OPEN' ? 'danger' : 'success'}
              size="md"
              onClick={handleToggleExchange}
              leftIcon={<AlertOctagon className="w-4 h-4" />}
            >
              {exchangeStatus === 'OPEN' ? 'Emergency Halt Market' : 'Resume Normal Trading'}
            </Button>
          </div>
        </Card>

        {/* System Health */}
        <Card title="Engine Health" subtitle="Phase 2 Ledger & Backend status">
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center py-1 border-b border-card-border">
              <span className="text-slate-400">Double-Entry Ledger:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Balanced Journal
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-card-border">
              <span className="text-slate-400">Database Engine:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> MySQL 8 Row Locks
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">Idempotency Shield:</span>
              <span className="text-cyan-400">Active (Unique Keys)</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Simulated Catalyst & Market Shock Controls */}
      <Card
        title="Simulated Event Injection Desk"
        subtitle="Trigger synthetic market phenomena to educate students on volatility and panic behavior"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => handleInjectShock('FLASH CRASH (-10%)')}
            className="p-4 rounded-xl bg-background border border-rose-500/30 hover:border-rose-500/60 text-left transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-rose-400">Simulate Flash Crash</span>
              <Zap className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              Triggers simulated liquidity withdrawal and activates automated panic-selling bots across high-beta names.
            </p>
          </button>

          <button
            onClick={() => handleInjectShock('BULL MARKET RALLY (+8%)')}
            className="p-4 rounded-xl bg-background border border-emerald-500/30 hover:border-emerald-500/60 text-left transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-emerald-400">Simulate Market Rally</span>
              <Zap className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              Injects sudden optimistic sentiment news, lifting buyer depth and triggering synthetic FOMO momentum bots.
            </p>
          </button>

          <button
            onClick={() => handleInjectShock('SECTOR VOLATILITY SHOCK')}
            className="p-4 rounded-xl bg-background border border-amber-500/30 hover:border-amber-500/60 text-left transition-colors group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-amber-400">Sector Shockwave</span>
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
              Applies a synthetic supply-chain disruption catalyst to single-sector equities (e.g. Clean Energy or Tech).
            </p>
          </button>
        </div>
      </Card>

      {/* User Management & Ledger Adjustment Desk */}
      <Card
        title="Trader Registry & Virtual Ledger Management"
        subtitle="Oversee participant access, view registered traders, and execute audited virtual funds adjustments"
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchUsers}
            isLoading={isLoadingUsers}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        }
      >
        <Table columns={columns} data={usersList} keyExtractor={(item) => item.id} />
      </Card>
      </>
      )}

      {/* Wallet Adjustment Modal */}
      {targetUser && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">
                  Double-Entry Virtual Funds Adjustment
                </h3>
              </div>
              <button
                onClick={() => setTargetUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteAdjustment} className="space-y-4">
              <div className="p-3 bg-[#0A0A0A] rounded-xl border border-card-border text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Target Trader:</span>
                  <span className="text-white font-mono font-bold">
                    @{targetUser.username} (#{targetUser.id})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Trader Email:</span>
                  <span className="text-slate-300 font-mono">{targetUser.email}</span>
                </div>
              </div>

              {/* Operation Selection */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Ledger Operation
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustmentType('CREDIT')}
                    className={`p-2.5 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      adjustmentType === 'CREDIT'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                        : 'bg-[#0A0A0A] text-slate-400 border-card-border hover:text-slate-200'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4" />
                    CREDIT (+ Inflow)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustmentType('DEBIT')}
                    className={`p-2.5 rounded-xl border text-xs font-mono font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                      adjustmentType === 'DEBIT'
                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                        : 'bg-[#0A0A0A] text-slate-400 border-card-border hover:text-slate-200'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    DEBIT (- Outflow)
                  </button>
                </div>
              </div>

              {/* Amount Input */}
              <Input
                label="Virtual Amount (USD)"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 5000.0000"
                helperText="DECIMAL(19,4) precision strictly enforced."
                required
              />

              {/* Reason / Audit Memo Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mandatory Audit Reason / Memo
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="State the regulatory or operational reason for this adjustment..."
                  rows={2}
                  className="w-full bg-[#0A0A0A] border border-card-border rounded-xl text-xs text-slate-200 p-2.5 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              {/* Idempotency Key */}
              <Input
                label="Idempotency Key"
                type="text"
                value={idempotencyKey}
                onChange={(e) => setIdempotencyKey(e.target.value)}
                placeholder="Unique key to prevent duplicate submissions"
                helperText="Pre-generated key prevents double-spending on network retransmissions."
              />

              {/* Error / Success Feedback */}
              {adjustmentError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs font-mono">
                  {adjustmentError}
                </div>
              )}
              {adjustmentSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs font-mono flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{adjustmentSuccess}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-card-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setTargetUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={adjustmentType === 'CREDIT' ? 'primary' : 'danger'}
                  size="sm"
                  isLoading={isSubmittingAdjustment}
                >
                  Confirm & Post to Ledger
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
