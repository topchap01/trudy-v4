// apps/backend/src/orchestrator/phaseRunSafe.ts
// Purpose: tiny, safe helpers for PhaseRun + AgentMessage that DO NOT assume
// specific Prisma enums beyond Phase/MessageRole, and degrade gracefully if
// certain models or fields don't exist in the schema.

import type { PrismaClient } from '@prisma/client';
import { Phase } from '@prisma/client';

// Narrow, schema-agnostic shapes
type PhaseRunStatus = 'PENDING' | 'COMPLETE' | 'FAILED';

export type PhaseRunSafe = {
  id: string;
  persisted: boolean;
};

const hasModel = (prisma: PrismaClient, name: string) =>
  prisma && typeof (prisma as any)[name] === 'object' && typeof (prisma as any)[name].create === 'function';

const tryJson = (v: any) => {
  if (v == null) return null;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
};

/**
 * Create a PhaseRun if the model exists; otherwise return a stub so callers
 * can continue. Never throws due to missing model/columns.
 */
export async function createPhaseRunSafe(
  prisma: PrismaClient,
  campaignId: string,
  phase: Phase,
): Promise<PhaseRunSafe> {
  try {
    if (hasModel(prisma, 'phaseRun')) {
      const row = await (prisma as any).phaseRun.create({
        data: {
          campaignId,
          phase,
          status: 'PENDING',
          startedAt: new Date(),
        },
      });
      return { id: row.id as string, persisted: true };
    }
  } catch (e) {
    // fall through to stub
  }
  // Stub id still unique-ish for correlation
  return { id: `stub-${campaignId}-${Date.now()}`, persisted: false };
}

/** Update a PhaseRun status if it exists + was persisted. */
export async function updatePhaseRunSafe(
  prisma: PrismaClient,
  phaseRunId: string,
  status: PhaseRunStatus,
): Promise<void> {
  try {
    if (!phaseRunId.startsWith('stub-') && hasModel(prisma, 'phaseRun')) {
      await (prisma as any).phaseRun.update({
        where: { id: phaseRunId },
        data: {
          status,
          ...(status !== 'PENDING' ? { finishedAt: new Date() } : {}),
        },
      });
    }
  } catch {
    // intentionally swallow — helper must not take down the pipeline
  }
}

/**
 * Log an AgentMessage. If the schema requires campaignId but we only have
 * phaseRunId, we’ll look up the PhaseRun to get campaignId.
 *
 * NOTE: `agent` is a plain string (no enum) to avoid schema coupling.
 */
export async function logAgentMessageSafe(prisma: PrismaClient, opts: {
  phaseRunId?: string;
  campaignId?: string;
  agent: string; // e.g., 'Boris' | 'Ava' | 'Clara' | 'BRUCE'
  role?: string;
  action?: string;
  payload?: any;
  text?: string;
}): Promise<void> {
  try {
    if (!hasModel(prisma, 'agentMessage')) return;

    let { campaignId } = opts;
    const { phaseRunId } = opts;

    // If campaignId not provided, infer from phaseRun (when available)
    if (!campaignId && phaseRunId && hasModel(prisma, 'phaseRun')) {
      try {
        const pr = await (prisma as any).phaseRun.findUnique({ where: { id: phaseRunId } });
        campaignId = pr?.campaignId || campaignId;
      } catch {
        // ignore
      }
    }

    // As a last resort, fail softly if we truly cannot attach to a campaign
    if (!campaignId) {
      // still create if schema doesn't require it; otherwise skip
      try {
        await (prisma as any).agentMessage.create({
          data: {
            phaseRunId: phaseRunId || null,
            agent: String(opts.agent || 'SYSTEM'),
            role: (opts.role as any) || 'SUGGESTION',
            action: opts.action || null,
            payload: tryJson(opts.payload),
            text: typeof opts.text === 'string' ? opts.text : JSON.stringify(opts.payload ?? ''),
          },
        });
        return;
      } catch {
        return;
      }
    }

    // Normal path: with campaignId
    await (prisma as any).agentMessage.create({
      data: {
        campaignId,
        phaseRunId: phaseRunId || null,
        agent: String(opts.agent || 'SYSTEM'),
        role: (opts.role as any) || 'SUGGESTION',
        action: opts.action || null,
        payload: tryJson(opts.payload),
        text: typeof opts.text === 'string' ? opts.text : JSON.stringify(opts.payload ?? ''),
      },
    });
  } catch {
    // never throw from this helper
  }
}
