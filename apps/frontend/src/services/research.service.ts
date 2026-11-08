import axios from 'axios';
import {
  BacktestResult,
  PortfolioInsight,
  QuantitativeSignal,
  QuantitativeStrategyType,
  AIStrategyComparison,
} from '@tradegrid/shared-types';

const API_BASE = '/api/v1/research';

function getHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface RunBacktestPayload {
  symbol: string;
  interval?: string;
  startDate?: string;
  endDate?: string;
  strategyType: QuantitativeStrategyType;
  strategyParams?: Record<string, any>;
  initialCapital?: number;
  positionSizing?: {
    type: 'FIXED_PERCENT' | 'FIXED_QUANTITY' | 'FIXED_AMOUNT';
    value: number;
  };
  stopLossPercent?: number | null;
  takeProfitPercent?: number | null;
  slippagePercent?: number;
  commissionPercent?: number;
  includeAIAnalysis?: boolean;
}

export interface CompareStrategiesPayload {
  symbol: string;
  interval?: string;
  startDate?: string;
  endDate?: string;
  initialCapital?: number;
  strategies?: QuantitativeStrategyType[];
}

export const researchService = {
  /**
   * Run a server-authoritative backtest
   */
  async runBacktest(payload: RunBacktestPayload): Promise<BacktestResult> {
    const res = await axios.post(`${API_BASE}/backtest`, payload, {
      headers: getHeaders(),
    });
    return res.data.data;
  },

  /**
   * Fetch user's previous backtest runs
   */
  async getUserBacktests(limit: number = 20): Promise<BacktestResult[]> {
    const res = await axios.get(`${API_BASE}/backtests?limit=${limit}`, {
      headers: getHeaders(),
    });
    return res.data.data;
  },

  /**
   * Fetch specific backtest run details
   */
  async getBacktestById(id: number): Promise<BacktestResult> {
    const res = await axios.get(`${API_BASE}/backtests/${id}`, {
      headers: getHeaders(),
    });
    return res.data.data;
  },

  /**
   * Run strategy comparison matrix
   */
  async compareStrategies(payload: CompareStrategiesPayload): Promise<{
    symbol: string;
    results: BacktestResult[];
    aiComparison: AIStrategyComparison;
  }> {
    const res = await axios.post(`${API_BASE}/compare`, payload, {
      headers: getHeaders(),
    });
    return res.data.data;
  },

  /**
   * Fetch real-time quantitative signals
   */
  async getSignals(options?: {
    symbol?: string;
    strategyType?: QuantitativeStrategyType;
    signalType?: 'BUY' | 'SELL' | 'HOLD';
    interval?: string;
    limit?: number;
  }): Promise<QuantitativeSignal[]> {
    const params = new URLSearchParams();
    if (options?.symbol) params.append('symbol', options.symbol);
    if (options?.strategyType) params.append('strategyType', options.strategyType);
    if (options?.signalType) params.append('signalType', options.signalType);
    if (options?.interval) params.append('interval', options.interval);
    if (options?.limit) params.append('limit', String(options.limit));

    const res = await axios.get(`${API_BASE}/signals?${params.toString()}`);
    return res.data.data;
  },

  /**
   * Fetch portfolio insights, concentration risk, and AI health review
   */
  async getPortfolioInsights(): Promise<PortfolioInsight> {
    const res = await axios.get(`${API_BASE}/portfolio-insights`, {
      headers: getHeaders(),
    });
    return res.data.data;
  },
};
