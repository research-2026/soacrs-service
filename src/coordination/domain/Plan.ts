/**
 * TaskRoutingPlan
 *
 * This is the core output of SOACRS.
 * It is returned to the Orchestrator and describes:
 *  - Context and goal for the task
 *  - Constraints (timeouts, privacy, cost)
 *  - Candidate tools and scoring breakdown
 *  - Selected primary tool
 *  - Steps forming an executable state machine
 *  - Retry, telemetry and security hints
 */

import type { Requester, TaskConstraints, TaskContext, TaskGoal } from './SemanticTask';

export type PlanPolicyDecision = 'allow' | 'deny';

export type NetworkDenyMode = 'never' | 'on-sensitive' | 'always';

export interface PlanCoordinatorInfo {
  service: string;
  version: string;
  instance?: string;
}

/**
 * Context for a routing plan.
 * Extends the SemanticTask context and embeds the requester.
 */
export interface PlanContext extends TaskContext {
  requester: Requester;
}

/**
 * Constraints applied at the plan level.
 * Extends SemanticTask constraints with network rules.
 */
export interface PlanConstraints extends TaskConstraints {
  denyNetworkWhen?: NetworkDenyMode;
}

/**
 * Minimal JSON Schema compatible representation for post-conditions.
 * Kept generic to avoid tight coupling to a particular validation library.
 */
export type JsonSchema = Record<string, unknown>;

export interface PlanPolicy {
  preconditionsPassed: boolean;
  policyDecision: PlanPolicyDecision;
  postConditions?: JsonSchema;
}

/**
 * Fine-grained explanation of a tool scoring decision.
 */
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

/**
 * A candidate tool that could be used to fulfil the plan's goal.
 */
export interface PlanCandidate {
  toolId: string;
  score: number;
  explain: CandidateScoreExplanation;
}

/**
 * Selected primary tool and its rank among candidates.
 */
export interface PlanSelection {
  toolId: string;
  reason: string;
  rank: number;
}

/**
 * Backoff configuration for retries.
 */
export interface PlanBackoffConfig {
  type: 'exponential' | 'fixed';
  initialMs: number;
  factor?: number;
  jitter?: boolean;
}

/**
 * High level retry policy applied by the orchestrator.
 */
export interface PlanRetryPolicy {
  maxAttemptsPerStep: number;
  backoff: PlanBackoffConfig;
}

/**
 * Telemetry hints to control how much the orchestrator emits.
 */
export interface PlanTelemetryConfig {
  emitTraceEvents: boolean;
  metricsLabels?: Record<string, string>;
  callbacks?: {
    progress?: { type: 'none' };
    completion?: { type: 'none' };
  };
}

/**
 * Authentication and data handling hints for the orchestrator.
 */
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

/**
 * Reference to a concrete tool and endpoint that the orchestrator can invoke.
 */
export interface PlanToolEndpointRef {
  toolId: string;
  endpoint?: {
    type: 'http';
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    timeoutMs: number;
  };
}

/**
 * Termination transition for a plan step.
 */
export interface PlanStepTransitionTerminate {
  terminate: {
    status: 'timeout' | 'failure';
    error: string;
  };
}

/**
 * Transition to another step (e.g. fallback).
 */
export interface PlanStepTransitionGoto {
  goto: string;
  record?: 'fallback';
}

/**
 * Success transition for a plan step.
 */
export interface PlanStepOnSuccess {
  completePlan?: boolean;
  goto?: string;
}

/**
 * Group of transitions for a plan step.
 */
export interface PlanStepTransitions {
  onSuccess?: PlanStepOnSuccess;
  onFailure?: PlanStepTransitionGoto | PlanStepTransitionTerminate;
  onTimeout?: PlanStepTransitionTerminate;
}

/**
 * A single step in the routing plan.
 * The orchestrator executes these steps according to transitions.
 */
export interface PlanStep extends PlanStepTransitions {
  id: string;
  name: string;
  action: 'invoke_tool';
  toolRef: PlanToolEndpointRef;
  input: Record<string, unknown>;
  expectedOutput?: JsonSchema | string;
}

/**
 * The full routing plan document returned by SOACRS.
 */
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
