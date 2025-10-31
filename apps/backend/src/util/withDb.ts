import { Prisma } from '@prisma/client';

/** Retry wrapper for transient PlanetScale connect errors (P1001). */
export async function withDb<T>(fn: () => Promise<T>, tries = 3, delayMs = 250): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      if (e?.code !== 'P1001') throw e;
      await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}
