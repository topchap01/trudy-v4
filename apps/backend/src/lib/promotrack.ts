// apps/backend/src/lib/promotrack.ts
// Centralised PromoTrack guidance used as PRIVATE prompt bias.
// Add-only. Safe to import in Evaluate/Create/AskOutputs without leaking copy.

import type { CampaignContext } from './context.js'

export type RuleFlex = 'KEEP' | 'BEND' | 'BREAK'

// ——— Guardrails (short; prompt-friendly) ———
// Note: Odds/ladder guidance is for NON-assured value promos only.
// For assured value (Cashback or effectively-unlimited GWP), focus on clarity, speed, and proof transparency.
export const PROMOTRACK_COMPACT = [
  'Hassle: prefer one-screen mobile entry; use QR as a pointer only if natural. Avoid mandatory receipt upload unless clearly warranted.',
  'Perceived odds (non-assured value only): hero + visible ladder (instant wins and/or weekly moments) usually outperforms single mega-prize.',
  'Retailer ops: zero staff adjudication; ship pre-packed POS; centralise winner comms & fulfilment.',
  'Explain-in-5s: staff should pitch in one breath; avoid multi-step or technical terms.',
  'Compliance (AU default): RSA/ABAC lines for alcohol; age gate; no consumption cues.',
  'Fulfilment: travel prizes need buffers/concierge; publish timelines in T&Cs.',
  'KPIs: name ONE primary success metric; align mechanic and value to it.',
] as const

export const PROMOTRACK_NUDGE =
  'Use these guardrails to reduce hassle, improve perceived value/odds where relevant, and de-risk store ops. Prefer simple one-screen flows, central adjudication, and clear staff scripts.'

export const PROMOTRACK_EXCEPTION_FRAME = [
  'If bending/breaking a guardrail, justify briefly:',
  '- Hypothesis (why this helps here)',
  '- Key risks & mitigations (retail ops / compliance / fulfilment)',
  '- Measures (what proves it works)',
  '- Exit criteria (when we revert)',
].join('\n')

// ——— Context flags ———
function isAlcohol(ctx: CampaignContext) {
  const cat = (ctx.category || '').toLowerCase()
  const rs  = Array.isArray(ctx.briefSpec?.retailers) ? ctx.briefSpec!.retailers.join(' ').toLowerCase() : ''
  return /alcohol|beer|wine|spirit|liquor/.test(cat) || /(bws|dan murphy|on-premise|pub|hotel)/.test(rs)
}
function mentionsReceiptUpload(ctx: CampaignContext) {
  const budget = String((ctx.briefSpec as any)?.frictionBudget || '').toLowerCase()
  const type   = String(ctx.briefSpec?.typeOfPromotion || '').toLowerCase()
  const notes  = JSON.stringify(ctx.briefSpec || {}).toLowerCase()
  return /receipt|upload|proof/.test(budget) || /receipt|upload|proof/.test(type) || /receipt|upload|proof/.test(notes)
}
function travelPrize(ctx: CampaignContext) {
  const hero = String(ctx.briefSpec?.heroPrize || '').toLowerCase()
  return /trip|travel|flight|flights|holiday/.test(hero)
}

// Assured value = everyone gets something of value.
// Treat Cashback and effectively-unlimited GWP as assured.
// This suppresses prize-ladder nudges unless a major overlay is explicitly briefed.
function isAssuredValue(ctx: CampaignContext) {
  const spec: any = ctx.briefSpec || {}
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const cashback = spec?.cashback
  const gwp = spec?.gwp
  const cashbackAssured = type === 'CASHBACK' || !!cashback
  const gwpAssured = (type === 'GWP' || !!gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null)
  return Boolean(cashbackAssured || gwpAssured)
}

// Explicit major prize overlay on top of an assured-value promotion (allowed if briefed).
function hasOverlayPrize(ctx: CampaignContext) {
  const spec: any = ctx.briefSpec || {}
  return isAssuredValue(ctx) && Boolean(spec?.heroPrize)
}

// ——— PRIVATE guide for Evaluate ———
export function buildEvaluationGuide(
  ctx: CampaignContext,
  opts?: { ruleFlex?: RuleFlex }
): string {
  const ruleFlex: RuleFlex = (opts?.ruleFlex || 'KEEP')
  const lines: string[] = []

  const assured = isAssuredValue(ctx)
  const overlay = hasOverlayPrize(ctx)

  lines.push('PROMOTRACK GUARDRAILS (private; do not cite verbatim):')
  for (const g of PROMOTRACK_COMPACT) lines.push(`- ${g}`)
  lines.push(PROMOTRACK_NUDGE)

  const nudges: string[] = []

  // Hassle / proof handling: do not automatically treat cashback proof as “red”—just call for clarity/UX.
  if (mentionsReceiptUpload(ctx)) {
    nudges.push('Hassle flag: brief suggests receipt/proof handling. Keep it one-screen and simple; only require uploads if value clearly warrants and OCR is seamless.')
  }

  if (travelPrize(ctx)) {
    nudges.push('Fulfilment flag: travel-like hero prize. Require buffers/concierge and explicit T&C timelines.')
  }

  if (isAlcohol(ctx) && (ctx.market || 'AU').toUpperCase() === 'AU') {
    nudges.push('Compliance flag (AU alcohol): include RSA/ABAC lines, age gate, and avoid consumption cues.')
  }

  // Perceived-odds ladder nudge only for NON-assured value promos (unless a separate overlay is briefed and needs cadence advice).
  if (!assured) {
    const typeStr = String(ctx.briefSpec?.typeOfPromotion || '').toLowerCase()
    const hasFewRUs = Array.isArray(ctx.briefSpec?.runnerUps) && (ctx.briefSpec!.runnerUps!.length < 3)
    const lacksInstant = !/instant/.test(typeStr)
    if (hasFewRUs && lacksInstant) {
      nudges.push('Perceived-odds flag (non-assured): consider a visible ladder (weekly moments and/or instant wins) so chances don’t feel thin.')
    }
  } else if (overlay) {
    nudges.push('Overlay note: assured-value core with a briefed major prize overlay. Keep the overlay simple, fame-driving, and clearly separate from the “everyone gets” value.')
  }

  if (nudges.length) {
    lines.push('\nContextual flags:')
    for (const n of nudges) lines.push(`- ${n}`)
  }

  lines.push(`\nRuleFlex: ${ruleFlex}`)
  if (ruleFlex === 'KEEP') {
    lines.push('Apply guardrails strictly; prefer the simplest compliant path; no novelty for novelty’s sake.')
  } else if (ruleFlex === 'BEND') {
    lines.push('Guardrails may be bent if upside is clear. Use the exception frame; keep explainable-in-5s.')
    lines.push(PROMOTRACK_EXCEPTION_FRAME)
  } else {
    lines.push('Guardrails may be broken for a step-change idea. REQUIRE the exception frame + backstops and retailer-safe execution.')
    lines.push(PROMOTRACK_EXCEPTION_FRAME)
  }

  lines.push('\nReminder: recommendations must land store-safe (zero staff burden), keep the hook premium and short.')
  if (assured) {
    lines.push('Assured-value mode: do NOT add prize ladders unless a separate overlay is explicitly briefed. Focus on clarity of value, speed, and transparent “how to claim”.')
  }
  return lines.join('\n')
}

// ——— PRIVATE guide for Create ———
export function buildCreationGuide(
  ctx: CampaignContext,
  opts?: { ruleFlex?: RuleFlex; intensity?: 'CONSERVATIVE'|'DISRUPTIVE'|'OUTRAGEOUS' }
): string {
  const ruleFlex: RuleFlex = (opts?.ruleFlex || 'KEEP')
  const intensity = opts?.intensity || 'DISRUPTIVE'
  const lines: string[] = []

  const assured = isAssuredValue(ctx)
  const overlay = hasOverlayPrize(ctx)

  lines.push(`PROMOTRACK (private): Start brand-first. Keep store burden at zero. Intensity=${intensity}.`)
  for (const g of PROMOTRACK_COMPACT) lines.push(`- ${g}`)
  lines.push(PROMOTRACK_NUDGE)

  const flags: string[] = []
  if (mentionsReceiptUpload(ctx)) flags.push('If proof is needed, keep it one-screen with good OCR; do not ask for more than you must.')
  if (travelPrize(ctx)) flags.push('Travel prize ⇒ concierge partner + blackout dates + buffers.')
  if (isAlcohol(ctx) && (ctx.market || 'AU').toUpperCase() === 'AU') flags.push('Alcohol AU ⇒ RSA/ABAC, age gate, no consumption cues.')
  if (!assured) flags.push('Non-assured: consider a visible ladder only if it genuinely improves perceived chances without raising ops burden.')
  if (assured && overlay) flags.push('Assured + overlay: keep overlay fame-driving and simple; do not let it complicate the claim flow for the “everyone gets” value.')
  if (flags.length) {
    lines.push('\nContext flags:')
    for (const f of flags) lines.push(`- ${f}`)
  }

  lines.push(`\nRuleFlex: ${ruleFlex}`)
  if (ruleFlex === 'KEEP') {
    lines.push('Stay inside guardrails; novelty only if it improves shopper behaviour or retailer sell-in.')
  } else if (ruleFlex === 'BEND') {
    lines.push('You may bend one guardrail per platform. For each bend include a one-line hypothesis + mitigation.')
  } else {
    lines.push('You may BREAK a guardrail for one platform. Include hypothesis, risks, mitigations, measures, and exit criteria.')
    lines.push(PROMOTRACK_EXCEPTION_FRAME)
  }

  lines.push('\nDo NOT leak this section to the client prose.')
  if (assured) {
    lines.push('Assured-value mode: centre the value story, ease, and speed. Avoid prize-y language unless an overlay is briefed.')
  }
  return lines.join('\n')
}
