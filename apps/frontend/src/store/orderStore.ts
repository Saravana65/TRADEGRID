import { create } from 'zustand';
import { Order, OrderFilterQuery, CreateOrderRequest } from '@tradegrid/shared-types';
import { orderApiService } from '../services/order.service';

interface OrderState {
  orders: Order[];
  isLoading: boolean;
  isSubmitting: boolean;
  cancellingOrderId: number | null;
  error: string | null;
  successMessage: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  fetchOrders: (query?: OrderFilterQuery) => Promise<void>;
  createOrder: (data: CreateOrderRequest) => Promise<Order>;
  cancelOrder: (orderId: number) => Promise<void>;
  clearError: () => void;
  clearSuccess: () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
  orders: [],
  isLoading: false,
  isSubmitting: false,
  cancellingOrderId: null,
  error: null,
  successMessage: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
  },

  fetchOrders: async (query?: OrderFilterQuery) => {
    set({ isLoading: true, error: null });
    try {
      const data = await orderApiService.getOrders(query);
      set({
        orders: data.items,
        pagination: data.pagination,
        isLoading: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to fetch orders';
      set({ error: message, isLoading: false });
    }
  },

  createOrder: async (data: CreateOrderRequest) => {
    set({ isSubmitting: true, error: null, successMessage: null });
    try {
      const newOrder = await orderApiService.createOrder(data);
      set((state) => ({
        orders: [newOrder, ...state.orders],
        isSubmitting: false,
        successMessage: `${newOrder.side} order for ${newOrder.quantity} shares placed successfully! (Status: ${newOrder.status})`,
      }));
      return newOrder;
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to place order';
      set({ error: message, isSubmitting: false });
      throw err;
    }
  },

  cancelOrder: async (orderId: number) => {
    set({ cancellingOrderId: orderId, error: null });
    try {
      const updatedOrder = await orderApiService.cancelOrder(orderId);
      set((state) => ({
        orders: state.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        cancellingOrderId: null,
        successMessage: `Order #${orderId} was cancelled successfully.`,
      }));
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to cancel order';
      set({ error: message, cancellingOrderId: null });
      throw err;
    }
  },

  clearError: () => set({ error: null }),
  clearSuccess: () => set({ successMessage: null }),
}));
