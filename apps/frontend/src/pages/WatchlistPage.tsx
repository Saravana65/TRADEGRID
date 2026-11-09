import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Badge } from '../components/common/Badge';
import { Table, TableColumn } from '../components/common/Table';
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters';
import { Star, Plus, Trash2, Sparkles } from 'lucide-react';

interface WatchlistItem {
  symbol: string;
  name: string;
  price: string;
  change: string;
  changePercent: string;
  volume: number;
  bid: string;
  ask: string;
}

const initialWatchlist: WatchlistItem[] = [
  {
    symbol: 'TGRID',
    name: 'TradeGrid Technologies Corp',
    price: '142.50',
    change: '4.30',
    changePercent: '3.11',
    volume: 1254300,
    bid: '142.40',
    ask: '142.60',
  },
  {
    symbol: 'NEXUS',
    name: 'Nexus Quantum Systems',
    price: '310.80',
    change: '12.30',
    changePercent: '4.12',
    volume: 890200,
    bid: '310.50',
    ask: '311.00',
  },
  {
    symbol: 'SOLARIS',
    name: 'Solaris Energy Dynamic',
    price: '88.40',
    change: '-3.70',
    changePercent: '-4.02',
    volume: 450100,
    bid: '88.30',
    ask: '88.50',
  },
];

export const WatchlistPage: React.FC = () => {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(initialWatchlist);
  const [newSymbol, setNewSymbol] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = newSymbol.trim().toUpperCase();
    if (!sym) return;

    if (watchlist.some((item) => item.symbol === sym)) {
      setNewSymbol('');
      return;
    }

    const newItem: WatchlistItem = {
      symbol: sym,
      name: `${sym} Simulated Equity`,
      price: '100.00',
      change: '0.00',
      changePercent: '0.00',
      volume: 100000,
      bid: '99.90',
      ask: '100.10',
    };

    setWatchlist([newItem, ...watchlist]);
    setNewSymbol('');
  };

  const handleRemove = (symbol: string) => {
    setWatchlist(watchlist.filter((item) => item.symbol !== symbol));
  };

  const columns: TableColumn<WatchlistItem>[] = [
    {
      key: 'symbol',
      header: 'Ticker',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
          <span className="font-mono font-bold text-white">{row.symbol}</span>
          <Badge variant="simulated">SIM</Badge>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Security Name',
      render: (row) => <span className="text-slate-300 text-sm">{row.name}</span>,
    },
    {
      key: 'price',
      header: 'Price',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-semibold text-slate-100 tabular-nums">
          {formatCurrency(row.price)}
        </span>
      ),
    },
    {
      key: 'changePercent',
      header: 'Change',
      align: 'right',
      render: (row) => {
        const isPos = parseFloat(row.changePercent) >= 0;
        return (
          <span
            className={`font-mono font-medium tabular-nums ${
              isPos ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {formatPercent(row.changePercent)}
          </span>
        );
      },
    },
    {
      key: 'bidAsk',
      header: 'Bid / Ask',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-400 text-xs tabular-nums">
          {row.bid} / {row.ask}
        </span>
      ),
    },
    {
      key: 'volume',
      header: 'Volume',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-400 text-xs tabular-nums">
          {formatNumber(row.volume)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Link
            to={`/trade?symbol=${row.symbol}`}
            className="p-1.5 rounded hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 transition-colors"
            title="Trade Symbol"
          >
            <Sparkles className="w-4 h-4" />
          </Link>
          <button
            onClick={() => handleRemove(row.symbol)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
            title="Remove from Watchlist"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold  text-slate-900 dark:text-white ">Custom Watchlists</h1>
          <p className="text-xs text-slate-400 mt-1">
            Pin and track your favorite simulated equities for rapid execution.
          </p>
        </div>

        {/* Quick Add Form */}
        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <Input
            placeholder="Add ticker (e.g. AERO)"
            value={newSymbol}
            onChange={(e) => setNewSymbol(e.target.value)}
            className="w-44 text-xs uppercase"
          />
          <Button type="submit" variant="primary" size="sm" leftIcon={<Plus className="w-3.5 h-3.5" />}>
            Add
          </Button>
        </form>
      </div>

      <Card title="Tracked Equities" subtitle={`${watchlist.length} symbols active in watchlist`}>
        <Table columns={columns} data={watchlist} keyExtractor={(item) => item.symbol} />
      </Card>
    </div>
  );
};
