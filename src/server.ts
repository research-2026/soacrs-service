// src/server.ts

/**
 * Server Bootstrap (SOA-S18)
 * -------------------------
 * - Loads config
 * - Builds runtime dependencies (composition root)
 * - Creates express app
 * - Starts listening
 * - Handles graceful shutdown (including Prisma disconnect)
 */

import { createServer } from 'http';

import { config } from './shared/config/Config';
import { logger } from './shared/logging/Logger';

import { createApp } from './app';
import { buildRuntimeDeps } from './bootstrap/buildDeps';

async function main() {
  const deps = buildRuntimeDeps();
  const app = createApp({
    planBuilder: deps.planBuilder,
    telemetryHandler: deps.telemetryHandler,
  });

  const server = createServer(app);

  server.listen(config.port, () => {
    logger.info({ port: config.port }, 'SOACRS service started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown requested');

    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });

    await deps.shutdown();

    logger.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
