import {
  ChartType,
  IndicatorConfig,
  VolumeProfileConfig,
  UserChartPreference,
  VolumeProfileData,
  IndicatorCalculationResponse,
  IndicatorCalculationSeries,
} from '@tradegrid/shared-types';
import {
  SaveChartPreferenceInput,
  CalculateIndicatorsInput,
  VolumeProfileQueryInput,
} from '@tradegrid/validation';
import { IChartPreferenceRepository } from './charting.types';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateVWAP,
  calculateStochastic,
  calculateVolumeProfile,
} from '../research/indicators';
import { HistoricalDataService } from '../research/historical-data.service';

export class ChartingService {
  constructor(
    private readonly chartPrefRepo: IChartPreferenceRepository,
    private readonly historicalDataService: HistoricalDataService
  ) {}

  getDefaultConfiguration(symbol: string = 'DEFAULT'): UserChartPreference {
    const defaultIndicators: IndicatorConfig[] = [
      {
        id: 'sma-20',
        type: 'SMA',
        panel: 'OVERLAY',
        enabled: true,
        params: { period: 20 },
        style: { color: '#3B82F6', lineWidth: 2 },
      },
      {
        id: 'ema-50',
        type: 'EMA',
        panel: 'OVERLAY',
        enabled: false,
        params: { period: 50 },
        style: { color: '#F59E0B', lineWidth: 2 },
      },
      {
        id: 'bb-20',
        type: 'BOLLINGER_BANDS',
        panel: 'OVERLAY',
        enabled: false,
        params: { period: 20, multiplier: 2 },
        style: {
          color: '#8B5CF6',
          lineWidth: 1,
          secondaryColor: '#6366F1',
          tertiaryColor: '#4F46E5',
        },
      },
      {
        id: 'vwap-session',
        type: 'VWAP',
        panel: 'OVERLAY',
        enabled: false,
        params: {},
        style: { color: '#10B981', lineWidth: 2 },
      },
      {
        id: 'rsi-14',
        type: 'RSI',
        panel: 'SEPARATE',
        enabled: false,
        params: { period: 14 },
        style: { color: '#EC4899', lineWidth: 2 },
      },
      {
        id: 'macd-standard',
        type: 'MACD',
        panel: 'SEPARATE',
        enabled: false,
        params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
        style: {
          color: '#06B6D4',
          secondaryColor: '#F97316',
          histogramUpColor: '#10B981',
          histogramDownColor: '#EF4444',
          lineWidth: 2,
        },
      },
      {
        id: 'stoch-14-3-3',
        type: 'STOCHASTIC',
        panel: 'SEPARATE',
        enabled: false,
        params: { kPeriod: 14, dPeriod: 3, slowing: 3 },
        style: {
          color: '#3B82F6',
          secondaryColor: '#EF4444',
          lineWidth: 2,
        },
      },
    ];

    const defaultVolumeProfile: VolumeProfileConfig = {
      enabled: false,
      binsCount: 24,
      valueAreaPercent: 70,
      pocColor: '#F59E0B',
      valueAreaColor: 'rgba(59, 130, 246, 0.4)',
      nonValueAreaColor: 'rgba(107, 114, 128, 0.2)',
      showLabels: true,
    };

    return {
      userId: 0,
      symbol,
      interval: '1d',
      chartType: 'CANDLESTICK',
      indicatorsConfig: defaultIndicators,
      volumeProfileConfig: defaultVolumeProfile,
    };
  }

  async getPreferences(userId: number, symbol?: string): Promise<UserChartPreference> {
    const targetSymbol = (symbol || 'DEFAULT').toUpperCase();

    // 1. Check for symbol-specific preference
    const specific = await this.chartPrefRepo.findByUserAndSymbol(userId, targetSymbol);
    if (specific) {
      return specific;
    }

    // 2. Check for user DEFAULT preference
    if (targetSymbol !== 'DEFAULT') {
      const userDefault = await this.chartPrefRepo.findDefaultByUser(userId);
      if (userDefault) {
        return {
          ...userDefault,
          symbol: targetSymbol,
        };
      }
    }

    // 3. Fallback to system default template
    const defaultTemplate = this.getDefaultConfiguration(targetSymbol);
    return {
      ...defaultTemplate,
      userId,
    };
  }

  async savePreferences(
    userId: number,
    input: SaveChartPreferenceInput
  ): Promise<UserChartPreference> {
    const symbol = (input.symbol || 'DEFAULT').toUpperCase();

    const preference: UserChartPreference = {
      userId,
      symbol,
      interval: input.interval,
      chartType: input.chartType as ChartType,
      indicatorsConfig: input.indicatorsConfig,
      volumeProfileConfig: input.volumeProfileConfig,
    };

    return this.chartPrefRepo.savePreference(preference);
  }

  async resetPreferences(userId: number, symbol: string): Promise<boolean> {
    const targetSymbol = (symbol || 'DEFAULT').toUpperCase();
    return this.chartPrefRepo.deletePreference(userId, targetSymbol);
  }

  private toNumericCandles(
    candles: any[]
  ): { high: number; low: number; close: number; volume: number; timestamp: string }[] {
    return candles.map((c) => ({
      high: typeof c.high === 'number' ? c.high : parseFloat(c.high || '0'),
      low: typeof c.low === 'number' ? c.low : parseFloat(c.low || '0'),
      close: typeof c.close === 'number' ? c.close : parseFloat(c.close || '0'),
      volume: typeof c.volume === 'number' ? c.volume : parseFloat(c.volume || '0'),
      timestamp: typeof c.timestamp === 'string' ? c.timestamp : new Date(c.timestamp).toISOString(),
    }));
  }

  async getVolumeProfile(query: VolumeProfileQueryInput): Promise<VolumeProfileData> {
    const dataset = await this.historicalDataService.getHistoricalCandles({
      symbol: query.symbol,
      interval: query.interval as any,
    });

    const numericCandles = this.toNumericCandles(dataset.candles);
    return calculateVolumeProfile(numericCandles, query.binsCount, query.valueAreaPercent);
  }

  async calculateIndicators(input: CalculateIndicatorsInput): Promise<IndicatorCalculationResponse> {
    const dataset = await this.historicalDataService.getHistoricalCandles({
      symbol: input.symbol,
      interval: input.interval as any,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const candles = this.toNumericCandles(dataset.candles);

    const timestamps = candles.map((c) => c.timestamp);
    const closes = candles.map((c) => c.close);
    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);


    const series: IndicatorCalculationSeries[] = [];

    for (const ind of input.indicators) {
      if (!ind.enabled) continue;

      const p = ind.params || {};

      switch (ind.type) {
        case 'SMA': {
          const period = p.period || 20;
          const values = calculateSMA(closes, period);
          series.push({
            indicatorId: ind.id,
            type: 'SMA',
            timestamps,
            data: { values },
          });
          break;
        }

        case 'EMA': {
          const period = p.period || 50;
          const values = calculateEMA(closes, period);
          series.push({
            indicatorId: ind.id,
            type: 'EMA',
            timestamps,
            data: { values },
          });
          break;
        }

        case 'BOLLINGER_BANDS': {
          const period = p.period || 20;
          const multiplier = p.multiplier || 2;
          const bb = calculateBollingerBands(closes, period, multiplier);
          series.push({
            indicatorId: ind.id,
            type: 'BOLLINGER_BANDS',
            timestamps,
            data: {
              upper: bb.upper,
              middle: bb.middle,
              lower: bb.lower,
            },
          });
          break;
        }

        case 'VWAP': {
          const vwap = calculateVWAP(candles);
          series.push({
            indicatorId: ind.id,
            type: 'VWAP',
            timestamps,
            data: { values: vwap },
          });
          break;
        }

        case 'RSI': {
          const period = p.period || 14;
          const values = calculateRSI(closes, period);
          series.push({
            indicatorId: ind.id,
            type: 'RSI',
            timestamps,
            data: { values },
          });
          break;
        }

        case 'MACD': {
          const fast = p.fastPeriod || 12;
          const slow = p.slowPeriod || 26;
          const sig = p.signalPeriod || 9;
          const macd = calculateMACD(closes, fast, slow, sig);
          series.push({
            indicatorId: ind.id,
            type: 'MACD',
            timestamps,
            data: {
              macd: macd.macd,
              signal: macd.signal,
              histogram: macd.histogram,
            },
          });
          break;
        }

        case 'STOCHASTIC': {
          const kPeriod = p.kPeriod || 14;
          const dPeriod = p.dPeriod || 3;
          const slowing = p.slowing || 3;
          const stoch = calculateStochastic(highs, lows, closes, kPeriod, dPeriod, slowing);
          series.push({
            indicatorId: ind.id,
            type: 'STOCHASTIC',
            timestamps,
            data: {
              k: stoch.k,
              d: stoch.d,
            },
          });
          break;
        }
      }
    }

    let volumeProfile: VolumeProfileData | undefined = undefined;
    if (input.includeVolumeProfile) {
      volumeProfile = calculateVolumeProfile(candles);
    }

    return {
      symbol: input.symbol.toUpperCase(),
      interval: input.interval,
      series,
      volumeProfile,
    };
  }
}
