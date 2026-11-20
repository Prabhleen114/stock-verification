import type { PrismaClient } from '@prisma/client';
import * as dbModule from '../../src/lib/db.ts';

const raw = (dbModule as any).default;
export const prisma: PrismaClient = raw?.default || raw;
export default prisma;
