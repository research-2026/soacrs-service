// src/coordination/application/PlanBuilderService.ts

import os from 'os';

import type { SemanticTask } from '../domain/SemanticTask';
import type {
  PlanCandidate,
  PlanSelection,
  PlanStep,
  PlanToolEndpointRef,
  TaskRoutingPlan,
} from '../domain/Plan';
import type { IToolRegistry, Tool } from '../domain/Tool';
import type { IMetricsRepository, ToolMetrics } from '../domain/Metrics';
import type { IPlanStore } from '../domain/Metrics';

import { createPlanId } from './PlanIdGenerator';
import type { CandidateScore, IScoringEngine, ScoringConfig } from './ScoringEngine';

/**
 * Dependencies required for building a Task Routing Plan (TRP).
 * Injected for testability and clean architecture separation.
 */
export type PlanBuilderDeps = {
  toolRegistry: IToolRegistry;
  metricsRepository: IMetricsRepository;
  planStore: IPlanStore;
  scoringEngine: IScoringEngine;
  scoringConfig: ScoringConfig;

  coordinator: {
    service: string;
    version: string;
    instance?: string;
  };

  schemaVersion?: string;
  now?: () => Date;
  planIdProvider?: () => string;
};

/**
 * PlanBuilderService converts a SemanticTask into a full executable TRP.
 */
export class PlanBuilderService {
  private readonly schemaVersion: string;
  private readonly now: () => Date;
  private readonly planIdProvider: () => string;

  public constructor(private readonly deps: PlanBuilderDeps) {
    this.schemaVersion = deps.schemaVersion ?? '1.0';
    this.now = deps.now ?? (() => new Date());
    this.planIdProvider = deps.planIdProvider ?? createPlanId;
  }

  /**
   * Build a complete TaskRoutingPlan from a SemanticTask.
   */
  public async buildPlan(task: SemanticTask): Promise<TaskRoutingPlan> {
    const createdAt = this.now().toISOString();
    const planId = this.planIdProvider();

    const instanceId =
      this.deps.coordinator.instance?.trim() ||
      process.env.SERVICE_INSTANCE_ID ||
      process.env.HOSTNAME ||
      os.hostname();

    const tenantId = task.context.tenant;
    const capability = task.goal.capability;

    // 1) Get tenant-scoped candidate tools that support the capability.
    const tools = await this.deps.toolRegistry.getToolsForCapability(tenantId, capability);

    if (tools.length === 0) {
      throw new Error(`No tools registered for tenant=${tenantId} capability=${capability}`);
    }

    // 2) Load metrics for each tool (cold start metrics may be null).
    const metricsByToolId = await this.loadMetricsMap(tenantId, capability, tools);

    // 3) Score + rank candidates (this call MUST include capability).
    const ranked = this.deps.scoringEngine.rankCandidates(
      tools,
      (toolId) => metricsByToolId.get(toolId) ?? null,
      this.deps.scoringConfig,
      capability,
    );

    const candidates: PlanCandidate[] = ranked.map((r) => ({
      toolId: r.toolId,
      score: r.score,
      explain: r.explain,
    }));

    // 4) Select primary + fallback (simple: best + next best).
    const selected = this.selectPrimary(ranked);
    const fallback = this.selectFallback(ranked, selected?.toolId);

    // 5) Build plan steps as a small state machine.
    const steps = this.buildSteps(task, tools, selected, fallback);

    // 6) Build TRP envelope.
    const plan: TaskRoutingPlan = {
      planId,
      schemaVersion: this.schemaVersion,
      createdAt,
      coordinator: {
        service: this.deps.coordinator.service,
        version: this.deps.coordinator.version,
        instance: instanceId,
      },

      // IMPORTANT: PlanContext extends TaskContext, so tenant MUST be included.
      context: {
        ...task.context,
        requester: task.requester,
      },

      goal: task.goal,

      // TRP requires constraints object; SemanticTask.constraints is optional.
      constraints: {
        ...(task.constraints ?? {}),
      },

      // Policy is stubbed for now; later plug a PolicyService without breaking contracts.
      policy: {
        preconditionsPassed: true,
        policyDecision: 'allow',
        postConditions: {
          type: 'object',
          required: [],
          properties: {},
        },
      },

      candidates,
      selected: selected ?? undefined,

      retry: {
        maxAttemptsPerStep: 1,
        backoff: { type: 'exponential', initialMs: 100, factor: 2.0, jitter: true },
      },

      telemetry: {
        emitTraceEvents: true,
        metricsLabels: { tenant: tenantId, capability },
        callbacks: {
          progress: { type: 'none' },
          completion: { type: 'none' },
        },
      },

      security: {
        auth: {
          mode: 'service_token',
          tokenRef: 'secret://soacrs/service-token',
          audience: 'orchestrator',
        },
        dataHandling: {
          maskInLogs: [],
          deleteOutputAfterMs: 300000,
        },
      },

      steps,
    };

    // 7) Persist plan for auditing/debugging.
    await this.deps.planStore.savePlan(plan.planId, plan);

    return plan;
  }

  private async loadMetricsMap(
    tenantId: string,
    capability: string,
    tools: Tool[],
  ): Promise<Map<string, ToolMetrics | null>> {
    const rows = await Promise.all(
      tools.map(async (tool) => {
        const metrics = await this.deps.metricsRepository.getMetrics(tenantId, tool.id, capability);
        return [tool.id, metrics] as const;
      }),
    );

    return new Map(rows);
  }

  private selectPrimary(scores: CandidateScore[]): PlanSelection | null {
    if (scores.length === 0) return null;

    return {
      toolId: scores[0].toolId,
      reason: 'highest_score',
      rank: 1,
    };
  }

  private selectFallback(scores: CandidateScore[], selectedToolId?: string): PlanSelection | null {
    const fallback = scores.find((s) => s.toolId !== selectedToolId) ?? null;

    if (!fallback) return null;

    return {
      toolId: fallback.toolId,
      reason: 'next_best',
      rank: 2,
    };
  }

  private buildSteps(
    task: SemanticTask,
    tools: Tool[],
    selected: PlanSelection | null,
    fallback: PlanSelection | null,
  ): PlanStep[] {
    if (!selected) return [];

    const primaryTool = tools.find((t) => t.id === selected.toolId);
    if (!primaryTool) {
      throw new Error(`Selected tool not found in tool list: ${selected.toolId}`);
    }

    const step1: PlanStep = {
      id: 'step-1',
      name: 'Primary execution',
      action: 'invoke_tool',
      toolRef: {
        toolId: primaryTool.id,
        endpoint: this.extractEndpoint(primaryTool),
      },
      input: task.goal.input,
      expectedOutput: 'policy.postConditions',
      onSuccess: { completePlan: fallback === null },
      onFailure: fallback
        ? { goto: 'step-2', record: 'fallback' }
        : { terminate: { status: 'failure', error: 'PRIMARY_FAILED' } },
      onTimeout: { terminate: { status: 'timeout', error: 'per-tool-timeout' } },
    };

    if (!fallback) return [step1];

    const fallbackTool = tools.find((t) => t.id === fallback.toolId);
    if (!fallbackTool) return [step1];

    const step2: PlanStep = {
      id: 'step-2',
      name: 'Fallback execution',
      action: 'invoke_tool',
      toolRef: {
        toolId: fallbackTool.id,
        endpoint: this.extractEndpoint(fallbackTool),
      },
      input: task.goal.input,
      expectedOutput: 'policy.postConditions',
      onSuccess: { completePlan: true },
      onFailure: { terminate: { status: 'failure', error: 'ALL_CANDIDATES_FAILED' } },
      onTimeout: { terminate: { status: 'timeout', error: 'per-tool-timeout' } },
    };

    return [step1, step2];
  }

  /**
   * Extract typed endpoint details from tool.meta.endpoint if present.
   * Returns undefined if not valid (orchestrator could resolve endpoints later).
   */
  private extractEndpoint(tool: Tool): PlanToolEndpointRef['endpoint'] | undefined {
    const meta = tool.meta;
    if (!meta || typeof meta !== 'object') return undefined;

    const endpointCandidate = (meta as Record<string, unknown>).endpoint;
    if (!endpointCandidate || typeof endpointCandidate !== 'object') return undefined;

    if (!isPlanEndpoint(endpointCandidate)) return undefined;

    return endpointCandidate;
  }
}

/**
 * Runtime type-guard for endpoint object.
 * Keeps PlanBuilderService type-safe without `any`.
 */
function isPlanEndpoint(value: unknown): value is PlanToolEndpointRef['endpoint'] {
  if (!value || typeof value !== 'object') return false;

  const rec = value as Record<string, unknown>;

  return (
    rec.type === 'http' &&
    typeof rec.url === 'string' &&
    (rec.method === 'GET' ||
      rec.method === 'POST' ||
      rec.method === 'PUT' ||
      rec.method === 'DELETE') &&
    typeof rec.timeoutMs === 'number'
  );
}
