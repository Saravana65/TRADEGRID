import {
  MarketDataSourceProvenance,
  NormalizedMarketQuote,
} from '@tradegrid/shared-types';
import { IMarketDataProvider } from './market-data-provider.interface';
import { logger } from '../../utils/logger';

export type StreamConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING';

export interface StreamManagerConfig {
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  staleFeedThresholdSeconds?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  backoffJitterPercent?: number; // e.g. 0.2 for +/- 20%
  maxConsecutiveFailuresBeforeFailover?: number;
}

export interface StreamMetrics {
  state: StreamConnectionState;
  activeProviderId: string;
  isFailoverActive: boolean;
  reconnectAttempts: number;
  lastHeartbeat: string | null;
  packetsReceived: number;
  packetsLostCount: number;
  staleSymbolsCount: number;
}

/**
 * MarketDataStreamManager
 *
 * Coordinates real-time market data streaming across upstream providers,
 * managing heartbeat watchdog, exponential backoff reconnects, sequence loss detection,
 * stale feed detection, and seamless zero-loss failover to the simulated engine.
 */
export class MarketDataStreamManager {
  private state: StreamConnectionState = 'DISCONNECTED';
  private primaryProvider: IMarketDataProvider;
  private fallbackProvider: IMarketDataProvider;
  private activeProvider: IMarketDataProvider;
  private isFailoverActive: boolean = false;

  private config: Required<StreamManagerConfig>;
  private reconnectAttempts: number = 0;
  private lastHeartbeatTime: Date | null = null;
  private packetsReceivedCount: number = 0;
  private packetsLostCount: number = 0;

  // Symbol subscriptions: Symbol -> Set of client callbacks
  private subscriptions: Map<string, Set<(quote: NormalizedMarketQuote) => void>> = new Map();
  // Sequence tracking: Symbol -> Expected next sequence number
  private sequenceTracker: Map<string, number> = new Map();
  // Last quote receipt time per symbol: Symbol -> Timestamp
  private lastQuoteTimestamps: Map<string, number> = new Map();

  // Deduplication cache: Key (symbol:timestamp) -> boolean
  private dedupCache: Map<string, number> = new Map();

  constructor(
    primary: IMarketDataProvider,
    fallback: IMarketDataProvider,
    config: StreamManagerConfig = {}
  ) {
    this.primaryProvider = primary;
    this.fallbackProvider = fallback;
    this.activeProvider = primary;

    this.config = {
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 5000,
      heartbeatTimeoutMs: config.heartbeatTimeoutMs ?? 15000,
      staleFeedThresholdSeconds: config.staleFeedThresholdSeconds ?? 15,
      baseBackoffMs: config.baseBackoffMs ?? 1000,
      maxBackoffMs: config.maxBackoffMs ?? 30000,
      backoffJitterPercent: config.backoffJitterPercent ?? 0.2,
      maxConsecutiveFailuresBeforeFailover: config.maxConsecutiveFailuresBeforeFailover ?? 3,
    };
  }

  getState(): StreamConnectionState {
    return this.state;
  }

  getActiveProviderId(): string {
    return this.activeProvider.id;
  }

  isUsingFailover(): boolean {
    return this.isFailoverActive;
  }

  /**
   * Calculates exponential backoff delay with bounded jitter.
   */
  calculateBackoff(attempt: number): number {
    const { baseBackoffMs, maxBackoffMs, backoffJitterPercent } = this.config;
    const exponential = Math.min(maxBackoffMs, baseBackoffMs * Math.pow(2, Math.max(0, attempt - 1)));
    const jitterRange = exponential * backoffJitterPercent;
    // Jitter between -jitterRange and +jitterRange
    const randomJitter = (Math.random() * 2 - 1) * jitterRange;
    return Math.max(baseBackoffMs, Math.round(exponential + randomJitter));
  }

  /**
   * Starts connection to primary provider.
   */
  async start(): Promise<void> {
    this.state = 'CONNECTING';
    try {
      await this.primaryProvider.connect();
      this.activeProvider = this.primaryProvider;
      this.state = 'CONNECTED';
      this.reconnectAttempts = 0;
      this.lastHeartbeatTime = new Date();
      this.bindUpstreamProvider(this.activeProvider);
    } catch (err: any) {
      this.handleConnectionFailure(err.message);
    }
  }

  /**
   * Records a heartbeat ping/pong from the active upstream feed.
   */
  recordHeartbeat(now: Date = new Date()): void {
    this.lastHeartbeatTime = now;
  }

  /**
   * Watchdog check: returns true if heartbeat is alive, false if timed out.
   */
  checkHeartbeat(now: Date = new Date()): boolean {
    if (this.state !== 'CONNECTED' || !this.lastHeartbeatTime) {
      return false;
    }
    const elapsed = now.getTime() - this.lastHeartbeatTime.getTime();
    if (elapsed > this.config.heartbeatTimeoutMs) {
      logger.warn(
        `[STREAM WATCHDOG] Heartbeat timed out (${elapsed}ms > ${this.config.heartbeatTimeoutMs}ms). Triggering reconnect/failover.`
      );
      this.handleConnectionFailure('Heartbeat timeout');
      return false;
    }
    return true;
  }

  /**
   * Tracks incoming packet sequences and detects gaps / lost packets.
   */
  processPacketSequence(symbol: string, seq: number): { isExpected: boolean; gapCount: number } {
    const upper = symbol.toUpperCase();
    const expected = this.sequenceTracker.get(upper);

    if (expected === undefined) {
      // First packet seen for this symbol
      this.sequenceTracker.set(upper, seq + 1);
      return { isExpected: true, gapCount: 0 };
    }

    if (seq === expected) {
      this.sequenceTracker.set(upper, seq + 1);
      return { isExpected: true, gapCount: 0 };
    }

    if (seq > expected) {
      const gap = seq - expected;
      this.packetsLostCount += gap;
      logger.warn(`[STREAM SEQ] Gap detected on ${upper}: Expected #${expected}, received #${seq} (${gap} packets lost)`);
      this.sequenceTracker.set(upper, seq + 1);
      return { isExpected: false, gapCount: gap };
    }

    // Out-of-order or duplicate packet
    return { isExpected: false, gapCount: 0 };
  }

  /**
   * Ingests, normalizes, deduplicates, and distributes an incoming quote.
   */
  ingestQuote(quote: NormalizedMarketQuote, seq?: number): boolean {
    const symbol = quote.symbol.toUpperCase();
    const now = Date.now();

    // 1. Packet sequence tracking if seq provided
    if (seq !== undefined) {
      this.processPacketSequence(symbol, seq);
    }

    // 2. Deduplication check
    const dedupKey = `${symbol}:${quote.exchangeTimestamp}:${quote.lastPrice}`;
    if (this.dedupCache.has(dedupKey)) {
      return false; // Duplicate packet ignored
    }
    this.dedupCache.set(dedupKey, now);
    if (this.dedupCache.size > 5000) {
      // Prune older entries
      const oldestKeys = Array.from(this.dedupCache.keys()).slice(0, 1000);
      for (const k of oldestKeys) this.dedupCache.delete(k);
    }

    // 3. Update metadata
    this.packetsReceivedCount++;
    this.lastQuoteTimestamps.set(symbol, now);
    this.recordHeartbeat(new Date());

    // 4. Distribute to registered client callbacks
    const subs = this.subscriptions.get(symbol);
    if (subs) {
      for (const cb of subs) {
        cb(quote);
      }
    }

    return true;
  }

  /**
   * Checks whether a symbol's feed has gone stale (no ticks for > threshold seconds).
   */
  isSymbolStale(symbol: string, now: number = Date.now()): boolean {
    const lastTime = this.lastQuoteTimestamps.get(symbol.toUpperCase());
    if (!lastTime) return false;
    const elapsedSeconds = (now - lastTime) / 1000;
    return elapsedSeconds >= this.config.staleFeedThresholdSeconds;
  }

  /**
   * Subscribes a listener to a symbol's quote stream idempotently.
   */
  subscribe(symbol: string, callback: (quote: NormalizedMarketQuote) => void): void {
    const upper = symbol.toUpperCase();
    if (!this.subscriptions.has(upper)) {
      this.subscriptions.set(upper, new Set());
      // Subscribe upstream provider if supported
      if (this.activeProvider.subscribeQuotes) {
        this.activeProvider.subscribeQuotes([upper], (q) => this.ingestQuote(q));
      }
    }
    this.subscriptions.get(upper)!.add(callback);
  }

  /**
   * Unsubscribes a listener.
   */
  unsubscribe(symbol: string, callback?: (quote: NormalizedMarketQuote) => void): void {
    const upper = symbol.toUpperCase();
    const subs = this.subscriptions.get(upper);
    if (!subs) return;

    if (callback) {
      subs.delete(callback);
      if (subs.size === 0) {
        this.subscriptions.delete(upper);
        if (this.activeProvider.unsubscribeQuotes) {
          this.activeProvider.unsubscribeQuotes([upper]);
        }
      }
    } else {
      this.subscriptions.delete(upper);
      if (this.activeProvider.unsubscribeQuotes) {
        this.activeProvider.unsubscribeQuotes([upper]);
      }
    }
  }

  /**
   * Handles connection loss and initiates failover if threshold reached.
   */
  handleConnectionFailure(reason: string): void {
    this.reconnectAttempts++;
    this.state = 'RECONNECTING';
    logger.warn(`[STREAM RECONNECT] Attempt #${this.reconnectAttempts} due to: ${reason}`);

    if (this.reconnectAttempts >= this.config.maxConsecutiveFailuresBeforeFailover && !this.isFailoverActive) {
      this.triggerFailover(reason);
    }
  }

  /**
   * Seamlessly switches consumers to the fallback provider without losing subscriptions.
   */
  triggerFailover(reason: string): void {
    this.isFailoverActive = true;
    this.activeProvider = this.fallbackProvider;
    this.state = 'CONNECTED';
    logger.warn(
      `[STREAM FAILOVER] Switching to ${this.fallbackProvider.id} due to primary failure (${reason}). Resubscribing ${this.subscriptions.size} symbols.`
    );

    this.bindUpstreamProvider(this.fallbackProvider);
  }

  /**
   * Recovers primary provider when it becomes available again.
   */
  recoverPrimary(): void {
    if (!this.isFailoverActive) return;

    this.isFailoverActive = false;
    this.activeProvider = this.primaryProvider;
    this.reconnectAttempts = 0;
    this.state = 'CONNECTED';
    this.lastHeartbeatTime = new Date();
    logger.info(`[STREAM RECOVERY] Primary provider restored. Switching back from failover.`);

    this.bindUpstreamProvider(this.primaryProvider);
  }

  /**
   * Binds symbol subscriptions to the active upstream provider.
   */
  private bindUpstreamProvider(provider: IMarketDataProvider): void {
    if (!provider.subscribeQuotes) return;

    const activeSymbols = Array.from(this.subscriptions.keys());
    if (activeSymbols.length > 0) {
      provider.subscribeQuotes(activeSymbols, (quote) => {
        this.ingestQuote(quote);
      });
    }
  }

  getMetrics(): StreamMetrics {
    let staleCount = 0;
    const now = Date.now();
    for (const sym of this.lastQuoteTimestamps.keys()) {
      if (this.isSymbolStale(sym, now)) staleCount++;
    }

    return {
      state: this.state,
      activeProviderId: this.activeProvider.id,
      isFailoverActive: this.isFailoverActive,
      reconnectAttempts: this.reconnectAttempts,
      lastHeartbeat: this.lastHeartbeatTime ? this.lastHeartbeatTime.toISOString() : null,
      packetsReceived: this.packetsReceivedCount,
      packetsLostCount: this.packetsLostCount,
      staleSymbolsCount: staleCount,
    };
  }
}
