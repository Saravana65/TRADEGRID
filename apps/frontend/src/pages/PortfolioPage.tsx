import React, { useEffect } from 'react';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWalletStore } from '../store/walletStore';
import { useAuthStore } from '../store/authStore';
import { socketService } from '../services/socket.service';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { Card } from '../components/common/Card';
import { StatCard } from '../components/common/StatCard';
import { Table, TableColumn } from '../components/common/Table';
import { Badge } from '../components/common/Badge';
import { PortfolioPosition } from '@tradegrid/shared-types';
import { Wallet, PieChart, ShieldAlert, TrendingUp, Layers, RefreshCw, AlertCircle } from 'lucide-react';

export const PortfolioPage: React.FC = () => {
  const { user } = useAuthStore();
  const {
    positions,
    cashBalance,
    totalInvested,
    totalPortfolioValue,
    totalRealizedPnL,
    totalUnrealizedPnL,
    isLoading,
    error,
    fetchPortfolioSummary,
  } = usePortfolioStore();

  const { fetchWalletSummary } = useWalletStore();

  useEffect(() => {
    fetchPortfolioSummary();
    fetchWalletSummary();
  }, [fetchPortfolioSummary, fetchWalletSummary]);

  // Phase 5A: Listen for real-time portfolio updates on private user channel
  useEffect(() => {
    if (!user?.id) return;
    const userChannel = `user:${user.id}`;
    socketService.connect();
    socketService.subscribe(userChannel);

    const handleUpdate = () => {
      fetchPortfolioSummary();
      fetchWalletSummary();
    };

    socketService.on('portfolio:updated', handleUpdate);
    socketService.on('trade:executed', handleUpdate);

    return () => {
      socketService.off('portfolio:updated', handleUpdate);
      socketService.off('trade:executed', handleUpdate);
      socketService.unsubscribe(userChannel);
    };
  }, [user?.id, fetchPortfolioSummary, fetchWalletSummary]);

  const numericUnrealizedPnL = parseFloat(totalUnrealizedPnL || '0');

  const columns: TableColumn<PortfolioPosition>[] = [
    {
      key: 'symbol',
      header: 'Asset',
      render: (row) => (
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-white">{row.symbol}</span>
            <Badge variant="simulated">SIM</Badge>
          </div>
          <span className="text-[11px] text-slate-400 block truncate max-w-[160px]">
            {row.name}
          </span>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Shares Held',
      render: (row) => (
        <span className="font-mono text-slate-200 tabular-nums">
          {parseFloat(row.quantity).toFixed(4)}
        </span>
      ),
    },
    {
      key: 'averageBuyPrice',
      header: 'Average Cost',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-300 tabular-nums">
          {formatCurrency(row.averageBuyPrice)}
        </span>
      ),
    },
    {
      key: 'currentPrice',
      header: 'Market Price',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-100 font-medium tabular-nums">
          {formatCurrency(row.currentPrice)}
        </span>
      ),
    },
    {
      key: 'marketValue',
      header: 'Market Value',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-bold text-white tabular-nums">
          {formatCurrency(row.marketValue)}
        </span>
      ),
    },
    {
      key: 'unrealizedPnL',
      header: 'Unrealized P&L',
      align: 'right',
      render: (row) => {
        const pnl = parseFloat(row.unrealizedPnL);
        const isPos = pnl >= 0;
        return (
          <div className="font-mono tabular-nums text-right">
            <span className={isPos ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {isPos ? '+' : ''}
              {formatCurrency(row.unrealizedPnL)}
            </span>
            <div className={`text-[11px] ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
              ({formatPercent(row.returnPercent)})
            </div>
          </div>
        );
      },
    },
    {
      key: 'realizedPnL',
      header: 'Realized P&L',
      align: 'right',
      render: (row) => {
        const pnl = parseFloat(row.realizedPnL || '0');
        const isPos = pnl >= 0;
        return (
          <span
            className={`font-mono text-xs tabular-nums ${
              pnl === 0
                ? 'text-slate-400'
                : isPos
                ? 'text-emerald-400 font-medium'
                : 'text-rose-400 font-medium'
            }`}
          >
            {isPos && pnl > 0 ? '+' : ''}
            {formatCurrency(row.realizedPnL || '0')}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Portfolio & Balances</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time snapshot of your simulated virtual assets and cash positions. Authoritative balances are managed exclusively by the double-entry backend ledger.
          </p>
        </div>
        <button
          onClick={() => fetchPortfolioSummary()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-card-border text-cyan-400 hover:text-cyan-300 text-xs font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Net Worth"
          value={formatCurrency(totalPortfolioValue)}
          change="Real-time"
          changeType="positive"
          subtitle="Cash + Positions"
          icon={<PieChart className="w-5 h-5 text-cyan-400" />}
        />
        <StatCard
          title="Virtual Available Cash"
          value={formatCurrency(cashBalance)}
          change="Available"
          changeType="neutral"
          subtitle="Unreserved funds"
          icon={<Wallet className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Total Stock Value"
          value={formatCurrency(totalInvested)}
          change={`${positions.length} Positions`}
          changeType="neutral"
          subtitle="Invested capital"
          icon={<Layers className="w-5 h-5 text-indigo-400" />}
        />
        <StatCard
          title="Total Unrealized P&L"
          value={`${numericUnrealizedPnL >= 0 ? '+' : ''}${formatCurrency(totalUnrealizedPnL)}`}
          change={parseFloat(totalRealizedPnL) !== 0 ? `Realized: ${formatCurrency(totalRealizedPnL)}` : 'Active'}
          changeType={numericUnrealizedPnL >= 0 ? 'positive' : 'negative'}
          subtitle="Net return on equity"
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
        />
      </div>

      {/* Holdings Table */}
      <Card
        title="Open Equity Holdings"
        subtitle="Current simulated stock allocations held in your account (Phase 4B Settlement Engine)"
      >
        {positions.length === 0 ? (
          <div className="py-12 text-center text-slate-400 font-mono text-xs">
            <Layers className="w-8 h-8 mx-auto text-slate-600 mb-2" />
            <span>No stock holdings currently in your portfolio. Execute orders on the trading terminal to build positions.</span>
          </div>
        ) : (
          <Table columns={columns} data={positions} keyExtractor={(item) => item.symbol} />
        )}
      </Card>

      {/* Educational Architecture Note */}
      <div className="p-4 rounded-xl bg-card border border-card-border flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="font-semibold text-slate-200">
            Phase 4B Atomic Settlement Principle:
          </span>
          <p className="leading-relaxed">
            The frontend never directly modifies cash or shares. Every trade execution emits a database transaction touching the double-entry <code>cash_ledger</code> and <code>portfolio_positions</code> table simultaneously with row-level locks, ensuring no race conditions or balance forging.
          </p>
        </div>
      </div>
    </div>
  );
};
