import type { SemanticTask } from '../../src/coordination/domain/SemanticTask';
import type { TaskRoutingPlan } from '../../src/coordination/domain/Plan';
import type { IToolRegistry, Tool } from '../../src/coordination/domain/Tool';
import type { IMetricsRepository, ToolMetrics } from '../../src/coordination/domain/Metrics';
import type { IPlanStore } from '../../src/coordination/domain/Metrics';

import { PlanBuilderService } from '../../src/coordination/application/PlanBuilderService';
import {
  ScoringEngine,
  defaultScoringConfig,
} from '../../src/coordination/application/ScoringEngine';

describe('PlanBuilderService', () => {
  it('should build a TRP with candidates, selected tool, fallback step, and persist the plan', async () => {
    const tools: Tool[] = [
      {
        id: 'ehr-patient-api',
        name: 'EHR Patient API',
        version: '1.0.0',
        region: 'us-east-1',
        baseCost: 0.2,
        meta: {
          endpoint: {
            type: 'http',
            url: 'https://ehr.example.com/api/patient',
            method: 'POST',
            timeoutMs: 800,
          },
        },
        capabilities: [{ name: 'patient.search' }],
      },
      {
        id: 'legacy-rpa-screen-scraper',
        name: 'Legacy RPA Scraper',
        version: '1.0.0',
        region: 'us-east-1',
        baseCost: 0.1,
        meta: {
          endpoint: {
            type: 'http',
            url: 'https://rpa.example.com/run/patient_lookup',
            method: 'POST',
            timeoutMs: 1200,
          },
        },
        capabilities: [{ name: 'patient.search' }],
      },
    ];

    const toolRegistry: IToolRegistry = {
      async getToolsForCapability(tenantId: string, capability: string): Promise<Tool[]> {
        expect(tenantId).toBe('acme-health');
        expect(capability).toBe('patient.search');
        return tools;
      },
    };

    const goodMetrics: ToolMetrics = {
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      capability: 'patient.search',
      successCount: 10,
      failureCount: 1,
      totalLatencyMs: 4000,
      avgReward: 0,
      lastUpdated: new Date().toISOString(),
    };

    const weakerMetrics: ToolMetrics = {
      tenantId: 'acme-health',
      toolId: 'legacy-rpa-screen-scraper',
      capability: 'patient.search',
      successCount: 6,
      failureCount: 4,
      totalLatencyMs: 9000,
      avgReward: 0,
      lastUpdated: new Date().toISOString(),
    };

    const metricsRepo: IMetricsRepository = {
      async getMetrics(
        tenantId: string,
        toolId: string,
        capability: string,
      ): Promise<ToolMetrics | null> {
        expect(tenantId).toBe('acme-health');
        expect(capability).toBe('patient.search');

        if (toolId === 'ehr-patient-api') return goodMetrics;
        if (toolId === 'legacy-rpa-screen-scraper') return weakerMetrics;

        return null;
      },

      async recordExecution(): Promise<void> {
        throw new Error('Not used in this test');
      },

      async saveMetrics(): Promise<void> {
        throw new Error('Not used in this test');
      },
    };

    const saved: { planId?: string; payload?: unknown } = {};

    const planStore: IPlanStore = {
      async savePlan(planId: string, planJson: unknown): Promise<void> {
        saved.planId = planId;
        saved.payload = planJson;
      },

      async getPlan(): Promise<unknown | null> {
        return null;
      },
    };

    const task: SemanticTask = {
      context: {
        tenant: 'acme-health',
        correlationId: 'c-1',
        idempotencyKey: 'idem-1',
        locale: 'en-US',
        region: 'us-east-1',
      },
      requester: { type: 'service', id: 'llm-app', scopes: ['patient.read', 'tool.invoke'] },
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
      },
    };

    const service = new PlanBuilderService({
      toolRegistry,
      metricsRepository: metricsRepo,
      planStore,
      scoringEngine: new ScoringEngine(),
      scoringConfig: defaultScoringConfig,
      coordinator: { service: 'SOACRS', version: '0.1.0', instance: 'soacrs-test' },
      schemaVersion: '1.0',
      now: () => new Date('2025-10-16T13:02:11.123Z'),
      planIdProvider: () => 'tr_test_plan_id',
    });

    const plan: TaskRoutingPlan = await service.buildPlan(task);

    expect(plan.planId).toBe('tr_test_plan_id');
    expect(plan.schemaVersion).toBe('1.0');
    expect(plan.coordinator.service).toBe('SOACRS');
    expect(plan.context.tenant).toBe('acme-health');
    expect(plan.goal.capability).toBe('patient.search');

    expect(plan.candidates).toHaveLength(2);
    expect(plan.selected?.toolId).toBe('ehr-patient-api');

    expect(plan.steps).toHaveLength(2);
    expect(plan.steps[0].toolRef.toolId).toBe('ehr-patient-api');
    expect(plan.steps[1].toolRef.toolId).toBe('legacy-rpa-screen-scraper');

    expect(saved.planId).toBe('tr_test_plan_id');
    expect(saved.payload).toBeTruthy();
  });
});
