import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { renderBriefSnapshot } from '../context.js'
import * as Promo from '../promotrack.js'
import { scoreOffer } from '../offeriq.js'
import type { OfferIQ } from '../offeriq.js'
import { runResearch, type ResearchPack } from '../research.js'
import { resolveModel } from '../models.js'

type PrizePresence = 'NONE' | 'BREADTH_ONLY' | 'MAJOR_PRESENT'

export type FramingV2Meta = {
  kind: 'framing.v2'
  behavioural_objective: string | null
  tensions: string[]
  audience: { mindsets: Array<{ name: string; job: string }> }
  category_competition: { tropes_to_avoid: string[]; spaces_to_own: string[] }
  market_facts: Array<{ claim: string; sourceHint: string }>
  idea_core: string[]
  proposition_candidates: string[]
  hooks: string[]
  reasons_to_believe: string[]
  improvement_hypotheses: string[]
  prize_map: {
    items: Array<{
      type: 'PRIZE_SYMBOLIC' | 'PRIZE_FINANCIAL' | 'PRIZE_EXPERIENTIAL' | 'GWP' | 'OTHER'
      label: string
      rationale?: string
    }>
    has_symbolic_prize: boolean
  }
  // —— brand lens fields ——
  brand_truths: string[]
  distinctive_assets: {
    visual: string[]
    verbal: string[]
    ritual: string[]
  }
  category_codes: {
    lean: string[]
    break: string[]
  }
  tone_of_voice: {
    do: string[]
    dont: string[]
  }
  non_negotiables: string[]

  // —— surfaced, non-generative payloads / guards ——
  offer_iq?: OfferIQ
  research?: ResearchPack
  benchmarks?: {
    cashback: {
      sample: number
      typicalAbs: number | null
      maxAbs: number | null
      typicalPct: number | null
      maxPct: number | null
      sources?: string[]
    }
    prizeCountsObserved: { total: number; common: Array<{ count: number; freq: number; share: number }> }
    recommendedHeroCount: number
    cashbackIsCompetitive?: 'ABOVE_TYPOLOGICAL' | 'MEETS_TYPOLOGICAL' | 'BELOW_TYPOLOGICAL' | 'UNKNOWN'
  }
  authoritative?: {
    assured_value: boolean
    has_major_prize: boolean
    prize_presence: PrizePresence
    instant_win: boolean
  }
  breadth_prize?: {
    count: number | null
    labelHint?: string | null
  }
  handoff?: {
    research_provided: boolean
    do_not_research: boolean
    prohibitions: string[] // e.g., ['NO_HERO_PRIZE_SUGGESTION']
  }
}

// ---- helpers ---------------------------------------------------------------
function cap<T>(xs: any, n: number): T[] {
  const arr = Array.isArray(xs) ? xs : []
  return arr.map((x) => String(x).trim()).filter(Boolean).slice(0, n) as T[]
}

function listify(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.flatMap(listify)
  if (typeof value === 'string') {
    return value
      .split(/[•\u2022,\n;/|]+/)
      .map(s => s.trim())
      .filter(Boolean)
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    const s = String(value).trim()
    return s ? [s] : []
  }
  if (typeof value === 'object') return Object.values(value).flatMap(listify)
  return []
}

function takeUnique(values: string[], limit?: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values) {
    const s = String(raw || '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (limit && out.length >= limit) break
  }
  return out
}

function truncate(s: string, max = 220): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`
}

function formatFacts(facts: Array<{ claim?: string; source?: string }> | undefined, label: string, limit: number): string[] {
  if (!Array.isArray(facts)) return []
  return facts
    .slice(0, limit)
    .map(f => {
      const claim = truncate(String(f?.claim || '').trim())
      if (!claim) return null
      const src = String(f?.source || '').trim()
      return src ? `${label}: ${claim} (${src})` : `${label}: ${claim}`
    })
    .filter(Boolean) as string[]
}

// narrow research to relevant category/brand tokens
function tokensFromCtx(ctx: CampaignContext): string[] {
  const toks: string[] = []
  if (ctx.category) toks.push(ctx.category.toLowerCase())
  if (ctx.briefSpec?.brand) toks.push(String(ctx.briefSpec.brand).toLowerCase())
  // sensible defaults for Wicked Sisters
  toks.push('dessert','pudding','custard','snacking dessert','chilled dessert')
  return Array.from(new Set(toks)).filter(Boolean)
}
function factLooksOnCategory(text: string, toks: string[]): boolean {
  const s = (text || '').toLowerCase()
  return toks.some(t => s.includes(t))
}
function filterFactsByCategory(
  facts: Array<{ claim: string; sourceHint: string }>,
  ctx: CampaignContext
) {
  const toks = tokensFromCtx(ctx)
  return facts.filter(f => factLooksOnCategory(f.claim, toks))
}

function classifyPrizeType(label: string): 'PRIZE_EXPERIENTIAL' | 'PRIZE_FINANCIAL' | 'GWP' | 'OTHER' {
  const s = (label || '').toLowerCase()
  if (/(trip|travel|flight|holiday|experience|chef|dinner|concert|event|tour)/i.test(s)) return 'PRIZE_EXPERIENTIAL'
  if (/(cash|voucher|gift\s*card|\$|aud|credit|prepaid)/i.test(s)) return 'PRIZE_FINANCIAL'
  if (/\bgwp\b|\bgift with purchase\b/i.test(s)) return 'GWP'
  return 'OTHER'
}

function tryJson(value: any): any {
  if (!value) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return typeof value === 'object' ? value : null
}

function normaliseMeta(m: any): FramingV2Meta {
  const meta: FramingV2Meta = {
    kind: 'framing.v2',
    behavioural_objective: m?.behavioural_objective ?? null,
    tensions: Array.isArray(m?.tensions) ? m.tensions : [],
    audience: {
      mindsets: Array.isArray(m?.audience?.mindsets) ? m.audience.mindsets : [],
    },
    category_competition: {
      tropes_to_avoid: Array.isArray(m?.category_competition?.tropes_to_avoid) ? m.category_competition.tropes_to_avoid : [],
      spaces_to_own: Array.isArray(m?.category_competition?.spaces_to_own) ? m.category_competition.spaces_to_own : [],
    },
    market_facts: Array.isArray(m?.market_facts) ? m.market_facts : [],
    idea_core: Array.isArray(m?.idea_core) ? m.idea_core : [],
    proposition_candidates: Array.isArray(m?.proposition_candidates) ? m.proposition_candidates : [],
    hooks: Array.isArray(m?.hooks) ? m.hooks : [],
    reasons_to_believe: Array.isArray(m?.reasons_to_believe) ? m.reasons_to_believe : [],
    improvement_hypotheses: Array.isArray(m?.improvement_hypotheses) ? m.improvement_hypotheses : [],
    prize_map: {
      items: Array.isArray(m?.prize_map?.items) ? m.prize_map.items : [],
      has_symbolic_prize: Boolean(m?.prize_map?.has_symbolic_prize),
    },
    brand_truths: Array.isArray(m?.brand_truths) ? m.brand_truths : [],
    distinctive_assets: {
      visual: Array.isArray(m?.distinctive_assets?.visual) ? m.distinctive_assets.visual : [],
      verbal: Array.isArray(m?.distinctive_assets?.verbal) ? m.distinctive_assets.verbal : [],
      ritual: Array.isArray(m?.distinctive_assets?.ritual) ? m.distinctive_assets.ritual : [],
    },
    category_codes: {
      lean: Array.isArray(m?.category_codes?.lean) ? m.category_codes.lean : [],
      break: Array.isArray(m?.category_codes?.break) ? m.category_codes.break : [],
    },
    tone_of_voice: {
      do: Array.isArray(m?.tone_of_voice?.do) ? m.tone_of_voice.do : [],
      dont: Array.isArray(m?.tone_of_voice?.dont) ? m.tone_of_voice.dont : [],
    },
    non_negotiables: Array.isArray(m?.non_negotiables) ? m.non_negotiables : [],
    offer_iq: m?.offer_iq,
    research: m?.research,
    benchmarks: m?.benchmarks,
    authoritative: m?.authoritative,
    breadth_prize: m?.breadth_prize,
    handoff: m?.handoff,
  }

  meta.tensions = cap<string>(meta.tensions, 3)
  meta.market_facts = cap<{ claim: string; sourceHint: string }>(meta.market_facts, 5)
  meta.proposition_candidates = cap<string>(meta.proposition_candidates, 3)
  meta.hooks = cap<string>(meta.hooks, 5)
  meta.reasons_to_believe = cap<string>(meta.reasons_to_believe, 4)
  meta.improvement_hypotheses = cap<string>(meta.improvement_hypotheses, 5)
  meta.prize_map.items = cap<any>(meta.prize_map.items || [], 6)
  meta.prize_map.has_symbolic_prize = Boolean(meta.prize_map.items?.some((i: any) => i?.type === 'PRIZE_SYMBOLIC'))

  meta.brand_truths = cap<string>(meta.brand_truths, 5)
  meta.distinctive_assets = {
    visual: cap<string>(meta.distinctive_assets.visual || [], 6),
    verbal: cap<string>(meta.distinctive_assets.verbal || [], 6),
    ritual: cap<string>(meta.distinctive_assets.ritual || [], 6),
  }
  meta.category_codes = {
    lean: cap<string>(meta.category_codes.lean || [], 6),
    break: cap<string>(meta.category_codes.break || [], 6),
  }
  meta.tone_of_voice = {
    do: cap<string>(meta.tone_of_voice.do || [], 5),
    dont: cap<string>(meta.tone_of_voice.dont || [], 5),
  }
  meta.non_negotiables = cap<string>(meta.non_negotiables, 6)

  return meta
}

export function extractFramingMeta(
  source: any
): FramingV2Meta | null {
  if (!source) return null

  const direct = tryJson(source)
  const maybeMeta =
    (direct && direct.kind === 'framing.v2') ? direct :
    (direct && direct.meta && direct.meta.kind === 'framing.v2') ? direct.meta :
    null
  if (maybeMeta) return normaliseMeta(maybeMeta)

  const params = tryJson((source && 'params' in source) ? (source as any).params : null)
  if (params) {
    const viaParams =
      (params.meta && params.meta.kind === 'framing.v2') ? params.meta :
      (params.result && params.result.meta && params.result.meta.kind === 'framing.v2') ? params.result.meta :
      (params.kind === 'framing.v2') ? params :
      null
    if (viaParams) return normaliseMeta(viaParams)
  }

  const metaField = tryJson((source && 'meta' in source) ? (source as any).meta : null)
  if (metaField && metaField.kind === 'framing.v2') return normaliseMeta(metaField)
  if (metaField && metaField.meta && metaField.meta.kind === 'framing.v2') return normaliseMeta(metaField.meta)

  return null
}

function identityLine(ctx: CampaignContext): string {
  const b = (ctx.briefSpec as any)?.brand
  const brandPart = b ? `${b} — ` : ''
  const clientPart = ctx.clientName ? ` (Client: ${ctx.clientName})` : ''
  return `${brandPart}${ctx.title}${clientPart}`
}

function pushResearchFacts(metaArr: Array<{ claim: string; sourceHint: string }>, pack?: ResearchPack | null, ctx?: CampaignContext) {
  if (!pack) return
  const pick = (facts?: Array<{ claim?: string; source?: string }>) =>
    (facts || [])
      .map(f => {
        const claim = (f?.claim || '').trim()
        const sourceHint = (f?.source || '').trim()
        return claim ? { claim, sourceHint: sourceHint || 'Source: indicative' } : null
      })
      .filter(Boolean) as Array<{ claim: string; sourceHint: string }>

  let candidates: Array<{ claim: string; sourceHint: string }> = [
    ...(pick(pack.brand?.facts) || []),
    ...(pick(pack.audience?.facts) || []),
    ...(pick(pack.category?.facts) || []),
    ...(pick(pack.competitors?.facts) || []),
  ]

  // category gate
  candidates = filterFactsByCategory(candidates, ctx!)

  for (const f of candidates) {
    if (metaArr.length >= 5) break
    if (!metaArr.some(x => x.claim === f.claim)) metaArr.push(f)
  }
}

function seasonHint(ctx: CampaignContext): string {
  if ((ctx.market || '').toUpperCase().includes('AU')) {
    const s = ctx.startDate ? new Date(ctx.startDate) : null
    if (s) {
      const m = s.getUTCMonth() + 1
      if ([6,7,8].includes(m)) return 'Winter in Australia'
      if ([9,10,11].includes(m)) return 'Spring in Australia'
      if ([12,1,2].includes(m)) return 'Summer in Australia'
      if ([3,4,5].includes(m)) return 'Autumn in Australia'
    }
    return 'Winter in Australia'
  }
  return ''
}

/* ------------------------------- Benchmarks -------------------------------- */

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a,b)=>a-b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2
}

type PromoLike = {
  type?: string
  title?: string
  url?: string
  headlineValue?: { amount?: number; percent?: number } | null
  headline?: string | null
  prizeValueHint?: string | null
  cadence?: string | null
  brand?: string | null
}
function getCompetitorPromos(pack?: ResearchPack | null): PromoLike[] {
  const maybe = (pack as any)?.competitors?.promos
  return Array.isArray(maybe) ? maybe : []
}
function parseHeroCountFromTitle(s: string): number | null {
  if (!s) return null
  const m1 = /win\s+(one|1)\s+of\s+(\d+)/i.exec(s)
  if (m1) return Number(m1[2]) || 1
  const m2 = /(\d+)\s+(major\s+)?prizes/i.exec(s)
  if (m2) return Number(m2[1]) || null
  const m3 = /1\s+of\s+(\d+)/i.exec(s)
  if (m3) return Number(m3[1]) || 1
  return null
}
function parseAmountAndPercent(...texts: Array<string | null | undefined>) {
  const joined = (texts.filter(Boolean).join(' ') || '').toLowerCase()
  const amtHits = [...joined.matchAll(/(?:\b(?:aud)?\s*\$?\s*)(\d{2,6}(?:,\d{3})?)(?!\s*%)/gi)]
  const amounts = amtHits.map(m => Number(String(m[1]).replace(/,/g,''))).filter(n => n > 0)
  const pctHits = [...joined.matchAll(/(\d{1,3})\s*%/gi)]
  const percents = pctHits.map(m => Number(m[1])).filter(n => n > 0 && n <= 100)
  return { amounts, percents }
}
function buildCashbackBenchmark(pack?: ResearchPack | null) {
  const promos = getCompetitorPromos(pack).filter(p => String(p.type || '').toUpperCase() === 'CASHBACK')
  const amounts: number[] = []
  const percents: number[] = []
  for (const p of promos) {
    const { amounts: a, percents: pc } = parseAmountAndPercent(p.headlineValue?.amount?.toString(), p.headline, p.prizeValueHint, p.title)
    amounts.push(...a); percents.push(...pc)
  }
  const typicalAbs = median(amounts)
  const maxAbs = amounts.length ? Math.max(...amounts) : 0
  const typicalPct = median(percents)
  const maxPct = percents.length ? Math.max(...percents) : 0
  const sources = promos.slice(0, 6).map(p => [p.title, p.url].filter(Boolean).join(' — ')).filter(Boolean)
  return {
    sample: promos.length,
    typicalAbs: typicalAbs || null,
    maxAbs: maxAbs || null,
    typicalPct: typicalPct || null,
    maxPct: maxPct || null,
    sources
  }
}
function buildPrizeCountObservation(pack?: ResearchPack | null) {
  const promos = getCompetitorPromos(pack).filter(p => String(p.type || '').toUpperCase() === 'PRIZE')
  const counts: number[] = []
  for (const it of promos) {
    const n = parseHeroCountFromTitle(it.title || '')
    if (n && n > 0 && n < 50) counts.push(n)
  }
  const total = counts.length
  const byFreq: Record<number, number> = {}
  for (const n of counts) byFreq[n] = (byFreq[n] || 0) + 1
  const common = Object.entries(byFreq)
    .sort((a,b) => b[1]-a[1])
    .slice(0,3)
    .map(([k,v]) => ({ count: Number(k), freq: v, share: total ? v/total : 0 }))
  return { total, common }
}

/* ---------------------------- Prize presence ------------------------------- */

function derivePrizePresence(brief: any): {
  prize_presence: PrizePresence
  has_major_prize: boolean
  instant_win: boolean
  breadth_count: number | null
  breadth_labelHint: string | null
} {
  const type = String(brief?.typeOfPromotion || '').toUpperCase()
  const heroPrize = (brief as any)?.heroPrize || null
  const heroPrizeCount = Number((brief as any)?.heroPrizeCount ?? 0) || 0
  const runnerUps = Array.isArray((brief as any)?.runnerUps) ? (brief as any).runnerUps : []
  const totalWinners = Number((brief as any)?.totalWinners ?? (brief as any)?.totalWinnersEst ?? 0) || 0

  const instant_win = type === 'INSTANT_WIN'
  const has_major = Boolean(heroPrize) || heroPrizeCount > 0
  if (has_major) {
    return { prize_presence: 'MAJOR_PRESENT', has_major_prize: true, instant_win, breadth_count: totalWinners || null, breadth_labelHint: null }
  }
  const breadth = instant_win || (runnerUps.length > 0) || (totalWinners > 0)
  return {
    prize_presence: breadth ? 'BREADTH_ONLY' : 'NONE',
    has_major_prize: false,
    instant_win,
    breadth_count: breadth ? (totalWinners || null) : null,
    breadth_labelHint: null
  }
}

/* ----------------------- cadence/shareability helpers --------------------- */

function winnersCadenceSuggestion(totalWinners: number | null, start?: string | null, end?: string | null): string | null {
  if (!totalWinners || !start || !end) return null
  const s = new Date(start + 'T00:00:00Z')
  const e = new Date(end + 'T23:59:59Z')
  const ms = e.getTime() - s.getTime()
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24))
  if (!Number.isFinite(days) || days <= 0) return null
  const perDay = totalWinners / days
  if (perDay >= 24) {
    const perHour = Math.floor(perDay / 24)
    return perHour >= 1 ? `${perHour} winner${perHour > 1 ? 's' : ''} every hour` : `${Math.round(perDay)} winners a day`
  }
  return `~${Math.max(1, Math.round(perDay))} winners a day`
}

function doublePassEquivalent(totalWinners: number | null): string | null {
  if (!totalWinners || totalWinners <= 1) return null
  const pairs = Math.floor(totalWinners / 2)
  return pairs > 0 ? `${pairs.toLocaleString()} double passes` : null
}

function isMovieTicketPrize(spec: any): boolean {
  const hay = JSON.stringify(spec || {}).toLowerCase()
  return /(movie|cinema|ticket|pass|gold\s*class|hoyts|event\s*cinemas)/i.test(hay)
}

function heroSuggestionAllowed(ctx: CampaignContext): boolean {
  const nn = Array.isArray((ctx.briefSpec as any)?.nonNegotiables)
    ? ((ctx.briefSpec as any).nonNegotiables as string[]).map(s => s.toLowerCase())
    : []
  if (nn.some(s => /no\s*(hero|major|overlay)/i.test(s))) return false
  return true
}

/* -------------------------------------------------------------------------- */

export async function runFraming(ctx: CampaignContext) {
  const model = resolveModel(process.env.MODEL_FRAME, process.env.MODEL_DEFAULT, 'gpt-4o')

  // Optional private PromoTrack bias
  let promotrackGuide = ''
  try {
    if (typeof (Promo as any).buildFramingGuide === 'function') {
      promotrackGuide = (Promo as any).buildFramingGuide(ctx) || ''
    } else if ((Promo as any).PROMOTRACK_COMPACT) {
      promotrackGuide = String((Promo as any).PROMOTRACK_COMPACT)
        .split(',').map(s => s.trim()).filter(Boolean).slice(0, 10).join('\n')
    }
  } catch {}

  // Assured value flags
  const isCashback =
    String(ctx.briefSpec?.typeOfPromotion || '').toUpperCase() === 'CASHBACK' ||
    Boolean(ctx.briefSpec?.cashback) ||
    Boolean((ctx.briefSpec as any)?.assuredValue)

  const assuredItems = Array.isArray((ctx.briefSpec as any)?.assuredItems)
    ? (ctx.briefSpec as any).assuredItems
    : []

  const entryMechanic = (ctx.briefSpec as any)?.entryMechanic || ctx.briefSpec?.mechanicOneLiner || null

  // OfferIQ (non-generative)
  const offerIQ = scoreOffer(ctx)

  // Research
  const researchLevel = (process.env.RESEARCH_LEVEL as 'LITE'|'DEEP'|'MAX') || 'DEEP'
  let research: ResearchPack | null = null
  try {
    research = await runResearch(ctx, researchLevel)
  } catch {
    research = { meta: { level: 'LITE', warnings: ['research subsystem unavailable'] } } as any
  }

  const brief: any = ctx.briefSpec || {}
  const objectiveSignals = takeUnique([
    ...listify(brief.primaryObjective),
    ...listify(brief.primaryKpi),
    ...listify(brief.secondaryKpis)
  ], 6)
  const audienceSignals = takeUnique([
    ...listify(brief.audience),
    ...listify(brief.targetAudience),
    ...listify(brief.target),
    ...listify(brief.audienceSegments),
    ...listify(brief.loyaltyTier?.summary)
  ], 8)
  const buyerTensionSignals = takeUnique(listify(brief.buyerTensions), 6)
  const purchaseTriggerSignals = takeUnique(listify(brief.purchaseTriggers), 6)
  const channelSignals = takeUnique(listify(brief.media), 8)
  const brandTruthSignals = takeUnique(listify(brief.brandTruths), 6)
  const assetSignals = takeUnique([
    ...listify(brief.distinctiveAssets?.visual),
    ...listify(brief.distinctiveAssets?.verbal),
    ...listify(brief.distinctiveAssets?.ritual)
  ], 9)
  const toneDoSignals = takeUnique(listify(brief.toneOfVoice?.do), 5)
  const toneDontSignals = takeUnique(listify(brief.toneOfVoice?.dont), 5)
  const nonNegotiableSignals = takeUnique(listify(brief.nonNegotiables), 6)
  const mechanicSignals = takeUnique([
    ...listify(brief.mechanicOneLiner),
    ...listify(brief.entryMechanic),
    ...listify(brief.hook)
  ], 6)
  const prizeSignals = takeUnique([
    ...listify(brief.heroPrize),
    ...listify(brief.rewardUnit),
    ...listify(brief.prizeBudgetNotes)
  ], 6)
  const retailerSignals = takeUnique(listify(brief.retailers), 10)
  const competitorSignals = takeUnique(listify(brief.competitors), 10)

  // Derived benchmarks from research (robust to missing data)
  const cbBench = buildCashbackBenchmark(research)
  const prizeObs = buildPrizeCountObservation(research)
  const recommendedHeroCount = (() => {
    const hit = prizeObs.common.find(c => c.count === 3) || prizeObs.common.find(c => c.count === 2)
    return hit ? hit.count : 3
  })()

  // Authoritative brief props
  const heroPrize = (ctx.briefSpec as any)?.heroPrize || null
  const heroPrizeCount = Number((ctx.briefSpec as any)?.heroPrizeCount ?? 0) || null
  const majorPrizeOverlay = (ctx.briefSpec as any)?.majorPrizeOverlay ?? null
  const cashback = (ctx.briefSpec as any)?.cashback || null
  const cashbackBands = Array.isArray(cashback?.bands) ? cashback.bands : []
  const cashbackHeadline = cashback?.headline || null
  const cashbackAmount = Number(cashback?.amount ?? 0) || 0

  // Prize presence (prevents hero-prize hallucination)
  const prizePresence = derivePrizePresence(ctx.briefSpec)

  // Cashback competitiveness
  type CashCompetitiveness = NonNullable<FramingV2Meta['benchmarks']>['cashbackIsCompetitive']
  const cashbackIsCompetitive: CashCompetitiveness =
    cbBench.sample === 0
      ? 'UNKNOWN'
      : (cbBench.typicalAbs && cashbackAmount > 0)
          ? (cashbackAmount > cbBench.typicalAbs ? 'ABOVE_TYPOLOGICAL' : (cashbackAmount === cbBench.typicalAbs ? 'MEETS_TYPOLOGICAL' : 'BELOW_TYPOLOGICAL'))
          : (cbBench.typicalPct ? 'UNKNOWN' : 'UNKNOWN')

  const briefLines: string[] = []
  if (objectiveSignals.length) briefLines.push(`- Objectives: ${objectiveSignals.join(' • ')}`)
  if (audienceSignals.length) briefLines.push(`- Audience cues: ${audienceSignals.join(' • ')}`)
  if (buyerTensionSignals.length) briefLines.push(`- Buyer tensions: ${buyerTensionSignals.join(' • ')}`)
  if (purchaseTriggerSignals.length) briefLines.push(`- Purchase triggers: ${purchaseTriggerSignals.join(' • ')}`)
  if (channelSignals.length) briefLines.push(`- Channels/mandatories: ${channelSignals.join(' • ')}`)
  if (brandTruthSignals.length) briefLines.push(`- Brand truths: ${brandTruthSignals.join(' • ')}`)
  if (assetSignals.length) briefLines.push(`- Distinctive assets: ${assetSignals.join(' • ')}`)
  if (toneDoSignals.length || toneDontSignals.length) {
    const toneParts: string[] = []
    if (toneDoSignals.length) toneParts.push(`do ${toneDoSignals.join(' • ')}`)
    if (toneDontSignals.length) toneParts.push(`avoid ${toneDontSignals.join(' • ')}`)
    briefLines.push(`- Tone of voice: ${toneParts.join(' | ')}`)
  }
  if (nonNegotiableSignals.length) briefLines.push(`- Non-negotiables: ${nonNegotiableSignals.join(' • ')}`)
  if (mechanicSignals.length) briefLines.push(`- Mechanic cues: ${mechanicSignals.join(' • ')}`)
  if (prizeSignals.length) briefLines.push(`- Prize cues: ${prizeSignals.join(' • ')}`)
  if (retailerSignals.length) briefLines.push(`- Retailer focus: ${retailerSignals.join(' • ')}`)
  if (competitorSignals.length) briefLines.push(`- Brief competitors: ${competitorSignals.join(' • ')}`)
  const briefSignalsSection = briefLines.length ? ['BRIEF SIGNALS:', ...briefLines].join('\n') : ''

  const competitorNamesResearch = takeUnique((research?.competitors?.names as string[] | undefined) || [], 8)
  const retailerNamesResearch = takeUnique((research?.retailers?.names as string[] | undefined) || [], 8)
  const researchBrandLines = formatFacts(research?.brand?.facts, 'Brand insight', 5)
  const researchAudienceLines = formatFacts(research?.audience?.facts, 'Audience insight', 5)
  const researchRetailerLines = formatFacts(research?.retailers?.facts, 'Retailer insight', 5)
  const researchMarketLines = formatFacts(research?.market?.facts, 'Market insight', 5)
  const researchCompetitorFactLines = formatFacts(research?.competitors?.facts, 'Competitor insight', 5)
  const researchSignalLines = formatFacts(research?.signals?.facts, 'Signal', 4)
  const promoSummaries = getCompetitorPromos(research)
    .slice(0, 5)
    .map(p => {
      const head = truncate(String(p.headline || p.title || p.type || '').trim() || 'Promotion')
      const typeStr = p.type ? `Type: ${String(p.type).toUpperCase()}` : null
      const valStr = p.prizeValueHint ? `Value: ${p.prizeValueHint}` : null
      const cadenceStr = p.cadence ? `Cadence: ${p.cadence}` : null
      const summary = [typeStr, valStr, cadenceStr].filter(Boolean).join(' | ')
      const brandName = String(p.brand || '').trim() || 'Unknown'
      return summary ? `Promo insight: ${brandName} — ${head} (${summary})` : `Promo insight: ${brandName} — ${head}`
    })

  const benchmarkLines: string[] = []
  if (cbBench.sample) {
    const typicalDisplay = cbBench.typicalAbs ? `$${Math.round(cbBench.typicalAbs)}` : (cbBench.typicalPct ? `${cbBench.typicalPct}%` : 'n/a')
    const maxDisplay = cbBench.maxAbs ? `$${Math.round(cbBench.maxAbs)}` : (cbBench.maxPct ? `${cbBench.maxPct}%` : 'n/a')
    benchmarkLines.push(`- Cashback norms (sample ${cbBench.sample}): typical ≈ ${typicalDisplay}, max ≈ ${maxDisplay}`)
  }
  if (prizeObs.total) {
    const heroShares = prizeObs.common.map(c => `${c.count} (${Math.round(c.share * 100)}%)`).join(', ')
    benchmarkLines.push(`- Hero prize distribution (n=${prizeObs.total}): ${heroShares || 'insufficient data'}`)
  }
  if (cashbackIsCompetitive) {
    benchmarkLines.push(`- Cashback competitiveness: ${cashbackIsCompetitive}`)
  }

  const researchLines = [
    competitorNamesResearch.length ? `- Competitors observed: ${competitorNamesResearch.join(' • ')}` : '',
    retailerNamesResearch.length ? `- Retail focus: ${retailerNamesResearch.join(' • ')}` : '',
    ...researchBrandLines,
    ...researchAudienceLines,
    ...researchRetailerLines,
    ...researchMarketLines,
    ...researchCompetitorFactLines,
    ...promoSummaries,
    ...benchmarkLines,
    ...researchSignalLines,
  ].filter(Boolean)
  const researchSection = researchLines.length ? ['RESEARCH INSIGHTS:', ...researchLines].join('\n') : ''

  // IP tie-in
  const ipObj = ctx.briefSpec?.ipTieIn || null
  let ipLine = ''
  if (ipObj) {
    const headline = [ipObj.franchise, ipObj.theme].filter(Boolean)
    const detailParts = [
      ipObj.activationType ? `type: ${ipObj.activationType}` : null,
      ipObj.eventWindow ? `window: ${ipObj.eventWindow}` : null,
      ipObj.partner ? `partner: ${ipObj.partner}` : null,
    ].filter(Boolean)
    const combined = [...headline, ...detailParts]
    if (combined.length) {
      const status = ipObj.licensed ? 'licensed' : 'pending-rights'
      ipLine = `IP tie-in (${status}): ${combined.join(' — ')}`
    }
  }

  const cadence = winnersCadenceSuggestion(
    Number(ctx.briefSpec?.totalWinners ?? 0) || null,
    ctx.startDate,
    ctx.endDate
  )
  const doubles = doublePassEquivalent(Number(ctx.briefSpec?.totalWinners ?? 0) || null)

  const allowHeroSuggestion = heroSuggestionAllowed(ctx)

  const metaSpec = [
    'You are Ava + Clara (planning duo). Return ONLY JSON that conforms to this shape.',
    'No prose. No markdown. No comments.',
    // language + guardrails
    'Rules: short sentences; banned words anywhere: friction, learnings, journey, levers, unlock, gamification, omnichannel.',
    'Every stat or norm you include must have a "Source:" hint in market_facts[]. Use public sources or "Source: indicative".',
    'Keep lists tight; do not exceed caps.',
    // Category guard
    'Use only CATEGORY-RELEVANT facts (desserts/chilled desserts/puddings/custard, the brand’s segment). Ignore generic “best prize draw/competition” content.',
    // Symbolic prize classification only (no invention)
    'If the brief hints at a culturally resonant “gift”, classify it under prize_map.items with type PRIZE_SYMBOLIC; set has_symbolic_prize: true.',
    // Cashback rule
    'If the promotion is cashback/assured value, treat reward as guaranteed for every eligible purchaser. Do NOT suggest weekly draws, instant wins, ladders, or overlays unless explicitly present.',
    // Overlay rule
    'If a major prize overlay is explicitly briefed, treat it as creative theme and story device; cashback remains the primary value driver/headline.',
    // Flow rule
    'Do NOT assume any redemption or entry flow unless explicitly provided. If unclear, set TBC.',
    // Competitor rule
    'Use competitors only if named in the brief OR in RESEARCH; otherwise discuss category norms without fabricating brand names.',
    // OfferIQ rule
    'Treat OFFER_IQ as ground truth for adequacy/simplicity/certainty.',
    // Research rule (deepening)
    'Use RESEARCH to populate market_facts and to inform tensions, audience mindsets, and category_competition. Prefer BRAND→AUDIENCE→SEASONAL →RETAILERS→CATEGORY.',
    // Benchmark rule
    'Use the provided BENCHMARKS block to sharpen improvement_hypotheses and proposition_candidates. Do not fabricate numbers.',
    // Shareability rule (tickets): default to pairs
    'If the prize involves movie tickets/passes, treat the base as shareable by default (double passes). Surface family/Gold Class variants only as improvement hypotheses (not as facts).',
    // Cadence phrasing rule
    'When TOTAL_WINNERS + DATES are present, produce a simple cadence phrase (e.g., “~18 winners a day”) and include the shareable equivalent where relevant.',
    // Hero suggestion gate
    allowHeroSuggestion
      ? 'You MAY propose adding a tight hero overlay (2–3 winners) when it materially improves perceived value and fits the IP/theme. Keep breadth/cadence intact.'
      : 'Do NOT propose a hero prize or overlay; treat breadth/cadence only.',
    // IP tie-in rule
    'If an IP tie-in is present (e.g., movie launch), respect the activation type, window, partner, and notes exactly as briefed; weave it into mood/hooks without fabricating licensing claims.',
  ].join(' ')

  const briefSnap = renderBriefSnapshot(ctx) || '_none_'
  const season = seasonHint(ctx)

  const BENCHMARKS = {
    cashback: { sample: cbBench.sample, typicalAbs: cbBench.typicalAbs, maxAbs: cbBench.maxAbs, typicalPct: cbBench.typicalPct, maxPct: cbBench.maxPct },
    prizeCounts: { total: prizeObs.total, common: prizeObs.common },
    recommendedHeroCount,
    cashbackIsCompetitive
  }

  const metaUserParts = [
    identityLine(ctx),
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Position: ${ctx.brandPosition || 'unknown'}`,
    season ? `Seasonal context: ${season}` : '',
    ipLine ? ipLine : '',
    cadence ? `Cadence suggestion: ${cadence}` : '',
    doubles ? `Shareability: ${doubles}` : '',
    '',
    'Structured brief snapshot:',
    briefSnap,
    '',
  ]

  if (ipObj?.notes) {
    metaUserParts.push(`IP guardrails: ${ipObj.notes}`, '')
  }

  if (briefSignalsSection) metaUserParts.push(briefSignalsSection, '')
  if (researchSection) metaUserParts.push(researchSection, '')
  if (promotrackGuide) metaUserParts.push(`PRIVATE PROMOTRACK (bias only):\n${promotrackGuide}\n`, '')

  metaUserParts.push(
    '',
    // Authoritative flags
    isCashback ? 'Authoritative: This is a CASHBACK / assured-value promotion. Everyone who qualifies receives the stated value/items.' : '',
    assuredItems.length ? `Authoritative: Assured items: ${assuredItems.join(', ')}` : '',
    `Authoritative: Prize presence = ${prizePresence.prize_presence}; has_major_prize=${prizePresence.has_major_prize}; instant_win=${prizePresence.instant_win}.`,
    Number(ctx.briefSpec?.totalWinners ?? 0) ? `Authoritative: Total winners (brief): ${ctx.briefSpec?.totalWinners}` : '',
    entryMechanic ? `Authoritative: Entry/Redemption mechanic (from brief): ${entryMechanic}` : 'Authoritative: Entry/Redemption mechanic: TBC (do not invent).',
    majorPrizeOverlay != null ? `Authoritative: Major prize overlay: ${typeof majorPrizeOverlay === 'boolean' ? (majorPrizeOverlay ? 'YES' : 'NO') : String(majorPrizeOverlay)}` : '',
    heroPrize ? `Authoritative: Hero prize: ${heroPrize}${heroPrizeCount ? ` x${heroPrizeCount}` : ''}` : '',
    cashbackHeadline ? `Authoritative: Cashback headline: ${cashbackHeadline}` : '',
    cashbackBands.length ? `Authoritative: Cashback bands JSON: ${JSON.stringify(cashbackBands).slice(0, 1200)}` : '',
    (isCashback && majorPrizeOverlay)
      ? 'Authoritative: Interplay — Overlay provides the theme/mood; Cashback is the primary value headline and driver.'
      : '',
    '',
    // Research payload (authoritative)
    'RESEARCH (authoritative; cite when used):',
    JSON.stringify(research || { meta: { level: 'LITE', warnings: ['no external research available'] } }),
    '',
    // Benchmarks snapshot
    'BENCHMARKS:',
    JSON.stringify(BENCHMARKS),
    '',
    // OfferIQ
    `OFFER_IQ (authoritative): ${JSON.stringify(offerIQ)}`,
    '',
    // Handoff guards for later stages
    'HANDOFF:',
    JSON.stringify({
      research_provided: true,
      do_not_research: true,
      prohibitions: allowHeroSuggestion ? [] : ['NO_HERO_PRIZE_SUGGESTION']
    }),
    '',
    'Return JSON with keys exactly:',
    JSON.stringify({
      kind: 'framing.v2',
      behavioural_objective: 'string | null',
      tensions: 'string[] (≤3)',
      audience: { mindsets: [{ name: 'string', job: 'string' }] },
      category_competition: { tropes_to_avoid: ['string'], spaces_to_own: ['string'] },
      market_facts: [{ claim: 'string', sourceHint: 'Source: …' }],
      idea_core: ['string'],
      proposition_candidates: ['string'],
      hooks: ['string (2–6 words)'],
      reasons_to_believe: ['string'],
      improvement_hypotheses: ['string'],
      prize_map: {
        items: [
          { type: 'PRIZE_SYMBOLIC|PRIZE_FINANCIAL|PRIZE_EXPERIENTIAL|GWP|OTHER', label: 'string', rationale: 'string?' }
        ],
        has_symbolic_prize: 'boolean'
      },
      brand_truths: ['string'],
      distinctive_assets: { visual: ['string'], verbal: ['string'], ritual: ['string'] },
      category_codes: { lean: ['string'], break: ['string'] },
      tone_of_voice: { do: ['string'], dont: ['string'] },
      non_negotiables: ['string'],
      offer_iq: 'opaque OfferIQ payload provided above',
      benchmarks: 'copy BENCHMARKS in compact form',
      authoritative: {
        assured_value: 'boolean',
        has_major_prize: 'boolean',
        prize_presence: 'NONE|BREADTH_ONLY|MAJOR_PRESENT',
        instant_win: 'boolean'
      },
      breadth_prize: { count: 'number|null', labelHint: 'string|null' },
      handoff: { research_provided: true, do_not_research: true, prohibitions: ['string'] }
    }),
    '',
    'Caps:',
    '- tensions ≤3; market_facts ≤5; proposition_candidates ≤3; hooks ≤5; reasons_to_believe ≤4; improvement_hypotheses ≤5;',
    '- prize_map.items ≤6; brand_truths ≤5; distinctive_assets.visual|verbal|ritual ≤6 each; category_codes.lean|break ≤6 each; tone_of_voice.do|dont ≤5 each; non_negotiables ≤6.',
  )

  const metaUser = metaUserParts.filter(Boolean).join('\n')

  const metaJson = await chat({
    model,
    system: metaSpec,
    messages: [{ role: 'user', content: metaUser }],
    temperature: 0.28,
    top_p: 0.95,
    json: true,
    max_output_tokens: Number(process.env.FRAME_META_TOKENS || 1800),
    meta: { scope: 'framing.meta', campaignId: ctx.id },
  })

  let metaParsed: any
  try { metaParsed = JSON.parse(metaJson) } catch { metaParsed = null }
  const meta = normaliseMeta(metaParsed || {})
  // Enforce/augment authoritative & handoff on server side (don’t trust LLM)
  meta.offer_iq = offerIQ
  if (research) meta.research = research
  meta.benchmarks = {
    cashback: { sample: cbBench.sample, typicalAbs: cbBench.typicalAbs, maxAbs: cbBench.maxAbs, typicalPct: cbBench.typicalPct, maxPct: cbBench.maxPct, sources: cbBench.sources },
    prizeCountsObserved: { total: prizeObs.total, common: prizeObs.common },
    recommendedHeroCount,
    cashbackIsCompetitive
  }
  meta.authoritative = {
    assured_value: !!isCashback || !!(ctx.briefSpec as any)?.assuredValue,
    has_major_prize: prizePresence.has_major_prize,
    prize_presence: prizePresence.prize_presence,
    instant_win: prizePresence.instant_win
  }
  meta.handoff = {
    research_provided: true,
    do_not_research: true,
    prohibitions: allowHeroSuggestion ? [] : ['NO_HERO_PRIZE_SUGGESTION']
  }

  if (prizePresence.prize_presence === 'BREADTH_ONLY') {
    // keep breadth meta; use cadence as a helpful label hint when available
    meta.breadth_prize = { count: prizePresence.breadth_count, labelHint: cadence || null }

    // smart hypotheses: default to shareable tickets; allow theme-aligned hero suggestion (tight) if permitted
    const moviey = isMovieTicketPrize(ctx.briefSpec)
    const inject: string[] = []
    if (moviey) {
      inject.push('Default to a double pass so no one goes alone; optionally test Family or Gold Class tiers.')
    }
    if (allowHeroSuggestion && !prizePresence.has_major_prize) {
      inject.push(`Test a tight hero overlay (${recommendedHeroCount} winners) aligned to the IP theme; keep breadth and cadence visible.`)
    }

    // always include the pairing hypothesis; then add the inject list; cap to 5
    meta.improvement_hypotheses = cap<string>([
      'If reward is single-admit (e.g., one ticket), test pairing (two passes) to enable shared experience without inflating perceived cost.',
      ...inject,
      ...meta.improvement_hypotheses
    ], 5)
  }

  // Top up + gate market facts by category
  pushResearchFacts(meta.market_facts, research, ctx)
  meta.market_facts = filterFactsByCategory(meta.market_facts, ctx)

  // Inject benchmark summaries into market_facts (respecting ≤5)
  const roomLeft = Math.max(0, 5 - meta.market_facts.length)
  const benchFacts: Array<{ claim: string; sourceHint: string }> = []
  if (roomLeft > 0 && cbBench.sample > 0) {
    let line = ''
    if (cbBench.typicalAbs) {
      line = `Typical cashback headline in current market ≈ $${Math.round(cbBench.typicalAbs)}; max ≈ ${cbBench.maxAbs ? `$${Math.round(cbBench.maxAbs)}` : (cbBench.maxPct ? `${cbBench.maxPct}%` : 'n/a')} (sample ${cbBench.sample}).`
    } else if (cbBench.typicalPct) {
      line = `Typical cashback headline in current market ≈ ${cbBench.typicalPct}% (sample ${cbBench.sample}).`
    }
    if (line) benchFacts.push({ claim: line, sourceHint: 'Source: composite from live promo listings (Serper snapshot)' })
  }
  if (roomLeft - benchFacts.length > 0 && prizeObs.total > 0 && prizeObs.common.length > 0) {
    const spread = prizeObs.common.map(c => `${c.count} (${Math.round(c.share*100)}%)`).join(', ')
    benchFacts.push({
      claim: `Observed hero-prize counts in current draws: ${spread}. Recommended hero count: ${recommendedHeroCount}.`,
      sourceHint: 'Source: composite from live prize listings (Serper snapshot)'
    })
  }
  meta.market_facts.push(...(benchFacts.slice(0, Math.max(0, 5 - meta.market_facts.length))))

  // Deterministic overlay injection
  if (majorPrizeOverlay === true || (typeof majorPrizeOverlay === 'string' && (majorPrizeOverlay || '').trim())) {
    const label =
      (typeof majorPrizeOverlay === 'string' && majorPrizeOverlay.trim())
        ? String(majorPrizeOverlay).trim()
        : (heroPrize ? String(heroPrize) : null)

    if (label) {
      const already = (meta.prize_map.items || []).some(
        (i: any) => String(i?.label || '').toLowerCase() === label.toLowerCase()
      )
      if (!already) {
        const t = classifyPrizeType(label)
        meta.prize_map.items = cap<any>(
          [{ type: t, label, rationale: 'Explicit major-prize overlay from brief.' }, ...(meta.prize_map.items || [])],
          6
        )
        meta.prize_map.has_symbolic_prize = Boolean(
          meta.prize_map.items?.some((i: any) => i?.type === 'PRIZE_SYMBOLIC')
        )
      }
    }
  }

  // cashback competitiveness specific hypotheses
  try {
    const repAmount = Number(offerIQ?.diagnostics?.valueAmount || cashbackAmount || 0)
    if (isCashback && cbBench.sample > 0 && (cbBench.typicalAbs || cbBench.typicalPct)) {
      if (cbBench.typicalAbs && repAmount > 0 && repAmount < cbBench.typicalAbs) {
        meta.improvement_hypotheses = cap<string>([
          `Lift assured value towards market typical (~$${Math.round(cbBench.typicalAbs)}), or pivot to a premium GWP with explicit RRP.`,
          ...meta.improvement_hypotheses
        ], 5)
      } else if (cbBench.typicalAbs && repAmount > cbBench.typicalAbs) {
        meta.improvement_hypotheses = cap<string>([
          `Hold value above market typical (~$${Math.round(cbBench.typicalAbs)}); emphasise certainty and speed of redemption.`,
          ...meta.improvement_hypotheses
        ], 5)
      }
    }
  } catch {}

  // ----- Prose composer -----
  const proseSys = [
    'You are Ava + Clara. Produce decisive, commercial framing.',
    'Tone: senior, crisp, Australian plain-speak. Short sentences.',
    'Banned words: friction, learnings, journey, levers, unlock, gamification, omnichannel.',
    'Use ranges, not fake precision.',
    'If a sentence contains a stat or market norm, include a short Source: tag inline. Cite RESEARCH where used.',
    'Return plain text. No markdown hashes. Use headings exactly as instructed.',
    'Each heading must be followed by flowing prose paragraphs. Do not use bullet characters, hyphens, numbering, arrows, or emoji anywhere.',
    'Spell out words; avoid abbreviations or shorthand (write “because”, not “b/c”).',
    'Write as if you are a seasoned planner crafting a narrative memo—elegant, articulate sentences only.',
    'Length target: 550–900 words.',
    // Guardrails
    'If promotion is cashback/assured value: value is guaranteed; do not add weekly/instant-win overlays unless briefed.',
    'If a major prize overlay is briefed, let it set theme/mood; cashback is the primary value driver/headline.',
    'Do not assume entry flows; if unclear, write “Entry: TBC with retailer ops.”',
    'Competitors must come from the brief or RESEARCH; otherwise discuss category norms.',
    'Keep all facts on-category (desserts/chilled desserts/puddings/custard). Ignore generic competition content.',
    // Hero suggestion note (creative)
    allowHeroSuggestion
      ? 'You may suggest a tight hero overlay if it will meaningfully lift response; keep breadth visible.'
      : 'Do not suggest a hero overlay.',
    // Deepening directives
    'MANDATORY: In "Where the Demand Is", anchor market/seasonal context with 1–2 sourced facts.',
    'MANDATORY: In "Who It’s For & What Stops Them", name 2–3 audience mindsets with a job-to-be-done line each; include one sourced barrier.',
    'MANDATORY: In "Competitor Map", contrast approaches visible in RESEARCH.',
    'MANDATORY: In "Brand Lens", compact brand capsule using RESEARCH.brand (3–5 sentences).',
    'MANDATORY: Hooks are 2–6 words; they may nod to overlay/IP mood but not replace the value.',
    'If cashback is banded, say it is banded; do not invent thresholds.',
    'Use BENCHMARKS to position value vs typical.',
    'When discussing movie passes, write them as double passes by default; treat Family/Gold Class as variants in Hypotheses.',
    cadence ? `Use cadence line: "${cadence}" where helpful.` : ''
  ].join(' ')

  const proseParts = [
    identityLine(ctx),
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Position: ${ctx.brandPosition || 'unknown'}`,
    season ? `Seasonal context: ${season}` : '',
    ipLine ? ipLine : '',
    cadence ? `Cadence: ${cadence}` : '',
    doubles ? `Shareability: ${doubles}` : '',
    '',
    'AUTHORITATIVE:',
    JSON.stringify({
      assured_value: !!isCashback || !!(ctx.briefSpec as any)?.assuredValue,
      prize_presence: prizePresence.prize_presence,
      has_major_prize: prizePresence.has_major_prize,
      instant_win: prizePresence.instant_win,
      entry_mechanic: entryMechanic || 'TBC',
      total_winners: ctx.briefSpec?.totalWinners ?? null
    }),
    '',
    'META (to inform, not to echo):',
    JSON.stringify({
      prize_map: meta.prize_map,
      brand_truths: meta.brand_truths,
      distinctive_assets: meta.distinctive_assets,
      category_codes: meta.category_codes,
      tone_of_voice: meta.tone_of_voice,
      non_negotiables: meta.non_negotiables,
    }),
  ]

  if (briefSignalsSection) proseParts.push('', briefSignalsSection)
  if (researchSection) proseParts.push('', researchSection)

  proseParts.push(
    '',
    'RESEARCH (cite inline as "Source: …" when used):',
    JSON.stringify(research || {}),
    '',
    'BENCHMARKS:',
    JSON.stringify({
      ...BENCHMARKS,
      cashback_typical_display: cbBench.typicalAbs ? `$${Math.round(cbBench.typicalAbs)}` : (cbBench.typicalPct ? `${cbBench.typicalPct}%` : 'n/a')
    }),
    '',
    'Write the framing with the following headings EXACTLY and in THIS order:',
    'Where the Demand Is',
    'Who It’s For & What Stops Them',
    'Competitor Map',
    'Brand Lens (truth, codes to lean/break)',
    'The Idea As It Stands',
    'Proposition Candidates',
    'Hooks (2–6 words)',
    'What We’d Lean On',
    'Hypotheses for Evaluation',
    '',
    entryMechanic ? `Entry/Redemption (from brief): ${entryMechanic}` : 'Entry/Redemption: TBC (do not invent).',
    isCashback ? 'Reward shape: assured value/cashback — guaranteed for qualifiers; do not propose draws/instant wins.' : '',
    `OFFER_IQ (authoritative): verdict=${offerIQ.verdict}; score=${offerIQ.score}; hard_flags=${offerIQ.hardFlags.join(', ') || 'none'}.`,
    majorPrizeOverlay != null ? `Overlay: Major prize overlay is briefed (${typeof majorPrizeOverlay === 'boolean' ? (majorPrizeOverlay ? 'YES' : 'NO') : String(majorPrizeOverlay)}).` : '',
    (isCashback && majorPrizeOverlay) ? 'Interplay: overlay/IP sets scene; cashback is the value driver/headline.' : '',
    cashbackHeadline ? `Cashback headline: ${cashbackHeadline}` : '',
    cashbackBands.length ? 'Cashback is banded by product value (do not invent thresholds in prose).' : '',
  )

  const proseUser = proseParts.filter(Boolean).join('\n')

  const content = await chat({
    model,
    system: proseSys,
    messages: [{ role: 'user', content: proseUser }],
    temperature: 0.34,
    top_p: 0.95,
    max_output_tokens: Number(process.env.FRAME_PROSE_TOKENS || 2200),
    meta: { scope: 'framing.prose', campaignId: ctx.id },
  })

  return { content: String(content || '').trim(), meta }
}
