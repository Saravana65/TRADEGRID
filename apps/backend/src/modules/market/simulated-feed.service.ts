import { logger } from '../../utils/logger';
import { instrumentRepository, IInstrumentRepository } from './instrument.repository';
import { marketDataRepository, IMarketDataRepository } from './market-data.repository';
import { realtimeService, IRealtimeService } from '../../websocket/realtime.service';
import { IndianTradingHoursService } from './providers/indian/trading-hours';
import { CandleEngine } from './candle-engine';

export class SimulatedMarketFeedService {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private tickIntervalMs: number = 1500;

  // Active in-memory tracking of high/low/volume per instrument for today's session
  private sessionState: Map<
    number,
    {
      lastPrice: number;
      openPrice: number;
      highPrice: number;
      lowPrice: number;
      volume: number;
      basePrice: number;
    }
  > = new Map();

  constructor(
    private readonly instrumentRepo: IInstrumentRepository = instrumentRepository,
    private readonly marketDataRepo: IMarketDataRepository = marketDataRepository,
    private readonly realtime: IRealtimeService = realtimeService
  ) {}

  /**
   * Starts the continuous realistic simulated market-data feed loop.
   */
  start(intervalMs: number = 1500): void {
    if (this.isRunning) return;
    this.tickIntervalMs = intervalMs;
    this.isRunning = true;

    logger.info(`[SIMULATED FEED] Continuous live market data generator started (tick: ${intervalMs}ms)`);

    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error(`[SIMULATED FEED] Tick error: ${err.message}`);
      });
    }, this.tickIntervalMs);
  }

  /**
   * Stops the continuous market-data generator.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
    logger.info('[SIMULATED FEED] Continuous live market data generator stopped gracefully.');
  }

  /**
   * Generates a single tick across active instruments.
   */
  async tick(): Promise<void> {
    try {
      // 1. Check Indian Market Session
      const isNseOpen = IndianTradingHoursService.isMarketOpen();

      // 2. Fetch all registered instruments
      const { instruments } = await this.instrumentRepo.findAll();
      if (!instruments || instruments.length === 0) return;

      const now = new Date();
      const bucket1m = CandleEngine.getBucketTimestamp(now, '1m');

      for (const inst of instruments) {
        // Authentic NSE stocks: Do NOT fabricate ticks outside exchange hours
        if (inst.dataClassification === 'REAL' && !isNseOpen) {
          continue;
        }

        // Initialize session state if first tick
        let state = this.sessionState.get(inst.id);
        if (!state) {
          const existingQuote = await this.marketDataRepo.getQuoteByInstrumentId(inst.id);
          const initial = existingQuote ? parseFloat(existingQuote.lastPrice) : 100.0;
          state = {
            lastPrice: initial,
            openPrice: initial,
            highPrice: initial,
            lowPrice: initial,
            volume: existingQuote ? parseInt(existingQuote.volume, 10) || 10000 : 10000,
            basePrice: initial,
          };
          this.sessionState.set(inst.id, state);
        }

        // Stochastic micro-fluctuation with slight mean-reversion
        // Random drift ±0.15% per tick
        const meanReversion = (state.basePrice - state.lastPrice) * 0.01;
        const randomShock = (Math.random() - 0.495) * 0.003 * state.lastPrice;
        const priceDelta = meanReversion + randomShock;
        let newPrice = Math.round((state.lastPrice + priceDelta) * 100) / 100;
        if (newPrice <= 0.05) newPrice = 0.05;

        state.lastPrice = newPrice;
        state.highPrice = Math.max(state.highPrice, newPrice);
        state.lowPrice = Math.min(state.lowPrice, newPrice);

        const tickVolume = Math.floor(Math.random() * 80) + 10;
        state.volume += tickVolume;

        const changeAmount = newPrice - state.openPrice;
        const changePercent = state.openPrice > 0 ? (changeAmount / state.openPrice) * 100 : 0;

        // Persist updated quote in DB
        await this.marketDataRepo.upsertQuote({
          instrument_id: inst.id,
          last_price: newPrice.toFixed(4),
          open_price: state.openPrice.toFixed(4),
          high_price: state.highPrice.toFixed(4),
          low_price: state.lowPrice.toFixed(4),
          previous_close: state.openPrice.toFixed(4),
          change_amount: changeAmount.toFixed(4),
          change_percent: changePercent.toFixed(4),
          volume: String(state.volume),
          data_classification: inst.dataClassification,
        });

        // Insert/merge into 1m candle
        await this.marketDataRepo.insertCandles([
          {
            instrument_id: inst.id,
            interval: '1m',
            timestamp: new Date(bucket1m),
            open: newPrice.toFixed(4),
            high: state.highPrice.toFixed(4),
            low: state.lowPrice.toFixed(4),
            close: newPrice.toFixed(4),
            volume: String(state.volume),
            data_classification: inst.dataClassification,
          },
        ]);

        // Broadcast to WebSocket clients subscribed to market:{symbol}
        this.realtime.broadcastMarketPriceUpdate({
          symbol: inst.symbol,
          instrumentId: inst.id,
          lastPrice: newPrice.toFixed(2),
          changeAmount: changeAmount.toFixed(2),
          changePercent: changePercent.toFixed(2),
          volume: state.volume,
          highPrice: state.highPrice.toFixed(2),
          lowPrice: state.lowPrice.toFixed(2),
        });
      }
    } catch (err: any) {
      logger.error(`[SIMULATED FEED] Tick execution failed: ${err.message}`);
    }
  }
}

export const simulatedMarketFeedService = new SimulatedMarketFeedService();
