import request from 'supertest';

import { createApp } from '../../src/app';
import { TelemetryHandler } from '../../src/telemetry/application/TelemetryHandler';
import { MetricsService } from '../../src/telemetry/application/MetricsService';

import type {
  IMetricsRepository,
  ToolExecutionEvent,
  ToolMetrics,
} from '../../src/coordination/domain/Metrics';

describe('Telemetry endpoints (SOA-S17)', () => {
  test('POST /v1/telemetry/execution -> 202 accepted (valid payload)', async () => {
    const recordExecution = jest.fn<Promise<void>, [ToolExecutionEvent]>(async () => undefined);
    const getMetrics = jest.fn<Promise<ToolMetrics | null>, [string, string, string]>(
      async () => null,
    );
    const saveMetrics = jest.fn<Promise<void>, [ToolMetrics]>(async () => undefined);

    const repo: IMetricsRepository = { recordExecution, getMetrics, saveMetrics };
    const metricsService = new MetricsService(repo);
    const handler = new TelemetryHandler(metricsService);
    const app = createApp({ telemetryHandler: handler });

    const payload = {
      schemaVersion: '1.0',
      type: 'execution',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      stepId: 'step-1',
      toolId: 'tool-a',
      capability: 'patient.search',
      success: true,
      latencyMs: 120,
      timestamp: new Date().toISOString(),
    };

    const res = await request(app).post('/v1/telemetry/execution').send(payload).expect(202);
    expect(res.body.status).toBe('accepted');

    expect(recordExecution).toHaveBeenCalledTimes(1);

    const arg = recordExecution.mock.calls[0]?.[0];
    if (!arg) throw new Error('Expected recordExecution to be called with ToolExecutionEvent');

    // Validate DTO -> domain mapping
    expect(arg.planId).toBe('plan-1');
    expect(arg.stepId).toBe('step-1');
    expect(arg.tenantId).toBe('tenant-1');
    expect(arg.toolId).toBe('tool-a');
    expect(arg.capability).toBe('patient.search');
    expect(arg.success).toBe(true);
    expect(arg.latencyMs).toBe(120);
  });

  test('POST /v1/telemetry/execution -> 400 validation error (invalid payload)', async () => {
    const recordExecution = jest.fn<Promise<void>, [ToolExecutionEvent]>(async () => undefined);
    const getMetrics = jest.fn<Promise<ToolMetrics | null>, [string, string, string]>(
      async () => null,
    );
    const saveMetrics = jest.fn<Promise<void>, [ToolMetrics]>(async () => undefined);

    const repo: IMetricsRepository = { recordExecution, getMetrics, saveMetrics };
    const handler = new TelemetryHandler(new MetricsService(repo));
    const app = createApp({ telemetryHandler: handler });

    const invalid = {
      schemaVersion: '1.0',
      type: 'execution',
      // tenantId missing
      planId: 'plan-1',
      stepId: 'step-1',
      toolId: 'tool-a',
      capability: 'patient.search',
      success: true,
      latencyMs: 120,
      timestamp: new Date().toISOString(),
    };

    const res = await request(app).post('/v1/telemetry/execution').send(invalid).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.issues)).toBe(true);
    expect(recordExecution).toHaveBeenCalledTimes(0);
  });

  test('POST /v1/telemetry/feedback -> 202 accepted (valid payload)', async () => {
    const recordExecution = jest.fn<Promise<void>, [ToolExecutionEvent]>(async () => undefined);
    const getMetrics = jest.fn<Promise<ToolMetrics | null>, [string, string, string]>(
      async () => null,
    );

    // ✅ IMPORTANT: typed mock so calls[] has ToolMetrics, not never
    const saveMetrics = jest.fn<Promise<void>, [ToolMetrics]>(async () => undefined);

    const repo: IMetricsRepository = { recordExecution, getMetrics, saveMetrics };

    const metricsService = new MetricsService(repo, {
      now: () => new Date('2026-02-22T00:00:00.000Z'),
    });

    const handler = new TelemetryHandler(metricsService);
    const app = createApp({ telemetryHandler: handler });

    const payload = {
      schemaVersion: '1.0',
      type: 'feedback',
      tenantId: 'tenant-1',
      planId: 'plan-1',
      toolId: 'tool-a',
      capability: 'patient.search',
      reward: 0.7,
      timestamp: new Date().toISOString(),
      source: 'user',
      comment: 'Worked great',
    };

    const res = await request(app).post('/v1/telemetry/feedback').send(payload).expect(202);
    expect(res.body.status).toBe('accepted');

    expect(saveMetrics).toHaveBeenCalledTimes(1);

    // ✅ Safe read (no tuple/undefined problems)
    const saved = saveMetrics.mock.calls[0]?.[0];
    if (!saved) throw new Error('Expected ToolMetrics to be saved');

    expect(saved.tenantId).toBe('tenant-1');
    expect(saved.toolId).toBe('tool-a');
    expect(saved.capability).toBe('patient.search');
    expect(saved.avgReward).toBe(0.7);
  });
});
