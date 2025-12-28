/**
 * Tool and capability domain models.
 *
 * Tools represent agents, APIs, RPA bots, etc. that
 * can be orchestrated by the middleware.
 */

/**
 * Logical capability supported by a tool.
 */
export interface ToolCapability {
  /**
   * Logical capability name, e.g. "patient.search".
   */
  name: string;

  /**
   * Optional JSON schema for expected input payload.
   */
  inputsSchema?: Record<string, unknown>;

  /**
   * Optional JSON schema for expected output payload.
   */
  outputsSchema?: Record<string, unknown>;
}

/**
 * A tool represents a single agent or integration endpoint
 * that can be used by the orchestrator.
 */
export interface Tool {
  /**
   * Unique identifier for this tool in the registry.
   * Example: "ehr-patient-api", "legacy-rpa-screen-scraper".
   */
  id: string;

  /**
   * Human-friendly name of the tool.
   */
  name: string;

  /**
   * Version of the tool or agent.
   */
  version: string;

  /**
   * Logical capabilities that this tool supports.
   */
  capabilities: ToolCapability[];

  /**
   * Optional region / deployment location.
   * Example: "us-east-1".
   */
  region?: string;

  /**
   * Base relative cost for invoking this tool.
   * Used as an input into the scoring engine.
   */
  baseCost?: number;

  /**
   * Additional metadata for scoring and routing decisions.
   * Example: { "slaTier": "gold" }.
   */
  meta?: Record<string, unknown>;
}

/**
 * Abstraction for a tool registry that can look up tools
 * enabled for a tenant and capable of handling a given capability.
 */
export interface IToolRegistry {
  /**
   * Fetch tools enabled for the given tenant that support the given capability.
   *
   * @param tenantId   Tenant identifier (e.g., "acme-health").
   * @param capability Capability name (e.g., "patient.search").
   */
  getToolsForCapability(tenantId: string, capability: string): Promise<Tool[]>;
}
