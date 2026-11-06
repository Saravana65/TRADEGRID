import {
  Instrument,
  InstrumentFilterQuery,
  InstrumentStatus,
} from '@tradegrid/shared-types';
import { CreateInstrumentInput, UpdateInstrumentInput } from '@tradegrid/validation';
import { AppError } from '../../middleware/error.middleware';
import {
  IInstrumentRepository,
  instrumentRepository,
} from './instrument.repository';
import {
  IMarketDataRepository,
  marketDataRepository,
} from './market-data.repository';

export class InstrumentService {
  constructor(
    private readonly instrumentRepo: IInstrumentRepository = instrumentRepository,
    private readonly marketDataRepo: IMarketDataRepository = marketDataRepository
  ) {}

  /**
   * Lists instruments with pagination, symbol/name search, and sector/exchange/classification filters.
   */
  async listInstruments(query: InstrumentFilterQuery = {}) {
    const { instruments, total } = await this.instrumentRepo.findAll(query);
    const page = query.page || 1;
    const limit = query.limit || 50;

    return {
      instruments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves an instrument by its ticker symbol and optional exchange code.
   */
  async getInstrumentBySymbol(symbol: string, exchange?: string): Promise<Instrument> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol, exchange);
    if (!instrument) {
      throw new AppError(
        404,
        'INSTRUMENT_NOT_FOUND',
        `Instrument with symbol '${symbol.toUpperCase()}' not found`
      );
    }
    return instrument;
  }

  /**
   * Retrieves an instrument by its unique numeric ID.
   */
  async getInstrumentById(id: number): Promise<Instrument> {
    const instrument = await this.instrumentRepo.findById(id);
    if (!instrument) {
      throw new AppError(404, 'INSTRUMENT_NOT_FOUND', `Instrument #${id} not found`);
    }
    return instrument;
  }

  /**
   * Admin-only: Creates a new stock instrument with exchange uniqueness enforcement.
   */
  async createInstrument(input: CreateInstrumentInput): Promise<Instrument> {
    const existing = await this.instrumentRepo.findBySymbol(input.symbol, input.exchange);
    if (existing) {
      throw new AppError(
        409,
        'SYMBOL_ALREADY_EXISTS',
        `Instrument symbol '${input.symbol.toUpperCase()}' already exists on exchange '${input.exchange.toUpperCase()}'`
      );
    }

    const created = await this.instrumentRepo.create(input);

    // Initialize baseline quote snapshot for the new instrument
    const initialPrice = '100.0000';
    await this.marketDataRepo.upsertQuote({
      instrument_id: created.id,
      last_price: initialPrice,
      previous_close: initialPrice,
      open_price: initialPrice,
      high_price: initialPrice,
      low_price: initialPrice,
      volume: '0',
      change_amount: '0.0000',
      change_percent: '0.0000',
      data_source: created.dataClassification === 'REAL' ? 'STATIC_CATALOG' : 'TRADEGRID_SIMULATOR',
      data_classification: created.dataClassification,
      timestamp: new Date(),
    });

    return created;
  }

  /**
   * Admin-only: Updates an instrument's profile metadata.
   */
  async updateInstrument(id: number, input: UpdateInstrumentInput): Promise<Instrument> {
    await this.getInstrumentById(id);
    const updated = await this.instrumentRepo.update(id, input);
    if (!updated) {
      throw new AppError(500, 'UPDATE_FAILED', `Failed to update instrument #${id}`);
    }
    return updated;
  }

  /**
   * Admin-only: Updates an instrument's market trading status (ACTIVE, HALTED, SUSPENDED, DELISTED).
   */
  async updateInstrumentStatus(id: number, status: InstrumentStatus): Promise<Instrument> {
    await this.getInstrumentById(id);
    const updated = await this.instrumentRepo.updateStatus(id, status);
    if (!updated) {
      throw new AppError(500, 'UPDATE_FAILED', `Failed to update status for instrument #${id}`);
    }
    return updated;
  }

  /**
   * Returns list of all unique sectors present in the instrument master.
   */
  async getSectors(): Promise<string[]> {
    return this.instrumentRepo.getDistinctSectors();
  }

  /**
   * Returns list of all unique exchanges present in the instrument master.
   */
  async getExchanges(): Promise<string[]> {
    return this.instrumentRepo.getDistinctExchanges();
  }
}

export const instrumentService = new InstrumentService();
