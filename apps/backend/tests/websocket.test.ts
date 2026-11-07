import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { io as Client, Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../src/app';
import { initWebSocket, closeWebSocket, socketMetrics } from '../src/websocket/socket';
import { realtimeService } from '../src/websocket/realtime.service';
import { generateTokens } from '../src/utils/jwt';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
  InMemoryInstrumentRepository,
  InMemoryMarketDataRepository,
  InMemoryOrderRepository,
  InMemoryTradeRepository,
  InMemoryPositionRepository,
} from './mocks/in-memory-repositories';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { OrderReservationService } from '../src/modules/orders/order-reservation.service';
import { SettlementService } from '../src/modules/matching/settlement.service';
import { MatchingEngine } from '../src/modules/matching/matching-engine';
import { OrderService } from '../src/modules/orders/order.service';
import { InstrumentService } from '../src/modules/market/instrument.service';
import {
  OrderBookDepthUpdateEvent,
  OrderBookSnapshotEvent,
  TradeTapeUpdateEvent,
  PrivateTradeExecutedEvent,
  OrderLifecycleEvent,
  MarketPriceUpdateEvent,
  PortfolioUpdatedEvent,
} from '@tradegrid/shared-types';

describe('Phase 5A: Real-Time WebSocket Infrastructure', () => {
  let server: http.Server;
  let serverUrl: string;
  let activeClients: ClientSocket[] = [];

  // Domain repositories & services
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let instrumentRepo: InMemoryInstrumentRepository;
  let marketDataRepo: InMemoryMarketDataRepository;
  let orderRepo: InMemoryOrderRepository;
  let tradeRepo: InMemoryTradeRepository;
  let positionRepo: InMemoryPositionRepository;

  let walletService: WalletService;
  let reservationService: OrderReservationService;
  let settlementService: SettlementService;
  let matchingEngine: MatchingEngine;
  let orderService: OrderService;
  let instrumentService: InstrumentService;
  let targetInstrumentId: number;

  // Test Traders
  const trader1 = { id: 101, email: 'trader1@tradegrid.internal', username: 'trader_one', role: 'TRADER' as const };
  const trader2 = { id: 102, email: 'trader2@tradegrid.internal', username: 'trader_two', role: 'TRADER' as const };
  const trader3 = { id: 103, email: 'trader3@tradegrid.internal', username: 'trader_three', role: 'TRADER' as const };

  let token1: string;
  let token2: string;
  let token3: string;

  beforeAll(async () => {
    token1 = generateTokens(trader1).accessToken;
    token2 = generateTokens(trader2).accessToken;
    token3 = generateTokens(trader3).accessToken;
  });

  beforeEach(async () => {
    // Reset repositories
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();
    instrumentRepo = new InMemoryInstrumentRepository();

    const mockKnex = {
      transaction: async (cb: any) => cb({}),
    } as any;

    // Setup instrument
    const inst = await instrumentRepo.create({
      symbol: 'AAPL',
      name: 'Apple Inc.',
      exchange: 'NASDAQ',
      sector: 'Technology',
      instrument_type: 'EQUITY',
      currency: 'USD',
      market_status: 'ACTIVE',
      data_classification: 'SIMULATED',
    });
    targetInstrumentId = inst.id;

    marketDataRepo = new InMemoryMarketDataRepository(instrumentRepo);
    orderRepo = new InMemoryOrderRepository();
    tradeRepo = new InMemoryTradeRepository();
    positionRepo = new InMemoryPositionRepository();

    walletService = new WalletService(walletRepo, ledgerRepo, mockKnex);
    reservationService = new OrderReservationService(walletRepo, ledgerRepo);
    settlementService = new SettlementService(
      orderRepo,
      walletRepo,
      ledgerRepo,
      tradeRepo,
      positionRepo,
      marketDataRepo,
      mockKnex
    );
    matchingEngine = new MatchingEngine(settlementService, realtimeService);
    orderService = new OrderService(
      orderRepo,
      instrumentRepo,
      marketDataRepo,
      reservationService,
      matchingEngine,
      mockKnex,
      realtimeService
    );
    instrumentService = new InstrumentService(
      instrumentRepo,
      marketDataRepo,
      undefined,
      realtimeService
    );

    // Fund wallets
    await walletService.createWalletForUser(trader1.id, '100000.0000');
    await walletService.createWalletForUser(trader2.id, '100000.0000');

    // Setup HTTP server and Socket.IO
    const app = createApp({ customCheckDb: async () => true });
    server = http.createServer(app);
    initWebSocket(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        serverUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Disconnect all tracked client sockets
    for (const client of activeClients) {
      if (client.connected) {
        client.disconnect();
      }
    }
    activeClients = [];

    await closeWebSocket();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  function createClient(token?: string): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = Client(serverUrl, {
        auth: token ? { token } : undefined,
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      });

      activeClients.push(client);

      client.on('connect', () => resolve(client));
      client.on('connect_error', (err) => reject(err));
    });
  }

  // =========================================================================
  // 1. Handshake & Authentication
  // =========================================================================
  describe('Handshake & Authentication', () => {
    it('should successfully connect an unauthenticated guest client', async () => {
      const client = await createClient();
      expect(client.connected).toBe(true);
      expect(socketMetrics.activeConnections).toBeGreaterThanOrEqual(1);
    });

    it('should successfully connect an authenticated client with valid JWT', async () => {
      const client = await createClient(token1);
      expect(client.connected).toBe(true);
    });

    it('should reject a client presenting an invalid or tampered token', async () => {
      await expect(createClient('invalid.jwt.token')).rejects.toThrow(/Authentication failed/i);
    });
  });

  // =========================================================================
  // 2. Room Subscriptions & Authorization
  // =========================================================================
  describe('Room Subscriptions & Authorization Guard', () => {
    it('should allow subscription to public market channels (market, orderbook, trades)', async () => {
      const client = await createClient();

      const subResponses = await Promise.all([
        new Promise<any>((res) => client.emit('subscribe', { channel: 'market:AAPL' }, res)),
        new Promise<any>((res) => client.emit('subscribe', { channel: 'orderbook:AAPL' }, res)),
        new Promise<any>((res) => client.emit('subscribe', { channel: 'trades:AAPL' }, res)),
      ]);

      expect(subResponses[0]).toEqual({ status: 'subscribed', channel: 'market:AAPL' });
      expect(subResponses[1]).toEqual({ status: 'subscribed', channel: 'orderbook:AAPL' });
      expect(subResponses[2]).toEqual({ status: 'subscribed', channel: 'trades:AAPL' });
    });

    it('should reject subscription to malformed channel names', async () => {
      const client = await createClient();

      const res = await new Promise<any>((resolve) => {
        client.emit('subscribe', { channel: 'invalid-channel-format' }, (response: any) => {
          resolve(response);
        });
      });

      expect(res.status).toBe('error');
      expect(res.message).toMatch(/Channel must be in format/i);
    });

    it('should reject an unauthenticated guest attempting to subscribe to a private user room', async () => {
      const guest = await createClient();

      const res = await new Promise<any>((resolve) => {
        guest.emit('subscribe', { channel: 'user:101' }, (response: any) => {
          resolve(response);
        });
      });

      expect(res.status).toBe('error');
      expect(res.message).toMatch(/Unauthorized/i);
    });

    it('should reject user A attempting to subscribe to user B private room', async () => {
      const clientUser1 = await createClient(token1); // User 101

      // Attempt to eavesdrop on user 102
      const res = await new Promise<any>((resolve) => {
        clientUser1.emit('subscribe', { channel: 'user:102' }, (response: any) => {
          resolve(response);
        });
      });

      expect(res.status).toBe('error');
      expect(res.message).toMatch(/Unauthorized.*another user/i);
    });

    it('should allow authenticated user to subscribe to their own user room', async () => {
      const clientUser1 = await createClient(token1); // User 101

      const res = await new Promise<any>((resolve) => {
        clientUser1.emit('subscribe', { channel: 'user:101' }, (response: any) => {
          resolve(response);
        });
      });

      expect(res.status).toBe('subscribed');
      expect(res.channel).toBe('user:101');
    });

    it('should successfully unsubscribe from a channel', async () => {
      const client = await createClient();

      await new Promise((res) => client.emit('subscribe', { channel: 'market:AAPL' }, res));

      const unsubsRes = await new Promise<any>((res) => {
        client.emit('unsubscribe', { channel: 'market:AAPL' }, (response: any) => {
          res(response);
        });
      });

      expect(unsubsRes).toEqual({ status: 'unsubscribed', channel: 'market:AAPL' });
    });
  });

  // =========================================================================
  // 3. L2 Order Book Snapshot & Depth Streaming
  // =========================================================================
  describe('L2 Order Book Snapshot & Sequence Tracking', () => {
    it('should immediately deliver an orderbook:snapshot upon subscribing to orderbook channel', async () => {
      const client = await createClient();

      const snapshotPromise = new Promise<OrderBookSnapshotEvent>((resolve) => {
        client.on('orderbook:snapshot', (snapshot) => {
          if (snapshot.symbol === 'AAPL') {
            resolve(snapshot);
          }
        });
      });

      client.emit('subscribe', { channel: 'orderbook:AAPL' });

      const snapshot = await snapshotPromise;
      expect(snapshot).toBeDefined();
      expect(snapshot.symbol).toBe('AAPL');
      expect(Array.isArray(snapshot.bids)).toBe(true);
      expect(Array.isArray(snapshot.asks)).toBe(true);
      expect(typeof snapshot.sequence).toBe('number');
    });

    it('should broadcast incremental depth updates with monotonic sequence numbers', async () => {
      const client = await createClient();
      await new Promise((res) => client.emit('subscribe', { channel: 'orderbook:AAPL' }, res));

      const updates: OrderBookDepthUpdateEvent[] = [];
      const updatePromise = new Promise<void>((resolve) => {
        client.on('orderbook:depth_update', (event: OrderBookDepthUpdateEvent) => {
          if (event.symbol === 'AAPL') {
            updates.push(event);
            if (updates.length >= 2) resolve();
          }
        });
      });

      // Broadcast 2 depth updates through realtimeService
      const u1 = realtimeService.broadcastOrderBookUpdate('AAPL', targetInstrumentId, {
        bids: [{ price: '150.00', quantity: '10.0000', orderCount: 1 }],
        asks: [],
        spread: '0.0000',
        midPrice: '150.00',
      });

      const u2 = realtimeService.broadcastOrderBookUpdate('AAPL', targetInstrumentId, {
        bids: [{ price: '150.00', quantity: '10.0000', orderCount: 1 }],
        asks: [{ price: '151.00', quantity: '5.0000', orderCount: 1 }],
        spread: '1.0000',
        midPrice: '150.50',
      });

      await updatePromise;

      expect(updates.length).toBe(2);
      expect(updates[0].sequence).toBe(u1.sequence);
      expect(updates[1].sequence).toBe(u2.sequence);
      expect(updates[1].sequence).toBe(updates[0].sequence + 1);
      expect(updates[1].prevSequence).toBe(updates[0].sequence);
    });

    it('should respond to on-demand orderbook:get_snapshot for gap recovery', async () => {
      const client = await createClient();

      // Trigger an update so there is a sequence
      realtimeService.broadcastOrderBookUpdate('AAPL', targetInstrumentId, {
        bids: [{ price: '155.00', quantity: '20.0000', orderCount: 1 }],
        asks: [],
        spread: '0.0000',
        midPrice: '155.00',
      });

      const snapshot = await new Promise<OrderBookSnapshotEvent>((resolve) => {
        client.emit('orderbook:get_snapshot', { symbol: 'AAPL' }, (response: any) => {
          resolve(response.snapshot || response);
        });
      });

      expect(snapshot.symbol).toBe('AAPL');
      expect(snapshot.bids.length).toBe(1);
      expect(snapshot.bids[0].price).toBe('155.00');
      expect(snapshot.sequence).toBeGreaterThanOrEqual(1);
    });
  });

  // =========================================================================
  // 4. End-to-End Real-Time Trading Integration & Room Isolation
  // =========================================================================
  describe('End-to-End Real-Time Trading Flow & Room Isolation', () => {
    it('should broadcast public trade tape & price update while isolating private trade execution to buyer and seller', async () => {
      // 1. Buyer socket (trader1)
      const buyerSocket = await createClient(token1);
      // 2. Seller socket (trader2)
      const sellerSocket = await createClient(token2);
      // 3. Unrelated trader socket (trader3)
      const bystanderSocket = await createClient(token3);
      // 4. Public tape & market watcher (guest)
      const publicSocket = await createClient();

      await new Promise((res) => publicSocket.emit('subscribe', { channel: 'trades:AAPL' }, res));
      await new Promise((res) => publicSocket.emit('subscribe', { channel: 'market:AAPL' }, res));
      await new Promise((res) => publicSocket.emit('subscribe', { channel: 'orderbook:AAPL' }, res));

      // Listeners
      const tapeUpdates: TradeTapeUpdateEvent[] = [];
      const marketPriceUpdates: MarketPriceUpdateEvent[] = [];
      const depthUpdates: OrderBookDepthUpdateEvent[] = [];
      const buyerTrades: PrivateTradeExecutedEvent[] = [];
      const sellerTrades: PrivateTradeExecutedEvent[] = [];
      const bystanderTrades: PrivateTradeExecutedEvent[] = [];
      const buyerOrderEvents: OrderLifecycleEvent[] = [];
      const sellerOrderEvents: OrderLifecycleEvent[] = [];
      const buyerPortfolioEvents: PortfolioUpdatedEvent[] = [];
      const sellerPortfolioEvents: PortfolioUpdatedEvent[] = [];

      publicSocket.on('trade:tape_update', (e) => tapeUpdates.push(e));
      publicSocket.on('market:price_update', (e) => marketPriceUpdates.push(e));
      publicSocket.on('orderbook:depth_update', (e) => depthUpdates.push(e));

      buyerSocket.on('trade:executed', (e) => buyerTrades.push(e));
      buyerSocket.on('order:accepted', (e) => buyerOrderEvents.push(e));
      buyerSocket.on('order:filled', (e) => buyerOrderEvents.push(e));
      buyerSocket.on('portfolio:updated', (e) => buyerPortfolioEvents.push(e));

      sellerSocket.on('trade:executed', (e) => sellerTrades.push(e));
      sellerSocket.on('order:accepted', (e) => sellerOrderEvents.push(e));
      sellerSocket.on('order:filled', (e) => sellerOrderEvents.push(e));
      sellerSocket.on('portfolio:updated', (e) => sellerPortfolioEvents.push(e));

      bystanderSocket.on('trade:executed', (e) => bystanderTrades.push(e));

      // 1. Seller places a LIMIT SELL order: 10 shares @ 150.00 (MAKER)
      const sellOrder = await orderService.createOrder(trader2.id, {
        instrumentId: targetInstrumentId,
        side: 'SELL' as any,
        orderType: 'LIMIT' as any,
        quantity: '10.0000',
        limitPrice: '150.00',
        idempotencyKey: 'sell-key-1',
      });

      expect(sellOrder.id).toBeDefined();

      // Wait a tick for async socket events
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify seller received order:accepted
      expect(sellerOrderEvents.some((e) => e.order?.id === sellOrder.id)).toBe(true);

      // 2. Buyer places a matching LIMIT BUY order: 10 shares @ 150.00 (TAKER)
      const buyOrder = await orderService.createOrder(trader1.id, {
        instrumentId: targetInstrumentId,
        side: 'BUY' as any,
        orderType: 'LIMIT' as any,
        quantity: '10.0000',
        limitPrice: '150.00',
        idempotencyKey: 'buy-key-1',
      });

      expect(buyOrder.id).toBeDefined();

      // Wait for matching, settlement and websocket distribution
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Verify Public Tape Update
      expect(tapeUpdates.length).toBeGreaterThanOrEqual(1);
      const latestTape = tapeUpdates[tapeUpdates.length - 1];
      expect(latestTape.symbol).toBe('AAPL');
      expect(parseFloat(latestTape.price)).toBe(150);
      expect(Number(latestTape.quantity)).toBe(10);
      expect(latestTape.aggressorSide).toBe('BUY');

      // Verify Public Market Price Update
      expect(marketPriceUpdates.length).toBeGreaterThanOrEqual(1);
      const latestPrice = marketPriceUpdates[marketPriceUpdates.length - 1];
      expect(latestPrice.symbol).toBe('AAPL');
      expect(parseFloat(latestPrice.lastPrice)).toBe(150);

      // Verify Buyer Private Trade Execution
      expect(buyerTrades.length).toBe(1);
      expect(buyerTrades[0].buyOrderId).toBe(buyOrder.id);
      expect(buyerTrades[0].buyerId).toBe(trader1.id);
      expect(buyerTrades[0].role).toBe('BUYER');
      expect(parseFloat(buyerTrades[0].quantity)).toBe(10);
      expect(parseFloat(buyerTrades[0].price)).toBe(150);

      // Verify Seller Private Trade Execution
      expect(sellerTrades.length).toBe(1);
      expect(sellerTrades[0].sellOrderId).toBe(sellOrder.id);
      expect(sellerTrades[0].sellerId).toBe(trader2.id);
      expect(sellerTrades[0].role).toBe('SELLER');
      expect(parseFloat(sellerTrades[0].quantity)).toBe(10);
      expect(parseFloat(sellerTrades[0].price)).toBe(150);

      // Verify Private Order Lifecycle: order:filled
      expect(buyerOrderEvents.some((e) => e.order?.id === buyOrder.id && e.order?.status === 'FILLED')).toBe(true);
      expect(sellerOrderEvents.some((e) => e.order?.id === sellOrder.id && e.order?.status === 'FILLED')).toBe(true);

      // Verify Portfolio Updates sent to both parties
      expect(buyerPortfolioEvents.length).toBeGreaterThanOrEqual(1);
      expect(sellerPortfolioEvents.length).toBeGreaterThanOrEqual(1);

      // STRICT SECURITY CHECK: Bystander in user:103 received ZERO private trades
      expect(bystanderTrades.length).toBe(0);
    });
  });

  // =========================================================================
  // 5. Subscription Rate Limiting
  // =========================================================================
  describe('Subscription Rate Limiting Guard', () => {
    it('should reject subscription attempts when client exceeds 60 requests per minute', async () => {
      const client = await createClient();

      let rateLimited = false;
      const rateLimitPromise = new Promise<void>((resolve) => {
        client.on('error:rate_limited', () => {
          rateLimited = true;
          resolve();
        });
      });

      // Submit 65 subscription requests rapidly
      for (let i = 0; i < 65; i++) {
        client.emit('subscribe', { channel: 'market:AAPL' });
      }

      await Promise.race([
        rateLimitPromise,
        new Promise((resolve) => setTimeout(resolve, 2000)),
      ]);

      expect(rateLimited).toBe(true);
      expect(socketMetrics.rejectedSubscriptions).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 6. High-Concurrency: 100 Simultaneous Connected Users Benchmark
  // =========================================================================
  describe('100 Simultaneous Connected Users Load Benchmark', () => {
    it('should support 100 concurrent clients connected and streaming broadcast events without packet loss', async () => {
      const NUM_CLIENTS = 100;
      const clients: ClientSocket[] = [];

      const startTime = Date.now();

      // Connect 100 clients concurrently
      const connectionPromises = Array.from({ length: NUM_CLIENTS }, () => createClient());
      const connectedSockets = await Promise.all(connectionPromises);
      clients.push(...connectedSockets);

      const totalConnectTimeMs = Date.now() - startTime;
      const avgConnectTimeMs = totalConnectTimeMs / NUM_CLIENTS;

      // Verify connection metrics
      expect(clients.length).toBe(NUM_CLIENTS);
      expect(socketMetrics.activeConnections).toBeGreaterThanOrEqual(NUM_CLIENTS);

      // Have all 100 clients subscribe to orderbook:AAPL and trades:AAPL
      const subPromises = clients.map(
        (c) =>
          new Promise((resolve) => {
            c.emit('subscribe', { channel: 'orderbook:AAPL' }, () => {
              c.emit('subscribe', { channel: 'trades:AAPL' }, resolve);
            });
          })
      );
      await Promise.all(subPromises);

      // Prepare counter for broadcast reception across all 100 clients
      const receivedCounts = new Map<string, number>();
      clients.forEach((c) => {
        receivedCounts.set(c.id!, 0);
        c.on('orderbook:depth_update', () => {
          receivedCounts.set(c.id!, (receivedCounts.get(c.id!) || 0) + 1);
        });
      });

      // Broadcast an order book update
      const broadcastStart = Date.now();
      realtimeService.broadcastOrderBookUpdate('AAPL', 1, {
        bids: [{ price: '150.00', quantity: '500.0000', orderCount: 50 }],
        asks: [{ price: '150.50', quantity: '300.0000', orderCount: 30 }],
        spread: '0.5000',
        midPrice: '150.25',
      });

      // Wait for broadcast propagation
      await new Promise((resolve) => setTimeout(resolve, 300));
      const broadcastDurationMs = Date.now() - broadcastStart;

      // Assert 100% reception across all 100 clients
      let totalReceived = 0;
      for (const [, count] of receivedCounts) {
        if (count >= 1) totalReceived++;
      }

      expect(totalReceived).toBe(NUM_CLIENTS);

      // Disconnect all clients cleanly
      clients.forEach((c) => c.disconnect());
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Log benchmark metrics for the final report
      console.log(`\n--- Phase 5A Load Benchmark Results ---`);
      console.log(`Connected Clients: ${NUM_CLIENTS}`);
      console.log(`Total Connect Time: ${totalConnectTimeMs} ms (Avg: ${avgConnectTimeMs.toFixed(2)} ms/client)`);
      console.log(`100-Client Broadcast Latency: ${broadcastDurationMs} ms`);
      console.log(`Delivery Success Rate: ${(totalReceived / NUM_CLIENTS) * 100}%`);
      console.log(`---------------------------------------\n`);
    }, 20000);
  });
});
