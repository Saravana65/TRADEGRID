import { apiClient } from './api';
import {
  ApiResponse,
  Instrument,
  MarketQuote,
  CandleInterval,
  CandlesResponse,
  MarketOverviewSummary,
  InstrumentFilterQuery,
  DataClassification,
  InstrumentStatus,
} from '@tradegrid/shared-types';
import {
  CreateInstrumentInput,
  UpdateInstrumentInput,
} from '@tradegrid/validation';

export const marketApiService = {
  /**
   * Lists instruments with pagination, text search, and sector/exchange/classification filters.
   */
  async getInstruments(params?: InstrumentFilterQuery): Promise<{
    instruments: Instrument[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const res = await apiClient.get<
      ApiResponse<{
        instruments: Instrument[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>
    >('/instruments', { params });
    return res.data.data;
  },

  /**
   * Retrieves single instrument metadata by its symbol.
   */
  async getInstrumentBySymbol(symbol: string): Promise<Instrument> {
    const res = await apiClient.get<ApiResponse<{ instrument: Instrument }>>(
      `/instruments/${symbol.toUpperCase()}`
    );
    return res.data.data.instrument;
  },

  /**
   * Retrieves quotes for all instruments in the universe.
   */
  async getQuotes(classification?: DataClassification): Promise<MarketQuote[]> {
    const res = await apiClient.get<ApiResponse<{ quotes: MarketQuote[] }>>('/market/quotes', {
      params: { classification },
    });
    return res.data.data.quotes;
  },

  /**
   * Retrieves authoritative latest quote for a symbol.
   */
  async getQuoteBySymbol(symbol: string): Promise<MarketQuote> {
    const res = await apiClient.get<ApiResponse<{ quote: MarketQuote }>>(
      `/market/quotes/${symbol.toUpperCase()}`
    );
    return res.data.data.quote;
  },

  /**
   * Retrieves historical OHLCV candles for charting.
   */
  async getCandles(
    symbol: string,
    interval: CandleInterval = '1h',
    limit: number = 100
  ): Promise<CandlesResponse> {
    const res = await apiClient.get<ApiResponse<CandlesResponse>>(
      `/market/candles/${symbol.toUpperCase()}`,
      {
        params: { interval, limit },
      }
    );
    return res.data.data;
  },

  /**
   * Retrieves top gaining instruments ordered by positive percentage change.
   */
  async getGainers(limit: number = 5, classification?: DataClassification): Promise<MarketQuote[]> {
    const res = await apiClient.get<ApiResponse<{ gainers: MarketQuote[] }>>('/market/gainers', {
      params: { limit, classification },
    });
    return res.data.data.gainers;
  },

  /**
   * Retrieves top losing instruments ordered by negative percentage change.
   */
  async getLosers(limit: number = 5, classification?: DataClassification): Promise<MarketQuote[]> {
    const res = await apiClient.get<ApiResponse<{ losers: MarketQuote[] }>>('/market/losers', {
      params: { limit, classification },
    });
    return res.data.data.losers;
  },

  /**
   * Retrieves most actively traded instruments by volume.
   */
  async getMostActive(limit: number = 5, classification?: DataClassification): Promise<MarketQuote[]> {
    const res = await apiClient.get<ApiResponse<{ mostActive: MarketQuote[] }>>('/market/most-active', {
      params: { limit, classification },
    });
    return res.data.data.mostActive;
  },

  /**
   * Retrieves market breadth overview summary.
   */
  async getMarketSummary(): Promise<MarketOverviewSummary> {
    const res = await apiClient.get<ApiResponse<{ summary: MarketOverviewSummary }>>(
      '/market/summary'
    );
    return res.data.data.summary;
  },

  /**
   * Retrieves list of all unique sectors.
   */
  async getSectors(): Promise<string[]> {
    const res = await apiClient.get<ApiResponse<{ sectors: string[] }>>('/instruments/meta/sectors');
    return res.data.data.sectors;
  },

  /**
   * Retrieves list of all unique exchanges.
   */
  async getExchanges(): Promise<string[]> {
    const res = await apiClient.get<ApiResponse<{ exchanges: string[] }>>(
      '/instruments/meta/exchanges'
    );
    return res.data.data.exchanges;
  },

  /**
   * Admin-only: Creates a new stock instrument.
   */
  async adminCreateInstrument(input: CreateInstrumentInput): Promise<Instrument> {
    const res = await apiClient.post<ApiResponse<{ instrument: Instrument }>>(
      '/admin/instruments',
      input
    );
    return res.data.data.instrument;
  },

  /**
   * Admin-only: Updates an instrument's profile.
   */
  async adminUpdateInstrument(id: number, input: UpdateInstrumentInput): Promise<Instrument> {
    const res = await apiClient.patch<ApiResponse<{ instrument: Instrument }>>(
      `/admin/instruments/${id}`,
      input
    );
    return res.data.data.instrument;
  },

  /**
   * Admin-only: Toggles an instrument's market trading status.
   */
  async adminUpdateStatus(id: number, status: InstrumentStatus): Promise<Instrument> {
    const res = await apiClient.patch<ApiResponse<{ instrument: Instrument }>>(
      `/admin/instruments/${id}/status`,
      { marketStatus: status }
    );
    return res.data.data.instrument;
  },
};
