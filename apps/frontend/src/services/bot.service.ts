import { apiClient } from './api';
import {
  ApiResponse,
  Bot,
  BotConfiguration,
  BotInstrument,
  BotExecutionLog,
  BotMetrics,
  BotMetricsSummary,
} from '@tradegrid/shared-types';
import { CreateBotInput, UpdateBotInput } from '@tradegrid/validation';

export const botApiService = {
  /**
   * Fetches all registered market-making and liquidity bots.
   */
  async getBots(): Promise<Bot[]> {
    const res = await apiClient.get<ApiResponse<{ bots: Bot[] }>>('/admin/bots');
    return res.data.data.bots;
  },

  /**
   * Fetches aggregate system-wide bot metrics.
   */
  async getMetrics(): Promise<BotMetricsSummary> {
    const res = await apiClient.get<ApiResponse<{ metrics: BotMetricsSummary }>>('/admin/bots/metrics');
    return res.data.data.metrics;
  },

  /**
   * Fetches single bot details including configuration, instruments, and metrics.
   */
  async getBotById(
    id: number
  ): Promise<{ bot: Bot; configuration: BotConfiguration; instruments: BotInstrument[]; metrics: BotMetrics }> {
    const res = await apiClient.get<
      ApiResponse<{ bot: Bot; configuration: BotConfiguration; instruments: BotInstrument[]; metrics: BotMetrics }>
    >(`/admin/bots/${id}`);
    return res.data.data;
  },

  /**
   * Creates and registers a new autonomous market-making bot.
   */
  async createBot(
    input: CreateBotInput
  ): Promise<{ bot: Bot; configuration: BotConfiguration }> {
    const res = await apiClient.post<ApiResponse<{ bot: Bot; configuration: BotConfiguration }>>(
      '/admin/bots',
      input
    );
    return res.data.data;
  },

  /**
   * Updates an existing bot's metadata or risk configuration.
   */
  async updateBot(
    id: number,
    input: UpdateBotInput
  ): Promise<{ bot: Bot; configuration: BotConfiguration }> {
    const res = await apiClient.put<ApiResponse<{ bot: Bot; configuration: BotConfiguration }>>(
      `/admin/bots/${id}`,
      input
    );
    return res.data.data;
  },

  /**
   * Enables an active or paused bot.
   */
  async enableBot(id: number): Promise<Bot> {
    const res = await apiClient.post<ApiResponse<{ bot: Bot }>>(`/admin/bots/${id}/enable`);
    return res.data.data.bot;
  },

  /**
   * Pauses an active bot.
   */
  async disableBot(id: number): Promise<Bot> {
    const res = await apiClient.post<ApiResponse<{ bot: Bot }>>(`/admin/bots/${id}/disable`);
    return res.data.data.bot;
  },

  /**
   * Emergency kills a bot, cancelling all open orders immediately.
   */
  async killBot(id: number): Promise<Bot> {
    const res = await apiClient.post<ApiResponse<{ bot: Bot }>>(`/admin/bots/${id}/kill`);
    return res.data.data.bot;
  },

  /**
   * Emergency kills ALL active bots in the system and cancels all their resting orders.
   */
  async killAllBots(): Promise<{ killedCount: number }> {
    const res = await apiClient.post<ApiResponse<{ killedCount: number }>>('/admin/bots/kill-all');
    return res.data.data;
  },

  /**
   * Manually triggers an out-of-cycle quote execution for a specific bot.
   */
  async triggerBot(id: number): Promise<{ success: boolean; botId: number }> {
    const res = await apiClient.post<ApiResponse<{ success: boolean; botId: number }>>(
      `/admin/bots/${id}/trigger`
    );
    return res.data.data;
  },

  /**
   * Fetches execution audit logs for a specific bot.
   */
  async getBotLogs(
    id: number,
    params?: { page?: number; limit?: number; action?: string }
  ): Promise<{ logs: BotExecutionLog[]; total: number }> {
    const res = await apiClient.get<ApiResponse<{ logs: BotExecutionLog[]; total: number }>>(
      `/admin/bots/${id}/logs`,
      { params }
    );
    return res.data.data;
  },
};
