import type { Campaign, Brief } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { readWarRoomPrefsFromBrief } from './war-room-prefs.js'
import type { WarRoomPrefs } from './war-room-prefs.js'

// ---------- Brief Spec (normalized target shape) ----------
export type BriefSpec = {
  // Canonical v4 fields
  schema?: string
  briefVersion?: number

  client?: string | null
  brand?: string | null
  title?: string | null
  market?: string | null
  category?: string | null

  brandPosture?: 'LEADER' | 'FOLLOWER' | 'DISRUPTOR' | string
  brandPosition?: 'LEADER' | 'FOLLOWER' | 'DISRUPTOR' | string // legacy alias
  primaryObjective?: string | null
  objective?: string // legacy alias

  retailers?: string[] | string
  tradeIncentive?: string | null
  activationChannels?: string[] | string
  channelNotes?: string | null
  retailerTags?: string[] | string
  retailerFocusNotes?: string | null
  rewardPosture?: 'ASSURED' | 'CHANCE' | 'HYBRID' | string | null

  hook?: string | null
  mechanicOneLiner?: string | null

  heroPrize?: string | null
  heroPrizeCount?: number | string | null
  heroPrizeEnabled?: boolean
  runnerUps?: string[] | string

  typeOfPromotion?: string | null

  regulatedCategory?: boolean
  ageGate?: boolean
  startDate?: string | null // "YYYY-MM-DD" preferred
  endDate?: string | null
  calendarTheme?: string | null

  media?: string[]

  // Type-specific payloads
  gwp?: { item?: string | null; triggerQty?: number | null; cap?: 'UNLIMITED' | number | null }
  cashback?: {
    amount?: number | null
    currency?: string | null
    cap?: 'UNLIMITED' | number | null
    proofRequired?: boolean
    // NEW — banded cashback
    headline?: string | null
    bands?: Array<{ min?: number | null; max?: number | null; amount?: number | null; label?: string | null }>
  }
  moneyBackGuarantee?: { timeframeDays?: number | null; conditions?: string | null }
  priceOff?: { value?: number | null; kind?: '%' | '$' | string }
  multiBuy?: { offer?: string | null }
  loyaltyTier?: { summary?: string | null }
  skillContest?: { criteria?: string | null }
  referral?: { reward?: string | null; twoSided?: boolean }
  sampling?: { channel?: string | null; volume?: string | null }
  tradeIncentiveSpec?: { audience?: string | null; reward?: string | null }

  // Legacy/other supportive fields we still respect
  primaryKpi?: string
  secondaryKpis?: string[] | string
  prizeBudgetNotes?: string
  frictionBudget?: 'ONE_STEP' | 'TWO_STEP' | string
  bannedMechanics?: string[] | string

  // Portfolio / banner
  isPortfolio?: boolean
  bannerName?: string | null
  brands?: Array<string | { name: string; role?: string }>
  brandNotes?: string | null

  // NEW — Promotion shape & ops
  assuredValue?: boolean
  assuredItems?: string[] | string
  majorPrizeOverlay?: boolean | string | null
  proofType?: 'NONE' | 'LITE_RECEIPT' | 'FULL_RECEIPT' | 'SERIAL_NUMBER' | 'WARRANTY' | string | null
  processingTime?: 'INSTANT' | 'WITHIN_7_DAYS' | 'WITHIN_28_DAYS' | string | null
  entryMechanic?: string | null
  staffBurden?: 'ZERO' | 'LOW' | 'MEDIUM' | string | null

  // NEW — Brand lens
  brandTruths?: string[] | string
  distinctiveAssets?: {
    visual?: string[] | string
    verbal?: string[] | string
    ritual?: string[] | string
  }
  toneOfVoice?: { do?: string[] | string; dont?: string[] | string }
  nonNegotiables?: string[] | string

  // NEW — Category & competitors
  buyerTensions?: string[] | string
  purchaseTriggers?: string[] | string
  competitors?: string[] | string

  // NEW — KPI & focus
  budgetBand?: string | null
  skuFocus?: string[] | string
  audienceSummary?: string | null
  audienceAgeBand?: string | null
  audienceLifeStage?: string | null
  audienceMindset?: string | null
  audienceBehaviour?: string | null
  audienceSignals?: string[] | string

  // NEW — Breadth & tie-in
  breadthPrizeCount?: number | string | null
  totalWinners?: number | string | null
  cadenceCopy?: string | null
  rewardUnit?: 'SINGLE' | 'DOUBLE' | string | null
  ipTieIn?: {
    franchise?: string | null
    theme?: string | null
    activationType?: string | null
    eventWindow?: string | null
    partner?: string | null
    notes?: string | null
    licensed?: boolean
  } | null

  // housekeeping
  mechanicTypes?: any[]
  visuals?: any[]
  observed?: Record<string, any>

  [key: string]: any
}

export type ActivationProfile = {
  activationChannels: string[]
  channelNotes: string | null
  retailerTags: string[]
  retailerGroups: string[]
  retailerBanners: string[]
  retailerNotes: string | null
  onPremise: boolean
  grocery: boolean
  convenience: boolean
  liquorRetail: boolean
  ecommerce: boolean
  event: boolean
  digital: boolean
  rewardPosture: 'ASSURED' | 'CHANCE' | 'HYBRID'
  assuredValue: boolean
  assuredItems: string[]
  majorPrizeOverlay: boolean
  zeroStaff: boolean
  staffBurden: string | null
}

export type AudienceProfile = {
  summary: string | null
  ageBand: string | null
  lifeStage: string | null
  mindset: string | null
  behaviour: string | null
  signals: string[]
}

export type CampaignContext = {
  id: string
  clientName: string | null
  title: string
  market: string | null
  category: string | null
  brandPosition: 'LEADER' | 'FOLLOWER' | 'DISRUPTOR' | null
  mode: 'CREATE' | 'EVALUATE' | string
  status: 'DRAFT' | 'LIVE' | 'COMPLETE' | string
  startDate: string | null
  endDate: string | null
  nowISO: string
  orientation: 'PAST' | 'LIVE' | 'FUTURE' | 'UNKNOWN'
  briefRaw: string | null
  briefSpec: BriefSpec
  assets: any[]
  timingWindow: string | null
  warRoomPrefs?: WarRoomPrefs
  activationProfile: ActivationProfile
  audienceProfile: AudienceProfile
}

// ---------- helpers ----------
function toArray(v: any): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.map(x => String(x).trim()).filter(Boolean)
  if (typeof v === 'string') return v.split(',').map(s => s.trim()).filter(Boolean)
  return [String(v).trim()].filter(Boolean)
}
function toBool(v: any): boolean {
  if (typeof v === 'boolean') return v
  if (v == null) return false
  const s = String(v).toLowerCase()
  return s === 'true' || s === '1' || s === 'yes' || s === 'y' || s === 'on'
}
function toNumOrNull(v: any): number | null {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    // try clean commas and currency symbols
    const cleaned = s.replace(/[, ]+/g, '').replace(/^[^\d-]+/, '')
    const n = Number(cleaned)
    if (Number.isFinite(n)) return n
    // fallback: first number in the string (e.g., "2010 winners")
    const m = s.match(/-?\d+(?:\.\d+)?/)
    return m ? Number(m[0]) : null
  }
  return null
}
// Hardened: never call .trim on non-strings
function nonEmptyOrNull(v?: any): string | null {
  if (v == null) return null
  if (typeof v === 'string') {
    const t = v.trim()
    return t.length ? t : null
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    const s = String(v)
    return s.length ? s : null
  }
  // objects/arrays aren’t valid for these fields
  return null
}
function guardPosture(v: any): 'LEADER' | 'FOLLOWER' | 'DISRUPTOR' | null {
  const s = String(v ?? '').toUpperCase()
  return (s === 'LEADER' || s === 'FOLLOWER' || s === 'DISRUPTOR') ? (s as any) : null
}
function guardMode(v: any): 'CREATE' | 'EVALUATE' {
  const s = String(v ?? '').toUpperCase()
  return s === 'EVALUATE' ? 'EVALUATE' : 'CREATE'
}
function guardStatus(v: any): 'DRAFT' | 'LIVE' | 'COMPLETE' {
  const s = String(v ?? '').toUpperCase()
  return (s === 'LIVE' || s === 'COMPLETE') ? (s as any) : 'DRAFT'
}
function uniqueStrings(values: any[], limit?: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of values || []) {
    const s = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (limit && out.length >= limit) break
  }
  return out
}
function normalizeRewardPosture(raw: any, assuredValue: boolean): 'ASSURED' | 'CHANCE' | 'HYBRID' {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return assuredValue ? 'ASSURED' : 'CHANCE'
  }
  const token = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (!token) return assuredValue ? 'ASSURED' : 'CHANCE'
  if (token === 'ASSURED' || token === 'ASSUREDVALUE' || token === 'GUARANTEED' || token === 'CERTAIN') {
    return 'ASSURED'
  }
  if (token === 'HYBRID' || token === 'DUAL' || token === 'BLEND' || token === 'ASSUREDPLUSCHANCE') {
    return 'HYBRID'
  }
  if (token === 'CHANCE' || token === 'PRIZE' || token === 'DRAW' || token === 'WIN') {
    return 'CHANCE'
  }
  return assuredValue ? 'ASSURED' : 'CHANCE'
}
function parseISODateOrNull(v: any): string | null {
  if (v == null || v === '') return null
  const s = String(v)
  const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const isISO = /^\d{4}-\d{2}-\d{2}T/.test(s)
  if (!isYMD && !isISO) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null
}
function normalizeBrands(v: any): Array<{ name: string; role?: string }> {
  if (!v) return []
  const arr = Array.isArray(v) ? v : [v]
  return arr.map(item => {
    if (!item) return null
    if (typeof item === 'string') {
      const [name, role] = item.split(':').map(s => s.trim())
      return name ? { name, role: nonEmptyOrNull(role || null) || undefined } : null
    }
    if (typeof item === 'object') {
      const name = typeof (item as any).name === 'string' ? nonEmptyOrNull((item as any).name) : null
      const role = nonEmptyOrNull((item as any).role ?? null) || undefined
      return name ? { name, role } : null
    }
    return null
  }).filter(Boolean) as Array<{ name: string; role?: string }>
}

// NEW: robust string coercion for rendering
function safeTrim(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map((x) => safeTrim(x)).filter(Boolean).join(', ')
  try { return JSON.stringify(v) } catch { return String(v) }
}

export function orientationFromDates(
  start?: string | null,
  end?: string | null,
  now = new Date()
): 'PAST' | 'LIVE' | 'FUTURE' | 'UNKNOWN' {
  const s = start ? new Date(start) : null
  const e = end ? new Date(end) : null
  if (!s && !e) return 'UNKNOWN'
  if (e && e < now) return 'PAST'
  if (s && s > now) return 'FUTURE'
  return 'LIVE'
}

// ---------- core: normalize parsedJson into BriefSpec ----------
function normalizeBrief(input: any, row: Campaign): BriefSpec {
  const p: BriefSpec = (input && typeof input === 'object') ? { ...input } : {}

  // promote core values if missing
  p.client = nonEmptyOrNull(p.client ?? (row.clientName ?? null))
  // ensure brand falls back to clientName when missing
  p.brand = nonEmptyOrNull(p.brand ?? (row.clientName ?? null))
  p.market = nonEmptyOrNull(p.market ?? (row.market ?? null))
  p.category = nonEmptyOrNull(p.category ?? (row.category ?? null))
  p.title = nonEmptyOrNull(p.title ?? row.title)

  // posture (support legacy "brandPosition") — also fall back to campaign.brandPosition if present
  const posture = guardPosture(p.brandPosture ?? p.brandPosition ?? (row as any).brandPosition)
  p.brandPosture = (posture ?? null) as any
  p.brandPosition = p.brandPosture // keep mirror for legacy readers

  // objectives (support legacy "objective")
  p.primaryObjective = nonEmptyOrNull(p.primaryObjective ?? p.objective ?? null)

  // arrays & lists
  p.retailers = toArray(p.retailers)
  p.activationChannels = toArray((p as any).activationChannels ?? p.activationChannels)
  p.retailerTags = toArray((p as any).retailerTags ?? p.retailerTags)
  p.audienceSignals = toArray((p as any).audienceSignals ?? p.audienceSignals)
  p.runnerUps = toArray(p.runnerUps)
  p.secondaryKpis = toArray(p.secondaryKpis)
  p.bannedMechanics = toArray(p.bannedMechanics)
  p.media = Array.isArray(p.media) ? p.media.map(x => String(x).trim()).filter(Boolean) : []

  // numeric/booleans
  p.heroPrize = nonEmptyOrNull(p.heroPrize ?? null)
  p.heroPrizeCount = toNumOrNull(p.heroPrizeCount)
  p.tradeIncentive = nonEmptyOrNull(p.tradeIncentive ?? null)
  p.channelNotes = nonEmptyOrNull(p.channelNotes ?? (p as any).channelNotes ?? null)
  p.retailerFocusNotes = nonEmptyOrNull(p.retailerFocusNotes ?? (p as any).retailerFocusNotes ?? null)
  p.audienceSummary = nonEmptyOrNull(p.audienceSummary ?? (p as any).audienceSummary ?? null)
  p.audienceAgeBand = nonEmptyOrNull(p.audienceAgeBand ?? (p as any).audienceAgeBand ?? null)
  p.audienceLifeStage = nonEmptyOrNull(p.audienceLifeStage ?? (p as any).audienceLifeStage ?? null)
  p.audienceMindset = nonEmptyOrNull(p.audienceMindset ?? (p as any).audienceMindset ?? null)
  p.audienceBehaviour = nonEmptyOrNull(p.audienceBehaviour ?? (p as any).audienceBehaviour ?? null)
  p.hook = nonEmptyOrNull(p.hook ?? null)
  p.mechanicOneLiner = nonEmptyOrNull(p.mechanicOneLiner ?? null)
  p.typeOfPromotion = nonEmptyOrNull(p.typeOfPromotion ?? null)

  // compliance & timing
  p.regulatedCategory = toBool(p.regulatedCategory)
  p.ageGate = toBool(p.ageGate)
  p.startDate = parseISODateOrNull(p.startDate ?? (row.startDate ? row.startDate.toISOString() : null))
  p.endDate = parseISODateOrNull(p.endDate ?? (row.endDate ? row.endDate.toISOString() : null))
  p.calendarTheme = nonEmptyOrNull(p.calendarTheme ?? null)

  // type-specific blocks (normalize numbers & empties)
  if (p.gwp) {
    p.gwp = {
      item: nonEmptyOrNull(p.gwp.item ?? null),
      triggerQty: toNumOrNull(p.gwp.triggerQty),
      cap: (p.gwp.cap === 'UNLIMITED') ? 'UNLIMITED' : toNumOrNull(p.gwp.cap),
    }
  }
  if (p.cashback) {
    type CashBackBand = { min: number | null; max: number | null; amount: number | null; label: string | null }
    const rawBands = Array.isArray((p.cashback as any).bands) ? (p.cashback as any).bands : []
    const bands: CashBackBand[] = rawBands
      .map((r: any) => ({
        min: toNumOrNull(r?.min),
        max: toNumOrNull(r?.max),
        amount: toNumOrNull(r?.amount),
        label: nonEmptyOrNull(r?.label ?? null)
      }))
      .filter((band: CashBackBand) => (band.amount ?? 0) > 0)
    p.cashback = {
      amount: toNumOrNull(p.cashback.amount),
      currency: nonEmptyOrNull(p.cashback.currency ?? null),
      cap: (p.cashback.cap === 'UNLIMITED') ? 'UNLIMITED' : toNumOrNull(p.cashback.cap),
      proofRequired: toBool(p.cashback.proofRequired),
      headline: nonEmptyOrNull((p.cashback as any).headline ?? null),
      bands
    }
  }
  if (p.moneyBackGuarantee) {
    p.moneyBackGuarantee = {
      timeframeDays: toNumOrNull(p.moneyBackGuarantee.timeframeDays),
      conditions: nonEmptyOrNull(p.moneyBackGuarantee.conditions ?? null),
    }
  }
  if (p.priceOff) {
    p.priceOff = {
      value: toNumOrNull(p.priceOff.value),
      kind: nonEmptyOrNull(p.priceOff.kind ?? null) as any,
    }
  }
  if (p.multiBuy) {
    p.multiBuy = { offer: nonEmptyOrNull(p.multiBuy.offer ?? null) }
  }
  if (p.loyaltyTier) {
    p.loyaltyTier = { summary: nonEmptyOrNull(p.loyaltyTier.summary ?? null) }
  }
  if (p.skillContest) {
    p.skillContest = { criteria: nonEmptyOrNull(p.skillContest.criteria ?? null) }
  }
  if (p.referral) {
    p.referral = { reward: nonEmptyOrNull(p.referral.reward ?? null), twoSided: toBool(p.referral.twoSided) }
  }
  if (p.sampling) {
    p.sampling = {
      channel: nonEmptyOrNull(p.sampling.channel ?? null),
      volume: nonEmptyOrNull(p.sampling.volume ?? null),
    }
  }
  if (p.tradeIncentiveSpec) {
    p.tradeIncentiveSpec = {
      audience: nonEmptyOrNull(p.tradeIncentiveSpec.audience ?? null),
      reward: nonEmptyOrNull(p.tradeIncentiveSpec.reward ?? null),
    }
  }

  // portfolio/banner
  p.isPortfolio = toBool(p.isPortfolio)
  p.bannerName = nonEmptyOrNull(p.bannerName ?? null)
  p.brands = normalizeBrands(p.brands)
  p.brandNotes = nonEmptyOrNull(p.brandNotes ?? null)

  // NEW — Promotion shape & ops
  p.assuredValue = toBool(p.assuredValue)
  p.assuredItems = toArray(p.assuredItems)
  {
    const mpo = (p as any).majorPrizeOverlay
    p.majorPrizeOverlay = typeof mpo === 'boolean' ? mpo : nonEmptyOrNull(mpo ?? null)
  }
  p.rewardPosture = normalizeRewardPosture((p as any).rewardPosture ?? p.rewardPosture ?? null, p.assuredValue)
  p.proofType = nonEmptyOrNull(p.proofType ?? null) as any
  p.processingTime = nonEmptyOrNull(p.processingTime ?? null) as any
  p.entryMechanic = nonEmptyOrNull(p.entryMechanic ?? null)
  p.staffBurden = nonEmptyOrNull(p.staffBurden ?? null) as any

  // NEW — Brand lens
  p.brandTruths = toArray(p.brandTruths)
  const da = p.distinctiveAssets || {}
  p.distinctiveAssets = {
    visual: toArray(da.visual),
    verbal: toArray(da.verbal),
    ritual: toArray(da.ritual),
  }
  const tov = p.toneOfVoice || {}
  p.toneOfVoice = {
    do: toArray(tov.do),
    dont: toArray(tov.dont),
  }
  p.nonNegotiables = toArray(p.nonNegotiables)

  // NEW — Category & competitors
  p.buyerTensions = toArray(p.buyerTensions)
  p.purchaseTriggers = toArray(p.purchaseTriggers)
  p.competitors = toArray(p.competitors)

  // NEW — KPI & focus
  p.budgetBand = nonEmptyOrNull(p.budgetBand ?? null)
  p.skuFocus = toArray(p.skuFocus)

  // NEW — Breadth & tie-in normalization
  // Accept common aliases for total winners if present
  const tw =
    p.totalWinners ??
    (p as any).winners ??
    (p as any).winnerCount ??
    (p as any).numberOfWinners ??
    (p as any).totalPrizes ??
    (p as any).prizeCount ??
    (p as any).manyWinners ??
    null
  const heroEnabledFlag = toBool((p as any).heroPrizeEnabled)
  p.heroPrizeEnabled = heroEnabledFlag || Boolean(p.heroPrize) || (typeof p.heroPrizeCount === 'number' ? p.heroPrizeCount > 0 : false)
  p.breadthPrizeCount = toNumOrNull((p as any).breadthPrizeCount ?? p.breadthPrizeCount ?? null)
  p.totalWinners = toNumOrNull(tw)
  if (p.totalWinners == null && p.heroPrizeEnabled) {
    const hero = typeof p.heroPrizeCount === 'number' ? p.heroPrizeCount : 0
    const breadth = typeof p.breadthPrizeCount === 'number' ? p.breadthPrizeCount : 0
    const computedWinners = hero + breadth
    p.totalWinners = computedWinners > 0 ? computedWinners : null
  }
  p.cadenceCopy = nonEmptyOrNull(p.cadenceCopy ?? null)
  p.rewardUnit = (typeof (p as any).rewardUnit === 'string' && (p as any).rewardUnit.trim())
    ? (p as any).rewardUnit.trim().toUpperCase()
    : null
  if ((p as any).ipTieIn && typeof (p as any).ipTieIn === 'object') {
    const ip = (p as any).ipTieIn
    const ipNormalized = {
      franchise: nonEmptyOrNull(ip.franchise ?? null),
      theme: nonEmptyOrNull(ip.theme ?? null),
      activationType: nonEmptyOrNull(ip.activationType ?? ip.type ?? null),
      eventWindow: nonEmptyOrNull(ip.eventWindow ?? ip.releaseWindow ?? ip.window ?? null),
      partner: nonEmptyOrNull(ip.partner ?? ip.licensor ?? null),
      notes: nonEmptyOrNull(ip.notes ?? null),
      licensed: ip.licensed === true,
    }
    const hasSignal = Boolean(
      ipNormalized.franchise ||
      ipNormalized.theme ||
      ipNormalized.activationType ||
      ipNormalized.eventWindow ||
      ipNormalized.partner ||
      ipNormalized.notes ||
      ipNormalized.licensed
    )
    p.ipTieIn = hasSignal ? ipNormalized : null
  } else {
    p.ipTieIn = null
  }

  // housekeeping (preserve if present)
  if (!Array.isArray(p.mechanicTypes)) p.mechanicTypes = []
  if (!Array.isArray(p.visuals)) p.visuals = []
  if (!p.observed || typeof p.observed !== 'object') p.observed = {}

  // schema/version tagging
  p.schema = p.schema || 'trudy.v4.brief'
  p.briefVersion = typeof p.briefVersion === 'number' ? p.briefVersion : 1

  return p
}

const CHANNEL_CODE_MAP: Record<string, string> = {
  ONPREMISE: 'ON_PREMISE',
  ON_PREMISE: 'ON_PREMISE',
  VENUE: 'ON_PREMISE',
  PUB: 'ON_PREMISE',
  PUBS: 'ON_PREMISE',
  HOSPITALITY: 'ON_PREMISE',
  LIQUOR: 'LIQUOR_RETAIL',
  LIQUORSTORE: 'LIQUOR_RETAIL',
  BOTTLESHOP: 'LIQUOR_RETAIL',
  LIQUOR_RETAIL: 'LIQUOR_RETAIL',
  GROCERY: 'GROCERY',
  SUPERMARKET: 'GROCERY',
  MULTIPLE: 'GROCERY',
  CONVENIENCE: 'CONVENIENCE',
  PETROL: 'CONVENIENCE',
  CSTORE: 'CONVENIENCE',
  SERVO: 'CONVENIENCE',
  ECOM: 'ECOMMERCE',
  ECOMMERCE: 'ECOMMERCE',
  ONLINE: 'ECOMMERCE',
  DIGITAL: 'DIGITAL',
  SOCIAL: 'DIGITAL',
  EVENT: 'EVENT',
  EXPERIENTIAL: 'EVENT',
  FESTIVAL: 'EVENT',
}

const CHANNEL_LABELS: Record<string, string> = {
  ON_PREMISE: 'On-premise venues',
  LIQUOR_RETAIL: 'Liquor retail',
  GROCERY: 'Grocery multiples',
  CONVENIENCE: 'Convenience & petrol',
  ECOMMERCE: 'Ecommerce & delivery',
  DIGITAL: 'Digital-first activation',
  EVENT: 'Experiential & events',
}

const RETAILER_TAG_MAP: Record<string, { label: string; group: string }> = {
  ON_PREMISE_PUBS: { label: 'Pubs & hotels', group: 'On-premise venues' },
  ON_PREMISE_IRISH: { label: 'Irish pubs & themed venues', group: 'On-premise venues' },
  ON_PREMISE_BARS: { label: 'Bars & cocktail lounges', group: 'On-premise venues' },
  LIQUOR_DAN_MURPHYS: { label: "Dan Murphy's", group: 'Liquor retail' },
  LIQUOR_BWS: { label: 'BWS', group: 'Liquor retail' },
  LIQUOR_FIRST_CHOICE: { label: 'First Choice / Vintage Cellars', group: 'Liquor retail' },
  LIQUOR_INDEPENDENT: { label: 'Independent bottle shops', group: 'Liquor retail' },
  GROCERY_COLES: { label: 'Coles', group: 'Grocery multiples' },
  GROCERY_WOOLWORTHS: { label: 'Woolworths', group: 'Grocery multiples' },
  GROCERY_ALDI: { label: 'ALDI', group: 'Grocery multiples' },
  GROCERY_IGA: { label: 'IGA / Metcash', group: 'Grocery multiples' },
  CONVENIENCE_SERVO: { label: 'Servo / petrol (BP, Ampol, 7-Eleven)', group: 'Convenience & petrol' },
  CONVENIENCE_CHAIN: { label: 'Convenience chains (7-Eleven, NightOwl)', group: 'Convenience & petrol' },
  ECOMMERCE_DELIVERY: { label: 'Delivery apps (Uber Eats, DoorDash)', group: 'Ecommerce & delivery' },
  ECOMMERCE_RETAILER: { label: 'Retailer online (Coles / Woolworths online)', group: 'Ecommerce & delivery' },
  EVENT_FESTIVAL: { label: 'Festival / pop-up activations', group: 'Experiential & events' },
  SPECIALTY_BOUTIQUE: { label: 'Specialty / boutique retailers', group: 'Specialty retail' },
}

const KEYWORDS = {
  onPremise: ['pub', 'hotel', 'tavern', 'bar', 'taproom', 'venue', 'on-prem', 'draught', 'on tap'],
  liquor: ['dan murphy', 'bws', 'liquorland', 'first choice', 'bottle', 'bottleshop', 'cellar', 'liquor'],
  grocery: ['coles', 'woolworths', 'aldi', 'iga', 'metcash', 'supermarket'],
  convenience: ['7-eleven', 'seven eleven', 'servo', 'petrol', 'ampol', 'bp', 'caltex', 'nightowl'],
  ecommerce: ['online', 'delivery', 'uber eats', 'ubereats', 'doordash', 'menulog', 'app'],
  event: ['festival', 'event', 'activation', 'pop-up', 'fan zone', 'fan-zone'],
}

function normalizeChannelCode(value: string): string | null {
  if (!value) return null
  const raw = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '')
  if (!raw) return null
  return CHANNEL_CODE_MAP[raw] || raw
}

function normalizeRetailerTag(value: string): string | null {
  if (!value) return null
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/__+/g, '_').replace(/^_|_$/g, '')
  return cleaned || null
}

function haystackOf(parts: Array<string | string[] | null | undefined>): string {
  return parts
    .flatMap((part) => {
      if (!part) return []
      if (Array.isArray(part)) return part
      return [part]
    })
    .map((s) => String(s || '').toLowerCase())
    .filter(Boolean)
    .join(' ')
}

function matchesAny(haystack: string, needles: string[]): boolean {
  if (!haystack) return false
  for (const needle of needles) {
    if (needle && haystack.includes(needle.toLowerCase())) return true
  }
  return false
}

function ensureGroup(groups: Set<string>, code: string | null) {
  if (!code) return
  const label = CHANNEL_LABELS[code] || code
  if (label) groups.add(label)
}

export function deriveActivationProfile(spec: BriefSpec): ActivationProfile {
  const channelSet = new Set<string>()
  const rawChannels = Array.isArray(spec.activationChannels) ? spec.activationChannels : []
  for (const value of rawChannels) {
    const code = normalizeChannelCode(String(value))
    if (code) channelSet.add(code)
  }

  const tagSet = new Set<string>()
  const rawTags = Array.isArray((spec as any).retailerTags) ? (spec as any).retailerTags : []
  for (const value of rawTags) {
    const tag = normalizeRetailerTag(String(value))
    if (tag) tagSet.add(tag)
  }

  const retailerNames = Array.isArray(spec.retailers) ? spec.retailers.map((r) => String(r).trim()).filter(Boolean) : []
  const mediaSignals = Array.isArray(spec.media) ? spec.media : []
  const haystack = haystackOf([
    retailerNames,
    spec.retailerFocusNotes,
    spec.channelNotes,
    spec.entryMechanic,
    spec.mechanicOneLiner,
    spec.hook,
    spec.cadenceCopy,
    mediaSignals,
  ])

  const onPremise = channelSet.has('ON_PREMISE') ||
    Array.from(tagSet).some((tag) => tag.startsWith('ON_PREMISE')) ||
    matchesAny(haystack, KEYWORDS.onPremise)
  const liquorRetail = channelSet.has('LIQUOR_RETAIL') ||
    Array.from(tagSet).some((tag) => tag.startsWith('LIQUOR_')) ||
    matchesAny(haystack, KEYWORDS.liquor)
  const grocery = channelSet.has('GROCERY') ||
    Array.from(tagSet).some((tag) => tag.startsWith('GROCERY_')) ||
    matchesAny(haystack, KEYWORDS.grocery)
  const convenience = channelSet.has('CONVENIENCE') ||
    Array.from(tagSet).some((tag) => tag.startsWith('CONVENIENCE')) ||
    matchesAny(haystack, KEYWORDS.convenience)
  const ecommerce = channelSet.has('ECOMMERCE') ||
    Array.from(tagSet).some((tag) => tag.startsWith('ECOMMERCE')) ||
    matchesAny(haystack, KEYWORDS.ecommerce)
  const eventBased = channelSet.has('EVENT') ||
    Array.from(tagSet).some((tag) => tag.startsWith('EVENT')) ||
    matchesAny(haystack, KEYWORDS.event)
  const digital = channelSet.has('DIGITAL') ||
    matchesAny(haystack, ['digital', 'social', 'app', 'online']) ||
    mediaSignals.some((m) => typeof m === 'string' && /digital|social|search|online/i.test(m))

  // Ensure canonical channel codes if inferred from heuristics
  if (onPremise) channelSet.add('ON_PREMISE')
  if (liquorRetail) channelSet.add('LIQUOR_RETAIL')
  if (grocery) channelSet.add('GROCERY')
  if (convenience) channelSet.add('CONVENIENCE')
  if (ecommerce) channelSet.add('ECOMMERCE')
  if (eventBased) channelSet.add('EVENT')
  if (digital) channelSet.add('DIGITAL')

  const retailerGroupsSet = new Set<string>()
  const retailerBannerList: string[] = []

  for (const tag of Array.from(tagSet)) {
    const mapped = RETAILER_TAG_MAP[tag]
    if (mapped) {
      retailerBannerList.push(mapped.label)
      retailerGroupsSet.add(mapped.group)
      continue
    }
    const fallback = tag.replace(/_/g, ' ').toLowerCase()
    retailerBannerList.push(fallback.replace(/\b\w/g, (c) => c.toUpperCase()))
  }

  for (const code of Array.from(channelSet)) {
    ensureGroup(retailerGroupsSet, code)
  }

  // Blend in explicit retailer names
  for (const name of retailerNames) {
    if (name) retailerBannerList.push(name)
    const lower = name.toLowerCase()
    if (/pub|hotel|tavern/.test(lower)) retailerGroupsSet.add(CHANNEL_LABELS.ON_PREMISE)
    if (/dan murphy|bws|liquor|bottle/.test(lower)) retailerGroupsSet.add(CHANNEL_LABELS.LIQUOR_RETAIL)
    if (/coles|woolworth|aldi|iga|supermarket/.test(lower)) retailerGroupsSet.add(CHANNEL_LABELS.GROCERY)
    if (/servo|7-eleven|petrol|bp|ampol|caltex/.test(lower)) retailerGroupsSet.add(CHANNEL_LABELS.CONVENIENCE)
  }

  const activationChannels = Array.from(channelSet)
  const retailerGroups = Array.from(retailerGroupsSet).filter(Boolean)
  const retailerBanners = uniqueStrings(retailerBannerList.filter(Boolean))

  return {
    activationChannels,
    channelNotes: spec.channelNotes ?? null,
    retailerTags: Array.from(tagSet),
    retailerGroups,
    retailerBanners,
    retailerNotes: spec.retailerFocusNotes ?? null,
    onPremise,
    grocery,
    convenience,
    liquorRetail,
    ecommerce,
    event: eventBased,
    digital,
    rewardPosture: normalizeRewardPosture(spec.rewardPosture, Boolean(spec.assuredValue)),
    assuredValue: Boolean(spec.assuredValue),
    assuredItems: Array.isArray(spec.assuredItems) ? spec.assuredItems : [],
    majorPrizeOverlay: spec.majorPrizeOverlay === true,
    zeroStaff: typeof spec.staffBurden === 'string'
      ? spec.staffBurden.trim().toUpperCase() === 'ZERO' || spec.staffBurden.trim().toUpperCase() === 'NONE'
      : false,
    staffBurden: spec.staffBurden ?? null,
  }
}

export function deriveAudienceProfile(spec: BriefSpec): AudienceProfile {
  const signals = uniqueStrings([
    ...(Array.isArray(spec.audienceSignals) ? spec.audienceSignals : []),
    ...toArray((spec as any).audience),
    ...toArray((spec as any).targetAudience),
    ...toArray((spec as any).target),
    ...toArray((spec as any).audienceSegments),
    ...(Array.isArray(spec.buyerTensions) ? spec.buyerTensions : []),
  ], 12)

  return {
    summary: spec.audienceSummary ?? null,
    ageBand: spec.audienceAgeBand ?? null,
    lifeStage: spec.audienceLifeStage ?? null,
    mindset: spec.audienceMindset ?? null,
    behaviour: spec.audienceBehaviour ?? null,
    signals,
  }
}

// ---------- context builders ----------
export function buildCampaignContext(row: Campaign & { brief?: Brief | null }): CampaignContext {
  const spec = normalizeBrief(row.brief?.parsedJson, row)

  const start = (spec.startDate ?? null) as string | null
  const end = (spec.endDate ?? null) as string | null
  const activationProfile = deriveActivationProfile(spec)
  const audienceProfile = deriveAudienceProfile(spec)

  return {
    id: row.id,
    clientName: row.clientName,
    title: row.title,
    market: row.market,
    category: row.category,
    // brandPosition falls back to campaign.brandPosition if brief posture not present
    brandPosition: guardPosture(spec.brandPosture) ?? guardPosture((row as any).brandPosition) ?? null,
    mode: guardMode(row.mode as any),
    status: guardStatus(row.status as any),
    startDate: start,
    endDate: end,
    nowISO: new Date().toISOString(),
    orientation: orientationFromDates(start, end),
    briefRaw: row.brief?.rawText || null,
    briefSpec: spec,
    assets: [],
    timingWindow: (start && end) ? `${start} — ${end}` : null,
    warRoomPrefs: readWarRoomPrefsFromBrief(row.brief),
    activationProfile,
    audienceProfile,
  }
}

// Fetch + build a full CampaignContext for a given id
export async function getCampaignContext(id: string): Promise<CampaignContext | null> {
  const row = await prisma.campaign.findUnique({
    where: { id },
    include: { brief: true },
  })
  return row ? buildCampaignContext(row) : null
}

// ---------- human-readable snapshot ----------
export function renderBriefSnapshot(ctx: CampaignContext): string {
  const s = ctx.briefSpec || {}
  const parts: string[] = []

  parts.push(`Client: ${safeTrim(ctx.clientName) || 'n/a'}`)
  parts.push(`Title: ${safeTrim(ctx.title)}`)
  parts.push(`Market: ${safeTrim(ctx.market) || 'n/a'} | Category: ${safeTrim(ctx.category) || 'n/a'}`)
  if (ctx.timingWindow) parts.push(`Timing: ${safeTrim(ctx.timingWindow)}`)
  parts.push(`Orientation: ${safeTrim(ctx.orientation)}`)

  // Portfolio/banner
  if (s.isPortfolio || (Array.isArray(s.brands) && s.brands.length) || s.bannerName) {
    if (s.bannerName) parts.push(`Banner: ${safeTrim(s.bannerName)}`)
    const brandList = (Array.isArray(s.brands) ? s.brands : []).map((b: any) => {
      const name = typeof b === 'string' ? b : String(b?.name || '').trim()
      const role = typeof b === 'object' && b?.role ? ` (${String(b.role)})` : ''
      return name ? `${name}${role}` : ''
    }).filter(Boolean)
    if (brandList.length) parts.push(`Participating brands: ${safeTrim(brandList)}`)
    if (s.brandNotes) parts.push(`Brand notes: ${safeTrim(s.brandNotes)}`)
  }

  // Core
  if (s.hook) parts.push(`Hook: ${safeTrim(s.hook)}`)
  if (s.mechanicOneLiner) parts.push(`Mechanic: ${safeTrim(s.mechanicOneLiner)}`)

  // Objectives (v4 + legacy)
  const obj = s.primaryObjective || s.objective
  if (obj) parts.push(`Objective: ${safeTrim(obj)}`)

  // KPIs
  if (s.primaryKpi) parts.push(`Primary KPI: ${safeTrim(s.primaryKpi)}`)
  const sk = toArray(s.secondaryKpis)
  if (sk.length) parts.push(`Secondary KPIs: ${safeTrim(sk.join(' | '))}`)
  if (s.budgetBand) parts.push(`Budget: ${safeTrim(s.budgetBand)}`)
  const sku = toArray(s.skuFocus)
  if (sku.length) parts.push(`SKU focus: ${safeTrim(sku.join(', '))}`)

  // Retailers / Trade
  const rs = toArray(s.retailers)
  if (rs.length) parts.push(`Retailers: ${safeTrim(rs.join(', '))}`)
  if (s.tradeIncentive) parts.push(`Trade incentive: ${safeTrim(s.tradeIncentive)}`)
  const activation = ctx.activationProfile
  if (activation?.activationChannels?.length) {
    const channelLabels = activation.activationChannels
      .map((code) => CHANNEL_LABELS[code] || code.replace(/_/g, ' '))
    parts.push(`Activation channels: ${safeTrim(channelLabels.join(', '))}`)
  }
  if (activation?.retailerGroups?.length) {
    parts.push(`Retail focus: ${safeTrim(activation.retailerGroups.join(', '))}`)
  }
  if (activation?.rewardPosture) {
    const postureText = activation.rewardPosture === 'ASSURED'
      ? 'Assured (guaranteed reward)'
      : activation.rewardPosture === 'HYBRID'
        ? 'Hybrid (assured + hero overlay)'
        : 'Chance to win'
    parts.push(`Reward posture: ${postureText}`)
  }
  if (activation?.retailerNotes) {
    parts.push(`Retail notes: ${safeTrim(activation.retailerNotes)}`)
  }

  // Promo type & prizes
  if (s.typeOfPromotion) parts.push(`Promotion type: ${safeTrim(s.typeOfPromotion)}`)
  if (s.heroPrize) parts.push(`Hero prize: ${safeTrim(s.heroPrize)}${s.heroPrizeCount ? ` x${safeTrim(s.heroPrizeCount)}` : ''}`)
  const ru = toArray(s.runnerUps)
  if (ru.length) parts.push(`Runner-ups: ${safeTrim(ru.join(', '))}`)

  // Breadth & cadence & unit
  if (s.totalWinners != null) parts.push(`Total winners: ${safeTrim(s.totalWinners)}`)
  if (s.breadthPrizeCount != null) parts.push(`Breadth winners: ${safeTrim(s.breadthPrizeCount)}`)
  if (s.rewardUnit) parts.push(`Reward unit: ${safeTrim(s.rewardUnit)}`)
  if (s.cadenceCopy) parts.push(`Cadence: ${safeTrim(s.cadenceCopy)}`)

  // Tie-in / IP
  if (s.ipTieIn?.franchise || s.ipTieIn?.theme || s.ipTieIn?.activationType || s.ipTieIn?.eventWindow || s.ipTieIn?.partner) {
    const headline = [s.ipTieIn?.franchise, s.ipTieIn?.theme].filter(Boolean).join(' — ')
    const details = [
      s.ipTieIn?.activationType ? `type: ${safeTrim(s.ipTieIn.activationType)}` : '',
      s.ipTieIn?.eventWindow ? `window: ${safeTrim(s.ipTieIn.eventWindow)}` : '',
      s.ipTieIn?.partner ? `partner: ${safeTrim(s.ipTieIn.partner)}` : '',
    ].filter(Boolean).join(' | ')
    const base = [headline, details].filter(Boolean).join(' | ')
    const status = s.ipTieIn?.licensed ? 'licensed' : 'pending'
    parts.push(`Tie-in (${status}): ${safeTrim(base)}`)
    if (s.ipTieIn?.notes) parts.push(`Tie-in notes: ${safeTrim(s.ipTieIn.notes)}`)
  }

  // Compliance & media
  if (typeof s.regulatedCategory === 'boolean') parts.push(`Regulated category: ${s.regulatedCategory ? 'Yes' : 'No'}`)
  if (typeof s.ageGate === 'boolean') parts.push(`Age gate: ${s.ageGate ? 'Yes' : 'No'}`)
  if (s.calendarTheme) parts.push(`Calendar theme: ${safeTrim(s.calendarTheme)}`)
  if (Array.isArray(s.media) && s.media.length) parts.push(`Media: ${safeTrim(s.media.join(', '))}`)

  // Type-specific quick lines
  if (s.cashback && (s.cashback.amount != null || s.cashback.cap || s.cashback.currency || (s.cashback as any).headline || (s.cashback as any).bands?.length)) {
    const cap = s.cashback.cap === 'UNLIMITED' ? 'UNLIMITED' : (s.cashback.cap ?? null)
    const head = (s.cashback as any).headline ? ` | Headline: ${(s.cashback as any).headline}` : ''
    parts.push(
      `Cashback: ${safeTrim(s.cashback.amount ?? '?')} ${safeTrim(s.cashback.currency ?? '')}` +
      `${cap ? ` | Cap: ${safeTrim(cap)}` : ''}` +
      `${s.cashback.proofRequired ? ' | Proof required' : ''}` +
      head
    )
    const bands = (s.cashback as any).bands || []
    if (Array.isArray(bands) && bands.length) {
      const lines = bands.map((b: any) => {
        const range =
          (b.min != null || b.max != null)
            ? `${b.min != null ? `$${b.min}` : ''}${(b.min != null || b.max != null) ? '–' : ''}${b.max != null ? `$${b.max}` : '+'}`
            : ''
        return `${range ? range + ': ' : ''}$${b.amount}${b.label ? ` (${b.label})` : ''}`
      })
      parts.push(`Cashback bands: ${lines.join(' | ')}`)
    }
  }
  if (s.gwp && (s.gwp.item || s.gwp.triggerQty != null || s.gwp.cap != null)) {
    parts.push(`GWP: ${safeTrim(s.gwp.item ?? '?')}${s.gwp.triggerQty ? ` | Trigger: ${safeTrim(s.gwp.triggerQty)}` : ''}${s.gwp.cap != null ? ` | Cap: ${safeTrim(s.gwp.cap)}` : ''}`)
  }
  if (s.moneyBackGuarantee && (s.moneyBackGuarantee.timeframeDays != null || s.moneyBackGuarantee.conditions)) {
    parts.push(`MBG: ${safeTrim(s.moneyBackGuarantee.timeframeDays ?? '?')} days${s.moneyBackGuarantee.conditions ? ` | ${safeTrim(s.moneyBackGuarantee.conditions)}` : ''}`)
  }
  if (s.priceOff && (s.priceOff.value != null || s.priceOff.kind)) {
    parts.push(`Price Off: ${safeTrim(s.priceOff.value ?? '?')}${safeTrim(s.priceOff.kind ?? '')}`)
  }
  if (s.multiBuy?.offer) parts.push(`Multi-buy: ${safeTrim(s.multiBuy.offer)}`)
  if (s.loyaltyTier?.summary) parts.push(`Loyalty: ${safeTrim(s.loyaltyTier.summary)}`)
  if (s.skillContest?.criteria) parts.push(`Skill contest: ${safeTrim(s.skillContest.criteria)}`)
  if (s.referral && (s.referral.reward || typeof s.referral.twoSided === 'boolean')) {
    parts.push(`Referral: ${safeTrim(s.referral.reward ?? 'n/a')}${s.referral.twoSided ? ' (two-sided)' : ''}`)
  }
  if (s.sampling && (s.sampling.channel || s.sampling.volume)) {
    parts.push(`Sampling: ${safeTrim([s.sampling.channel, s.sampling.volume].filter(Boolean).join(' | '))}`)
  }
  if (s.tradeIncentiveSpec && (s.tradeIncentiveSpec.audience || s.tradeIncentiveSpec.reward)) {
    parts.push(`Trade incentive (spec): ${safeTrim([s.tradeIncentiveSpec.audience, s.tradeIncentiveSpec.reward].filter(Boolean).join(' → '))}`)
  }

  // NEW — Promotion shape & ops summary
  if (s.assuredValue) {
    const items = toArray(s.assuredItems)
    parts.push(`Assured value: Everyone gets ${items.length ? safeTrim(items.join(', ')) : 'a defined item'}`)
  }
  if (typeof s.majorPrizeOverlay === 'boolean') {
    parts.push(`Major prize overlay: ${s.majorPrizeOverlay ? 'Yes' : 'No'}`)
  } else if (s.majorPrizeOverlay) {
    parts.push(`Major prize overlay: ${safeTrim(s.majorPrizeOverlay)}`)
  }
  if (s.entryMechanic) parts.push(`Entry: ${safeTrim(s.entryMechanic)}`)
  if (s.proofType || s.processingTime || s.staffBurden) {
    const bits = [s.proofType, s.processingTime, s.staffBurden].filter(Boolean).map(safeTrim)
    if (bits.length) parts.push(`Ops: ${bits.join(' • ')}`)
  }

  // NEW — Brand lens snapshot
  const bt = toArray(s.brandTruths)
  if (bt.length) parts.push(`Brand truths: ${safeTrim(bt.join('; '))}`)
  const daV = toArray(s?.distinctiveAssets?.visual)
  const daVerb = toArray(s?.distinctiveAssets?.verbal)
  const daRit = toArray(s?.distinctiveAssets?.ritual)
  if (daV.length || daVerb.length || daRit.length) {
    const ds: string[] = []
    if (daV.length) ds.push(`Visual: ${safeTrim(daV.join(', '))}`)
    if (daVerb.length) ds.push(`Verbal: ${safeTrim(daVerb.join(', '))}`)
    if (daRit.length) ds.push(`Ritual: ${safeTrim(daRit.join(', '))}`)
    parts.push(`Distinctive assets: ${ds.join(' | ')}`)
  }
  const td = toArray(s?.toneOfVoice?.do)
  const tdn = toArray(s?.toneOfVoice?.dont)
  if (td.length || tdn.length) {
    if (td.length) parts.push(`Tone — do: ${safeTrim(td.join(', '))}`)
    if (tdn.length) parts.push(`Tone — don't: ${safeTrim(tdn.join(', '))}`)
  }
  const nn = toArray(s.nonNegotiables)
  if (nn.length) parts.push(`Non-negotiables: ${safeTrim(nn.join(', '))}`)

  // NEW — Category & competitors
  const btens = toArray(s.buyerTensions)
  if (btens.length) parts.push(`Buyer tensions: ${safeTrim(btens.join('; '))}`)
  const ptrigs = toArray(s.purchaseTriggers)
  if (ptrigs.length) parts.push(`Purchase triggers: ${safeTrim(ptrigs.join(', '))}`)
  const comps = toArray(s.competitors)
  if (comps.length) parts.push(`Competitors: ${safeTrim(comps.join(', '))}`)

  // Legacy odds & ends
  if (s.prizeBudgetNotes) parts.push(`Prize notes: ${safeTrim(s.prizeBudgetNotes)}`)
  if (s.frictionBudget) parts.push(`Friction budget: ${safeTrim(s.frictionBudget)}`)
  const bm = toArray(s.bannedMechanics)
  if (bm.length) parts.push(`Banned mechanics: ${safeTrim(bm.join(', '))}`)
  if (s.brandPosture) parts.push(`Brand posture: ${safeTrim(s.brandPosture)}`)

  const audienceProfile = ctx.audienceProfile
  if (audienceProfile?.summary) {
    parts.push(`Audience: ${safeTrim(audienceProfile.summary)}`)
  }
  const personaBits: string[] = []
  if (audienceProfile?.ageBand) personaBits.push(`Age ${safeTrim(audienceProfile.ageBand)}`)
  if (audienceProfile?.lifeStage) personaBits.push(safeTrim(audienceProfile.lifeStage))
  if (audienceProfile?.mindset) personaBits.push(safeTrim(audienceProfile.mindset))
  if (audienceProfile?.behaviour) personaBits.push(safeTrim(audienceProfile.behaviour))
  if (personaBits.length) {
    parts.push(`Audience cues: ${personaBits.join(' · ')}`)
  }
  if (audienceProfile?.signals?.length) {
    const signals = audienceProfile.signals.slice(0, 5)
    parts.push(`Audience signals: ${safeTrim(signals.join(' | '))}`)
  }

  if (ctx.briefRaw) {
    parts.push('')
    parts.push('Notes:')
    parts.push(safeTrim(ctx.briefRaw))
  }
  return parts.join('\n')
}
