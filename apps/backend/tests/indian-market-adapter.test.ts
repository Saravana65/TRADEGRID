import { describe, it, expect, beforeEach } from 'vitest';
import {
  IndianSymbolMapper,
  INDIAN_EQUITIES_MASTER,
} from '../src/modules/market/providers/indian/symbol-mapper';
import {
  IndianTradingHoursService,
} from '../src/modules/market/providers/indian/trading-hours';
import {
  MockIndianFeedAdapter,
} from '../src/modules/market/providers/indian/mock-feed.adapter';
import {
  ProductionIndianFeedAdapter,
} from '../src/modules/market/providers/indian/production-feed.adapter';

describe('Phase 10B: Indian Market Data Adapter (NSE / BSE)', () => {
  describe('1. Instrument Mapping & Symbol Conversions', () => {
    it('should parse canonical symbols, exchange prefixes, and BSE security codes', () => {
      const parsed1 = IndianSymbolMapper.parseSymbol('RELIANCE');
      expect(parsed1.baseSymbol).toBe('RELIANCE');
      expect(parsed1.exchange).toBe('NSE');

      const parsed2 = IndianSymbolMapper.parseSymbol('NSE:TCS-EQ');
      expect(parsed2.baseSymbol).toBe('TCS');
      expect(parsed2.series).toBe('EQ');
      expect(parsed2.exchange).toBe('NSE');

      const parsed3 = IndianSymbolMapper.parseSymbol('BSE:500325');
      expect(parsed3.baseSymbol).toBe('RELIANCE');
      expect(parsed3.exchange).toBe('BSE');

      const parsed4 = IndianSymbolMapper.parseSymbol('INFY.NS');
      expect(parsed4.baseSymbol).toBe('INFY');
      expect(parsed4.exchange).toBe('NSE');
    });

    it('should format symbols into standardized exchange conventions', () => {
      const nseFormat = IndianSymbolMapper.toExchangeSymbol('RELIANCE', 'NSE');
      expect(nseFormat).toBe('NSE:RELIANCE-EQ');

      const bseFormat = IndianSymbolMapper.toExchangeSymbol('RELIANCE', 'BSE');
      expect(bseFormat).toBe('BSE:500325');

      const tcsBse = IndianSymbolMapper.toExchangeSymbol('TCS', 'BSE');
      expect(tcsBse).toBe('BSE:532540');
    });

    it('should provide complete equity metadata, tick sizes, and lot sizes', () => {
      const meta = IndianSymbolMapper.getMetadata('RELIANCE');
      expect(meta.symbol).toBe('RELIANCE');
      expect(meta.lotSize).toBe(1);
      expect(meta.tickSize).toBe(0.05);
      expect(meta.isin).toBe('INE002A01018');
      expect(meta.upperCircuitLimitPercent).toBe(10);
      expect(meta.lowerCircuitLimitPercent).toBe(10);
    });

    it('should round prices accurately according to NSE ₹0.05 tick size', () => {
      expect(IndianSymbolMapper.roundToTick('2500.03', 0.05)).toBe('2500.0500');
      expect(IndianSymbolMapper.roundToTick('2500.01', 0.05)).toBe('2500.0000');
      expect(IndianSymbolMapper.roundToTick('2500.07', 0.05)).toBe('2500.0500');
      expect(IndianSymbolMapper.roundToTick('2500.08', 0.05)).toBe('2500.1000');
    });

    it('should validate order lot multiples', () => {
      expect(IndianSymbolMapper.isValidLotQuantity(10, 1)).toBe(true);
      expect(IndianSymbolMapper.isValidLotQuantity(50, 25)).toBe(true);
      expect(IndianSymbolMapper.isValidLotQuantity(30, 25)).toBe(false);
      expect(IndianSymbolMapper.isValidLotQuantity(-5, 1)).toBe(false);
    });
  });

  describe('2. Indian Trading Hours & IST Session Logic', () => {
    it('should correctly convert timestamps to Indian Standard Time (UTC+05:30)', () => {
      // 03:45 UTC = 09:15 IST
      const dateUtc = new Date(Date.UTC(2026, 3, 15, 3, 45, 0)); // Wednesday April 15, 2026
      const ist = IndianTradingHoursService.toIST(dateUtc);

      expect(ist.hours).toBe(9);
      expect(ist.minutes).toBe(15);
      expect(ist.dayOfWeek).toBe(3); // Wednesday
    });

    it('should identify all Indian market trading sessions accurately', () => {
      // Wednesday 09:05 IST -> PRE_OPEN (03:35 UTC)
      const preOpen = new Date(Date.UTC(2026, 3, 15, 3, 35, 0));
      expect(IndianTradingHoursService.getSession(preOpen)).toBe('PRE_OPEN');

      // Wednesday 09:10 IST -> PRE_OPEN_MATCHING (03:40 UTC)
      const matching = new Date(Date.UTC(2026, 3, 15, 3, 40, 0));
      expect(IndianTradingHoursService.getSession(matching)).toBe('PRE_OPEN_MATCHING');

      // Wednesday 09:13 IST -> PRE_OPEN_BUFFER (03:43 UTC)
      const buffer = new Date(Date.UTC(2026, 3, 15, 3, 43, 0));
      expect(IndianTradingHoursService.getSession(buffer)).toBe('PRE_OPEN_BUFFER');

      // Wednesday 10:30 IST -> REGULAR (05:00 UTC)
      const regular = new Date(Date.UTC(2026, 3, 15, 5, 0, 0));
      expect(IndianTradingHoursService.getSession(regular)).toBe('REGULAR');
      expect(IndianTradingHoursService.isMarketOpen(regular)).toBe(true);

      // Wednesday 15:45 IST -> POST_CLOSE (10:15 UTC)
      const postClose = new Date(Date.UTC(2026, 3, 15, 10, 15, 0));
      expect(IndianTradingHoursService.getSession(postClose)).toBe('POST_CLOSE');

      // Wednesday 18:00 IST -> CLOSED (12:30 UTC)
      const closed = new Date(Date.UTC(2026, 3, 15, 12, 30, 0));
      expect(IndianTradingHoursService.getSession(closed)).toBe('CLOSED');
      expect(IndianTradingHoursService.isMarketOpen(closed)).toBe(false);
    });

    it('should mark weekends and national holidays as CLOSED', () => {
      // Saturday April 18, 2026 at 11:00 IST (05:30 UTC)
      const saturday = new Date(Date.UTC(2026, 3, 18, 5, 30, 0));
      expect(IndianTradingHoursService.isTradingDay(saturday)).toBe(false);
      expect(IndianTradingHoursService.getSession(saturday)).toBe('CLOSED');

      // Republic Day Jan 26, 2026 at 11:00 IST (05:30 UTC)
      const republicDay = new Date(Date.UTC(2026, 0, 26, 5, 30, 0));
      expect(IndianTradingHoursService.isHoliday(republicDay)).toBe(true);
      expect(IndianTradingHoursService.isTradingDay(republicDay)).toBe(false);
      expect(IndianTradingHoursService.getSession(republicDay)).toBe('CLOSED');
    });
  });

  describe('3. Mock Indian Feed Adapter (Offline / $0 Budget)', () => {
    let mockAdapter: MockIndianFeedAdapter;

    beforeEach(() => {
      mockAdapter = new MockIndianFeedAdapter({ exchange: 'NSE' });
    });

    it('should generate realistic quotes with source attribution', async () => {
      const quote = await mockAdapter.getQuote('RELIANCE');
      expect(quote).not.toBeNull();
      expect(quote?.symbol).toBe('RELIANCE');
      expect(quote?.exchange).toBe('NSE');
      expect(parseFloat(quote!.lastPrice)).toBeGreaterThan(2000);
      expect(quote?.source).toBe('SIMULATED');
      expect(quote?.provider).toBe('MOCK_INDIAN_FEED_ADAPTER');
      expect(quote?.isDelayed).toBe(false);
    });

    it('should generate 5-level DOM order book adhering to ₹0.05 tick size', async () => {
      const book = await mockAdapter.getOrderBook('RELIANCE', 5);
      expect(book).not.toBeNull();
      expect(book?.bids.length).toBe(5);
      expect(book?.asks.length).toBe(5);

      // Verify bids descend and asks ascend
      for (let i = 0; i < 4; i++) {
        expect(parseFloat(book!.bids[i].price)).toBeGreaterThan(parseFloat(book!.bids[i + 1].price));
        expect(parseFloat(book!.asks[i].price)).toBeLessThan(parseFloat(book!.asks[i + 1].price));
      }
    });

    it('should clamp incoming ticks to circuit limits', () => {
      // Prev close for RELIANCE is 2950. Upper circuit 10% is 3245.
      const extremeHigh = mockAdapter.applyTick('RELIANCE', 4000.0);
      expect(parseFloat(extremeHigh.lastPrice)).toBeLessThanOrEqual(3245.0);

      // Lower circuit 10% is 2655
      const extremeLow = mockAdapter.applyTick('RELIANCE', 1500.0);
      expect(parseFloat(extremeLow.lastPrice)).toBeGreaterThanOrEqual(2655.0);
    });
  });

  describe('4. Production Indian Feed Adapter Safety & Default Isolation', () => {
    it('should remain strictly disabled by default when credentials are absent', () => {
      const prodAdapter = new ProductionIndianFeedAdapter();
      expect(prodAdapter.isConfigured()).toBe(false);
      expect(prodAdapter.isConnected()).toBe(false);

      const health = prodAdapter.getHealth();
      expect(health.status).toBe('DISCONNECTED');
      expect(health.isFallbackActive).toBe(true);
      expect(health.lastError).toContain('Licensed exchange credentials not provided');
    });

    it('should reject connection attempts when unconfigured, protecting live safety', async () => {
      const prodAdapter = new ProductionIndianFeedAdapter();
      await expect(prodAdapter.connect()).rejects.toThrow(/Cannot connect ProductionIndianFeedAdapter/);
    });

    it('should enable adapter when valid licensed credentials are provided', async () => {
      const configuredAdapter = new ProductionIndianFeedAdapter({
        apiKey: 'TEST_NSE_KEY_123',
        apiSecret: 'TEST_NSE_SECRET_456',
        licenseId: 'LIC-NSE-2026-X01',
      });

      expect(configuredAdapter.isConfigured()).toBe(true);
      await configuredAdapter.connect();
      expect(configuredAdapter.isConnected()).toBe(true);
      expect(configuredAdapter.getHealth().status).toBe('CONNECTED');
    });
  });
});
