import http from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { initWebSocket } from './websocket/socket';
import { closeDatabaseConnection } from './database/connection';
import { orderBookRecoveryService } from './modules/matching/order-book-recovery.service';
import { botScheduler } from './modules/bots';

let server: http.Server;

async function startServer() {
  const app = createApp();
  server = http.createServer(app);

  // Initialize WebSocket layer
  initWebSocket(server);

  // Phase 5A.1: Deterministic order book recovery from database before accepting traffic
  try {
    await orderBookRecoveryService.recoverAllBooks();
  } catch (err: any) {
    logger.error(`[BOOTSTRAP] Failed to recover order books: ${err.message}`);
  }

  // Start HTTP Server
  server.listen(config.PORT, async () => {
    logger.info(`=======================================================`);
    logger.info(`🚀 TRADEGRID Backend Service is running`);
    logger.info(`📡 Port: ${config.PORT}`);
    logger.info(`🌍 Environment: ${config.NODE_ENV}`);
    logger.info(`🔗 Health Check: http://localhost:${config.PORT}/api/v1/health`);
    logger.info(`=======================================================`);

    // Phase 5B: Start autonomous market-making bot scheduler
    try {
      await botScheduler.start();
    } catch (err: any) {
      logger.error(`[BOOTSTRAP] Failed to start bot scheduler: ${err.message}`);
    }
  });
}

// Graceful Shutdown Handling
async function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  try {
    await botScheduler.stop();
  } catch (err: any) {
    logger.error(`[SHUTDOWN] Failed to stop bot scheduler: ${err.message}`);
  }

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed.');
      await closeDatabaseConnection();
      logger.info('TRADEGRID backend shutdown complete.');
      process.exit(0);
    });
  } else {
    await closeDatabaseConnection();
    process.exit(0);
  }

  // Force close if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

startServer().catch((err) => {
  logger.error(`Fatal startup failure: ${err.message}`);
  process.exit(1);
});
