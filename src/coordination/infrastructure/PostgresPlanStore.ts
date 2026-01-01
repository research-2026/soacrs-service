// src/coordination/infrastructure/PostgresPlanStore.ts

/**
 * PostgresPlanStore
 *
 * Infrastructure implementation of IPlanStore using Prisma and PostgreSQL.
 * This component is responsible for:
 *  - Persisting TaskRoutingPlan documents for debugging, replay and analysis.
 *  - Fetching plans by planId.
 *
 * The domain-facing interface IPlanStore is intentionally generic (unknown),
 * but this implementation assumes the payload is a TaskRoutingPlan.
 */

import type { TaskRoutingPlan } from '../domain/Plan';
import type { IPlanStore } from '../domain/Metrics';
import { getPrismaClient } from '../../shared/db/PrismaClient';

/**
 * Narrow representation of the PlanDocument row in the database.
 */
type PlanDocumentRow = {
  id: number;
  planId: string;
  tenantId: string;
  createdAt: Date;
  payload: unknown;
};

/**
 * Narrow Prisma client type used by PostgresPlanStore.
 */
export type PrismaPlanClient = {
  planDocument: {
    create: (args: unknown) => Promise<PlanDocumentRow>;
    findFirst: (args: unknown) => Promise<PlanDocumentRow | null>;
  };
};

export class PostgresPlanStore implements IPlanStore {
  private readonly prisma: PrismaPlanClient;

  /**
   * Create a new PostgresPlanStore.
   *
   * @param prismaClient Optional Prisma client for dependency injection.
   */
  public constructor(prismaClient?: PrismaPlanClient) {
    this.prisma = prismaClient ?? (getPrismaClient() as unknown as PrismaPlanClient);
  }

  /**
   * Persist a plan document into the database.
   *
   * IPlanStore expresses this in generic terms (planId + JSON payload).
   * In this implementation, we assume the JSON is a TaskRoutingPlan and
   * extract the tenantId and createdAt from it for indexing.
   *
   * @param planId   The plan identifier.
   * @param planJson The plan payload (expected to be a TaskRoutingPlan).
   */
  public async savePlan(planId: string, planJson: unknown): Promise<void> {
    const plan = planJson as TaskRoutingPlan;

    const tenantId = plan.context.tenant;
    const createdAtDate = new Date(plan.createdAt);

    await this.prisma.planDocument.create({
      data: {
        planId,
        tenantId,
        createdAt: createdAtDate,
        payload: plan,
      },
    } as { data: Omit<PlanDocumentRow, 'id'> });
  }

  /**
   * Retrieve a TaskRoutingPlan by its planId.
   *
   * @param planId The identifier of the plan.
   * @returns The TaskRoutingPlan if found, otherwise null.
   */
  public async getPlan(planId: string): Promise<TaskRoutingPlan | null> {
    const row = await this.prisma.planDocument.findFirst({
      where: {
        planId,
      },
    } as { where: { planId: string } });

    if (!row) {
      return null;
    }

    return row.payload as TaskRoutingPlan;
  }
}
