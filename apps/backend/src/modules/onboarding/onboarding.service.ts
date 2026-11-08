import { IWalletRepository, walletRepository as defaultWalletRepo } from '../wallet/wallet.repository';
import { IOrderRepository, orderRepository as defaultOrderRepo } from '../orders/order.repository';
import { IStrategyRepository } from '../strategies/strategy.types';
import { strategyRepository as defaultStrategyRepo } from '../strategies/strategy.repository';
import { logger } from '../../utils/logger';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  actionUrl: string;
  isCompleted: boolean;
}

export interface OnboardingChecklist {
  userId: number;
  disclaimerAcknowledged: boolean;
  hasFundedWallet: boolean;
  hasPlacedOrder: boolean;
  hasExecutedTrade: boolean;
  hasCreatedStrategy: boolean;
  completedStepsCount: number;
  totalStepsCount: number;
  progressPercentage: number;
  steps: OnboardingStep[];
}

export class OnboardingService {
  private acknowledgedUsers: Map<number, string> = new Map(); // userId -> ISO timestamp

  constructor(
    private readonly walletRepo: IWalletRepository = defaultWalletRepo,
    private readonly orderRepo: IOrderRepository = defaultOrderRepo,
    private readonly strategyRepo: IStrategyRepository = defaultStrategyRepo
  ) {}

  /**
   * Records user acknowledgment of the virtual trading disclosure.
   */
  async acknowledgeDisclaimer(userId: number): Promise<{ acknowledged: boolean; timestamp: string }> {
    const timestamp = new Date().toISOString();
    this.acknowledgedUsers.set(userId, timestamp);
    logger.info(`[ONBOARDING] User #${userId} acknowledged virtual trading disclaimer at ${timestamp}`);
    return { acknowledged: true, timestamp };
  }

  /**
   * Computes dynamic checklist progress for an authenticated user.
   */
  async getChecklist(userId: number): Promise<OnboardingChecklist> {
    const disclaimerAcknowledged = this.acknowledgedUsers.has(userId);

    // 1. Wallet funding check
    let hasFundedWallet = false;
    try {
      const wallet = await this.walletRepo.findByUserId(userId);
      hasFundedWallet = !!wallet && parseFloat(wallet.available_balance) > 0;
    } catch {
      hasFundedWallet = false;
    }

    // 2. Order placement check
    let hasPlacedOrder = false;
    let hasExecutedTrade = false;
    try {
      const res: any = await this.orderRepo.findByUserId(userId);
      const orders = Array.isArray(res) ? res : res?.orders || [];
      hasPlacedOrder = orders.length > 0;
      hasExecutedTrade = orders.some((o: any) => o.status === 'FILLED' || o.status === 'PARTIALLY_FILLED');
    } catch {
      hasPlacedOrder = false;
      hasExecutedTrade = false;
    }

    // 3. Strategy creation check
    let hasCreatedStrategy = false;
    try {
      const strategies = await this.strategyRepo.findByUserId(userId);
      hasCreatedStrategy = strategies.length > 0;
    } catch {
      hasCreatedStrategy = false;
    }

    const steps: OnboardingStep[] = [
      {
        id: 'DISCLAIMER',
        title: 'Acknowledge Virtual Trading Disclosure',
        description: 'Understand that all capital is 100% virtual and holds zero monetary value.',
        actionUrl: '/api/v1/onboarding/acknowledge-disclaimer',
        isCompleted: disclaimerAcknowledged,
      },
      {
        id: 'WALLET_GRANT',
        title: 'Claim $100,000 Virtual Capital',
        description: 'Verify your virtual wallet grant is deposited and balanced in the ledger.',
        actionUrl: '/wallet',
        isCompleted: hasFundedWallet,
      },
      {
        id: 'EXPLORE_MARKETS',
        title: 'Inspect Live Quotes & L2 Order Book Depth',
        description: 'Browse simulated tickers and Indian equities reference catalog.',
        actionUrl: '/markets',
        isCompleted: hasPlacedOrder || hasCreatedStrategy,
      },
      {
        id: 'FIRST_ORDER',
        title: 'Submit First Virtual Limit/Market Order',
        description: 'Execute your first simulated order through the matching engine.',
        actionUrl: '/trade',
        isCompleted: hasPlacedOrder,
      },
      {
        id: 'QUANT_STRATEGY',
        title: 'Design Custom Strategy in Strategy Studio',
        description: 'Write, validate, and backtest a trading strategy using quantitative DSL.',
        actionUrl: '/strategies',
        isCompleted: hasCreatedStrategy,
      },
    ];

    const completedStepsCount = steps.filter((s) => s.isCompleted).length;
    const totalStepsCount = steps.length;
    const progressPercentage = Math.round((completedStepsCount / totalStepsCount) * 100);

    return {
      userId,
      disclaimerAcknowledged,
      hasFundedWallet,
      hasPlacedOrder,
      hasExecutedTrade,
      hasCreatedStrategy,
      completedStepsCount,
      totalStepsCount,
      progressPercentage,
      steps,
    };
  }

  /**
   * Returns comprehensive onboarding guide and manual overview.
   */
  async getGuide(userId?: number): Promise<{
    title: string;
    version: string;
    disclaimer: string;
    checklist?: OnboardingChecklist;
    keyFeatures: string[];
  }> {
    const checklist = userId ? await this.getChecklist(userId) : undefined;

    return {
      title: 'TRADEGRID Trader Onboarding & User Manual',
      version: '1.0.0-rc.1',
      disclaimer:
        'TRADEGRID IS A 100% VIRTUAL SIMULATOR. ALL QUOTES, CASH BALANCES, EXECUTIONS, AND POSITIONS ARE FICTIONAL AND HAVE ZERO REAL MONETARY VALUE. NO REAL BROKERAGE CONNECTIONS ARE AUTHORIZED.',
      checklist,
      keyFeatures: [
        'Institutional Sub-100ms In-Memory Order Matching',
        'Strict Double-Entry Balanced Ledger Accounting',
        'Real-Time Sequenced Socket.IO Streaming Feeds',
        'Quantitative Strategy Scripting & Anti-Lookahead Backtester',
        'Automated Virtual Strategy Runners with Risk Circuit Breakers',
        'Multiplayer Trading Tournaments & Real-Time Leaderboards',
        '25 Server-Authoritative Gamified Trader Achievements',
        'Global Social Chat, Stock Discussion Rooms & Private DMs',
      ],
    };
  }
}

export const defaultOnboardingService = new OnboardingService();
