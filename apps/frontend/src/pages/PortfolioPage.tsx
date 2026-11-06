import React from 'react';
import { useUIStore } from '../store/uiStore';
import { formatCurrency, formatPercent } from '../utils/formatters';
import { Card } from '../components/common/Card';
import { StatCard } from '../components/common/StatCard';
import { Table, TableColumn } from '../components/common/Table';
import { Badge } from '../components/common/Badge';
import { Wallet, PieChart, ShieldAlert, TrendingUp, Layers } from 'lucide-react';

interface PositionRow {
  symbol: string;
  name: string;
  quantity: string;
  avgCost: string;
  currentPrice: string;
  marketValue: string;
  unrealizedPnL: string;
  returnPercent: string;
}

const mockHoldings: PositionRow[] = [
  {
    symbol: 'TGRID',
    name: 'TradeGrid Technologies Corp',
    quantity: '50.0000',
    avgCost: '135.0000',
    currentPrice: '142.5000',
    marketValue: '7125.0000',
    unrealizedPnL: '375.0000',
    returnPercent: '5.56',
  },
  {
    symbol: 'NEXUS',
    name: 'Nexus Quantum Systems',
    quantity: '20.0000',
    avgCost: '295.0000',
    currentPrice: '310.8000',
    marketValue: '6216.0000',
    unrealizedPnL: '316.0000',
    returnPercent: '5.36',
  },
];

export const PortfolioPage: React.FC = () => {
  const { virtualCashBalance } = useUIStore();

  const totalInvested = mockHoldings.reduce((sum, pos) => sum + parseFloat(pos.marketValue), 0);
  const totalUnrealizedPnL = mockHoldings.reduce((sum, pos) => sum + parseFloat(pos.unrealizedPnL), 0);
  const totalNetWorth = parseFloat(virtualCashBalance) + totalInvested;

  const columns: TableColumn<PositionRow>[] = [
    {
      key: 'symbol',
      header: 'Asset',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-white">{row.symbol}</span>
          <Badge variant="simulated">SIM</Badge>
        </div>
      ),
    },
    {
      key: 'quantity',
      header: 'Shares Held',
      render: (row) => (
        <span className="font-mono text-slate-300 tabular-nums">{row.quantity}</span>
      ),
    },
    {
      key: 'avgCost',
      header: 'Average Cost',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-300 tabular-nums">
          {formatCurrency(row.avgCost)}
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
            <div className={`text-xs ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
              ({formatPercent(row.returnPercent)})
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Portfolio & Balances</h1>
        <p className="text-xs text-slate-400 mt-1">
          Real-time snapshot of your simulated virtual assets and cash positions. Authoritative balances are managed exclusively by the backend ledger.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Net Worth"
          value={formatCurrency(totalNetWorth)}
          change="+0.69%"
          changeType="positive"
          subtitle="Cash + Positions"
          icon={<PieChart className="w-5 h-5 text-cyan-400" />}
        />
        <StatCard
          title="Virtual Available Cash"
          value={formatCurrency(virtualCashBalance)}
          change="Available"
          changeType="neutral"
          subtitle="Unreserved funds"
          icon={<Wallet className="w-5 h-5 text-emerald-400" />}
        />
        <StatCard
          title="Total Stock Value"
          value={formatCurrency(totalInvested)}
          change={`${mockHoldings.length} Positions`}
          changeType="neutral"
          subtitle="Invested capital"
          icon={<Layers className="w-5 h-5 text-indigo-400" />}
        />
        <StatCard
          title="Total Unrealized P&L"
          value={`+${formatCurrency(totalUnrealizedPnL)}`}
          change="+5.47%"
          changeType="positive"
          subtitle="Net return on equity"
          icon={<TrendingUp className="w-5 h-5 text-emerald-400" />}
        />
      </div>

      {/* Holdings Table */}
      <Card
        title="Open Equity Holdings"
        subtitle="Current simulated stock allocations held in your account"
      >
        <Table columns={columns} data={mockHoldings} keyExtractor={(item) => item.symbol} />
      </Card>

      {/* Educational Architecture Note */}
      <div className="p-4 rounded-xl bg-card border border-card-border flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="font-semibold text-slate-200">
            Financial Integrity Principle (Engineering Rule #16):
          </span>
          <p className="leading-relaxed">
            The frontend never directly modifies cash or shares. Every trade execution emits a database transaction touching the double-entry <code>cash_ledger</code> and <code>positions</code> table simultaneously with row-level locks, ensuring no race conditions or balance forging.
          </p>
        </div>
      </div>
    </div>
  );
};
