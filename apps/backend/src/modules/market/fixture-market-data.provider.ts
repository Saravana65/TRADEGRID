import {
  Candle,
  CandleInterval,
  DataClassification,
  MarketQuote,
} from '@tradegrid/shared-types';
import { MarketDataProvider } from './market-data-provider.interface';
import {
  IMarketDataRepository,
  marketDataRepository,
} from './market-data.repository';
import {
  IInstrumentRepository,
  instrumentRepository,
} from './instrument.repository';

/**
 * Fixture Market Data Provider
 *
 * Deterministic market data adapter serving simulated TradeGrid fixtures
 * and static catalog reference data for real NSE stocks.
 */
export class FixtureMarketDataProvider implements MarketDataProvider {
  readonly name = 'TRADEGRID_FIXTURE_PROVIDER';
  readonly classification: DataClassification = 'SIMULATED';
  readonly supportedExchanges = ['TRADEGRID', 'NSE', 'BSE'];

  constructor(
    private readonly marketDataRepo: IMarketDataRepository = marketDataRepository,
    private readonly instrumentRepo: IInstrumentRepository = instrumentRepository
  ) {}

  async getQuote(symbol: string, exchange?: string): Promise<MarketQuote | null> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol, exchange);
    if (!instrument) {
      return null;
    }
    return this.marketDataRepo.getQuoteByInstrumentId(instrument.id);
  }

  async getQuotes(symbols?: string[]): Promise<MarketQuote[]> {
    if (!symbols || symbols.length === 0) {
      return this.marketDataRepo.getAllQuotes();
    }

    const quotes: MarketQuote[] = [];
    for (const sym of symbols) {
      const quote = await this.getQuote(sym);
      if (quote) {
        quotes.push(quote);
      }
    }
    return quotes;
  }

  async getCandles(
    symbol: string,
    interval: CandleInterval,
    limit: number = 100,
    from?: Date,
    to?: Date
  ): Promise<Candle[]> {
    const instrument = await this.instrumentRepo.findBySymbol(symbol);
    if (!instrument) {
      return [];
    }

    return this.marketDataRepo.getCandles(instrument.id, interval, limit, from, to);
  }
}

export const fixtureMarketDataProvider = new FixtureMarketDataProvider();
