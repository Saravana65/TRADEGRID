import React, { useState } from 'react';
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
  ChevronDown,
  Layers,
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  badge?: string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export const Sidebar: React.FC = () => {
  const { user } = useAuthStore();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();

  // Collapsible section state
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({
    TRADING: false,
    RESEARCH: false,
    COMMUNITY: false,
    ACCOUNT: false,
  });

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const navSections: NavSection[] = [
    {
      title: 'TRADING',
      items: [
        { name: 'Dashboard', path: '/', icon: LayoutDashboard },
        { name: 'Markets', path: '/markets', icon: BarChart3 },
        { name: 'Trading Terminal', path: '/trade', icon: CandlestickChart, badge: 'LIVE' },
        { name: 'Watchlist', path: '/watchlist', icon: Star },
        { name: 'Portfolio', path: '/portfolio', icon: Briefcase },
        { name: 'Orders & Fills', path: '/history', icon: Layers },
      ],
    },
    {
      title: 'RESEARCH',
      items: [
        { name: 'Charting Studio', path: '/chart', icon: TrendingUp },
        { name: 'Strategy Studio', path: '/strategies', icon: Sliders },
        { name: 'Quant Research', path: '/research', icon: Cpu },
        { name: 'Market News', path: '/news', icon: Newspaper },
      ],
    },
    {
      title: 'COMMUNITY',
      items: [
        { name: 'Competitions', path: '/competitions', icon: Trophy },
        { name: 'Achievements', path: '/achievements', icon: Award },
        { name: 'Trader Chat', path: '/chat', icon: MessageSquare },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { name: 'History & Ledger', path: '/history', icon: History },
        ...(user?.role === 'ADMIN'
          ? [
              {
                name: 'Admin Exchange',
                path: '/admin',
                icon: ShieldCheck,
                adminOnly: true,
                badge: 'ADMIN',
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <aside
      className={`bg-white dark:bg-black border-r border-slate-200 dark:border-[#1F1F1F] flex flex-col transition-all duration-300 select-none z-40 relative ${
        sidebarCollapsed ? 'w-[68px]' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-[#1F1F1F]">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-[#141414] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626] shadow-sm flex-shrink-0">
            <TrendingUp className="w-5 h-5" />
          </div>
          {!sidebarCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-sans font-bold tracking-tight text-base text-slate-900 dark:text-white flex items-center">
                TRADE<span className="text-slate-500 dark:text-neutral-400 font-semibold">GRID</span>
              </span>
              <span className="text-[10px] text-slate-500 dark:text-neutral-500 font-sans tracking-wider uppercase font-semibold">
                Terminal 2.0
              </span>
            </div>
          )}
        </div>

        {!sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {navSections.map((section) => {
          const isCollapsed = collapsedSections[section.title];
          return (
            <div key={section.title} className="space-y-1">
              {!sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className="w-full flex items-center justify-between px-2.5 pb-1 text-[10px] font-sans font-bold text-slate-400 dark:text-neutral-500 uppercase tracking-wider hover:text-slate-700 dark:hover:text-neutral-300 transition-colors"
                >
                  <span>{section.title}</span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                  />
                </button>
              )}
              {(!isCollapsed || sidebarCollapsed) &&
                section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path + item.name}
                      to={item.path}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-sans font-medium transition-all group ${
                          isActive
                            ? 'bg-slate-100 dark:bg-[#171717] text-slate-900 dark:text-white border-l-2 border-slate-900 dark:border-white font-semibold shadow-sm'
                            : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-[#141414]'
                        }`
                      }
                      title={sidebarCollapsed ? item.name : undefined}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
                      {!sidebarCollapsed && (
                        <div className="flex items-center justify-between flex-1">
                          <span className="truncate">{item.name}</span>
                          {item.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold ${
                                item.badge === 'LIVE'
                                  ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                                  : item.badge === 'ADMIN'
                                  ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50'
                                  : 'bg-slate-200 dark:bg-[#222222] text-slate-800 dark:text-neutral-200 border border-slate-300 dark:border-[#333333]'
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
          );
        })}
      </nav>

      {/* User Status Footer */}
      <div className="p-3 border-t border-slate-200 dark:border-[#1F1F1F] bg-slate-50 dark:bg-[#0A0A0A]">
        {sidebarCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1A1A1A] transition-colors"
            title="Expand Sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#222222] shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#1A1A1A] border border-slate-200 dark:border-[#2E2E2E] flex items-center justify-center text-slate-900 dark:text-white font-bold font-sans text-xs">
              {user?.username?.slice(0, 2).toUpperCase() || 'TR'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-sans text-xs font-bold text-slate-900 dark:text-white truncate">
                {user?.username || 'Trader'}
              </span>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-sans font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                Virtual Trader
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
