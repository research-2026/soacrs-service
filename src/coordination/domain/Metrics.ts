/**
 * Metrics and telemetry domain models.
 *
 * These types are used by the MetricsService and telemetry handlers
 * to store and aggregate historical performance data for tools,
 * and by the ToolRegistry to expose available tools.
 */

import type { Tool } from './Tool';

/**
 * Telemetry event emitted when a tool executes within a plan.
 */
export interface ToolExecutionEvent {
  /**
   * The plan that this execution belongs to.
   */
  planId: string;

  /**
   * The step inside the plan that was executed.
   */
  stepId: string;

  /**
   * The tool that was executed.
   */
  toolId: string;

  /**
   * Capability requested from this tool.
   */
  capability: string;

  /**
   * Tenant on behalf of which this execution happened.
   */
  tenantId: string;

  /**
   * Measured latency in milliseconds.
   */
  latencyMs: number;

  /**
   * Whether the execution was successful.
   */
  success: boolean;

  /**
   * Optional error code if the execution failed.
   */
  errorCode?: string | null;

  /**
   * Timestamp when the execution happened (ISO-8601 string).
   */
  timestamp: string;
}

/**
 * Aggregated performance metrics for a (tenant, tool, capability) tuple.
 */
export interface ToolMetrics {
  tenantId: string;
  toolId: string;
  capability: string;

  /**
   * Number of successful executions.
   */
  successCount: number;

  /**
   * Number of failed executions.
   */
  failureCount: number;

  /**
   * Sum of latencies across all executions in milliseconds.
   */
  totalLatencyMs: number;

  /**
   * Average user or business reward (e.g. rating 1–5 normalised to 0–1).
   */
  avgReward: number;

  /**
   * Timestamp of the last update (ISO-8601 string).
   */
  lastUpdated: string;
}

/**
 * A lightweight projection combining tool metadata with optional metrics.
 * This can be used by the scoring engine to evaluate candidates.
 */
export interface ToolRegistryEntry {
  tool: Tool;
  metrics?: ToolMetrics | null;
}

/**
 * Interface for a tool registry abstraction.
 *
 * Implementations will be provided in the infrastructure layer
 * (e.g. Postgres-backed registry).
 */
export interface IToolRegistry {
  /**
   * Returns all tools that support the given capability for a tenant.
   */
  getToolsForCapability(tenantId: string, capability: string): Promise<ToolRegistryEntry[]>;
}

/**
 * Interface for metrics persistence and retrieval.
 */
export interface IMetricsRepository {
  /**
   * Persist a single execution event and update aggregated metrics.
   */
  recordExecution(event: ToolExecutionEvent): Promise<void>;

  /**
   * Retrieve aggregated metrics for a given (tenant, tool, capability) tuple.
   */
  getMetrics(tenantId: string, toolId: string, capability: string): Promise<ToolMetrics | null>;

  /**
   * Persist an updated metrics aggregate.
   */
  saveMetrics(metrics: ToolMetrics): Promise<void>;
}

/**
 * Interface for storing full plan documents for audit / analysis.
 */
export interface IPlanStore {
  /**
   * Persist a complete plan document by its identifier.
   */
  savePlan(planId: string, planJson: unknown): Promise<void>;

  /**
   * Retrieve a stored plan document by its identifier.
   */
  getPlan(planId: string): Promise<unknown | null>;
}
