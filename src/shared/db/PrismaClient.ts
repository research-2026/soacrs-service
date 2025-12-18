// src/shared/db/PrismaClient.ts

/**
 * Central PrismaClient instance for SOACRS.
 *
 * This module ensures there is only one PrismaClient instance per process.
 * Import this wherever you need DB access in the infrastructure layer.
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

/**
 * Get the singleton PrismaClient instance.
 */
export function getPrismaClient(): PrismaClient {
  if (prisma === null) {
    prisma = new PrismaClient();
  }

  return prisma;
}

/**
 * Gracefully disconnect the PrismaClient.
 * Call this from shutdown handlers if needed.
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma !== null) {
    await prisma.$disconnect();
    prisma = null;
  }
}
