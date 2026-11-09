import React, { useState, useEffect, useMemo } from 'react';
import { useMarketStore } from '../../store/marketStore';
import { socketService } from '../../services/socket.service';
import { formatCurrency } from '../../utils/formatters';
import { Search, Star, TrendingUp, TrendingDown, RefreshCw, X } from 'lucide-react';

interface MarketWatchlistPanelProps {
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

const FAVORITES_STORAGE_KEY = 'tradegrid_user_favorites';

export const MarketWatchlistPanel: React.FC<MarketWatchlistPanelProps> = ({
  selectedSymbol,
  onSelectSymbol,
}) => {
  const { instruments, quotes, fetchInstruments, fetchQuotes } = useMarketStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'FAVORITES' | 'SIMULATED' | 'REAL'>('ALL');
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(FAVORITES_STORAGE_KEY);
      return stored ? JSON.parse(stored) : ['TGRID', 'NEXUS', 'RELIANCE', 'TCS'];
    } catch {
      return ['TGRID', 'NEXUS'];
    }
  });

  // Track real-time live flashes per symbol
  const [liveFlashes, setLiveFlashes] = useState<Record<string, 'up' | 'down'>>({});

  useEffect(() => {
    fetchInstruments();
    fetchQuotes();
  }, [fetchInstruments, fetchQuotes]);

  // Toggle favorite
  const toggleFavorite = (e: React.MouseEvent, symbol: string) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const updated = prev.includes(symbol)
        ? prev.filter((s) => s !== symbol)
        : [...prev, symbol];
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Silently handle storage quota issues
      }
      return updated;
    });
  };

  // Subscribe to live market updates and flash indicators
  useEffect(() => {
    const handlePriceUpdate = (event: any) => {
      if (!event?.symbol) return;
      const sym = event.symbol.toUpperCase();
      const change = parseFloat(event.changeAmount || '0');
      const dir = change >= 0 ? 'up' : 'down';

      setLiveFlashes((prev) => ({ ...prev, [sym]: dir }));
      setTimeout(() => {
        setLiveFlashes((prev) => {
          const next = { ...prev };
          delete next[sym];
          return next;
        });
      }, 700);
    };

    socketService.on('market:price_update', handlePriceUpdate);
    return () => {
      socketService.off('market:price_update', handlePriceUpdate);
    };
  }, []);

  // Filtered stocks list
  const filteredStocks = useMemo(() => {
    return instruments.filter((inst) => {
      const sym = inst.symbol.toUpperCase();
      const name = (inst.name || '').toLowerCase();
      const q = searchQuery.toLowerCase().trim();

      // Tab filter
      if (activeTab === 'FAVORITES' && !favorites.includes(sym)) return false;
      if (activeTab === 'SIMULATED' && inst.dataClassification !== 'SIMULATED') return false;
      if (activeTab === 'REAL' && inst.dataClassification !== 'REAL') return false;

      // Search query
      if (q && !sym.toLowerCase().includes(q) && !name.includes(q)) return false;

      return true;
    });
  }, [instruments, searchQuery, activeTab, favorites]);

  return (
    <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl shadow-sm flex flex-col h-full overflow-hidden select-none font-sans transition-colors duration-200">
      {/* Watchlist Header */}
      <div className="p-4 border-b border-neutral-100 dark:border-[#1F1F1F] space-y-3 bg-neutral-50/50 dark:bg-[#0D0D0D]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
              Market Watchlist
            </h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-neutral-200 dark:bg-[#1A1A1A] text-neutral-600 dark:text-neutral-400 font-semibold">
              {filteredStocks.length}
            </span>
          </div>
          <button
            onClick={() => {
              fetchInstruments();
              fetchQuotes();
            }}
            className="p-1 text-neutral-400 hover:text-neutral-800 dark:hover:text-white transition-colors"
            title="Refresh Watchlist Quotes"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search stock by symbol or name..."
            className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-[#141414] border border-neutral-200 dark:border-[#262626] rounded-xl text-xs text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-neutral-600 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5 no-scrollbar">
          {(
            [
              { id: 'ALL', label: 'All' },
              { id: 'FAVORITES', label: '⭐ Watchlist' },
              { id: 'SIMULATED', label: 'Simulated' },
              { id: 'REAL', label: 'NSE Equities' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-black font-semibold shadow-sm'
                  : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#171717]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stock Rows List */}
      <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-[#171717] min-h-[360px] max-h-[580px] lg:max-h-[640px]">
        {filteredStocks.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400 dark:text-neutral-500 px-4">
            No instruments found matching &ldquo;{searchQuery}&rdquo;.
          </div>
        ) : (
          filteredStocks.map((inst) => {
            const sym = inst.symbol.toUpperCase();
            const q = quotes[sym];
            const isSelected = selectedSymbol.toUpperCase() === sym;
            const isFav = favorites.includes(sym);
            const flash = liveFlashes[sym];

            const ltp = q?.lastPrice ? parseFloat(q.lastPrice) : 100.0;
            const changeAmt = q?.changeAmount ? parseFloat(q.changeAmount) : 0.0;
            const changePct = q?.changePercent ? parseFloat(q.changePercent) : 0.0;
            const isPositive = changePct > 0;
            const isNegative = changePct < 0;

            return (
              <div
                key={inst.id}
                onClick={() => onSelectSymbol(sym)}
                className={`flex items-center justify-between px-3.5 py-2.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-neutral-100/90 dark:bg-[#171717] border-l-2 border-neutral-900 dark:border-white'
                    : 'hover:bg-neutral-50 dark:hover:bg-[#121212]'
                } ${
                  flash === 'up'
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/20'
                    : flash === 'down'
                    ? 'bg-rose-50/80 dark:bg-rose-950/20'
                    : ''
                }`}
              >
                {/* Left: Star + Symbol & Name */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <button
                    onClick={(e) => toggleFavorite(e, sym)}
                    className="p-1 rounded text-neutral-300 dark:text-neutral-600 hover:text-amber-400 dark:hover:text-amber-400 transition-colors flex-shrink-0"
                    title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        isFav ? 'fill-amber-400 text-amber-400' : ''
                      }`}
                    />
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold font-sans text-neutral-900 dark:text-white truncate">
                        {sym}
                      </span>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium ${
                          inst.dataClassification === 'REAL'
                            ? 'text-neutral-600 dark:text-neutral-400'
                            : 'text-neutral-500 dark:text-neutral-500'
                        }`}
                      >
                        {inst.exchange || 'NSE'}
                      </span>
                    </div>
                    <span className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate block font-sans">
                      {inst.name || sym}
                    </span>
                  </div>
                </div>

                {/* Right: Latest Price + % Change */}
                <div className="text-right flex-shrink-0 pl-2">
                  <span className="text-xs font-bold font-mono text-neutral-900 dark:text-white tabular-nums block">
                    {formatCurrency(ltp)}
                  </span>
                  <div
                    className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold tabular-nums ${
                      isPositive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isNegative
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-neutral-400 dark:text-neutral-500'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : isNegative ? (
                      <TrendingDown className="w-2.5 h-2.5" />
                    ) : null}
                    <span>
                      {isPositive ? '+' : ''}
                      {changeAmt.toFixed(2)} ({changePct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
