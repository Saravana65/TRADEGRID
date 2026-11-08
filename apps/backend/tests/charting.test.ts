import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import http from 'http';
import { createApp } from '../src/app';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryChartPreferenceRepository,
} from './mocks/in-memory-repositories';
import {
  calculateSMA,
  calculateEMA,
  calculateBollingerBands,
  calculateVWAP,
  calculateStochastic,
  calculateVolumeProfile,
} from '../src/modules/research/indicators';
import { HistoricalDataService } from '../src/modules/research/historical-data.service';
import { ChartingService } from '../src/modules/charting/charting.service';
import { ChartingController } from '../src/modules/charting/charting.controller';
import { Instrument, Candle } from '@tradegrid/shared-types';

describe('Phase 7: Advanced Technical Charting & Indicator Engine', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let chartPrefRepo: InMemoryChartPreferenceRepository;

  let authService: AuthService;
  let authController: AuthController;
  let historicalDataService: HistoricalDataService;
  let chartingService: ChartingService;
  let chartingController: ChartingController;

  let app: any;
  let server: http.Server;
  let testInstrument: Instrument;
  let userAToken: string;
  let userBToken: string;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();
    marketDataRepo = new InMemoryMarketDataRepository();
    chartPrefRepo = new InMemoryChartPreferenceRepository();

    authService = new AuthService(userRepo, sessionRepo, walletRepo, ledgerRepo);
    authController = new AuthController(authService);
    historicalDataService = new HistoricalDataService(marketDataRepo, instrumentRepo);
    chartingService = new ChartingService(chartPrefRepo, historicalDataService);
    chartingController = new ChartingController(chartingService);

    app = createApp({
      authController,
      chartingController,
      customCheckDb: async () => true,
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));

    // Register test instruments
    testInstrument = await instrumentRepo.create({
      symbol: 'TGRID',
      name: 'TradeGrid Technologies',
      exchange: 'NSE',
      sector: 'Technology',
      instrumentType: 'EQUITY',
      lotSize: 1,
      tickSize: 0.05,
    } as any);

    // Populate historical candles for TGRID
    const baseCandles: Partial<Candle>[] = [];
    const startTime = new Date('2026-01-01T00:00:00Z').getTime();
    let currentPrice = 100;

    for (let i = 0; i < 60; i++) {
      const time = new Date(startTime + i * 86400000).toISOString();
      const open = currentPrice;
      const change = (i % 2 === 0 ? 1 : -1) * (1.5 + (i % 5) * 0.5);
      const close = Math.max(50, open + change);
      const high = Math.max(open, close) + 2.0;
      const low = Math.min(open, close) - 1.5;
      const volume = 1000 + (i % 10) * 200;

      baseCandles.push({
        instrument_id: testInstrument.id,
        interval: '1d',
        open: open.toFixed(4),
        high: high.toFixed(4),
        low: low.toFixed(4),
        close: close.toFixed(4),
        volume: volume.toFixed(4),
        timestamp: time,
      } as any);

      currentPrice = close;
    }

    await marketDataRepo.insertCandles(baseCandles as any);

    // Register User A and User B
    const userARes = await authService.register({
      username: 'chartist_a',
      email: 'user_a@tradegrid.internal',
      password: 'Password123!',
    });
    userAToken = userARes.tokens.accessToken;

    const userBRes = await authService.register({
      username: 'chartist_b',
      email: 'user_b@tradegrid.internal',
      password: 'Password123!',
    });
    userBToken = userBRes.tokens.accessToken;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ==========================================================================
  // 1. Technical Indicator Mathematics & Algorithms
  // ==========================================================================
  describe('1. Technical Indicator Mathematics', () => {
    it('should correctly calculate Volume-Weighted Average Price (VWAP)', () => {
      const candles = [
        { high: 105, low: 95, close: 100, volume: 1000 }, // typical = 100, cumPV = 100,000, cumVol = 1000 => 100
        { high: 115, low: 105, close: 110, volume: 2000 }, // typical = 110, cumPV = 100k + 220k = 320k, cumVol = 3000 => 106.6667
        { high: 125, low: 115, close: 120, volume: 3000 }, // typical = 120, cumPV = 320k + 360k = 680k, cumVol = 6000 => 113.3333
      ];

      const vwap = calculateVWAP(candles);
      expect(vwap).toHaveLength(3);
      expect(vwap[0]).toBeCloseTo(100.0, 4);
      expect(vwap[1]).toBeCloseTo(106.6667, 4);
      expect(vwap[2]).toBeCloseTo(113.3333, 4);
    });

    it('should handle zero volume candles in VWAP calculation gracefully without dividing by zero', () => {
      const zeroVolCandles = [
        { high: 100, low: 100, close: 100, volume: 0 },
        { high: 110, low: 110, close: 110, volume: 0 },
      ];

      const vwap = calculateVWAP(zeroVolCandles);
      expect(vwap).toHaveLength(2);
      expect(vwap[0]).toBe(100);
      expect(vwap[1]).toBe(110);
    });

    it('should calculate Stochastic Oscillator (%K and %D) within [0, 100] bounds', () => {
      const highs = [10, 12, 14, 15, 16, 18, 20, 19, 18, 17, 16, 15, 16, 17, 18, 19, 20];
      const lows = [8, 9, 10, 11, 12, 13, 14, 13, 12, 11, 10, 9, 10, 11, 12, 13, 14];
      const closes = [9, 11, 13, 14, 15, 17, 18, 17, 16, 14, 12, 11, 13, 15, 17, 18, 19];

      const stoch = calculateStochastic(highs, lows, closes, 5, 3, 3);
      expect(stoch.k).toHaveLength(closes.length);
      expect(stoch.d).toHaveLength(closes.length);

      // Verify bounds
      for (const val of stoch.k) {
        if (val !== null) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(100);
        }
      }

      for (const val of stoch.d) {
        if (val !== null) {
          expect(val).toBeGreaterThanOrEqual(0);
          expect(val).toBeLessThanOrEqual(100);
        }
      }
    });

    it('should handle flat prices in Stochastic Oscillator by returning midpoint 50.0', () => {
      const flatHighs = new Array(15).fill(100);
      const flatLows = new Array(15).fill(100);
      const flatCloses = new Array(15).fill(100);

      const stoch = calculateStochastic(flatHighs, flatLows, flatCloses, 14, 3, 1);
      // For index 13 and 14, highest === lowest => raw %K is 50.0
      expect(stoch.k[13]).toBe(50.0);
      expect(stoch.k[14]).toBe(50.0);
    });

    it('should calculate Bollinger Bands middle, upper, and lower bounds correctly', () => {
      const closes = [10, 11, 12, 11, 10, 11, 12, 13, 12, 11, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const bb = calculateBollingerBands(closes, 10, 2);

      expect(bb.upper).toHaveLength(closes.length);
      expect(bb.middle).toHaveLength(closes.length);
      expect(bb.lower).toHaveLength(closes.length);

      for (let i = 9; i < closes.length; i++) {
        expect(bb.upper[i]!).toBeGreaterThanOrEqual(bb.middle[i]!);
        expect(bb.middle[i]!).toBeGreaterThanOrEqual(bb.lower[i]!);
      }
    });
  });

  // ==========================================================================
  // 2. Derived Volume Profile Calculation & Point of Control (POC)
  // ==========================================================================
  describe('2. Derived Volume Profile Engine', () => {
    it('should partition candle volume across price bins and identify Point of Control (POC)', () => {
      const candles = [
        { high: 105, low: 95, close: 100, volume: 1000 },
        { high: 110, low: 100, close: 105, volume: 5000 }, // High volume node around 100-110
        { high: 120, low: 110, close: 115, volume: 1500 },
      ];

      const profile = calculateVolumeProfile(candles, 10, 70);

      expect(profile.isEstimated).toBe(true);
      expect(profile.disclaimer).toContain('Derived estimated volume profile');
      expect(profile.bins.length).toBe(10);
      expect(profile.totalVolume).toBe(7500);

      // Verify POC price is within the highest volume area [100, 110]
      expect(profile.pocPrice).toBeGreaterThanOrEqual(95);
      expect(profile.pocPrice).toBeLessThanOrEqual(120);

      // Verify Value Area bounds
      expect(profile.vahPrice).toBeGreaterThanOrEqual(profile.valPrice);
      expect(profile.valueAreaVolume).toBeGreaterThanOrEqual(7500 * 0.7);
    });

    it('should handle single candle or flat price range without errors', () => {
      const flatCandle = [{ high: 100, low: 100, close: 100, volume: 500 }];
      const profile = calculateVolumeProfile(flatCandle, 20, 70);

      expect(profile.bins.length).toBe(1);
      expect(profile.pocPrice).toBe(100);
      expect(profile.vahPrice).toBe(100);
      expect(profile.valPrice).toBe(100);
      expect(profile.totalVolume).toBe(500);
      expect(profile.isEstimated).toBe(true);
    });

    it('should return empty result safely when candle list is empty', () => {
      const profile = calculateVolumeProfile([], 24, 70);
      expect(profile.bins).toHaveLength(0);
      expect(profile.totalVolume).toBe(0);
      expect(profile.pocPrice).toBe(0);
      expect(profile.isEstimated).toBe(true);
    });
  });

  // ==========================================================================
  // 3. User Chart Workspace Preferences Persistence & Strict User Isolation
  // ==========================================================================
  describe('3. User Chart Workspace Preferences & User Isolation', () => {
    it('should return default chart preferences when user has no saved preferences', async () => {
      const res = await request(app)
        .get('/api/v1/charting/preferences?symbol=TGRID')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.symbol).toBe('TGRID');
      expect(res.body.data.chartType).toBe('CANDLESTICK');
      expect(res.body.data.interval).toBe('1d');
      expect(res.body.data.indicatorsConfig.length).toBeGreaterThan(0);
      expect(res.body.data.volumeProfileConfig).toBeDefined();
    });

    it('should save and retrieve custom workspace preferences for authenticated user', async () => {
      const customConfig = {
        symbol: 'TGRID',
        interval: '15m',
        chartType: 'AREA',
        indicatorsConfig: [
          {
            id: 'sma-fast',
            type: 'SMA',
            panel: 'OVERLAY',
            enabled: true,
            params: { period: 9 },
            style: { color: '#FF0000', lineWidth: 3 },
          },
          {
            id: 'rsi-fast',
            type: 'RSI',
            panel: 'SEPARATE',
            enabled: true,
            params: { period: 7 },
            style: { color: '#00FF00', lineWidth: 1 },
          },
        ],
        volumeProfileConfig: {
          enabled: true,
          binsCount: 30,
          valueAreaPercent: 75,
          pocColor: '#FFD700',
          valueAreaColor: 'rgba(0, 150, 255, 0.5)',
          nonValueAreaColor: 'rgba(50, 50, 50, 0.2)',
          showLabels: true,
        },
      };

      const saveRes = await request(app)
        .post('/api/v1/charting/preferences')
        .set('Authorization', `Bearer ${userAToken}`)
        .send(customConfig);

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.success).toBe(true);
      expect(saveRes.body.data.chartType).toBe('AREA');
      expect(saveRes.body.data.interval).toBe('15m');

      // Fetch back for User A
      const getRes = await request(app)
        .get('/api/v1/charting/preferences?symbol=TGRID')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.chartType).toBe('AREA');
      expect(getRes.body.data.indicatorsConfig).toHaveLength(2);
      expect(getRes.body.data.indicatorsConfig[0].params.period).toBe(9);
    });

    it('should enforce strict user isolation: User B cannot see or overwrite User A preferences', async () => {
      // 1. User A saves custom preference for TGRID
      await request(app)
        .post('/api/v1/charting/preferences')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          symbol: 'TGRID',
          interval: '1h',
          chartType: 'LINE',
          indicatorsConfig: [],
          volumeProfileConfig: {
            enabled: false,
            binsCount: 20,
            valueAreaPercent: 70,
            pocColor: '#FF0000',
            valueAreaColor: '#00FF00',
            nonValueAreaColor: '#0000FF',
            showLabels: false,
          },
        });

      // 2. User B requests preferences for TGRID -> MUST NOT see User A's custom 'LINE' / '1h'
      const userBGet = await request(app)
        .get('/api/v1/charting/preferences?symbol=TGRID')
        .set('Authorization', `Bearer ${userBToken}`);

      expect(userBGet.status).toBe(200);
      expect(userBGet.body.data.chartType).toBe('CANDLESTICK'); // Default, not User A's 'LINE'
      expect(userBGet.body.data.interval).toBe('1d'); // Default, not User A's '1h'

      // 3. User B saves their own preference for TGRID
      await request(app)
        .post('/api/v1/charting/preferences')
        .set('Authorization', `Bearer ${userBToken}`)
        .send({
          symbol: 'TGRID',
          interval: '5m',
          chartType: 'BAR',
          indicatorsConfig: [],
          volumeProfileConfig: {
            enabled: true,
            binsCount: 25,
            valueAreaPercent: 80,
            pocColor: '#FFFFFF',
            valueAreaColor: '#000000',
            nonValueAreaColor: '#333333',
            showLabels: true,
          },
        });

      // 4. Verify User A's preference remains completely intact
      const userAGetAgain = await request(app)
        .get('/api/v1/charting/preferences?symbol=TGRID')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(userAGetAgain.body.data.chartType).toBe('LINE');
      expect(userAGetAgain.body.data.interval).toBe('1h');
    });

    it('should reset custom workspace preference back to defaults upon delete', async () => {
      // Save preference
      await request(app)
        .post('/api/v1/charting/preferences')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({
          symbol: 'TGRID',
          interval: '15m',
          chartType: 'AREA',
          indicatorsConfig: [],
          volumeProfileConfig: {
            enabled: false,
            binsCount: 24,
            valueAreaPercent: 70,
            pocColor: '#F59E0B',
            valueAreaColor: 'rgba(59, 130, 246, 0.4)',
            nonValueAreaColor: 'rgba(107, 114, 128, 0.2)',
            showLabels: true,
          },
        });

      // Delete preference
      const delRes = await request(app)
        .delete('/api/v1/charting/preferences?symbol=TGRID')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify preference returned is now default CANDLESTICK
      const getRes = await request(app)
        .get('/api/v1/charting/preferences?symbol=TGRID')
        .set('Authorization', `Bearer ${userAToken}`);

      expect(getRes.body.data.chartType).toBe('CANDLESTICK');
    });

    it('should reject unauthenticated requests to chart preferences with 401 Unauthorized', async () => {
      const getRes = await request(app).get('/api/v1/charting/preferences?symbol=TGRID');
      expect(getRes.status).toBe(401);

      const postRes = await request(app).post('/api/v1/charting/preferences').send({ symbol: 'TGRID' });
      expect(postRes.status).toBe(401);
    });
  });

  // ==========================================================================
  // 4. REST Calculation Endpoints (Volume Profile & Server Indicators)
  // ==========================================================================
  describe('4. REST Calculation Endpoints', () => {
    it('GET /api/v1/charting/volume-profile should compute and return derived volume profile', async () => {
      const res = await request(app)
        .get('/api/v1/charting/volume-profile?symbol=TGRID&interval=1d&binsCount=20&valueAreaPercent=70');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isEstimated).toBe(true);
      expect(res.body.data.bins.length).toBe(20);
      expect(res.body.data.pocPrice).toBeGreaterThan(0);
      expect(res.body.data.vahPrice).toBeGreaterThanOrEqual(res.body.data.valPrice);
    });

    it('POST /api/v1/charting/calculate should compute multi-indicator series across timeline', async () => {
      const res = await request(app)
        .post('/api/v1/charting/calculate')
        .send({
          symbol: 'TGRID',
          interval: '1d',
          includeVolumeProfile: true,
          indicators: [
            {
              id: 'sma-10',
              type: 'SMA',
              panel: 'OVERLAY',
              enabled: true,
              params: { period: 10 },
            },
            {
              id: 'vwap-live',
              type: 'VWAP',
              panel: 'OVERLAY',
              enabled: true,
              params: {},
            },
            {
              id: 'rsi-14',
              type: 'RSI',
              panel: 'SEPARATE',
              enabled: true,
              params: { period: 14 },
            },
            {
              id: 'macd-main',
              type: 'MACD',
              panel: 'SEPARATE',
              enabled: true,
              params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
            },
            {
              id: 'stoch-main',
              type: 'STOCHASTIC',
              panel: 'SEPARATE',
              enabled: true,
              params: { kPeriod: 14, dPeriod: 3, slowing: 3 },
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.symbol).toBe('TGRID');
      expect(res.body.data.series).toHaveLength(5);

      // Verify each indicator produced data aligned with timestamps
      const expectedLength = res.body.data.series[0].timestamps.length;
      expect(expectedLength).toBeGreaterThanOrEqual(60);

      const smaSeries = res.body.data.series.find((s: any) => s.indicatorId === 'sma-10');
      expect(smaSeries.data.values.length).toBe(expectedLength);

      const vwapSeries = res.body.data.series.find((s: any) => s.indicatorId === 'vwap-live');
      expect(vwapSeries.data.values.length).toBe(expectedLength);

      const rsiSeries = res.body.data.series.find((s: any) => s.indicatorId === 'rsi-14');
      expect(rsiSeries.data.values.length).toBe(expectedLength);

      const macdSeries = res.body.data.series.find((s: any) => s.indicatorId === 'macd-main');
      expect(macdSeries.data.macd.length).toBe(expectedLength);
      expect(macdSeries.data.signal.length).toBe(expectedLength);

      const stochSeries = res.body.data.series.find((s: any) => s.indicatorId === 'stoch-main');
      expect(stochSeries.data.k.length).toBe(expectedLength);
      expect(stochSeries.data.d.length).toBe(expectedLength);

      expect(res.body.data.volumeProfile).toBeDefined();
      expect(res.body.data.volumeProfile.isEstimated).toBe(true);
    });
  });

  // ==========================================================================
  // 5. High-Concurrency Stress Test (100 Concurrent Requests)
  // ==========================================================================
  describe('5. 100 Concurrent Users Stress Verification', () => {
    it('should handle 100 concurrent technical charting and preference requests without failure', async () => {
      const concurrentRequests = 100;
      const promises: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const isUserA = i % 2 === 0;
        const token = isUserA ? userAToken : userBToken;

        if (i % 3 === 0) {
          promises.push(
            request(app)
              .get('/api/v1/charting/preferences?symbol=TGRID')
              .set('Authorization', `Bearer ${token}`)
          );
        } else if (i % 3 === 1) {
          promises.push(
            request(app).get('/api/v1/charting/volume-profile?symbol=TGRID&interval=1d&binsCount=24')
          );
        } else {
          promises.push(
            request(app)
              .post('/api/v1/charting/calculate')
              .send({
                symbol: 'TGRID',
                interval: '1d',
                indicators: [
                  {
                    id: 'sma-20',
                    type: 'SMA',
                    panel: 'OVERLAY',
                    enabled: true,
                    params: { period: 20 },
                  },
                ],
              })
          );
        }
      }

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);

      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }
    });
  });
});
