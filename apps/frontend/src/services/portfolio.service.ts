import { apiClient } from './api';
import { ApiResponse, PortfolioSummaryResponse } from '@tradegrid/shared-types';

export const portfolioApiService = {
  /**
   * Retrieves comprehensive portfolio summary including holdings, cost basis, unrealized/realized P&L, and net worth.
   */
  async getPortfolioSummary(): Promise<PortfolioSummaryResponse> {
    const res = await apiClient.get<ApiResponse<PortfolioSummaryResponse>>('/portfolio/summary');
    return res.data.data;
  },
};
