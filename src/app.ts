/**
 * Express application setup for SOACRS.
 *
 * This module:
 * - Creates and configures the Express 5 app instance.
 * - Registers global middleware (JSON parsing, request logging).
 * - Exposes a healthcheck endpoint for monitoring.
 * - Registers /v1/plan route (SOA-S16).
 *
 * Standards applied:
 * - Dependency injection friendly: createApp can accept injected deps (tests).
 * - Boundary validation: input DTO parsing happens in route layer.
 * - Structured error responses: validation errors -> 400, otherwise -> 500.
 */

import express, { Application, NextFunction, Request, Response } from 'express';

import { config } from './shared/config/Config';
import { logger } from './shared/logging/Logger';

import { createPlanRoutes } from './http/routes/planRoutes';

import { PlanBuilderService } from './coordination/application/PlanBuilderService';
import { DEFAULT_SCORING_CONFIG, ScoringEngine } from './coordination/application/ScoringEngine';
import { PostgresToolRegistry } from './coordination/infrastructure/PostgresToolRegistry';
import { PostgresMetricsRepository } from './coordination/infrastructure/PostgresMetricsRepository';
import { PostgresPlanStore } from './coordination/infrastructure/PostgresPlanStore';

import { TelemetryDtoValidationError } from './telemetry/dto/TelemetryDtoValidationError';
import { SemanticTaskDtoValidationError } from './coordination/dto/SemanticTaskDto';

export type AppDeps = {
  /**
   * Optional PlanBuilder injection (used by integration tests to avoid DB).
   * Production uses default composition until SOA-S18 moves wiring to bootstrap.
   */
  planBuilder?: Pick<PlanBuilderService, 'buildPlan'>;
};

export function createApp(deps: AppDeps = {}): Application {
  const app = express();

  // Parse JSON bodies
  app.use(express.json({ limit: '1mb' }));

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

  // SOA-S16: /v1/plan
  // In test env we must NOT instantiate Prisma-backed infrastructure by default.
  // Tests can inject a fake planBuilder when they need /v1/plan.
  const planBuilder =
    deps.planBuilder ??
    (config.env === 'test' ? createStubPlanBuilder() : buildDefaultPlanBuilder());
  app.use(createPlanRoutes(planBuilder));

  // Global error handler (single place)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // 400 - boundary validation errors (DTO parsers)
    if (err instanceof SemanticTaskDtoValidationError) {
      logger.debug({ issues: err.issues }, 'SemanticTask validation failed');
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
          issues: err.issues,
        },
      });
    }

    if (err instanceof TelemetryDtoValidationError) {
      logger.debug({ issues: err.issues }, 'Telemetry validation failed');
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
          issues: err.issues,
        },
      });
    }

    logger.error({ err }, 'Unhandled error in request pipeline');
    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
  });

  return app;
}

/**
 * Temporary composition root for SOA-S16.
 * In SOA-S18 we’ll move this wiring into a dedicated bootstrap module/server.
 */
function buildDefaultPlanBuilder(): PlanBuilderService {
  const toolRegistry = new PostgresToolRegistry();
  const metricsRepository = new PostgresMetricsRepository();
  const planStore = new PostgresPlanStore();
  const scoringEngine = new ScoringEngine();

  return new PlanBuilderService({
    toolRegistry,
    metricsRepository,
    planStore,
    scoringEngine,
    scoringConfig: DEFAULT_SCORING_CONFIG,
    coordinator: {
      service: config.serviceName,
      version: config.serviceVersion,
    },
  });
}

/**
 * Test-safe stub PlanBuilder.
 *
 * Why:
 * - Prevents Prisma initialization in tests (avoids requiring prisma generate).
 * - Keeps /health testable without DB wiring.
 * - Any test that needs /v1/plan should inject a real/fake planBuilder.
 */
function createStubPlanBuilder(): Pick<PlanBuilderService, 'buildPlan'> {
  return {
    async buildPlan() {
      // If a test hits this, it should inject a planBuilder in createApp({ planBuilder })
      throw new Error('PlanBuilder not configured. Inject planBuilder for /v1/plan tests.');
    },
  };
}
