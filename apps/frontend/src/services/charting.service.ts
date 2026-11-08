import { apiClient } from './api';
import {
  ApiResponse,
  UserChartPreference,
  SaveChartPreferenceRequest,
  VolumeProfileData,
  IndicatorCalculationResponse,
  IndicatorConfig,
} from '@tradegrid/shared-types';

export const chartingApiService = {
  /**
   * Retrieves authenticated user's saved chart workspace preferences for a symbol or default.
   */
  async getPreferences(symbol?: string): Promise<UserChartPreference> {
    const res = await apiClient.get<ApiResponse<UserChartPreference>>('/charting/preferences', {
      params: symbol ? { symbol } : {},
    });
    return res.data.data;
  },

  /**
   * Saves or updates authenticated user's workspace preferences.
   */
  async savePreferences(payload: SaveChartPreferenceRequest): Promise<UserChartPreference> {
    const res = await apiClient.post<ApiResponse<UserChartPreference>>(
      '/charting/preferences',
      payload
    );
    return res.data.data;
  },

  /**
   * Resets workspace preference for a symbol.
   */
  async resetPreferences(symbol: string): Promise<boolean> {
    const res = await apiClient.delete<ApiResponse<{ deleted: boolean; symbol: string }>>(
      '/charting/preferences',
      { params: { symbol } }
    );
    return res.data.data.deleted;
  },

  /**
   * Computes derived Volume Profile with POC and Value Area.
   */
  async getVolumeProfile(
    symbol: string,
    interval: string = '1d',
    binsCount: number = 24,
    valueAreaPercent: number = 70
  ): Promise<VolumeProfileData> {
    const res = await apiClient.get<ApiResponse<VolumeProfileData>>('/charting/volume-profile', {
      params: { symbol, interval, binsCount, valueAreaPercent },
    });
    return res.data.data;
  },

  /**
   * Calculates technical indicator series server-side.
   */
  async calculateIndicators(
    symbol: string,
    interval: string,
    indicators: IndicatorConfig[],
    includeVolumeProfile: boolean = false
  ): Promise<IndicatorCalculationResponse> {
    const res = await apiClient.post<ApiResponse<IndicatorCalculationResponse>>(
      '/charting/calculate',
      {
        symbol,
        interval,
        indicators,
        includeVolumeProfile,
      }
    );
    return res.data.data;
  },
};
