import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { StockListing } from '@tradegrid/shared-types';
import { Card } from '../components/common/Card';
import { Badge } from '../components/common/Badge';
import { Table, TableColumn } from '../components/common/Table';
import { Input } from '../components/common/Input';
import { formatCurrency, formatPercent, formatNumber } from '../utils/formatters';
import { Search, Sparkles, Filter } from 'lucide-react';

const mockEquities: StockListing[] = [
  {
    id: 1,
    symbol: 'TGRID',
    name: 'TradeGrid Technologies Corp',
    sector: 'Financial Technology',
    currentPrice: '142.5000',
    previousClose: '138.2000',
    change: '4.3000',
    changePercent: '3.11',
    volume: 1254300,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 2,
    symbol: 'NEXUS',
    name: 'Nexus Quantum Systems',
    sector: 'Semiconductors',
    currentPrice: '310.8000',
    previousClose: '298.5000',
    change: '12.3000',
    changePercent: '4.12',
    volume: 890200,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 3,
    symbol: 'SOLARIS',
    name: 'Solaris Energy Dynamic',
    sector: 'Clean Energy',
    currentPrice: '88.4000',
    previousClose: '92.1000',
    change: '-3.7000',
    changePercent: '-4.02',
    volume: 450100,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 4,
    symbol: 'AERO',
    name: 'AeroDynamics Hypersonic',
    sector: 'Aerospace',
    currentPrice: '215.0000',
    previousClose: '210.0000',
    change: '5.0000',
    changePercent: '2.38',
    volume: 672000,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 5,
    symbol: 'BIOGEN',
    name: 'BioGen Therapeutics',
    sector: 'Biotechnology',
    currentPrice: '64.2000',
    previousClose: '67.8000',
    change: '-3.6000',
    changePercent: '-5.31',
    volume: 910400,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 6,
    symbol: 'CYBER',
    name: 'CyberShield Autonomous Security',
    sector: 'Cybersecurity',
    currentPrice: '178.9000',
    previousClose: '175.0000',
    change: '3.9000',
    changePercent: '2.23',
    volume: 512900,
    isSimulated: true,
    status: 'ACTIVE',
  },
  {
    id: 7,
    symbol: 'KINETIC',
    name: 'Kinetic Robotics & Automation',
    sector: 'Robotics',
    currentPrice: '245.6000',
    previousClose: '249.0000',
    change: '-3.4000',
    changePercent: '-1.37',
    volume: 389000,
    isSimulated: true,
    status: 'ACTIVE',
  },
];

export const MarketsPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  const sectors = ['ALL', 'Financial Technology', 'Semiconductors', 'Clean Energy', 'Aerospace', 'Biotechnology', 'Cybersecurity', 'Robotics'];

  const filteredEquities = mockEquities.filter((item) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSector = selectedSector === 'ALL' || item.sector === selectedSector;
    return matchesSearch && matchesSector;
  });

  const columns: TableColumn<StockListing>[] = [
    {
      key: 'symbol',
      header: 'Symbol',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-white text-sm">{row.symbol}</span>
          <Badge variant="simulated">SIMULATED</Badge>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Company Name',
      render: (row) => <span className="text-slate-200 text-sm">{row.name}</span>,
    },
    {
      key: 'sector',
      header: 'Sector',
      render: (row) => <span className="text-slate-400 text-xs">{row.sector}</span>,
    },
    {
      key: 'currentPrice',
      header: 'Last Price',
      align: 'right',
      render: (row) => (
        <span className="font-mono font-semibold text-slate-100 tabular-nums">
          {formatCurrency(row.currentPrice)}
        </span>
      ),
    },
    {
      key: 'changePercent',
      header: '24h Change',
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
      key: 'volume',
      header: 'Simulated Volume',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-slate-400 text-xs tabular-nums">
          {formatNumber(row.volume)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Terminal',
      align: 'right',
      render: (row) => (
        <Link
          to={`/trade?symbol=${row.symbol}`}
          className="inline-flex items-center gap-1 px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600 text-cyan-400 hover:text-white rounded text-xs font-mono font-medium border border-cyan-500/30 transition-colors"
        >
          <Sparkles className="w-3 h-3" /> Trade
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-white">Simulated Equity Markets</h1>
          <Badge variant="simulated">Educational Tickers</Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Explore the synthetic equity universe. In Phase 2, prices will update via continuous order matching and market simulation ticks.
        </p>
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card border border-card-border p-4 rounded-xl">
        <div className="w-full sm:w-80">
          <Input
            placeholder="Search by symbol or company name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        {/* Sector Tabs */}
        <div className="w-full sm:w-auto flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-500 mr-1 flex-shrink-0" />
          {sectors.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSector(sec)}
              className={`px-2.5 py-1 rounded text-xs whitespace-nowrap font-medium transition-colors ${
                selectedSector === sec
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {/* Markets Table */}
      <Card title="Available Listings" subtitle={`${filteredEquities.length} equities matching criteria`}>
        <Table columns={columns} data={filteredEquities} keyExtractor={(item) => item.id} />
      </Card>
    </div>
  );
};
