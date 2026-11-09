import React from 'react';

export type BadgeVariant = 'gain' | 'loss' | 'neutral' | 'cyan' | 'amber' | 'simulated';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const variantStyles: Record<BadgeVariant, string> = {
    gain: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30',
    loss: 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30',
    neutral: 'bg-slate-100 dark:bg-[#141414] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#262626]',
    cyan: 'bg-slate-100 dark:bg-[#171717] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626]',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30',
    simulated: 'bg-slate-100 dark:bg-[#141414] text-slate-700 dark:text-neutral-300 border border-slate-200 dark:border-[#262626] font-mono text-[10px] uppercase tracking-wider',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold font-sans ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
