// apps/backend/src/lib/orchestrator/evaluate.ts
import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { EVAL_DIAGNOSIS_JSON_SPEC } from '../bible.js'
import { analyzeRoute } from '../heuristics.js'
import type { Scorecard } from '../heuristics.js'
import { buildEvaluationGuide } from '../promotrack.js'
import { prisma } from '../../db/prisma.js'
import { readFileSync } from 'fs'
import { createHash } from 'crypto'
import { scoreOffer, type OfferIQ } from '../offeriq.js'
import type { ResearchPack } from '../research.js' // ⬅️ type-only import, no fetching here
import { applyResearchOverrides, type ResearchOverrides } from '../war-room-research.js'
import { resolveModel } from '../models.js'
import { loadCampaignRules, type CampaignRules } from '../campaign-rules.js'
import { polishText } from '../polish.js'
import { buildCampaignStyleSpec, pickStructure, enforceLexicon, stripAvoided } from '../style-spec.js'
import { getMechanicRule } from '../mechanic-rules.js'
import { buildFeltWinnabilityProfile } from '../winsense.js'

/* -------------------------------------------------------------------------- */
/*                                   Types                                    */
/* -------------------------------------------------------------------------- */

type Traffic = 'GREEN' | 'AMBER' | 'RED' | 'NA'
type RuleFlex = 'KEEP' | 'BEND' | 'BREAK'

type BoardCell = { status: Traffic; why: string; fix?: string }
type Scoreboard = {
  objectiveFit: BoardCell
  hookStrength: BoardCell
  mechanicFit: BoardCell
  frequencyPotential: BoardCell
  friction: BoardCell
  rewardShape: BoardCell
  retailerReadiness: BoardCell
  complianceRisk: BoardCell
  fulfilment: BoardCell
  kpiRealism: BoardCell
  decision?: 'GO' | 'GO WITH CONDITIONS' | 'NO-GO'
  conditions?: string
}

type ScoreboardKey = Exclude<keyof Scoreboard, 'decision' | 'conditions'>

type TradeRow = {
  barrier: string
  incentive: string
  how_to_run: string
  guardrail?: string
}

async function fetchLatestHarness(campaignId: string) {
  const row = await prisma.output.findFirst({
    where: { campaignId, type: 'ideationHarness' },
    orderBy: { createdAt: 'desc' },
  })
  if (!row?.content) return null
  try {
    return JSON.parse(row.content)
  } catch {
    return null
  }
}

const INSIGHT_BUCKETS: Array<keyof NonNullable<ResearchPack['insights']>> = [
  'brand',
  'audience',
  'retailers',
  'market',
  'signals',
  'competitors',
]

const DOSSIER_ORDER: Array<[keyof NonNullable<ResearchPack['dossier']>, string]> = [
  ['brandTruths', 'Brand truth'],
  ['shopperTensions', 'Shopper tension'],
  ['retailerReality', 'Retailer reality'],
  ['competitorMoves', 'Competitor move'],
  ['categorySignals', 'Category signal'],
  ['benchmarks', 'Benchmark'],
]

function collectResearchInsightLines(research: ResearchPack | null, limit = 6): string[] {
  const lines: string[] = []
  const dossier = research?.dossier
  if (dossier) {
    for (const [key, label] of DOSSIER_ORDER) {
      const entries = (dossier as any)[key] || []
      for (const entry of entries) {
        const text = (entry?.text || '').trim()
        if (!text) continue
        const source = (entry?.source || '').trim()
        lines.push(`${label}: ${text}${source ? ` (${source})` : ''}`)
        if (lines.length >= limit) return lines
      }
    }
  }
  if (!research?.insights) return lines
  for (const bucket of INSIGHT_BUCKETS) {
    const entries = research.insights?.[bucket] || []
    for (const entry of entries) {
      const text = (entry?.text || '').trim()
      if (!text) continue
      const display = entry?.source ? `${text} (${entry.source})` : text
      lines.push(display)
      if (lines.length >= limit) return lines
    }
  }
  return lines
}

type EvalDiagnosis = {
  stance: string
  brand_position: string
  creative_hook_current: string | null
  creative_hook_better: string | null
  hook_why_change?: string | null
  hook_alternatives?: string[]
  mechanic: string | null
  retailers: string[]
  prizes: {
    hero: string | null
    hero_count: number | null
    runner_ups: string[]
  }
  friction: string | null
  banned_mechanics: string[]
  calendar_theme: string | null
  what_worked: string[]
  what_didnt: string[]
  risks: string[]
  fixes: string[]
  bold_variants: string[]
  promotrack_applied: string[]
  judgement: { verdict: string; because: string }
  asks?: string[]
  assumptions?: string[]

  // v4.1+
  symbolism?: string[]
  proposition_hint?: string | null
  trade_priority?: 'HIGH' | 'LOW'
  trade_table?: TradeRow[]

  // v4.2 (past-campaign reflection)
  when_reflective?: boolean
  run_again_moves?: string[]
}

/* ---------- Framing meta (extended to carry authoritative/handoff/bench) --- */

type PrizePresence = 'NONE' | 'BREADTH_ONLY' | 'MAJOR_PRESENT'
type FramingBenchmarks = {
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
}

type FramingV2Meta = {
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
    items: Array<{ type: 'PRIZE_SYMBOLIC' | 'PRIZE_FINANCIAL' | 'PRIZE_EXPERIENTIAL' | 'GWP' | 'OTHER'; label: string; rationale?: string }>
    has_symbolic_prize: boolean
  }
  // extensions (optional)
  offer_iq?: OfferIQ
  research?: ResearchPack
  benchmarks?: FramingBenchmarks
  authoritative?: {
    assured_value: boolean
    has_major_prize: boolean
    prize_presence: PrizePresence
    instant_win: boolean
  }
  breadth_prize?: { count: number | null; labelHint?: string | null }
  handoff?: { research_provided: boolean; do_not_research: boolean; prohibitions?: string[] }
} | null

/* -------------------------------------------------------------------------- */
/*                             Version / Hash marks                           */
/* -------------------------------------------------------------------------- */

const CODE_VERSION = process.env.TRUDY_CODE_VERSION || 'v4.7-eval-framing-only-research'

function fileHash(path: string) {
  try {
    return createHash('sha1').update(readFileSync(path, 'utf8')).digest('hex').slice(0, 10)
  } catch {
    return 'nofile'
  }
}
let ORCH_HASH = 'nofile'
let COMP_HASH = 'nofile'
try {
  ORCH_HASH = fileHash(new URL(import.meta.url).pathname)
  COMP_HASH = fileHash(new URL('../copydesk.ts', import.meta.url).pathname)
} catch {}

function harmoniseMechanicLanguage(text: string, entryMechanic: string): string {
  const mechanic = (entryMechanic || '').toLowerCase()
  if (!mechanic) return text
  let out = text
  out = out.replace(/Instant Movie Magic/gi, 'Instant Movie Night for Two')
  const mentionsQRinBrief = mechanic.includes('qr')
  if (!mentionsQRinBrief) {
    out = out.replace(/QR\s*code/gi, 'receipt upload portal')
      .replace(/QR\b/gi, 'receipt upload')
      .replace(/scan the receipt upload/gi, 'upload the receipt')
      .replace(/scan\b/gi, (match) => (mechanic.includes('upload') ? 'upload' : match))
  }
  if (mechanic.includes('upload')) {
    out = out.replace(/scan (?:and )?(?:see|check)/gi, 'upload and see')
      .replace(/scan the receipt/gi, 'upload the receipt')
  }
  return out
}

/* -------------------------------------------------------------------------- */
/*                               Small utilities                              */
/* -------------------------------------------------------------------------- */

function includesAny(hay: string | string[] | undefined, needles: string[]): boolean {
  if (!hay) return false
  const pool = Array.isArray(hay) ? hay.join(' ').toLowerCase() : String(hay).toLowerCase()
  return needles.some((n) => pool.includes(n.toLowerCase()))
}

function isExperientialString(s: string): boolean {
  const t = (s || '').toLowerCase()
  return includesAny(t, ['trip','experience','tickets','tour','stay','holiday','travel','flight','hotel','the ghan','rail','cruise','festival','concert','event'])
}

function decideFromVerdict(v?: string): 'GO' | 'GO WITH CONDITIONS' | 'NO-GO' | undefined {
  if (!v) return undefined
  const x = v.toUpperCase().replace(/\s+/g, '_')
  if (x.includes('NO') && x.includes('GO')) return 'NO-GO'
  if (x.includes('CONDITION')) return 'GO WITH CONDITIONS'
  if (x === 'GO') return 'GO'
  if (x.includes('REVISE') || x.includes('AMEND') || x.includes('TWEAK')) return 'GO WITH CONDITIONS'
  return undefined
}

type GateMeta = {
  decision: 'GO' | 'GO WITH CONDITIONS' | 'NO-GO'
  reds: Array<[keyof Scoreboard, BoardCell]>
  ambers: Array<[keyof Scoreboard, BoardCell]>
  criticalSet: Set<keyof Scoreboard>
  hasCriticalRed: boolean
  dealbreakers: string[]
}

function gateScoreboard(scoreboard: Scoreboard, offerIQ: OfferIQ | null): GateMeta {
  const reds: Array<[keyof Scoreboard, BoardCell]> = []
  const ambers: Array<[keyof Scoreboard, BoardCell]> = []
  const keys = [
    'objectiveFit',
    'hookStrength',
    'mechanicFit',
    'frequencyPotential',
    'friction',
    'rewardShape',
    'retailerReadiness',
    'complianceRisk',
    'fulfilment',
    'kpiRealism',
  ] as Array<keyof Scoreboard>
  for (const k of keys) {
    const cell = (scoreboard as any)[k] as BoardCell | undefined
    if (!cell) continue
    if (cell.status === 'RED') reds.push([k, cell])
    else if (cell.status === 'AMBER') ambers.push([k, cell])
  }

  const critical = new Set<keyof Scoreboard>([
    'rewardShape',
    'mechanicFit',
    'retailerReadiness',
    'complianceRisk',
    'objectiveFit',
    'friction',
  ])
  const hasCriticalRed = reds.some(([k]) => critical.has(k))

  let decision: 'GO' | 'GO WITH CONDITIONS' | 'NO-GO' = 'GO'
  if (hasCriticalRed) decision = 'NO-GO'
  else if (reds.length > 0) decision = 'GO WITH CONDITIONS'
  else if (ambers.length > 0) decision = 'GO WITH CONDITIONS'

  const offerVerdict = decideFromVerdict(offerIQ?.verdict)
  const order = { 'NO-GO': 3, 'GO WITH CONDITIONS': 2, 'GO': 1 } as const
  if (offerVerdict) {
    decision = order[offerVerdict] >= order[decision] ? offerVerdict : decision
  }

  const dealbreakers = hasCriticalRed
    ? reds.filter(([k]) => critical.has(k)).map(([, c]) => c.why).slice(0, 5)
    : []

  return { decision, reds, ambers, criticalSet: critical, hasCriticalRed, dealbreakers }
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
    .replace(/\bvalue\s*seekers?\b/gi, 'shoppers')
    .replace(/\bexperience\s*enthusiasts?\b/gi, 'shoppers')
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

function isPastCampaign(ctx: CampaignContext): boolean {
  const end = ctx.endDate ? new Date(ctx.endDate) : null
  if (!end) return false
  const now = new Date()
  return end.getTime() < now.getTime() - 24 * 60 * 60 * 1000
}

function safe(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(safe).filter(Boolean).join(', ')
  try { return JSON.stringify(v) } catch { return String(v) }
}

async function getLatestTextOutputMulti(campaignId: string, types: string[]) {
  const row = await prisma.output.findFirst({
    where: { campaignId, type: { in: types } },
    orderBy: { createdAt: 'desc' },
    select: { content: true, type: true, createdAt: true }
  })
  return row?.content || ''
}

/* -------------------------------------------------------------------------- */
/*                          Trade gate: HIGH vs LOW                           */
/* -------------------------------------------------------------------------- */

function inferTradePriority(ctx: CampaignContext): 'HIGH' | 'LOW' {
  const b = ctx.briefSpec || {}

  const hasRetailerList = Array.isArray(b.retailers) && b.retailers.length > 0
  const hasTradeIncentiveFlag = !!b.tradeIncentive

  const channel = String((b as any).channel || '').toUpperCase()
  const requiresStaffAction = Boolean((b as any).requiresStaffAction)
  const displayDependency = String((b as any).displayDependency || '').toUpperCase()
  const ranging = String((b as any).ranging || '').toUpperCase()
  const windowPressure = String((b as any).windowPressure || '').toUpperCase()

  const onPremise = includesAny(channel, ['ON_PREMISE', 'PUB', 'VENUE'])
  const independentOrBottleshop = includesAny(channel, ['INDEPENDENT', 'BOTTLESHOP', 'LIQUOR'])
  const groceryMass = includesAny(channel, ['GROCERY', 'SUPERMARKET'])

  const high =
    onPremise ||
    independentOrBottleshop ||
    requiresStaffAction ||
    displayDependency === 'CRITICAL' ||
    ranging === 'PROMO' ||
    windowPressure === 'HIGH' ||
    (hasRetailerList && !groceryMass) ||
    hasTradeIncentiveFlag

  return high ? 'HIGH' : 'LOW'
}

/* -------------------------------------------------------------------------- */
/*                       Research-driven benchmarking                         */
/* -------------------------------------------------------------------------- */

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a,b) => a-b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid-1] + s[mid]) / 2
}

function quantiles(nums: number[]) {
  if (!nums.length) return { p25: 0, p75: 0 }
  const s = [...nums].sort((a,b)=>a-b)
  const q = (p: number) => {
    const i = (s.length - 1) * p
    const lo = Math.floor(i), hi = Math.ceil(i)
    if (lo === hi) return s[lo]
    return s[lo] + (s[hi] - s[lo]) * (i - lo)
  }
  return { p25: q(0.25), p75: q(0.75) }
}

function parseHeroCountFromTitle(s: string): number | null {
  const t = (s || '').toLowerCase()
  const m1 = /win\s+(?:one|1)\s+of\s+([0-9]+)/i.exec(t)
  if (m1) return Number(m1[1]) || 1
  const m2 = /([0-9]+)\s+(?:x\s+)?(?:major\s+)?prizes?/i.exec(t)
  if (m2) return Number(m2[1]) || null
  const m3 = /1\s+of\s+([0-9]+)/i.exec(t)
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

function buildCashbackBenchmark(research?: ResearchPack | null) {
  const items = (research?.competitors?.promos || []).filter(p => p.type === 'CASHBACK')
  const allAmounts: number[] = []
  const allPercents: number[] = []
  for (const p of items) {
    const { amounts, percents } = parseAmountAndPercent(p.prizeValueHint || '', p.headline || '', p.title || '')
    allAmounts.push(...amounts)
    allPercents.push(...percents)
  }
  const typicalAbs = median(allAmounts)
  const maxAbs = allAmounts.length ? Math.max(...allAmounts) : 0
  const typicalPct = median(allPercents)
  const maxPct = allPercents.length ? Math.max(...allPercents) : 0
  const { p25, p75 } = quantiles(allAmounts)
  const sources = items.slice(0,6).map(p => `${p.title || p.headline || 'cashback'} — ${p.url}`)
  return {
    sample: items.length,
    typicalAbs: typicalAbs || null,
    maxAbs: maxAbs || null,
    typicalPct: typicalPct || null,
    maxPct: maxPct || null,
    p25: allAmounts.length ? p25 : null,
    p75: allAmounts.length ? p75 : null,
    sources
  }
}

function buildPrizeCountObservation(research?: ResearchPack | null) {
  const items = (research?.competitors?.promos || []).filter(p => p.type === 'PRIZE')
  const counts: number[] = []
  for (const it of items) {
    const n = parseHeroCountFromTitle(it.title || it.headline || '')
    if (n && n > 0 && n < 200) counts.push(n)
  }
  const total = counts.length
  const byFreq: Record<number, number> = {}
  for (const n of counts) byFreq[n] = (byFreq[n] || 0) + 1
  const common = Object.entries(byFreq)
    .sort((a,b) => b[1]-a[1])
    .slice(0,3)
    .map(([k,v]) => ({count: Number(k), freq: v, share: total ? v/total : 0}))
  return { total, common }
}

/* -------------------------------------------------------------------------- */
/*                         Scoreboard: pragmatic v4.6                          */
/* -------------------------------------------------------------------------- */

function buildScoreboard(
  ctx: CampaignContext,
  dx: EvalDiagnosis,
  research: ResearchPack | null,
  offerIQ: OfferIQ,
  guards: { forbidHeroPrize?: boolean; breadthOnly?: boolean; breadthCount?: number | null } | undefined,
  rules: CampaignRules
): Scoreboard {
  const spec: any = ctx.briefSpec || {}

  const hook = dx?.creative_hook_current ?? spec?.hook ?? ''
  const betterHook = dx?.creative_hook_better ?? null
  const mech = dx?.mechanic ?? spec?.mechanicOneLiner ?? ''
  const type = String(spec?.typeOfPromotion || '').toUpperCase()

  const retailers: string[] =
    Array.isArray(dx?.retailers) ? dx.retailers :
    Array.isArray(spec?.retailers) ? (spec!.retailers as string[]) : []

  const market = (ctx.market ?? 'AU').toUpperCase()
  const category = (ctx.category ?? '').toLowerCase()
  const frictionBudget = String((spec as any)?.frictionBudget ?? dx?.friction ?? '').toLowerCase()

  const prizes = dx?.prizes ?? {}
  const heroPrize = prizes?.hero ?? spec?.heroPrize ?? ''
  const heroCount = Number(prizes?.hero_count ?? spec?.heroPrizeCount ?? 0) || 0
  const totalWinnerCount = rules.prize.totalWinners
  const breadthStrong = rules.heuristics.breadthStrong
  const breadthSolid = rules.heuristics.breadthSolid
  const shareableReward = rules.prize.shareableReward
  const shareableAlt = rules.prize.shareableAlternateWinnerCount
  const ticketPool = rules.prize.ticketPool

  const isExperientialHero = isExperientialString([heroPrize, hook, mech, ctx.title].filter(Boolean).join(' '))

  // Assured value detection
  const gwp = spec?.gwp || null
  const cashback = spec?.cashback || null
  const assuredItemsList = Array.isArray(spec?.assuredItems)
    ? spec.assuredItems.map((item: any) => String(item || '').trim()).filter(Boolean)
    : (typeof spec?.assuredItems === 'string'
        ? String(spec.assuredItems).split(/[,•\n]+/).map((item) => item.trim()).filter(Boolean)
        : [])
  const isGWP = type === 'GWP' || !!gwp
  const isCashback = type === 'CASHBACK' || !!cashback
  const assuredViaCashback = !!isCashback && !!cashback
  const assuredViaGWP = !!isGWP && !!gwp && (gwp.cap === 'UNLIMITED' || gwp.cap == null)
  const assuredViaFlag = Boolean(spec?.assuredValue || assuredItemsList.length > 0)
  const isAssuredValue = assuredViaCashback || assuredViaGWP || assuredViaFlag

  // Research-based benchmark (cashback)
  const cbBench = buildCashbackBenchmark(research)
  const repAmount = Number(offerIQ?.diagnostics?.valueAmount || 0)

  const breadthOnly = !!guards?.breadthOnly
  const forbidHero = !!guards?.forbidHeroPrize
  const breadthCount = guards?.breadthCount ?? null
  const effectiveBreadthCount = breadthCount ?? totalWinnerCount
  const shareableText = (!isAssuredValue && shareableReward)
    ? (totalWinnerCount != null && ticketPool != null
        ? `Shareable reward already live — ${totalWinnerCount} double passes (${ticketPool} tickets).`
        : 'Shareable reward already live — keep celebrating two-seat value.')
    : (!isAssuredValue && shareableAlt != null && ticketPool != null
        ? `If we pivot to double passes, keep the ${ticketPool} ticket pool while winners halve to ~${shareableAlt}.`
        : '')

  const status: Record<ScoreboardKey, Traffic> = {
    objectiveFit: 'AMBER',
    hookStrength: (hook || betterHook) ? 'AMBER' : 'RED',
    mechanicFit: mech ? 'GREEN' : 'AMBER',
    frequencyPotential:
      includesAny(type, ['STAMP', 'COLLECT', 'TIER', 'LOYALTY']) ? 'GREEN' : 'AMBER',
    friction:
      isAssuredValue && includesAny(frictionBudget, ['receipt','proof','multi']) ? 'AMBER' :
      includesAny(frictionBudget, ['none','low','1-step']) ? 'GREEN' :
      includesAny(frictionBudget, ['high','receipt','proof','multi']) ? 'RED' : 'AMBER',
    rewardShape: (() => {
      if (isAssuredValue) return 'GREEN'
      if (!heroPrize) {
        if (breadthStrong) return 'GREEN'
        if (breadthSolid) return 'AMBER'
        return 'RED'
      }
      if (breadthOnly) {
        if (breadthStrong) return 'GREEN'
        if (breadthSolid) return 'AMBER'
        return 'AMBER'
      }
      return heroCount >= 50 || breadthStrong ? 'GREEN' : 'AMBER'
    })(),
    retailerReadiness: retailers.length ? 'AMBER' : 'RED',
    complianceRisk:
      (includesAny(category, ['alcohol','beer','wine','spirits','liquor'])) && market === 'AU'
        ? 'AMBER'
        : 'GREEN',
    fulfilment: includesAny(heroPrize, ['trip','travel','flight','holiday']) ? 'AMBER' : 'GREEN',
    kpiRealism: 'AMBER',
  }

  const retailersLine = retailers.length ? ` (${retailers.join(', ')})` : ''

  let compPos = ''
  if (isAssuredValue && cbBench.sample && repAmount > 0) {
    if (cbBench.typicalAbs && repAmount < cbBench.typicalAbs) compPos = `Sits below typical cashback in market (~$${Math.round(cbBench.typicalAbs)}).`
    else if (cbBench.typicalAbs && repAmount > cbBench.typicalAbs) compPos = `Beats typical cashback in market (~$${Math.round(cbBench.typicalAbs)}).`
    else if (cbBench.typicalAbs) compPos = `In line with typical cashback in market (~$${Math.round(cbBench.typicalAbs)}).`
  }

  const assuredDescriptor = (() => {
    if (!isAssuredValue) return ''
    if (assuredViaCashback) {
      return ['Guaranteed cashback for qualifiers — communicates certainty and fairness.', compPos].filter(Boolean).join(' ')
    }
    if (assuredViaGWP) {
      return 'Guaranteed gift-with-purchase (no artificial scarcity stated).'
    }
    if (assuredViaFlag) {
      const sample = assuredItemsList.slice(0, 3).join(', ')
      return sample ? `Guaranteed reward for every entrant — ${sample}.` : 'Guaranteed reward for every entrant (no artificial scarcity).'
    }
    return 'Guaranteed reward with no artificial scarcity.'
  })()

  const why: Record<keyof Omit<Scoreboard, 'decision' | 'conditions'>, string> = {
    objectiveFit: 'Objective not crisply named or spread across too many aims.',
    hookStrength: hook || betterHook
      ? `Hook exists${hook ? ` (“${hook}”)` : ''} but needs tightening and brand-locking${betterHook ? `; a sharper variant is proposed (“${betterHook}”)` : ''}.`
      : 'No short, premium line for pack/POS.',
    mechanicFit: mech ? `Mechanic defined: ${mech}.` : 'Mechanic not stated in one line.',
    frequencyPotential:
      includesAny(type, ['STAMP','COLLECT','TIER','LOYALTY'])
        ? 'Has a natural reason to come back.'
        : 'Repeat rhythm not explicit for this format.',
    friction:
      status.friction === 'RED'
      ? `Entry is genuinely onerous${includesAny(frictionBudget, ['receipt','proof','multi']) ? ' (mail-in or multi-proof at first step)' : ''}. This will suppress trial.`
      : 'Admin is acceptable; no action required.',
    rewardShape:
      isAssuredValue
        ? assuredDescriptor || 'Guaranteed reward with no artificial scarcity.'
        : (!heroPrize
            ? (breadthStrong
                ? [`Breadth-led reward with ~${effectiveBreadthCount ?? totalWinnerCount ?? 'n/a'} winners keeps odds credible.`, shareableText].filter(Boolean).join(' ')
                : breadthSolid
                  ? [`Breadth-led reward with ~${effectiveBreadthCount ?? totalWinnerCount ?? 'n/a'} winners is serviceable; make cadence and win proof explicit.`, shareableText].filter(Boolean).join(' ')
                  : ['Breadth-led reward feels thin — publish total winners and prove daily wins.', shareableText].filter(Boolean).join(' '))
            : (isExperientialHero
                ? [`Experiential hero carries emotion (${heroPrize}${heroCount ? ` x${heroCount}` : ''})${breadthStrong ? ` with ${effectiveBreadthCount ?? totalWinnerCount ?? 'n/a'} instants as proof of fairness.` : '.'}`, shareableText].filter(Boolean).join(' ')
                : [`Hero prize: ${heroPrize}${heroCount ? ` x${heroCount}` : ''}. Pair it with visible breadth${effectiveBreadthCount ? ` (~${effectiveBreadthCount} instants)` : ''} to keep odds believable.`, shareableText].filter(Boolean).join(' '))),
    retailerReadiness: retailers.length
      ? `Retailers named${retailersLine}. Keep staff workload near zero.`
      : 'Ranging and POS not confirmed yet.',
    complianceRisk: status.complianceRisk === 'AMBER'
      ? 'RSA/ABAC sensitivities likely in AU.'
      : 'Standard trade promo guardrails.',
    fulfilment: status.fulfilment === 'AMBER'
      ? 'Travel fulfilment needs clear rules, blackout dates and timelines.'
      : 'Central fulfilment looks straightforward.',
    kpiRealism: 'Entry band not named; prize/media not back-solved to that range.',
  }

  const fixes: Record<ScoreboardKey, string | undefined> = {
    objectiveFit:
      'Change-from: diffuse aims. → Change-to: one KPI (e.g., +8–12% ROS) and shape comms/value to it.',
    hookStrength: hook
      ? `Change-from: long/soft hook (“${hook}”). → Change-to: 2–6 words, brand-locked, used on pack and the first screen.`
      : 'Change-from: no clear hook. → Change-to: write one 2–6 word, premium line and lock the brand into it.',
    mechanicFit: mech
      ? `Change-from: ${mech}. → Change-to: staff-explainable in five seconds; keep admin post-entry.`
      : 'Change-from: unstated mechanic. → Change-to: one-line, staff-explainable entry.',
    frequencyPotential:
      isAssuredValue
        ? 'Change-from: one-and-done feel. → Change-to: a light cadence of confirmation/membership moments (no prize draws).'
        : 'Change-from: one-off entry. → Change-to: light weekly moment + bonus entries at 2 and 4 units.',
    friction:
      (status.friction === 'RED')
       ? 'Remove mail-in / first-step proof / multi-upload. Make first touch minimal; shift verification post-entry.'
       : undefined,
    rewardShape:
      isAssuredValue
        ? 'Change-from: value story buried in admin. → Change-to: lead with the guaranteed reward; dramatise proof and fulfilment while keeping ops zero-lift.'
        : (breadthOnly || forbidHero
            ? 'Change-from: thin-feel cadence. → Change-to: make breadth and cadence highly visible; consider pairing single-admit rewards (two passes) to enable shared use; publish “Total winners”.'
            : (isExperientialHero
                ? 'Change-from: one big experience. → Change-to: keep the hero trip, add echo rewards aligned to the experience (runner-ups/merch/credit), and make breadth visible; publish “Total winners”.'
                : (heroPrize
                    ? `Change-from: hero-only (${heroPrize}${heroCount ? ` x${heroCount}` : ''}). → Change-to: add runner-ups/instants; show breadth and cadence clearly.`
                    : 'Change-from: no hero prize. → Change-to: hero + breadth (instants/weeklies); publish total winners.'))),
    retailerReadiness: retailers.length
      ? `Change-from: loose POS${retailersLine}. → Change-to: pre-packed POS kits; no staff adjudication; central processing.`
      : 'Change-from: no retailer plan. → Change-to: confirm banners; ship POS kits; zero staff workload.',
    complianceRisk:
      status.complianceRisk === 'AMBER'
        ? 'Change-from: implied RSA risk. → Change-to: age gate, RSA/ABAC lines, no consumption cues, moderation plan.'
        : 'Maintain RSA copy; keep moderation plan logged.',
    fulfilment:
      status.fulfilment === 'AMBER'
        ? 'Change-from: bespoke travel fulfilment. → Change-to: travel credit/concierge; blackout dates; published timelines.'
        : 'Maintain central fulfilment with clear SLAs.',
    kpiRealism:
      'Change-from: no entry band. → Change-to: set range, back-solve media and ops to it.',
  }

  const board: Scoreboard = {
    objectiveFit: { status: status.objectiveFit, why: why.objectiveFit },
    hookStrength: { status: status.hookStrength, why: why.hookStrength },
    mechanicFit: { status: status.mechanicFit, why: why.mechanicFit },
    frequencyPotential: { status: status.frequencyPotential, why: why.frequencyPotential },
    friction: { status: status.friction, why: why.friction },
    rewardShape: { status: status.rewardShape, why: why.rewardShape },
    retailerReadiness: { status: status.retailerReadiness, why: why.retailerReadiness },
    complianceRisk: { status: status.complianceRisk, why: why.complianceRisk },
    fulfilment: { status: status.fulfilment, why: why.fulfilment },
    kpiRealism: { status: status.kpiRealism, why: why.kpiRealism },
    decision: 'GO WITH CONDITIONS',
    conditions: isAssuredValue
      ? 'Lead with guaranteed value; confirm POS; treat any major-prize overlay only if briefed.'
      : (breadthOnly || forbidHero)
        ? 'Make breadth/cadence visible; consider pairing single-admit rewards; publish “Total winners”; confirm POS.'
        : 'Tighten hook, show breadth of winners, confirm POS and compliance lines.',
  }

  const SCOREBOARD_KEYS: ScoreboardKey[] = [
    'objectiveFit',
    'hookStrength',
    'mechanicFit',
    'frequencyPotential',
    'friction',
    'rewardShape',
    'retailerReadiness',
    'complianceRisk',
    'fulfilment',
    'kpiRealism',
  ]

  for (const key of SCOREBOARD_KEYS) {
    const cell = board[key]
    const fix = fixes[key]
    if (cell && fix && (cell.status === 'AMBER' || cell.status === 'RED')) {
      cell.fix = fix
    }
  }

  return board
}

/* -------------------------------------------------------------------------- */
/*                   Strict JSON pass: decisive, no hallucination             */
/* -------------------------------------------------------------------------- */

function coerceDiagnosis(jsonText: string, ctx: CampaignContext, tradePriority: 'HIGH' | 'LOW', reflective: boolean): EvalDiagnosis {
  let raw: any = null
  try { raw = JSON.parse(jsonText) } catch { raw = null }

  const safeStr = (v: any) => (v == null ? '' : String(v))

  const safe: EvalDiagnosis = {
    stance: (raw?.stance ?? ctx.orientation ?? 'UNKNOWN') as string,
    brand_position: (raw?.brand_position ?? (ctx.brandPosition ?? 'UNKNOWN')) as string,
    creative_hook_current: (raw?.creative_hook_current ?? ctx.briefSpec?.hook ?? null) as string | null,
    creative_hook_better: (raw?.creative_hook_better ?? null) as string | null,
    hook_why_change: raw?.hook_why_change ?? null,
    hook_alternatives: Array.isArray(raw?.hook_alternatives) ? raw.hook_alternatives.map(String).filter(Boolean).slice(0, 6) : [],
    mechanic: (raw?.mechanic ?? ctx.briefSpec?.mechanicOneLiner ?? null) as string | null,
    retailers: Array.isArray(raw?.retailers)
      ? raw.retailers.map((s: any) => String(s)).filter(Boolean)
      : Array.isArray(ctx.briefSpec?.retailers)
        ? (ctx.briefSpec!.retailers as string[])
        : [],
    prizes: {
      hero: raw?.prizes?.hero ?? ctx.briefSpec?.heroPrize ?? null,
      hero_count: Number(raw?.prizes?.hero_count ?? ctx.briefSpec?.heroPrizeCount ?? 0) || null,
      runner_ups: Array.isArray(raw?.prizes?.runner_ups)
        ? raw.prizes.runner_ups.map((s: any) => String(s))
        : Array.isArray(ctx.briefSpec?.runnerUps)
          ? (ctx.briefSpec!.runnerUps as string[])
          : [],
    },
    friction: raw?.friction ?? (ctx.briefSpec as any)?.frictionBudget ?? null,
    banned_mechanics: Array.isArray(raw?.banned_mechanics)
      ? raw.banned_mechanics.map((s: any) => String(s))
      : Array.isArray(ctx.briefSpec?.bannedMechanics)
        ? (ctx.briefSpec!.bannedMechanics as string[])
        : [],
    calendar_theme: raw?.calendar_theme ?? ctx.briefSpec?.calendarTheme ?? null,
    what_worked: Array.isArray(raw?.what_worked) ? raw.what_worked.map(String) : [],
    what_didnt: Array.isArray(raw?.what_didnt) ? raw.what_didnt.map(String) : [],
    risks: Array.isArray(raw?.risks) ? raw.risks.map(String) : [],
    fixes: Array.isArray(raw?.fixes) ? raw.fixes.map(String) : [],
    bold_variants: Array.isArray(raw?.bold_variants) ? raw.bold_variants.map(String) : [],
    promotrack_applied: Array.isArray(raw?.promotrack_applied) ? raw.promotrack_applied.map(String) : [],
    judgement: {
      verdict: safeStr(raw?.judgement?.verdict || 'GO_WITH_CONDITIONS'),
      because: safeStr(raw?.judgement?.because || ''),
    },
    asks: Array.isArray(raw?.asks) ? raw.asks.map(String).slice(0, 3) : [],
    assumptions: Array.isArray(raw?.assumptions) ? raw.assumptions.map(String).slice(0, 3) : [],
    symbolism: Array.isArray(raw?.symbolism) ? raw.symbolism.map(String).slice(0, 5) : [],
    proposition_hint: raw?.proposition_hint ? String(raw.proposition_hint) : null,
    trade_priority: (raw?.trade_priority === 'HIGH' ? 'HIGH' : tradePriority) as 'HIGH' | 'LOW',
    trade_table:
      Array.isArray(raw?.trade_table)
        ? raw.trade_table.map((r: any) => ({
            barrier: String(r?.barrier || '').trim(),
            incentive: String(r?.incentive || '').trim(),
            how_to_run: String(r?.how_to_run || '').trim(),
            guardrail: r?.guardrail ? String(r.guardrail).trim() : undefined,
          })).filter((r: TradeRow) => r.barrier && r.incentive && r.how_to_run).slice(0, 6)
        : [],
    when_reflective: !!reflective,
    run_again_moves: Array.isArray(raw?.run_again_moves) ? raw.run_again_moves.map(String).slice(0, 5) : [],
  }

  if (!safe.creative_hook_current) safe.creative_hook_current = null
  if (!safe.creative_hook_better) safe.creative_hook_better = null
  if (!safe.mechanic) safe.mechanic = null
  if (!safe.prizes.hero) safe.prizes.hero = null
  if (!safe.calendar_theme) safe.calendar_theme = null
  if (!safe.friction) safe.friction = null

  return safe
}

/* -------------------------------------------------------------------------- */
/*                      Opinion Mode composer (assured-aware)                 */
/* -------------------------------------------------------------------------- */

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
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1')
  return out.trim()
}

/* -------------------------------------------------------------------------- */
/*                            Main evaluate orchestrator                      */
/* -------------------------------------------------------------------------- */

export async function runEvaluate(
  ctx: CampaignContext,
  options?: {
    ruleFlex?: RuleFlex
    priorFraming?: string
    priorFramingMeta?: FramingV2Meta | null
    researchOverrides?: ResearchOverrides | null
  }
) {
  const modelJSON = resolveModel(
    process.env.MODEL_EVAL_JSON,
    process.env.MODEL_EVAL,
    process.env.MODEL_DEFAULT,
    'gpt-4o'
  )
  const modelPROSE = resolveModel(
    process.env.MODEL_EVAL_PROSE,
    process.env.MODEL_DEFAULT,
    'gpt-4o'
  )
  const ruleFlex: RuleFlex = options?.ruleFlex ?? 'KEEP'
  const priorFraming = (options?.priorFraming || '').trim()
  const priorFramingMeta: FramingV2Meta = options?.priorFramingMeta ?? null
  const researchOverrides = options?.researchOverrides ?? null

  // Re-hydrate prior Opinion & Improvement for WarRoom memory and prompt context
  const priorOpinion = await getLatestTextOutputMulti(ctx.id, ['opinionNarrative','opinion'])
  const priorImprovement = await getLatestTextOutputMulti(ctx.id, ['improvementNarrative','improvement'])

  let promotrackGuide = ''
  try { promotrackGuide = buildEvaluationGuide(ctx, { ruleFlex }) || '' } catch {}

  const hintBlob = [
    ctx.briefSpec?.hook,
    ctx.briefSpec?.mechanicOneLiner,
    ctx.briefSpec?.heroPrize,
    ctx.briefSpec?.typeOfPromotion,
    Array.isArray(ctx.briefSpec?.runnerUps) ? ctx.briefSpec!.runnerUps!.join(', ') : '',
  ].filter(Boolean).join(' • ')
  let heuristicsCard: Scorecard | null = null
  try { if (hintBlob) heuristicsCard = analyzeRoute(hintBlob) } catch {}

  const reflective = isPastCampaign(ctx)
  const tradePriority = inferTradePriority(ctx)

  const spec: any = ctx.briefSpec || {}
  const ideationHarness = await fetchLatestHarness(ctx.id)
  const brandFromBrief = (spec?.brand || '').trim()
  const brandFirst = brandFromBrief || (ctx.clientName || 'Client')
  const rules = await loadCampaignRules(ctx)
  const totalWinnerCountRules = rules.prize.totalWinners
  const shareableRewardRules = rules.prize.shareableReward
  const shareableAltRules = rules.prize.shareableAlternateWinnerCount
  const ticketPoolRules = rules.prize.ticketPool

  // assured-value detection recomputed for prose context
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const gwp = spec?.gwp || null
  const cashback = spec?.cashback || null
  const assuredItemsList = Array.isArray(spec?.assuredItems)
    ? spec.assuredItems.map((item: any) => String(item || '').trim()).filter(Boolean)
    : (typeof spec?.assuredItems === 'string'
        ? String(spec.assuredItems).split(/[,•\n]+/).map((item) => item.trim()).filter(Boolean)
        : [])
  const assuredViaCashback = Boolean(type === 'CASHBACK' || cashback)
  const assuredViaGWP = Boolean(type === 'GWP' || gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null)
  const assuredViaFlag = Boolean(spec?.assuredValue || assuredItemsList.length > 0)
  const isAssuredValue = !!(assuredViaCashback || assuredViaGWP || assuredViaFlag)
  const mechanicRule =
    getMechanicRule(type) ||
    getMechanicRule(spec?.mechanicOneLiner) ||
    (Array.isArray(spec?.mechanicTypes) ? getMechanicRule(String(spec.mechanicTypes[0] || '')) : null) ||
    getMechanicRule(spec?.entryMechanic)

  // ===== Hand-off from Framing (authoritative) =====
  const heroPref = ctx.warRoomPrefs?.allowHeroOverlay
  const entryLocked = ctx.warRoomPrefs?.entryFrictionAccepted === true
  const prohibitions = priorFramingMeta?.handoff?.prohibitions || []
  const forbidHeroPrize = heroPref === false
    ? true
    : prohibitions.some((p) => ['NO_HERO_PRIZE', 'NO_HERO_PRIZE_SUGGESTION'].includes(String(p).toUpperCase()))
  const breadthOnly = priorFramingMeta?.authoritative?.prize_presence === 'BREADTH_ONLY'
  const breadthCount = priorFramingMeta?.breadth_prize?.count ?? null
  const majorPrizeLabel = (() => {
    if (typeof spec?.majorPrizeOverlay === 'string') {
      const trimmed = spec.majorPrizeOverlay.trim()
      if (trimmed) return trimmed
    }
    const heroPrizeRaw = typeof spec?.heroPrize === 'string' ? spec.heroPrize.trim() : ''
    if (heroPrizeRaw) {
      const heroCount = Number(spec?.heroPrizeCount)
      if (Number.isFinite(heroCount) && heroCount > 1) return `${heroPrizeRaw} x${Math.round(heroCount)}`
      return heroPrizeRaw
    }
    const prizeItems = priorFramingMeta?.prize_map?.items || []
    for (const item of prizeItems) {
      const label = typeof (item as any)?.label === 'string' ? (item as any).label.trim() : ''
      if (label) return label
    }
    return null
  })()

  /* --------------------------- RESEARCH (reuse only) ----------------------- */
  // Absolutely no fresh research here; reuse what Framing provided (or null).
  const research: ResearchPack | null = applyResearchOverrides(priorFramingMeta?.research ?? null, researchOverrides)
  const researchInsightLines = collectResearchInsightLines(research)
  const style = buildCampaignStyleSpec(ctx, 'evaluation', research, { briefSpec: spec })
  const structureDirective = pickStructure(style, 'evaluation', ctx.id)
  const lexiconDirective = style.lexiconHints.length
    ? `Weave in campaign-specific language such as ${style.lexiconHints.join(', ')} where it sharpens the point.`
    : ''
  const personaDirective = style.persona
    ? `Write as a ${style.persona} who knows this category inside out.`
    : ''
  const insightDirective = style.mustInclude.length
    ? `Cite or paraphrase these on-brief specifics: ${style.mustInclude.join(' | ')}`
    : ''
  const avoidDirective = style.avoidPhrases.length
    ? `Do not use phrases like ${style.avoidPhrases.join(', ')}.`
    : ''

  // Benchmarks: prefer Framing’s snapshot if present; else derive from (possibly null) research
  let cbBench = buildCashbackBenchmark(research)
  let prizeObs = buildPrizeCountObservation(research)
  let recommendedHeroCount = 3
  if (priorFramingMeta?.benchmarks) {
    const bm = priorFramingMeta.benchmarks
    recommendedHeroCount = bm.recommendedHeroCount || 3
    if (bm.cashback) {
      cbBench = {
        sample: bm.cashback.sample,
        typicalAbs: bm.cashback.typicalAbs,
        maxAbs: bm.cashback.maxAbs,
        typicalPct: bm.cashback.typicalPct,
        maxPct: bm.cashback.maxPct,
        p25: null, p75: null,
        sources: bm.cashback.sources || []
      }
    }
    if (bm.prizeCountsObserved) {
      prizeObs = { total: bm.prizeCountsObserved.total, common: bm.prizeCountsObserved.common }
    }
  } else {
    const common = prizeObs.common || []
    const two = common.find(c => c.count === 2)
    const three = common.find(c => c.count === 3)
    recommendedHeroCount = two ? 2 : (three ? 3 : 3)
  }

  // OfferIQ (can leverage reused research if present)
  const ctxWithResearch = Object.assign({}, ctx, { research }) as CampaignContext & { research: ResearchPack | null }
  const offerIQ: OfferIQ = scoreOffer(ctxWithResearch)
  const repAmount = Number(offerIQ?.diagnostics?.valueAmount || 0)
  const headlineMax = Number((offerIQ as any)?.diagnostics?.headlineMax || 0)

  /* ---------------------------- STRICT JSON PASS --------------------------- */
  const strategistSystem =
    [
      'You are a senior Australian brand strategist with creative authority.',
      'Return ONE valid JSON object only. No markdown. No prose outside JSON.',
      'Be decisive and commercial. No weasel words. No fake precision.',
      'Never invent numbers, retailer names, prices, dates or SLAs. If unknown, set null or [].',
      'Explain *why* a current hook under-delivers before proposing a better one (field: hook_why_change).',
      'Anchor every WHY/FIX to this campaign’s specifics (hook/mechanic/prize/channel/retailers) where available.',
      'If trade is not material to the channel, do not fabricate trade advice.',
      'Optional: if a symbolism bridge is obvious, include it in "symbolism".',
      'Do NOT segment the audience into generic buckets (e.g., "value seekers" vs "experience enthusiasts"). Evaluate the exact promotion, context and mechanics at hand.',
      'Cross-check assured value/cashback against category benchmarks; if below the norm, call out the exact increase required (e.g. lift cashback to the typical dollar amount).',
      'When hero/overlay prizes exist, explore distribution logic (per key retailer vs open draw) and explicitly weigh keeping vs trimming the hero count so perceived odds stay strong.',
      'If an IP tie-in exists (film/event/franchise), weave the property, timing, and partner into hooks/risks exactly as briefed. Do not invent licensing claims or new partners.',
      'Call out weaknesses directly; if something will not work, say so.',
      isPastCampaign(ctx)
        ? 'Write in reflective past tense. Add "run_again_moves": up to five crisp changes we would make if we ran this again.'
        : 'Write in present/future tense.',
      'If you need facts to be precise, add up to three items in "asks". If you assume anything, use "assumptions".',
    ].filter(Boolean).join(' ')

  const gwpFacts = gwp
    ? [
        gwp.item ? `GWP: ${gwp.item}` : 'GWP: item n/a',
        `triggerQty: ${gwp.triggerQty != null ? gwp.triggerQty : 'n/a'}`,
        `cap: ${gwp.cap != null ? gwp.cap : 'n/a'}`,
      ].join(', ')
    : ''

  const cbHeadline = cashback?.headline ? String(cashback.headline) : ''
  const cbBands = Array.isArray(cashback?.bands) ? cashback.bands : []
  const cbPercent = typeof (cashback as any)?.percent === 'number' ? Number((cashback as any).percent) : null
  const cashbackFacts = cashback
    ? cbBands.length || cbHeadline
      ? [
          `Cashback: banded${cbHeadline ? ` (headline: ${cbHeadline})` : ''}`,
          `cap: ${cashback.cap != null ? cashback.cap : 'n/a'}`,
          `proof: ${cashback.proofRequired ? 'REQUIRED' : 'OPTIONAL'}`,
          cashback.currency ? `currency: ${cashback.currency}` : '',
          cashback.processingDays != null ? `processing: ${cashback.processingDays}d` : '',
        ].filter(Boolean).join(', ')
      : [
          `Cashback: ${
            cashback.amount != null
              ? `$${cashback.amount}`
              : (cbPercent != null ? `${cbPercent}%` : 'n/a')
          } ${cashback.currency || ''}`.trim(),
          `cap: ${cashback.cap != null ? cashback.cap : 'n/a'}`,
          `proof: ${cashback.proofRequired ? 'REQUIRED' : 'OPTIONAL'}`,
          cashback.processingDays != null ? `processing: ${cashback.processingDays}d` : '',
        ].join(', ')
    : ''

  const overlay =
    (spec?.majorPrizeOverlay === true || typeof spec?.majorPrizeOverlay === 'string')
      ? `Overlay: ${typeof spec.majorPrizeOverlay === 'string' ? spec.majorPrizeOverlay : 'Major prize overlay: YES'}`
      : ''

  const assuredLine =
    (assuredViaCashback || assuredViaGWP || assuredViaFlag)
      ? `Assured reward: ${
          assuredViaCashback
            ? (
                cashback?.amount != null
                  ? `$${cashback.amount} cashback`
                  : (cbPercent != null
                      ? `${cbPercent}% cashback`
                      : (cbBands.length || cbHeadline ? 'banded cashback' : 'cashback'))
              )
            : assuredViaGWP
              ? `GWP — ${gwp?.item || 'item'}`
              : (assuredItemsList.length ? assuredItemsList.join(', ') : 'guaranteed for every qualifier')
        }`
      : ''

  const ipTie = spec?.ipTieIn || null
  let ipLine = ''
  if (ipTie && (ipTie.franchise || ipTie.theme || ipTie.activationType || ipTie.eventWindow || ipTie.partner)) {
    const headline = [ipTie.franchise, ipTie.theme].filter(Boolean)
    const detailParts = [
      ipTie.activationType ? `type: ${ipTie.activationType}` : null,
      ipTie.eventWindow ? `window: ${ipTie.eventWindow}` : null,
      ipTie.partner ? `partner: ${ipTie.partner}` : null,
    ].filter(Boolean)
    const combined = [...headline, ...detailParts]
    const status = ipTie.licensed ? 'licensed' : 'pending-rights'
    ipLine = `IP tie-in (${status}): ${combined.join(' — ')}`
  }

  const briefFacts = [
    spec?.brand ? `Brand: ${spec.brand}` : '',
    ctx.clientName ? `Client: ${ctx.clientName}` : '',
    spec?.hook ? `Hook: ${spec.hook}` : '',
    spec?.mechanicOneLiner ? `Mechanic: ${spec.mechanicOneLiner}` : '',
    spec?.typeOfPromotion ? `Promotion: ${spec.typeOfPromotion}` : '',
    gwpFacts ? gwpFacts : '',
    cashbackFacts ? cashbackFacts : '',
    overlay ? overlay : '',
    assuredLine ? assuredLine : '',
    Array.isArray(spec?.retailers) && spec!.retailers!.length ? `Retailers: ${spec!.retailers!.join(', ')}` : '',
    spec?.tradeIncentive ? `Trade incentive: ${spec.tradeIncentive}` : '',
    spec?.heroPrize ? `Hero prize: ${spec.heroPrize}${spec?.heroPrizeCount ? ` x${spec.heroPrizeCount}` : ''}` : '',
    Array.isArray(spec?.runnerUps) && spec!.runnerUps!.length ? `Runner-ups: ${spec!.runnerUps!.join(', ')}` : '',
    spec?.calendarTheme ? `Calendar: ${spec.calendarTheme}` : '',
    ipLine,
    `Orientation: ${ctx.orientation || 'UNKNOWN'}`,
    `RuleFlex: ${ruleFlex}`,
    isPastCampaign(ctx) ? 'Mode: REFLECTIVE (past campaign)' : 'Mode: FORWARD (future/in-flight)',
    (breadthOnly ? `Breadth/cadence winners present${breadthCount ? `: ~${breadthCount}` : ''}.` : '')
  ].filter(Boolean).join(' | ')

  const researchSnapshot = {
    cashback_benchmark: {
      sample: cbBench.sample,
      typicalAbs: cbBench.typicalAbs,
      maxAbs: cbBench.maxAbs,
      typicalPct: cbBench.typicalPct,
      maxPct: cbBench.maxPct
    },
    prize_count_observed_total: prizeObs.total,
    prize_count_common: prizeObs.common,
    recommendedHeroCount
  }

  const researchSnapshotForModel =
    isAssuredValue
      ? researchSnapshot
      : {
          prize_count_observed_total: prizeObs.total,
          prize_count_common: prizeObs.common,
          recommendedHeroCount
        }

  const tradeJSONSpec = tradePriority === 'HIGH'
    ? `If trade truly matters here, set "trade_priority":"HIGH" and return "trade_table" (≤6 rows) with:
[{ "barrier": "...", "incentive": "...", "how_to_run": "...", "guardrail": "..."? }].
If trade is not material, set "trade_priority":"LOW" and omit "trade_table".`
    : `Set "trade_priority":"LOW" and omit "trade_table". Do not fabricate trade advice.`

  const strategistUser =
    [
      `Campaign: ${brandFirst} — ${ctx.title} (Client: ${ctx.clientName || 'n/a'})`,
      `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Brand position: ${ctx.brandPosition || 'UNKNOWN'}`,
      '',
      'BRIEF (facts):',
      briefFacts || '_none_',
      '',
      ipTie?.notes ? `IP guardrails: ${ipTie.notes}` : '',
      '',
      promotrackGuide ? `PROMOTRACK (private guardrails & winning patterns):\n${promotrackGuide}\n` : '',
      priorFraming ? ['PRIOR FRAMING (authoritative; do not restate):', priorFraming].join('\n') : '',
      priorOpinion ? ['PRIOR OPINION (authoritative; integrate lightly if still relevant):', priorOpinion.slice(0, 4000)].join('\n') : '',
      priorImprovement ? ['PRIOR IMPROVEMENT (authoritative; integrate lightly if still relevant):', priorImprovement.slice(0, 4000)].join('\n') : '',
      '',
      'RESEARCH SNAPSHOT (reuse-only; do not fabricate):',
      JSON.stringify(researchSnapshotForModel),
      '',
      'RESEARCH INSIGHTS (cite verbatim when useful):',
      researchInsightLines.length ? researchInsightLines.map(line => `- ${line}`).join('\n') : '_none_',
      '',
      EVAL_DIAGNOSIS_JSON_SPEC,
      '',
      'Additions:',
      '- hook_why_change: string (what exactly is wrong with the *current* hook).',
      '- symbolism: string[] (≤5) if a clear cultural/national bridge exists.',
      '- proposition_hint: string if a tight commercial line is clear.',
      `- trade_priority: "HIGH"|"LOW". ${tradeJSONSpec}`,
      isPastCampaign(ctx) ? '- run_again_moves: string[] (≤5) — concrete changes if we ran this again.' : '',
      '',
      'Rules:',
      '- Do NOT invent retailer names or numbers.',
      '- If a value is unknown, use null or [].',
      '- Tie WHY/FIX statements to this campaign’s facts wherever possible.',
      '- Do NOT recommend cashback unless it already appears in BRIEF.',
      (forbidHeroPrize ? '- Do NOT invent or recommend a hero/major prize; treat rewards as cadence/breadth only.' : ''),
      '- Return ONLY a valid JSON object.',
    ].filter(Boolean).join('\n')

  const jsonText = await chat({
    model: modelJSON,
    system: strategistSystem,
    messages: [{ role: 'user', content: strategistUser }],
    temperature: Number(process.env.EVAL_DIAG_TEMP ?? 0.25),
    top_p: 1,
    json: true,
    max_output_tokens: 1500,
    meta: { scope: 'evaluate.diagnosis', campaignId: ctx.id },
  })

  const diagnosis = coerceDiagnosis(jsonText, ctx, tradePriority, isPastCampaign(ctx))

  // Build scoreboard with research-aware context + guards from Framing
  const scoreboard = buildScoreboard(ctx, diagnosis, research, offerIQ, {
    forbidHeroPrize,
    breadthOnly,
    breadthCount,
  }, rules)
  const gateMeta = gateScoreboard(scoreboard, offerIQ)
  const opsGuardrails: string[] = []
  if (rules.guardrails.allStockists) {
    opsGuardrails.push('Runs across all stockists — keep recommendations nationally scalable; avoid retailer-exclusive solutions unless briefed.')
  }
  if (rules.staff.zeroCapacity) {
    opsGuardrails.push('Store teams have zero capacity — no staff-run announcements, kiosks, or manual verification.')
  }
  if (!isAssuredValue && shareableRewardRules && totalWinnerCountRules != null && ticketPoolRules != null) {
    opsGuardrails.push(`Shareable reward already live — ${totalWinnerCountRules} double passes (${ticketPoolRules} tickets). Keep dramatizing that shared value rather than recutting the pool.`)
  }
  if (!isAssuredValue && !shareableRewardRules && rules.guardrails.prizePoolFixed && shareableAltRules != null && ticketPoolRules != null) {
    opsGuardrails.push(`Prize pool is fixed at ${ticketPoolRules} passes; if you explore double passes, make clear the winner count drops to ~${shareableAltRules} on the same spend.`)
  }
  opsGuardrails.push('Keep cadence visible through consumer-facing messaging (pack, digital, social), not store labour.')
  opsGuardrails.push('Never suggest staff-run amplification, kiosks, or in-store terminals — execution must run on consumer comms and zero additional store labour.')
  for (const founderNote of rules.founder.notes) {
    opsGuardrails.push(`Founder guidance: ${founderNote}`)
  }
  // OfferIQ-aware adjustments (using the earlier computed offerIQ)

  const confidentNoGo = offerIQ.verdict === 'NO-GO' && offerIQ.confidence >= 0.7
  const prizeTiny = offerIQ.mode === 'PRIZE' && offerIQ.hardFlags.includes('COVERAGE_TINY')

  if (confidentNoGo && (offerIQ.mode === 'ASSURED' || prizeTiny)) {
    ;(scoreboard as any).rewardShape = {
      status: 'RED',
      why: offerIQ.lenses.adequacy.why,
      fix: offerIQ.lenses.adequacy.fix,
    }
    ;(scoreboard as any).decision = 'NO-GO'
    ;(scoreboard as any).conditions =
      offerIQ.mode === 'ASSURED'
        ? 'Rework the value to meet category floors (absolute or % of ASP) or pivot to a premium GWP with explicit RRP.'
        : 'Perceived odds are too thin. Increase total winners or make cadence highly visible; publish “Total winners”.'
  } else if (offerIQ.mode === 'PRIZE' && offerIQ.confidence < 0.6) {
    ;(scoreboard as any).rewardShape = {
      status: 'AMBER',
      why: offerIQ.lenses.adequacy.why + (offerIQ.asks?.length ? ` Requires: ${offerIQ.asks.join(' • ')}` : ''),
      fix: 'Publish “Total winners”, clarify cadence, and provide expected buyers/entries for a firmer read.',
    }
    const asksLine = offerIQ.asks?.length ? ` Provide: ${offerIQ.asks.join('; ')}.` : ''
    ;(scoreboard as any).conditions = (scoreboard as any).conditions + asksLine
  }

  /* ---------------------------- OPINION MODE PROSE -------------------------- */

  const hookLine = (diagnosis?.creative_hook_better || diagnosis?.creative_hook_current || spec?.hook || '').toString().trim()
  const mechLine = (diagnosis?.mechanic || spec?.mechanicOneLiner || '').toString().trim()
  const entryMechanicBrief = (spec?.entryMechanic || '').toString().trim()
  const requiresProofUpload = Boolean(
    (spec?.cashback && (spec.cashback as any)?.proofRequired) ||
    /upload/i.test(entryMechanicBrief)
  )

  const brandAlias = (spec?.brand || ctx.clientName || ctx.title.split('—')[0] || 'Brand').trim()
  const hookSet = new Set<string>()
  const pushHook = (value?: string | null) => {
    const trimmed = (value || '').replace(/\s+/g, ' ').trim()
    if (!trimmed) return
    const key = trimmed.toLowerCase()
    if (!hookSet.has(key)) hookSet.add(key)
  }
  pushHook(diagnosis?.creative_hook_better)
  ;(diagnosis?.hook_alternatives || []).forEach(pushHook)
  const prizeContextCorpus = [
    ctx.title,
    spec?.hook,
    spec?.mechanicOneLiner,
    spec?.heroPrize,
    Array.isArray(spec?.runnerUps) ? spec.runnerUps.join(' ') : '',
    diagnosis?.creative_hook_current,
    diagnosis?.creative_hook_better,
    ((offerIQ as any)?.diagnostics?.headline ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const prizeLooksTicket = /ticket|pass/.test(prizeContextCorpus)
  const prizeLooksCredit =
    /\$|credit|cash|upgrade|fund|appliance|gear|voucher|wishlist|home upgrade/.test(prizeContextCorpus)
  const rewardCategoryFallback =
    prizeLooksTicket ? 'ticket' : prizeLooksCredit ? 'credit' : 'generic'

  const sharedRewardHooks = prizeLooksTicket
    ? [
        'Movie Night for Two — 1,000 Double Passes.',
        'Two Desserts. Two Seats. Every Hour.',
        'Dessert Doubles Your Tickets.',
        'Upload & Share the Cinema Night.',
        `${brandAlias} Night Out for Two.`,
      ]
    : []
  const creditRewardHooks = [
    `${brandAlias} Cashback Hits Now.`,
    `${brandAlias} Wishlist Approved.`,
    'Daily $2K Cashback Drops.',
    `${brandAlias} Covers Your Upgrade.`,
    `${brandAlias} Fund — Yours to Spend.`,
  ]
  const assuredFallback = [
    `${brandAlias} Cashback Locked In.`,
    `${brandAlias} Pays You Back.`,
    'Proof Uploaded. Cashback Approved.',
    `One Receipt. One ${brandAlias} Payback.`,
    `${brandAlias} Promise: Pay Now, Claim Back.`,
  ]
  const chanceFallback = [
    ...(rewardCategoryFallback === 'ticket' ? sharedRewardHooks : []),
    ...(rewardCategoryFallback === 'credit' ? creditRewardHooks : []),
    'Win Tonight, Not Someday.',
    'Fair Odds. Fast Wins.',
  ]
  const fallbackPool = shareableRewardRules
    ? sharedRewardHooks
    : (isAssuredValue ? assuredFallback : chanceFallback)
  for (const fallback of fallbackPool) {
    if (hookSet.size >= 7) break
    pushHook(fallback)
  }
  const hookShortlist = Array.from(hookSet).slice(0, 5)
  while (hookShortlist.length < 5) {
    const filler = fallbackPool[hookShortlist.length % fallbackPool.length]
    if (!hookShortlist.includes(filler)) hookShortlist.push(filler)
    else hookShortlist.push(`${brandAlias} Hook ${hookShortlist.length + 1}`)
  }

  const harnessSummary = ideationHarness
    ? `CREATE_UNBOXED pick → ${ideationHarness.selectedHook || 'n/a'} | Point: ${ideationHarness.point || 'n/a'} | Move: ${ideationHarness.move || 'n/a'} | Odds/Cadence: ${ideationHarness.oddsCadence || 'n/a'}`
    : ''

  const harnessUserBlock = ideationHarness
    ? [
        'CREATE_UNBOXED / BRUCE focus:',
        ideationHarness.selectedHook ? `- Hook: ${ideationHarness.selectedHook}` : '',
        ideationHarness.point ? `- Point: ${ideationHarness.point}` : '',
        ideationHarness.move ? `- Move: ${ideationHarness.move}` : '',
        ideationHarness.risk ? `- Risk: ${ideationHarness.risk}` : '',
        ideationHarness.oddsCadence ? `- Odds & cadence: ${ideationHarness.oddsCadence}` : '',
        ideationHarness.retailerLine ? `- Retailer line: ${ideationHarness.retailerLine}` : '',
        ideationHarness.legalVariant ? `- Legalised variant: ${ideationHarness.legalVariant}` : '',
      ].filter(Boolean).join('\n')
    : ''

  const verdictDirective =
    gateMeta.decision === 'NO-GO'
      ? 'Verdict: this is a NO-GO until the critical fixes land; spell out the fixes calmly, no melodrama.'
      : gateMeta.decision === 'GO WITH CONDITIONS'
        ? 'Verdict: GO WITH CONDITIONS — surface the conditions in the thesis and make the unlock plan impossible to ignore.'
        : 'Verdict: GO — celebrate what works but still name the guardrails, cadence discipline, and proof required to keep the odds credible.'

  const opsDirective = opsGuardrails.join(' ')

  const opinionSystem = [
    'You are the Ferrier/Droga duo writing a board memo that decides the fate of this promotion.',
    'Voice: elegant, exacting, commercially ruthless. Sentences glide; no bullet points, no arrows, no shorthand.',
    'Every claim must be grounded in the brief, OfferIQ, Framing, Strategist, or Research. Cite sources inline (“Source: …”) when referencing data.',
    'Interrogate hooks and prizing as if you live inside the Framing and Strategist documents; quote their sharpest lines where relevant.',
    'Paint scenes. Show the shopper, the retailer buyer, the CMO. Write in paragraphs that flow, each with a single, deliberate argument.',
    'Tone: decisive yet constructive—describe the risk plainly, focus on the fix, avoid inflammatory language such as “halt” or “collapse.”',
    personaDirective,
    structureDirective,
    lexiconDirective,
    insightDirective,
    avoidDirective,
    harnessSummary ? `Carry forward CREATE_UNBOXED retailised concept: ${harnessSummary}` : '',
    ...style.toneDirectives,
    assuredViaCashback
      ? 'Do not imply the laptop is free upfront—make it explicit that the student pays now and claims the rebate after verified graduation. Spell out proof-of-purchase capture, graduation verification, payout timing, and who underwrites the liability.'
      : '',
    assuredViaCashback
      ? 'Do not invent partial rebates, hero overlays, or burst mechanics that are absent from the brief; improvement paths must stay within the conditional cashback framework.'
      : '',
    assuredViaCashback
      ? 'Name the compliance, financial, and operational guardrails (escrow, verification partner, breakage assumptions). If these are missing, flag them as mandatory conditions.'
      : '',
    assuredViaCashback
      ? 'The rebate amount is the full laptop purchase price. Do not recommend swapping to smaller fixed rebates, gift-with-purchase alternatives, or any change to the guaranteed value—focus only on clarity, governance, and fulfilment.'
      : '',
    majorPrizeLabel ? `Hero overlay is already defined as ${majorPrizeLabel}; respect it and build stretch moves around it.` : '',
    verdictDirective,
    entryLocked ? 'Entry mechanics are already sanctioned; only threaten them if a new leap in value demands it.' : '',
    forbidHeroPrize ? 'Hero overlay is off the table; stretch breadth, cadence, or assured value instead.' : 'If a hero overlay would elevate fame without breaking store sanity, say so with numbers and tone.',
    isAssuredValue
      ? 'This is assured value; celebrate the certainty, test the headline against benchmarks, and never fabricate ladders.'
      : 'This is prize-led; balance breadth and spectacle, and measure perceived odds against benchmarks and competitors.',
    entryMechanicBrief
      ? `Entry mechanic (fact): ${entryMechanicBrief}. Keep every recommendation true to this flow; if OfferIQ or heuristics contradict it, call out the mismatch instead of adopting the error.`
      : 'Anchor recommendations in the briefed entry mechanic; do not invent QR flows or app scans unless explicitly briefed.',
    requiresProofUpload
      ? 'Receipt upload is part of the promised cashback — treat it as standard, focus on making it clear and fast rather than labelling it a barrier.'
      : '',
    requiresProofUpload
      ? 'If you propose improvements, keep them within “upload proof, get paid” — no QR detours unless the brief allows it.'
      : '',
    majorPrizeLabel
      ? `Hero overlay is fixed: ${majorPrizeLabel}. Build theatre around it rather than replacing it.`
      : '',
    opsDirective ? `Operational guardrails: ${opsDirective}` : '',
    'Never fabricate new publications or sources—quote only from the research dossier, OfferIQ, or brief. If evidence is missing, say so.',
  ].filter(Boolean).join(' ')

  const researchProseHints = [
    researchInsightLines.length ? researchInsightLines.join(' | ') : '',
    (isAssuredValue && cbBench.sample)
      ? `Market cashback benchmark (sample ${cbBench.sample}): typical ≈ ${cbBench.typicalAbs ? `$${Math.round(cbBench.typicalAbs)}` : (cbBench.typicalPct ? `${cbBench.typicalPct}%` : 'n/a')}; max ≈ ${cbBench.maxAbs ? `$${Math.round(cbBench.maxAbs)}` : (cbBench.maxPct ? `${cbBench.maxPct}%` : 'n/a')}.`
      : '',
    (!forbidHeroPrize && prizeObs.total)
      ? `Observed prize counts in current draws: ${prizeObs.common.map(c => `${c.count} (${Math.round(c.share*100)}%)`).join(', ')}.`
      : '',
    (isAssuredValue && typeof repAmount === 'number' && repAmount > 0) ? `Our assured value at ASP proxy ≈ $${Math.round(repAmount)}.` : '',
    (isAssuredValue && headlineMax > 0 && repAmount > 0 && Math.abs((headlineMax - repAmount) / (headlineMax || 1)) > 0.35)
      ? `Headline “up to” ≈ $${Math.round(headlineMax)} vs typical at ASP ≈ $${Math.round(repAmount)} (material gap).`
      : '',
    (!forbidHeroPrize ? `Recommended hero-prize count: ${recommendedHeroCount} (perceived odds; invest remainder into breadth/instants).` : ''),
    (shareableRewardRules && totalWinnerCountRules != null && ticketPoolRules != null)
      ? `Double pass inventory locked: ${totalWinnerCountRules} winners (${ticketPoolRules} tickets).`
      : (!shareableRewardRules && shareableAltRules != null && ticketPoolRules != null
          ? `Double-pass scenario would deliver ~${shareableAltRules} winners on the same ${ticketPoolRules} tickets.`
          : ''),
    rules.founder.notes.length ? `Founder priorities: ${rules.founder.notes.join(' | ')}` : '',
  ].filter(Boolean).join(' ')

  const assuredFlag = isAssuredValue ? 'ASSURED_VALUE' : 'NON_ASSURED'

  const opinionUser = [
    `Campaign: ${brandFirst} — ${ctx.title} (Client: ${ctx.clientName || 'n/a'})`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Mode: ${isPastCampaign(ctx) ? 'REFLECTIVE' : 'FORWARD'}`,
    `AssuredMode: ${assuredFlag}`,
    `Verdict to uphold: ${gateMeta.decision}`,
    (breadthOnly ? 'Prize mode: BREADTH/CADENCE (no hero).' : ''),
    '',
    'Facts:',
    briefFacts || '_none_',
    '',
    entryLocked ? 'Guidance: Entry friction already approved — keep mechanics as briefed.' : '',
    heroPref === false ? 'Guidance: Hero overlay off-limits unless the client overturns the guardrail.' : heroPref === true ? 'Guidance: Hero overlay encouraged — tie fame to Wicked IP.' : '',
    opsDirective ? `Operational guardrails: ${opsDirective}` : '',
    entryMechanicBrief ? `Briefed entry mechanic: ${entryMechanicBrief}. Keep the plan anchored in this flow.` : '',
    '',
    ...(harnessUserBlock ? [harnessUserBlock, ''] : []),
    'Research hints:',
    researchProseHints || '_none_',
    '',
    'Framing (authoritative; do not restate, use to inform tone):',
    (priorFraming || '').slice(0, 4000),
    '',
    'Evaluator JSON (authoritative fields; use to reason, not to quote):',
    JSON.stringify({
      hookLine,
      mechLine,
      symbolism: diagnosis.symbolism || [],
      proposition_hint: diagnosis.proposition_hint || null,
      trade_priority: diagnosis.trade_priority || 'LOW',
      trade_table: diagnosis.trade_table || [],
      when_reflective: diagnosis.when_reflective || false,
      run_again_moves: diagnosis.run_again_moves || [],
      majorPrizeOverlay: spec?.majorPrizeOverlay ?? null,
      cashbackHeadline: cbHeadline || null,
      cashbackBanded: cbBands.length > 0,
      prizePresence: priorFramingMeta?.authoritative?.prize_presence || null
    }),
    '',
    'Hook candidates (draw from these; keep any “double pass” promise intact):',
    hookShortlist.map((h) => `- ${h}`).join('\n'),
    '',
    'Write a concise evaluation using this exact template. Keep each section to two sentences or fewer unless noted.',
    'Verdict — one sentence that names the judgement and the cultural/commercial why.',
    'Why it works — max two sentences tying brand truth, shopper tension, and timing.',
    'Where it breaks — max two sentences naming the hardest flaws.',
    'Fix it — max two sentences with the concrete plan to repair those flaws.',
    'Retailer reality — max two sentences showing the buyer why this earns easy range with zero staff lift.',
    'If you recommend turning single tickets into double passes, state plainly that the winner count halves while perceived value doubles; never imply winner count stays flat.',
    'Tighten — one sentence: the pragmatic tweak we ship now.',
    'Stretch — one sentence: the bolder, still store-safe move.',
    `Hook upgrade — one sentence that states why the current hook (“${hookLine || spec?.hook || 'n/a'}”) fails and what the stronger angle is.`,
    'Hook shortlist — list exactly five lines starting with "- " that evolve the candidates above. Each hook must reinforce the shared double-pass promise or instant win clarity; avoid inventing unrelated slogans.',
    'Measurement — one sentence naming the single metric watched first.',
    'Pack line — provide a 2–6 word line in quotes.',
    'Staff line — provide a ≤5 second staff script in quotes.',
    'Rules: no other headings, no extra bullets, no filler. Cite sources inline (“Source: …”) whenever you quote data.',
  ].filter(Boolean).join('\n')

  const composedOpinion = await chat({
    model: modelPROSE,
    system: opinionSystem,
    messages: [{ role: 'user', content: opinionUser }],
    temperature: Number(process.env.EVAL_TEMP ?? 0.35),
    top_p: 0.9,
    max_output_tokens: 1200,
    meta: { scope: 'evaluate.narrative', campaignId: ctx.id },
  })

  let finalProse = polishProseAU((composedOpinion || '').trim())
  finalProse = stripClichesIfAssured(finalProse, ctx, isAssuredValue)
  finalProse = harmoniseMechanicLanguage(finalProse, entryMechanicBrief)

  /* -------------------------- OPTIONAL UNIQUENESS PASS ---------------------- */

  async function mostSimilarToRecent(campaignId: string, draft: string) {
    const recent = await prisma.output.findMany({
      where: { type: { in: ['evaluation', 'evaluationNarrative'] } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, campaignId: true, type: true, createdAt: true, content: true, params: true },
    })
    const shingles = (s: string, n = 3) => {
      const words = s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
      const out: string[] = []
      for (let i = 0; i <= words.length - n; i++) out.push(words.slice(i, i + n).join(' '))
      return out
    }
    const cosine = (a: string[], b: string[]) => {
      const fa: Record<string, number> = {}, fb: Record<string, number> = {}
      for (const x of a) fa[x] = (fa[x] || 0) + 1
      for (const x of b) fb[x] = (fb[x] || 0) + 1
      const keys = new Set([...Object.keys(fa), ...Object.keys(fb)])
      let dot = 0, na = 0, nb = 0
      return dot / (Math.sqrt(na || 1) * Math.sqrt(nb || 1))
    }
    const target = shingles(draft)
    let best = { id: null as any, campaignId: null as any, score: 0 }
    for (const r of recent) {
      if (r.campaignId === campaignId) continue
      const content = String(r.content || '')
      if (!content) continue
      const score = cosine(target, shingles(content))
      if (score > best.score) best = { id: r.id, campaignId: r.campaignId, score }
    }
    return best
  }

  const THRESHOLD = Number(process.env.EVAL_UNIQUENESS_THRESHOLD ?? 0.0)
  if (THRESHOLD > 0) {
    let pass = 1
    let similar = await mostSimilarToRecent(ctx.id, finalProse)
    while (similar.score > THRESHOLD && pass < 3) {
      const rewrite = await chat({
        model: modelPROSE,
        system:
          'Rewrite as new copy for this exact campaign. Keep facts. Change metaphors, rhythm, phrasing. Australian plain-speak. No clichés. No headings or tables.',
        messages: [{ role: 'user', content: finalProse }],
        temperature: 0.9,
        top_p: 0.9,
        max_output_tokens: 900,
        meta: { scope: 'evaluate.rewrite', campaignId: ctx.id, pass },
      })
      finalProse = polishProseAU((rewrite || '').trim())
      finalProse = stripClichesIfAssured(finalProse, ctx, isAssuredValue)
      finalProse = harmoniseMechanicLanguage(finalProse, entryMechanicBrief)
      pass++
      similar = await mostSimilarToRecent(ctx.id, finalProse)
    }
  }

  finalProse = stripAvoided(finalProse, style)
  finalProse = enforceLexicon(finalProse, style)

  /* -------------------------- DECISION GATING FROM BOARD -------------------- */

  const { decision: gatedDecision, reds, ambers, hasCriticalRed, dealbreakers } = gateMeta
  ;(scoreboard as any).decision = gatedDecision
  if (gatedDecision !== 'GO') {
    const topFixes = [...reds, ...ambers].map(([, c]) => c.fix || '').filter(Boolean).slice(0, 6)
    const askTail = (offerIQ?.asks?.length ? ` Asks: ${offerIQ.asks.join('; ')}.` : '')
    ;(scoreboard as any).conditions = [((scoreboard as any).conditions || ''), ...topFixes].filter(Boolean).join(' ').trim() + askTail
  }

  /* -------------------------- UI meta for War Room/Export ------------------- */

  const atAGlanceOrder: Array<[keyof Scoreboard, string]> = [
    ['objectiveFit', 'Objective fit'],
    ['hookStrength', 'Hook strength'],
    ['mechanicFit', 'Entry mechanic'],
    ['frequencyPotential', 'Repeat potential'],
    ['friction', 'Hassle to enter'],
    ['rewardShape', 'How the value feels'],
    ['retailerReadiness', 'Retailer readiness'],
    ['complianceRisk', 'Compliance risk'],
    ['fulfilment', 'Fulfilment'],
    ['kpiRealism', 'KPI realism'],
  ]
  const atAGlance = atAGlanceOrder.map(([k, label]) => {
    const c = (scoreboard as any)[k] as BoardCell || { status: 'NA', why: '' }
    return { key: String(k), label, status: c.status, why: c.why, fix: (c as any).fix }
  })

  const tradeMeta = diagnosis.trade_priority === 'HIGH' && diagnosis.trade_table && diagnosis.trade_table.length
    ? { priority: 'HIGH', table: diagnosis.trade_table }
    : { priority: 'LOW', table: [] as TradeRow[] }

  const benchmarkMeta = {
    cashback: cbBench,
    prizeCountsObserved: prizeObs,
    recommendedHeroCount,
    positionVsMarket: (cbBench.sample && repAmount > 0) ? (
      cbBench.typicalAbs && repAmount < cbBench.typicalAbs ? 'BELOW_TYPICAL' :
      cbBench.typicalAbs && repAmount > cbBench.typicalAbs ? 'ABOVE_TYPICAL' :
      'AT_TYPICAL'
    ) : 'UNKNOWN'
  }
  const winsense = buildFeltWinnabilityProfile(ctx, { benchmark: rules.benchmarks ?? null })

  return {
    content: finalProse,
    meta: {
      stance: diagnosis?.stance || ctx.orientation || 'UNKNOWN',
      model: { json: modelJSON, prose: modelPROSE },
      temp: { json: Number(process.env.EVAL_DIAG_TEMP ?? 0.25), prose: Number(process.env.EVAL_TEMP ?? 0.35) },
      scoreboard,
      ruleFlex,
      ui: {
        hook: hookLine,
        hookOptions: hookShortlist,
        mechanic: mechLine,
        verdict: (scoreboard.decision || (decideFromVerdict(diagnosis?.judgement?.verdict) ?? 'GO WITH CONDITIONS')) as any,
        atAGlance,
        trade: tradeMeta,
        reflective: isPastCampaign(ctx),
        hideScoreboard: true,
        assuredValue: isAssuredValue,
        offerIQ,
        mechanicRule,
        winsense,
        research: research || null,
        benchmarks: benchmarkMeta,
        priorOpinion: priorOpinion || null,
        priorImprovement: priorImprovement || null,
        dealbreakers,
        ideationHarness: ideationHarness || null,
      },
      offerIQ,
      mechanicRule,
      winsense,
      research: research || null,
      benchmarks: benchmarkMeta,
      debug: {
        codeVersion: CODE_VERSION,
        orchestratorHash: ORCH_HASH,
        composerHash: COMP_HASH,
        heuristics: heuristicsCard ? { subs: heuristicsCard.subs, total: heuristicsCard.total, gates: heuristicsCard.gates } : null,
        strategist_prompt: strategistUser,
        opinion_prompt: opinionUser,
        diag_raw: jsonText,
        guards: { forbidHeroPrize, breadthOnly, breadthCount, reusedResearch: !!priorFramingMeta?.research }
      },
      kind: 'eval-prose-au',
      codeVersion: CODE_VERSION,
      symbolism: diagnosis.symbolism || [],
      proposition_hint: diagnosis.proposition_hint || null,
      hook_why_change: diagnosis.hook_why_change || null,
      when_reflective: isPastCampaign(ctx),
      run_again_moves: diagnosis.run_again_moves || [],
      hooksRecommended: hookShortlist,
      ideationHarness: ideationHarness || null,
    },
  }
}
