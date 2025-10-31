// apps/backend/src/orchestrator/runEvaluation.ts
// Evaluates current idea routes; produces a 3-agent panel + findings & recs.

import type { PrismaClient } from '@prisma/client';
import { Phase } from '@prisma/client';
import { createPhaseRunSafe, updatePhaseRunSafe, logAgentMessageSafe } from './phaseRunSafe.js';

type Mix = { SAFE: number; BALANCED: number; BOLD: number };
type EvalSnapshot = {
  at: string;
  routeCount: number;
  composition: Mix;
  findings: string[];
  recommendations: string[];
  panel: {
    Boris: string;
    Ava: string;
    Clara: string;
  };
};

function compOf(routes: Array<{ riskLevel?: string | null }>): Mix {
  const m: Mix = { SAFE: 0, BALANCED: 0, BOLD: 0 };
  for (const r of routes) {
    const k = String(r.riskLevel || '').toUpperCase();
    if (k === 'SAFE') m.SAFE++;
    else if (k === 'BOLD') m.BOLD++;
    else m.BALANCED++;
  }
  return m;
}

export async function runEvaluation(prisma: PrismaClient, campaignId: string): Promise<{
  phaseRunId: string;
  evaluation: EvalSnapshot;
}> {
  const pr = await createPhaseRunSafe(prisma, campaignId, Phase.EVALUATE);

  try {
    const [routes, campaign] = await Promise.all([
      prisma.ideaRoute.findMany({ where: { campaignId }, select: { id: true, mechanic: true, hook: true, riskLevel: true } }),
      prisma.campaign.findUnique({ where: { id: campaignId }, include: { brief: true } }),
    ]);

    const mix = compOf(routes);
    const total = routes.length;

    const brand = (campaign?.brief?.parsedJson as any)?.brand || campaign?.title || 'Brand';
    const category = (campaign?.brief?.parsedJson as any)?.category || campaign?.category || 'category';
    const mechanic = (campaign?.brief?.parsedJson as any)?.mechanic || (routes[0]?.mechanic || 'mechanic');

    const findings: string[] = [];
    if (total === 0) {
      findings.push('No routes available to evaluate.');
    } else {
      findings.push(`Coverage across risk: SAFE ${mix.SAFE}, BALANCED ${mix.BALANCED}, BOLD ${mix.BOLD}.`);
      if (mix.BOLD === 0) findings.push('Missing BOLD route for standout and earned talkability.');
      if (mix.SAFE > total * 0.8) findings.push('Set is over-weighted to SAFE; consider braver hooks or mechanics.');
    }

    const recommendations: string[] = [];
    if (total === 0) {
      recommendations.push('Create a seed set of 3 routes across SAFE / BALANCED / BOLD.');
    } else {
      recommendations.push('Keep 1–2 strongest hooks; retire duplicates or near-duplicates.');
      recommendations.push('Pressure-test mechanics for operational simplicity and permit timelines.');
      recommendations.push('Ensure prize ladder matches budget and communicates perceived value.');
    }

    const panel = {
      Boris: total === 0
        ? 'No live routes — push a seeded set today so we can score and select.'
        : 'Double down on the route with the clearest value exchange; trim anything that can’t justify incremental sales.',
      Ava: total === 0
        ? 'Start with a single-minded hook. Don’t chase formats until we have a strong line to build from.'
        : 'Pick one headline hook and build out a distinctable device; remove weaker lookalikes.',
      Clara: total === 0
        ? 'Confirm feasibility (permits, PoP, fulfilment) before adding complexity.'
        : 'Check permit lead times and redemption friction; simpler beats clever under time pressure.',
    };

    const evaluation: EvalSnapshot = {
      at: new Date().toISOString(),
      routeCount: total,
      composition: mix,
      findings,
      recommendations,
      panel,
    };

    // Persist snapshot to brief.assets.evaluation (+ history)
    const assetsIn = ((campaign?.brief as any)?.assets || {}) as Record<string, any>;
    const history = Array.isArray(assetsIn.evaluationHistory) ? assetsIn.evaluationHistory.slice() : [];
    history.unshift({ at: evaluation.at, evaluation });

    const nextAssets = {
      ...assetsIn,
      lastLaunch: {
        ...(assetsIn.lastLaunch || {}),
        summary: {
          ...((assetsIn.lastLaunch?.summary) || {}),
          evaluation,
        },
      },
      evaluationHistory: history,
    };
    if (campaign?.brief?.campaignId) {
      await prisma.brief.update({ where: { campaignId }, data: { assets: nextAssets as any } });
    }

    // Log agent messages: top summary + panel voices
    await logAgentMessageSafe(prisma, {
      phaseRunId: pr.id,
      campaignId,
      agent: 'BRUCE',
      role: 'SUGGESTION',
      action: 'evaluation',
      payload: { action: 'evaluation', result: { summary: evaluation, panel } },
      text: JSON.stringify({ action: 'evaluation', result: { summary: evaluation, panel } }),
    });

    if (pr.persisted) await updatePhaseRunSafe(prisma, pr.id, 'COMPLETE');
    return { phaseRunId: pr.id, evaluation };
  } catch (e) {
    if (pr.persisted) await updatePhaseRunSafe(prisma, pr.id, 'FAILED');
    throw e;
  }
}
