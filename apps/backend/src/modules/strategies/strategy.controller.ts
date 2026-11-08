import { Request, Response, NextFunction } from 'express';
import {
  createStrategySchema,
  updateStrategySchema,
  validateStrategySourceSchema,
  duplicateStrategySchema,
  createStrategyVersionSchema,
} from '@tradegrid/validation';
import { StrategyService } from './strategy.service';

export class StrategyController {
  constructor(private readonly service: StrategyService) {}

  /**
   * POST /api/v1/strategies/validate
   * Validates raw Strategy DSL source and returns syntax diagnostics.
   */
  validateDsl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validatedInput = validateStrategySourceSchema.parse(req.body);
      const result = this.service.validateSource(validatedInput.dslCode);

      res.status(200).json({
        success: true,
        data: result,
        message: result.isValid
          ? 'Strategy DSL code is valid'
          : `Validation failed with ${result.errors.length} error(s)`,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/strategies
   * Creates a new user strategy.
   */
  createStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const validatedInput = createStrategySchema.parse(req.body);
      const strategy = await this.service.createStrategy(userId, validatedInput);

      res.status(201).json({
        success: true,
        data: strategy,
        message: 'Strategy created successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/strategies
   * Lists all strategies belonging to authenticated user.
   */
  listStrategies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategies = await this.service.getStrategies(userId);

      res.status(200).json({
        success: true,
        data: strategies,
        message: 'Strategies retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/strategies/:id
   * Retrieves single strategy details.
   */
  getStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategyId = parseInt(req.params.id, 10);
      const strategy = await this.service.getStrategy(userId, strategyId);

      res.status(200).json({
        success: true,
        data: strategy,
        message: 'Strategy retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * PUT /api/v1/strategies/:id
   * Updates an existing strategy.
   */
  updateStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategyId = parseInt(req.params.id, 10);
      const validatedInput = updateStrategySchema.parse(req.body);
      const updated = await this.service.updateStrategy(userId, strategyId, validatedInput);

      res.status(200).json({
        success: true,
        data: updated,
        message: 'Strategy updated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * DELETE /api/v1/strategies/:id
   * Deletes a strategy.
   */
  deleteStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategyId = parseInt(req.params.id, 10);
      const deleted = await this.service.deleteStrategy(userId, strategyId);

      res.status(200).json({
        success: true,
        data: { id: strategyId, deleted },
        message: 'Strategy deleted successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/strategies/:id/duplicate
   * Duplicates a strategy.
   */
  duplicateStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategyId = parseInt(req.params.id, 10);
      const validatedInput = duplicateStrategySchema.parse(req.body);
      const duplicated = await this.service.duplicateStrategy(
        userId,
        strategyId,
        validatedInput.newName
      );

      res.status(201).json({
        success: true,
        data: duplicated,
        message: 'Strategy duplicated successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * POST /api/v1/strategies/:id/versions
   * Creates a dedicated version snapshot.
   */
  createVersion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategyId = parseInt(req.params.id, 10);
      const validatedInput = createStrategyVersionSchema.parse(req.body);
      const version = await this.service.createVersion(
        userId,
        strategyId,
        validatedInput.changelog
      );

      res.status(201).json({
        success: true,
        data: version,
        message: 'Strategy version checkpoint created successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/strategies/:id/versions
   * Lists version history.
   */
  listVersions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategyId = parseInt(req.params.id, 10);
      const versions = await this.service.getVersions(userId, strategyId);

      res.status(200).json({
        success: true,
        data: versions,
        message: 'Strategy versions retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };

  /**
   * GET /api/v1/strategies/:id/versions/:version
   * Retrieves specific version snapshot.
   */
  getVersion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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

      const strategyId = parseInt(req.params.id, 10);
      const versionNumber = parseInt(req.params.version, 10);
      const version = await this.service.getVersion(userId, strategyId, versionNumber);

      res.status(200).json({
        success: true,
        data: version,
        message: 'Strategy version retrieved successfully',
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  };
}
