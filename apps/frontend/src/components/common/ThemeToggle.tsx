import React, { useState, useRef, useEffect } from 'react';
import { useUIStore, ThemeMode } from '../../store/uiStore';
import { Sun, Moon, Monitor, Check } from 'lucide-react';

export const ThemeToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { theme, effectiveTheme, setTheme } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const options: { mode: ThemeMode; label: string; icon: React.ElementType }[] = [
    { mode: 'system', label: 'System Auto', icon: Monitor },
    { mode: 'light', label: 'Light Mode', icon: Sun },
    { mode: 'dark', label: 'Dark Mode', icon: Moon },
  ];

  const CurrentIcon = effectiveTheme === 'dark' ? Moon : Sun;

  if (compact) {
    // Quick one-click toggle between Light / Dark, with System on double/alt
    return (
      <button
        onClick={() => {
          if (theme === 'system') {
            setTheme(effectiveTheme === 'dark' ? 'light' : 'dark');
          } else if (theme === 'dark') {
            setTheme('light');
          } else {
            setTheme('system');
          }
        }}
        className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none"
        title={`Theme: ${theme.toUpperCase()} (Click to cycle Light / Dark / Auto)`}
      >
        <CurrentIcon className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
      </button>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-card-border bg-white dark:bg-card text-slate-700 dark:text-slate-300 hover:border-cyan-500/50 transition-colors text-xs font-sans font-medium shadow-sm focus:outline-none"
        title="Toggle Theme: System / Light / Dark"
      >
        <CurrentIcon className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
        <span className="hidden sm:inline capitalize">
          {theme === 'system' ? 'Auto' : theme}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 w-40 bg-white dark:bg-card border border-slate-200 dark:border-card-border rounded-xl shadow-xl py-1 z-50 animate-fadeIn">
          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/60 mb-1">
            Display Theme
          </div>
          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = theme === opt.mode;
            return (
              <button
                key={opt.mode}
                onClick={() => {
                  setTheme(opt.mode);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-1.5 text-xs font-sans transition-colors ${
                  isSelected
                    ? 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/40 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-current" />
                  <span>{opt.label}</span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-current" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
