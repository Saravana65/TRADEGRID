import crypto from 'crypto';
import { logger } from '../utils/logger';

export type BetaFeatureFlag =
  | 'VIRTUAL_TRADING_ONLY'
  | 'INDIAN_EQUITIES_ENABLED'
  | 'STRATEGY_STUDIO_ENABLED'
  | 'BACKGROUND_RUNNERS_ENABLED'
  | 'COMPETITIONS_ENABLED'
  | 'ACHIEVEMENTS_ENABLED'
  | 'GLOBAL_CHAT_ENABLED'
  | 'BETA_FEEDBACK_ENABLED';

export interface BetaFeedbackRecord {
  id: string;
  userId: number;
  category: 'BUG' | 'UX' | 'PERFORMANCE' | 'FEATURE_REQUEST' | 'GENERAL';
  rating: number; // 1 to 5
  message: string;
  diagnostics?: Record<string, any>;
  createdAt: string;
}

export interface BetaStatus {
  version: string;
  releaseChannel: 'beta';
  stage: string;
  isVirtualTradingOnly: true;
  features: Record<BetaFeatureFlag, boolean>;
  rolloutPercentage: number;
  disclaimer: string;
  timestamp: string;
}

export class BetaEnvironmentService {
  private static instance: BetaEnvironmentService;

  public readonly version: string = '1.0.0-rc.1';
  public readonly releaseChannel: 'beta' = 'beta';
  public readonly stage: string = 'Release Candidate 1';
  public readonly isVirtualTradingOnly: true = true; // Hard immutable invariant
  public readonly disclaimer: string =
    'TRADEGRID IS A 100% VIRTUAL SIMULATOR. ALL QUOTES, CASH BALANCES, EXECUTIONS, AND POSITIONS ARE FICTIONAL AND HAVE ZERO REAL MONETARY VALUE. NO REAL BROKERAGE CONNECTIONS ARE AUTHORIZED.';

  private rolloutPercentage: number = 100; // Default 100% of beta users
  private features: Record<BetaFeatureFlag, boolean> = {
    VIRTUAL_TRADING_ONLY: true,
    INDIAN_EQUITIES_ENABLED: true,
    STRATEGY_STUDIO_ENABLED: true,
    BACKGROUND_RUNNERS_ENABLED: true,
    COMPETITIONS_ENABLED: true,
    ACHIEVEMENTS_ENABLED: true,
    GLOBAL_CHAT_ENABLED: true,
    BETA_FEEDBACK_ENABLED: true,
  };

  private feedbackStore: BetaFeedbackRecord[] = [];

  constructor() {
    logger.info(`[BETA ENVIRONMENT] Initialized version ${this.version} (${this.stage})`);
  }

  public static getInstance(): BetaEnvironmentService {
    if (!BetaEnvironmentService.instance) {
      BetaEnvironmentService.instance = new BetaEnvironmentService();
    }
    return BetaEnvironmentService.instance;
  }

  /**
   * Evaluates whether a feature is enabled for a given user according to flags and cohort rollout.
   */
  public isFeatureEnabled(flag: BetaFeatureFlag, userId?: number): boolean {
    // VIRTUAL_TRADING_ONLY can NEVER be disabled under any circumstance
    if (flag === 'VIRTUAL_TRADING_ONLY') {
      return true;
    }

    const flagEnabled = this.features[flag] ?? false;
    if (!flagEnabled) {
      return false;
    }

    if (this.rolloutPercentage >= 100 || userId === undefined) {
      return flagEnabled;
    }

    // Deterministic cohort assignment based on userId hash
    const hash = crypto.createHash('sha256').update(`${flag}:${userId}`).digest('hex');
    const userCohort = parseInt(hash.substring(0, 4), 16) % 100;
    return userCohort < this.rolloutPercentage;
  }

  /**
   * Sets feature flag status (enforces immutable virtual trading only).
   */
  public setFeatureFlag(flag: BetaFeatureFlag, enabled: boolean): void {
    if (flag === 'VIRTUAL_TRADING_ONLY' && !enabled) {
      throw new Error('ILLEGAL OPERATION: VIRTUAL_TRADING_ONLY is an immutable safety invariant and cannot be disabled.');
    }
    this.features[flag] = enabled;
    logger.info(`[BETA ENVIRONMENT] Feature flag ${flag} set to ${enabled}`);
  }

  /**
   * Configures cohort rollout percentage (0-100).
   */
  public setRolloutPercentage(percentage: number): void {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }
    this.rolloutPercentage = percentage;
    logger.info(`[BETA ENVIRONMENT] Cohort rollout percentage set to ${percentage}%`);
  }

  /**
   * Returns complete beta status and configuration.
   */
  public getBetaStatus(): BetaStatus {
    return {
      version: this.version,
      releaseChannel: this.releaseChannel,
      stage: this.stage,
      isVirtualTradingOnly: this.isVirtualTradingOnly,
      features: { ...this.features },
      rolloutPercentage: this.rolloutPercentage,
      disclaimer: this.disclaimer,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Records user feedback submitted during the controlled beta.
   */
  public submitFeedback(
    userId: number,
    input: {
      category: 'BUG' | 'UX' | 'PERFORMANCE' | 'FEATURE_REQUEST' | 'GENERAL';
      rating: number;
      message: string;
      diagnostics?: Record<string, any>;
    }
  ): BetaFeedbackRecord {
    if (!this.features.BETA_FEEDBACK_ENABLED) {
      throw new Error('Beta feedback collection is currently paused');
    }

    if (input.rating < 1 || input.rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    if (!input.message || input.message.trim().length === 0) {
      throw new Error('Feedback message cannot be empty');
    }

    const record: BetaFeedbackRecord = {
      id: `FB-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId,
      category: input.category,
      rating: Math.floor(input.rating),
      message: input.message.trim(),
      diagnostics: input.diagnostics,
      createdAt: new Date().toISOString(),
    };

    this.feedbackStore.unshift(record);
    logger.info(`[BETA FEEDBACK] Received feedback #${record.id} from User #${userId} (${input.category}, ${input.rating}★)`);
    return record;
  }

  /**
   * Lists stored beta feedback for admin diagnostics.
   */
  public listFeedback(limit: number = 50): BetaFeedbackRecord[] {
    return this.feedbackStore.slice(0, limit);
  }

  /**
   * Clears in-memory feedback store (for testing purposes).
   */
  public clearFeedback(): void {
    this.feedbackStore = [];
  }
}

export const betaEnvironmentService = BetaEnvironmentService.getInstance();
