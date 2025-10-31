import { chat } from '../openai.js'
import { prisma } from '../../db/prisma.js'
import type { CampaignContext } from '../context.js'
import { renderBriefSnapshot } from '../context.js'
import * as Promo from '../promotrack.js'
import { scoreOffer, type OfferIQ } from '../offeriq.js'
import type { ResearchPack } from '../research.js'
import type { FramingV2Meta } from './framing.js'
import { resolveModel } from '../models.js'
import { polishText } from '../polish.js'

export type OpinionMeta = {
  kind: 'opinion.v1'
  stance: 'DECISIVE' | 'NEUTRAL'
  calls: { go: string[]; no_go: string[] }
  risks: string[]
  retailer_incentives: string[]
  hook_alternatives: string[]
  offerIQ?: OfferIQ
}

/* ------------------- Framing handoff (research/bench/guards) ------------------- */

type PrizePresence = 'NONE' | 'BREADTH_ONLY' | 'MAJOR_PRESENT'
type FramingBenchmarks = {
  cashback: {
    sample: number
    typicalAbs: number | null
    maxAbs: number | null
    typicalPct: number | null
    maxPct: number | null
  }
  prizeCountsObserved: { total: number; common: Array<{ count: number; share: number }> }
  recommendedHeroCount: number
  cashbackIsCompetitive?: 'ABOVE_TYPOLOGICAL' | 'MEETS_TYPOLOGICAL' | 'BELOW_TYPOLOGICAL' | 'UNKNOWN'
}

type FramingV2MetaForOpinion = FramingV2Meta | null

// ---- helpers ---------------------------------------------------------------
function cap<T>(xs: any, n: number): T[] {
  const arr = Array.isArray(xs) ? xs : []
  return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, n) as T[]
}

function normaliseMeta(m: any): OpinionMeta {
  const meta: OpinionMeta = {
    kind: 'opinion.v1',
    stance: (m?.stance === 'NEUTRAL' ? 'NEUTRAL' : 'DECISIVE'),
    calls: {
      go: cap<string>(m?.calls?.go, 5),
      no_go: cap<string>(m?.calls?.no_go, 5),
    },
    risks: cap<string>(m?.risks, 6),
    retailer_incentives: cap<string>(m?.retailer_incentives, 6),
    hook_alternatives: cap<string>(m?.hook_alternatives, 8),
  }
  return meta
}
async function getLatestTextOutputMulti(campaignId: string, types: string[]) {
  const row = await prisma.output.findFirst({
    where: { campaignId, type: { in: types } },
    orderBy: { createdAt: 'desc' },
    select: { content: true, type: true, createdAt: true }
  })
  return row?.content || ''
}
// robust string coercion
function safe(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(safe).filter(Boolean).join(', ')
  try { return JSON.stringify(v) } catch { return String(v) }
}

// AU polish + cliché scrub
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
    .replace(/\bcenter(ed|s)?\b/gi, 'centre$1')
    .replace(/\.{3,}/g, '…')
    .replace(/([.!?…])\s*([.!?…]+)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')

  for (const [k, v] of PROTECTED.entries()) s = s.replaceAll(k, v)
  return polishText(s.trim(), { locale: 'en-AU' })
}
function briefContains(verbatim: string, ctx: CampaignContext): boolean {
  const spec: any = ctx.briefSpec || {}
  const hay =
    (JSON.stringify(spec) + ' ' + (spec?.hook || '') + ' ' + (spec?.mechanicOneLiner || '') + ' ' + (spec?.rawNotes || ''))
      .toLowerCase()
  return hay.includes(verbatim.toLowerCase())
}
function stripClichesIfAssured(text: string, ctx: CampaignContext, isAssuredValue: boolean): string {
  if (!isAssuredValue) return text
  const banned = [
    'scan the qr',
    'you’re in',
    "you're in",
    'instant win',
    'publish total winners',
    'weekly draw',
    'add instant wins',
  ]
  let out = text
  for (const phrase of banned) {
    if (!briefContains(phrase, ctx)) {
      const rx = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
      out = out.replace(rx, () => '')
    }
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim()
}

/* ---------------------- Major-hassle gating (stronger) ---------------------- */

function detectMajorFriction(ctx: CampaignContext, narratives: string[]): boolean {
  const spec: any = ctx.briefSpec || {}
  const hay = [
    JSON.stringify(spec || {}),
    String(spec?.mechanicOneLiner || ''),
    String(spec?.rawNotes || ''),
    ...narratives.map(n => String(n || ''))
  ].join(' ').toLowerCase()

  const strong = [
    /\bmail[-\s]?in\b|\bpostal\b|\bpostage\b/,
    /\bdownload\s+app\b|\bmobile\s+app\b/,
    /\bmanual\s+(review|validation)\b/,
    /\blong\s+survey\b|\b20\+?\s*questions\b/
  ]
  const accum = [
    /\bregister\b|\bcreate\s+account\b|\bsign[-\s]?up\b/,
    /\b(receipt|proof)\b.*\bupload\b|\bupload\b.*\b(receipt|proof)\b/,
    /\benter\s+code\b|\bbarcode\b|\bupc\b/,
    /\bmultiple\s+purchases\b|\bbuy\s+(?:3|three|\d{2,})\b/,
    /\bprint\b.*\bform\b/,
  ]
  if (strong.some(rx => rx.test(hay))) return true
  const hits = accum.reduce((n, rx) => n + (rx.test(hay) ? 1 : 0), 0)
  if (hits >= 2) return true
  const triggerQty = Number(spec?.gwp?.triggerQty ?? spec?.triggerQty ?? 1)
  return Number.isFinite(triggerQty) && triggerQty >= 3
}

/* ---- single implementation: remove ease-claims unless justified ---- */
function stripEaseClaims(text: string, allowEaseLanguage: boolean): string {
  if (allowEaseLanguage) return text
  const banned = [
    'easy to enter','ease of entry','simple entry','low[- ]?friction','few steps','quick to enter',
    'seamless entry','one[- ]tap entry','entry is simple','simple to enter','entry hassle','entry friction',
    'reduce hassle','minimal steps','frictionless','scan the qr','qr code','upload a receipt',
    'register an account','sign[- ]?up','create an account','form field','ux','ui','onboarding',
    'one[- ]?screen','fewer fields','ocr','processing timelines','timeline','first screen'
  ]
  let out = String(text || '')
  for (const p of banned) out = out.replace(new RegExp(p, 'gi'), '')
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim()
}

/* --------------------------- Research & prize helpers --------------------------- */

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a,b)=>a-b)
  const mid = Math.floor(s.length/2)
  return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2
}

function parseAmountAndPercent(...texts: Array<string | null | undefined>) {
  const joined = (texts.filter(Boolean).join(' ') || '').toLowerCase()
  const amtHits = [...joined.matchAll(/(?:\b(?:aud)?\s*\$?\s*)(\d{2,6}(?:,\d{3})?)(?!\s*%)/gi)]
  const amounts = amtHits.map(m => Number(String(m[1]).replace(/,/g,''))).filter(n => n > 0)
  const pctHits = [...joined.matchAll(/(\d{1,3})\s*%/gi)]
  const percents = pctHits.map(m => Number(m[1])).filter(n => n > 0 && n <= 100)
  return { amounts, percents }
}

function buildCashbackBenchmark(research?: ResearchPack | null) {
  const items = (research?.competitors?.promos || []).filter(p => p.type === 'CASHBACK')
  const amounts: number[] = []
  const percents: number[] = []
  for (const p of items) {
    const { amounts: a, percents: pc } = parseAmountAndPercent(p.prizeValueHint || '', p.headline || '', p.title || '')
    amounts.push(...a); percents.push(...pc)
  }
  const typicalAbs = median(amounts)
  const maxAbs = amounts.length ? Math.max(...amounts) : 0
  const typicalPct = median(percents)
  const maxPct = percents.length ? Math.max(...percents) : 0
  return { sample: items.length, typicalAbs: typicalAbs || null, maxAbs: maxAbs || null, typicalPct: typicalPct || null, maxPct: maxPct || null }
}

function buildPrizeCountObservation(research?: ResearchPack | null) {
  const items = (research?.competitors?.promos || []).filter(p => p.type === 'PRIZE')
  const counts: number[] = []
  for (const it of items) {
    const t = (it.title || it.headline || '').toLowerCase()
    const m1 = /win\s+(?:one|1)\s+of\s+([0-9]+)/i.exec(t)
    const m2 = /([0-9]+)\s+(?:x\s+)?(?:major\s+)?prizes?/i.exec(t)
    const m3 = /1\s+of\s+([0-9]+)/i.exec(t)
    const n = m1 ? Number(m1[1]) : m2 ? Number(m2[1]) : m3 ? Number(m3[1]) : null
    if (n && n > 0 && n < 200) counts.push(n)
  }
  const total = counts.length
  const freq: Record<number, number> = {}
  counts.forEach(n => { freq[n] = (freq[n] || 0) + 1 })
  const common = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v]) => ({ count: Number(k), share: total ? v/total : 0 }))
  return { total, common }
}

/* --------- Prize-shape helpers & narrative enforcement --------- */

function parseCashAmountsFromStrings(xs: string[]): number[] {
  const out: number[] = []
  for (const s of xs || []) {
    const m = /(?:\b(?:aud)?\s*\$?\s*)(\d{1,5})(?!\s*%)/i.exec(String(s))
    if (m) out.push(Number(m[1]))
  }
  return out
}

function buildPrizeShapeHint(ctx: CampaignContext, research?: ResearchPack | null) {
  const spec: any = ctx.briefSpec || {}
  const heroCount = Number(spec?.heroPrizeCount ?? 0) || 0
  const runnerUps: string[] = Array.isArray(spec?.runnerUps) ? spec.runnerUps : []
  const smallCash = parseCashAmountsFromStrings(runnerUps).filter(n => n > 0 && n <= 150)
  const prizeObs = buildPrizeCountObservation(research)
  const two = prizeObs.common.find(c => c.count === 2)
  const three = prizeObs.common.find(c => c.count === 3)
  const recommendedHeroCount = two ? 2 : 3 // prefer 2 if clearly common; else 3

  // detect single-admit movie passes to recommend pairing
  const ruJoined = runnerUps.join(' ').toLowerCase()
  const mentionsMovie = /\b(movie|cinema)\b/.test(ruJoined)
  const hintsDouble = /\b(double|2x|two|pair|family)\s+(pass|ticket)s?\b/.test(ruJoined)
  const hasSoloMoviePass = mentionsMovie && !hintsDouble

  return {
    heroCount,
    recommendedHeroCount,
    hasSmallCashRunnerUps: smallCash.length > 0,
    smallestCashRunnerUp: smallCash.length ? Math.min(...smallCash) : null,
    hasSoloMoviePass
  }
}

function isPrizeLed(spec: any): boolean {
  const t = String(spec?.typeOfPromotion || '').toUpperCase()
  if (t === 'PRIZE') return true
  if (spec?.heroPrize || spec?.heroPrizeCount) return true
  if (Array.isArray(spec?.runnerUps) && spec.runnerUps.length) return true
  if (spec?.majorPrizeOverlay) return true
  return !spec?.cashback && !spec?.gwp // default to prize-led when not assured-value
}

function getTotalWinnersFromBrief(spec: any): number | null {
  const keys = ['totalWinners','winners','winnerCount','numberOfWinners','totalPrizes','prizeCount','manyWinners']
  for (const k of keys) {
    const v = spec?.[k]
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
    if (typeof v === 'string') {
      const m = v.match(/(\d{2,6})/)
      if (m) return Number(m[1])
    }
  }
  const hay = `${spec?.hook||''} ${spec?.rawNotes||''}`.toLowerCase()
  const m = hay.match(/(\d{2,6})\s*\+?\s*winners/)
  return m ? Number(m[1]) : null
}

function stripCashbackIfPrize(text: string, prizeLed: boolean): string {
  if (!prizeLed) return text
  return String(text || '')
    .replace(/\bcash[-\s]?back\b/gi, '')
    .replace(/\brebate(s)?\b/gi, '')
    .replace(/\b(gwp|gift with purchase)\b/gi, '')
    .replace(/\bbanded\b/gi, '')
    .replace(/\bclaim\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function ensureOpinionDirectives(
  text: string,
  opts: {
    prizeLed: boolean
    totalWinners: number | null
    hookSuggestion?: string
    forbidHero?: boolean
    breadthOnly?: boolean
    recommendedHeroCount?: number
    hasSoloMoviePass?: boolean
    overlayPresent?: boolean
  }
): string {
  let prose = String(text || '').trim()
  if (!prose) return prose

  const trailing: string[] = []
  const lines = prose.split('\n')
  while (lines.length) {
    const candidate = lines[lines.length - 1]
    if (!candidate || !candidate.trim()) {
      trailing.unshift(lines.pop() as string)
      continue
    }
    if (/^"[^"]+"$/.test(candidate.trim())) {
      trailing.unshift(lines.pop() as string)
      continue
    }
    break
  }
  prose = lines.join('\n').trim()

  if (opts.prizeLed) {
    const improvements: string[] = []
    const lower = prose.toLowerCase()

    if (opts.overlayPresent && !/overlay/i.test(lower) && !opts.forbidHero) {
      improvements.push('stage the Wicked overlay explicitly so the film tie-in earns its shelf story')
    }

    if (opts.forbidHero || opts.breadthOnly) {
      if (opts.totalWinners && opts.totalWinners > 0 && !lower.includes('total winners')) {
        improvements.push(`publish the fact there are ${opts.totalWinners.toLocaleString()} winners so the breadth feels real`)
      }
      if (opts.hasSoloMoviePass && !/double pass|family pass/i.test(lower)) {
        improvements.push('pair every movie ticket into a double pass so the experience matches the indulgent brand promise')
      }
      if (!/cadence|daily|weekly/i.test(lower)) {
        improvements.push('spell out the cadence in comms so shoppers hear when the next winners drop')
      }
    } else {
      const heroN = Math.max(2, Math.min(4, Number(opts.recommendedHeroCount || 3)))
      if (!/hero/i.test(lower)) {
        improvements.push(`install a ${heroN}-winner hero overlay that riffs on the Wicked premiere while keeping the instant wins humming`)
      }
      if (!/instant win/i.test(lower)) {
        improvements.push('convert runner-up prizes into visible instant wins to keep momentum alive in store')
      }
      if (opts.totalWinners && opts.totalWinners > 0 && !lower.includes('total winners')) {
        improvements.push(`repeat that more than ${opts.totalWinners.toLocaleString()} people win so perceived odds stay generous`)
      }
      if (opts.hasSoloMoviePass && !/double pass|family pass/i.test(lower)) {
        improvements.push('frame each movie prize as a double pass so nobody imagines going alone')
      }
    }

    if (opts.hookSuggestion && opts.hookSuggestion.trim() && !lower.includes(opts.hookSuggestion.toLowerCase())) {
      improvements.push(`retune the hook to “${opts.hookSuggestion}” so it sounds like Wicked Sister, not a generic instant win`)
    }

    if (improvements.length && !/to improve/i.test(lower)) {
      const sentences = improvements.map((s) => s.trim())
      const first = sentences.shift() || ''
      const firstSentence = first.endsWith('.') ? first : `${first}.`
      const rest = sentences.map((s) => (s.endsWith('.') ? s : `${s}.`)).join(' ')
      const paragraph = rest ? `To improve it, ${firstSentence} ${rest}` : `To improve it, ${firstSentence}`
      prose = prose ? `${prose}\n\n${paragraph}` : paragraph
    }
  }

  let finalText = prose.trim()
  if (trailing.length) {
    const trailingText = trailing.map((line) => line.trim()).filter(Boolean).join('\n')
    if (trailingText) finalText += `\n\n${trailingText}`
  }
  return finalText.trim()
}


/* ---------------------------------- Main ---------------------------------- */

export async function runOpinion(
  ctx: CampaignContext,
  opts?: {
    stance?: 'DECISIVE'|'NEUTRAL'
    priorFraming?: string
    priorFramingMeta?: FramingV2MetaForOpinion
  }
) {
  const model = resolveModel(process.env.MODEL_OPINION, process.env.MODEL_DEFAULT, 'gpt-4o')

  // Context
  const briefSnap = renderBriefSnapshot(ctx)
  const framing = (opts?.priorFraming && opts.priorFraming.trim())
    ? opts.priorFraming.trim()
    : await getLatestTextOutputMulti(ctx.id, ['framingNarrative','framing'])
  const evaluation = await getLatestTextOutputMulti(ctx.id, ['evaluationNarrative','evaluation'])
  const strategist = await getLatestTextOutputMulti(ctx.id, ['strategistNarrative','strategist'])
  const priorOpinion = await getLatestTextOutputMulti(ctx.id, ['opinionNarrative','opinion'])
  const priorImprovement = ''

  // Handoff guards from Framing
  const fm = opts?.priorFramingMeta || null
  const warPrefs = ctx.warRoomPrefs || {}
  const heroPref = warPrefs.allowHeroOverlay
  const entryLocked = warPrefs.entryFrictionAccepted === true
  const prohibitions = fm?.handoff?.prohibitions || []
  const forbidHeroFromMeta = prohibitions.some((p) => ['NO_HERO_PRIZE', 'NO_HERO_PRIZE_SUGGESTION'].includes(String(p).toUpperCase()))
  const forbidHeroPrize = heroPref === false ? true : forbidHeroFromMeta
  const breadthOnly = fm?.authoritative?.prize_presence === 'BREADTH_ONLY'
  const breadthCount = fm?.breadth_prize?.count ?? null

  // Research snapshot (reuse ONLY from Framing; never fetch here)
  const research: ResearchPack | null = fm?.research ?? null

  // Benchmarks: prefer Framing’s
  const cbBenchFromFraming = fm?.benchmarks?.cashback || null
  const prizeObsFromFraming = fm?.benchmarks?.prizeCountsObserved || null
  const recommendedHeroFromFraming = fm?.benchmarks?.recommendedHeroCount || null
  const cbCompetitiveness = fm?.benchmarks?.cashbackIsCompetitive || 'UNKNOWN'

  const cbBench = cbBenchFromFraming || buildCashbackBenchmark(research)
  const prizeObs = prizeObsFromFraming || buildPrizeCountObservation(research)

  const prizeShape = buildPrizeShapeHint(ctx, research)
  const recommendedHeroCount = Number(recommendedHeroFromFraming || prizeShape.recommendedHeroCount || 3)

  // OfferIQ (with research)
  const ctxWithResearch = Object.assign({}, ctx, { research }) as CampaignContext & { research: ResearchPack | null }
  const offerIQ = scoreOffer(ctxWithResearch)

  // PromoTrack
  let privateGuide = ''
  try {
    privateGuide = Promo.buildEvaluationGuide(ctx, { ruleFlex: 'KEEP' }) || ''
  } catch {
    const compact = (Promo as any)?.PROMOTRACK_COMPACT
    privateGuide = Array.isArray(compact) ? compact.join('\n') : String(compact || '')
  }

  // Assured detection
  const spec: any = ctx.briefSpec || {}
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const gwp = spec?.gwp || null
  const cashback = spec?.cashback || null
  const assuredViaCashback = !!(type === 'CASHBACK' || cashback)
  const assuredViaGWP = !!(type === 'GWP' || gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null)
  const isAssuredValue = !!(assuredViaCashback || assuredViaGWP)

  const cbHeadline: string = cashback?.headline ? String(cashback.headline) : ''
  const cbBands: any[] = Array.isArray(cashback?.bands) ? cashback.bands : []
  const cbAmount: number = Number(cashback?.amount ?? 0) || 0

  const gwpFacts = gwp
    ? [
        gwp.item ? `GWP: ${safe(gwp.item)}` : 'GWP: item n/a',
        `triggerQty: ${gwp.triggerQty != null ? safe(gwp.triggerQty) : 'n/a'}`,
        `cap: ${gwp.cap != null ? safe(gwp.cap) : 'n/a'}`,
      ].join(', ')
    : ''

  const cashbackFacts = cashback
    ? (cbBands.length || cbHeadline)
        ? [
            `Cashback: banded${cbHeadline ? ` (headline: ${safe(cbHeadline)})` : ''}`,
            cashback.currency ? `currency: ${safe(cashback.currency)}` : '',
            `cap: ${cashback.cap != null ? safe(cashback.cap) : 'n/a'}`,
            `proof: ${cashback.proofRequired ? 'REQUIRED' : 'OPTIONAL'}`
          ].filter(Boolean).join(', ')
        : [
            `Cashback: ${cbAmount ? `$${cbAmount}` : 'n/a'} ${safe(cashback?.currency || '')}`.trim(),
            `cap: ${cashback?.cap != null ? safe(cashback.cap) : 'n/a'}`,
            `proof: ${cashback?.proofRequired ? 'REQUIRED' : 'OPTIONAL'}`
          ].join(', ')
    : ''

  const overlay =
    (spec?.majorPrizeOverlay === true || typeof spec?.majorPrizeOverlay === 'string')
      ? `Overlay: ${typeof spec.majorPrizeOverlay === 'string' ? safe(spec.majorPrizeOverlay) : 'Major prize overlay: YES'}`
      : ''

  // IP tie-in
  const ipTie = ctx.briefSpec?.ipTieIn || null
  let ipLine = ''
  if (ipTie) {
    const headline = [ipTie.franchise, ipTie.theme].filter(Boolean)
    const detailParts = [
      ipTie.activationType ? `type: ${ipTie.activationType}` : null,
      ipTie.eventWindow ? `window: ${ipTie.eventWindow}` : null,
      ipTie.partner ? `partner: ${ipTie.partner}` : null,
    ].filter(Boolean)
    const combined = [...headline, ...detailParts]
    if (combined.length) {
      const status = ipTie.licensed ? 'licensed' : 'pending-rights'
      ipLine = `IP tie-in (${status}): ${combined.join(' — ')}`
    }
  }

  // Cadence idea for comms if winners + dates allow
  const totalWinners = getTotalWinnersFromBrief(spec)

  /* ------------------------ 1) JSON meta ------------------------ */
  const metaSys = [
    'You are Ava + Clara. Output ONLY valid JSON. No markdown. No prose.',
    'Decisive. Commercial. No weasel words. No fake precision.',
    // Offer adequacy
    'Use OFFER_IQ as ground truth on adequacy. If verdict is NO-GO, put the value change in calls.no_go and a better alternative in calls.go.',
    // Assured rules
    'If assured-value (cashback/unlimited GWP), do NOT invent draws/cadence.',
    // Ease-of-entry gating
    'Do NOT mention ease/simplicity/hassle unless MAJOR_FRICTION=true.',
    // Prize-shape push (conditional)
    (isPrizeLed(spec) && !forbidHeroPrize && !breadthOnly
      ? 'If PROMO_TYPE=PRIZE and a hero prize is in scope, include explicit go-calls to set hero_prize_count to a tight number (2–3), convert second-tier prizes to instant wins, and refresh the hook (2–6 words, brand-locked). Do not mention cashback/GWP.'
      : 'If PROMO_TYPE=PRIZE and hero is out-of-scope or breadth-only, do NOT invent a hero prize. Focus calls on visible cadence/breadth, optional pairing of single-admit rewards, and leading with total winners if large.'),
    // IP rule
    'If an IP tie-in exists (e.g., movie launch), include a hook alternative aligned to the IP theme and respect any partner/window guardrails; do not fabricate licensing claims.',
    // Cashback competitiveness rule
    'If cashback amount < market typical (see BENCHMARKS), include a go-call to lift the value towards typical or switch to premium GWP; if ≥ typical, call out the advantage.',
  ].filter(Boolean).join(' ')
  const metaUser = [
    `Campaign: ${safe(ctx.clientName) || ''} — ${safe(ctx.title)}`,
    `Market: ${safe(ctx.market) || 'AU'} | Category: ${safe(ctx.category) || 'n/a'} | Position: ${safe(ctx.brandPosition) || 'unknown'}`,
    ipLine ? ipLine : '',
    ipTie?.notes ? `IP guardrails: ${ipTie.notes}` : '',
    `PROMO_TYPE: ${isPrizeLed(spec) ? 'PRIZE' : (assuredViaCashback ? 'CASHBACK' : (assuredViaGWP ? 'GWP' : 'OTHER'))}`,
    '',
    `FLAGS: MAJOR_FRICTION=${detectMajorFriction(ctx, [framing, evaluation, priorOpinion, priorImprovement]) ? 'true' : 'false'} | BREADTH_ONLY=${breadthOnly ? 'true' : 'false'} | FORBID_HERO=${forbidHeroPrize ? 'true' : 'false'}`,
    '',
    'FACTS:',
    [
      spec?.typeOfPromotion ? `Promotion: ${safe(spec.typeOfPromotion)}` : '',
      totalWinners ? `Total winners briefed: ${totalWinners}` : '',
      breadthOnly && breadthCount ? `Breadth winners: ~${breadthCount}` : '',
      gwpFacts ? gwpFacts : '',
      cashbackFacts && (assuredViaCashback || assuredViaGWP) ? cashbackFacts : '',
      overlay ? overlay : '',
    ].filter(Boolean).join(' | ') || '_none_',
    '',
    'RESEARCH SNAPSHOT:',
    cbBench.sample
      ? `Cashback typical ≈ ${cbBench.typicalAbs ? `$${Math.round(cbBench.typicalAbs)}` : (cbBench.typicalPct ? `${cbBench.typicalPct}%` : 'n/a')} (sample ${cbBench.sample}).`
      : '_none_',
    '',
    'BENCHMARKS:',
    JSON.stringify({ cashback: cbBench, prizeObs, recommendedHeroCount, cashbackIsCompetitive: cbCompetitiveness }),
    '',
    'BRIEF SNAPSHOT:',
    renderBriefSnapshot(ctx),
    '',
    'FRAMING (latest):',
    framing || '_none_',
    '',
    'EVALUATION (latest):',
    evaluation || '_none_',
    '',
    'STRATEGIST (latest):',
    strategist || '_none_',
    '',
    'OFFER_IQ:',
    JSON.stringify(offerIQ),
    '',
    'Return JSON EXACTLY in this shape:',
    JSON.stringify({
      kind: 'opinion.v1',
      stance: (opts?.stance || 'DECISIVE'),
      calls: { go: ['string'], no_go: ['string'] },
      risks: ['string'],
      retailer_incentives: ['string'],
      hook_alternatives: ['2–6 words']
    }),
    '',
    'Caps: go ≤5, no_go ≤5, risks ≤6, retailer_incentives ≤6, hook_alternatives ≤8.'
  ].join('\n')

  const metaRaw = await chat({
    model,
    system: metaSys,
    messages: [{ role: 'user', content: metaUser }],
    temperature: 0.2,
    top_p: 0.9,
    json: true,
    max_output_tokens: 800,
    meta: { scope: 'opinion.meta', campaignId: ctx.id },
  })

  let metaParsed: any
  try { metaParsed = JSON.parse(metaRaw) } catch { metaParsed = {} }
  const meta = normaliseMeta(metaParsed)
  meta.offerIQ = offerIQ

  /* ------------------------ 2) Prose opinion narrative ---------------------- */
  const majorFriction = detectMajorFriction(ctx, [framing, evaluation, strategist, priorOpinion, priorImprovement])
  const prizeLed = isPrizeLed(spec)

const proseSys = [
    'You are Ava and Clara channelling Ferrier and Droga. Deliver a 320–420 word board memo that sings.',
    'Voice: lyrical, commercial, ruthless. Sentences ≤20 words. No bullets, no headings, no lists, no emojis.',
    'Weave the sharpest lines from Strategist and Evaluation and name them explicitly so the reader hears the team.',
    'Anchor every assertion in the brief, Framing, Strategist, Evaluation, or Research. Quote or cite where useful (e.g. “Source: insidefmcg.com.au”).',
    'Paint scenes: the shopper at shelf, the retailer buyer in range review, the CMO in the war room.',
    entryLocked ? 'Entry mechanic already approved; only threaten it if a radical new value move demands it.' : '',
    isAssuredValue
      ? 'Assured value: celebrate certainty, logistics, and proof. Never invent prize ladders or odds.'
      : (prizeLed ? 'Prize mode: balance breadth and theatre; measure odds against benchmarks and competitors.' : ''),
    (prizeLed ? 'Stay in the prize world; do not pivot to cashback unless the brief already has it.' : ''),
    forbidHeroPrize
      ? 'Hero overlay is off-limits; your improvements must stretch breadth, cadence, or hook—not invent a hero prize.'
      : 'If a fame overlay helps, size it with numbers and keep breadth visible.',
    'Cover five flowing movements separated by blank lines:',
    '1) An opening thesis that states the call (without GO/NO-GO language) and why the moment matters now.',
    '2) Why it works today — stitch brand truth, shopper tension, retailer reality, and cultural timing into one persuasive paragraph.',
    '3) The improvement plan — spell out the specific changes (hooks, prizing, cadence, comms) and why they work, referencing Strategist or Evaluation data.',
    '4) Retailer & operations reality — reassure the buyer on staff lift, display asks, cadence, and how the plan defends freezer space.',
    '5) Tighten versus Stretch — two paragraphs that show the pragmatic tweak and the bolder extension, both grounded in store reality.',
    'When prescribing improvements, spell out what we will do and the commercial reason it pays off.',
    'Finish with Pack line and Staff line each on their own line, in straight quotes, no labels.',
    'Never use bullets, numbering, arrows, or markdown. Let the prose carry the structure.',
    'Cite sources inline (Source: …) whenever you use data.',
  ].filter(Boolean).join(' ')

  // IP hook hint
  const ipHint = ipTie && (ipTie.franchise || ipTie.theme)
    ? `Hook theme hint: ${[ipTie.franchise, ipTie.theme].filter(Boolean).join(' — ')}`
    : ''

  const proseUser = [
    `Campaign: ${safe(ctx.clientName) || ''} — ${safe(ctx.title)}`,
    `Market: ${safe(ctx.market) || 'AU'} | Category: ${safe(ctx.category) || 'n/a'} | Position: ${safe(ctx.brandPosition) || 'unknown'}`,
    ipHint ? ipHint : '',
    `PROMO_TYPE: ${prizeLed ? 'PRIZE' : (assuredViaCashback ? 'CASHBACK' : (assuredViaGWP ? 'GWP' : 'OTHER'))}`,
    '',
    `AssuredMode: ${isAssuredValue ? 'ASSURED_VALUE' : 'NON_ASSURED'}`,
    `MAJOR_FRICTION: ${majorFriction ? 'true' : 'false'} | BREADTH_ONLY: ${breadthOnly ? 'true' : 'false'} | FORBID_HERO: ${forbidHeroPrize ? 'true' : 'false'}`,
    entryLocked ? 'GUIDANCE: Entry friction locked — keep mechanics as briefed.' : '',
    heroPref === false ? 'GUIDANCE: Hero overlay off-limits until client overturns.' : heroPref === true ? 'GUIDANCE: Hero overlay encouraged — tie to Wicked IP fame.' : '',
    '',
    'Facts:',
    [
      spec?.typeOfPromotion ? `Promotion: ${safe(spec.typeOfPromotion)}` : '',
      totalWinners ? `Total winners briefed: ${totalWinners}` : '',
      breadthOnly && breadthCount ? `Breadth winners: ~${breadthCount}` : '',
      gwpFacts ? gwpFacts : '',
      cashbackFacts && isAssuredValue ? cashbackFacts : '',
      `Cashback competitiveness: ${cbCompetitiveness}`,
      overlay ? overlay : '',
    ].filter(Boolean).join(' | ') || '_none_',
    '',
    'Research snapshot:',
    cbBench.sample
      ? `Cashback typical ≈ ${cbBench.typicalAbs ? `$${Math.round(cbBench.typicalAbs)}` : (cbBench.typicalPct ? `${cbBench.typicalPct}%` : 'n/a')} (sample ${cbBench.sample}).`
      : '_none_',
    '',
    'Prize shape hint (authoritative):',
    JSON.stringify({ ...prizeShape, recommendedHeroCount }),
    '',
    'Authoritative meta (do not echo lists):',
    JSON.stringify(meta),
    '',
    'OfferIQ:',
    JSON.stringify(offerIQ),
    '',
    'BRIEF SNAPSHOT:',
    briefSnap,
    '',
    'FRAMING:',
    framing || '_none_',
    '',
    'EVALUATION:',
    evaluation || '_none_',
    '',
    'STRATEGIST:',
    strategist || '_none_',
  ].join('\n')

  const contentRaw = await chat({
    model,
    system: proseSys,
    messages: [{ role: 'user', content: proseUser }],
    temperature: 0.6,
    top_p: 0.95,
    max_output_tokens: 1500,
    meta: { scope: 'opinion.narrative', campaignId: ctx.id },
  })

  // Post-process: AU polish, assured scrub, prize-only scrub, strict no-ease unless major issue, and conditional directives
  const polished = polishProseAU(String(contentRaw || '').trim())
  const noAssuredCliches = stripClichesIfAssured(polished, ctx, isAssuredValue)
  const noEase = stripEaseClaims(noAssuredCliches, majorFriction)
  const noCashbackInPrize = stripCashbackIfPrize(noEase, prizeLed)
  const withDirectives = ensureOpinionDirectives(noCashbackInPrize, {
    prizeLed,
    totalWinners,
    hookSuggestion: (meta?.hook_alternatives || [])[0] || '',
    forbidHero: forbidHeroPrize,
    breadthOnly,
    recommendedHeroCount,
    hasSoloMoviePass: prizeShape.hasSoloMoviePass,
    overlayPresent: Boolean(spec?.majorPrizeOverlay)
  })

  const final = withDirectives

  return { content: final, meta }
}
