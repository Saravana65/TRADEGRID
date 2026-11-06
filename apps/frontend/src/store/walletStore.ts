import { create } from 'zustand';
import {
  WalletSummaryResponse,
  WalletTransactionItem,
  TransactionDetailResponse,
  AdminAdjustmentResult,
} from '@tradegrid/shared-types';
import { AdminWalletAdjustmentInput } from '@tradegrid/validation';
import { walletApiService, WalletTransactionQueryParams } from '../services/wallet.service';
import { useUIStore } from './uiStore';

interface WalletState {
  summary: WalletSummaryResponse | null;
  balance: string;
  transactions: WalletTransactionItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  selectedTransaction: TransactionDetailResponse | null;
  isLoadingWallet: boolean;
  isLoadingTransactions: boolean;
  isLoadingDetail: boolean;
  error: string | null;

  // Actions
  fetchWalletSummary: () => Promise<void>;
  fetchTransactions: (params?: WalletTransactionQueryParams) => Promise<void>;
  fetchTransactionDetail: (id: number) => Promise<void>;
  clearSelectedTransaction: () => void;
  adminAdjust: (
    type: 'credit' | 'debit',
    userId: number,
    input: AdminWalletAdjustmentInput
  ) => Promise<AdminAdjustmentResult>;
  clearError: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  summary: null,
  balance: '100000.0000',
  transactions: [],
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  },
  selectedTransaction: null,
  isLoadingWallet: false,
  isLoadingTransactions: false,
  isLoadingDetail: false,
  error: null,

  fetchWalletSummary: async () => {
    set({ isLoadingWallet: true, error: null });
    try {
      const summary = await walletApiService.getWalletSummary();
      set({
        summary,
        balance: summary.availableBalance,
        isLoadingWallet: false,
      });
      // Synchronize with UI store for backward-compatible views
      useUIStore.getState().setVirtualCashBalance(summary.availableBalance);
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to fetch wallet summary';
      set({ error: message, isLoadingWallet: false });
    }
  },

  fetchTransactions: async (params?: WalletTransactionQueryParams) => {
    set({ isLoadingTransactions: true, error: null });
    try {
      const result = await walletApiService.getTransactionHistory(params);
      set({
        transactions: result.items,
        pagination: result.pagination,
        isLoadingTransactions: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to fetch transactions';
      set({ error: message, isLoadingTransactions: false });
    }
  },

  fetchTransactionDetail: async (id: number) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const transaction = await walletApiService.getTransactionById(id);
      set({ selectedTransaction: transaction, isLoadingDetail: false });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to fetch transaction details';
      set({ error: message, isLoadingDetail: false });
    }
  },

  clearSelectedTransaction: () => set({ selectedTransaction: null }),

  adminAdjust: async (
    type: 'credit' | 'debit',
    userId: number,
    input: AdminWalletAdjustmentInput
  ) => {
    set({ error: null });
    try {
      const result =
        type === 'credit'
          ? await walletApiService.adminCredit(userId, input)
          : await walletApiService.adminDebit(userId, input);

      // Refresh wallet summary after adjustment
      await get().fetchWalletSummary();
      return result;
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || `Failed to ${type} wallet`;
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
}));
