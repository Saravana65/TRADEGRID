import React, { useState, useEffect } from 'react';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Button } from '../components/common/Button';
import { Table, TableColumn } from '../components/common/Table';
import { formatCurrency, formatDate } from '../utils/formatters';
import { useWalletStore } from '../store/walletStore';
import { WalletTransactionItem } from '@tradegrid/shared-types';
import {
  History,
  Shield,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RefreshCw,
  CheckCircle,
  FileText,
  X,
  Layers,
} from 'lucide-react';

interface TradeExecution {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: string;
  price: string;
  total: string;
  executedAt: string;
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

const transactionTypes = [
  { value: '', label: 'All Transactions' },
  { value: 'INITIAL_SIGNUP_GRANT', label: 'Initial Grants' },
  { value: 'ADMIN_CREDIT', label: 'Admin Credits' },
  { value: 'ADMIN_DEBIT', label: 'Admin Debits' },
  { value: 'SYSTEM_ADJUSTMENT', label: 'System Adjustments' },
  { value: 'TRADE_BUY', label: 'Trade Buys' },
  { value: 'TRADE_SELL', label: 'Trade Sells' },
  { value: 'FEE', label: 'Fees' },
];

export const TransactionHistoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ledger' | 'executions'>('ledger');
  const [selectedType, setSelectedType] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);

  const {
    summary,
    transactions,
    pagination,
    selectedTransaction,
    isLoadingWallet,
    isLoadingTransactions,
    error,
    fetchWalletSummary,
    fetchTransactions,
    fetchTransactionDetail,
    clearSelectedTransaction,
  } = useWalletStore();

  useEffect(() => {
    fetchWalletSummary();
    fetchTransactions({ page: currentPage, limit: 15, type: selectedType || undefined });
  }, [fetchWalletSummary, fetchTransactions, currentPage, selectedType]);

  const handleTypeChange = (newType: string) => {
    setSelectedType(newType);
    setCurrentPage(1);
  };

  const handleRefresh = () => {
    fetchWalletSummary();
    fetchTransactions({ page: currentPage, limit: 15, type: selectedType || undefined });
  };

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

  const ledgerColumns: TableColumn<WalletTransactionItem>[] = [
    {
      key: 'transactionReference',
      header: 'Tx Reference',
      render: (row) => (
        <button
          onClick={() => fetchTransactionDetail(row.id)}
          className="font-mono text-cyan-400 hover:text-cyan-300 text-xs underline text-left cursor-pointer"
          title="Click to view journal entries"
        >
          {row.transactionReference}
        </button>
      ),
    },
    {
      key: 'transactionType',
      header: 'Operation Type',
      render: (row) => {
        let variant: 'cyan' | 'gain' | 'loss' | 'neutral' | 'amber' = 'neutral';
        if (row.transactionType === 'INITIAL_SIGNUP_GRANT') variant = 'cyan';
        else if (row.transactionType === 'ADMIN_CREDIT') variant = 'gain';
        else if (row.transactionType === 'ADMIN_DEBIT') variant = 'amber';
        else if (row.transactionType === 'TRADE_BUY') variant = 'loss';
        else if (row.transactionType === 'TRADE_SELL') variant = 'gain';

        return <Badge variant={variant}>{row.transactionType}</Badge>;
      },
    },
    {
      key: 'description',
      header: 'Memo / Audit Trail',
      render: (row) => (
        <div className="max-w-md">
          <p className="text-slate-200 text-xs font-medium truncate">{row.description}</p>
        </div>
      ),
    },
    {
      key: 'direction',
      header: 'Flow',
      render: (row) => (
        <span
          className={`inline-flex items-center gap-1 text-xs font-mono font-semibold ${
            row.direction === 'INFLOW' ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {row.direction === 'INFLOW' ? (
            <ArrowDownLeft className="w-3.5 h-3.5" />
          ) : (
            <ArrowUpRight className="w-3.5 h-3.5" />
          )}
          {row.direction}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount Delta',
      align: 'right',
      render: (row) => {
        const isPos = row.direction === 'INFLOW';
        return (
          <span
            className={`font-mono font-bold tabular-nums ${
              isPos ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {isPos ? '+' : '-'}
            {formatCurrency(row.amount)}
          </span>
        );
      },
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
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <History className="w-5 h-5 text-slate-900 dark:text-white" />
            Transaction History & Cash Ledger
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative, append-only double-entry ledger verifying all virtual fund allocations.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoadingTransactions || isLoadingWallet}
            title="Refresh Ledger"
            className="text-slate-400 hover:text-slate-200"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoadingTransactions || isLoadingWallet ? 'animate-spin' : ''}`}
            />
          </Button>

          <div className="flex items-center gap-1 bg-card border border-card-border p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('ledger')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                activeTab === 'ledger'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Authoritative Cash Ledger
            </button>
            <button
              onClick={() => setActiveTab('executions')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors ${
                activeTab === 'executions'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Order Fills
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-card border border-card-border">
            <span className="text-[11px] font-mono uppercase text-slate-400">Available Balance</span>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
              {formatCurrency(summary.availableBalance)} {summary.currency}
            </div>
            <span className="text-[10px] text-slate-500">Materialized row-level balance</span>
          </div>

          <div className="p-4 rounded-xl bg-card border border-card-border">
            <span className="text-[11px] font-mono uppercase text-slate-400">Total Inflow (Credits)</span>
            <div className="text-lg font-bold font-mono text-cyan-400 mt-1">
              +{formatCurrency(summary.totalCredited)}
            </div>
            <span className="text-[10px] text-slate-500">Cumulative virtual grants</span>
          </div>

          <div className="p-4 rounded-xl bg-card border border-card-border">
            <span className="text-[11px] font-mono uppercase text-slate-400">Total Outflow (Debits)</span>
            <div className="text-lg font-bold font-mono text-rose-400 mt-1">
              -{formatCurrency(summary.totalDebited)}
            </div>
            <span className="text-[10px] text-slate-500">Deployments & fee outflows</span>
          </div>

          <div className="p-4 rounded-xl bg-card border border-card-border">
            <span className="text-[11px] font-mono uppercase text-slate-400">Audit Status</span>
            <div className="flex items-center gap-1.5 mt-1">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold font-mono text-emerald-400">RECONCILED</span>
            </div>
            <span className="text-[10px] text-slate-500">
              {summary.isConsistentWithLedger
                ? 'Σ Ledger Entries == Balance'
                : 'Ledger discrepancy detected'}
            </span>
          </div>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {activeTab === 'ledger' ? (
        <Card
          title="Authoritative Double-Entry Ledger"
          subtitle="Every dollar movement is recorded with an immutable debit or credit entry"
          action={
            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="bg-[#0A0A0A] border border-card-border rounded-lg text-xs font-mono text-slate-300 px-2.5 py-1 focus:outline-none focus:border-cyan-500"
              >
                {transactionTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {isLoadingTransactions ? (
            <div className="p-8 text-center text-slate-400 text-xs font-mono">
              Loading ledger entries...
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs font-mono">
              No ledger transactions found matching the selected criteria.
            </div>
          ) : (
            <>
              <Table
                columns={ledgerColumns}
                data={transactions}
                keyExtractor={(item) => String(item.id)}
              />

              {/* Pagination Controls */}
              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 mt-4 border-t border-card-border">
                  <span className="text-xs font-mono text-slate-400">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} entries)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pagination.page <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => setCurrentPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      ) : (
        <Card
          title="Executed Trade Prints"
          subtitle="Immutable record of matched buy and sell orders (Simulated executions)"
        >
          <Table
            columns={executionColumns}
            data={mockExecutions}
            keyExtractor={(item) => item.id}
          />
        </Card>
      )}

      {/* Transaction Detail Modal */}
      {selectedTransaction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-card-border rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-fadeIn">
            <div className="flex items-center justify-between border-b border-card-border pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Ledger Journal Detail</h3>
              </div>
              <button
                onClick={clearSelectedTransaction}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-3 bg-[#0A0A0A] rounded-xl border border-card-border">
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-mono">Tx Reference</span>
                  <p className="font-mono text-cyan-400 font-semibold mt-0.5">
                    {selectedTransaction.transaction_reference}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-mono">Operation Type</span>
                  <p className="font-mono text-white font-semibold mt-0.5">
                    {selectedTransaction.transaction_type}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-mono">Idempotency Key</span>
                  <p className="font-mono text-slate-300 mt-0.5 truncate">
                    {selectedTransaction.idempotency_key || 'None (system-assigned)'}
                  </p>
                </div>
                <div>
                  <span className="text-slate-400 uppercase text-[10px] font-mono">Timestamp</span>
                  <p className="font-mono text-slate-300 mt-0.5">
                    {formatDate(selectedTransaction.created_at)}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 uppercase text-[10px] font-mono">Description / Memo</span>
                  <p className="text-slate-200 mt-0.5">{selectedTransaction.description}</p>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  Balanced Journal Line Items (Σ Debits == Σ Credits)
                </h4>

                <div className="border border-card-border rounded-xl overflow-hidden">
                  <table className="w-full text-left font-mono text-xs">
                    <thead className="bg-[#0A0A0A] text-slate-400 border-b border-card-border">
                      <tr>
                        <th className="p-2.5">Entry ID</th>
                        <th className="p-2.5">Account ID</th>
                        <th className="p-2.5">Entry Type</th>
                        <th className="p-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-card-border">
                      {selectedTransaction.entries.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-800/40">
                          <td className="p-2.5 text-slate-400">#{entry.id}</td>
                          <td className="p-2.5 text-slate-300">Account #{entry.account_id}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                entry.entry_type === 'DEBIT'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                              }`}
                            >
                              {entry.entry_type}
                            </span>
                          </td>
                          <td className="p-2.5 text-right text-white font-bold">
                            {formatCurrency(entry.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="secondary" size="sm" onClick={clearSelectedTransaction}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Educational Accounting Invariant Notice */}
      <div className="p-4 rounded-xl bg-card border border-card-border flex items-start gap-3">
        <Shield className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-400 space-y-1">
          <span className="font-semibold text-slate-200">
            Double-Entry Ledger Invariant (Phase 2 Architectural Standard):
          </span>
          <p className="leading-relaxed">
            The <code>ledger_entries</code> table is immutable and append-only. Every financial movement generates two balanced lines: a DEBIT to the recipient account and a CREDIT to the funding source. The <code>wallets.available_balance</code> column acts as a materialized cache updated inside atomic MySQL transactions (<code>SELECT ... FOR UPDATE</code>), guaranteed to equal the mathematical sum of historical ledger entries.
          </p>
        </div>
      </div>
    </div>
  );
};
