import { apiClient } from './api';
import {
  ApiResponse,
  Competition,
  CompetitionParticipant,
  CompetitionPortfolioSummary,
  CompetitionLeaderboardEntry,
  CompetitionOrder,
  CompetitionTrade,
  CompetitionStatus,
} from '@tradegrid/shared-types';
import {
  CreateCompetitionInput,
  JoinCompetitionInput,
  CreateCompetitionOrderInput,
  CompetitionQueryInput,
} from '@tradegrid/validation';

export interface CompetitionsListResponse {
  competitions: Competition[];
  total: number;
}

export interface LeaderboardResponse {
  competitionId: number;
  status: CompetitionStatus;
  isFinal: boolean;
  generatedAt: string;
  leaderboard: CompetitionLeaderboardEntry[];
}

export const competitionApiService = {
  /**
   * Fetches public list of competitions with optional status/visibility/search filtering.
   */
  async listCompetitions(params?: Partial<CompetitionQueryInput>): Promise<CompetitionsListResponse> {
    const res = await apiClient.get<ApiResponse<CompetitionsListResponse>>('/competitions', {
      params,
    });
    return res.data.data;
  },

  /**
   * Fetches all competitions the authenticated user is currently enrolled in or created.
   */
  async getMyCompetitions(): Promise<Competition[]> {
    const res = await apiClient.get<ApiResponse<Competition[]>>('/competitions/me');
    return res.data.data;
  },

  /**
   * Fetches detailed information for a single competition.
   */
  async getCompetition(id: number): Promise<Competition> {
    const res = await apiClient.get<ApiResponse<Competition>>(`/competitions/${id}`);
    return res.data.data;
  },

  /**
   * Fetches the participants list of a competition.
   */
  async listParticipants(id: number): Promise<CompetitionParticipant[]> {
    const res = await apiClient.get<ApiResponse<CompetitionParticipant[]>>(`/competitions/${id}/participants`);
    return res.data.data;
  },

  /**
   * Fetches current or final server-authoritative leaderboard rankings.
   */
  async getLeaderboard(id: number): Promise<LeaderboardResponse> {
    const res = await apiClient.get<ApiResponse<LeaderboardResponse>>(`/competitions/${id}/leaderboard`);
    return res.data.data;
  },

  /**
   * Fetches recent trade tape for a competition.
   */
  async getTrades(id: number): Promise<CompetitionTrade[]> {
    const res = await apiClient.get<ApiResponse<CompetitionTrade[]>>(`/competitions/${id}/trades`);
    return res.data.data;
  },

  /**
   * Creates a new tournament competition.
   */
  async createCompetition(data: CreateCompetitionInput): Promise<Competition> {
    const res = await apiClient.post<ApiResponse<Competition>>('/competitions', data);
    return res.data.data;
  },

  /**
   * Enrolls authenticated user into a competition with isolated starting virtual capital.
   */
  async joinCompetition(id: number, data?: JoinCompetitionInput): Promise<CompetitionParticipant> {
    const res = await apiClient.post<ApiResponse<CompetitionParticipant>>(`/competitions/${id}/join`, data || {});
    return res.data.data;
  },

  /**
   * Unenrolls authenticated user from an upcoming competition before it starts.
   */
  async leaveCompetition(id: number): Promise<{ message: string }> {
    const res = await apiClient.post<ApiResponse<{ message: string }>>(`/competitions/${id}/leave`, {});
    return res.data.data;
  },

  /**
   * Retrieves participant's isolated competition portfolio summary (cash, reserved, holdings, PnL).
   */
  async getPortfolio(id: number): Promise<CompetitionPortfolioSummary> {
    const res = await apiClient.get<ApiResponse<CompetitionPortfolioSummary>>(`/competitions/${id}/portfolio`);
    return res.data.data;
  },

  /**
   * Retrieves participant's active and historical orders in this competition.
   */
  async getOrders(id: number): Promise<CompetitionOrder[]> {
    const res = await apiClient.get<ApiResponse<CompetitionOrder[]>>(`/competitions/${id}/orders`);
    return res.data.data;
  },

  /**
   * Places a limit or market order inside the competition's scoped order book.
   */
  async submitOrder(
    id: number,
    data: CreateCompetitionOrderInput
  ): Promise<{ order: CompetitionOrder; trades: CompetitionTrade[] }> {
    const res = await apiClient.post<ApiResponse<{ order: CompetitionOrder; trades: CompetitionTrade[] }>>(
      `/competitions/${id}/orders`,
      data
    );
    return res.data.data;
  },

  /**
   * Cancels an open resting order inside the competition.
   */
  async cancelOrder(id: number, orderId: number): Promise<CompetitionOrder> {
    const res = await apiClient.post<ApiResponse<CompetitionOrder>>(
      `/competitions/${id}/orders/${orderId}/cancel`,
      {}
    );
    return res.data.data;
  },

  /**
   * Cancels a competition before it starts (creator or admin only).
   */
  async cancelCompetition(id: number, reason?: string): Promise<Competition> {
    const res = await apiClient.post<ApiResponse<Competition>>(`/competitions/${id}/cancel`, { reason });
    return res.data.data;
  },
};
