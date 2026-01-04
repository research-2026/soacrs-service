/**
 * Global Jest setup/teardown for SOACRS tests.
 *
 * Ensures the process exits cleanly by closing shared resources
 * such as Prisma DB connections (if they were created during tests).
 */

import { disconnectPrisma } from '../src/shared/db/PrismaClient';

afterAll(async () => {
  await disconnectPrisma();
});
