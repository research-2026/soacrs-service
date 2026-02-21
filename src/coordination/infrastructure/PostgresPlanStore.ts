// src/coordination/infrastructure/PostgresPlanStore.ts

/**
 * PostgresPlanStore
 *
 * Infrastructure implementation of IPlanStore using Prisma/PostgreSQL.
 *
 * Standards applied:
 * - SRP: only stores and retrieves plan documents.
 * - Boundary mapping: DB row <-> domain JSON is localized here.
 * - Prisma-decoupling: narrow client shape (avoids tight coupling to generated types).
 */

import type { TaskRoutingPlan } from '../domain/Plan';
import type { IPlanStore } from '../domain/Metrics';
import { getPrismaClient } from '../../shared/db/PrismaClient';

/**
 * Narrow representation of the PlanDocument row in the database.
 * Must match prisma/schema.prisma PlanDocument model:
 * - planId (PK)
 * - tenantId
 * - capability
 * - planJson
 * - createdAt
 */
type PlanDocumentRow = {
  planId: string;
  tenantId: string;
  capability: string;
  createdAt: Date;
  planJson: unknown;
};

/**
 * Narrow Prisma client surface used by this store.
 * We keep args as `unknown` to reduce Prisma type coupling.
 */
export type PrismaPlanClient = {
  planDocument: {
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<PlanDocumentRow | null>;
  };
};

export class PostgresPlanStore implements IPlanStore {
  private readonly prisma: PrismaPlanClient;

  public constructor(prismaClient?: PrismaPlanClient) {
    this.prisma = prismaClient ?? (getPrismaClient() as unknown as PrismaPlanClient);
  }

  public async savePlan(planId: string, planJson: unknown): Promise<void> {
    const plan = planJson as TaskRoutingPlan;

    // Defensive extraction for indexing (tenant + capability used in DB indexes)
    const tenantId = plan.context.tenant;
    const capability = plan.goal.capability;

    await this.prisma.planDocument.create({
      data: {
        planId,
        tenantId,
        capability,
        // DB expects full TRP JSON
        planJson: plan,
        // Keep createdAt aligned to plan timestamp for audit
        createdAt: new Date(plan.createdAt),
      },
    } as unknown);
  }

  public async getPlan(planId: string): Promise<TaskRoutingPlan | null> {
    const row = await this.prisma.planDocument.findFirst({
      where: { planId },
    } as unknown);

    if (!row) return null;
    return row.planJson as TaskRoutingPlan;
  }
}
