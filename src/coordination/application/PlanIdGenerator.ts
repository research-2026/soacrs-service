// src/coordination/application/PlanIdGenerator.ts

import { randomUUID } from 'crypto';

/**
 * Create a globally unique planId for Task Routing Plans (TRP).
 *
 * Format: tr_<uuid_without_dashes>
 */
export function createPlanId(): string {
  return `tr_${randomUUID().replace(/-/g, '')}`;
}
