import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  subtitle?: string;
  icon?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeType = 'neutral',
  subtitle,
  icon,
  className = '',
}) => {
  const isPositive = changeType === 'positive';
  const isNegative = changeType === 'negative';

  return (
    <div
      className={`bg-card rounded-2xl border border-card-border p-5 relative overflow-hidden transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-700 shadow-card-default ${className}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">
          {title}
        </span>
        {icon && (
          <div className="p-2 rounded-xl bg-slate-100 dark:bg-[#141414] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626]">
            {icon}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 font-mono tabular-nums">
          {value}
        </span>
      </div>

      {(change || subtitle) && (
        <div className="mt-2 flex items-center gap-1.5 text-xs">
          {change && (
            <span
              className={`inline-flex items-center gap-0.5 font-bold font-mono tabular-nums ${
                isPositive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isNegative
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {isPositive && <TrendingUp className="w-3.5 h-3.5" />}
              {isNegative && <TrendingDown className="w-3.5 h-3.5" />}
              {change}
            </span>
          )}
          {subtitle && <span className="text-slate-500 dark:text-slate-400 font-sans">{subtitle}</span>}
        </div>
      )}
    </div>
  );
};
