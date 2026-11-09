import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useWalletStore } from '../../store/walletStore';
import { portfolioApiService } from '../../services/portfolio.service';
import { formatCurrency } from '../../utils/formatters';
import { PortfolioSummaryResponse } from '@tradegrid/shared-types';
import { Wallet, ArrowUpRight, RefreshCw } from 'lucide-react';

export const DashboardWalletSummary: React.FC = () => {
  const { balance, fetchWalletSummary, isLoadingWallet } = useWalletStore();
  const [portfolio, setPortfolio] = useState<PortfolioSummaryResponse | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      await fetchWalletSummary();
      const p = await portfolioApiService.getPortfolioSummary();
      setPortfolio(p);
    } catch {
      // Handled silently
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const cash = typeof balance === 'number' ? balance : parseFloat(balance || '0') || 100000;
  const invested = portfolio?.totalInvested ? parseFloat(portfolio.totalInvested) : 0;
  const totalValue = portfolio?.totalPortfolioValue
    ? parseFloat(portfolio.totalPortfolioValue)
    : cash + invested;
  const unrealizedPnL = portfolio?.totalUnrealizedPnL ? parseFloat(portfolio.totalUnrealizedPnL) : 0;
  const isPnLPositive = unrealizedPnL >= 0;

  return (
    <div className="bg-white dark:bg-[#0A0A0A] border border-neutral-200 dark:border-[#1F1F1F] rounded-2xl p-4 shadow-sm select-none font-sans transition-colors duration-200">
      {/* Header with Simulator Badge and Refresh */}
      <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-[#1F1F1F]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-neutral-100 dark:bg-[#171717] text-neutral-800 dark:text-neutral-200 border border-neutral-200 dark:border-[#262626]">
            <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-900 dark:text-white block leading-tight">
              Virtual Wallet
            </span>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 font-mono">
              Institutional Simulation
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40">
            SIM
          </span>
          <button
            onClick={loadData}
            disabled={isRefreshing || isLoadingWallet}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#1A1A1A] transition-colors"
            title="Refresh Balances"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Financial Metrics */}
      <div className="grid grid-cols-2 gap-3 pt-3">
        <div>
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
            Portfolio Value
          </span>
          <span className="text-base font-bold font-mono text-neutral-900 dark:text-white tabular-nums tracking-tight block">
            {formatCurrency(totalValue)}
          </span>
          <span
            className={`text-[10px] font-mono font-semibold tabular-nums ${
              isPnLPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isPnLPositive ? '+' : ''}
            {formatCurrency(unrealizedPnL)} P&L
          </span>
        </div>

        <div>
          <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 block">
            Available Cash
          </span>
          <span className="text-base font-bold font-mono text-neutral-900 dark:text-white tabular-nums tracking-tight block">
            {formatCurrency(cash)}
          </span>
          <span className="text-[10px] font-mono text-neutral-500 dark:text-neutral-400 tabular-nums">
            Invested: {formatCurrency(invested)}
          </span>
        </div>
      </div>

      {/* Quick Action to Ledger / Portfolio */}
      <div className="mt-3 pt-2.5 border-t border-neutral-100 dark:border-[#171717] flex items-center justify-between text-xs">
        <Link
          to="/portfolio"
          className="text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium inline-flex items-center gap-1 transition-colors text-[11px]"
        >
          <span>Holdings ({portfolio?.positions?.length || 0})</span>
        </Link>
        <Link
          to="/transactions"
          className="text-neutral-900 dark:text-white hover:underline font-semibold inline-flex items-center gap-1 text-[11px]"
        >
          <span>Ledger & History</span>
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  );
};
