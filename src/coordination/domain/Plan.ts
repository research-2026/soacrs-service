// src/coordination/domain/Plan.ts

/**
 * TaskRoutingPlan (TRP)
 *
 * Core output of SOACRS. Returned to the Orchestrator and describes:
 * - Context + goal
 * - Constraints
 * - Candidate tools + explainable scoring
 * - Selected tool
 * - Executable steps (state machine)
 * - Retry + telemetry + security hints
 */

import type { Requester, TaskConstraints, TaskContext, TaskGoal } from './SemanticTask';

// Re-export (type only) so other modules can import from Plan if needed.
export type { NetworkDenyMode } from './SemanticTask';

export type PlanPolicyDecision = 'allow' | 'deny';

export interface PlanCoordinatorInfo {
  service: string;
  version: string;
  instance?: string;
}

/**
 * Plan context extends SemanticTask context and embeds requester.
 * Because TaskContext includes `tenant`, PlanContext also includes it.
 */
export interface PlanContext extends TaskContext {
  requester: Requester;
}

/**
 * Plan constraints are currently the same shape as task constraints.
 * Orchestrator can read them directly.
 */
export interface PlanConstraints extends TaskConstraints {}

/**
 * Minimal JSON Schema compatible representation for post-conditions.
 */
export type JsonSchema = Record<string, unknown>;

export interface PlanPolicy {
  preconditionsPassed: boolean;
  policyDecision: PlanPolicyDecision;
  postConditions?: JsonSchema;
}

export interface CandidateScoreExplanation {
  capabilityFit: number;
  slaLikelihood: number;
  pastReward: number;
  normalizedCost: number;
  weights: {
    fit: number;
    sla: number;
    reward: number;
    cost: number;
  };
}

export interface PlanCandidate {
  toolId: string;
  score: number;
  explain: CandidateScoreExplanation;
}

export interface PlanSelection {
  toolId: string;
  reason: string;
  rank: number;
}

export interface PlanBackoffConfig {
  type: 'exponential' | 'fixed';
  initialMs: number;
  factor?: number;
  jitter?: boolean;
}

export interface PlanRetryPolicy {
  maxAttemptsPerStep: number;
  backoff: PlanBackoffConfig;
}

export interface PlanTelemetryConfig {
  emitTraceEvents: boolean;
  metricsLabels?: Record<string, string>;
  callbacks?: {
    progress?: { type: 'none' };
    completion?: { type: 'none' };
  };
}

export interface PlanSecurityConfig {
  auth?: {
    mode: 'service_token';
    tokenRef: string;
    audience?: string;
  };
  dataHandling?: {
    maskInLogs?: string[];
    deleteOutputAfterMs?: number;
  };
}

export interface PlanToolEndpointRef {
  toolId: string;
  endpoint?: {
    type: 'http';
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    timeoutMs: number;
  };
}

export interface PlanStepTransitionTerminate {
  terminate: {
    status: 'timeout' | 'failure';
    error: string;
  };
}

export interface PlanStepTransitionGoto {
  goto: string;
  record?: 'fallback';
}

export interface PlanStepOnSuccess {
  completePlan?: boolean;
  goto?: string;
}

export interface PlanStepTransitions {
  onSuccess?: PlanStepOnSuccess;
  onFailure?: PlanStepTransitionGoto | PlanStepTransitionTerminate;
  onTimeout?: PlanStepTransitionTerminate;
}

export interface PlanStep extends PlanStepTransitions {
  id: string;
  name: string;
  action: 'invoke_tool';
  toolRef: PlanToolEndpointRef;
  input: Record<string, unknown>;
  expectedOutput?: JsonSchema | string;
}

export interface TaskRoutingPlan {
  planId: string;
  schemaVersion: string;
  createdAt: string;

  coordinator: PlanCoordinatorInfo;
  context: PlanContext;
  goal: TaskGoal;
  constraints: PlanConstraints;
  policy: PlanPolicy;

  candidates: PlanCandidate[];
  selected?: PlanSelection;

  retry?: PlanRetryPolicy;
  telemetry?: PlanTelemetryConfig;
  security?: PlanSecurityConfig;

  steps: PlanStep[];
}
