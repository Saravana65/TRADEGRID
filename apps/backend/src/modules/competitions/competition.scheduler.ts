import { ICompetitionRepository } from './competition.types';
import { CompetitionMatchingService } from './competition-matching.service';
import { CompetitionLeaderboardService } from './competition-leaderboard.service';
import { RealtimeService } from '../../websocket/realtime.service';
import { logger } from '../../utils/logger';

export class CompetitionScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;

  constructor(
    private competitionRepo: ICompetitionRepository,
    private matchingService: CompetitionMatchingService,
    private leaderboardService: CompetitionLeaderboardService,
    private realtimeService?: RealtimeService
  ) {}

  start(intervalMs = 1000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error(`[COMPETITION SCHEDULER] Tick error: ${err.message}`, err);
      });
    }, intervalMs);
    logger.info(`[COMPETITION SCHEDULER] Started competition lifecycle scheduler (interval: ${intervalMs}ms)`);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('[COMPETITION SCHEDULER] Stopped competition lifecycle scheduler');
    }
  }

  async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;

    try {
      const now = new Date();

      // Helper to activate or cancel a competition based on minParticipants
      const attemptStartCompetition = async (comp: any) => {
        const participantCount = await this.competitionRepo.countParticipants(comp.id);
        if (participantCount >= comp.minParticipants) {
          await this.competitionRepo.updateCompetition(comp.id, { status: 'ACTIVE' });
          await this.competitionRepo.createAuditLog(
            comp.id,
            'STARTED',
            { participantCount, startTime: comp.startTime }
          );
          logger.info(`[COMPETITION SCHEDULER] Competition #${comp.id} "${comp.name}" is now ACTIVE (${participantCount} participants)`);
          if (this.realtimeService) {
            this.realtimeService.emitCompetitionStarted?.({
              eventId: `start-${Date.now()}`,
              competitionId: comp.id,
              name: comp.name,
              startTime: comp.startTime,
              endTime: comp.endTime,
              participantCount,
              timestamp: new Date().toISOString(),
            });
          }
        } else {
          await this.competitionRepo.updateCompetition(comp.id, { status: 'CANCELLED' });
          await this.competitionRepo.createAuditLog(
            comp.id,
            'CANCELLED',
            { reason: `Minimum participant count of ${comp.minParticipants} not met (${participantCount} joined)` }
          );
          logger.warn(`[COMPETITION SCHEDULER] Competition #${comp.id} "${comp.name}" CANCELLED (insufficient participants)`);
          if (this.realtimeService) {
            this.realtimeService.emitCompetitionCancelled?.({
              eventId: `cancel-${Date.now()}`,
              competitionId: comp.id,
              name: comp.name,
              reason: `Cancelled: Minimum participant count (${comp.minParticipants}) not reached`,
              timestamp: new Date().toISOString(),
            });
          }
        }
      };

      // 1. Check UPCOMING competitions:
      // - Transition to REGISTRATION_OPEN if registration_start_time has arrived
      // - Or transition directly to ACTIVE if startTime has arrived
      const upcomingRes = await this.competitionRepo.findCompetitions({
        status: 'UPCOMING',
        limit: 50,
      });

      for (const comp of upcomingRes.competitions) {
        if (new Date(comp.startTime) <= now) {
          await attemptStartCompetition(comp);
        } else if (
          comp.registrationStartTime &&
          new Date(comp.registrationStartTime) <= now &&
          (!comp.registrationEndTime || new Date(comp.registrationEndTime) > now)
        ) {
          await this.competitionRepo.updateCompetition(comp.id, { status: 'REGISTRATION_OPEN' });
          logger.info(`[COMPETITION SCHEDULER] Competition #${comp.id} "${comp.name}" status -> REGISTRATION_OPEN`);
        }
      }

      // 2. Check REGISTRATION_OPEN competitions:
      // - If startTime has arrived, start or cancel
      // - Else if registrationEndTime has arrived, close registration
      const regOpenRes = await this.competitionRepo.findCompetitions({
        status: 'REGISTRATION_OPEN',
        limit: 50,
      });

      for (const comp of regOpenRes.competitions) {
        if (new Date(comp.startTime) <= now) {
          await attemptStartCompetition(comp);
        } else if (comp.registrationEndTime && new Date(comp.registrationEndTime) <= now) {
          await this.competitionRepo.updateCompetition(comp.id, { status: 'REGISTRATION_CLOSED' });
          logger.info(`[COMPETITION SCHEDULER] Competition #${comp.id} "${comp.name}" status -> REGISTRATION_CLOSED`);
        }
      }

      // 3. Check REGISTRATION_CLOSED competitions ready to START
      const regClosedRes = await this.competitionRepo.findCompetitions({
        status: 'REGISTRATION_CLOSED',
        limit: 50,
      });

      for (const comp of regClosedRes.competitions) {
        if (new Date(comp.startTime) <= now) {
          await attemptStartCompetition(comp);
        }
      }

      // 4. Check ACTIVE competitions ready to COMPLETE
      const activeRes = await this.competitionRepo.findCompetitions({
        status: 'ACTIVE',
        limit: 50,
      });

      for (const comp of activeRes.competitions) {
        if (new Date(comp.endTime) <= now) {
          // Transition to COMPLETED
          await this.competitionRepo.updateCompetition(comp.id, { status: 'COMPLETED' });

          // Cancel remaining open orders
          const openOrders = await this.competitionRepo.listOrders({
            competitionId: comp.id,
            status: 'OPEN',
            limit: 500,
          });

          for (const ord of openOrders) {
            await this.competitionRepo.updateOrder(ord.id, { status: 'CANCELLED' });
          }

          // Compute final immutable leaderboard snapshot
          const finalLeaderboard = await this.leaderboardService.computeLeaderboard(
            comp.id,
            true // isFinal
          );

          // Clear in-memory order books
          this.matchingService.clearCompetitionBooks(comp.id);

          const winner = finalLeaderboard.length > 0 ? finalLeaderboard[0] : null;

          await this.competitionRepo.createAuditLog(
            comp.id,
            'ENDED',
            {
              winnerUserId: winner?.userId,
              winnerUsername: winner?.username,
              winnerReturn: winner?.totalReturnPercent,
              totalParticipants: finalLeaderboard.length,
            }
          );

          logger.info(
            `[COMPETITION SCHEDULER] Competition #${comp.id} "${comp.name}" COMPLETED! Winner: ${winner?.username || 'None'} (+${winner?.totalReturnPercent || '0'}%)`
          );

          if (this.realtimeService) {
            this.realtimeService.emitCompetitionEnded?.({
              eventId: `end-${Date.now()}`,
              competitionId: comp.id,
              name: comp.name,
              winnerUserId: winner?.userId || null,
              winnerUsername: winner?.username || null,
              winnerReturnPercent: winner?.totalReturnPercent || null,
              endedAt: new Date().toISOString(),
              timestamp: new Date().toISOString(),
            });
          }
        }
      }
    } catch (err: any) {
      logger.error(`[COMPETITION SCHEDULER] Exception during tick: ${err.message}`, err);
    } finally {
      this.isTicking = false;
    }
  }
}
