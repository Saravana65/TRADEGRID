import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  virtualCashBalance: string;
  setVirtualCashBalance: (balance: string) => void;
  exchangeStatus: 'OPEN' | 'HALTED' | 'CLOSED';
  setExchangeStatus: (status: 'OPEN' | 'HALTED' | 'CLOSED') => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  virtualCashBalance: '100000.00', // Default virtual trading allocation ($100k)
  setVirtualCashBalance: (balance: string) => set({ virtualCashBalance: balance }),
  exchangeStatus: 'OPEN',
  setExchangeStatus: (status) => set({ exchangeStatus: status }),
}));
