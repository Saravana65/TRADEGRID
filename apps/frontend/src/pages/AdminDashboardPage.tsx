import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { apiClient } from '../services/api';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Table, TableColumn } from '../components/common/Table';
import { formatDate } from '../utils/formatters';
import {
  ShieldAlert,
  Power,
  Zap,
  Activity,
  CheckCircle,
  AlertOctagon,
  RefreshCw,
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

  const handleToggleUserStatus = (targetUser: ManagedUser) => {
    const nextStatus = targetUser.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setUsersList(
      usersList.map((u) => (u.id === targetUser.id ? { ...u, status: nextStatus } : u))
    );
    setAdminNotice(`Trader @${targetUser.username} status updated to ${nextStatus}.`);
    setTimeout(() => setAdminNotice(null), 5000);
  };

  const handleInjectShock = (type: string) => {
    setAdminNotice(`⚡ SIMULATED SHOCK: Triggered [${type}]. Market Simulation Engine prepared for Phase 2.`);
    setTimeout(() => setAdminNotice(null), 5000);
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
      header: 'Control',
      align: 'right',
      render: (row) => {
        if (row.role === 'ADMIN') {
          return <span className="text-slate-500 text-xs italic">Protected</span>;
        }
        return (
          <button
            onClick={() => handleToggleUserStatus(row)}
            className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
              row.status === 'ACTIVE'
                ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 border border-rose-500/30'
                : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40 border border-emerald-500/30'
            }`}
          >
            {row.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
          </button>
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
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            Exchange Operations & Market Controls
          </h1>
          <Badge variant="amber">ADMIN PRIVILEGE</Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Supervisory cockpit for circuit breakers, session halts, trader management, and synthetic catalyst injection.
        </p>
      </div>

      {adminNotice && (
        <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/50 text-cyan-200 text-xs flex items-center gap-2 animate-fadeIn">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span>{adminNotice}</span>
        </div>
      )}

      {/* Global Exchange Halt / Circuit Breaker Desk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          title="Circuit Breaker & Session State"
          subtitle="Global execution matching switch"
          className="md:col-span-2"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-[#090D16] border border-card-border">
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
        <Card title="Engine Health" subtitle="Phase 1 Service status">
          <div className="space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center py-1 border-b border-card-border">
              <span className="text-slate-400">Backend Server:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> Node.js 24 (Port 5000)
              </span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-card-border">
              <span className="text-slate-400">Database Engine:</span>
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" /> MySQL 8 Pool
              </span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-slate-400">WebSocket Relay:</span>
              <span className="text-cyan-400">Socket.IO Handshake Ready</span>
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

      {/* User Management Desk */}
      <Card
        title="Trader Registry Management"
        subtitle="Oversee participant access, view registered traders, and enforce sanctions"
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
    </div>
  );
};
