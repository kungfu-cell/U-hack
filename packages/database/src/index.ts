import { PrismaClient } from '@prisma/client';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const databaseModuleDir = path.dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(path.resolve(databaseModuleDir, '../../../.env'));
} catch {
  try {
    process.loadEnvFile(path.resolve(process.cwd(), '.env'));
  } catch {
    // Environment variables may be provided by the process/container instead.
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const database =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = database;

// Export all Prisma client types and enums
export * from '@prisma/client';

// Cryptography & Privacy
export * from './crypto.js';

// Repositories
export * from './repositories/case.repository.js';
export * from './repositories/transcript.repository.js';
export * from './repositories/assessment.repository.js';
export * from './repositories/consent.repository.js';
export * from './repositories/audit.repository.js';
export * from './repositories/report.repository.js';
export * from './repositories/shared-indicator.repository.js';

// Services
export * from './services/data-withdrawal.service.js';
export * from './services/incident-correlation.service.js';
export * from './services/report.service.js';
