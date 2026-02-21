// tests/http/plan.endpoint.test.ts

import request from 'supertest';

import { createApp } from '../../src/app';
import type { SemanticTask } from '../../src/coordination/domain/SemanticTask';
import type { TaskRoutingPlan } from '../../src/coordination/domain/Plan';

describe('POST /v1/plan (SOA-S16)', () => {
  const validTask: SemanticTask = {
    context: {
      tenant: 'tenant-1',
      correlationId: 'corr-1',
      idempotencyKey: 'idem-1',
      locale: 'en-LK',
      region: 'LK',
    },
    requester: { type: 'user', id: 'u-1', scopes: ['plan:write'] },
    goal: { capability: 'patient.search', input: { q: 'john' } },
    constraints: {
      overallTimeoutMs: 10_000,
      maxParallel: 1,
      costBudget: 1.5,
      privacyTags: ['phi'],
    },
  };

  test('200 returns TRP JSON when payload is valid', async () => {
    const fakePlan: TaskRoutingPlan = {
      planId: 'plan-1',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      coordinator: { service: 'soacrs-service', version: '0.1.0' },
      context: { ...validTask.context, requester: validTask.requester },
      goal: validTask.goal,
      constraints: { ...(validTask.constraints ?? {}) },
      policy: { preconditionsPassed: true, policyDecision: 'allow' },
      candidates: [],
      selected: { toolId: 'tool-a', reason: 'highest_score', rank: 1 },
      steps: [],
    };

    const planBuilder = {
      buildPlan: async (_task: SemanticTask) => fakePlan,
    };

    const app = createApp({ planBuilder });
    const res = await request(app).post('/v1/plan').send(validTask).expect(200);

    expect(res.body.planId).toBe('plan-1');
    expect(res.body.selected.toolId).toBe('tool-a');
  });

  test('400 returns VALIDATION_ERROR when payload is invalid', async () => {
    const invalid = {
      context: { tenant: '' }, // invalid tenant
      requester: { type: 'user', id: 'u-1' },
      goal: { capability: 'patient.search', input: {} },
    };

    const app = createApp({
      planBuilder: { buildPlan: async () => Promise.reject(new Error('should_not_run')) },
    });

    const res = await request(app).post('/v1/plan').send(invalid).expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.issues)).toBe(true);
  });
});
