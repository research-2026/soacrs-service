/**
 * Express application setup for SOACRS.
 *
 * This module:
 * - Creates and configures the Express 5 app instance.
 * - Registers global middleware (JSON parsing, basic security headers).
 * - Exposes a healthcheck endpoint for monitoring.
 *
 * Domain-specific routes (e.g., /v1/plan, /v1/telemetry) will be added later.
 */
import express, { Application, NextFunction, Request, Response } from 'express';
import { logger } from './shared/logging/Logger';

export function createApp(): Application {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Simple request logging for visibility in development
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Basic healthcheck endpoint used by Kubernetes / monitors
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'soacrs',
      timestamp: new Date().toISOString(),
    });
  });

  // Global error handler (keeps errors in one place)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'Unhandled error in request pipeline');

    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
    });
  });

  return app;
}
