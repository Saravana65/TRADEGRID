import React, { useState } from 'react';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Table, TableColumn } from '../components/common/Table';
import { formatCurrency, formatDate } from '../utils/formatters';
import { History, Shield } from 'lucide-react';

interface TradeExecution {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  total: string;
  executedAt: string;
}

interface CashLedgerEntry {
  id: string;
  type: 'INITIAL_GRANT' | 'ORDER_EXECUTION_BUY' | 'ORDER_EXECUTION_SELL';
  amount: string;
  balanceAfter: string;
  description: string;
  createdAt: string;
}

const mockExecutions: TradeExecution[] = [
  {
    id: 'TRD-89410',
    symbol: 'TGRID',
    side: 'BUY',
    quantity: '50.0000',
    price: '135.0000',
    total: '6750.0000',
    executedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'TRD-89402',
    symbol: 'NEXUS',
    side: 'BUY',
    quantity: '20.0000',
    price: '295.0000',
    total: '5900.0000',
    executedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
];

const mockLedger: CashLedgerEntry[] = [
  {
    id: 'LED-003',
    type: 'ORDER_EXECUTION_BUY',
    amount: '-6750.0000',
    balanceAfter: '100000.0000',
    description: 'Filled limit buy 50 TGRID @ $135.00',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'LED-002',
    type: 'ORDER_EXECUTION_BUY',
    amount: '-5900.0000',
    balanceAfter: '106750.0000',
    description: 'Filled limit buy 20 NEXUS @ $295.00',
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    id: 'LED-001',
    type: 'INITIAL_GRANT',
    amount: '112650.0000',
    balanceAfter: '112650.0000',
    description: 'Virtual exchange baseline account initialization grant',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
];

export const TransactionHistoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'executions' | 'ledger'>('executions');

  const executionColumns: TableColumn<TradeExecution>[] = [
    {
      key: 'id',
      header: 'Execution ID',
      render: (row) => <span className="font-mono text-cyan-400 text-xs">{row.id}</span>,
    },
    {
      key: 'symbol',
      header: 'Symbol',
      render: (row) => (
        <span className="font-mono font-bold text-white text-sm">{row.symbol}</span>
      ),
    },
    {
      key: 'side',
      header: 'Side',
      render: (row) => (
        <Badge variant={row.side === 'BUY' ? 'gain' : 'loss'}>{row.side}</Badge>
      ),
    },
    {
      key: 'quantity',
      header: 'Shares',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-200 tabular-nums">{row.quantity}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-200 tabular-nums">
          {formatCurrency(row.price)}
        </span>
      ),
    },
    {
      key: 'total',
      header: 'Total Value',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-bold text-white tabular-nums">
          {formatCurrency(row.total)}
        </span>
      ),
    },
    {
      key: 'executedAt',
      header: 'Timestamp',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-400 text-xs">
          {formatDate(row.executedAt)}
        </span>
      ),
    },
  ];

  const ledgerColumns: TableColumn<CashLedgerEntry>[] = [
    {
      key: 'id',
      header: 'Ledger ID',
      render: (row) => <span className="font-mono text-cyan-400 text-xs">{row.id}</span>,
    },
    {
      key: 'type',
      header: 'Movement Type',
      render: (row) => (
        <Badge variant={row.type === 'INITIAL_GRANT' ? 'cyan' : 'neutral'}>
          {row.type}
        </Badge>
      ),
    },
    {
      key: 'description',
      header: 'Memo / Audit Trail',
      render: (row) => <span className="text-slate-300 text-xs">{row.description}</span>,
    },
    {
      key: 'amount',
      header: 'Amount Delta',
      align: 'right',
      render: (row) => {
        const amt = parseFloat(row.amount);
        const isPos = amt >= 0;
        return (
          <span
            className={`font-mono font-semibold tabular-nums ${
              isPos ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPos ? '+' : ''}
            {formatCurrency(row.amount)}
          </span>
        );
      },
    },
    {
      key: 'balanceAfter',
      header: 'Balance After',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-bold text-slate-100 tabular-nums">
          {formatCurrency(row.balanceAfter)}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Settlement Time',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-400 text-xs">
          {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            Transaction History & Cash Ledger
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Complete audit trail of all executed trades and double-entry cash movements.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 bg-card border border-card-border p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('executions')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeTab === 'executions'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Executed Fills
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
              activeTab === 'ledger'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Append-Only Cash Ledger
          </button>
        </div>
      </div>

      {activeTab === 'executions' ? (
        <Card
          title="Executed Trade Prints"
          subtitle="Immutable record of matched buy and sell orders"
        >
          <Table
            columns={executionColumns}
            data={mockExecutions}
            keyExtractor={(item) => item.id}
          />
        </Card>
      ) : (
        <Card
          title="Authoritative Double-Entry Ledger"
          subtitle="Every dollar movement is recorded with an immutable debit or credit entry"
        >
          <Table columns={ledgerColumns} data={mockLedger} keyExtractor={(item) => item.id} />
        </Card>
      )}

      {/* Engineering Rule Notice */}
      <div className="p-4 rounded-xl bg-card border border-card-border flex items-start gap-3">
        <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="font-semibold text-slate-200">
            Accounting Invariant (Engineering Rule #15):
          </span>
          <p className="leading-relaxed">
            The <code>cash_ledger</code> table is strictly insert-only. No row in the ledger is ever updated or deleted. If a reconciliation discrepancy ever occurs, the system recalculates the current balance by summing the ledger entries.
          </p>
        </div>
      </div>
    </div>
  );
};
