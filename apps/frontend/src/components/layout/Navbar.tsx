import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useWalletStore } from '../../store/walletStore';
import { useSocketStore } from '../../store/socketStore';
import { useMarketStore } from '../../store/marketStore';
import { formatCurrency } from '../../utils/formatters';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  Wallet,
  Activity,
  LogOut,
  Shield,
  Menu,
  Wifi,
  WifiOff,
  Search,
  ChevronDown,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, isAuthenticated } = useAuthStore();
  const { exchangeStatus, toggleSidebar } = useUIStore();
  const { balance, fetchWalletSummary } = useWalletStore();
  const { isConnected, initializeSocket } = useSocketStore();
  const { instruments, fetchInstruments } = useMarketStore();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    initializeSocket();
  }, [initializeSocket]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchWalletSummary();
      fetchInstruments();
    }
  }, [isAuthenticated, fetchWalletSummary, fetchInstruments]);

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filteredInstruments = instruments.filter(
    (inst) =>
      inst.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inst.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const topQuotes = [
    { symbol: 'TGRID', price: 142.5, change: '+3.11%' },
    { symbol: 'NEXUS', price: 310.8, change: '+4.12%' },
    { symbol: 'RELIANCE', price: 2980.0, change: '+0.85%' },
    { symbol: 'TCS', price: 4120.5, change: '-0.42%' },
    { symbol: 'INFY', price: 1845.2, change: '+1.20%' },
    { symbol: 'HDFCBANK', price: 1650.0, change: '+0.15%' },
  ];

  return (
    <header className="h-16 bg-white/95 dark:bg-[#080C15]/95 backdrop-blur-md border-b border-slate-200 dark:border-card-border px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 select-none transition-colors duration-200">
      {/* Left: Mobile Toggle + Exchange Status + Live WebSocket */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors focus:outline-none"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] uppercase font-sans font-bold tracking-wider text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/60 px-2.5 py-0.5 rounded-lg border border-cyan-200 dark:border-cyan-800/50">
            SIMULATOR
          </span>
          <div className="flex items-center gap-1.5 ml-1">
            <span className="relative flex h-2 w-2">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  exchangeStatus === 'OPEN' ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  exchangeStatus === 'OPEN' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </span>
            <span className="text-xs font-sans text-slate-600 dark:text-slate-300 font-medium">
              EXCHANGE {exchangeStatus}
            </span>
          </div>

          {/* Real-time WebSocket Live Status Pill */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border text-[10px] font-sans font-semibold transition-colors ${
              isConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400'
            }`}
            title={
              isConnected
                ? 'Real-Time Streaming WebSocket Connected'
                : 'Connecting to Streaming Gateway...'
            }
          >
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-500 animate-pulse" />
                <span>LIVE WS</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-amber-500" />
                <span>CONNECTING</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Center: Live Streaming Mini Ticker Tape */}
      <div className="hidden xl:flex items-center gap-3 text-xs overflow-hidden max-w-xl mx-4">
        {topQuotes.map((q) => {
          const isUp = q.change.startsWith('+');
          return (
            <Link
              key={q.symbol}
              to={`/trade?symbol=${q.symbol}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors whitespace-nowrap"
            >
              <span className="font-bold text-slate-800 dark:text-slate-200 font-sans">{q.symbol}</span>
              <span className="text-slate-600 dark:text-slate-300 font-mono tabular-nums">{formatCurrency(q.price)}</span>
              <span
                className={`text-[11px] font-semibold flex items-center font-mono tabular-nums ${
                  isUp ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {isUp ? <TrendingUp className="w-2.5 h-2.5 mr-0.5" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5" />}
                {q.change}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Right: Quick Search + Theme Toggle + Virtual Cash + User Profile */}
      <div className="flex items-center gap-2.5">
        {/* Quick Search Trigger */}
        <div className="relative">
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-card border border-slate-200 dark:border-card-border hover:border-cyan-500/50 text-xs font-sans text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors shadow-sm"
          >
            <Search className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span className="hidden md:inline font-medium">Search tickers...</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.5 bg-slate-100 dark:bg-[#070A12] border border-slate-200 dark:border-slate-700 rounded text-[9px] text-slate-500 dark:text-slate-400 font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Quick Search Modal Dropdown */}
          {isSearchOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-card border border-slate-200 dark:border-card-border rounded-2xl shadow-2xl p-3 z-50 animate-fadeIn">
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Type symbol or enterprise name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-[#090D18] border border-slate-200 dark:border-card-border rounded-xl pl-9 pr-3 py-1.5 text-xs font-sans text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredInstruments.slice(0, 8).map((inst) => (
                  <button
                    key={inst.id}
                    onClick={() => {
                      navigate(`/trade?symbol=${inst.symbol}`);
                      setIsSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-left p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-between text-xs font-sans transition-colors"
                  >
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white mr-2">{inst.symbol}</span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate max-w-[170px]">
                        {inst.name}
                      </span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-cyan-50 dark:bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30">
                      {inst.exchange}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle (System / Light / Dark) */}
        <ThemeToggle />

        {/* Virtual Cash Pill */}
        <Link
          to="/portfolio"
          className="flex items-center gap-2 bg-white dark:bg-[#090D16] px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-card-border hover:border-cyan-500/50 transition-all shadow-sm group"
          title="Review Virtual Portfolio & Cash Ledger"
        >
          <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <Wallet className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col text-right">
            <span className="text-[9px] uppercase font-sans font-semibold text-slate-500 dark:text-slate-400 tracking-wider">
              Virtual Cash
            </span>
            <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(balance)}
            </span>
          </div>
        </Link>

        {/* User Profile Avatar & Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors focus:outline-none"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center text-white font-bold font-sans text-xs shadow-sm">
              {user?.username?.slice(0, 2).toUpperCase() || 'TR'}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {isProfileOpen && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-card border border-slate-200 dark:border-card-border rounded-2xl shadow-2xl p-3 z-50 font-sans text-xs animate-fadeIn">
              <div className="px-3 py-2 border-b border-slate-100 dark:border-card-border/60 mb-2">
                <span className="font-bold text-slate-900 dark:text-white block text-sm">{user?.username}</span>
                <span className="text-slate-500 dark:text-slate-400 text-[11px] block truncate">{user?.email}</span>
                <span className="text-[10px] text-cyan-600 dark:text-cyan-400 uppercase font-semibold mt-1 inline-block">
                  Role: {user?.role || 'TRADER'}
                </span>
              </div>

              <div className="space-y-1">
                <Link
                  to="/portfolio"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                >
                  <Wallet className="w-4 h-4 text-cyan-500" /> Portfolio & Ledger
                </Link>
                <Link
                  to="/history"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
                >
                  <Activity className="w-4 h-4 text-emerald-500" /> Transaction Audit
                </Link>
                {user?.role === 'ADMIN' && (
                  <Link
                    to="/admin"
                    onClick={() => setIsProfileOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
                  >
                    <Shield className="w-4 h-4 text-amber-500" /> Admin Exchange
                  </Link>
                )}
              </div>

              <div className="pt-2 mt-2 border-t border-slate-100 dark:border-card-border/60">
                <button
                  onClick={() => {
                    setIsProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors text-left font-bold"
                >
                  <LogOut className="w-4 h-4" /> Disconnect / Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
