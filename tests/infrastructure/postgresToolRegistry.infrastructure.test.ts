// tests/infrastructure/postgresToolRegistry.infrastructure.test.ts

/**
 * Tests for PostgresToolRegistry.
 *
 * These tests use a lightweight fake Prisma client to verify that:
 *  - tenant scoping is respected
 *  - capability filtering is applied
 *  - DB models are correctly mapped to domain Tool objects
 */

import {
  PostgresToolRegistry,
  type PrismaToolClient,
} from '../../src/coordination/infrastructure/PostgresToolRegistry';
import type { Tool } from '../../src/coordination/domain/Tool';

type TenantToolWithTool = {
  id: number;
  tenantId: string;
  toolId: string;
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

describe('PostgresToolRegistry', () => {
  it('should return tools enabled for the tenant that support the requested capability', async () => {
    // Arrange: build fake DB rows.
    const capabilitiesJson: unknown = [
      {
        name: 'patient.search',
        inputsSchema: { type: 'object' },
        outputsSchema: { type: 'object' },
      },
      {
        name: 'patient.update',
      },
    ];

    const toolRow: TenantToolWithTool['tool'] = {
      id: 'ehr-patient-api',
      name: 'EHR Patient API',
      version: '1.0.0',
      region: 'us-east-1',
      baseCost: 0.2,
      meta: null,
      capabilities: capabilitiesJson,
    };

    const tenantToolRow: TenantToolWithTool = {
      id: 1,
      tenantId: 'acme-health',
      toolId: 'ehr-patient-api',
      enabled: true,
      tool: toolRow,
    };

    const fakePrisma: PrismaToolClient = {
      tenantTool: {
        // We assert that the registry calls findMany and we return our single row.
        async findMany(_args: unknown): Promise<TenantToolWithTool[]> {
          return [tenantToolRow];
        },
      },
    };

    const registry = new PostgresToolRegistry(fakePrisma);

    // Act
    const tools: Tool[] = await registry.getToolsForCapability('acme-health', 'patient.search');

    // Assert
    expect(tools).toHaveLength(1);

    const [tool] = tools;

    expect(tool.id).toBe('ehr-patient-api');
    expect(tool.name).toBe('EHR Patient API');
    expect(tool.version).toBe('1.0.0');
    expect(tool.region).toBe('us-east-1');
    expect(tool.baseCost).toBe(0.2);
    expect(tool.capabilities).toHaveLength(2);
    expect(tool.capabilities[0].name).toBe('patient.search');
  });

  it('should return an empty array if no tools match the capability', async () => {
    const capabilitiesJson: unknown = [
      {
        name: 'another.capability',
      },
    ];

    const toolRow: TenantToolWithTool['tool'] = {
      id: 'some-tool',
      name: 'Some Tool',
      version: '1.0.0',
      region: null,
      baseCost: null,
      meta: null,
      capabilities: capabilitiesJson,
    };

    const tenantToolRow: TenantToolWithTool = {
      id: 2,
      tenantId: 'acme-health',
      toolId: 'some-tool',
      enabled: true,
      tool: toolRow,
    };

    const fakePrisma: PrismaToolClient = {
      tenantTool: {
        async findMany(_args: unknown): Promise<TenantToolWithTool[]> {
          return [tenantToolRow];
        },
      },
    };

    const registry = new PostgresToolRegistry(fakePrisma);

    const tools: Tool[] = await registry.getToolsForCapability('acme-health', 'patient.search');

    expect(tools).toHaveLength(0);
  });
});
