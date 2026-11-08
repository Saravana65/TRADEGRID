import { FinancialMath } from '../../utils/math';
import {
  NewsArticleRecord,
  NewsCatalystRecord,
  CatalystImpactResult,
} from './news.types';
import { NewsSeverity } from '@tradegrid/shared-types';

export class CatalystEngine {
  private static readonly SEVERITY_WEIGHTS: Record<NewsSeverity, number> = {
    LOW: 0.25,
    MEDIUM: 0.5,
    HIGH: 0.75,
    EXTREME: 1.0,
  };

  /**
   * Calculates the instantaneous decay factor (from 1.0 down to 0.0) based on elapsed time.
   */
  calculateDecayFactor(catalyst: NewsCatalystRecord, now: Date = new Date()): number {
    if (!catalyst.activated_at) return 0;
    const activatedTime = new Date(catalyst.activated_at).getTime();
    const durationMs = catalyst.duration_seconds * 1000;
    const expiryTime = catalyst.expired_at
      ? new Date(catalyst.expired_at).getTime()
      : activatedTime + durationMs;

    const currentTime = now.getTime();

    if (currentTime <= activatedTime) {
      return 1.0;
    }

    if (currentTime >= expiryTime) {
      return 0.0;
    }

    // Peak impact lasts for the first half of the duration
    const decayStartTime = catalyst.decay_starts_at
      ? new Date(catalyst.decay_starts_at).getTime()
      : activatedTime + durationMs / 2;

    if (currentTime <= decayStartTime) {
      return 1.0;
    }

    // Linearly decay from 1.0 to 0.0 between decayStartTime and expiryTime
    const decayDuration = expiryTime - decayStartTime;
    if (decayDuration <= 0) return 0.0;

    const elapsedDecay = currentTime - decayStartTime;
    const decayFactor = 1.0 - elapsedDecay / decayDuration;
    return Math.max(0.0, Math.min(1.0, decayFactor));
  }

  /**
   * Calculates relevance weight between a news catalyst and a specific instrument.
   * - Direct Symbol Match: 1.0
   * - Sector Match: 0.7
   * - Market-Wide: 0.4
   * - Unrelated: 0.0
   */
  calculateRelevance(
    article: NewsArticleRecord,
    targetSymbol?: string,
    targetSector?: string
  ): number {
    if (article.target_scope === 'MARKET') {
      return 0.4;
    }

    if (article.target_scope === 'SECTOR') {
      if (
        targetSector &&
        article.target_sector &&
        article.target_sector.toLowerCase() === targetSector.toLowerCase()
      ) {
        return 0.7;
      }
      return 0.0;
    }

    if (article.target_scope === 'INSTRUMENT') {
      if (
        targetSymbol &&
        article.target_symbol &&
        article.target_symbol.toUpperCase() === targetSymbol.toUpperCase()
      ) {
        return 1.0;
      }
      return 0.0;
    }

    return 0.0;
  }

  /**
   * Computes the mathematical news impact for a single article and catalyst on an instrument:
   * newsImpact = sentiment * severity * relevance * decayFactor(t)
   */
  calculateEffectiveImpact(
    article: NewsArticleRecord,
    catalyst: NewsCatalystRecord,
    targetSymbol?: string,
    targetSector?: string,
    now: Date = new Date()
  ): number {
    const rawSentiment = parseFloat(catalyst.sentiment_score) || 0;
    const severityWeight = CatalystEngine.SEVERITY_WEIGHTS[article.severity] ?? 0.5;
    const relevance = this.calculateRelevance(article, targetSymbol, targetSector);
    const decay = this.calculateDecayFactor(catalyst, now);

    return rawSentiment * severityWeight * relevance * decay;
  }

  /**
   * Computes the composite market catalyst impact on a given instrument from all active catalysts.
   */
  computeCompositeImpact(
    activeCatalysts: { article: NewsArticleRecord; catalyst: NewsCatalystRecord }[],
    targetSymbol?: string,
    targetSector?: string,
    now: Date = new Date()
  ): CatalystImpactResult {
    if (!activeCatalysts || activeCatalysts.length === 0) {
      return {
        sentimentScore: '0.0000',
        volatilityMultiplier: '1.0000',
        expectedParticipation: '1.0000',
        effectiveImpact: '0.0000',
        activeCatalystsCount: 0,
      };
    }

    let netImpact = 0;
    let netSentiment = 0;
    let maxVolatility = 1.0;
    let maxParticipation = 1.0;
    let relevantCount = 0;

    for (const { article, catalyst } of activeCatalysts) {
      const relevance = this.calculateRelevance(article, targetSymbol, targetSector);
      if (relevance <= 0) continue;

      const impact = this.calculateEffectiveImpact(article, catalyst, targetSymbol, targetSector, now);
      const decay = this.calculateDecayFactor(catalyst, now);

      netImpact += impact;
      netSentiment += (parseFloat(catalyst.sentiment_score) || 0) * relevance * decay;

      const volFactor = parseFloat(catalyst.volatility_factor) || 1.0;
      const effectiveVol = 1.0 + (volFactor - 1.0) * relevance * decay;
      if (effectiveVol > maxVolatility) {
        maxVolatility = effectiveVol;
      }

      const partFactor = parseFloat(catalyst.expected_participation) || 1.0;
      const effectivePart = 1.0 + (partFactor - 1.0) * relevance * decay;
      if (effectivePart > maxParticipation) {
        maxParticipation = effectivePart;
      }

      relevantCount++;
    }

    // Clamp sentiment between -1.0000 and +1.0000
    const clampedSentiment = Math.max(-1.0, Math.min(1.0, netSentiment));
    const clampedImpact = Math.max(-1.0, Math.min(1.0, netImpact));

    return {
      sentimentScore: clampedSentiment.toFixed(4),
      volatilityMultiplier: Math.max(1.0, maxVolatility).toFixed(4),
      expectedParticipation: Math.max(1.0, maxParticipation).toFixed(4),
      effectiveImpact: clampedImpact.toFixed(4),
      activeCatalystsCount: relevantCount,
    };
  }

  /**
   * Calculates the remaining decay duration percentage (100% at peak -> 0% at expiry).
   */
  calculateDecayRemainingPercent(catalyst: NewsCatalystRecord, now: Date = new Date()): number {
    return Math.round(this.calculateDecayFactor(catalyst, now) * 100);
  }
}

export const catalystEngine = new CatalystEngine();
