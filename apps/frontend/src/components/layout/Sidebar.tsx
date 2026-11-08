import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import {
  LayoutDashboard,
  BarChart3,
  CandlestickChart,
  Briefcase,
  Star,
  Newspaper,
  History,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Award,
  MessageSquare,
  Cpu,
  Sliders,
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}

export const Sidebar: React.FC = () => {
  const { user } = useAuthStore();
  const { sidebarCollapsed } = useUIStore();

  const navItems: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Markets', path: '/markets', icon: BarChart3 },
    { name: 'Trading Terminal', path: '/trade', icon: CandlestickChart },
    { name: 'Charting Studio', path: '/chart', icon: TrendingUp },
    { name: 'Strategy Studio', path: '/strategies', icon: Sliders },
    { name: 'Portfolio', path: '/portfolio', icon: Briefcase },
    { name: 'Competitions', path: '/competitions', icon: Trophy },
    { name: 'Achievements', path: '/achievements', icon: Award },
    { name: 'Trader Chat', path: '/chat', icon: MessageSquare },
    { name: 'Quant Research', path: '/research', icon: Cpu },
    { name: 'Watchlist', path: '/watchlist', icon: Star },
    { name: 'Simulated News', path: '/news', icon: Newspaper },
    { name: 'History & Ledger', path: '/history', icon: History },
  ];

  if (user?.role === 'ADMIN') {
    navItems.push({
      name: 'Admin Exchange',
      path: '/admin',
      icon: ShieldCheck,
      adminOnly: true,
    });
  }

  return (
    <aside
      className={`bg-[#0A0E1A] border-r border-card-border flex flex-col transition-all duration-300 select-none ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center px-4 border-b border-card-border gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex-shrink-0">
          <TrendingUp className="w-5 h-5" />
        </div>
        {!sidebarCollapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="font-mono font-bold tracking-wider text-base text-white">
              TRADE<span className="text-cyan-400">GRID</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">VIRTUAL EXCHANGE</span>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? item.adminOnly
                      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                      : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`
              }
              title={sidebarCollapsed ? item.name : undefined}
            >
              <Icon
                className={`w-5 h-5 flex-shrink-0 ${
                  item.adminOnly ? 'text-amber-400' : 'text-slate-400 group-hover:text-cyan-400'
                }`}
              />
              {!sidebarCollapsed && (
                <span className="truncate flex-1">{item.name}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Educational Footer */}
      {!sidebarCollapsed && (
        <div className="p-4 border-t border-card-border bg-[#070B14]">
          <div className="p-3 rounded-lg bg-slate-900 border border-card-border text-[11px] text-slate-400 space-y-1">
            <div className="font-semibold text-slate-300 flex items-center gap-1">
              <span>Phase 1 Architecture</span>
            </div>
            <p className="text-[10px] leading-relaxed text-slate-500">
              Modular Monolith Foundation • Node.js + Express + TypeScript + React
            </p>
          </div>
        </div>
      )}
    </aside>
  );
};
