/**
 * SOA-S15 — Learning loop validation (Scenario Test)
 *
 * Goal:
 *  1) Cold start: generate a plan with NO metrics -> cheaper tool should win
 *  2) Submit telemetry/feedback that improves Tool B
 *  3) Generate the same plan again -> Tool B should become the selected tool
 *
 * This is the "proof of learning" test you can show to the panel:
 * Telemetry -> Metrics update -> Score changes -> Tool selection changes.
 */

import type { SemanticTask } from '../../src/coordination/domain/SemanticTask';
import type { TaskRoutingPlan } from '../../src/coordination/domain/Plan';
import type { IToolRegistry, Tool } from '../../src/coordination/domain/Tool';
import type {
  IMetricsRepository,
  ToolExecutionEvent,
  ToolMetrics,
} from '../../src/coordination/domain/Metrics';
import type { IPlanStore } from '../../src/coordination/domain/PlanStore';

import { PlanBuilderService } from '../../src/coordination/application/PlanBuilderService';
import {
  ScoringEngine,
  defaultScoringConfig,
} from '../../src/coordination/application/ScoringEngine';

class InMemoryPlanStore implements IPlanStore {
  private readonly plans = new Map<string, unknown>();

  async savePlan(planId: string, planJson: unknown): Promise<void> {
    this.plans.set(planId, planJson);
  }

  async getPlan(planId: string): Promise<unknown | null> {
    return this.plans.get(planId) ?? null;
  }
}

/**
 * In-memory MetricsRepository used ONLY for scenario testing.
 * This simulates what your real PostgresMetricsRepository does:
 * - recordExecution() aggregates success/failure and latency totals
 * - saveMetrics() updates stored metrics (used here to inject reward feedback)
 */
class InMemoryMetricsRepository implements IMetricsRepository {
  private readonly metrics = new Map<string, ToolMetrics>();

  private key(tenantId: string, toolId: string, capability: string): string {
    return `${tenantId}::${toolId}::${capability}`;
  }

  async getMetrics(
    tenantId: string,
    toolId: string,
    capability: string,
  ): Promise<ToolMetrics | null> {
    return this.metrics.get(this.key(tenantId, toolId, capability)) ?? null;
  }

  async recordExecution(event: ToolExecutionEvent): Promise<void> {
    const k = this.key(event.tenantId, event.toolId, event.capability);
    const existing = this.metrics.get(k);

    // If metrics do not exist yet, create them on first telemetry event.
    const base: ToolMetrics =
      existing ??
      ({
        tenantId: event.tenantId,
        toolId: event.toolId,
        capability: event.capability,
        successCount: 0,
        failureCount: 0,
        totalLatencyMs: 0,
        avgReward: 0, // reward comes via feedback telemetry later
        lastUpdated: new Date().toISOString(),
      } satisfies ToolMetrics);

    const updated: ToolMetrics = {
      ...base,
      successCount: base.successCount + (event.success ? 1 : 0),
      failureCount: base.failureCount + (event.success ? 0 : 1),
      totalLatencyMs: base.totalLatencyMs + event.latencyMs,
      lastUpdated: event.timestamp,
    };

    this.metrics.set(k, updated);
  }

  async saveMetrics(metrics: ToolMetrics): Promise<void> {
    const k = this.key(metrics.tenantId, metrics.toolId, metrics.capability);
    this.metrics.set(k, metrics);
  }
}

describe('SOA-S15 Learning loop scenario', () => {
  it('should switch selection after telemetry improves a previously weaker tool', async () => {
    // ------------------------------------------------------------
    // 1) Arrange: two tools that support the SAME capability.
    //    On cold-start, both have no metrics -> defaults apply.
    //    Only cost differs: Tool A is cheaper, so it should win first.
    // ------------------------------------------------------------
    const capability = 'patient.create';

    const toolA: Tool = {
      id: 'ehr-patient-api',
      name: 'EHR Patient API',
      version: '1.0.0',
      region: 'us-east-1',
      baseCost: 0.1, // cheaper -> should win on cold start
      meta: {
        endpoint: {
          type: 'http',
          url: 'https://ehr.example.com/api/patient',
          method: 'POST',
          timeoutMs: 800,
        },
      },
      capabilities: [{ name: capability }],
    };

    const toolB: Tool = {
      id: 'legacy-rpa-screen-scraper',
      name: 'Legacy RPA Scraper',
      version: '1.0.0',
      region: 'us-east-1',
      baseCost: 0.2, // more expensive -> loses on cold start
      meta: {
        endpoint: {
          type: 'http',
          url: 'https://rpa.example.com/run/patient_create',
          method: 'POST',
          timeoutMs: 1200,
        },
      },
      capabilities: [{ name: capability }],
    };

    const toolRegistry: IToolRegistry = {
      async getToolsForCapability(tenantId: string, requestedCapability: string): Promise<Tool[]> {
        expect(tenantId).toBe('acme-health');
        expect(requestedCapability).toBe(capability);
        return [toolA, toolB];
      },
    };

    const metricsRepo = new InMemoryMetricsRepository();
    const planStore = new InMemoryPlanStore();

    const planBuilder = new PlanBuilderService({
      toolRegistry,
      metricsRepository: metricsRepo,
      planStore,
      scoringEngine: new ScoringEngine(),
      scoringConfig: defaultScoringConfig,
      coordinator: { service: 'SOACRS', version: '0.1.0', instance: 'soacrs-test' },
      schemaVersion: '1.0',
      // deterministic clock + planId so test is stable
      now: () => new Date('2025-10-16T13:02:11.123Z'),
      planIdProvider: () => 'tr_learning_loop_test',
    });

    const task: SemanticTask = {
      context: {
        tenant: 'acme-health',
        correlationId: 'corr-learning-1',
        idempotencyKey: 'idem-learning-1',
        locale: 'en-US',
        region: 'us-east-1',
      },
      requester: { type: 'service', id: 'demo-client', scopes: ['patient.write', 'tool.invoke'] },
      goal: {
        capability,
        input: {
          patientName: 'Mufthi',
          address: 'Kandy',
          dob: '2002-02-11',
          sex: 'Male',
        },
        description: 'Create a patient record',
      },
      constraints: {
        overallTimeoutMs: 2000,
        maxParallel: 1,
        costBudget: 1.0,
        privacyTags: ['phi'],
      },
    };

    // ------------------------------------------------------------
    // 2) Cold start: build plan with NO metrics.
    //    Expected: Tool A selected because it is cheaper.
    // ------------------------------------------------------------
    const plan1: TaskRoutingPlan = await planBuilder.buildPlan(task);

    expect(plan1.candidates).toHaveLength(2);
    expect(plan1.selected?.toolId).toBe(toolA.id);
    expect(plan1.steps[0].toolRef.toolId).toBe(toolA.id);
    expect(plan1.steps[1].toolRef.toolId).toBe(toolB.id);

    // ------------------------------------------------------------
    // 3) Submit telemetry that improves Tool B.
    //    We simulate:
    //      - Tool B succeeds quickly (low latency) -> SLA likelihood increases
    //      - Tool B gets high reward feedback -> pastReward increases
    //
    //    NOTE: avgReward in ToolMetrics is assumed in [-1..+1].
    // ------------------------------------------------------------
    const execEventForB: ToolExecutionEvent = {
      planId: plan1.planId,
      stepId: 'step-2',
      tenantId: task.context.tenant,
      toolId: toolB.id,
      capability,
      latencyMs: 200, // fast
      success: true, // successful
      errorCode: undefined,
      timestamp: new Date('2025-10-16T13:05:00.000Z').toISOString(),
    };

    await metricsRepo.recordExecution(execEventForB);

    const bMetrics = await metricsRepo.getMetrics(task.context.tenant, toolB.id, capability);
    expect(bMetrics).not.toBeNull();

    // Apply strong positive reward feedback to Tool B (avgReward = +1 => pastReward = 1.0)
    await metricsRepo.saveMetrics({
      ...(bMetrics as ToolMetrics),
      avgReward: 1.0,
      lastUpdated: new Date('2025-10-16T13:06:00.000Z').toISOString(),
    });

    // ------------------------------------------------------------
    // 4) Build the plan again.
    //    Expected: Tool B becomes selected now (learning effect).
    // ------------------------------------------------------------
    const plan2: TaskRoutingPlan = await planBuilder.buildPlan(task);

    expect(plan2.candidates).toHaveLength(2);
    expect(plan2.selected?.toolId).toBe(toolB.id);

    // Steps should flip: step-1 is now Tool B, step-2 fallback is Tool A
    expect(plan2.steps[0].toolRef.toolId).toBe(toolB.id);
    expect(plan2.steps[1].toolRef.toolId).toBe(toolA.id);
  });
});
