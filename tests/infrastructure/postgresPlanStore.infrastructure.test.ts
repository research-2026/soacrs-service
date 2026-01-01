// tests/infrastructure/postgresMetricsRepository.infrastructure.test.ts

/**
 * Infrastructure tests for PostgresMetricsRepository.
 *
 * These tests use an in-memory fake Prisma client to verify that:
 *  - Execution events are recorded.
 *  - Aggregated metrics are created when none exist.
 *  - Aggregated metrics are updated correctly on subsequent events.
 */

import {
  PostgresMetricsRepository,
  type PrismaMetricsClient,
} from '../../src/coordination/infrastructure/PostgresMetricsRepository';
import type { ToolExecutionEvent, ToolMetrics } from '../../src/coordination/domain/Metrics';

type InMemoryMetricsRow = {
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

type InMemoryEventRow = {
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

describe('PostgresMetricsRepository', () => {
  it('should create metrics for the first execution event', async () => {
    const metricsTable: InMemoryMetricsRow[] = [];
    const eventsTable: InMemoryEventRow[] = [];

    const fakePrisma: PrismaMetricsClient = {
      toolExecutionEvent: {
        async create(args: unknown): Promise<InMemoryEventRow> {
          const { data } = args as {
            data: Omit<InMemoryEventRow, 'id'>;
          };

          const row: InMemoryEventRow = {
            id: eventsTable.length + 1,
            ...data,
          };

          eventsTable.push(row);

          return row;
        },
      },
      toolMetrics: {
        async findFirst(args: unknown): Promise<InMemoryMetricsRow | null> {
          const { where } = args as {
            where: {
              tenantId: string;
              toolId: string;
              capability: string;
            };
          };

          const row =
            metricsTable.find(
              (m) =>
                m.tenantId === where.tenantId &&
                m.toolId === where.toolId &&
                m.capability === where.capability,
            ) ?? null;

          return row;
        },

        async create(args: unknown): Promise<InMemoryMetricsRow> {
          const { data } = args as {
            data: Omit<InMemoryMetricsRow, 'id'>;
          };

          const row: InMemoryMetricsRow = {
            id: metricsTable.length + 1,
            ...data,
          };

          metricsTable.push(row);

          return row;
        },

        async update(args: unknown): Promise<InMemoryMetricsRow> {
          const { where, data } = args as {
            where: { id: number };
            data: Partial<InMemoryMetricsRow>;
          };

          const index = metricsTable.findIndex((m) => m.id === where.id);

          if (index === -1) {
            throw new Error('Metrics row not found');
          }

          const updated: InMemoryMetricsRow = {
            ...metricsTable[index],
            ...data,
          };

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

    // Verify that an event was recorded.
    expect(eventsTable).toHaveLength(1);
    expect(eventsTable[0].toolId).toBe('ehr-patient-api');

    // Verify that metrics were created.
    expect(metricsTable).toHaveLength(1);

    const metricsRow = metricsTable[0];

    expect(metricsRow.successCount).toBe(1);
    expect(metricsRow.failureCount).toBe(0);
    expect(metricsRow.totalLatencyMs).toBe(500);
  });

  it('should update metrics on subsequent execution events', async () => {
    const metricsTable: InMemoryMetricsRow[] = [
      {
        id: 1,
        tenantId: 'acme-health',
        toolId: 'ehr-patient-api',
        capability: 'patient.search',
        successCount: 1,
        failureCount: 0,
        totalLatencyMs: 500,
        avgLatencyMs: 500,
        avgReward: 0,
        lastUpdated: new Date(),
      },
    ];

    const eventsTable: InMemoryEventRow[] = [];

    const fakePrisma: PrismaMetricsClient = {
      toolExecutionEvent: {
        async create(args: unknown): Promise<InMemoryEventRow> {
          const { data } = args as {
            data: Omit<InMemoryEventRow, 'id'>;
          };

          const row: InMemoryEventRow = {
            id: eventsTable.length + 1,
            ...data,
          };

          eventsTable.push(row);

          return row;
        },
      },
      toolMetrics: {
        async findFirst(args: unknown): Promise<InMemoryMetricsRow | null> {
          const { where } = args as {
            where: {
              tenantId: string;
              toolId: string;
              capability: string;
            };
          };

          const row =
            metricsTable.find(
              (m) =>
                m.tenantId === where.tenantId &&
                m.toolId === where.toolId &&
                m.capability === where.capability,
            ) ?? null;

          return row;
        },

        async create(args: unknown): Promise<InMemoryMetricsRow> {
          const { data } = args as {
            data: Omit<InMemoryMetricsRow, 'id'>;
          };

          const row: InMemoryMetricsRow = {
            id: metricsTable.length + 1,
            ...data,
          };

          metricsTable.push(row);

          return row;
        },

        async update(args: unknown): Promise<InMemoryMetricsRow> {
          const { where, data } = args as {
            where: { id: number };
            data: Partial<InMemoryMetricsRow>;
          };

          const index = metricsTable.findIndex((m) => m.id === where.id);

          if (index === -1) {
            throw new Error('Metrics row not found');
          }

          const updated: InMemoryMetricsRow = {
            ...metricsTable[index],
            ...data,
          };

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
