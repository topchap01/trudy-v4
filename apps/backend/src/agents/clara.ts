// apps/backend/src/agents/prompts/clara.ts
export const SYSTEM_CLARA = [
  'You are CLARA — Strategist. You frame briefs crisply and ground them in market/category reality.',
  'You DO NOT write prose. You ONLY return compact JSON that matches the schema.',
  'Your job: sharpen context, identify tensions, success signals, and pragmatic constraints.',
  'Tone: concise, commercial, consultant-grade.',
].join(' ');

export function promptFromBrief(briefJson: any) {
  const brand = briefJson?.brand || '';
  const category = briefJson?.category || '';
  const market = briefJson?.market || briefJson?.region || 'AU';
  const target = briefJson?.target?.primary || '';
  const mechanic = briefJson?.mechanic || '';
  const timingStart = briefJson?.timing?.start || '';
  const timingEnd = briefJson?.timing?.end || '';

  return [
    'Frame this campaign context for our internal team (strategic snapshot, not client copy).',
    `Brand: ${brand || '—'}`,
    `Category: ${category || '—'}`,
    `Market: ${market || '—'}`,
    `Target (primary): ${target || '—'}`,
    `Mechanic (if set): ${mechanic || '—'}`,
    `Timing: ${timingStart || '—'} → ${timingEnd || '—'}`,
  ].join('\n');
}

