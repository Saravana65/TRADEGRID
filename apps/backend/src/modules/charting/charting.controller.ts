import { Request, Response, NextFunction } from 'express';
import {
  saveChartPreferenceSchema,
  volumeProfileQuerySchema,
  calculateIndicatorsSchema,
} from '@tradegrid/validation';
import { ChartingService } from './charting.service';

export class ChartingController {
  constructor(private readonly chartingService: ChartingService) {}

  /**
   * GET /api/v1/charting/preferences
   * Retrieves user chart workspace preferences for a specific symbol or default.
   */
  getPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const symbol = req.query.symbol as string | undefined;
      const preferences = await this.chartingService.getPreferences(userId, symbol);

      res.status(200).json({
        success: true,
        data: preferences,
        message: 'Chart preferences retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/charting/preferences
   * Saves or updates user chart workspace preferences.
   */
  savePreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const validatedInput = saveChartPreferenceSchema.parse(req.body);
      const saved = await this.chartingService.savePreferences(userId, validatedInput);

      res.status(200).json({
        success: true,
        data: saved,
        message: 'Chart preferences saved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/charting/preferences
   * Resets chart workspace preference for a symbol.
   */
  resetPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const symbol = (req.query.symbol as string) || 'DEFAULT';
      const deleted = await this.chartingService.resetPreferences(userId, symbol);

      res.status(200).json({
        success: true,
        data: { deleted, symbol },
        message: 'Chart preferences reset successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/charting/volume-profile
   * Computes derived Volume Profile for a given instrument & interval.
   */
  getVolumeProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedQuery = volumeProfileQuerySchema.parse(req.query);
      const profile = await this.chartingService.getVolumeProfile(validatedQuery);

      res.status(200).json({
        success: true,
        data: profile,
        message: 'Volume profile calculated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/charting/calculate
   * Server-side calculation of indicators for chart rendering.
   */
  calculateIndicators = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedInput = calculateIndicatorsSchema.parse(req.body);
      const result = await this.chartingService.calculateIndicators(validatedInput);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Indicators calculated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}
