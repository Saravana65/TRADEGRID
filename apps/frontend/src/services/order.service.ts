import { apiClient } from './api';
import {
  ApiResponse,
  Order,
  OrderFilterQuery,
  CreateOrderRequest,
} from '@tradegrid/shared-types';

export const orderApiService = {
  /**
   * Submits a new market or limit order.
   */
  async createOrder(data: CreateOrderRequest): Promise<Order> {
    const res = await apiClient.post<ApiResponse<Order>>('/orders', data);
    return res.data.data;
  },

  /**
   * Retrieves orders for the authenticated user with optional status, side, or instrument filters.
   */
  async getOrders(params?: OrderFilterQuery): Promise<{
    items: Order[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const res = await apiClient.get<
      ApiResponse<{
        items: Order[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>
    >('/orders', { params });
    return res.data.data;
  },

  /**
   * Retrieves a single order by ID for the authenticated owner.
   */
  async getOrderById(id: number): Promise<Order> {
    const res = await apiClient.get<ApiResponse<Order>>(`/orders/${id}`);
    return res.data.data;
  },

  /**
   * Cancels an eligible open order.
   */
  async cancelOrder(id: number): Promise<Order> {
    const res = await apiClient.delete<ApiResponse<Order>>(`/orders/${id}`);
    return res.data.data;
  },
};
