// src/bootstrap/buildDeps.ts

/**
 * Composition Root (SOA-S18)
 * -------------------------
 * This module is the ONLY place that wires infrastructure + application services.
 *
 * Standards applied:
 * - Clean Architecture: infrastructure is constructed at the edge (composition root).
 * - DIP (Dependency Inversion Principle): app.ts depends on interfaces/ports, not concrete infra.
 * - Single source of wiring: avoids accidental Prisma initialization in tests.
 */

import { config } from '../shared/config/Config';

import { PostgresToolRegistry } from '../coordination/infrastructure/PostgresToolRegistry';
import { PostgresMetricsRepository } from '../coordination/infrastructure/PostgresMetricsRepository';
import { PostgresPlanStore } from '../coordination/infrastructure/PostgresPlanStore';

import { DEFAULT_SCORING_CONFIG, ScoringEngine } from '../coordination/application/ScoringEngine';
import { PlanBuilderService } from '../coordination/application/PlanBuilderService';

import { MetricsService } from '../telemetry/application/MetricsService';
import { TelemetryHandler } from '../telemetry/application/TelemetryHandler';

import { disconnectPrisma } from '../shared/db/PrismaClient';

export type RuntimeDeps = {
  planBuilder: Pick<PlanBuilderService, 'buildPlan'>;
  telemetryHandler: Pick<TelemetryHandler, 'handleExecutionTelemetry' | 'handleFeedbackTelemetry'>;

  /**
   * Called during graceful shutdown to release DB connections, flush buffers, etc.
   */
  shutdown: () => Promise<void>;
};

/**
 * Builds runtime dependencies for the SOACRS service.
 *
 * NOTE:
 * - Creates ONE shared MetricsRepository instance so plan-building + telemetry share the same store.
 */
export function buildRuntimeDeps(): RuntimeDeps {
  // Infrastructure (DB-backed)
  const metricsRepository = new PostgresMetricsRepository();
  const toolRegistry = new PostgresToolRegistry();
  const planStore = new PostgresPlanStore();

  // Application services
  const scoringEngine = new ScoringEngine();

  const planBuilder = new PlanBuilderService({
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

  const metricsService = new MetricsService(metricsRepository);
  const telemetryHandler = new TelemetryHandler(metricsService);

  return {
    planBuilder,
    telemetryHandler,
    shutdown: async () => {
      await disconnectPrisma();
    },
  };
}
