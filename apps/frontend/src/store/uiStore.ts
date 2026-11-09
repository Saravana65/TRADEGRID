import { create } from 'zustand';

export type ThemeMode = 'system' | 'dark' | 'light';
export type EffectiveTheme = 'dark' | 'light';

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  virtualCashBalance: string;
  setVirtualCashBalance: (balance: string) => void;
  exchangeStatus: 'OPEN' | 'HALTED' | 'CLOSED';
  setExchangeStatus: (status: 'OPEN' | 'HALTED' | 'CLOSED') => void;
  
  // Theme management with automatic browser default detection
  theme: ThemeMode;
  effectiveTheme: EffectiveTheme;
  setTheme: (theme: ThemeMode) => void;
  initTheme: () => () => void;
}

const THEME_STORAGE_KEY = 'tradegrid_theme_mode';

function getSystemPreference(): EffectiveTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function applyThemeToDocument(effective: EffectiveTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (effective === 'dark') {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  } else {
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  }
}

export const useUIStore = create<UIState>((set, get) => {
  const savedTheme = (typeof window !== 'undefined'
    ? (localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode) || 'system'
    : 'system');
  const initialEffective = savedTheme === 'system' ? getSystemPreference() : savedTheme;

  // Apply immediately on store initialization
  applyThemeToDocument(initialEffective);

  return {
    sidebarCollapsed: false,
    toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    virtualCashBalance: '100000.00',
    setVirtualCashBalance: (balance: string) => set({ virtualCashBalance: balance }),
    exchangeStatus: 'OPEN',
    setExchangeStatus: (status) => set({ exchangeStatus: status }),

    theme: savedTheme,
    effectiveTheme: initialEffective,

    setTheme: (newTheme: ThemeMode) => {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      } catch {
        // LocalStorage fallback
      }

      const effective = newTheme === 'system' ? getSystemPreference() : newTheme;
      applyThemeToDocument(effective);
      set({ theme: newTheme, effectiveTheme: effective });
    },

    initTheme: () => {
      if (typeof window === 'undefined') return () => {};

      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleSystemChange = (e: MediaQueryListEvent) => {
        const currentTheme = get().theme;
        if (currentTheme === 'system') {
          const newEffective: EffectiveTheme = e.matches ? 'dark' : 'light';
          applyThemeToDocument(newEffective);
          set({ effectiveTheme: newEffective });
        }
      };

      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    },
  };
});
