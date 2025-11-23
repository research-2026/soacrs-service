/**
 * Domain-level tests for TaskRoutingPlan model.
 *
 * These tests ensure that we can construct a realistic TaskRoutingPlan
 * object that matches the intended JSON structure.
 */

import type { SemanticTask } from '../../src/coordination/domain/SemanticTask';
import type { TaskRoutingPlan } from '../../src/coordination/domain/Plan';

describe('TaskRoutingPlan domain model', () => {
  it('should allow constructing a valid TaskRoutingPlan based on a SemanticTask', () => {
    const semanticTask: SemanticTask = {
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

    const plan: TaskRoutingPlan = {
      planId: 'tr_example',
      schemaVersion: '1.0',
      createdAt: new Date().toISOString(),
      coordinator: {
        service: 'SOACRS',
        version: '0.1.0',
        instance: 'soacrs-local',
      },
      context: {
        ...semanticTask.context,
        requester: semanticTask.requester,
      },
      goal: semanticTask.goal,
      constraints: {
        ...semanticTask.constraints,
        denyNetworkWhen: 'never',
      },
      policy: {
        preconditionsPassed: true,
        policyDecision: 'allow',
        postConditions: {
          type: 'object',
          required: ['patientId'],
        },
      },
      candidates: [
        {
          toolId: 'ehr-patient-api',
          score: 0.9,
          explain: {
            capabilityFit: 1.0,
            slaLikelihood: 0.85,
            pastReward: 0.5,
            normalizedCost: 0.2,
            weights: {
              fit: 0.5,
              sla: 0.25,
              reward: 0.15,
              cost: 0.1,
            },
          },
        },
      ],
      selected: {
        toolId: 'ehr-patient-api',
        reason: 'highest_score',
        rank: 1,
      },
      retry: {
        maxAttemptsPerStep: 1,
        backoff: {
          type: 'exponential',
          initialMs: 100,
          factor: 2,
          jitter: true,
        },
      },
      telemetry: {
        emitTraceEvents: true,
        metricsLabels: {
          tenant: semanticTask.context.tenant,
          capability: semanticTask.goal.capability,
        },
        callbacks: {
          progress: { type: 'none' },
          completion: { type: 'none' },
        },
      },
      security: {
        auth: {
          mode: 'service_token',
          tokenRef: 'secret://soacrs/ehr-token',
          audience: 'ehr.example.com',
        },
        dataHandling: {
          maskInLogs: ['input.mrn', 'output.demographics'],
          deleteOutputAfterMs: 300000,
        },
      },
      steps: [
        {
          id: 'step-1',
          name: 'Primary EHR lookup',
          action: 'invoke_tool',
          toolRef: {
            toolId: 'ehr-patient-api',
            endpoint: {
              type: 'http',
              url: 'https://ehr.example.com/api/patient',
              method: 'POST',
              timeoutMs: 800,
            },
          },
          input: { mrn: '12345' },
          expectedOutput: 'policy.postConditions',
          onSuccess: {
            completePlan: true,
          },
          onFailure: {
            goto: 'step-2',
            record: 'fallback',
          },
          onTimeout: {
            terminate: {
              status: 'timeout',
              error: 'per-tool-timeout',
            },
          },
        },
        {
          id: 'step-2',
          name: 'Fallback EHR lookup',
          action: 'invoke_tool',
          toolRef: {
            toolId: 'ehr-patient-api',
          },
          input: { mrn: '12345' },
          expectedOutput: 'policy.postConditions',
          onSuccess: {
            completePlan: true,
          },
          onFailure: {
            terminate: {
              status: 'failure',
              error: 'fallback-failed',
            },
          },
          onTimeout: {
            terminate: {
              status: 'timeout',
              error: 'per-tool-timeout',
            },
          },
        },
      ],
    };

    expect(plan.planId).toBe('tr_example');
    expect(plan.goal.capability).toBe('patient.search');
    expect(plan.context.tenant).toBe('acme-health');
    expect(plan.candidates[0].toolId).toBe('ehr-patient-api');
    expect(plan.steps[0].toolRef.toolId).toBe('ehr-patient-api');
  });
});
