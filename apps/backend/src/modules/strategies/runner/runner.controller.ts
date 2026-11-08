import { Request, Response, NextFunction } from 'express';
import {
  activateStrategyJobSchema,
  updateStrategyJobRiskSchema,
} from '@tradegrid/validation';
import { AutomatedStrategyRunnerService } from './runner.service';

export class AutomatedStrategyRunnerController {
  constructor(private readonly service: AutomatedStrategyRunnerService) {}

  /**
   * POST /api/v1/strategies/automated/jobs
   * Activates a validated strategy as a background runner job.
   */
  activateJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const validatedInput = activateStrategyJobSchema.parse(req.body);
      const job = await this.service.activateStrategyJob(userId, validatedInput);

      res.status(201).json({
        success: true,
        data: job,
        message: `Strategy #${job.strategyId} activated as background runner job #${job.jobId}`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/strategies/automated/jobs
   * Lists all background runner jobs belonging to authenticated user.
   */
  listJobs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const jobs = await this.service.listUserJobs(userId);

      res.status(200).json({
        success: true,
        data: jobs,
        message: 'Automated strategy jobs retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/strategies/automated/jobs/:jobId
   * Retrieves single runner job details and audit trail.
   */
  getJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { jobId } = req.params;
      const details = await this.service.getJobDetails(userId, jobId);

      res.status(200).json({
        success: true,
        data: details,
        message: 'Job details retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/strategies/automated/jobs/:jobId/pause
   * Pauses an active strategy runner job.
   */
  pauseJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { jobId } = req.params;
      const job = await this.service.pauseStrategyJob(userId, jobId);

      res.status(200).json({
        success: true,
        data: job,
        message: `Strategy runner job #${jobId} paused`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/strategies/automated/jobs/:jobId/resume
   * Resumes a paused strategy runner job.
   */
  resumeJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { jobId } = req.params;
      const job = await this.service.resumeStrategyJob(userId, jobId);

      res.status(200).json({
        success: true,
        data: job,
        message: `Strategy runner job #${jobId} resumed`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/strategies/automated/jobs/:jobId/stop
   * Stops and terminates a strategy runner job.
   */
  stopJob = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { jobId } = req.params;
      const job = await this.service.stopStrategyJob(userId, jobId);

      res.status(200).json({
        success: true,
        data: job,
        message: `Strategy runner job #${jobId} stopped`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/strategies/automated/jobs/:jobId/orders
   * Lists virtual orders submitted by this strategy job.
   */
  listJobOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const { jobId } = req.params;
      const orders = await this.service.listJobOrders(userId, jobId);

      res.status(200).json({
        success: true,
        data: orders,
        message: 'Strategy orders retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/strategies/automated/kill-switch
   * Emergency Kill Switch: cancels all active strategy runner jobs and flushes open orders.
   */
  emergencyKillSwitch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await this.service.emergencyKillSwitch(userId);

      res.status(200).json({
        success: true,
        data: result,
        message: `Emergency Kill Switch activated: ${result.stoppedJobsCount} jobs stopped, ${result.cancelledOrdersCount} orders cancelled`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}
