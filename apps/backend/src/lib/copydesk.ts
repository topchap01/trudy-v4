// apps/backend/src/lib/copydesk.ts
import { chat } from './openai.js'
import type { CampaignContext } from './context.js'
import { resolveModel } from './models.js'
import { polishText } from './polish.js'

export const VOICE = {
  consultant: { name: 'Consultant', tone: 'Clear, senior, concise.', pattern: 'Use short paragraphs, avoid filler.' },
  ferrierSuit: {
    name: 'Ferrier+Suit',
    tone: 'Crisp, commercially astute, behaviour-led. Dry wit allowed, no clichés, no marketing bingo.',
    pattern: 'Prefer short lines. Specific, observed, retailer-real.',
  },
} as const

export const CREATE_FERRIER_COMPOSE_PROMPT = `
Rewrite the routes in Ferrier+Suit voice.
- Keep headings and bullet structure.
- Make hooks short, premium, brand-locked.
- Tighten mechanics into a five-second staff script.
- Keep ops/compliance lines plain.
- Remove repetition, hedge words, and generic claims.
`.trim()

export async function composeFerrierRoutes(
  ctx: CampaignContext,
  routesMarkdown: string,
  { model = resolveModel(process.env.MODEL_CREATE, process.env.MODEL_DEFAULT, 'gpt-4o-mini') }: { model?: string } = {}
): Promise<string> {
  const system = [
    'Ferrier+Suit style.',
    'Crisp, commercially astute, behaviour-led. Dry wit allowed, no clichés, no marketing bingo.',
    'Keep the existing headings and bullet structure.',
    'Short sentences. No marketing bingo. Tighten claims.',
  ].join(' ')

  const user = [
    `Client: ${ctx.clientName} — ${ctx.title}`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Position: ${ctx.brandPosition || 'unknown'}`,
    '',
    'RAW ROUTES (markdown):',
    routesMarkdown,
    '',
    'Rewrite the routes in Ferrier+Suit voice.',
    '- Keep headings and bullet structure.',
    '- Make hooks short, premium, brand-locked.',
    '- Tighten mechanics into a five-second staff script.',
    '- Keep ops/compliance lines plain.',
    '- Remove repetition, hedge words, and generic claims.',
  ].join('\n')

  return await chat({
    model: String(model),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.35,
    top_p: 0.95,
    max_output_tokens: 1600,
    meta: { scope: 'copydesk.compose', campaignId: ctx.id },
  })
}

/* -------------------------------------------------------------------------- */
/*                         Helpers for Evaluation prose                       */
/* -------------------------------------------------------------------------- */

function brandFirst(ctx: CampaignContext): string {
  const spec: any = ctx.briefSpec || {}
  const brand = spec.brand || spec.client || ctx.clientName || ctx.title || 'Client'
  return String(brand).trim()
}

function isAssuredValue(ctx: CampaignContext, diag: any): boolean {
  const spec: any = ctx.briefSpec || {}
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const gwp = spec?.gwp || null
  const cashback = spec?.cashback || null
  const viaJSON = Boolean(diag?.ui?.assuredValue || diag?._assuredValue)

  const hasCashback = Boolean(type === 'CASHBACK' || cashback)
  const assuredViaCashback = hasCashback && Boolean(!cashback || cashback.assured !== false)
  const assuredViaGWP = (type === 'GWP' || !!gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null)

  return viaJSON || assuredViaCashback || assuredViaGWP
}

function briefContains(verbatim: string, ctx: CampaignContext): boolean {
  const spec: any = ctx.briefSpec || {}
  const hay = [
    JSON.stringify(spec || {}),
    spec?.hook || '',
    spec?.mechanicOneLiner || '',
    (ctx as any)?.rawNotes || '',
  ].join(' ').toLowerCase()
  return hay.includes(verbatim.toLowerCase())
}

function stripClichesIfAssured(text: string, ctx: CampaignContext, assured: boolean): string {
  if (!assured) return text
  const banned = [
    'scan the qr',
    'you’re in',
    "you're in",
    'instant win',
    'publish total winners',
    'weekly draw',
    'add instant wins',
    'scan to win',
  ]
  let out = text
  for (const phrase of banned) {
    if (!briefContains(phrase, ctx)) {
      const rx = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      out = out.replace(rx, '')
    }
  }
  // cleanup from removals
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1')
  return out.trim()
}

function polishProseAU(src: string): string {
  if (!src) return ''
  const PROTECTED = new Map<string, string>()
  let s = String(src)

  s = s.replace(/\*\*[^*]+\*\*/g, (m) => { const k = `§§B${PROTECTED.size}§§`; PROTECTED.set(k, m); return k })
  s = s.replace(/\n- /g, (m) => { const k = `§§L${PROTECTED.size}§§`; PROTECTED.set(k, m); return k })

  s = s
    .replace(/\bfriction\b/gi, 'hassle')
    .replace(/\blearnings\b/gi, 'what we learned')
    .replace(/\blevers\b/gi, 'things to change')
    .replace(/\bjourney\b/gi, 'flow')
    .replace(/\bgamification\b/gi, 'game bits')
    .replace(/\bunlock\b/gi, 'get')
    .replace(/\bfulfillment\b/gi, 'fulfilment')
    .replace(/\bzeitgeist\b/gi, 'moment')
    .replace(/\bcultural\s+(?:anchor|crescendo)\b/gi, 'cultural moment')
    .replace(/\bthe moment is ripe\b/gi, 'now is a good time')
    .replace(/\bthis is not just (?:a )?campaign\b/gi, 'this campaign')
    .replace(/\.{3,}/g, '…')
    .replace(/([.!?…])\s*([.!?…]+)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')

  for (const [k, v] of PROTECTED.entries()) s = s.replaceAll(k, v)
  return polishText(s.trim(), { locale: 'en-AU' })
}

/* -------------------------------------------------------------------------- */
/* ——— Evaluation composer (Ferrier×Droga) ———                                */
/* -------------------------------------------------------------------------- */

export const EVAL_COMPOSE_PROMPT_FERRIER = `
Write a world-class, client-ready evaluation in Ferrier+Suit voice.
- Sound like a sharp Australian strategist: commercially tough, behaviour-led, a little cheek is fine.
- Treat the diagnosis JSON as facts; build a flowing argument around it.
- Write free-form prose. Use short paragraphs and bullets only where they earn their keep.
- Anchor to the brand’s line(s). If weak, sharpen to a short premium line and use it consistently.
- Prioritise: (1) what truly matters at the shelf, (2) value story, (3) staff-zero ops, (4) timing reality.
- Weave in PromoTrack heuristics as reasoning — never label them by name.
- No marketing bingo: avoid “friction”, “unlock”, “journey”, “levers”, “ladder”. Prefer “hassle”, “chances”, “mix of winners”.
- If the promotion is assured value (cashback or unlimited-cap GWP), do NOT describe prize ladders, cadence, odds, or “publish total winners”.
- Ban boilerplate unless present verbatim in the brief: “scan the QR”, “you’re in”, “instant win”, “publish total winners”, “scan to win”.
- End with a tight “Spec, tightened” only if it helps move decisions; otherwise finish strong and clean.
- No tables, no matrices, no boilerplate headings.
`.trim()

/**
 * Composes the Ferrier×Droga evaluation narrative from structured JSON.
 * Accepts optional priorFraming (authoritative context) and privateBias (quiet guardrails/heuristics cues to steer judgement).
 * This function is assured-value aware and applies an anti-cliché filter when appropriate.
 */
export async function composeFerrierSuitFromJSON(
  ctx: CampaignContext,
  jsonPayload: unknown,
  {
    model = resolveModel(process.env.MODEL_EVAL, process.env.MODEL_DEFAULT, 'gpt-4o'),
    temperature = Number(process.env.EVAL_TEMP ?? 0.9),
    top_p = 0.95,
    priorFraming = '',
    privateBias = '',
  }: { model?: string; temperature?: number; top_p?: number; priorFraming?: string; privateBias?: string } = {}
): Promise<string> {
  const system = [
    'You are TRUDY — a world-class promotional strategist and creative director in one.',
    'Write like Ferrier×Droga: commercially ruthless, creatively brave, human.',
    'Never template. Say only what helps this client decide. No headings unless they earn their place.',
  ].join(' ')

  let diag: any = {}
  try { diag = typeof jsonPayload === 'string' ? JSON.parse(jsonPayload) : (jsonPayload || {}) } catch {}

  const assured = isAssuredValue(ctx, diag)

  const briefLine = [
    ctx.briefSpec?.hook ? `Hook: ${ctx.briefSpec.hook}` : '',
    ctx.briefSpec?.mechanicOneLiner ? `Mechanic: ${ctx.briefSpec.mechanicOneLiner}` : '',
    ctx.briefSpec?.typeOfPromotion ? `Promotion: ${ctx.briefSpec.typeOfPromotion}` : '',
    Array.isArray(ctx.briefSpec?.retailers) && ctx.briefSpec.retailers.length ? `Retailers: ${ctx.briefSpec.retailers.join(', ')}` : '',
    ctx.briefSpec?.heroPrize ? `Hero prize: ${ctx.briefSpec.heroPrize}${ctx.briefSpec?.heroPrizeCount ? ` x${ctx.briefSpec.heroPrizeCount}` : ''}` : '',
    ctx.briefSpec?.calendarTheme ? `Calendar: ${ctx.briefSpec.calendarTheme}` : '',
    ctx.orientation ? `Stance: ${ctx.orientation}` : '',
  ].filter(Boolean).join(' | ')

  // Quiet bias (do not echo as lists; steer only)
  const quietBiasParts: string[] = []
  if (Array.isArray(diag?.promotrack_applied) && diag.promotrack_applied.length) {
    quietBiasParts.push(`Applied patterns: ${diag.promotrack_applied.join(', ')}`)
  }
  if (Array.isArray(diag?.ferrier_bets) && diag.ferrier_bets.length) {
    quietBiasParts.push(`Behaviour bets: ${diag.ferrier_bets.join(' | ')}`)
  }
  if (Array.isArray(diag?.droga_bets) && diag.droga_bets.length) {
    quietBiasParts.push(`Fame bets: ${diag.droga_bets.join(' | ')}`)
  }
  if (typeof diag?.friction === 'string' && diag.friction) quietBiasParts.push(`Hassle note: ${diag.friction}`)
  if (typeof diag?.mechanic === 'string' && diag.mechanic) quietBiasParts.push(`Entry path: ${diag.mechanic}`)
  if (diag?.prizes?.hero || (Array.isArray(diag?.prizes?.runner_ups) && diag.prizes.runner_ups.length)) {
    const ru = Array.isArray(diag.prizes?.runner_ups) ? diag.prizes.runner_ups.join(', ') : ''
    quietBiasParts.push(`Prize shape: hero=${diag.prizes?.hero || 'n/a'}; runner-ups=${ru || 'n/a'}`)
  }
  if (privateBias) quietBiasParts.push(`Extra bias: ${privateBias}`)
  if (assured) quietBiasParts.push('Assured value: YES (cashback/GWP unlimited)')

  const header = `${brandFirst(ctx)} — ${ctx.title} (Client: ${ctx.clientName || 'n/a'})`

  const user = [
    `Campaign: ${header}`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Position: ${ctx.brandPosition || 'UNKNOWN'} | Orientation: ${ctx.orientation}`,
    `AssuredMode: ${assured ? 'ASSURED_VALUE' : 'NON_ASSURED'}`,
    '',
    'BRIEF SNAPSHOT:',
    briefLine || '_none_',
    '',
    priorFraming ? 'PRIOR FRAMING (authoritative context):' : '',
    priorFraming ? priorFraming : '',
    priorFraming ? '' : '',
    'STRUCTURED DIAGNOSIS JSON:',
    JSON.stringify(jsonPayload),
    '',
    quietBiasParts.length
      ? 'PRIVATE BIAS (do not echo as lists; only use when it changes a decision):'
      : '',
    quietBiasParts.length ? quietBiasParts.join('\n• ') : '',
    '',
    EVAL_COMPOSE_PROMPT_FERRIER,
  ].join('\n')

  const raw = await chat({
    model: String(model),
    system,
    messages: [{ role: 'user', content: user }],
    temperature,
    top_p,
    max_output_tokens: 1400,
    meta: { scope: 'copydesk.evaluate', campaignId: ctx.id },
  })

  const cleaned = polishProseAU(String(raw || '').trim())
  return stripClichesIfAssured(cleaned, ctx, assured)
}
