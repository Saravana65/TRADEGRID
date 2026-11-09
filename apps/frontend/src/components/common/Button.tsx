import React from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  className = '',
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-sans font-semibold rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed select-none shadow-sm';

  const sizeStyles: Record<ButtonSize, string> = {
    sm: 'text-xs px-3 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-5 py-2.5 gap-2.5',
  };

  const variantStyles: Record<ButtonVariant, string> = {
    primary:
      'bg-slate-900 dark:bg-white hover:bg-black dark:hover:bg-neutral-200 text-white dark:text-black focus:ring-2 focus:ring-slate-400 dark:focus:ring-white active:translate-y-0.5 shadow-sm',
    secondary:
      'bg-white dark:bg-[#0A0A0A] hover:bg-slate-100 dark:hover:bg-[#141414] text-slate-900 dark:text-white border border-slate-200 dark:border-[#262626] focus:ring-2 focus:ring-slate-400 active:translate-y-0.5',
    success:
      'bg-emerald-600 hover:bg-emerald-500 text-white focus:ring-2 focus:ring-emerald-500 active:translate-y-0.5',
    danger:
      'bg-rose-600 hover:bg-rose-500 text-white focus:ring-2 focus:ring-rose-500 active:translate-y-0.5',
    ghost:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-[#141414] text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white shadow-none focus:ring-2 focus:ring-slate-400',
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : (
        leftIcon && <span className="flex-shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </button>
  );
};
