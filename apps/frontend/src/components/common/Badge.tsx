import React from 'react';

export type BadgeVariant = 'gain' | 'loss' | 'neutral' | 'cyan' | 'amber' | 'simulated';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
  const variantStyles: Record<BadgeVariant, string> = {
    gain: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
    loss: 'bg-rose-500/10 text-rose-400 border border-rose-500/30',
    neutral: 'bg-slate-800 text-slate-300 border border-slate-700',
    cyan: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30',
    amber: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
    simulated: 'bg-purple-500/10 text-purple-300 border border-purple-500/30 text-xs font-mono uppercase tracking-wider',
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
};
