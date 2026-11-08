import {
  NewsCategory,
  NewsImpactDirection,
  NewsSeverity,
  NewsTargetScope,
  NewsStatus,
  CatalystStatus,
  CatalystActionType,
} from '@tradegrid/shared-types';

export interface NewsArticleRecord {
  id: number;
  headline: string;
  summary: string;
  content: string | null;
  category: NewsCategory;
  impact_direction: NewsImpactDirection;
  severity: NewsSeverity;
  target_scope: NewsTargetScope;
  target_id: string | null;
  target_symbol: string | null;
  target_sector: string | null;
  status: NewsStatus;
  is_simulated: boolean;
  created_by: number;
  scheduled_at: Date | string | null;
  published_at: Date | string | null;
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface NewsCatalystRecord {
  id: number;
  news_id: number;
  sentiment_score: string; // -1.0000 to +1.0000
  volatility_factor: string; // 1.0000 to 5.0000
  expected_participation: string; // 1.0000 to 3.0000
  duration_seconds: number;
  decay_rate: string;
  status: CatalystStatus;
  activated_at: Date | string | null;
  decay_starts_at: Date | string | null;
  expired_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface NewsCatalystExecutionRecord {
  id: number;
  catalyst_id: number;
  news_id: number;
  action: CatalystActionType;
  effective_impact: string;
  affected_instruments: string | null; // JSON string
  details: string | null; // JSON string
  created_at: Date | string;
}

export interface CatalystImpactResult {
  sentimentScore: string; // cumulative sentiment
  volatilityMultiplier: string; // cumulative volatility
  expectedParticipation: string;
  effectiveImpact: string; // net composite shock
  activeCatalystsCount: number;
}
