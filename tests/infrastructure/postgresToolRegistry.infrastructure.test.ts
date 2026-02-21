// tests/infrastructure/postgresMetricsRepository.infrastructure.test.ts
/**
 * Infrastructure tests for PostgresPlanStore.
 *
 * Verifies:
 * - Plans are persisted with correct tenantId + capability + planJson.
 * - Plans can be retrieved by planId.
 * - Missing plans return null.
 */

import {
  PostgresPlanStore,
  type PrismaPlanClient,
} from '../../src/coordination/infrastructure/PostgresPlanStore';

import type { TaskRoutingPlan } from '../../src/coordination/domain/Plan';

type InMemoryPlanRow = {
  planId: string;
  tenantId: string;
  capability: string;
  createdAt: Date;
  planJson: unknown;
};

describe('PostgresPlanStore', () => {
  it('should save and retrieve a plan by planId', async () => {
    const rows: InMemoryPlanRow[] = [];

    const fakePrisma: PrismaPlanClient = {
      planDocument: {
        async create(args: unknown): Promise<unknown> {
          const { data } = args as { data: InMemoryPlanRow };
          rows.push(data);
          return data;
        },

        async findFirst(args: unknown): Promise<InMemoryPlanRow | null> {
          const { where } = args as { where: { planId: string } };
          return rows.find((r) => r.planId === where.planId) ?? null;
        },
      },
    };

    const store = new PostgresPlanStore(fakePrisma);

    const samplePlan: TaskRoutingPlan = {
      planId: 'plan-123',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      coordinator: {
        service: 'SOACRS',
        version: '0.1.0',
        instance: 'soacrs-test-instance',
      },
      context: {
        tenant: 'acme-health',
        requester: { type: 'service', id: 'llm-app', scopes: ['patient.read'] },
        correlationId: 'corr-1',
        idempotencyKey: 'idem-1',
        locale: 'en-US',
        region: 'us-east-1',
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
        privacyTags: ['phi'],
        denyNetworkWhen: 'never',
      },
      policy: {
        preconditionsPassed: true,
        policyDecision: 'allow',
        postConditions: {
          type: 'object',
          required: ['patientId'],
          properties: { patientId: { type: 'string' } },
        },
      },
      candidates: [],
      retry: {
        maxAttemptsPerStep: 1,
        backoff: { type: 'exponential', initialMs: 100, factor: 2.0, jitter: true },
      },
      telemetry: {
        emitTraceEvents: true,
        metricsLabels: { tenant: 'acme-health', capability: 'patient.search' },
        callbacks: { progress: { type: 'none' }, completion: { type: 'none' } },
      },
      security: {
        auth: {
          mode: 'service_token',
          tokenRef: 'secret://soacrs/ehr-token',
          audience: 'ehr.example.com',
        },
        dataHandling: { maskInLogs: ['goal.input.mrn'], deleteOutputAfterMs: 300000 },
      },
      steps: [],
    };

    await store.savePlan(samplePlan.planId, samplePlan);

    const loaded = (await store.getPlan('plan-123')) as TaskRoutingPlan | null;

    expect(loaded).not.toBeNull();
    expect(loaded?.planId).toBe('plan-123');
    expect(loaded?.context.tenant).toBe('acme-health');
    expect(loaded?.goal.capability).toBe('patient.search');
  });

  it('should return null for a non-existent planId', async () => {
    const fakePrisma: PrismaPlanClient = {
      planDocument: {
        async create(_args: unknown): Promise<unknown> {
          throw new Error('Not used in this test');
        },
        async findFirst(_args: unknown): Promise<InMemoryPlanRow | null> {
          return null;
        },
      },
    };

    const store = new PostgresPlanStore(fakePrisma);
    const loaded = (await store.getPlan('does-not-exist')) as TaskRoutingPlan | null;

    expect(loaded).toBeNull();
  });
});
