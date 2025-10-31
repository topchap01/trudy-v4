// apps/backend/src/orchestrator/runFraming.ts
// Builds structured framing + boardroom narrative from brief (no OpenAI required here).

import type { PrismaClient, Campaign } from '@prisma/client';
import { Phase } from '@prisma/client';
import { createPhaseRunSafe, updatePhaseRunSafe, logAgentMessageSafe } from './phaseRunSafe.js';

function toIso(d?: Date | null) {
  try { return d ? new Date(d).toISOString() : undefined; } catch { return undefined; }
}
function addDays(base: Date, days: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function boardroomNarrative(opts: {
  brand: string; market: string; category: string; targetPrimary: string;
  hook: string; offer: string; channels: string[]; toolName: string;
}) {
  const {
    brand, market, category, targetPrimary, hook, offer, channels, toolName,
  } = opts;
  const ch = channels.length ? channels.join(' and ') : 'in-store and social';
  return [
    `Campaign Brief: We're working with ${brand} to drive ${category.toLowerCase()} sales among ${targetPrimary} in ${market}.`,
    `The commercial challenge is to position ${brand} not just as a provider, but as a partner in creating a future-ready home, under the creative hook “${hook}”.`,
    `The behavioural tension to address is the perceived high upfront cost of ${brand} versus the actual long-term value delivered.`,
    `The ${offer} is a key tool to alleviate that tension — but the value proposition must go beyond the offer, highlighting efficiency, durability and everyday improvement.`,
    `Client pressure points: grow sales and ensure clear omnichannel communication, especially across ${ch}.`,
    `Creative direction: guide toward a narrative that makes ${brand} desirable and attainable — real scenarios where the products reduce friction.`,
    `Guardrails: if we use ${toolName}, it must be simple, realistic and genuinely helpful.`,
    `In-store dynamics: the offer must be obvious at POS; staff briefed; redemption low-friction.`,
    `Outcome: immediate sales + longer-term brand preference.`,
  ].join(' ');
}

export async function runFraming(
  prisma: PrismaClient,
  campaign: Campaign & { brief: { parsedJson: any } | null },
): Promise<{ phaseRunId: string; framing: any }> {
  const pr = await createPhaseRunSafe(prisma, campaign.id, Phase.FRAMING);

  try {
    const pj = campaign.brief?.parsedJson ?? {};
    const brand = String(pj.brand || campaign.title || 'Brand').trim();
    const market = String(pj.market || campaign.market || 'AU').trim();
    const category = String(pj.category || campaign.category || 'Category').trim();
    const targetPrimary =
      String(pj?.target?.primary || pj?.audience || '').trim() || 'middle-income homeowners';
    const mechanic =
      pj.mechanic ||
      (Array.isArray(pj.mechanics) && pj.mechanics[0]) ||
      'Prize Draw (Major)';

    const hook = String(pj.hook || pj.creativeHook || pj.proposition || '').trim()
      || 'Upgrade Your Everyday, Invest in the Future of Home';
    const offer = String(pj.offer || pj.promo || pj.cashback || '').trim()
      || '$500 cashback';
    const channels: string[] = Array.isArray(pj.channels) ? pj.channels : [];
    const toolName = String(pj.toolName || pj.tool || pj.interactiveTool || '').trim()
      || 'virtual kitchen upgrade tool';

    // dates
    const tStartStr = pj?.timing?.start || pj?.timingStart || campaign.startDate || null;
    const tEndStr = pj?.timing?.end || pj?.timingEnd || campaign.endDate || null;
    const timingStart = tStartStr ? String(tStartStr).slice(0, 10) : undefined;
    const timingEnd = tEndStr ? String(tEndStr).slice(0, 10) : undefined;

    const startDate = timingStart ? new Date(timingStart) : null;
    const endDate = timingEnd ? new Date(timingEnd) : null;

    const sellin = startDate ? addDays(startDate, -20) : null;
    const buildLock = startDate ? addDays(startDate, -7) : null;
    const goLive = startDate || null;
    const midflight = startDate ? addDays(startDate, 30) : null;
    const wrap = endDate ? addDays(endDate, 7) : null;

    const timeline = [
      { key: 'sellin', title: 'Retail Sell-in Complete', due: toIso(sellin), owner: 'Accounts', status: 'PENDING' },
      { key: 'build', title: 'Build & Artwork Lock', due: toIso(buildLock), owner: 'Studio', status: 'PENDING' },
      { key: 'golive', title: 'Go Live', due: toIso(goLive), owner: 'PM', status: 'PENDING' },
      { key: 'midflight', title: 'Midflight Check', due: toIso(midflight), owner: 'PM', status: 'PENDING' },
      { key: 'wrap', title: 'Wrap & Winner Publish', due: toIso(wrap), owner: 'Ops', status: 'PENDING' },
    ].filter((x) => x.due);

    const positioning = {
      shopperInsight: pj?.positioning?.shopperInsight || 'Shoppers respond to simple entry and clear value.',
      brandRole: pj?.positioning?.brandRole || 'Drive consideration at shelf with a chance-based value exchange.',
      categoryRole: pj?.positioning?.categoryRole || 'Grow basket via repeat entry and retailer visibility.',
    };
    const success = {
      primaryKpi: pj?.success?.primaryKpi || 'Entries per store per week',
      leading: pj?.success?.leading || ['Entry rate', 'Repeat entry share', 'Receipt validation pass rate'],
      lagging: pj?.success?.lagging || ['Incremental units', 'Footfall', 'Media-assisted sales'],
    };
    const risks = pj?.risks || [
      { area: 'Permit timing', mitigation: 'File 4–6 weeks prior (AU states as needed)' },
      { area: 'Fraud receipts', mitigation: 'OCR + human audit + denylist' },
      { area: 'Consumer confusion', mitigation: 'Plain-language copy + odds disclosure' },
    ];
    const retailers = Array.isArray(pj.retailers) ? pj.retailers : [];

    const framing = {
      at: new Date().toISOString(),
      brand,
      market,
      status: campaign.status || 'RUNNING',
      category,
      mechanic,
      retailers,
      timingStart,
      timingEnd,
      targetPrimary,
      prizeBudget: pj?.prizeBudget ?? null,
      timeline,
      summary: `Campaign framing for ${brand} in ${category} using ${mechanic}.`,
      positioning,
      success,
      narrative: [
        { title: 'The Hook', bullets: ['Short CTA', 'Odds clarity', 'Retail fit'] },
        { title: 'The Mechanic', bullets: ['PoP validation', 'Weekly cadence', 'Instant gratification optional'] },
        { title: 'Prize Ladder', bullets: ['1 Major', 'Weekly mid-tier', 'Instant small wins if budget allows'] },
        { title: 'Go-To-Market', bullets: ['In-store assets', 'CRM to re-engage', 'Retail media boost'] },
      ],
      risks,
      boardroomNarrative: boardroomNarrative({
        brand,
        market: market === 'AU' ? 'Australia' : market,
        category,
        targetPrimary,
        hook,
        offer,
        channels,
        toolName,
      }),
    };

    await logAgentMessageSafe(prisma, {
      phaseRunId: pr.id,
      campaignId: campaign.id,
      agent: 'BRUCE',
      role: 'SUGGESTION',
      action: 'framing',
      payload: { action: 'framing', result: framing },
      text: JSON.stringify({ action: 'framing', result: framing }),
    });

    if (pr.persisted) await updatePhaseRunSafe(prisma, pr.id, 'COMPLETE');
    return { phaseRunId: pr.id, framing };
  } catch (err) {
    if (pr.persisted) await updatePhaseRunSafe(prisma, pr.id, 'FAILED');
    throw err;
  }
}
