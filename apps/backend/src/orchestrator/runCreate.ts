// apps/backend/src/orchestrator/runCreate.ts
// Generates idea routes for a campaign (idempotent-ish), logs a BRUCE ideas payload.

import type { PrismaClient } from '@prisma/client';
import { Phase } from '@prisma/client';
import { createPhaseRunSafe, updatePhaseRunSafe, logAgentMessageSafe } from './phaseRunSafe.js';

type Risk = 'Conservative' | 'Balanced' | 'Bold';

function seedRoutes(risk: Risk) {
  // Minimal, stable seeds (you can tune copy later)
  const base = [
    { archetype: 'Hero Draw', mechanic: 'Prize Draw (Major)', hook: 'Win the Ultimate Upgrade' },
    { archetype: 'Weekly Momentum', mechanic: 'Prize Draw (Weekly)', hook: 'Win Every Week' },
    { archetype: 'Instant Gratification', mechanic: 'Instant Win', hook: 'Win Instantly at Checkout' },
  ];

  if (risk === 'Conservative') return base.slice(0, 2).map((r) => ({ ...r, riskLevel: 'SAFE' }));
  if (risk === 'Balanced') return base.map((r, i) => ({ ...r, riskLevel: i === 2 ? 'BALANCED' : 'SAFE' }));
  // Bold
  return [
    ...base.map((r) => ({ ...r, riskLevel: 'BALANCED' as const })),
    { archetype: 'UGC Challenge', mechanic: 'UGC Contest (photo/video)', hook: 'Show Us Your Upgrade — Win Big', riskLevel: 'BOLD' as const },
  ];
}

export async function runCreate(prisma: PrismaClient, campaignId: string, opts?: { risk?: Risk }) {
  const pr = await createPhaseRunSafe(prisma, campaignId, Phase.CREATE);
  try {
    const risk = (opts?.risk || 'Balanced') as Risk;
    const seeds = seedRoutes(risk);

    // existing by (hook, mechanic)
    const existing = await prisma.ideaRoute.findMany({
      where: { campaignId },
      select: { id: true, hook: true, mechanic: true },
    });
    const dupKey = (x: { hook: string; mechanic: string }) => `${(x.hook || '').toLowerCase()}::${(x.mechanic || '').toLowerCase()}`;
    const have = new Set(existing.map(dupKey));

    const toCreate = seeds.filter((s) => !have.has(dupKey(s as any)));
    let created = 0;
    for (const s of toCreate) {
      await prisma.ideaRoute.create({
        data: {
          campaignId,
          archetype: s.archetype,
          mechanic: s.mechanic,
          hook: s.hook,
          riskLevel: (s as any).riskLevel || null,
        } as any,
      });
      created++;
    }

    const resultRoutes = await prisma.ideaRoute.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' } as any,
      take: 12,
      select: { id: true, archetype: true, mechanic: true, hook: true, riskLevel: true, createdAt: true },
    });

    // Audit log as BRUCE ideas payload (what WarRoom expects)
    const payload = {
      action: 'ideas',
      result: { routes: resultRoutes },
    };
    await logAgentMessageSafe(prisma, {
      phaseRunId: pr.id,
      campaignId,
      agent: 'BRUCE',
      role: 'SUGGESTION',
      action: 'ideas',
      payload,
      text: JSON.stringify(payload),
    });

    if (pr.persisted) await updatePhaseRunSafe(prisma, pr.id, 'COMPLETE');

    return {
      ok: true,
      attempted: seeds.length,
      created,
      skipped: seeds.length - created,
      routes: resultRoutes,
    };
  } catch (e) {
    if (pr.persisted) await updatePhaseRunSafe(prisma, pr.id, 'FAILED');
    throw e;
  }
}
