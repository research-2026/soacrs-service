/**
 * SemanticTask
 *
 * This represents the structured task that SOACRS receives
 * from the NL→Task translator (Mufthi's component).
 *
 * It is intentionally simpler than the final TaskRoutingPlan.
 * SOACRS will enrich this into a full plan, adding candidates,
 * steps, retry strategies, etc.
 */

/**
 * Type of requester:
 * - "user"    → direct end-user / human
 * - "service" → another backend service (e.g. NL→Task translator)
 */
export type RequesterType = 'user' | 'service';

/**
 * Entity (user or service) that initiated the task.
 */
export interface Requester {
  /**
   * "user" or "service".
   */
  type: RequesterType;

  /**
   * Logical identifier of the requester.
   * For a user this might be a userId; for a service, a clientId.
   */
  id: string;

  /**
   * Optional scopes describing what this requester is allowed to do.
   * Example: ["patient.read", "tool.invoke"]
   */
  scopes?: string[];
}

/**
 * What the task is trying to achieve.
 */
export interface TaskGoal {
  /**
   * Target capability for this task.
   * Example: "patient.search", "order.create".
   */
  capability: string;

  /**
   * Input payload for the capability.
   * Example: { "mrn": "12345" }.
   */
  input: Record<string, unknown>;

  /**
   * Optional human-readable description.
   * Example: "Find patient by MRN".
   */
  description?: string;
}

/**
 * Execution constraints that guide routing decisions.
 */
export interface TaskConstraints {
  /**
   * Overall time budget for fulfilling this task (in milliseconds).
   * Optional.
   */
  overallTimeoutMs?: number;

  /**
   * Maximum degree of parallelism allowed.
   * Example: 1 (sequential), 2, 3, etc. Optional.
   */
  maxParallel?: number;

  /**
   * Optional cost budget. The interpretation is up to the scoring engine
   * (e.g. relative budget, monetary units, etc.).
   */
  costBudget?: number;

  /**
   * Privacy tags associated with this task.
   * Example: ["phi", "patient-id"].
   */
  privacyTags?: string[];
}

/**
 * Context about the tenant and environment in which the task runs.
 */
export interface TaskContext {
  /**
   * Tenant identifier (e.g. customer / organisation).
   * Example: "acme-health".
   */
  tenant: string;

  /**
   * Optional correlation id used to trace this request across services.
   */
  correlationId?: string;

  /**
   * Optional idempotency key used to deduplicate repeated submissions.
   */
  idempotencyKey?: string;

  /**
   * Optional locale string (BCP 47), such as "en-US".
   */
  locale?: string;

  /**
   * Optional region identifier, such as "us-east-1".
   */
  region?: string;
}

/**
 * Top-level shape of a semantic task submitted to SOACRS.
 *
 * This is the canonical input type that SOACRS expects from
 * the NL→Task translator.
 */
export interface SemanticTask {
  /**
   * Context about the tenant and trace identifiers.
   */
  context: TaskContext;

  /**
   * Entity (user/service) that is asking for this task to be performed.
   */
  requester: Requester;

  /**
   * What the task is trying to achieve.
   */
  goal: TaskGoal;

  /**
   * Optional execution constraints that guide routing decisions.
   */
  constraints?: TaskConstraints;
}
