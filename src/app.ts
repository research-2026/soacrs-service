/**
 * Express application setup for SOACRS.
 *
 * This module:
 * - Creates and configures the Express app instance.
 * - Registers global middleware (JSON parsing, request logging).
 * - Exposes a healthcheck endpoint for monitoring.
 * - Registers /v1/plan (SOA-S16) and /v1/telemetry/* (SOA-S17).
 *
 * Standards applied:
 * - Pure app factory: does NOT construct database-backed infrastructure (SOA-S18).
 * - Dependency injection: runtime wiring happens in bootstrap, tests inject fakes.
 * - Boundary validation: DTO parsing/validation happens in routes/handlers.
 * - Structured error responses: validation errors -> 400, otherwise -> 500.
 */

import express, { Application, NextFunction, Request, Response } from 'express';

import { logger } from './shared/logging/Logger';

import { createPlanRoutes } from './http/routes/planRoutes';
import { createTelemetryRoutes } from './http/routes/telemetryRoutes';

import { TelemetryDtoValidationError } from './telemetry/dto/TelemetryDtoValidationError';
import { SemanticTaskDtoValidationError } from './coordination/dto/SemanticTaskDto';

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

  // Parse JSON bodies
  app.use(express.json({ limit: '1mb' }));

  // Simple request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug({ method: req.method, path: req.path }, 'Incoming request');
    next();
  });

  // Healthcheck endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'soacrs',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * NOTE:
   * We default to stubs if deps are not provided.
   * - This keeps app factory safe in tests and tooling.
   * - Runtime server.ts ALWAYS injects real deps from bootstrap.
   */
  const planBuilder = deps.planBuilder ?? createStubPlanBuilder();
  const telemetryHandler = deps.telemetryHandler ?? createStubTelemetryHandler();

  // Routes
  app.use(createPlanRoutes(planBuilder));
  app.use(createTelemetryRoutes(telemetryHandler));

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SemanticTaskDtoValidationError) {
      logger.debug({ issues: err.issues }, 'SemanticTask validation failed');
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues },
      });
    }

    if (err instanceof TelemetryDtoValidationError) {
      logger.debug({ issues: err.issues }, 'Telemetry validation failed');
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: err.message, issues: err.issues },
      });
    }

    logger.error({ err }, 'Unhandled error in request pipeline');
    return res.status(500).json({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

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
