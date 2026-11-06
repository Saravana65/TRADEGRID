import { create } from 'zustand';
import { PortfolioPosition, PortfolioSummaryResponse } from '@tradegrid/shared-types';
import { portfolioApiService } from '../services/portfolio.service';

interface PortfolioState {
  summary: PortfolioSummaryResponse | null;
  positions: PortfolioPosition[];
  cashBalance: string;
  totalInvested: string;
  totalPortfolioValue: string;
  totalUnrealizedPnL: string;
  totalRealizedPnL: string;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchPortfolioSummary: () => Promise<void>;
  clearError: () => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  summary: null,
  positions: [],
  cashBalance: '0.0000',
  totalInvested: '0.0000',
  totalPortfolioValue: '0.0000',
  totalUnrealizedPnL: '0.0000',
  totalRealizedPnL: '0.0000',
  isLoading: false,
  error: null,

  fetchPortfolioSummary: async () => {
    set({ isLoading: true, error: null });
    try {
      const summary = await portfolioApiService.getPortfolioSummary();
      set({
        summary,
        positions: summary.positions,
        cashBalance: summary.cashBalance,
        totalInvested: summary.totalInvested,
        totalPortfolioValue: summary.totalPortfolioValue,
        totalUnrealizedPnL: summary.totalUnrealizedPnL,
        totalRealizedPnL: summary.totalRealizedPnL,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        error: err.response?.data?.error?.message || err.message || 'Failed to fetch portfolio summary',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
