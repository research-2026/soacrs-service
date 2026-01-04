// src/coordination/domain/SemanticTask.ts

/**
 * SemanticTask
 *
 * Structured task input SOACRS receives from NL→Task translator.
 * SOACRS enriches this into a TaskRoutingPlan (TRP).
 */

/**
 * Type of requester:
 * - "user"    → end-user / human
 * - "service" → another backend service
 */
export type RequesterType = 'user' | 'service';

/**
 * Network deny policy mode.
 * Shared between task constraints and plan constraints.
 */
export type NetworkDenyMode = 'never' | 'on-sensitive' | 'always';

/**
 * Entity (user or service) that initiated the task.
 */
export interface Requester {
  type: RequesterType;
  id: string;
  scopes?: string[];
}

/**
 * What the task is trying to achieve.
 */
export interface TaskGoal {
  capability: string;
  input: Record<string, unknown>;
  description?: string;
}

/**
 * Execution constraints that guide routing decisions.
 */
export interface TaskConstraints {
  overallTimeoutMs?: number;
  maxParallel?: number;
  costBudget?: number;
  privacyTags?: string[];

  /**
   * Optional network restriction hint (translator may omit).
   */
  denyNetworkWhen?: NetworkDenyMode;
}

/**
 * Context about the tenant and environment in which the task runs.
 */
export interface TaskContext {
  /**
   * Tenant identifier (e.g., customer / organisation).
   */
  tenant: string;

  correlationId?: string;
  idempotencyKey?: string;
  locale?: string;
  region?: string;
}

/**
 * Top-level shape of a semantic task submitted to SOACRS.
 *
 * NOTE:
 * - tenant is inside `context.tenant` (NOT top-level).
 */
export interface SemanticTask {
  context: TaskContext;
  requester: Requester;
  goal: TaskGoal;
  constraints?: TaskConstraints;
}
