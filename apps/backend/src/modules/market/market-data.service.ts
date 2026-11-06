import {
  CandlesResponse,
  DataClassification,
  MarketOverviewSummary,
  MarketQuote,
} from '@tradegrid/shared-types';
import { CandleQueryInput } from '@tradegrid/validation';
import { AppError } from '../../middleware/error.middleware';
import {
  IInstrumentRepository,
  instrumentRepository,
} from './instrument.repository';
import {
  IMarketDataRepository,
  marketDataRepository,
} from './market-data.repository';
import {
  FixtureMarketDataProvider,
  fixtureMarketDataProvider,
} from './fixture-market-data.provider';
import { MarketDataProvider } from './market-data-provider.interface';

export class MarketDataService {
  constructor(
    private readonly marketDataRepo: IMarketDataRepository = marketDataRepository,
    private readonly instrumentRepo: IInstrumentRepository = instrumentRepository,
    private readonly provider: MarketDataProvider = fixtureMarketDataProvider
  ) {}

  /**
   * Retrieves quotes for all instruments, optionally filtered by classification.
   */
  async getAllQuotes(classification?: DataClassification): Promise<MarketQuote[]> {
    return this.marketDataRepo.getAllQuotes(classification);
  }

  /**
   * Retrieves the authoritative latest quote for an individual instrument by symbol.
   */
  async getQuoteBySymbol(symbol: string): Promise<MarketQuote> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol);
    if (!instrument) {
      throw new AppError(
        404,
        'INSTRUMENT_NOT_FOUND',
        `Instrument with symbol '${symbol.toUpperCase()}' not found`
      );
    }

    const quote = await this.marketDataRepo.getQuoteByInstrumentId(instrument.id);
    if (!quote) {
      throw new AppError(
        404,
        'QUOTE_NOT_FOUND',
        `No market quote found for symbol '${symbol.toUpperCase()}'`
      );
    }
    return quote;
  }

  /**
   * Retrieves historical OHLCV candles for a given symbol, interval, and optional date window.
   */
  async getCandles(symbol: string, query: CandleQueryInput): Promise<CandlesResponse> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol);
    if (!instrument) {
      throw new AppError(
        404,
        'INSTRUMENT_NOT_FOUND',
        `Instrument with symbol '${symbol.toUpperCase()}' not found`
      );
    }

    const fromDate = query.from ? new Date(query.from) : undefined;
    const toDate = query.to ? new Date(query.to) : undefined;

    if (fromDate && isNaN(fromDate.getTime())) {
      throw new AppError(400, 'INVALID_DATE', "Invalid 'from' timestamp format");
    }
    if (toDate && isNaN(toDate.getTime())) {
      throw new AppError(400, 'INVALID_DATE', "Invalid 'to' timestamp format");
    }
    if (fromDate && toDate && fromDate > toDate) {
      throw new AppError(400, 'INVALID_DATE_RANGE', "'from' date must be earlier than 'to' date");
    }

    const limit = query.limit || 100;
    const candles = await this.marketDataRepo.getCandles(
      instrument.id,
      query.interval,
      limit,
      fromDate,
      toDate
    );

    return {
      symbol: instrument.symbol,
      instrumentId: instrument.id,
      exchange: instrument.exchange,
      interval: query.interval,
      dataClassification: instrument.dataClassification,
      dataSource:
        instrument.dataClassification === 'REAL'
          ? 'NSE_STATIC_REFERENCE_CATALOG'
          : 'TRADEGRID_SIMULATOR',
      candles,
    };
  }

  /**
   * Retrieves top gaining instruments ordered by positive percentage change descending.
   */
  async getTopGainers(
    limit: number = 5,
    classification?: DataClassification
  ): Promise<MarketQuote[]> {
    return this.marketDataRepo.getTopGainers(limit, classification);
  }

  /**
   * Retrieves top losing instruments ordered by negative percentage change ascending.
   */
  async getTopLosers(
    limit: number = 5,
    classification?: DataClassification
  ): Promise<MarketQuote[]> {
    return this.marketDataRepo.getTopLosers(limit, classification);
  }

  /**
   * Retrieves most active instruments ordered by total trading volume descending.
   */
  async getMostActive(
    limit: number = 5,
    classification?: DataClassification
  ): Promise<MarketQuote[]> {
    return this.marketDataRepo.getMostActive(limit, classification);
  }

  /**
   * Retrieves market overview breadth metrics (advances, declines, total volume, classification counts).
   */
  async getMarketSummary(): Promise<MarketOverviewSummary> {
    return this.marketDataRepo.getMarketSummary();
  }
}

export const marketDataService = new MarketDataService();
