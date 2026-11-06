import { create } from 'zustand';
import {
  Instrument,
  MarketQuote,
  Candle,
  CandleInterval,
  MarketOverviewSummary,
  InstrumentFilterQuery,
  DataClassification,
} from '@tradegrid/shared-types';
import { marketApiService } from '../services/market.service';

interface MarketState {
  instruments: Instrument[];
  quotes: Record<string, MarketQuote>;
  quotesList: MarketQuote[];
  summary: MarketOverviewSummary | null;
  gainers: MarketQuote[];
  losers: MarketQuote[];
  mostActive: MarketQuote[];
  sectors: string[];
  exchanges: string[];

  // Selected Stock Details for Detail Page
  selectedInstrument: Instrument | null;
  selectedQuote: MarketQuote | null;
  selectedCandles: Candle[];
  selectedInterval: CandleInterval;

  // Pagination & Loading
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  isLoadingInstruments: boolean;
  isLoadingOverview: boolean;
  isLoadingDetail: boolean;
  isLoadingCandles: boolean;
  error: string | null;

  // Actions
  fetchInstruments: (query?: InstrumentFilterQuery) => Promise<void>;
  fetchMarketOverview: (classification?: DataClassification) => Promise<void>;
  fetchQuotes: (classification?: DataClassification) => Promise<void>;
  fetchInstrumentDetail: (symbol: string) => Promise<void>;
  fetchCandles: (symbol: string, interval?: CandleInterval) => Promise<void>;
  setSelectedInterval: (interval: CandleInterval) => void;
  fetchMetadata: () => Promise<void>;
  clearSelected: () => void;
  clearError: () => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  instruments: [],
  quotes: {},
  quotesList: [],
  summary: null,
  gainers: [],
  losers: [],
  mostActive: [],
  sectors: [],
  exchanges: [],

  selectedInstrument: null,
  selectedQuote: null,
  selectedCandles: [],
  selectedInterval: '1h',

  pagination: {
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 1,
  },
  isLoadingInstruments: false,
  isLoadingOverview: false,
  isLoadingDetail: false,
  isLoadingCandles: false,
  error: null,

  fetchInstruments: async (query?: InstrumentFilterQuery) => {
    set({ isLoadingInstruments: true, error: null });
    try {
      const data = await marketApiService.getInstruments(query);
      set({
        instruments: data.instruments,
        pagination: data.pagination,
        isLoadingInstruments: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to fetch instruments';
      set({ error: message, isLoadingInstruments: false });
    }
  },

  fetchMarketOverview: async (classification?: DataClassification) => {
    set({ isLoadingOverview: true, error: null });
    try {
      const [summary, gainers, losers, mostActive] = await Promise.all([
        marketApiService.getMarketSummary(),
        marketApiService.getGainers(5, classification),
        marketApiService.getLosers(5, classification),
        marketApiService.getMostActive(5, classification),
      ]);

      set({
        summary,
        gainers,
        losers,
        mostActive,
        isLoadingOverview: false,
      });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || 'Failed to fetch market overview';
      set({ error: message, isLoadingOverview: false });
    }
  },

  fetchQuotes: async (classification?: DataClassification) => {
    try {
      const quotesList = await marketApiService.getQuotes(classification);
      const quotesMap: Record<string, MarketQuote> = {};
      quotesList.forEach((q) => {
        quotesMap[q.symbol.toUpperCase()] = q;
      });
      set({ quotes: quotesMap, quotesList });
    } catch (err: any) {
      console.error('Failed to fetch quotes:', err);
    }
  },

  fetchInstrumentDetail: async (symbol: string) => {
    set({ isLoadingDetail: true, error: null });
    try {
      const [instrument, quote] = await Promise.all([
        marketApiService.getInstrumentBySymbol(symbol),
        marketApiService.getQuoteBySymbol(symbol).catch(() => null),
      ]);

      set({
        selectedInstrument: instrument,
        selectedQuote: quote,
        isLoadingDetail: false,
      });

      // Automatically fetch initial candles for the selected interval
      await get().fetchCandles(symbol, get().selectedInterval);
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || `Failed to fetch instrument ${symbol}`;
      set({ error: message, isLoadingDetail: false });
    }
  },

  fetchCandles: async (symbol: string, interval?: CandleInterval) => {
    const targetInterval = interval || get().selectedInterval;
    set({ isLoadingCandles: true, selectedInterval: targetInterval });
    try {
      const response = await marketApiService.getCandles(symbol, targetInterval, 100);
      set({ selectedCandles: response.candles, isLoadingCandles: false });
    } catch (err: any) {
      const message =
        err.response?.data?.error?.message || err.message || `Failed to fetch candles for ${symbol}`;
      set({ error: message, isLoadingCandles: false });
    }
  },

  setSelectedInterval: (interval: CandleInterval) => {
    set({ selectedInterval: interval });
    const selectedInst = get().selectedInstrument;
    if (selectedInst) {
      get().fetchCandles(selectedInst.symbol, interval);
    }
  },

  fetchMetadata: async () => {
    try {
      const [sectors, exchanges] = await Promise.all([
        marketApiService.getSectors(),
        marketApiService.getExchanges(),
      ]);
      set({ sectors, exchanges });
    } catch (err: any) {
      console.error('Failed to fetch metadata:', err);
    }
  },

  clearSelected: () =>
    set({
      selectedInstrument: null,
      selectedQuote: null,
      selectedCandles: [],
    }),

  clearError: () => set({ error: null }),
}));
