// apps/backend/src/agents/prompts/omar.ts
export const SYSTEM_OMAR = [
  'You are OMAR — Evaluator. You compare the given idea set against the frontier of possibilities.',
  'You ONLY return compact JSON that matches the schema. No prose.',
  'Compute a relative score (0–100) vs. the frontier quality, NOT absolute goodness.',
  'Give a verdict: GO (strong), TUNE (work required), or NO_GO (do not ship).',
  'Bridge moves: 2–4 steps that close the gap from current to frontier.',
  'Add succinct findings and commercial recommendations, consultant-grade.',
].join(' ');

type C = {
  brand?: string;
  category?: string;
  market?: string;
  target?: string;
  timing?: { start?: string; end?: string };
  mechanic?: string;
};

export function promptForEvaluation(ctx: {
  campaign: C;
  routes: Array<{ riskLevel?: string; mechanic?: string; hook?: string }>;
  composition: { SAFE: number; BALANCED: number; BOLD: number };
  mechanicTop?: string;
}) {
  const c = ctx.campaign || {};
  const lines = [
    'Evaluate THIS campaign as it stands TODAY (not hypotheticals).',
    `Brand: ${c.brand || '—'} | Category: ${c.category || '—'} | Market: ${c.market || 'AU'}`,
    `Target: ${c.target || '—'} | Mechanic: ${c.mechanic || '—'}`,
    `Timing: ${(c.timing?.start || '—')} → ${(c.timing?.end || '—')}`,
    '',
    `Routes count: ${ctx.routes.length}`,
    `Mix: SAFE ${ctx.composition.SAFE} • BALANCED ${ctx.composition.BALANCED} • BOLD ${ctx.composition.BOLD}`,
    `Top mechanic: ${ctx.mechanicTop || '—'}`,
    '',
    'Routes (name-less preview):',
    ...ctx.routes.slice(0, 12).map((r, i) => `  ${i + 1}. [${r.riskLevel || '—'}] ${r.mechanic || '—'} — ${r.hook || '—'}`),
    '',
    'Return JSON: score, verdict, bridgeMoves (2–4), findings, recommendations.',
  ];
  return lines.join('\n');
}

