/**
 * HTTP server entrypoint for SOACRS service.
 *
 * This file:
 * - Loads configuration
 * - Creates the Express app
 * - Starts listening on the configured port
 */
import { createServer } from 'http';
import { createApp } from './app';
import { config } from './shared/config/Config';
import { logger } from './shared/logging/Logger';

const app = createApp();
const server = createServer(app);

server.listen(config.port, () => {
  logger.info(
    {
      port: config.port,
      env: config.env,
    },
    'SOACRS service started',
  );
});

// Graceful shutdown can be extended later for production readiness
process.on('SIGTERM', () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});
