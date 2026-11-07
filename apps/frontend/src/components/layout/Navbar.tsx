import React, { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { useWalletStore } from '../../store/walletStore';
import { useSocketStore } from '../../store/socketStore';
import { formatCurrency } from '../../utils/formatters';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import {
  Wallet,
  Activity,
  LogOut,
  Shield,
  Menu,
  CheckCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, logout, isAuthenticated } = useAuthStore();
  const { exchangeStatus, toggleSidebar } = useUIStore();
  const { balance, summary, fetchWalletSummary, isLoadingWallet } = useWalletStore();
  const { isConnected, initializeSocket } = useSocketStore();

  useEffect(() => {
    initializeSocket();
  }, [initializeSocket]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchWalletSummary();
    }
  }, [isAuthenticated, fetchWalletSummary]);

  return (
    <header className="h-16 bg-card border-b border-card-border px-4 lg:px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left: Hamburger + Brand Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors focus:outline-none"
          title="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs uppercase font-mono font-bold tracking-widest text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/50">
            SIMULATOR
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="relative flex h-2.5 w-2.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  exchangeStatus === 'OPEN' ? 'bg-emerald-400' : 'bg-rose-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  exchangeStatus === 'OPEN' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
            </span>
            <span className="text-xs font-mono text-slate-300 font-medium">
              EXCHANGE {exchangeStatus}
            </span>
          </div>

          {/* Phase 5A: Real-time WebSocket Live Status Pill */}
          <div
            className={`hidden md:flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${
              isConnected
                ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-400'
                : 'bg-amber-950/40 border-amber-800/40 text-amber-400'
            }`}
            title={isConnected ? 'Real-Time Streaming WebSocket Connected' : 'Reconnecting to Streaming Gateway...'}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>LIVE WS</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-amber-400" />
                <span>OFFLINE</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Right: Virtual Cash Display + User Profile + Logout */}
      <div className="flex items-center gap-4">
        {/* Virtual Cash Pill */}
        <div
          className="hidden sm:flex items-center gap-2 bg-[#0D1424] px-3.5 py-1.5 rounded-lg border border-card-border cursor-pointer hover:border-cyan-500/40 transition-colors"
          title={
            summary?.isConsistentWithLedger
              ? 'Double-entry ledger verified: Available balance strictly reconciles with journal entries.'
              : 'Virtual cash balance'
          }
        >
          <Wallet className="w-4 h-4 text-emerald-400" />
          <div className="flex flex-col text-right">
            <div className="flex items-center gap-1 justify-end">
              <span className="text-[10px] uppercase font-mono text-slate-400 leading-none">
                Virtual Cash ({summary?.currency || 'USD'})
              </span>
              {summary?.isConsistentWithLedger && (
                <CheckCircle className="w-2.5 h-2.5 text-emerald-400" />
              )}
            </div>
            <span className="text-sm font-bold font-mono text-emerald-400 tabular-nums">
              {isLoadingWallet ? 'Syncing...' : formatCurrency(balance)}
            </span>
          </div>
        </div>

        {/* User Info & Role */}
        {user && (
          <div className="flex items-center gap-3 pl-2 border-l border-card-border">
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-medium text-slate-200">{user.username}</span>
              <span className="text-[10px] text-slate-400">{user.email}</span>
            </div>

            <Badge variant={user.role === 'ADMIN' ? 'amber' : 'cyan'}>
              {user.role === 'ADMIN' ? (
                <span className="flex items-center gap-1">
                  <Shield className="w-3 h-3" /> ADMIN
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Activity className="w-3 h-3" /> TRADER
                </span>
              )}
            </Badge>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => logout()}
              title="Sign Out"
              className="text-slate-400 hover:text-rose-400 p-2"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </header>
  );
};
