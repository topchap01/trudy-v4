// apps/backend/src/lib/prisma.ts
// ESM-safe Prisma singleton for dev hot-reload + prod stability.

import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined
}

export const prisma: PrismaClient =
  globalThis.__PRISMA__ ??
  new PrismaClient({
    log: (process.env.PRISMA_LOG || 'warn').split(',').map(s => s.trim()) as any,
  })

if (process.env.NODE_ENV !== 'production') {
  globalThis.__PRISMA__ = prisma
}

export default prisma
