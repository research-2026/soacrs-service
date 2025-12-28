// src/coordination/infrastructure/PostgresToolRegistry.ts

/**
 * PostgresToolRegistry
 *
 * Infrastructure implementation of IToolRegistry using Prisma and PostgreSQL.
 * This class is responsible for fetching tools that are:
 *  - enabled for a given tenant
 *  - capable of handling a given capability (e.g., "patient.search")
 *
 * It converts raw DB rows into clean domain-level Tool objects.
 */

import type { IToolRegistry, Tool, ToolCapability } from '../domain/Tool';
import { getPrismaClient } from '../../shared/db/PrismaClient';

/**
 * Minimal shape of the row we expect from Prisma when querying tenantTool
 * with an included tool relation.
 *
 * We intentionally keep this decoupled from generated Prisma types to avoid
 * tight coupling and versioning issues.
 */
type TenantToolWithTool = {
  tenantId: string;
  enabled: boolean;
  tool: {
    id: string;
    name: string;
    version: string;
    region: string | null;
    baseCost: number | null;
    meta: unknown;
    capabilities: unknown;
  };
};

/**
 * Narrow Prisma client type for this registry.
 * We only depend on the tenantTool delegate with findMany.
 */
export type PrismaToolClient = {
  tenantTool: {
    findMany: (args: unknown) => Promise<TenantToolWithTool[]>;
  };
};

export class PostgresToolRegistry implements IToolRegistry {
  private readonly prisma: PrismaToolClient;

  /**
   * Create a new PostgresToolRegistry.
   *
   * @param prismaClient Optional Prisma client (injected for testing).
   *                     In production, the shared singleton will be used.
   */
  public constructor(prismaClient?: PrismaToolClient) {
    // getPrismaClient() returns the real PrismaClient instance.
    // We cast it to the narrower PrismaToolClient type we use here.
    this.prisma = prismaClient ?? (getPrismaClient() as unknown as PrismaToolClient);
  }

  /**
   * Fetch tools that are enabled for the given tenant and support the given capability.
   *
   * @param tenantId   Tenant identifier (e.g., "acme-health").
   * @param capability Capability name (e.g., "patient.search").
   */
  public async getToolsForCapability(tenantId: string, capability: string): Promise<Tool[]> {
    // 1. Get all enabled tenant tools for this tenant, including the Tool relation.
    const tenantTools = await this.prisma.tenantTool.findMany({
      where: {
        tenantId,
        enabled: true,
      },
      include: {
        tool: true,
      },
    });

    // 2. Map DB rows to domain tools, filtering by capability support.
    const tools = tenantTools
      .map((tenantTool) => tenantTool.tool)
      .filter((toolRow) => this.toolSupportsCapability(toolRow.capabilities, capability))
      .map((toolRow) => this.mapDbToolToDomain(toolRow));

    return tools;
  }

  /**
   * Check whether a tool's JSON "capabilities" column contains the required capability.
   *
   * The DB column is expected to be an array of objects:
   * [{ "name": "patient.search", ... }, ...]
   */
  private toolSupportsCapability(capabilitiesJson: unknown, capability: string): boolean {
    if (!Array.isArray(capabilitiesJson)) {
      return false;
    }

    return capabilitiesJson.some((item) => {
      if (item === null || typeof item !== 'object') {
        return false;
      }

      const maybeName = (item as { name?: unknown }).name;
      return typeof maybeName === 'string' && maybeName === capability;
    });
  }

  /**
   * Convert a raw tool row into a domain Tool object.
   */
  private mapDbToolToDomain(toolRow: TenantToolWithTool['tool']): Tool {
    const capabilities = this.parseCapabilities(toolRow.capabilities);
    const meta = this.parseMeta(toolRow.meta);

    const domainTool: Tool = {
      id: toolRow.id,
      name: toolRow.name,
      version: toolRow.version,
      region: toolRow.region ?? undefined,
      baseCost: toolRow.baseCost ?? undefined,
      capabilities,
      meta,
    };

    return domainTool;
  }

  /**
   * Safely parse the JSON capabilities column into domain ToolCapability objects.
   */
  private parseCapabilities(jsonValue: unknown): ToolCapability[] {
    if (!Array.isArray(jsonValue)) {
      return [];
    }

    const capabilities: ToolCapability[] = [];

    for (const item of jsonValue) {
      if (item === null || typeof item !== 'object') {
        // Skip invalid entries instead of throwing. This keeps the system
        // robust against bad data.
        continue;
      }

      const obj = item as {
        name?: unknown;
        inputsSchema?: unknown;
        outputsSchema?: unknown;
      };

      if (typeof obj.name !== 'string') {
        // Capability without a valid name is ignored.
        continue;
      }

      const capability: ToolCapability = {
        name: obj.name,
      };

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
   * Safely parse the JSON meta column into a plain object.
   */
  private parseMeta(jsonValue: unknown): Record<string, unknown> | undefined {
    if (!jsonValue || typeof jsonValue !== 'object' || Array.isArray(jsonValue)) {
      return undefined;
    }

    return jsonValue as Record<string, unknown>;
  }
}
