/**
 * IPlanStore
 * ----------
 * Domain contract for persisting and retrieving Task Routing Plans (TRP).
 *
 * Why this exists:
 * - PlanBuilderService should depend on a domain interface (not Prisma).
 * - Infrastructure (PostgresPlanStore) implements this.
 * - Tests can stub this easily.
 */
export interface IPlanStore {
  /**
   * Persist the plan JSON for debugging/audit/replay.
   */
  savePlan(planId: string, planJson: unknown): Promise<void>;

  /**
   * Retrieve a previously saved plan.
   * Returns null when not found.
   */
  getPlan(planId: string): Promise<unknown | null>;
}
