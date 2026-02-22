/**
 * Express application setup for SOACRS.
 *
 * Responsibilities:
 * - Build an Express application instance (no DB wiring inside this file).
 * - Register global middleware (JSON parsing, correlationId, request logging).
 * - Expose health endpoint for monitoring.
 * - Mount routing endpoints:
 *   - POST /v1/plan (SOA-S16)
 *   - POST /v1/telemetry/execution + POST /v1/telemetry/feedback (SOA-S17)
 * - Provide consistent error responses (SOA-S19 standard error envelope).
 *
 * Standards applied:
 * - Pure app factory (SOA-S18): no Prisma/Postgres construction here.
 * - Dependency Injection (DIP): runtime wiring happens in bootstrap; tests inject fakes.
 * - Boundary safety: DTO validation happens in DTO parsers / handlers; app converts to envelopes.
 * - Observability (SOA-S19): correlationId on every request + structured logs.
 */

import express, { Application, NextFunction, Request, Response } from 'express';

import { logger } from './shared/logging/Logger';

import { createPlanRoutes } from './http/routes/planRoutes';
import { createTelemetryRoutes } from './http/routes/telemetryRoutes';

import { correlationIdMiddleware } from './http/middleware/correlationId';
import { notFound } from './http/middleware/notFound';
import { errorHandler } from './http/middleware/errorHandler';

import type { PlanBuilderService } from './coordination/application/PlanBuilderService';
import type { TelemetryHandler } from './telemetry/application/TelemetryHandler';

export type AppDeps = {
  /**
   * Injected PlanBuilder (runtime via bootstrap; tests via mock).
   */
  planBuilder?: Pick<PlanBuilderService, 'buildPlan'>;

  /**
   * Injected TelemetryHandler (runtime via bootstrap; tests via mock).
   */
  telemetryHandler?: Pick<TelemetryHandler, 'handleExecutionTelemetry' | 'handleFeedbackTelemetry'>;
};

export function createApp(deps: AppDeps = {}): Application {
  const app = express();

  // 1) Parse JSON bodies (keep limits small to reduce attack surface)
  app.use(express.json({ limit: '1mb' }));

  // 2) SOA-S19: correlationId for every request (header → body fallback → generated)
  app.use(correlationIdMiddleware);

  // 3) Structured request logs (include correlationId so logs can be traced)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug(
      { correlationId: req.correlationId, method: req.method, path: req.path },
      'Incoming request',
    );
    next();
  });

  // 4) Health endpoint (no dependency requirements)
  app.get('/health', (_req: Request, res: Response) => {
    return res.status(200).json({
      status: 'ok',
      service: 'soacrs',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * NOTE:
   * We default to stubs if deps are not provided.
   * - Keeps createApp safe in unit tests/tools.
   * - Runtime server MUST inject real deps from bootstrap.
   */
  const planBuilder = deps.planBuilder ?? createStubPlanBuilder();
  const telemetryHandler = deps.telemetryHandler ?? createStubTelemetryHandler();

  // 5) Routes
  app.use(createPlanRoutes(planBuilder));
  app.use(createTelemetryRoutes(telemetryHandler));

  // 6) SOA-S19: 404 handler + global error handler using standard envelope
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

/**
 * Stub PlanBuilder.
 * If /v1/plan is called without runtime DI, we fail fast with a clear message.
 */
function createStubPlanBuilder(): Pick<PlanBuilderService, 'buildPlan'> {
  return {
    async buildPlan() {
      throw new Error('PlanBuilder not configured. Inject planBuilder from bootstrap.');
    },
  };
}

/**
 * Stub TelemetryHandler.
 * If telemetry endpoints are called without runtime DI, we fail fast with a clear message.
 */
function createStubTelemetryHandler(): Pick<
  TelemetryHandler,
  'handleExecutionTelemetry' | 'handleFeedbackTelemetry'
> {
  return {
    async handleExecutionTelemetry() {
      throw new Error('TelemetryHandler not configured. Inject telemetryHandler from bootstrap.');
    },
    async handleFeedbackTelemetry() {
      throw new Error('TelemetryHandler not configured. Inject telemetryHandler from bootstrap.');
    },
  };
}
