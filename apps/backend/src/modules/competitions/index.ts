import { KnexCompetitionRepository } from './competition.repository';
import { CompetitionMatchingService } from './competition-matching.service';
import { CompetitionLeaderboardService } from './competition-leaderboard.service';
import { CompetitionService } from './competition.service';
import { CompetitionScheduler } from './competition.scheduler';
import { CompetitionController } from './competition.controller';
import { createCompetitionsRouter } from './competition.router';
import { marketDataRepository, instrumentRepository } from '../market';
import { realtimeService } from '../../websocket/realtime.service';

export * from './competition.types';
export * from './competition.repository';
export * from './competition-matching.service';
export * from './competition-leaderboard.service';
export * from './competition.service';
export * from './competition.scheduler';
export * from './competition.controller';
export * from './competition.router';

// Default Module Singletons
export const competitionRepo = new KnexCompetitionRepository();
export const competitionMatchingService = new CompetitionMatchingService(
  competitionRepo,
  realtimeService
);
export const competitionLeaderboardService = new CompetitionLeaderboardService(
  competitionRepo,
  marketDataRepository,
  realtimeService
);
export const competitionService = new CompetitionService(
  competitionRepo,
  marketDataRepository,
  instrumentRepository,
  competitionMatchingService,
  competitionLeaderboardService,
  realtimeService
);
export const competitionScheduler = new CompetitionScheduler(
  competitionRepo,
  competitionMatchingService,
  competitionLeaderboardService,
  realtimeService
);
export const competitionController = new CompetitionController(competitionService);
export const competitionsRouter = createCompetitionsRouter(competitionController);
