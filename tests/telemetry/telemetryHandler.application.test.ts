/**
 * TelemetryHandler tests (SOA-S14)
 * -------------------------------
 * Proves that telemetry payloads actually update metrics via IMetricsRepository.
 *
 * These are pure unit tests:
 * - No Prisma
 * - No DB
 * - No HTTP server
 */

import type {
  IMetricsRepository,
  ToolExecutionEvent,
  ToolMetrics,
} from '../../src/coordination/domain/Metrics';

import { TelemetryDtoValidationError } from '../../src/telemetry/dto/TelemetryDtoValidationError';
import { MetricsService } from '../../src/telemetry/application/MetricsService';
import { TelemetryHandler } from '../../src/telemetry/application/TelemetryHandler';

describe('TelemetryHandler (SOA-S14)', () => {
  it('records execution telemetry by calling repo.recordExecution with a proper ToolExecutionEvent', async () => {
    const recorded: ToolExecutionEvent[] = [];

    const repo: IMetricsRepository = {
      async recordExecution(event: ToolExecutionEvent): Promise<void> {
        recorded.push(event);
      },
      async getMetrics(): Promise<ToolMetrics | null> {
        return null;
      },
      async saveMetrics(): Promise<void> {
        // not used for execution telemetry in this test
      },
    };

    const handler = new TelemetryHandler(new MetricsService(repo));

    const payload = {
      schemaVersion: '1.0',
      type: 'execution',
      tenantId: 'acme-health',
      planId: 'tr_demo_1',
      stepId: 'step-1',
      toolId: 'ehr-patient-api',
      capability: 'patient.create',
      latencyMs: 420,
      success: true,
      timestamp: '2026-02-19T00:00:00.000Z',
    };

    await handler.handleExecutionTelemetry(payload);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toEqual({
      planId: 'tr_demo_1',
      stepId: 'step-1',
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      capability: 'patient.create',
      latencyMs: 420,
      success: true,
      errorCode: undefined,
      timestamp: '2026-02-19T00:00:00.000Z',
    });
  });

  it('updates avgReward via feedback telemetry (EWMA) and persists through repo.saveMetrics', async () => {
    // old avgReward = 0.0, new reward = 1.0, alpha=0.2 => new avgReward = 0.2
    let metrics: ToolMetrics | null = {
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      capability: 'patient.create',
      successCount: 10,
      failureCount: 2,
      totalLatencyMs: 6000,
      avgReward: 0,
      lastUpdated: '2026-02-18T00:00:00.000Z',
    };

    const saved: ToolMetrics[] = [];

    const repo: IMetricsRepository = {
      async recordExecution(): Promise<void> {
        throw new Error('Not used in this test');
      },
      async getMetrics(): Promise<ToolMetrics | null> {
        return metrics;
      },
      async saveMetrics(next: ToolMetrics): Promise<void> {
        metrics = next;
        saved.push(next);
      },
    };

    const handler = new TelemetryHandler(
      new MetricsService(repo, {
        rewardEwmaAlpha: 0.2,
        now: () => new Date('2026-02-19T00:00:00.000Z'),
      }),
    );

    const payload = {
      schemaVersion: '1.0',
      type: 'feedback',
      tenantId: 'acme-health',
      planId: 'tr_demo_1',
      stepId: 'step-1',
      toolId: 'ehr-patient-api',
      capability: 'patient.create',
      reward: 1.0,
      timestamp: '2026-02-19T00:00:00.000Z',
      source: 'user',
      comment: 'Worked perfectly',
    };

    await handler.handleFeedbackTelemetry(payload);

    expect(saved).toHaveLength(1);
    expect(saved[0].avgReward).toBeCloseTo(0.2, 6);
    expect(saved[0].lastUpdated).toBe('2026-02-19T00:00:00.000Z');
  });

  it('creates metrics if feedback arrives before any execution metrics exist', async () => {
    const saved: ToolMetrics[] = [];

    const repo: IMetricsRepository = {
      async recordExecution(): Promise<void> {
        throw new Error('Not used in this test');
      },
      async getMetrics(): Promise<ToolMetrics | null> {
        return null;
      },
      async saveMetrics(next: ToolMetrics): Promise<void> {
        saved.push(next);
      },
    };

    const handler = new TelemetryHandler(
      new MetricsService(repo, { now: () => new Date('2026-02-19T00:00:00.000Z') }),
    );

    const payload = {
      schemaVersion: '1.0',
      type: 'feedback',
      tenantId: 'acme-health',
      planId: 'tr_demo_1',
      toolId: 'ehr-patient-api',
      capability: 'patient.create',
      reward: -0.5,
      timestamp: '2026-02-19T00:00:00.000Z',
    };

    await handler.handleFeedbackTelemetry(payload);

    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual({
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      capability: 'patient.create',
      successCount: 0,
      failureCount: 0,
      totalLatencyMs: 0,
      avgReward: -0.5,
      lastUpdated: '2026-02-19T00:00:00.000Z',
    });
  });

  it('rejects invalid telemetry payloads (DTO validation error)', async () => {
    const repo: IMetricsRepository = {
      async recordExecution(): Promise<void> {},
      async getMetrics(): Promise<ToolMetrics | null> {
        return null;
      },
      async saveMetrics(): Promise<void> {},
    };

    const handler = new TelemetryHandler(new MetricsService(repo));

    // Missing tenantId => should be rejected by DTO parser
    const badPayload = {
      schemaVersion: '1.0',
      type: 'execution',
      planId: 'tr_demo_1',
      stepId: 'step-1',
      toolId: 'ehr-patient-api',
      capability: 'patient.create',
      latencyMs: 100,
      success: true,
      timestamp: '2026-02-19T00:00:00.000Z',
    };

    await expect(handler.handleExecutionTelemetry(badPayload)).rejects.toBeInstanceOf(
      TelemetryDtoValidationError,
    );
  });
});
