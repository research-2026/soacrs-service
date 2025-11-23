/**
 * Domain-level tests for Tool, ToolMetrics and ToolExecutionEvent models.
 *
 * These tests ensure that we can construct valid objects that match the
 * intended shapes used by SOACRS.
 */

import type { Tool, ToolCapability } from '../../src/coordination/domain/Tool';
import type {
  ToolExecutionEvent,
  ToolMetrics,
  ToolRegistryEntry,
} from '../../src/coordination/domain/Metrics';

describe('Tool and Metrics domain models', () => {
  it('should allow constructing a valid Tool object', () => {
    const capabilities: ToolCapability[] = [
      {
        name: 'patient.search',
        inputsSchema: { type: 'object' },
        outputsSchema: { type: 'object' },
      },
    ];

    const tool: Tool = {
      id: 'ehr-patient-api',
      name: 'EHR Patient API',
      version: '1.0.0',
      capabilities,
      region: 'us-east-1',
      baseCost: 0.2,
      meta: {
        slaTier: 'gold',
      },
    };

    expect(tool.id).toBe('ehr-patient-api');
    expect(tool.capabilities[0].name).toBe('patient.search');
    expect(tool.baseCost).toBe(0.2);
  });

  it('should allow constructing valid ToolMetrics and ToolExecutionEvent objects', () => {
    const metrics: ToolMetrics = {
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      capability: 'patient.search',
      successCount: 10,
      failureCount: 2,
      totalLatencyMs: 2500,
      avgReward: 0.9,
      lastUpdated: new Date().toISOString(),
    };

    const event: ToolExecutionEvent = {
      planId: 'tr_example',
      stepId: 'step-1',
      toolId: 'ehr-patient-api',
      capability: 'patient.search',
      tenantId: 'acme-health',
      latencyMs: 180,
      success: true,
      errorCode: null,
      timestamp: new Date().toISOString(),
    };

    const entry: ToolRegistryEntry = {
      tool: {
        id: 'ehr-patient-api',
        name: 'EHR Patient API',
        version: '1.0.0',
        capabilities: [{ name: 'patient.search' }],
      },
      metrics,
    };

    expect(metrics.successCount).toBe(10);
    expect(event.success).toBe(true);
    expect(entry.tool.id).toBe('ehr-patient-api');
    expect(entry.metrics?.capability).toBe('patient.search');
  });
});
