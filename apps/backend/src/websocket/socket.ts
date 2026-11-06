import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { config } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../utils/jwt';

let io: Server | null = null;

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: [config.CLIENT_URL, 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // Authentication Middleware for WebSocket handshakes
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      // Allow unauthenticated connection for public ticker channels, but mark as guest
      (socket as any).isGuest = true;
      return next();
    }

    try {
      const payload = verifyAccessToken(token);
      (socket as any).user = payload;
      (socket as any).isGuest = false;
      next();
    } catch (error) {
      logger.warn(`WebSocket handshake rejected: invalid token`);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = (socket as any).user;
    logger.info(`WebSocket client connected: ${socket.id} (${user ? user.username : 'GUEST'})`);

    // Join public market channel
    socket.join('market:public');

    // If authenticated, join personal private notifications channel
    if (user && user.sub) {
      socket.join(`user:${user.sub}`);
    }

    socket.on('subscribe:symbol', (symbol: string) => {
      if (typeof symbol === 'string') {
        const room = `quotes:${symbol.toUpperCase()}`;
        socket.join(room);
        logger.debug(`Socket ${socket.id} subscribed to ${room}`);
      }
    });

    socket.on('unsubscribe:symbol', (symbol: string) => {
      if (typeof symbol === 'string') {
        const room = `quotes:${symbol.toUpperCase()}`;
        socket.leave(room);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info(`WebSocket client disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error('WebSocket server has not been initialized');
  }
  return io;
}
