import { apiClient } from './api';
import {
  ApiResponse,
  WalletSummaryResponse,
  WalletTransactionsResponse,
  TransactionDetailResponse,
  AdminAdjustmentResult,
} from '@tradegrid/shared-types';
import { AdminWalletAdjustmentInput } from '@tradegrid/validation';

export interface WalletTransactionQueryParams {
  page?: number;
  limit?: number;
  type?: string;
  startDate?: string;
  endDate?: string;
}

export const walletApiService = {
  /**
   * Fetches the authenticated user's wallet summary, materialized balance,
   * total credits/debits, and double-entry consistency audit status.
   */
  async getWalletSummary(): Promise<WalletSummaryResponse> {
    const res = await apiClient.get<ApiResponse<WalletSummaryResponse>>('/wallet');
    return res.data.data;
  },

  /**
   * Fetches paginated, filterable transaction history for the user's ledger account.
   */
  async getTransactionHistory(
    params?: WalletTransactionQueryParams
  ): Promise<WalletTransactionsResponse> {
    const res = await apiClient.get<ApiResponse<WalletTransactionsResponse>>('/wallet/transactions', {
      params,
    });
    return res.data.data;
  },

  /**
   * Fetches detailed double-entry line items for a specific transaction.
   */
  async getTransactionById(id: number): Promise<TransactionDetailResponse> {
    const res = await apiClient.get<ApiResponse<{ transaction: TransactionDetailResponse }>>(
      `/wallet/transactions/${id}`
    );
    return res.data.data.transaction;
  },

  /**
   * Admin-only: Credit virtual funds to a target user's wallet with an audit reason.
   */
  async adminCredit(
    userId: number,
    input: AdminWalletAdjustmentInput
  ): Promise<AdminAdjustmentResult> {
    const res = await apiClient.post<ApiResponse<AdminAdjustmentResult>>(
      `/admin/wallets/${userId}/credit`,
      input
    );
    return res.data.data;
  },

  /**
   * Admin-only: Debit virtual funds from a target user's wallet with an audit reason.
   */
  async adminDebit(
    userId: number,
    input: AdminWalletAdjustmentInput
  ): Promise<AdminAdjustmentResult> {
    const res = await apiClient.post<ApiResponse<AdminAdjustmentResult>>(
      `/admin/wallets/${userId}/debit`,
      input
    );
    return res.data.data;
  },
};
