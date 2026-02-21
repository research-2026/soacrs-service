// src/coordination/infrastructure/PostgresToolRegistry.ts

/**
 * PostgresToolRegistry
 *
 * Responsibility:
 * - Fetch tools enabled for a given tenant from PostgreSQL via Prisma.
 * - Filter tools by requested capability.
 * - Map DB rows (including JSON + Decimal-like values) into domain Tool objects.
 *
 * Standards applied:
 * - SRP (Single Responsibility Principle): registry retrieval + mapping only (no scoring, no metrics).
 * - Boundary validation/parsing: JSON parsing + Decimal conversions occur ONLY at the infrastructure boundary.
 * - Defensive programming: tolerate unexpected DB JSON shapes without crashing the service.
 */

import type { IToolRegistry, Tool, ToolCapability } from '../domain/Tool';
import { getPrismaClient } from '../../shared/db/PrismaClient';

/**
 * Minimal view of the Prisma query result we need.
 *
 * We intentionally avoid importing Prisma generated types here to:
 * - reduce coupling between domain/infrastructure and Prisma,
 * - keep tests simpler (easy to fake this shape),
 * - make refactors safer if Prisma schema evolves.
 */
type TenantToolWithTool = {
  tenantId: string;
  enabled: boolean;
  tool: {
    id: string;
    name: string;
    version: string;
    region: string | null;
    baseCost: unknown; // Prisma Decimal | null (kept unknown to avoid direct Prisma type dependency)
    meta: unknown; // JSON blob (object expected)
    capabilities: unknown; // JSON array expected
  };
};

/**
 * Narrow Prisma client surface used by this repository.
 * This makes it easy to pass a fake prisma client in tests.
 */
export type PrismaToolClient = {
  tenantTool: {
    findMany: (args: unknown) => Promise<TenantToolWithTool[]>;
  };
};

export class PostgresToolRegistry implements IToolRegistry {
  /**
   * The injected prisma client (real in prod; fake in tests).
   */
  private readonly prisma: PrismaToolClient;

  public constructor(prismaClient?: PrismaToolClient) {
    // Default to the shared Prisma client in production runtime.
    // Tests can inject a fake client to keep infra tests deterministic.
    this.prisma = prismaClient ?? (getPrismaClient() as unknown as PrismaToolClient);
  }

  /**
   * Returns tools enabled for the tenant that match the required capability.
   *
   * Note:
   * - We query tenantTool because enablement is tenant-scoped.
   * - Capability filter happens in memory because capabilities are stored as JSON
   *   and we want consistent behavior across DB implementations.
   */
  public async getToolsForCapability(tenantId: string, capability: string): Promise<Tool[]> {
    // Fetch enabled tools for this tenant, including the referenced tool row
    const tenantTools = await this.prisma.tenantTool.findMany({
      where: { tenantId, enabled: true },
      include: { tool: true },
    } as unknown);

    // Pipeline:
    // 1) flatten to the tool row
    // 2) filter by capability support
    // 3) map into the domain Tool model
    return tenantTools
      .map((tt) => tt.tool)
      .filter((toolRow) => this.toolSupportsCapability(toolRow.capabilities, capability))
      .map((toolRow) => this.mapDbToolToDomain(toolRow));
  }

  /**
   * Checks whether a tool's capabilities JSON contains the requested capability name.
   *
   * We keep this method tolerant to malformed JSON values:
   * - If capabilities is not an array -> treated as unsupported (false)
   * - If array items aren't objects or don't contain a string "name" -> ignored
   */
  private toolSupportsCapability(capabilitiesJson: unknown, capability: string): boolean {
    if (!Array.isArray(capabilitiesJson)) return false;

    return capabilitiesJson.some((item) => {
      if (item === null || typeof item !== 'object') return false;
      const maybeName = (item as { name?: unknown }).name;
      return typeof maybeName === 'string' && maybeName === capability;
    });
  }

  /**
   * Maps the DB tool row into the domain Tool object.
   *
   * Important boundary work happens here:
   * - capabilities JSON -> ToolCapability[]
   * - meta JSON -> Record<string, unknown>
   * - baseCost (Decimal-like) -> number | undefined
   */
  private mapDbToolToDomain(toolRow: TenantToolWithTool['tool']): Tool {
    const capabilities = this.parseCapabilities(toolRow.capabilities);
    const meta = this.parseMeta(toolRow.meta);

    return {
      id: toolRow.id,
      name: toolRow.name,
      version: toolRow.version,
      // Null in DB becomes undefined in domain (domain prefers optional)
      region: toolRow.region ?? undefined,

      // Prisma Decimal is converted to JS number at the boundary
      baseCost: toNumberOrUndefined(toolRow.baseCost),

      capabilities,
      meta,
    };
  }

  /**
   * Parses capabilities JSON into a typed array.
   *
   * Expected DB format (stored as JSON):
   * [
   *   { name: "patient.search", inputsSchema: {...}, outputsSchema: {...} },
   *   ...
   * ]
   *
   * Safety rules:
   * - Non-array => []
   * - Any invalid item is ignored (never throws)
   */
  private parseCapabilities(jsonValue: unknown): ToolCapability[] {
    if (!Array.isArray(jsonValue)) return [];

    const capabilities: ToolCapability[] = [];
    for (const item of jsonValue) {
      if (item === null || typeof item !== 'object') continue;

      const obj = item as {
        name?: unknown;
        inputsSchema?: unknown;
        outputsSchema?: unknown;
      };

      // Capability name is mandatory for a valid entry
      if (typeof obj.name !== 'string') continue;

      const capability: ToolCapability = { name: obj.name };

      // Schemas are optional; only attach if they look like objects
      if (obj.inputsSchema && typeof obj.inputsSchema === 'object') {
        capability.inputsSchema = obj.inputsSchema as Record<string, unknown>;
      }
      if (obj.outputsSchema && typeof obj.outputsSchema === 'object') {
        capability.outputsSchema = obj.outputsSchema as Record<string, unknown>;
      }

      capabilities.push(capability);
    }
    return capabilities;
  }

  /**
   * Parses meta JSON into a plain object, or undefined if not an object.
   * We reject arrays because meta is meant to be a key-value object.
   */
  private parseMeta(jsonValue: unknown): Record<string, unknown> | undefined {
    if (!jsonValue || typeof jsonValue !== 'object' || Array.isArray(jsonValue)) return undefined;
    return jsonValue as Record<string, unknown>;
  }
}

/**
 * Converts a Prisma Decimal-like value into a JS number.
 *
 * Why:
 * - Prisma returns Decimal instances for Decimal fields.
 * - Domain layer expects number (per your current contracts).
 *
 * Safety:
 * - If conversion fails or is non-finite, return undefined.
 * - Keeps domain model clean and avoids Decimal leaking outside infrastructure.
 */
function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;

  // Already a JS number (some tests or mocks may supply number)
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  // Some runtimes may provide decimal values as strings
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  // Prisma Decimal exposes toString(); this covers real Prisma output
  if (typeof value === 'object') {
    const maybe = value as { toString?: () => string };
    if (typeof maybe.toString === 'function') {
      const n = Number(maybe.toString());
      return Number.isFinite(n) ? n : undefined;
    }
  }

  return undefined;
}
