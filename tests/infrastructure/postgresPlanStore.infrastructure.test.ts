// tests/infrastructure/postgresPlanStore.infrastructure.test.ts
/**
 * Infrastructure tests for PostgresMetricsRepository.
 *
 * Uses an in-memory fake Prisma client to verify:
 * - Execution events are recorded.
 * - Aggregated metrics are created when none exist.
 * - Aggregated metrics are updated correctly on subsequent events.
 *
 * Notes:
 * - Prisma schema uses:
 *   - ExecutionEvent (delegate: prisma.executionEvent)
 *   - ToolMetrics composite id @@id([tenantId, toolId, capability])
 *   - BigInt counters
 */

import {
  PostgresMetricsRepository,
  type PrismaMetricsClient,
} from '../../src/coordination/infrastructure/PostgresMetricsRepository';

import type { ToolExecutionEvent, ToolMetrics } from '../../src/coordination/domain/Metrics';

type InMemoryMetricsRow = {
  tenantId: string;
  toolId: string;
  capability: string;
  successCount: bigint;
  failureCount: bigint;
  totalLatencyMs: bigint;
  avgReward: number; // stored as number in fake; repo converts Decimal-like values safely
  lastUpdated: Date;
};

type InMemoryEventRow = {
  id: bigint;
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

describe('PostgresMetricsRepository', () => {
  it('should create metrics for the first execution event', async () => {
    const metricsTable: InMemoryMetricsRow[] = [];
    const eventsTable: InMemoryEventRow[] = [];

    const fakePrisma: PrismaMetricsClient = {
      executionEvent: {
        async create(args: unknown): Promise<unknown> {
          const { data } = args as {
            data: Omit<InMemoryEventRow, 'id'>;
          };

          const row: InMemoryEventRow = {
            id: BigInt(eventsTable.length + 1),
            ...data,
          };

          eventsTable.push(row);
          return row;
        },
      },

      toolMetrics: {
        async findUnique(args: unknown): Promise<InMemoryMetricsRow | null> {
          const { where } = args as {
            where: {
              tenantId_toolId_capability: {
                tenantId: string;
                toolId: string;
                capability: string;
              };
            };
          };

          const key = where.tenantId_toolId_capability;
          return (
            metricsTable.find(
              (m) =>
                m.tenantId === key.tenantId &&
                m.toolId === key.toolId &&
                m.capability === key.capability,
            ) ?? null
          );
        },

        async create(args: unknown): Promise<unknown> {
          const { data } = args as { data: InMemoryMetricsRow };
          metricsTable.push(data);
          return data;
        },

        async update(args: unknown): Promise<unknown> {
          const { where, data } = args as {
            where: {
              tenantId_toolId_capability: {
                tenantId: string;
                toolId: string;
                capability: string;
              };
            };
            data: Partial<InMemoryMetricsRow>;
          };

          const key = where.tenantId_toolId_capability;
          const index = metricsTable.findIndex(
            (m) =>
              m.tenantId === key.tenantId &&
              m.toolId === key.toolId &&
              m.capability === key.capability,
          );

          if (index === -1) throw new Error('Metrics row not found');

          const updated: InMemoryMetricsRow = { ...metricsTable[index], ...data };
          metricsTable[index] = updated;
          return updated;
        },
      },
    };

    const repo = new PostgresMetricsRepository(fakePrisma);

    const event: ToolExecutionEvent = {
      planId: 'plan-1',
      stepId: 'step-1',
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      capability: 'patient.search',
      latencyMs: 500,
      success: true,
      errorCode: undefined,
      timestamp: new Date().toISOString(),
    };

    await repo.recordExecution(event);

    // Verify that an event was recorded
    expect(eventsTable).toHaveLength(1);
    expect(eventsTable[0].toolId).toBe('ehr-patient-api');

    // Verify that metrics were created (BigInt counters)
    expect(metricsTable).toHaveLength(1);
    const metricsRow = metricsTable[0];
    expect(metricsRow.successCount).toBe(1n);
    expect(metricsRow.failureCount).toBe(0n);
    expect(metricsRow.totalLatencyMs).toBe(500n);
  });

  it('should update metrics on subsequent execution events', async () => {
    const metricsTable: InMemoryMetricsRow[] = [
      {
        tenantId: 'acme-health',
        toolId: 'ehr-patient-api',
        capability: 'patient.search',
        successCount: 1n,
        failureCount: 0n,
        totalLatencyMs: 500n,
        avgReward: 0,
        lastUpdated: new Date(),
      },
    ];
    const eventsTable: InMemoryEventRow[] = [];

    const fakePrisma: PrismaMetricsClient = {
      executionEvent: {
        async create(args: unknown): Promise<unknown> {
          const { data } = args as { data: Omit<InMemoryEventRow, 'id'> };
          const row: InMemoryEventRow = {
            id: BigInt(eventsTable.length + 1),
            ...data,
          };
          eventsTable.push(row);
          return row;
        },
      },

      toolMetrics: {
        async findUnique(args: unknown): Promise<InMemoryMetricsRow | null> {
          const { where } = args as {
            where: {
              tenantId_toolId_capability: {
                tenantId: string;
                toolId: string;
                capability: string;
              };
            };
          };
          const key = where.tenantId_toolId_capability;
          return (
            metricsTable.find(
              (m) =>
                m.tenantId === key.tenantId &&
                m.toolId === key.toolId &&
                m.capability === key.capability,
            ) ?? null
          );
        },

        async create(_args: unknown): Promise<unknown> {
          throw new Error('Not used in this test');
        },

        async update(args: unknown): Promise<unknown> {
          const { where, data } = args as {
            where: {
              tenantId_toolId_capability: {
                tenantId: string;
                toolId: string;
                capability: string;
              };
            };
            data: Partial<InMemoryMetricsRow>;
          };

          const key = where.tenantId_toolId_capability;
          const index = metricsTable.findIndex(
            (m) =>
              m.tenantId === key.tenantId &&
              m.toolId === key.toolId &&
              m.capability === key.capability,
          );

          if (index === -1) throw new Error('Metrics row not found');

          const updated: InMemoryMetricsRow = { ...metricsTable[index], ...data };
          metricsTable[index] = updated;
          return updated;
        },
      },
    };

    const repo = new PostgresMetricsRepository(fakePrisma);

    const secondEvent: ToolExecutionEvent = {
      planId: 'plan-2',
      stepId: 'step-1',
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      capability: 'patient.search',
      latencyMs: 300,
      success: false,
      errorCode: 'TIMEOUT',
      timestamp: new Date().toISOString(),
    };

    await repo.recordExecution(secondEvent);

    expect(eventsTable).toHaveLength(1);

    // getMetrics() returns domain metrics (numbers), mapped from BigInt/Decimal at boundary
    const updatedMetrics: ToolMetrics | null = await repo.getMetrics(
      'acme-health',
      'ehr-patient-api',
      'patient.search',
    );

    expect(updatedMetrics).not.toBeNull();
    expect(updatedMetrics?.successCount).toBe(1);
    expect(updatedMetrics?.failureCount).toBe(1);
    expect(updatedMetrics?.totalLatencyMs).toBe(800);
  });
});
