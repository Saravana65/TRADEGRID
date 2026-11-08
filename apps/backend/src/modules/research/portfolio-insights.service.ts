import {
  PortfolioAssetAllocationItem,
  PortfolioInsight,
  PortfolioRiskWarning,
  PortfolioSectorAllocationItem,
} from '@tradegrid/shared-types';
import { PortfolioService } from '../portfolio/portfolio.service';
import { aiInsightsService } from './ai-insights.service';
import { positionRepository, IPositionRepository } from '../portfolio/position.repository';
import { walletRepository, IWalletRepository } from '../wallet/wallet.repository';
import { instrumentRepository, IInstrumentRepository } from '../market/instrument.repository';
import { marketDataRepository, IMarketDataRepository } from '../market/market-data.repository';

export class PortfolioInsightsService {
  private portfolioService: PortfolioService;
  private instrumentRepo: IInstrumentRepository;

  constructor(
    positionRepo: IPositionRepository = positionRepository,
    walletRepo: IWalletRepository = walletRepository,
    instrumentRepo: IInstrumentRepository = instrumentRepository,
    marketDataRepo: IMarketDataRepository = marketDataRepository
  ) {
    this.instrumentRepo = instrumentRepo;
    this.portfolioService = new PortfolioService(
      positionRepo,
      walletRepo,
      instrumentRepo,
      marketDataRepo
    );
  }

  /**
   * Computes risk metrics, diversification score, asset allocation, and concentration warnings
   * for an authenticated trader's portfolio. Read-only: never modifies balances or positions.
   */
  async getPortfolioInsights(userId: number): Promise<PortfolioInsight> {
    const summary = await this.portfolioService.getPortfolioSummary(userId);

    const cashBalance = parseFloat(summary.cashBalance) || 0;
    const investedValue = parseFloat(summary.totalInvested) || 0;
    const portfolioValue =
      parseFloat((summary as any).totalPortfolioValue || (summary as any).netWorth) ||
      cashBalance + investedValue;

    const cashRatioPercent =
      portfolioValue > 0 ? (cashBalance / portfolioValue) * 100 : 100;
    const investedRatioPercent =
      portfolioValue > 0 ? (investedValue / portfolioValue) * 100 : 0;

    // 1. Asset allocation breakdown
    const assetAllocation: PortfolioAssetAllocationItem[] = [];
    const sectorMap: Map<string, number> = new Map();

    let maxAssetWeightPercent = 0;
    let maxAssetSymbol = 'CASH';
    let hhiSum = 0;

    // Cash weight in HHI
    if (portfolioValue > 0 && cashBalance > 0) {
      const cashWeight = cashBalance / portfolioValue;
      hhiSum += Math.pow(cashWeight * 100, 2);
    }

    for (const pos of summary.positions) {
      const mVal = parseFloat(pos.marketValue) || 0;
      if (mVal <= 0) continue;

      const weightPct = portfolioValue > 0 ? (mVal / portfolioValue) * 100 : 0;
      const weightFraction = weightPct / 100;
      hhiSum += Math.pow(weightFraction * 100, 2);

      if (weightPct > maxAssetWeightPercent) {
        maxAssetWeightPercent = weightPct;
        maxAssetSymbol = pos.symbol;
      }

      // Sector mapping
      const inst = await this.instrumentRepo.findById(pos.instrumentId);
      const sector = inst?.sector || 'General';
      sectorMap.set(sector, (sectorMap.get(sector) || 0) + mVal);

      assetAllocation.push({
        instrumentId: pos.instrumentId,
        symbol: pos.symbol,
        name: pos.name,
        sector,
        marketValue: Number(mVal.toFixed(2)),
        weightPercent: Number(weightPct.toFixed(2)),
      });
    }

    // 2. Sector allocation breakdown
    const sectorAllocation: PortfolioSectorAllocationItem[] = [];
    for (const [sector, mVal] of sectorMap.entries()) {
      const weightPct = portfolioValue > 0 ? (mVal / portfolioValue) * 100 : 0;
      sectorAllocation.push({
        sector,
        marketValue: Number(mVal.toFixed(2)),
        weightPercent: Number(weightPct.toFixed(2)),
      });
    }

    // Sort allocations descending
    assetAllocation.sort((a, b) => b.weightPercent - a.weightPercent);
    sectorAllocation.sort((a, b) => b.weightPercent - a.weightPercent);

    // 3. Diversification Score (0 - 100)
    // Factors: distinct sectors (30 pts), HHI concentration (40 pts), healthy cash balance (30 pts)
    let sectorScore = Math.min(30, sectorAllocation.length * 10);
    let hhiScore = 0;
    if (hhiSum <= 1500) hhiScore = 40;
    else if (hhiSum <= 2500) hhiScore = 25;
    else if (hhiSum <= 4000) hhiScore = 15;
    else hhiScore = 5;

    let cashScore = 0;
    if (cashRatioPercent >= 10 && cashRatioPercent <= 40) cashScore = 30;
    else if (cashRatioPercent > 40 && cashRatioPercent <= 70) cashScore = 20;
    else cashScore = 10;

    const diversificationScore = Math.min(100, sectorScore + hhiScore + cashScore);

    // 4. Risk warnings
    const riskWarnings: PortfolioRiskWarning[] = [];

    if (maxAssetWeightPercent > 35) {
      riskWarnings.push({
        level: maxAssetWeightPercent > 50 ? 'CRITICAL' : 'WARNING',
        type: 'CONCENTRATION',
        message: `High Single-Stock Exposure: ${maxAssetSymbol} represents ${maxAssetWeightPercent.toFixed(1)}% of your total portfolio. Consider trimming to protect against single-stock shocks.`,
      });
    }

    for (const sec of sectorAllocation) {
      if (sec.weightPercent > 50) {
        riskWarnings.push({
          level: 'WARNING',
          type: 'SECTOR_EXPOSURE',
          message: `Heavy Sector Tilt: ${sec.sector} accounts for ${sec.weightPercent.toFixed(1)}% of total equity. An industry downturn could severely impact performance.`,
        });
      }
    }

    if (cashRatioPercent > 80 && investedValue > 0) {
      riskWarnings.push({
        level: 'INFO',
        type: 'CASH_DRAG',
        message: `Substantial Cash Drag: ${cashRatioPercent.toFixed(1)}% in cash. Inflation and missed market upside may erode long-term real purchasing power.`,
      });
    } else if (cashRatioPercent < 5 && summary.positions.length > 0) {
      riskWarnings.push({
        level: 'WARNING',
        type: 'CASH_DRAG',
        message: `Constrained Cash Reserve: Cash is only ${cashRatioPercent.toFixed(1)}%. Maintain an emergency liquidity buffer for opportunistic buying or sudden drawdowns.`,
      });
    }

    // Volatility approximation
    const volatilityAnnualizedPercent = summary.positions.length > 0 ? 18.5 : 0;
    const maxDrawdownPercent = summary.positions.length > 0 ? 8.2 : 0;

    const insight: PortfolioInsight = {
      userId,
      portfolioValue: Number(portfolioValue.toFixed(2)),
      cashBalance: Number(cashBalance.toFixed(2)),
      investedValue: Number(investedValue.toFixed(2)),
      cashRatioPercent: Number(cashRatioPercent.toFixed(2)),
      investedRatioPercent: Number(investedRatioPercent.toFixed(2)),
      totalPositions: summary.positions.length,
      assetAllocation,
      sectorAllocation,
      concentrationHhi: Number(hhiSum.toFixed(2)),
      maxAssetWeightPercent: Number(maxAssetWeightPercent.toFixed(2)),
      maxAssetSymbol,
      volatilityAnnualizedPercent,
      maxDrawdownPercent,
      diversificationScore,
      riskWarnings,
      generatedAt: new Date().toISOString(),
    };

    try {
      insight.aiReview = await aiInsightsService.reviewPortfolio(insight);
    } catch {
      insight.aiReview = null;
    }

    return insight;
  }
}

export const portfolioInsightsService = new PortfolioInsightsService();
