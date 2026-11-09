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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  badge?: string;
}

export const Sidebar: React.FC = () => {
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  const primaryNavItems: NavItem[] = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Markets', path: '/markets', icon: BarChart3 },
    { name: 'Trading Terminal', path: '/trade', icon: CandlestickChart, badge: 'LIVE' },
    { name: 'Charting Studio', path: '/chart', icon: TrendingUp },
    { name: 'Strategy Studio', path: '/strategies', icon: Sliders },
    { name: 'Portfolio', path: '/portfolio', icon: Briefcase },
  ];

  const secondaryNavItems: NavItem[] = [
    { name: 'Competitions', path: '/competitions', icon: Trophy },
    { name: 'Achievements', path: '/achievements', icon: Award },
    { name: 'Trader Chat', path: '/chat', icon: MessageSquare },
    { name: 'Quant Research', path: '/research', icon: Cpu },
    { name: 'Watchlist', path: '/watchlist', icon: Star },
    { name: 'Market News', path: '/news', icon: Newspaper },
    { name: 'History & Ledger', path: '/history', icon: History },
  ];

  if (user?.role === 'ADMIN') {
    secondaryNavItems.push({
      name: 'Admin Exchange',
      path: '/admin',
      icon: ShieldCheck,
      adminOnly: true,
      badge: 'ADMIN',
    });
  }

  return (
    <aside
      className={`bg-white dark:bg-[#080C15] border-r border-slate-200 dark:border-card-border flex flex-col transition-all duration-300 select-none z-40 relative ${
        sidebarCollapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-card-border">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="p-2 rounded-xl bg-cyan-50 dark:bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-500/30 shadow-sm flex-shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-sans font-bold tracking-tight text-base text-slate-900 dark:text-white flex items-center">
                TRADE<span className="text-cyan-600 dark:text-cyan-400">GRID</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-sans tracking-wider uppercase font-semibold">
                Terminal 2.0
              </span>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
        {/* Core Trading */}
        <div className="space-y-1">
          {!sidebarCollapsed && (
            <div className="px-3 pb-1.5 text-[11px] font-sans font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Trading Desk
            </div>
          )}
          {primaryNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-sans font-medium transition-all group ${
                    isActive
                      ? 'bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-l-2 border-cyan-600 dark:border-cyan-400 font-semibold shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                  }`
                }
                title={sidebarCollapsed ? item.name : undefined}
              >
                <Icon className="w-4 h-4 flex-shrink-0 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors" />
                {!sidebarCollapsed && (
                  <div className="flex items-center justify-between flex-1">
                    <span>{item.name}</span>
                    {item.badge && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-500/30">
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Intelligence & Arena */}
        <div className="space-y-1">
          {!sidebarCollapsed && (
            <div className="px-3 pb-1.5 text-[11px] font-sans font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Intelligence & Arena
            </div>
          )}
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-sans font-medium transition-all group ${
                    isActive
                      ? item.adminOnly
                        ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border-l-2 border-amber-500 font-semibold'
                        : 'bg-cyan-50 dark:bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-l-2 border-cyan-600 dark:border-cyan-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/40'
                  }`
                }
                title={sidebarCollapsed ? item.name : undefined}
              >
                <Icon
                  className={`w-4 h-4 flex-shrink-0 ${
                    item.adminOnly
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors'
                  }`}
                />
                {!sidebarCollapsed && (
                  <div className="flex items-center justify-between flex-1">
                    <span>{item.name}</span>
                    {item.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                          item.adminOnly
                            ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30'
                            : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* User Status Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-card-border bg-slate-50 dark:bg-[#060910]">
        {sidebarCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Expand Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white dark:bg-card border border-slate-200 dark:border-card-border shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-600/20 border border-cyan-200 dark:border-cyan-500/40 flex items-center justify-center text-cyan-700 dark:text-cyan-300 font-bold font-sans text-xs">
              {user?.username?.slice(0, 2).toUpperCase() || 'TR'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-sans text-xs font-bold text-slate-900 dark:text-white truncate">
                {user?.username || 'Trader'}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Active Trader
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
