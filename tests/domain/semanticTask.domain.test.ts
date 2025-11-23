/**
 * Domain-level tests for the SemanticTask model.
 *
 * This test ensures that we can construct a valid SemanticTask object
 * that matches the intended shape used by SOACRS.
 */

import type { SemanticTask } from '../../src/coordination/domain/SemanticTask';

describe('SemanticTask domain model', () => {
  it('should allow constructing a valid SemanticTask object', () => {
    const task: SemanticTask = {
      context: {
        tenant: 'acme-health',
        correlationId: 'c-123',
        idempotencyKey: 'idem-456',
        locale: 'en-US',
        region: 'us-east-1',
      },
      requester: {
        type: 'service',
        id: 'llm-app',
        scopes: ['patient.read', 'tool.invoke'],
      },
      goal: {
        capability: 'patient.search',
        input: { mrn: '12345' },
        description: 'Find patient by MRN',
      },
      constraints: {
        overallTimeoutMs: 2000,
        maxParallel: 1,
        costBudget: 1.0,
        privacyTags: ['phi', 'patient-id'],
      },
    };

    // Basic shape checks
    expect(task.context.tenant).toBe('acme-health');
    expect(task.requester.type).toBe('service');
    expect(task.goal.capability).toBe('patient.search');
    expect(task.goal.input).toEqual({ mrn: '12345' });

    // Optional constraints should be present and correctly typed
    expect(task.constraints?.overallTimeoutMs).toBe(2000);
    expect(task.constraints?.maxParallel).toBe(1);
  });
});
