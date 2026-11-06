import http from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { logger } from './utils/logger';
import { initWebSocket } from './websocket/socket';
import { closeDatabaseConnection } from './database/connection';

const app = createApp();
const server = http.createServer(app);

// Initialize WebSocket layer
initWebSocket(server);

// Start HTTP Server
server.listen(config.PORT, () => {
  logger.info(`=======================================================`);
  logger.info(`🚀 TRADEGRID Backend Service is running`);
  logger.info(`📡 Port: ${config.PORT}`);
  logger.info(`🌍 Environment: ${config.NODE_ENV}`);
  logger.info(`🔗 Health Check: http://localhost:${config.PORT}/api/v1/health`);
  logger.info(`=======================================================`);
});

// Graceful Shutdown Handling
async function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed.');
    await closeDatabaseConnection();
    logger.info('TRADEGRID backend shutdown complete.');
    process.exit(0);
  });

  // Force close if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
