import { apiClient } from './api';
import {
  ApiResponse,
  UserStrategy,
  StrategyVersion,
  DSLValidationResult,
  CreateStrategyRequest,
  UpdateStrategyRequest,
  StrategyExecution,
  StrategyExecutionResult,
} from '@tradegrid/shared-types';
import { ExecuteStrategyInput } from '@tradegrid/validation';

export const strategyApiService = {
  /**
   * Validates raw Strategy DSL source code against server parser and validator.
   */
  async validateDsl(dslCode: string): Promise<DSLValidationResult> {
    const res = await apiClient.post<ApiResponse<DSLValidationResult>>('/strategies/validate', {
      dslCode,
    });
    return res.data.data;
  },

  /**
   * Creates a new user strategy.
   */
  async createStrategy(payload: CreateStrategyRequest): Promise<UserStrategy> {
    const res = await apiClient.post<ApiResponse<UserStrategy>>('/strategies', payload);
    return res.data.data;
  },

  /**
   * Lists all strategies belonging to authenticated user.
   */
  async getStrategies(): Promise<UserStrategy[]> {
    const res = await apiClient.get<ApiResponse<UserStrategy[]>>('/strategies');
    return res.data.data;
  },

  /**
   * Retrieves single strategy details.
   */
  async getStrategy(id: number): Promise<UserStrategy> {
    const res = await apiClient.get<ApiResponse<UserStrategy>>(`/strategies/${id}`);
    return res.data.data;
  },

  /**
   * Updates an existing strategy. If DSL code changes, server increments version automatically.
   */
  async updateStrategy(id: number, payload: UpdateStrategyRequest): Promise<UserStrategy> {
    const res = await apiClient.put<ApiResponse<UserStrategy>>(`/strategies/${id}`, payload);
    return res.data.data;
  },

  /**
   * Deletes a strategy and cascades its historical versions.
   */
  async deleteStrategy(id: number): Promise<boolean> {
    const res = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/strategies/${id}`);
    return res.data.data.deleted;
  },

  /**
   * Duplicates an existing strategy.
   */
  async duplicateStrategy(id: number): Promise<UserStrategy> {
    const res = await apiClient.post<ApiResponse<UserStrategy>>(`/strategies/${id}/duplicate`);
    return res.data.data;
  },

  /**
   * Lists historical versions of a strategy.
   */
  async getVersions(strategyId: number): Promise<StrategyVersion[]> {
    const res = await apiClient.get<ApiResponse<StrategyVersion[]>>(`/strategies/${strategyId}/versions`);
    return res.data.data;
  },

  /**
   * Retrieves specific version of a strategy.
   */
  async getVersion(strategyId: number, version: number): Promise<StrategyVersion> {
    const res = await apiClient.get<ApiResponse<StrategyVersion>>(
      `/strategies/${strategyId}/versions/${version}`
    );
    return res.data.data;
  },

  /**
   * Manually snapshots a new version.
   */
  async createVersion(strategyId: number, dslCode: string, changelog?: string): Promise<StrategyVersion> {
    const res = await apiClient.post<ApiResponse<StrategyVersion>>(
      `/strategies/${strategyId}/versions`,
      { dslCode, changelog }
    );
    return res.data.data;
  },

  /**
   * Dispatches isolated strategy execution simulation over historical candles.
   */
  async executeStrategy(
    strategyId: number,
    input: ExecuteStrategyInput
  ): Promise<StrategyExecutionResult> {
    const res = await apiClient.post<ApiResponse<StrategyExecutionResult>>(
      `/strategies/${strategyId}/execute`,
      input
    );
    return res.data.data;
  },

  /**
   * Lists historical executions for a strategy.
   */
  async getExecutions(strategyId: number): Promise<StrategyExecution[]> {
    const res = await apiClient.get<ApiResponse<StrategyExecution[]>>(
      `/strategies/${strategyId}/executions`
    );
    return res.data.data;
  },

  /**
   * Retrieves specific execution details and generated signals.
   */
  async getExecution(executionId: string): Promise<StrategyExecutionResult> {
    const res = await apiClient.get<ApiResponse<StrategyExecutionResult>>(
      `/strategies/executions/${executionId}`
    );
    return res.data.data;
  },

  /**
   * Cancels a running execution.
   */
  async cancelExecution(executionId: string): Promise<StrategyExecution> {
    const res = await apiClient.post<ApiResponse<StrategyExecution>>(
      `/strategies/executions/${executionId}/cancel`
    );
    return res.data.data;
  },
};
