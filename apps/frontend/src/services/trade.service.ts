import { apiClient } from './api';
import { ApiResponse, Trade, TradeFilterQuery, OrderBook } from '@tradegrid/shared-types';

export const tradeApiService = {
  /**
   * Retrieves authenticated user's executed trades with optional filtering and pagination.
   */
  async getUserTrades(params?: TradeFilterQuery): Promise<{
    items: Trade[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const res = await apiClient.get<
      ApiResponse<{
        items: Trade[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>
    >('/trades', { params });
    return res.data.data;
  },

  /**
   * Retrieves public recent trade executions for an instrument symbol.
   */
  async getRecentMarketTrades(symbol: string, limit: number = 50): Promise<Trade[]> {
    const res = await apiClient.get<ApiResponse<{ trades: Trade[] }>>(
      `/market/trades/${symbol.toUpperCase()}`,
      { params: { limit } }
    );
    return res.data.data.trades;
  },

  /**
   * Retrieves aggregated Order Book depth (bids and asks ladders) for an instrument symbol.
   */
  async getOrderBook(symbol: string, depth: number = 10): Promise<OrderBook> {
    const res = await apiClient.get<ApiResponse<{ orderBook: OrderBook }>>(
      `/market/orderbook/${symbol.toUpperCase()}`,
      { params: { depth } }
    );
    return res.data.data.orderBook;
  },
};
