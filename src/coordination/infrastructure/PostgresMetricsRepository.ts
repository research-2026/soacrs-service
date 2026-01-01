// src/coordination/infrastructure/PostgresMetricsRepository.ts

/**
 * PostgresMetricsRepository
 *
 * Infrastructure implementation of IMetricsRepository using Prisma and PostgreSQL.
 *
 * Responsibilities:
 *  - Persist raw ToolExecutionEvent rows for auditing and analysis.
 *  - Maintain aggregated ToolMetrics per (tenantId, toolId, capability).
 *  - Provide read/write access to ToolMetrics for scoring and planning.
 */

import type { IMetricsRepository, ToolExecutionEvent, ToolMetrics } from '../domain/Metrics';
import { getPrismaClient } from '../../shared/db/PrismaClient';

/**
 * Narrow representation of the ToolMetrics row in the database.
 */
type ToolMetricsRow = {
  id: number;
  tenantId: string;
  toolId: string;
  capability: string;
  successCount: number;
  failureCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  avgReward: number;
  lastUpdated: Date;
};

/**
 * Narrow representation of the ToolExecutionEvent row in the database.
 */
type ToolExecutionEventRow = {
  id: number;
  planId: string;
  stepId: string;
  tenantId: string;
  toolId: string;
  capability: string;
  latencyMs: number;
  success: boolean;
  errorCode: string | null;
  timestamp: Date;
};

/**
 * Narrow Prisma client type used by PostgresMetricsRepository.
 *
 * Argument types are deliberately `unknown` to keep the dependency
 * on Prisma flexible. The implementation casts to shapes it expects.
 */
export type PrismaMetricsClient = {
  toolExecutionEvent: {
    create: (args: unknown) => Promise<ToolExecutionEventRow>;
  };
  toolMetrics: {
    findFirst: (args: unknown) => Promise<ToolMetricsRow | null>;
    create: (args: unknown) => Promise<ToolMetricsRow>;
    update: (args: unknown) => Promise<ToolMetricsRow>;
  };
};

export class PostgresMetricsRepository implements IMetricsRepository {
  private readonly prisma: PrismaMetricsClient;

  /**
   * Create a new PostgresMetricsRepository.
   *
   * @param prismaClient Optional Prisma client for dependency injection.
   */
  public constructor(prismaClient?: PrismaMetricsClient) {
    this.prisma = prismaClient ?? (getPrismaClient() as unknown as PrismaMetricsClient);
  }

  /**
   * Record a single execution event and update aggregated metrics
   * for the corresponding (tenantId, toolId, capability) tuple.
   *
   * @param event Execution telemetry from the orchestrator.
   */
  public async recordExecution(event: ToolExecutionEvent): Promise<void> {
    // 1. Persist the raw execution event for auditing.
    await this.prisma.toolExecutionEvent.create({
      data: {
        planId: event.planId,
        stepId: event.stepId,
        tenantId: event.tenantId,
        toolId: event.toolId,
        capability: event.capability,
        latencyMs: event.latencyMs,
        success: event.success,
        errorCode: event.errorCode ?? null,
        timestamp: new Date(event.timestamp),
      },
    } as {
      data: Omit<ToolExecutionEventRow, 'id'>;
    });

    // 2. Load existing metrics (if any) for this tool/capability/tenant.
    const existing = await this.prisma.toolMetrics.findFirst({
      where: {
        tenantId: event.tenantId,
        toolId: event.toolId,
        capability: event.capability,
      },
    } as {
      where: {
        tenantId: string;
        toolId: string;
        capability: string;
      };
    });

    const successIncrement = event.success ? 1 : 0;
    const failureIncrement = event.success ? 0 : 1;
    const now = new Date();

    if (!existing) {
      // No previous metrics: create a new row with initial values.
      const totalExecutions = successIncrement + failureIncrement;
      const totalLatency = event.latencyMs;
      const avgLatency = totalExecutions > 0 ? totalLatency / totalExecutions : 0;

      await this.prisma.toolMetrics.create({
        data: {
          tenantId: event.tenantId,
          toolId: event.toolId,
          capability: event.capability,
          successCount: successIncrement,
          failureCount: failureIncrement,
          totalLatencyMs: totalLatency,
          avgLatencyMs: avgLatency,
          // No user feedback yet; this will be updated via feedback telemetry.
          avgReward: 0,
          lastUpdated: now,
        },
      } as {
        data: Omit<ToolMetricsRow, 'id'>;
      });

      return;
    }

    // Existing metrics: update aggregated fields.
    const updatedSuccessCount = existing.successCount + successIncrement;
    const updatedFailureCount = existing.failureCount + failureIncrement;
    const totalExecutions = updatedSuccessCount + updatedFailureCount;

    const updatedTotalLatency = existing.totalLatencyMs + event.latencyMs;
    const updatedAvgLatency = totalExecutions > 0 ? updatedTotalLatency / totalExecutions : 0;

    await this.prisma.toolMetrics.update({
      where: {
        id: existing.id,
      },
      data: {
        successCount: updatedSuccessCount,
        failureCount: updatedFailureCount,
        totalLatencyMs: updatedTotalLatency,
        avgLatencyMs: updatedAvgLatency,
        // Keep avgReward unchanged here; it will be updated by feedback logic.
        avgReward: existing.avgReward,
        lastUpdated: now,
      },
    } as {
      where: { id: number };
      data: Partial<ToolMetricsRow>;
    });
  }

  /**
   * Persist a ToolMetrics snapshot explicitly.
   *
   * This is useful for services that compute or adjust metrics externally
   * (for example, via batch jobs or feedback handlers).
   */
  public async saveMetrics(metrics: ToolMetrics): Promise<void> {
    const executions = metrics.successCount + metrics.failureCount;
    const avgLatency = executions > 0 ? metrics.totalLatencyMs / executions : 0;
    const lastUpdatedDate = new Date(metrics.lastUpdated);

    const existing = await this.prisma.toolMetrics.findFirst({
      where: {
        tenantId: metrics.tenantId,
        toolId: metrics.toolId,
        capability: metrics.capability,
      },
    } as {
      where: {
        tenantId: string;
        toolId: string;
        capability: string;
      };
    });

    if (!existing) {
      await this.prisma.toolMetrics.create({
        data: {
          tenantId: metrics.tenantId,
          toolId: metrics.toolId,
          capability: metrics.capability,
          successCount: metrics.successCount,
          failureCount: metrics.failureCount,
          totalLatencyMs: metrics.totalLatencyMs,
          avgLatencyMs: avgLatency,
          avgReward: metrics.avgReward,
          lastUpdated: lastUpdatedDate,
        },
      } as {
        data: Omit<ToolMetricsRow, 'id'>;
      });

      return;
    }

    await this.prisma.toolMetrics.update({
      where: {
        id: existing.id,
      },
      data: {
        successCount: metrics.successCount,
        failureCount: metrics.failureCount,
        totalLatencyMs: metrics.totalLatencyMs,
        avgLatencyMs: avgLatency,
        avgReward: metrics.avgReward,
        lastUpdated: lastUpdatedDate,
      },
    } as {
      where: { id: number };
      data: Partial<ToolMetricsRow>;
    });
  }

  /**
   * Fetch aggregated metrics for a given tool and capability
   * in the context of a specific tenant.
   *
   * @param tenantId   Tenant identifier.
   * @param toolId     Tool identifier.
   * @param capability Capability name.
   */
  public async getMetrics(
    tenantId: string,
    toolId: string,
    capability: string,
  ): Promise<ToolMetrics | null> {
    const row = await this.prisma.toolMetrics.findFirst({
      where: {
        tenantId,
        toolId,
        capability,
      },
    } as {
      where: {
        tenantId: string;
        toolId: string;
        capability: string;
      };
    });

    if (!row) {
      return null;
    }

    return this.mapRowToDomainMetrics(row);
  }

  /**
   * Map a database metrics row into the domain ToolMetrics shape.
   *
   * Note: avgLatencyMs is kept as a DB-only detail; the domain only needs
   * totalLatencyMs and counts to derive SLA-related metrics.
   */
  private mapRowToDomainMetrics(row: ToolMetricsRow): ToolMetrics {
    const metrics: ToolMetrics = {
      tenantId: row.tenantId,
      toolId: row.toolId,
      capability: row.capability,
      successCount: row.successCount,
      failureCount: row.failureCount,
      totalLatencyMs: row.totalLatencyMs,
      avgReward: row.avgReward,
      // Domain expects a string; we store Date in the DB.
      lastUpdated: row.lastUpdated.toISOString(),
    };

    return metrics;
  }
}
