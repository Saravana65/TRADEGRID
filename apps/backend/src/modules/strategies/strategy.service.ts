import {
  UserStrategy,
  StrategyVersion,
  CreateStrategyRequest,
  UpdateStrategyRequest,
  DSLValidationResult,
} from '@tradegrid/shared-types';
import { IStrategyRepository } from './strategy.types';
import { strategyRepository } from './strategy.repository';
import { DSLValidator } from './dsl/dsl.validator';
import { AppError } from '../../middleware/error.middleware';

export class StrategyService {
  constructor(private readonly repo: IStrategyRepository) {}

  /**
   * Validates raw Strategy DSL source code.
   */
  validateSource(dslCode: string): DSLValidationResult {
    return DSLValidator.validate(dslCode);
  }

  /**
   * Creates a new user strategy, performs server-authoritative validation,
   * and snapshots version 1.
   */
  async createStrategy(userId: number, input: CreateStrategyRequest): Promise<UserStrategy> {
    const validation = this.validateSource(input.dslCode);

    const instrumentSymbol =
      input.instrumentSymbol || validation.inferredInstrument || 'NSE:RELIANCE';
    const timeframe = input.timeframe || validation.inferredTimeframe || '15m';

    const strategy = await this.repo.createStrategy({
      userId,
      name: input.name,
      description: input.description,
      instrumentSymbol,
      timeframe,
      dslCode: input.dslCode,
      isValid: validation.isValid,
      version: 1,
    });

    // Automatically snapshot version 1
    await this.repo.createVersion({
      strategyId: strategy.id,
      userId,
      version: 1,
      dslCode: input.dslCode,
      astSnapshot: validation.ast,
      changelog: 'Initial version',
    });

    return strategy;
  }

  /**
   * Retrieves all strategies belonging to the authenticated user.
   */
  async getStrategies(userId: number): Promise<UserStrategy[]> {
    return this.repo.findByUserId(userId);
  }

  /**
   * Retrieves a strategy by ID with strict user ownership enforcement.
   */
  async getStrategy(userId: number, strategyId: number): Promise<UserStrategy> {
    const strategy = await this.repo.findById(strategyId);
    if (!strategy) {
      throw new AppError(404, 'STRATEGY_NOT_FOUND', 'Strategy not found');
    }
    if (strategy.userId !== userId) {
      throw new AppError(403, 'FORBIDDEN_STRATEGY_ACCESS', 'Unauthorized access to strategy');
    }
    return strategy;
  }

  /**
   * Updates an existing strategy with strict user ownership enforcement.
   * If dslCode is updated, increments version and saves a version snapshot.
   */
  async updateStrategy(
    userId: number,
    strategyId: number,
    input: UpdateStrategyRequest
  ): Promise<UserStrategy> {
    const existing = await this.getStrategy(userId, strategyId);

    const updates: any = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.instrumentSymbol !== undefined) updates.instrumentSymbol = input.instrumentSymbol;
    if (input.timeframe !== undefined) updates.timeframe = input.timeframe;

    let dslChanged = false;
    let validation: DSLValidationResult | undefined;

    if (input.dslCode !== undefined && input.dslCode !== existing.dslCode) {
      dslChanged = true;
      updates.dslCode = input.dslCode;
      validation = this.validateSource(input.dslCode);
      updates.isValid = validation.isValid;
      updates.version = existing.version + 1;

      if (!input.instrumentSymbol && validation.inferredInstrument) {
        updates.instrumentSymbol = validation.inferredInstrument;
      }
      if (!input.timeframe && validation.inferredTimeframe) {
        updates.timeframe = validation.inferredTimeframe;
      }
    }

    const updated = await this.repo.updateStrategy(strategyId, userId, updates);
    if (!updated) {
      throw new AppError(500, 'UPDATE_FAILED', 'Failed to update strategy');
    }

    // Save snapshot if DSL code changed
    if (dslChanged) {
      await this.repo.createVersion({
        strategyId,
        userId,
        version: updated.version,
        dslCode: updated.dslCode,
        astSnapshot: validation?.ast,
        changelog: `Updated to version ${updated.version}`,
      });
    }

    return updated;
  }

  /**
   * Duplicates an existing strategy for the authenticated user.
   */
  async duplicateStrategy(
    userId: number,
    strategyId: number,
    newName?: string
  ): Promise<UserStrategy> {
    const source = await this.getStrategy(userId, strategyId);

    const name = newName || `${source.name} (Copy)`;
    return this.createStrategy(userId, {
      name,
      description: source.description,
      dslCode: source.dslCode,
      instrumentSymbol: source.instrumentSymbol,
      timeframe: source.timeframe,
    });
  }

  /**
   * Deletes a strategy with strict user ownership enforcement.
   */
  async deleteStrategy(userId: number, strategyId: number): Promise<boolean> {
    // Verify existence & ownership
    await this.getStrategy(userId, strategyId);
    return this.repo.deleteStrategy(strategyId, userId);
  }

  /**
   * Creates a dedicated version snapshot with a custom changelog note.
   */
  async createVersion(
    userId: number,
    strategyId: number,
    changelog?: string
  ): Promise<StrategyVersion> {
    const strategy = await this.getStrategy(userId, strategyId);
    const validation = this.validateSource(strategy.dslCode);

    const nextVersion = strategy.version + 1;
    await this.repo.updateStrategy(strategyId, userId, { version: nextVersion });

    return this.repo.createVersion({
      strategyId,
      userId,
      version: nextVersion,
      dslCode: strategy.dslCode,
      astSnapshot: validation.ast,
      changelog: changelog || `Version ${nextVersion}`,
    });
  }

  /**
   * Retrieves version history for a strategy.
   */
  async getVersions(userId: number, strategyId: number): Promise<StrategyVersion[]> {
    await this.getStrategy(userId, strategyId);
    return this.repo.getVersions(strategyId, userId);
  }

  /**
   * Retrieves a specific version of a strategy.
   */
  async getVersion(
    userId: number,
    strategyId: number,
    version: number
  ): Promise<StrategyVersion> {
    await this.getStrategy(userId, strategyId);
    const ver = await this.repo.getVersion(strategyId, version, userId);
    if (!ver) {
      throw new AppError(
        404,
        'VERSION_NOT_FOUND',
        `Version ${version} of strategy #${strategyId} not found`
      );
    }
    return ver;
  }
}

export const defaultStrategyService = new StrategyService(strategyRepository);
