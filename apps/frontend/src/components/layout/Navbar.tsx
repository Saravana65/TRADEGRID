import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { useMarketStore } from '../../store/marketStore';
import { useUIStore } from '../../store/uiStore';
import { socketService } from '../../services/socket.service';
import { formatCurrency } from '../../utils/formatters';
import { ThemeToggle } from '../common/ThemeToggle';
import {
  Menu,
  Search,
  Bell,
  Wallet,
  TrendingUp,
  LogOut,
  ChevronDown,
  Wifi,
  WifiOff,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { balance, fetchWalletSummary } = useWalletStore();
  const { instruments, fetchInstruments } = useMarketStore();
  const { toggleSidebar } = useUIStore();

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [exchangeStatus, setExchangeStatus] = useState<'OPEN' | 'CLOSED'>('OPEN');

  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  // Sample active trade/system notifications
  const [notifications] = useState([
    {
      id: '1',
      title: 'Order Executed',
      message: 'BUY 50 TGRID filled at $142.50',
      time: '2m ago',
      type: 'trade',
    },
    {
      id: '2',
      title: 'Market Hours',
      message: 'NSE Regular Session closes at 15:30 IST',
      time: '15m ago',
      type: 'info',
    },
    {
      id: '3',
      title: 'Virtual Cash Credited',
      message: '$100,000 starting cash allocated',
      time: '1h ago',
      type: 'success',
    },
  ]);

  // Initial load
  useEffect(() => {
    fetchWalletSummary();
    if (instruments.length === 0) {
      fetchInstruments();
    }
  }, [fetchWalletSummary, fetchInstruments, instruments.length]);

  // WebSocket Live Connection Monitoring
  useEffect(() => {
    socketService.connect();
    setIsConnected(socketService.isConnected());

    const checkConn = () => {
      setIsConnected(socketService.isConnected());
    };

    const interval = setInterval(checkConn, 2000);

    const handleMarketStatus = (event: any) => {
      if (event?.marketStatus) {
        setExchangeStatus(event.marketStatus === 'HALTED' ? 'CLOSED' : 'OPEN');
      }
    };

    socketService.on('market:status', handleMarketStatus);

    return () => {
      clearInterval(interval);
      socketService.off('market:status', handleMarketStatus);
    };
  }, []);

  // Keyboard shortcut for Cmd+K search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsProfileOpen(false);
        setIsNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredInstruments = instruments.filter(
    (i) =>
      i.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <header className="h-16 bg-white dark:bg-black border-b border-neutral-200 dark:border-[#1F1F1F] px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 select-none transition-colors duration-200">
      {/* 1. Left: Mobile Sidebar Toggle + Brand Logo + Top Navigation Links + Market Status */}
      <div className="flex items-center gap-3.5">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#141414] transition-colors focus:outline-none"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="p-2 rounded-xl bg-neutral-100 dark:bg-[#141414] text-neutral-900 dark:text-white border border-neutral-200 dark:border-[#262626] shadow-sm">
            <TrendingUp className="w-4 h-4" />
          </div>
          <span className="font-sans font-bold tracking-tight text-base text-neutral-900 dark:text-white hidden sm:inline-flex items-center">
            TRADE<span className="text-neutral-500 dark:text-neutral-400 font-semibold">GRID</span>
          </span>
        </Link>

        {/* Primary Desktop Nav Links */}
        <nav className="hidden lg:flex items-center gap-1 pl-4 ml-2 border-l border-neutral-200 dark:border-[#262626] text-xs font-semibold">
          <Link
            to="/"
            className="px-3 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#141414] transition-colors"
          >
            Dashboard
          </Link>
          <Link
            to="/markets"
            className="px-3 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#141414] transition-colors"
          >
            Markets
          </Link>
          <Link
            to="/portfolio"
            className="px-3 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#141414] transition-colors"
          >
            Portfolio
          </Link>
          <Link
            to="/competitions"
            className="px-3 py-1.5 rounded-lg text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#141414] transition-colors"
          >
            Competitions
          </Link>
        </nav>

        {/* 2. Market Status Indicator */}
        <div className="hidden md:flex items-center gap-2 pl-3 border-l border-neutral-200 dark:border-[#262626]">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-neutral-50 dark:bg-[#111111] border border-neutral-200 dark:border-[#222222]">
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
            <span className="text-[11px] font-sans font-medium text-neutral-700 dark:text-neutral-300">
              {exchangeStatus === 'OPEN' ? 'MARKET OPEN' : 'MARKET CLOSED'}
            </span>
          </div>

          {/* WebSocket Status Pill */}
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold transition-colors ${
              isConnected
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-700 dark:text-amber-400'
            }`}
            title={isConnected ? 'Live WebSocket Connected' : 'Connecting to Live Feed...'}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-500" />
                <span>LIVE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-amber-500" />
                <span>SYNC</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Search, Notifications, Theme Selector, Virtual Cash, Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* 3. Search Trigger */}
        <div className="relative" ref={searchRef}>
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-[#111111] border border-neutral-200 dark:border-[#222222] hover:border-neutral-400 dark:hover:border-[#383838] text-xs font-sans text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors shadow-sm"
          >
            <Search className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" />
            <span className="hidden md:inline font-medium">Search tickers...</span>
            <kbd className="hidden md:inline-block px-1.5 py-0.5 bg-neutral-200 dark:bg-[#1C1C1C] border border-neutral-300 dark:border-[#2E2E2E] rounded text-[9px] text-neutral-600 dark:text-neutral-400 font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Quick Search Modal Dropdown */}
          {isSearchOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-[#0D0D0D] border border-neutral-200 dark:border-[#262626] rounded-2xl shadow-2xl p-3 z-50 animate-fadeIn">
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-neutral-400 dark:text-neutral-500" />
                <input
                  type="text"
                  placeholder="Type symbol or company name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-[#141414] border border-neutral-200 dark:border-[#262626] rounded-xl pl-9 pr-3 py-1.5 text-xs font-sans text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-[#404040]"
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
                    className="w-full text-left p-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#171717] flex items-center justify-between text-xs font-sans transition-colors"
                  >
                    <div>
                      <span className="font-bold text-neutral-900 dark:text-white mr-2">{inst.symbol}</span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 block truncate max-w-[170px]">
                        {inst.name}
                      </span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold bg-neutral-100 dark:bg-[#1C1C1C] text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-[#2E2E2E]">
                      {inst.exchange}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 4. Notifications Bell */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="p-2 rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#141414] transition-colors relative"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500" />
          </button>

          {isNotificationsOpen && (
            <div className="absolute top-full right-0 mt-2 w-80 bg-white dark:bg-[#0D0D0D] border border-neutral-200 dark:border-[#262626] rounded-2xl shadow-2xl p-3 z-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-100 dark:border-[#1F1F1F]">
                <span className="text-xs font-bold text-neutral-900 dark:text-white font-sans">
                  Notifications
                </span>
                <span className="text-[10px] text-neutral-400 font-sans">3 recent</span>
              </div>
              <div className="space-y-1.5">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-2 rounded-xl hover:bg-neutral-50 dark:hover:bg-[#141414] transition-colors font-sans"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold text-neutral-800 dark:text-white">
                      <span>{n.title}</span>
                      <span className="text-[10px] text-neutral-400 font-normal">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
                      {n.message}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 5. Theme Selector */}
        <ThemeToggle />

        {/* 6. Virtual Cash Balance with Unobtrusive SIMULATOR Label */}
        <Link
          to="/portfolio"
          className="flex items-center gap-2.5 bg-neutral-50 dark:bg-[#111111] px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-[#222222] hover:border-neutral-400 dark:hover:border-[#383838] transition-all shadow-sm group"
          title="Virtual Portfolio Balance (Educational Simulator)"
        >
          <div className="w-6 h-6 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
            <Wallet className="w-3.5 h-3.5" />
          </div>
          <div className="flex flex-col text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <span className="text-[9px] uppercase font-sans font-bold text-neutral-500 dark:text-neutral-400 tracking-wider">
                Cash
              </span>
              <span className="text-[9px] px-1 py-0.2 rounded font-mono font-bold bg-neutral-200 dark:bg-[#222222] text-neutral-700 dark:text-neutral-300">
                SIM
              </span>
            </div>
            <span className="text-xs font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(balance)}
            </span>
          </div>
        </Link>

        {/* 7. User Profile Menu */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-1.5 p-1 rounded-xl hover:bg-neutral-100 dark:hover:bg-[#141414] transition-colors focus:outline-none"
          >
            <div className="w-8 h-8 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-black flex items-center justify-center font-bold font-sans text-xs shadow-sm">
              {user?.username?.slice(0, 2).toUpperCase() || 'TR'}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400" />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0D0D0D] border border-neutral-200 dark:border-[#262626] rounded-2xl shadow-xl py-2 z-50 animate-fadeIn font-sans">
              <div className="px-4 py-2 border-b border-neutral-100 dark:border-[#1F1F1F]">
                <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                  {user?.username}
                </p>
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                  {user?.email}
                </p>
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase font-semibold mt-1 inline-block">
                  {user?.role} TRADER
                </span>
              </div>

              <div className="py-1">
                <Link
                  to="/portfolio"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#171717] transition-colors"
                >
                  <Wallet className="w-4 h-4 text-neutral-400" />
                  Portfolio & Ledger
                </Link>
                <Link
                  to="/trade"
                  onClick={() => setIsProfileOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#171717] transition-colors"
                >
                  <TrendingUp className="w-4 h-4 text-neutral-400" />
                  Trading Terminal
                </Link>
              </div>

              <div className="pt-1 border-t border-neutral-100 dark:border-[#1F1F1F]">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
