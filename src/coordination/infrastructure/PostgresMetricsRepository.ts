// src/coordination/infrastructure/PostgresMetricsRepository.ts

/**
 * PostgresMetricsRepository
 *
 * Infrastructure implementation of IMetricsRepository using Prisma/PostgreSQL.
 *
 * Standards applied:
 * - SRP: telemetry persistence + aggregate maintenance (no scoring logic here).
 * - Deterministic aggregation: single source of truth is DB state.
 * - Type safety: avoid `any`, convert DB BigInt/Decimal -> number at boundary.
 */

import type { IMetricsRepository, ToolExecutionEvent, ToolMetrics } from '../domain/Metrics';
import { getPrismaClient } from '../../shared/db/PrismaClient';

/**
 * DB row shape for ToolMetrics (matches prisma/schema.prisma).
 */
type ToolMetricsRow = {
  tenantId: string;
  toolId: string;
  capability: string;
  successCount: bigint;
  failureCount: bigint;
  totalLatencyMs: bigint;
  avgReward: unknown; // Prisma Decimal
  lastUpdated: Date;
};

/**
 * Prisma client surface used here (narrowed).
 * NOTE: ExecutionEvent model -> prisma.executionEvent delegate.
 * ToolMetrics uses composite @@id([tenantId, toolId, capability]) so updates are by composite key.
 */
export type PrismaMetricsClient = {
  executionEvent: {
    create: (args: unknown) => Promise<unknown>;
  };
  toolMetrics: {
    findUnique: (args: unknown) => Promise<ToolMetricsRow | null>;
    create: (args: unknown) => Promise<unknown>;
    update: (args: unknown) => Promise<unknown>;
  };
};

export class PostgresMetricsRepository implements IMetricsRepository {
  private readonly prisma: PrismaMetricsClient;

  public constructor(prismaClient?: PrismaMetricsClient) {
    this.prisma = prismaClient ?? (getPrismaClient() as unknown as PrismaMetricsClient);
  }

  public async recordExecution(event: ToolExecutionEvent): Promise<void> {
    // 1) Persist raw step-level event (audit trail)
    await this.prisma.executionEvent.create({
      data: {
        planId: event.planId,
        stepId: event.stepId,
        tenantId: event.tenantId,
        toolId: event.toolId,
        capability: event.capability,
        latencyMs: Math.trunc(event.latencyMs),
        success: event.success,
        errorCode: event.errorCode ?? null,
        timestamp: new Date(event.timestamp),
      },
    } as unknown);

    // 2) Update aggregate ToolMetrics for (tenant, tool, capability)
    const key = {
      tenantId: event.tenantId,
      toolId: event.toolId,
      capability: event.capability,
    };

    const existing = await this.prisma.toolMetrics.findUnique({
      where: {
        // Prisma default composite id accessor naming:
        // { tenantId_toolId_capability: { tenantId, toolId, capability } }
        tenantId_toolId_capability: key,
      },
    } as unknown);

    const successInc = event.success ? 1n : 0n;
    const failureInc = event.success ? 0n : 1n;
    const latencyInc = BigInt(Math.max(0, Math.trunc(event.latencyMs)));
    const now = new Date();

    if (!existing) {
      await this.prisma.toolMetrics.create({
        data: {
          ...key,
          successCount: successInc,
          failureCount: failureInc,
          totalLatencyMs: latencyInc,
          // No feedback yet; TelemetryHandler will set via saveMetrics()
          avgReward: 0,
          lastUpdated: now,
        },
      } as unknown);
      return;
    }

    await this.prisma.toolMetrics.update({
      where: { tenantId_toolId_capability: key },
      data: {
        successCount: existing.successCount + successInc,
        failureCount: existing.failureCount + failureInc,
        totalLatencyMs: existing.totalLatencyMs + latencyInc,
        // Keep avgReward unchanged here; feedback path updates it
        avgReward: existing.avgReward,
        lastUpdated: now,
      },
    } as unknown);
  }

  public async saveMetrics(metrics: ToolMetrics): Promise<void> {
    const key = {
      tenantId: metrics.tenantId,
      toolId: metrics.toolId,
      capability: metrics.capability,
    };

    const existing = await this.prisma.toolMetrics.findUnique({
      where: { tenantId_toolId_capability: key },
    } as unknown);

    const now = new Date(metrics.lastUpdated);

    // Convert numbers -> DB BigInt (defensive truncation)
    const successCount = BigInt(Math.max(0, Math.trunc(metrics.successCount)));
    const failureCount = BigInt(Math.max(0, Math.trunc(metrics.failureCount)));
    const totalLatencyMs = BigInt(Math.max(0, Math.trunc(metrics.totalLatencyMs)));

    if (!existing) {
      await this.prisma.toolMetrics.create({
        data: {
          ...key,
          successCount,
          failureCount,
          totalLatencyMs,
          avgReward: metrics.avgReward,
          lastUpdated: now,
        },
      } as unknown);
      return;
    }

    await this.prisma.toolMetrics.update({
      where: { tenantId_toolId_capability: key },
      data: {
        successCount,
        failureCount,
        totalLatencyMs,
        avgReward: metrics.avgReward,
        lastUpdated: now,
      },
    } as unknown);
  }

  public async getMetrics(
    tenantId: string,
    toolId: string,
    capability: string,
  ): Promise<ToolMetrics | null> {
    const row = await this.prisma.toolMetrics.findUnique({
      where: { tenantId_toolId_capability: { tenantId, toolId, capability } },
    } as unknown);

    if (!row) return null;
    return this.mapRowToDomainMetrics(row);
  }

  private mapRowToDomainMetrics(row: ToolMetricsRow): ToolMetrics {
    return {
      tenantId: row.tenantId,
      toolId: row.toolId,
      capability: row.capability,
      successCount: safeBigIntToNumber(row.successCount),
      failureCount: safeBigIntToNumber(row.failureCount),
      totalLatencyMs: safeBigIntToNumber(row.totalLatencyMs),
      avgReward: safeDecimalToNumber(row.avgReward),
      lastUpdated: row.lastUpdated.toISOString(),
    };
  }
}

/**
 * Conversions (boundary layer)
 * NOTE: if metrics can exceed Number.MAX_SAFE_INTEGER in your usage,
 * switch the domain contract to bigint later (not now, per constraints).
 */
function safeBigIntToNumber(value: bigint): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function safeDecimalToNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (value && typeof value === 'object') {
    const maybe = value as { toString?: () => string };
    if (typeof maybe.toString === 'function') {
      const n = Number(maybe.toString());
      return Number.isFinite(n) ? n : 0;
    }
  }
  return 0;
}
