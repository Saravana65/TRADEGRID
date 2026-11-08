import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../utils/jwt';
import { realtimeService } from './realtime.service';
import { subscriptionSchema } from '@tradegrid/validation';
import { OrderBookSnapshotEvent } from '@tradegrid/shared-types';

let io: Server | null = null;

// Metrics for monitoring and load testing
export const socketMetrics = {
  activeConnections: 0,
  totalConnections: 0,
  totalDisconnections: 0,
  totalSubscriptions: 0,
  rejectedSubscriptions: 0,
};

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: [config.CLIENT_URL, 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 1e6, // 1 MB payload limit
  });

  // Attach IO server to RealtimeService
  realtimeService.setIO(io);

  // Authentication Middleware for WebSocket handshakes
  io.use((socket: Socket, next) => {
    let token: string | undefined =
      socket.handshake.auth?.token ||
      socket.handshake.headers.authorization?.split(' ')[1] ||
      (socket.handshake.query?.token as string | undefined);

    if (token?.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    if (!token) {
      // Allow unauthenticated connection for public market data, marked as guest
      socket.data.isGuest = true;
      socket.data.user = null;
      socket.data.userId = null;
      return next();
    }

    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      socket.data.userId = Number(payload.sub);
      socket.data.userRole = payload.role;
      socket.data.isGuest = false;
      return next();
    } catch (err: any) {
      logger.warn(`[WS] Handshake rejected for ${socket.id}: ${err.message}`);
      return next(new Error('Authentication failed: Invalid or expired token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    socketMetrics.activeConnections += 1;
    socketMetrics.totalConnections += 1;

    const { user, isGuest, userId } = socket.data;
    const clientIdentifier = isGuest ? `GUEST (${socket.id})` : `User #${userId} (${user?.username || socket.id})`;

    logger.info(`[WS] Client connected: ${clientIdentifier}`);

    // If authenticated, automatically isolate client to their private user room
    if (!isGuest && userId) {
      const userRoom = `user:${userId}`;
      socket.join(userRoom);
      logger.debug(`[WS] ${clientIdentifier} auto-joined private room ${userRoom}`);
    }

    // Rate limiting tracking for subscriptions per socket
    const subscriptionHistory: number[] = [];
    const MAX_SUBSCRIPTIONS_PER_MINUTE = 60;
    const MAX_ACTIVE_ROOMS = 30;

    /**
     * Handles subscription to market channels (market:{symbol}, orderbook:{symbol}, trades:{symbol}, user:{userId})
     */
    socket.on('subscribe', async (data: any, ack?: (response: any) => void) => {
      socketMetrics.totalSubscriptions += 1;
      const now = Date.now();

      // Subscription rate limiting check
      while (subscriptionHistory.length > 0 && subscriptionHistory[0] < now - 60000) {
        subscriptionHistory.shift();
      }
      if (subscriptionHistory.length >= MAX_SUBSCRIPTIONS_PER_MINUTE) {
        socketMetrics.rejectedSubscriptions += 1;
        const errMsg = 'Subscription rate limit exceeded. Max 60 requests per minute.';
        logger.warn(`[WS] Rate limit exceeded on socket ${socket.id}`);
        socket.emit('error:rate_limited', { message: errMsg });
        if (ack) ack({ status: 'error', message: errMsg });
        return;
      }
      subscriptionHistory.push(now);

      // Max active rooms limit check
      if (socket.rooms.size >= MAX_ACTIVE_ROOMS) {
        socketMetrics.rejectedSubscriptions += 1;
        const errMsg = `Maximum active subscriptions limit (${MAX_ACTIVE_ROOMS}) reached.`;
        socket.emit('error:limit_reached', { message: errMsg });
        if (ack) ack({ status: 'error', message: errMsg });
        return;
      }

      // Payload validation
      const rawChannel = typeof data === 'string' ? data : data?.channel;
      const parseResult = subscriptionSchema.safeParse({ channel: rawChannel });

      if (!parseResult.success) {
        socketMetrics.rejectedSubscriptions += 1;
        const errMsg = parseResult.error.errors[0]?.message || 'Invalid channel name';
        logger.warn(`[WS] Invalid subscription attempt by ${socket.id}: ${rawChannel} (${errMsg})`);
        socket.emit('error:invalid_channel', { channel: rawChannel, message: errMsg });
        if (ack) ack({ status: 'error', message: errMsg, channel: rawChannel });
        return;
      }

      const channel = parseResult.data.channel;

      // Authorization guard for private user rooms
      if (channel.startsWith('user:')) {
        const targetUserId = parseInt(channel.split(':')[1], 10);
        if (socket.data.isGuest || socket.data.userId !== targetUserId) {
          socketMetrics.rejectedSubscriptions += 1;
          const errMsg = 'Unauthorized: You cannot subscribe to another user private room';
          logger.warn(`[WS] Unauthorized subscription attempt by ${clientIdentifier} to ${channel}`);
          socket.emit('error:unauthorized', { channel, message: errMsg });
          if (ack) ack({ status: 'error', message: errMsg, channel });
          return;
        }
      }

      // Authorization guard for administrative bot rooms
      if (channel === 'admin:bots') {
        if (socket.data.isGuest || socket.data.userRole !== 'ADMIN') {
          socketMetrics.rejectedSubscriptions += 1;
          const errMsg = 'Unauthorized: Only exchange administrators can subscribe to bot channels';
          logger.warn(`[WS] Unauthorized subscription attempt by ${clientIdentifier} to ${channel}`);
          socket.emit('error:unauthorized', { channel, message: errMsg });
          if (ack) ack({ status: 'error', message: errMsg, channel });
          return;
        }
      }

      // Authorization guard for administrative news rooms
      if (channel === 'admin:news') {
        if (socket.data.isGuest || socket.data.userRole !== 'ADMIN') {
          socketMetrics.rejectedSubscriptions += 1;
          const errMsg = 'Unauthorized: Only exchange administrators can subscribe to admin news channels';
          logger.warn(`[WS] Unauthorized subscription attempt by ${clientIdentifier} to ${channel}`);
          socket.emit('error:unauthorized', { channel, message: errMsg });
          if (ack) ack({ status: 'error', message: errMsg, channel });
          return;
        }
      }

      // Join room
      socket.join(channel);
      logger.debug(`[WS] ${clientIdentifier} subscribed to ${channel}`);

      if (ack) {
        ack({ status: 'subscribed', channel });
      }
      socket.emit('subscription:success', { channel, status: 'subscribed' });

      // Immediate snapshot delivery for order book channel
      if (channel.startsWith('orderbook:')) {
        const symbol = channel.split(':')[1].toUpperCase();
        sendOrderBookSnapshot(socket, symbol);
      }
    });

    /**
     * Handles unsubscription from channels
     */
    socket.on('unsubscribe', (data: any, ack?: (response: any) => void) => {
      const channel = typeof data === 'string' ? data : data?.channel;
      if (typeof channel === 'string') {
        socket.leave(channel);
        logger.debug(`[WS] ${clientIdentifier} unsubscribed from ${channel}`);
        if (ack) ack({ status: 'unsubscribed', channel });
        socket.emit('subscription:success', { channel, status: 'unsubscribed' });
      }
    });

    /**
     * Handles on-demand snapshot recovery request for order books
     */
    socket.on('orderbook:get_snapshot', (data: any, ack?: (response: any) => void) => {
      const symbol = (typeof data === 'string' ? data : data?.symbol)?.toUpperCase();
      if (symbol) {
        const snapshot = sendOrderBookSnapshot(socket, symbol);
        if (ack) ack({ status: 'ok', snapshot });
      } else if (ack) {
        ack({ status: 'error', message: 'Symbol is required' });
      }
    });

    /**
     * Client disconnect handler
     */
    socket.on('disconnect', (reason) => {
      socketMetrics.activeConnections = Math.max(0, socketMetrics.activeConnections - 1);
      socketMetrics.totalDisconnections += 1;
      logger.info(`[WS] Client disconnected: ${clientIdentifier} (reason: ${reason})`);
    });
  });

  return io;
}

/**
 * Sends order book snapshot to a socket using matching engine depth or cached snapshot.
 */
function sendOrderBookSnapshot(socket: Socket, symbol: string): OrderBookSnapshotEvent {
  const normSymbol = symbol.toUpperCase();
  let snapshot = realtimeService.getLastSnapshot(normSymbol);

  if (!snapshot) {
    try {
      // Lazy load matching engine to avoid circular dependency
      const { matchingEngine } = require('../modules/matching/matching-engine');
      const book = matchingEngine.getOrCreateBook?.(0, normSymbol) || matchingEngine.books?.get(0);
      const depth = book
        ? book.getDepth(15)
        : { bids: [], asks: [], spread: '0.0000', midPrice: null };

      const sequence = realtimeService.getCurrentSequence(normSymbol);
      snapshot = {
        eventId: `snap-${normSymbol}-${sequence}`,
        symbol: normSymbol,
        instrumentId: 0,
        bids: depth.bids,
        asks: depth.asks,
        spread: (depth as any).spread || '0.0000',
        midPrice: (depth as any).midPrice || null,
        sequence,
        timestamp: new Date().toISOString(),
      };
    } catch {
      const sequence = realtimeService.getCurrentSequence(normSymbol);
      snapshot = {
        eventId: `snap-${normSymbol}-${sequence}`,
        symbol: normSymbol,
        instrumentId: 0,
        bids: [],
        asks: [],
        spread: '0.0000',
        midPrice: null,
        sequence,
        timestamp: new Date().toISOString(),
      };
    }
  }

  socket.emit('orderbook:snapshot', snapshot);
  logger.debug(`[WS] Sent orderbook:snapshot for ${normSymbol} to socket ${socket.id} (seq #${snapshot.sequence})`);
  return snapshot;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('WebSocket server has not been initialized');
  }
  return io;
}

export function closeWebSocket(): Promise<void> {
  return new Promise((resolve) => {
    if (io) {
      io.close(() => {
        io = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
