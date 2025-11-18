// apps/backend/src/lib/research.ts
import type { CampaignContext } from './context.js'
import { normaliseMarketCode } from './campaign-rules.js'
import { prisma } from '../db/prisma.js'
import { resolveModel } from './models.js'
import { chat } from './openai.js' // used only when RESEARCH_USE_LLM=1
import { logLlmInsight, getBrandDossierHints } from './knowledge-grid.js'

export type ResearchLevel = 'LITE' | 'DEEP' | 'MAX'

export type Fact = { claim: string; source: string }

export type CompetitorPromo = {
  brand: string
  title?: string | null
  headline?: string | null
  url: string
  source: string
  type?: 'CASHBACK' | 'PRIZE' | 'GWP' | 'OTHER'
  heroCount?: number | null
  totalWinners?: number | null
  cadence?: string | null // e.g., 'weekly', 'instant', 'daily'
  prizeItems?: string[]
  prizeValueHint?: string | null // e.g., '$1000', '$100 cashback'
  confidence?: number // 0–1 (very rough)
  viaRedemption?: boolean | null
  giftCard?: string | null // e.g., '$100 gift card'
}

export type ResearchBenchmarks = {
  // Back-compat + internal helpers
  heroPrize?: {
    median: number | null
    mode: number | null
  }
  cadenceShare?: {
    instant: number
    weekly: number
    daily: number
  }
  manyWinnersShare?: number // share of promos with >= 100 winners
  cashbackAbs?: {
    median: number | null
    p25: number | null
    p75: number | null
    sampleSize: number
  }

  // Export-facing fields
  cashback?: {
    sample: number
    typicalAbs?: number | null
    typicalPct?: number | null
    maxAbs?: number | null
    maxPct?: number | null
  }
  prizeCountsObserved?: {
    total: number
    common: Array<{ count: number; share: number }>
  }
  recommendedHeroCount?: number
  positionVsMarket?: 'ABOVE_TYPICAL' | 'AT_TYPICAL' | 'BELOW_TYPICAL' | 'UNKNOWN'
}

export type ResearchInsightEntry = { text: string; source?: string }

export type ResearchInsights = {
  brand?: ResearchInsightEntry[]
  audience?: ResearchInsightEntry[]
  retailers?: ResearchInsightEntry[]
  market?: ResearchInsightEntry[]
  signals?: ResearchInsightEntry[]
  competitors?: ResearchInsightEntry[]
}

export type ResearchDossier = {
  brandTruths: ResearchInsightEntry[]
  shopperTensions: ResearchInsightEntry[]
  retailerReality: ResearchInsightEntry[]
  competitorMoves: ResearchInsightEntry[]
  categorySignals: ResearchInsightEntry[]
  benchmarks: ResearchInsightEntry[]
}

export type ResearchPack = {
  brand: {
    query: string | null
    summary?: string
    facts: Fact[]
  }
  audience: {
    notes?: string
    facts: Fact[]
  }
  category: {
    query: string | null
    summary?: string
    facts: Fact[]
  }
  competitors: {
    names: string[]
    facts: Fact[]
    promos: CompetitorPromo[]
  }
  retailers: {
    names: string[]
    facts: Fact[]
  }
  season: {
    label: string | null
    facts: Fact[]
  }
  market: {
    facts: Fact[]
  }
  signals: {
    facts: Fact[]
  }
  benchmarks?: ResearchBenchmarks
  meta: {
    level: ResearchLevel
    warnings?: string[]
    searchProvider?: string
    usedFallbacks?: string[]
    cachedAt?: string
    logs?: string[] // only when DEBUG_RESEARCH truthy
  }
  insights?: ResearchInsights
  dossier?: ResearchDossier
}

/**
 * Uses Node's global fetch (Node 18+). No external deps by default.
 * Optional search providers supported via env vars:
 *  - SERPER_API_KEY (https://serper.dev) → Google-like JSON
 *  - BRAVE_API_KEY  (https://api.search.brave.com) → JSON
 * If neither exists, we do best-effort direct fetches to known pages or LLM propose→verify when enabled.
 */
const fetchFn: typeof fetch | undefined = (globalThis as any).fetch

const SERPER = process.env.SERPER_API_KEY
const SERPER_GL_ENV = (process.env.SERPER_GL || 'au').toLowerCase()
const SERPER_HL_ENV = (process.env.SERPER_HL || 'en').toLowerCase()
const BRAVE  = process.env.BRAVE_API_KEY

const DEBUG = String(process.env.DEBUG_RESEARCH || '').toLowerCase() === 'true'
const USE_LLM = String(process.env.RESEARCH_USE_LLM || '').toLowerCase() === '1'
const ENABLE_RESEARCH_EDITOR = String(process.env.RESEARCH_EDITOR ?? '1').toLowerCase() !== '0'
const ENABLE_BEHAVIOURAL_SEARCH = String(process.env.RESEARCH_BEHAVIOURAL_QUERIES || '').toLowerCase() === '1'
const MAX_URLS_MAX = Number(process.env.RESEARCH_MAX_URLS || 0) || 90
const CONCURRENCY = Math.max(2, Math.min(12, Number(process.env.RESEARCH_CONCURRENCY || 0) || 6))

const RESEARCH_CACHE_KEY = '__researchCache'
const RESEARCH_CACHE_VERSION = 'v3'
const RESEARCH_CACHE_TTL_MS = Number(process.env.RESEARCH_CACHE_TTL_MS || 6 * 60 * 60 * 1000)

type ResearchCacheEnvelope = {
  version: string
  values: Record<ResearchLevel, { cachedAt: string; pack: ResearchPack }>
}

async function loadCachedResearch(campaignId: string, level: ResearchLevel): Promise<ResearchPack | null> {
  if (!campaignId) return null
  try {
    const brief = await prisma.brief.findUnique({ where: { campaignId }, select: { assets: true } })
    const assets = (brief?.assets || null) as Record<string, any> | null
    if (!assets || typeof assets !== 'object') return null
    const cache = assets[RESEARCH_CACHE_KEY] as ResearchCacheEnvelope | undefined
    if (!cache || cache.version !== RESEARCH_CACHE_VERSION) return null
    const entry = cache.values?.[level]
    if (!entry || !entry.cachedAt || !entry.pack) return null
    if (RESEARCH_CACHE_TTL_MS > 0) {
      const ageMs = Date.now() - new Date(entry.cachedAt).getTime()
      if (Number.isFinite(ageMs) && ageMs > RESEARCH_CACHE_TTL_MS) return null
    }
    console.info(JSON.stringify({
      type: 'research.cache.hit',
      campaignId,
      level,
      cached_at: entry.cachedAt,
    }))
    const pack = entry.pack
    const withMeta = {
      ...pack,
      meta: { ...(pack.meta || { level }), cachedAt: entry.cachedAt } as ResearchPack['meta'],
    }
    return withMeta
  } catch (err: any) {
    console.error(JSON.stringify({
      type: 'research.cache.error',
      stage: 'load',
      campaignId,
      level,
      error: err?.message || String(err),
    }))
    return null
  }
}

async function saveCachedResearch(campaignId: string, level: ResearchLevel, pack: ResearchPack): Promise<void> {
  try {
    const brief = await prisma.brief.findUnique({ where: { campaignId }, select: { assets: true } })
    if (!brief) return
    const rawAssets = (brief.assets || null) as Record<string, any> | null
    const assets = rawAssets && typeof rawAssets === 'object' ? { ...rawAssets } : {}
    const existing = (assets[RESEARCH_CACHE_KEY] as ResearchCacheEnvelope | undefined) || {
      version: RESEARCH_CACHE_VERSION,
      values: {} as Record<ResearchLevel, { cachedAt: string; pack: ResearchPack }>,
    }
    if (existing.version !== RESEARCH_CACHE_VERSION) {
      existing.version = RESEARCH_CACHE_VERSION
      existing.values = {} as Record<ResearchLevel, { cachedAt: string; pack: ResearchPack }>
    }
    const cachedAt = pack?.meta?.cachedAt || new Date().toISOString()
    const stampedPack: ResearchPack = {
      ...pack,
      meta: { ...(pack.meta || { level }), cachedAt },
    }
    existing.values[level] = { cachedAt, pack: stampedPack }
    assets[RESEARCH_CACHE_KEY] = existing
    await prisma.brief.update({ where: { campaignId }, data: { assets } })
    console.info(JSON.stringify({
      type: 'research.cache.store',
      campaignId,
      level,
      cached_at: cachedAt,
    }))
  } catch (err: any) {
    console.error(JSON.stringify({
      type: 'research.cache.error',
      stage: 'store',
      campaignId,
      level,
      error: err?.message || String(err),
    }))
  }
}

/* ------------------------ Category-aware seed defaults ------------------------ */

// Appliances (AU)
const DEFAULT_RETAILERS_AU = [
  'Harvey Norman', 'JB Hi-Fi', 'The Good Guys', 'Bing Lee', 'Appliances Online'
]
const DEFAULT_APPLIANCE_COMPETITORS = [
  'Samsung', 'LG', 'Bosch', 'Electrolux', 'Haier', 'Miele', 'Siemens'
]

// Liquor-aware defaults (AU)
const DEFAULT_LIQUOR_RETAILERS_AU = [
  "Dan Murphy's", 'BWS', 'Liquorland', 'First Choice Liquor', 'Vintage Cellars',
  'Cellarbrations', 'Bottlemart', 'IGA Liquor'
]
const DEFAULT_WINE_COMPETITORS = [
  "Penfolds", "Jacob's Creek", "Wolf Blass", 'McGuigan',
  'Yellow Tail', 'Brown Brothers', "Lindeman's", 'Hardys',
  'Taylors Wines', 'Grant Burge'
]
const DEFAULT_BEER_COMPETITORS = [
  'Asahi', 'Carlton & United Breweries', 'CUB', 'Lion', 'Heineken',
  'Coopers', 'James Squire', 'Balter', '4 Pines', 'Stone & Wood',
  'Great Northern', 'Tooheys', 'XXXX', 'Hahn'
]
const DEFAULT_SPIRITS_COMPETITORS = [
  'Smirnoff', 'Johnnie Walker', 'Absolut', 'Tanqueray', 'Bacardi',
  'Bundaberg Rum', "Jack Daniel's", 'Jim Beam'
]
const DEFAULT_CIDER_COMPETITORS = [
  'Somersby', 'Strongbow', 'Bulmers', '5 Seeds', 'Little Green'
]
const DEFAULT_RTD_COMPETITORS = [
  'Vodka Cruiser', 'Canadian Club', 'UDL', 'Jim Beam & Cola', "Jack Daniel's & Cola"
]

// Energy drinks (AU) — FMCG retail & convenience
const DEFAULT_ENERGY_RETAILERS_AU = [
  'Coles', 'Woolworths', 'ALDI', 'IGA', '7-Eleven', 'OTR', 'BP', 'Ampol', 'Caltex', 'Drakes'
]
const DEFAULT_ENERGY_COMPETITORS = [
  'Red Bull', 'Monster Energy', 'V Energy', 'Mother Energy', 'Rockstar Energy', 'Prime Energy', 'NOS Energy'
]

// Telco (AU)
const DEFAULT_TELCO_RETAILERS_AU = ['Telstra', 'Optus', 'Vodafone', 'JB Hi-Fi', 'Harvey Norman']
const DEFAULT_TELCO_COMPETITORS = ['Telstra', 'Optus', 'Vodafone', 'iiNet', 'TPG', 'Belong', 'Boost Mobile', 'Amaysim']

// Insurance (AU)
const DEFAULT_INSURANCE_RETAILERS_AU = ['AAMI', 'NRMA Insurance', 'Allianz', 'Youi', 'Budget Direct', 'QBE']
const DEFAULT_INSURANCE_COMPETITORS = ['AAMI', 'NRMA Insurance', 'Allianz', 'Youi', 'Budget Direct', 'QBE', 'Suncorp']

// Banking (AU)
const DEFAULT_BANKING_RETAILERS_AU = ['Commonwealth Bank', 'Westpac', 'NAB', 'ANZ']
const DEFAULT_BANKING_COMPETITORS = DEFAULT_BANKING_RETAILERS_AU

// QSR (AU)
const DEFAULT_QSR_RETAILERS_AU = ["McDonald's", 'KFC', "Hungry Jack's", "Domino's", 'Subway', 'Guzman y Gomez']
const DEFAULT_QSR_COMPETITORS = DEFAULT_QSR_RETAILERS_AU

// Beauty/Pharmacy (AU)
const DEFAULT_BEAUTY_RETAILERS_AU = ['Priceline', 'Chemist Warehouse', 'MECCA', 'Sephora', 'Myer']
const DEFAULT_BEAUTY_COMPETITORS = [
  "L'Oréal", 'Maybelline', 'Revlon', 'Estee Lauder', 'The Ordinary', 'La Roche-Posay'
]

// Pet (AU)
const DEFAULT_PET_RETAILERS_AU = ['Petbarn', 'PETstock', 'Greencross Vets', 'Coles', 'Woolworths']
const DEFAULT_PET_COMPETITORS = ['Pedigree', 'Whiskas', 'Fancy Feast', 'Royal Canin', 'Advance', "Hill’s"]

// Coffee/Dairy/Cheese/Snacks (AU)
const DEFAULT_GROCERY_RETAILERS_AU = ['Coles', 'Woolworths', 'ALDI', 'IGA']
const CORE_RETAILER_TOKENS = ['coles', 'woolworths', 'aldi', 'iga', 'kmart', 'bigw', 'harveynorman', 'jb', 'danmurphys', 'bws', 'liquorland']
const DEFAULT_COFFEE_COMPETITORS = ['Nescafé', 'Lavazza', 'Moccona', 'Vittoria Coffee']
const DEFAULT_DAIRY_COMPETITORS  = ['Devondale', 'Pauls', 'Dairy Farmers', 'Murray Goulburn']
const DEFAULT_CHEESE_COMPETITORS = ['Bega', 'Mainland', 'Devondale', 'Castello', 'Kraft']
const DEFAULT_SNACKS_COMPETITORS = ["Smith’s", 'Doritos', 'Pringles', 'Kettle', 'Arnotts']
const DEFAULT_DESSERT_COMPETITORS = [
  'Rokeby Farms',
  "Priestley’s Gourmet Delights",
  "Jillian's Cakery",
  'Belle Fleur',
  'Beak & Johnston',
  "Carman's",
  "Pauls PLUS+",
  'Chobani',
  'Sara Lee'
]

// Soft blocklist for low-cred/user-generated/social (prevents Reddit/etc. leaks)
const DOMAIN_BLOCKLIST = [
  'reddit.com', 'www.reddit.com',
  'x.com', 'twitter.com', 'mobile.twitter.com',
  'tiktok.com', 'www.tiktok.com',
  'pinterest.com', 'www.pinterest.com',
  'facebook.com', 'www.facebook.com',
  'instagram.com', 'www.instagram.com',
]

// Known AU liquor retailer hosts (used as a light allow-hint in alcohol context)
const LIQUOR_RETAILER_HOSTS = new Set<string>([
  'danmurphys.com.au', 'bws.com.au', 'liquorland.com.au', 'firstchoiceliquor.com.au',
  'vintagecellars.com.au', 'cellarbrations.com.au', 'bottlemart.com.au', 'iga.com.au'
])

const ON_PREMISE_TOKENS = ['pub', 'bar', 'hotel', 'tavern', 'on-prem', 'on premise', 'on-premise', 'hospitality', 'venue']
const ECOM_HOST_HINTS = ['coles', 'woolworths', 'liquorland', 'danmurphys', 'firstchoiceliquor', 'vintagecellars', 'bottlemart', 'ubereats', 'deliveroo', 'menulog', 'amazon', 'catch.com.au']

const AUDIENCE_HOST_ALLOWLIST = [
  'abs.gov.au','australia.gov.au','apra.gov.au','asic.gov.au','acma.gov.au','accc.gov.au','apsc.gov.au','dfat.gov.au','treasury.gov.au','dese.gov.au',
  'mccrindle.com.au','deloitte.com','pwc.com','kpmg.com','ey.com','ibisworld.com','nielsen.com','mintel.com','statista.com',
  'forrester.com','gartner.com','insidefmcg.com.au','insideretail.com.au','retail.org.au','foodanddrinkbusiness.com.au','ausfoodnews.com.au',
  'canstar.com.au','finder.com.au','commbank.com.au','westpac.com.au','anz.com','nab.com.au','visa.com','mastercard.com'
]

const MARKET_HOST_ALLOWLIST = [
  'abs.gov.au','australia.gov.au','apra.gov.au','asic.gov.au','accc.gov.au','acma.gov.au','dfat.gov.au','treasury.gov.au',
  'deloitte.com','pwc.com','kpmg.com','ey.com','ibisworld.com','nielsen.com','mintel.com','statista.com','bain.com','mckinsey.com','bcg.com',
  'insidefmcg.com.au','insideretail.com.au','retail.org.au','foodanddrinkbusiness.com.au','ausfoodnews.com.au','supermarketnews.com.au',
  'colesgroup.com.au','woolworthsgroup.com.au','metcash.com','harveynorman.com.au'
]

/* ------------------------------- small utils ------------------------------ */

function safe(s: any) {
  if (s == null) return ''
  if (typeof s === 'string') return s.trim()
  try { return JSON.stringify(s) } catch { return String(s) }
}
function host(u: string) {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}
function uniqBy<T>(xs: T[], key: (x: T) => string) {
  const seen = new Set<string>()
  const out: T[] = []
  for (const x of xs) {
    const k = key(x)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(x)
  }
  return out
}
function capArr<T>(xs: T[], n: number) { return (xs || []).slice(0, n) }
function numOrNull(n: any): number | null {
  const v = Number(String(n).replace(/[^\d.-]/g, ''))
  return Number.isFinite(v) ? v : null
}
function median(ns: number[]): number | null {
  const arr = ns.slice().sort((a,b)=>a-b)
  if (!arr.length) return null
  const mid = Math.floor(arr.length / 2)
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2
}
function quantile(ns: number[], q: number): number | null {
  if (!ns.length) return null
  const arr = ns.slice().sort((a,b)=>a-b)
  const pos = (arr.length - 1) * q
  const base = Math.floor(pos)
  const rest = pos - base
  if (arr[base + 1] !== undefined) return arr[base] + rest * (arr[base + 1] - arr[base])
  return arr[base]
}
function modeNumber(ns: number[]): number | null {
  if (!ns.length) return null
  const freq: Record<number, number> = {}
  for (const n of ns) freq[n] = (freq[n] || 0) + 1
  let best = 0, value: number | null = null
  for (const [k,v] of Object.entries(freq)) {
    if (v > best) { best = v; value = Number(k) }
  }
  return value
}

function detectOnPremiseCampaign(retailers: string[], channels: string[], brief: any): boolean {
  const signals = [
    ...(Array.isArray(retailers) ? retailers : []),
    ...(Array.isArray(channels) ? channels : []),
    brief?.staffBurden,
    brief?.entryMechanic,
    brief?.mechanicOneLiner,
    brief?.rawNotes,
    brief?.notes,
  ].filter(Boolean).map((value) => String(value).toLowerCase())
  if (!signals.length) return false
  const haystack = signals.join(' ')
  return ON_PREMISE_TOKENS.some((token) => token && haystack.includes(token))
}

function scrubFactsForOnPremise(facts: Fact[]): Fact[] {
  if (!Array.isArray(facts) || !facts.length) return facts
  const filtered = facts.filter((fact) => {
    const claim = String(fact?.claim || '').toLowerCase()
    const source = String(fact?.source || '').toLowerCase()
    if (ECOM_HOST_HINTS.some((hint) => source.includes(hint))) return false
    if (/(order|online|delivery|click\s*&?\s*collect)/.test(claim)) return false
    if (/\bover\s*\$?\s*\d{2,4}/.test(claim) && /spend|order/.test(claim)) return false
    return true
  })
  return filtered.length ? filtered : facts
}

function scrubOnPremiseEntries(entries: ResearchInsightEntry[]): ResearchInsightEntry[] {
  if (!Array.isArray(entries) || !entries.length) return entries
  const filtered = entries.filter((entry) => {
    const text = String(entry?.text || '').toLowerCase()
    const source = String(entry?.source || '').toLowerCase()
    if (ECOM_HOST_HINTS.some((hint) => source.includes(hint))) return false
    if (/(order|online|delivery|click\s*&?\s*collect)/.test(text)) return false
    if (/\bover\s*\$?\s*\d{2,4}/.test(text) && /spend|order/.test(text)) return false
    return true
  })
  return filtered.length ? filtered : entries
}

function mapLimit<T, R>(arr: T[], limit: number, fn: (t: T, idx: number) => Promise<R>): Promise<R[]> {
  return new Promise((resolve, reject) => {
    const out: R[] = []
    let i = 0, active = 0, done = 0
    const next = () => {
      if (done === arr.length) return resolve(out)
      while (active < limit && i < arr.length) {
        const idx = i++
        active++
        fn(arr[idx], idx)
          .then((res) => { out[idx] = res as any })
          .catch((err) => { out[idx] = err as any })
          .finally(() => { active--; done++; next() })
      }
    }
    next()
  })
}
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/* ------------------------- market-aware GL/HL map ------------------------- */
function marketToGLHL(market: string | null | undefined): { gl: string; hl: string } {
  const m = String(market || '').toLowerCase()
  if (m.includes('australia') || m === 'au') return { gl: 'au', hl: 'en' }
  if (m.includes('new zealand') || m === 'nz') return { gl: 'nz', hl: 'en' }
  if (m.includes('united kingdom') || m === 'uk' || m === 'gb') return { gl: 'gb', hl: 'en' }
  if (m.includes('united states') || m === 'us' || m === 'usa') return { gl: 'us', hl: 'en' }
  if (m.includes('canada') || m === 'ca') return { gl: 'ca', hl: 'en' }
  return { gl: SERPER_GL_ENV, hl: SERPER_HL_ENV }
}

/** Category heuristics (can be expanded / learned later). */
function includesAny(hay: string, needles: string[]) {
  const h = hay.toLowerCase()
  return needles.some((n) => h.includes(String(n || '').toLowerCase()))
}
function categoryDefaults(category: string) {
  const c = String(category || '').toLowerCase()
  if (includesAny(c, ['whitegood', 'fridge', 'appliance', 'dishwasher', 'cooking'])) {
    return { aspFallback: 1500, absoluteFloor: 50, percentFloor: 4 }
  }
  if (includesAny(c, ['phone', 'laptop', 'tech'])) {
    return { aspFallback: 1200, absoluteFloor: 30, percentFloor: 3 }
  }
  if (includesAny(c, ['beer', 'wine', 'spirit', 'liquor'])) {
    return { aspFallback: 20, absoluteFloor: 5, percentFloor: 10 }
  }
  if (includesAny(c, ['grocery', 'snack', 'cpg', 'fmcg', 'supermarket', 'dessert', 'pudding', 'custard'])) {
    return { aspFallback: 6, absoluteFloor: 1, percentFloor: 15 }
  }
  return { aspFallback: 100, absoluteFloor: 10, percentFloor: 5 }
}

/* ---------- Banded cashback helpers (mirrors OfferIQ expectations) ---------- */
type Band = {
  minPrice?: number | null
  maxPrice?: number | null
  amount?: number | null       // absolute $
  percent?: number | null      // % of price
}
function normaliseBands(bands: any[]): Band[] {
  if (!Array.isArray(bands)) return []
  return bands.map((b) => ({
    minPrice: (b?.minPrice == null ? null : Number(b.minPrice) || null),
    maxPrice: (b?.maxPrice == null ? null : Number(b.maxPrice) || null),
    amount: (b?.amount == null ? null : Number(b.amount) || null),
    percent: (b?.percent == null ? null : Number(b.percent) || null),
  }))
  .filter((b) => (b.amount != null && b.amount > 0) || (b.percent != null && b.percent > 0))
}
function bandForASP(bands: Band[], asp: number): Band | null {
  if (!bands.length) return null
  const match = bands.find(b =>
    (b.minPrice == null || asp >= (b.minPrice || 0)) &&
    (b.maxPrice == null || asp <= (b.maxPrice || Infinity))
  )
  if (match) return match
  const lowers = bands.filter(b => b.minPrice != null && (b.minPrice as number) <= asp)
  if (lowers.length) return lowers.sort((a,b) => (b.minPrice || 0) - (a.minPrice || 0))[0]
  const highers = bands.filter(b => b.minPrice != null && (b.minPrice as number) > asp)
  if (highers.length) return highers.sort((a,b) => (a.minPrice || 0) - (b.minPrice || 0))[0]
  return bands[0]
}
function amountFromBandAtASP(b: Band, asp: number): number {
  if (!b) return 0
  if (b.amount != null && b.amount > 0) return b.amount
  if (b.percent != null && b.percent > 0) return (b.percent / 100) * asp
  return 0
}

/* ---------- Research access (non-fatal if absent) ---------- */
function getResearch(ctx: CampaignContext): any | null {
  const anyCtx = ctx as any
  return (
    anyCtx?.research ||
    anyCtx?.meta?.research ||
    anyCtx?.framing?.meta?.research ||
    null
  )
}

/* --------------------------- Wikipedia helpers --------------------------- */

async function wikipediaOpenSearch(term: string): Promise<string | null> {
  if (!term) return null
  const res = await fetchJSON(
    `https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search=${encodeURIComponent(term)}`
  )
  const title = Array.isArray(res?.[1]) && res[1][0] ? String(res[1][0]) : null
  return title
}

async function wikipediaSummary(term: string): Promise<{ title: string; extract: string; url: string } | null> {
  if (!term) return null
  const title = (await wikipediaOpenSearch(term)) || term
  const page = await fetchJSON(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
  if (!page || !page.extract) return null
  return { title: page.title || title, extract: String(page.extract), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title || title)}` }
}

/* ----------------------- Search Providers (optional) ---------------------- */

type SearchResult = { title: string; url: string; snippet?: string }

async function searchSerper(q: string, num = 8, gl = SERPER_GL_ENV, hl = SERPER_HL_ENV): Promise<SearchResult[] | null> {
  if (!SERPER) return null
  const body = JSON.stringify({ q, num, gl, hl })
  const res = await fetchJSON('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER },
    body
  })
  const organic = Array.isArray(res?.organic) ? res.organic : []
  return organic.map((r: any) => ({ title: safe(r.title), url: safe(r.link), snippet: safe(r.snippet) }))
}

async function searchBrave(q: string, count = 8): Promise<SearchResult[] | null> {
  if (!BRAVE) return null
  const u = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=${count}&search_lang=en`
  const res = await fetchJSON(u, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE }
  })
  const web = Array.isArray(res?.web?.results) ? res.web.results : []
  return web.map((r: any) => ({ title: safe(r.title), url: safe(r.url), snippet: safe(r.description) }))
}

async function runSearch(q: string, opts?: { num?: number, gl?: string, hl?: string }): Promise<{ provider: string, results: SearchResult[] }> {
  const start = Date.now()
  let provider = 'none'
  let results: SearchResult[] = []
  const bySerper = await searchSerper(q, opts?.num ?? 8, opts?.gl ?? SERPER_GL_ENV, opts?.hl ?? SERPER_HL_ENV)
  if (bySerper && bySerper.length) { provider = 'serper'; results = bySerper }
  else {
    const byBrave = await searchBrave(q, opts?.num ?? 8)
    if (byBrave && byBrave.length) { provider = 'brave'; results = byBrave }
  }
  if (DEBUG) console.log('[research] runSearch', { q, provider, count: results.length })
  const durationMs = Date.now() - start
  console.info(JSON.stringify({ type: 'research.search', query: q, provider, count: results.length, duration_ms: durationMs }))
  return { provider, results }
}

function filterResultsAlcoholAware(results: SearchResult[], opts: { alcohol?: boolean; onPremise?: boolean } = {}): SearchResult[] {
  const { alcohol = false, onPremise = false } = opts
  if (!alcohol && !onPremise) return results

  const base = results.filter((r) => {
    const h = host(r.url)
    if (!h) return false
    if (DOMAIN_BLOCKLIST.some((d) => h.endsWith(d))) return false
    return true
  })

  if (!onPremise) return base.length ? base : results

  const shopperFiltered = base.filter((r) => {
    const h = host(r.url)
    const text = `${r.title || ''} ${r.snippet || ''}`.toLowerCase()
    if (!h) return false
    if (LIQUOR_RETAILER_HOSTS.has(h)) return false
    if (ECOM_HOST_HINTS.some((hint) => h.includes(hint))) return false
    if (/(order|online|delivery|click\s*&?\s*collect)/.test(text)) return false
    if (/\bover\s*\$?\s*\d{2,4}/.test(text) && /spend|order/.test(text)) return false
    return true
  })

  if (shopperFiltered.length) return shopperFiltered
  return base.length ? base : results
}

/* ---------------------- Promo page parsing heuristics --------------------- */

function extractPromoSignals(html: string): Partial<CompetitorPromo> {
  const text = html.replace(/\s+/g, ' ').toLowerCase()

  // detect type
  let type: CompetitorPromo['type'] = 'OTHER'
  if (/cash\s*back|cashback/.test(text)) type = 'CASHBACK'
  else if (/gift[-\s]?with[-\s]?purchase|bonus\s+gift|free\s+gift/.test(text)) type = 'GWP'
  else if (/(win|prize|winners)/.test(text)) type = 'PRIZE'

  // hero count + total winners
  let heroCount: number | null = null
  let totalWinners: number | null = null

  const heroMatch =
    /(?:1\s+of\s+)?(\d{1,3})\s+(?:major\s+)?prizes?/.exec(text) ||
    /(\d{1,3})\s+(?:x\s+)?major\s+prizes?/.exec(text) ||
    /win\s+1\s+of\s+(\d{1,3})/.exec(text)
  if (heroMatch) heroCount = Number(heroMatch[1])

  const totalMatch =
    /(\d{2,6})\s+total\s+winners/.exec(text) ||
    /over\s+(\d{2,6})\s+winners/.exec(text) ||
    /\b(\d{2,6})\s+winners\b/.exec(text)
  if (totalMatch) totalWinners = Number(totalMatch[1])

  // cadence
  let cadence: string | null = null
  if (/instant\s+win/.test(text)) cadence = 'instant'
  else if (/weekly\s+win|weekly\s+draw|every\s+week/.test(text)) cadence = 'weekly'
  else if (/daily\s+win|daily\s+draw|every\s+day/.test(text)) cadence = 'daily'

  // headline / value hints ($, AUD, “up to”)
  const valueHit = /(?:\bup to\s*)?(?:\$|\baud\s?)\s?(\d{2,6}(?:,\d{3})?)/.exec(text)
  const valueStr = valueHit ? `$${valueHit[1]}`.replace(/,\s*/g, ',') : null

  // retailer/appliance vernacular
  const viaRedemption = /(via|by)\s+redemption|manufacturer\s+redemption/.test(text)
  const giftCardHit = /(bonus|free)\s+(?:prepaid\s+)?(?:visa\s+)?gift\s*card\s*(?:worth|valued|up to)?\s*(?:\$)?\s?(\d{2,5})/.exec(text)
  const giftCard = giftCardHit ? `$${giftCardHit[2]} gift card` : null
  const eofy = /eofy|end\s+of\s+financial\s+year/.test(text)

  // simple title/headline
  const titleHit = /<title[^>]*>(.*?)<\/title>/i.exec(html)
  const headlineHit = /<h1[^>]*>(.*?)<\/h1>/i.exec(html)

  // prize items (rough)
  const items: string[] = []
  const itemHits = html.match(/(car|fridge|washer|dryer|tv|holiday|trip|voucher|gift\s*card|cash|rebate|data|plans?)/gi)
  if (itemHits) items.push(...Array.from(new Set(itemHits.map(s => s.toLowerCase()))))

  return {
    type,
    heroCount,
    totalWinners,
    cadence,
    prizeValueHint: valueStr || (eofy ? 'EOFY bonus' : null),
    title: titleHit ? titleHit[1].replace(/<\/?[^>]+>/g, '').trim() : undefined,
    headline: headlineHit ? headlineHit[1].replace(/<\/?[^>]+>/g, '').trim() : undefined,
    prizeItems: items.slice(0, 12),
    viaRedemption,
    giftCard
  }
}

/* --------------------------- Season & market notes ------------------------ */

function seasonLabel(ctx: CampaignContext): string | null {
  const market = (ctx.market || '').toUpperCase()
  const d = ctx.startDate ? new Date(ctx.startDate) : new Date()
  const m = d.getUTCMonth() + 1
  if (market.includes('AU')) {
    if ([6,7,8].includes(m)) return 'Winter in Australia'
    if ([9,10,11].includes(m)) return 'Spring in Australia'
    if ([12,1,2].includes(m)) return 'Summer in Australia'
    if ([3,4,5].includes(m)) return 'Autumn in Australia'
    return 'Seasonal context: Australia'
  }
  return null
}

function briefList(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.flatMap(v => briefList(v))
  }
  if (typeof value === 'string') {
    return value
      .split(/[•\u2022,\n;/|]+/)
      .map(s => s.trim())
      .filter(Boolean)
  }
  if (typeof value === 'object') {
    return Object.values(value)
      .flatMap(v => briefList(v))
  }
  return []
}

function uniqueStrings(values: string[], limit?: number): string[] {
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

function pushBriefFacts(target: Fact[], label: string, values: string | string[] | null | undefined) {
  const list = Array.isArray(values) ? values : (values ? [values] : [])
  for (const item of list) {
    const text = String(item || '').trim()
    if (!text) continue
    target.push({ claim: `${label}: ${text}`, source: 'Source: brief' })
  }
}

/* --------------------------- Alcohol context infer ------------------------ */

function inferAlcoholContext(ctx: CampaignContext, retailerNames: string[]): boolean {
  const cat = String(ctx.category || '').toLowerCase()
  const spec: any = ctx.briefSpec || {}
  const channel = String(spec.channel || '').toLowerCase()
  const retailersLower = (retailerNames || []).map(r => r.toLowerCase())

  const catHit = /(alcohol|liquor|beer|wine|spirit|cider|rtd|ready[-\s]?to[-\s]?drink)/i.test(cat)
  const channelHit = /(on[-\s]?premise|pub|venue|bottleshop|liquor)/i.test(channel)
  const retailerHit = retailersLower.some(r =>
    ["dan murphy", "dan murphy's", 'bws', 'liquorland', 'first choice', 'vintage cellars', 'cellarbrations', 'bottlemart', 'iga liquor'].some(k => r.includes(k))
  )
  return Boolean(catHit || channelHit || retailerHit)
}

/* --------------------------- Category classification ---------------------- */

type CatType =
  | 'APPLIANCES'
  | 'ALCOHOL'
  | 'ENERGY'
  | 'FMCG'
  | 'TELCO'
  | 'INSURANCE'
  | 'BANKING'
  | 'QSR'
  | 'ELECTRONICS'
  | 'BEAUTY'
  | 'PET'
  | 'COFFEE'
  | 'DAIRY'
  | 'CHEESE'
  | 'SNACKS'
  | 'GENERIC'

type LiquorSub = 'WINE' | 'BEER' | 'SPIRITS' | 'CIDER' | 'RTD' | 'UNKNOWN'

function classifyCategory(ctx: CampaignContext): CatType {
  const raw = [
    String(ctx.category || ''),
    String((ctx.briefSpec as any)?.category || ''),
    String((ctx.briefSpec as any)?.vertical || '')
  ].join(' ').toLowerCase()

  if (/\b(telco|telecom|mobile|nbn|broadband|phone\s+plan|data\s+plan)\b/.test(raw)) return 'TELCO'
  if (/\b(insurance|car\s+insurance|home\s+insurance|life\s+insurance|health\s+insurance)\b/.test(raw)) return 'INSURANCE'
  if (/\b(bank|banking|credit\s*card|debit|savings|mortgage|loan)\b/.test(raw)) return 'BANKING'
  if (/\b(qsr|quick\s*service\s*restaurant|fast\s*food|burger|pizza|fried\s*chicken)\b/.test(raw)) return 'QSR'
  if (/\b(electronics|tv|television|laptop|console|gaming|smartphone|headphones?)\b/.test(raw)) return 'ELECTRONICS'
  if (/\b(beauty|skincare|makeup|cosmetic|fragrance|pharmacy)\b/.test(raw)) return 'BEAUTY'
  if (/\b(pet\s*food|pet\s*care|cats?|dogs?)\b/.test(raw)) return 'PET'
  if (/\b(coffee|espresso|capsules?|pods?|instant\s*coffee)\b/.test(raw)) return 'COFFEE'
  if (/\b(dairy|milk|yog(ur)?t|butter)\b/.test(raw)) return 'DAIRY'
  if (/\b(cheese|cheddar|brie|gouda|camembert)\b/.test(raw)) return 'CHEESE'
  if (/\b(snack|chips?|crisps|biscuit|confectionery|chocolate|candy)\b/.test(raw)) return 'SNACKS'
  if (/\b(energy\s*drink|functional\s*beverage|isotonic)\b/.test(raw)) return 'ENERGY'
  if (/\b(appliance|white ?goods?|kitchen appliance)\b/.test(raw)) return 'APPLIANCES'
  if (/\b(alcohol|liquor|beer|wine|spirit|cider|rtd|ready[-\s]?to[-\s]?drink)\b/.test(raw)) return 'ALCOHOL'
  if (/\b(soft\s*drink|soda|cola|water|juice|tea|cereal|pet\s*food|beauty|skincare|cosmetic|dessert|pudding|custard)\b/.test(raw)) return 'FMCG'
  return 'GENERIC'
}

function classifyLiquorSubcategory(ctx: CampaignContext): LiquorSub {
  const raw = [
    String(ctx.category || ''),
    String((ctx.briefSpec as any)?.category || ''),
    String((ctx.briefSpec as any)?.vertical || '')
  ].join(' ').toLowerCase()

  if (/\bwine|pinot|shiraz|chardonnay|cabernet|merlot|ros[ée]|riesling\b/.test(raw)) return 'WINE'
  if (/\bbeer|lager|ale|stout|ipa|pilsner\b/.test(raw)) return 'BEER'
  if (/\bspirit|whisky|whiskey|gin|vodka|rum|tequila|bourbon|liqueur\b/.test(raw)) return 'SPIRITS'
  if (/\bcider\b/.test(raw)) return 'CIDER'
  if (/\brtd\b|ready[-\s]?to[-\s]?drink|premix|vodka\s*cruiser|udl|canadian\s*club/.test(raw)) return 'RTD'
  return 'UNKNOWN'
}

/* ----------------------------- Assured detection -------------------------- */

function isAssuredValue(ctx: CampaignContext): boolean {
  const t = String((ctx.briefSpec as any)?.typeOfPromotion || '').toUpperCase()
  const gwp = !!(ctx.briefSpec as any)?.gwp
  const cashback = (ctx.briefSpec as any)?.cashback || null
  const cashbackAssured =
    (t === 'CASHBACK' && (cashback ? cashback.assured !== false : true)) ||
    Boolean(cashback && cashback.assured !== false)
  return t === 'GWP' || gwp || cashbackAssured
}

/* -------------------------------- helpers --------------------------------- */

function toFacts(results: SearchResult[], capEach = 8): Fact[] {
  const rows = (results || [])
    .map(r => {
      const t = safe(r.title)
      const s = safe(r.snippet)
      const u = safe(r.url)
      if (!t || !u) return null as any
      const h = host(u)
      return { claim: (s ? `${t} — ${s}` : t).slice(0, 240), source: `Source: ${h} (${u})` }
    })
  return capArr(uniqBy(rows.filter(Boolean) as Fact[], (r) => r.source), capEach)
}

function sanitizeFactClaim(claim: string): string {
  return String(claim || '')
    .replace(/^[#>\-\u2022•▪︎→↘\s]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractDomain(source: string): string {
  const text = String(source || '').trim()
  if (!text) return ''
  const match = text.match(/\((https?:\/\/[^\s)]+)\)/)
  const candidate = match ? match[1] : text.replace(/^Source:\s*/i, '')
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return url.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return candidate.toLowerCase()
  }
}

function hostMatchesAny(hostname: string, patterns: string[]): boolean {
  if (!hostname) return false
  const normalized = hostname.toLowerCase()
  return patterns.some((pattern) => pattern && normalized.includes(pattern.toLowerCase()))
}

function filterFactsByHostAllowlist(facts: Fact[], allowList: string[]): Fact[] {
  if (!Array.isArray(facts) || !facts.length || !allowList.length) return facts
  const filtered = facts.filter((fact) => hostMatchesAny(extractDomain(fact.source || ''), allowList))
  return filtered.length ? filtered : facts
}

function enforceHostTokenMatch(facts: Fact[], tokens: string[]): Fact[] {
  if (!Array.isArray(facts) || !facts.length || !tokens.length) return facts
  const filtered = facts.filter((fact) => hostMatchesAny(extractDomain(fact.source || ''), tokens))
  return filtered.length ? filtered : facts
}

function factMatchesTokens(fact: Fact, tokens: string[]): boolean {
  if (!tokens.length) return true
  const claim = sanitizeFactClaim(fact.claim || '').toLowerCase()
  const domain = extractDomain(fact.source || '')
  return tokens.some(token => (token && claim.includes(token)) || (token && domain.includes(token)))
}

function filterFactsByTokens(facts: Fact[], tokens: string[]): Fact[] {
  if (!Array.isArray(facts) || !facts.length || !tokens.length) return facts
  const filtered = facts.filter(f => factMatchesTokens(f, tokens))
  return filtered.length ? filtered : facts
}

function filterOutUSDFacts(facts: Fact[]): Fact[] {
  const rx = /\b(?:usd|us\$|\$usd|u\.s\.?\s*dollars?)\b/i
  return (facts || []).filter((fact) => !rx.test(String(fact?.claim || '')))
}

function requireKeywordPresence(facts: Fact[], keywords: string[]): Fact[] {
  if (!keywords.length || !facts.length) return facts
  const filtered = facts.filter(f => {
    const text = sanitizeFactClaim(f.claim || '').toLowerCase()
    return keywords.some(keyword => keyword && text.includes(keyword))
  })
  return filtered.length ? filtered : facts
}

const MARKET_GEO_HINTS: Record<string, { tokens: string[]; domains: string[] }> = {
  AU: {
    tokens: ['australia', 'australian', 'anz', 'coles', 'woolworths', 'iga'],
    domains: ['.au', 'insidefmcg.com', 'retailworldmagazine.com', 'news.com.au', 'accc.gov.au', 'ausfoodnews.com.au'],
  },
  NZ: {
    tokens: ['new zealand', 'kiwi', 'aotearoa', 'anz'],
    domains: ['.nz', 'stuff.co.nz', 'nzherald.co.nz'],
  },
  UK: {
    tokens: ['united kingdom', 'british', 'uk grocer', 'england', 'scotland'],
    domains: ['.uk', 'thegrocer.co.uk', 'campaignlive.co.uk', 'marketingweek.com'],
  },
  IE: {
    tokens: ['ireland', 'irish', 'eir'],
    domains: ['.ie', 'checkout.ie'],
  },
  US: {
    tokens: ['united states', 'american', 'usa', 'us market'],
    domains: ['nrn.com', 'supermarketnews.com', 'progressivegrocer.com'],
  },
  CA: {
    tokens: ['canada', 'canadian'],
    domains: ['.ca', 'canadiangrocer.com'],
  },
}

function preferInsightsByMarket(entries: ResearchInsightEntry[], marketCode: string): ResearchInsightEntry[] {
  if (!Array.isArray(entries) || !entries.length) return entries
  const hints = MARKET_GEO_HINTS[marketCode] || null
  if (!hints) return entries
  const filtered = entries.filter((entry) => {
    const text = String(entry?.text || '').toLowerCase()
    const domain = extractDomain(entry?.source || '')
    if (hints.domains.some((hint) => hint && domain.includes(hint))) return true
    return hints.tokens.some((token) => token && text.includes(token))
  })
  return filtered.length ? filtered : entries
}

function buildInsightEntries(facts: Fact[], cap = 4): ResearchInsightEntry[] {
  if (!facts.length) return []
  const seen = new Set<string>()
  const entries: ResearchInsightEntry[] = []
  for (const fact of facts) {
    const text = sanitizeFactClaim(fact.claim || '')
    if (!text) continue
    const source = extractDomain(fact.source || '') || undefined
    const key = `${text.toLowerCase()}|${source || ''}`
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({ text, source })
    if (entries.length >= cap) break
  }
  return entries
}

function buildCompetitorEntries(pack: ResearchPack, fallback: ResearchInsightEntry[] | undefined, cap = 3): ResearchInsightEntry[] {
  const promos = Array.isArray(pack.competitors?.promos) ? pack.competitors.promos : []
  const entries: ResearchInsightEntry[] = []
  for (const promo of promos) {
    const parts = [
      promo.brand || 'Competitor',
      promo.title || promo.headline || '',
      promo.type ? `type: ${promo.type}` : '',
      promo.cadence ? `cadence: ${promo.cadence}` : '',
      promo.heroCount ? `hero x${promo.heroCount}` : '',
      promo.totalWinners ? `${promo.totalWinners} winners` : '',
      promo.prizeValueHint || '',
    ].filter(Boolean)
    if (!parts.length) continue
    entries.push({ text: parts.join(' — '), source: promo.source || 'promo scan' })
    if (entries.length >= cap) break
  }
  if (entries.length) return entries
  return (fallback || []).slice(0, cap)
}

function buildResearchDossier(
  pack: ResearchPack,
  marketCode: string,
  opts: { onPremise?: boolean; personaKeywords?: string[] } = {}
): ResearchDossier {
  const onPremise = !!opts.onPremise
  const personaKeywords = Array.isArray(opts.personaKeywords) ? opts.personaKeywords.filter(Boolean) : []
  const insights = pack.insights || {}
  const dessertKeywords = ['dessert','pudding','custard','frozen','ice cream','movie','ticket','sweet','indulgence','wicked','creamery']
  const shopperKeywordsBase = ['value','double','family','social','buy 2','basket','bundle','receipt','hassle','barrier','trust','switch','premium']
  const retailerKeywords = ['coles','woolworths','independent','iga','metcash','aldi','staff','display','trade','store','endcap','aisle','floor','convenience','servo','petrol','grab and go']
  const categoryKeywords = ['category','frozen','grocery','trend','growth','season','premium','dessert','snack','occasion','penetration']
  const shopperKeywords = Array.from(new Set([
    ...shopperKeywordsBase,
    'mum',
    'mums',
    'parents',
    'parent',
    'family night',
    'movie night',
    'movie tickets',
    'treat',
    'impulse',
    'top up',
    'after work',
    'on the way home',
    'convenience shopper',
    ...personaKeywords,
  ]))

  const brandPool = mergeInsightPools(
    insights.brand || [],
    buildInsightEntries(pack.brand?.facts || [], 12)
  )
  const audiencePool = mergeInsightPools(
    insights.audience || [],
    buildInsightEntries(pack.audience?.facts || [], 12)
  )
  const retailerPool = mergeInsightPools(
    insights.retailers || [],
    buildInsightEntries(pack.retailers?.facts || [], 12)
  )
  const marketPool = mergeInsightPools(
    insights.market || [],
    buildInsightEntries(pack.market?.facts || [], 12),
    buildInsightEntries(pack.signals?.facts || [], 8)
  )

  const brandTokens = normaliseTokens([
    pack.brand?.query || '',
    ...((pack.brand?.facts || []).map((f) => f.claim || '')),
  ]).slice(0, 6)
  const retailerNames = Array.isArray(pack.retailers?.names) ? pack.retailers.names : []
  const marketPoolLocalized = preferInsightsByMarket(marketPool, marketCode)

  const brandTruths = selectInsightEntries(brandPool, {
    cap: 4,
    keywords: dessertKeywords,
    boostTokens: brandTokens,
    preferNumbers: true,
  })
  const shopperTensions = selectInsightEntries(audiencePool, {
    cap: 4,
    keywords: shopperKeywords,
    preferNumbers: true,
  })
  const retailerReality = selectInsightEntries(retailerPool, {
    cap: 3,
    keywords: retailerKeywords,
    boostTokens: retailerNames,
    preferNumbers: true,
  })

  const dossier: ResearchDossier = {
    brandTruths,
    shopperTensions: onPremise ? scrubOnPremiseEntries(shopperTensions) : shopperTensions,
    retailerReality: onPremise ? scrubOnPremiseEntries(retailerReality) : retailerReality,
    competitorMoves: selectInsightEntries(
      mergeInsightPools(
        buildCompetitorEntries(pack, insights.competitors, 6),
        insights.competitors || []
      ),
      { cap: 3, preferNumbers: true }
    ),
    categorySignals: selectInsightEntries(marketPoolLocalized, {
      cap: 4,
      keywords: categoryKeywords,
      preferNumbers: true,
    }),
    benchmarks: buildBenchmarkEntries(pack.benchmarks),
  }
  return dossier
}

function mergeInsightPools(...lists: Array<ResearchInsightEntry[] | undefined>): ResearchInsightEntry[] {
  const seen = new Set<string>()
  const merged: ResearchInsightEntry[] = []
  for (const list of lists) {
    for (const entry of list || []) {
      const text = (entry?.text || '').trim()
      if (!text) continue
      const key = `${text.toLowerCase()}|${(entry?.source || '').toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      merged.push({ text, source: entry?.source || undefined })
    }
  }
  return merged
}

type InsightSelectOptions = {
  cap?: number
  keywords?: string[]
  boostTokens?: string[]
  preferNumbers?: boolean
  requireKeyword?: boolean
}

function selectInsightEntries(
  entries: ResearchInsightEntry[] = [],
  opts: InsightSelectOptions
): ResearchInsightEntry[] {
  const cap = opts.cap ?? 3
  if (!entries.length || cap <= 0) return []
  const keywordList = (opts.keywords || []).map((k) => k.toLowerCase())
  const boostTokens = (opts.boostTokens || []).map((k) => k.toLowerCase())

  const scored = entries
    .map((entry) => {
      const text = (entry?.text || '').trim()
      if (!text) return null
      const lower = text.toLowerCase()
      const keywordHit = keywordList.some((kw) => kw && lower.includes(kw))
      if (opts.requireKeyword && !keywordHit) return null
      let score = 0
      const hasAud = /\b(?:aud|a\$|australian)\b/.test(lower)
      const hasUsd = /\b(?:usd|us\$|\$usd|u\.s\.?\s*dollars?)\b/.test(lower)
      if (hasUsd && !hasAud) return null
      if (hasAud) score += 0.4
      const length = text.length
      if (length >= 140) score += 1.2
      else if (length >= 90) score += 1.0
      else if (length >= 60) score += 0.7
      else score += 0.3
      if (keywordHit) score += 0.9
      if (boostTokens.some((token) => token && lower.includes(token))) score += 0.5
      if (opts.preferNumbers && /\d/.test(text)) score += 0.4
      if (/\d{1,3}%/.test(text) || /\b\d+(?:\.\d+)?\s*(million|bn|billion|k)\b/i.test(text)) score += 0.4
      if (/\$(\d|\s)/.test(text)) score += 0.3
      if (/(growth|growing|decline|surge|penetration|share|premium|household|frequency|basket|trip)/i.test(text)) score += 0.3
      if (/(shopper|shop|retailer|category|brand|consumer|occasion)/i.test(text)) score += 0.2
      if (/^\w+(?:\s\w+){0,2}\s(is|are)\s/.test(text)) score += 0.1
      const sourceDomain = extractDomain(entry?.source || '')
      return { entry, score, source: sourceDomain }
    })
    .filter(Boolean) as Array<{ entry: ResearchInsightEntry; score: number; source: string }>

  if (!scored.length) return []

  scored.sort((a, b) => b.score - a.score)

  const domainSeen = new Set<string>()
  const picked: ResearchInsightEntry[] = []
  for (const row of scored) {
    if (domainSeen.has(row.source) && picked.length >= cap - 1) continue
    picked.push(row.entry)
    if (row.source) domainSeen.add(row.source)
    if (picked.length >= cap) break
  }
  return picked
}

type DossierKey = keyof ResearchDossier
const DOSSIER_CAPS: Record<DossierKey, number> = {
  brandTruths: 5,
  shopperTensions: 5,
  retailerReality: 4,
  competitorMoves: 4,
  categorySignals: 4,
  benchmarks: 3,
}

function applyBrandKnowledgeToDossier(
  base: ResearchDossier,
  hints?: Partial<Record<DossierKey, ResearchInsightEntry[]>> | null
): ResearchDossier {
  if (!hints) return base
  let mutated = false
  const next: ResearchDossier = { ...base }
  for (const key of Object.keys(DOSSIER_CAPS) as DossierKey[]) {
    const extra = hints[key]
    if (!extra?.length) continue
    const current = (next as any)[key] as ResearchInsightEntry[] | undefined
    const merged = mergeInsightPools(extra, current || [])
    const cap = DOSSIER_CAPS[key] || extra.length
    ;(next as any)[key] = merged.slice(0, cap)
    mutated = true
  }
  return mutated ? next : base
}

function sanitizeInsightArray(raw: any, cap = 4): ResearchInsightEntry[] {
  if (!Array.isArray(raw)) return []
  const cleaned: ResearchInsightEntry[] = []
  for (const entry of raw) {
    const text = safe(entry?.text || entry?.claim || '')
    if (!text) continue
    const source = safe(entry?.source || entry?.sourceHint || '')
    cleaned.push({
      text,
      source: source || undefined,
    })
    if (cleaned.length >= cap) break
  }
  return cleaned
}

function normalizeEditorialDossier(raw: any, base: ResearchDossier): ResearchDossier | null {
  if (!raw || typeof raw !== 'object') return null
  const pick = (key: keyof ResearchDossier, cap = 4) =>
    sanitizeInsightArray((raw as any)[key], cap)
  const dossier: ResearchDossier = {
    brandTruths: pick('brandTruths', 4) || [],
    shopperTensions: pick('shopperTensions', 4) || [],
    retailerReality: pick('retailerReality', 3) || [],
    competitorMoves: pick('competitorMoves', 3) || [],
    categorySignals: pick('categorySignals', 4) || [],
    benchmarks: pick('benchmarks', 3) || base.benchmarks || [],
  }
  const hasContent = Object.values(dossier).some((arr) => Array.isArray(arr) && arr.length)
  return hasContent ? dossier : null
}

function buildFactsDigest(facts: Fact[], cap = 8): Array<{ text: string; source: string }> {
  return facts.slice(0, cap).map((fact) => ({
    text: sanitizeFactClaim(fact.claim || ''),
    source: extractDomain(fact.source || '') || fact.source || '',
  })).filter((row) => row.text)
}

async function editorializeDossier(
  ctx: CampaignContext,
  pack: ResearchPack,
  base: ResearchDossier,
  opts: { logs: string[] }
): Promise<ResearchDossier | null> {
  if (!ENABLE_RESEARCH_EDITOR) return null
  try {
    const model = resolveModel(process.env.MODEL_RESEARCH_EDITOR, process.env.MODEL_DEFAULT, 'gpt-4.1')
    const identity = [
      `Brand: ${safe(ctx.clientName || pack.brand.query || ctx.title)}`,
      `Category: ${safe(ctx.category || pack.category.query || 'n/a')}`,
      `Market: ${safe(ctx.market || 'Australia')}`,
      `Campaign: ${safe(ctx.title)}`,
    ].join(' | ')
    const payload = {
      brandTruths: buildFactsDigest(pack.brand.facts || [], 12),
      shopper: buildFactsDigest(pack.audience.facts || [], 12),
      retailers: buildFactsDigest(pack.retailers.facts || [], 12),
      category: buildFactsDigest(pack.category.facts || [], 12),
      market: buildFactsDigest(pack.market.facts || [], 12),
      signals: buildFactsDigest(pack.signals?.facts || [], 8),
      competitors: buildFactsDigest(pack.competitors.facts || [], 10),
      benchmarks: base.benchmarks,
    }
    const instructions = `
You are TRUDY's research editor: write jaw-droppingly useful insights grounded ONLY in the supplied facts.
- Each tile must be specific, commercial, and cite evidence (retailer dynamics, shopper tensions, cost pressures, clout gaps, etc.).
- Do NOT fabricate numbers. If a fact lacks data, ignore it.
- Emphasise: retailer power (Coles/Woolworths, freezer congestion), buyer-vs-consumer tension, cost-of-living trade-offs, competitor moves, category headwinds/tailwinds.
- Output strict JSON with keys: brandTruths, shopperTensions, retailerReality, competitorMoves, categorySignals, benchmarks. Each value is an array of { "text": "...", "source": "source name" }.
- Keep each list to 3–4 entries max. Use polished language.`
    const resp = await chat({
      model,
      system: 'You are a senior category strategist for AU FMCG, telco, appliance, and beverage brands. Your job is to rewrite research facts into razor-sharp insights that cite their source and explain the commercial implication.',
      messages: [
        { role: 'user', content: `${identity}\n\nFACT PACK:\n${JSON.stringify(payload, null, 2)}\n\n${instructions}` },
      ],
      temperature: 0.35,
      top_p: 0.9,
      max_output_tokens: 900,
      json: true,
      meta: { scope: 'research.editorial', campaignId: ctx.id },
    })
    const parsed = (() => {
      try { return JSON.parse(resp) } catch { return null }
    })()
    const normalized = normalizeEditorialDossier(parsed, base)
    if (normalized) {
      opts.logs.push('editorial:success')
      return normalized
    }
    opts.logs.push('editorial:parse_failed')
    return null
  } catch (err: any) {
    opts.logs.push(`editorial:error:${err?.message || err}`)
    return null
  }
}

function buildBenchmarkEntries(benchmarks: ResearchBenchmarks | undefined): ResearchInsightEntry[] {
  if (!benchmarks) return []
  const entries: ResearchInsightEntry[] = []
  const cb = benchmarks.cashback
  if (cb?.sample) {
    const typical = cb.typicalAbs ? `$${Math.round(cb.typicalAbs)}` : (cb.typicalPct ? `${cb.typicalPct}%` : 'n/a')
    const max = cb.maxAbs ? `$${Math.round(cb.maxAbs)}` : (cb.maxPct ? `${cb.maxPct}%` : 'n/a')
    entries.push({ text: `Cashback typical ≈ ${typical} (sample ${cb.sample}, max ${max}).`, source: 'benchmark' })
  }
  if (benchmarks.prizeCountsObserved?.total) {
    const details = (benchmarks.prizeCountsObserved.common || [])
      .map((row) => `${row.count} (~${Math.round((row.share || 0) * 100)}%)`)
      .join(', ')
    entries.push({ text: `Hero counts observed (${benchmarks.prizeCountsObserved.total} promos): ${details || 'n/a'}.`, source: 'benchmark' })
  }
  if (benchmarks.recommendedHeroCount) {
    entries.push({ text: `Recommended hero overlay count: ${benchmarks.recommendedHeroCount}.`, source: 'benchmark' })
  }
  if (benchmarks.positionVsMarket && benchmarks.positionVsMarket !== 'UNKNOWN') {
    entries.push({ text: `Cashback vs market: ${benchmarks.positionVsMarket.replace(/_/g, ' ').toLowerCase()}.`, source: 'benchmark' })
  }
  return entries.slice(0, 3)
}

function normaliseTokens(values: string[]): string[] {
  const tokens = new Set<string>()
  for (const value of values || []) {
    const raw = String(value || '').toLowerCase()
    raw.split(/[\s\/&,-]+/).forEach(piece => {
      const token = piece.replace(/[^a-z0-9]/g, '').trim()
      if (token.length >= 3) tokens.add(token)
    })
  }
  return Array.from(tokens)
}

/* ------------------------------- Discovery -------------------------------- */

/** Hard filter for junk tokens that looked like "competitors" (Browse, Popular, Rated, Our Brands, Growth & Forecast, Best, etc.) */
const STOPWORD_BRAND_TOKENS = new Set([
  'browse','popular','rated','best','top','leading','guide','review','reviews',
  'our','brands','our brands','category','categories','brand','store','shop',
  'price','prices','deal','deals','offer','offers','promotion','promotions',
  'growth','forecast','forecasts','news','press','media','contact','about',
  'help','support','faq','faqs','australia','australian','au'
])
const CATEGORY_WORDS = new Set([
  'desserts','dessert','puddings','pudding','custard','snacks','snack','frozen','ice','cream','fmcg','grocery'
])
const GENERIC_WORD_TOKENS = new Set([
  'market','markets','size','share','shares','trend','trends','forecast','forecasts','growth','report','reports','insights','overview','analysis',
  'best','top','leading','major','cakes','products','range','brand','brands',
  'industry','news','similar','companies','insight','insights','taste','test'
])
const BAD_COMPETITOR_FRAGMENTS = ['artgallery', 'gallery', 'luxedux']
function looksBrandishToken(t: string): boolean {
  const s = t.trim().replace(/\u00a0/g, ' ')
  if (!s) return false
  const low = s.toLowerCase()
  if (STOPWORD_BRAND_TOKENS.has(low)) return false
  if (CATEGORY_WORDS.has(low)) return false
  if (/\d/.test(s)) return false
  if (s.length < 2 || s.length > 28) return false
  // require at least some casing signal (Title Case or has a capital)
  const words = s.split(/\s+/).filter(Boolean)
  const hasCapital = /[A-Z]/.test(s)
  const wordsLower = words.map(w => w.toLowerCase())
  const nonCategoryWords = wordsLower.filter(w => !CATEGORY_WORDS.has(w))
  if (!nonCategoryWords.length) return false
  const nonGenericWords = wordsLower.filter(w => !CATEGORY_WORDS.has(w) && !GENERIC_WORD_TOKENS.has(w))
  if (!nonGenericWords.length) return false
  const titleish = words.every(w => /^[A-Z][A-Za-z'&.-]*$/.test(w) || ["&","'","-"].includes(w))
  return hasCapital && (titleish || /[A-Z]/.test(s[0]))
}

async function discoverCompetitors(category: string, marketHint = 'Australia', brandHint?: string | null): Promise<string[]> {
  const queries = [
    `${category} top brands ${marketHint}`,
    `${category} leading brands ${marketHint}`,
    `${category} major competitors ${marketHint}`
  ]
  if (brandHint && brandHint.trim()) {
    const brand = brandHint.trim()
    queries.push(
      `${brand} competitors ${marketHint}`,
      `${brand} rival brands ${marketHint}`,
      `${brand} vs ${marketHint}`
    )
  }
  const seen = new Set<string>()
  const names: string[] = []
  for (const q of queries) {
    // eslint-disable-next-line no-await-in-loop
    const { results } = await runSearch(q, { num: 8 })
    for (const r of results) {
      const title = (r.title || '')
      // split on common separators, then split segments again on ' • '
      const segments = title.split(/[,|–—\-:•]/).map(s => s.trim()).filter(Boolean)
      for (const seg of segments) {
        // break multi-word phrases into candidate tokens,
        // but keep “Ben & Jerry’s”, “Jack Daniel’s”, etc.
        const tokens = seg.split(/\s{2,}/).length > 1 ? seg.split(/\s+/) : [seg]
        const candidate = tokens.join(' ').trim()
        if (!candidate) continue
        if (!looksBrandishToken(candidate)) continue
        const key = candidate.toLowerCase()
        if (!seen.has(key)) { seen.add(key); names.push(candidate) }
      }
    }
  }
  // Additional clean-up: drop anything that still contains obvious category/stop words
  const cleaned = names.filter(n => {
    const low = n.toLowerCase()
    if (STOPWORD_BRAND_TOKENS.has(low)) return false
    if (CATEGORY_WORDS.has(low)) return false
    if (BAD_COMPETITOR_FRAGMENTS.some(fragment => low.includes(fragment))) return false
    if (/\b(browse|popular|rated|growth|forecast|our|brands)\b/i.test(low)) return false
    return true
  })
  return cleaned.slice(0, 12)
}

/* --------------------------- LLM propose→verify --------------------------- */

type URLSuggestion = { title: string; url: string; why?: string }
type LlmSuggestOut = {
  brandSources?: URLSuggestion[]
  categorySources?: URLSuggestion[]
  audienceSources?: URLSuggestion[]
  retailerSources?: URLSuggestion[]
  promoSources?: URLSuggestion[] // promo/competition/GWP/cashback pages only
}

async function llmSuggestSources(opts: {
  brand: string
  category: string
  market: string
  retailers: string[]
  competitors: string[]
  assured: boolean
  promoType?: string | null
  campaignId?: string | null
}): Promise<LlmSuggestOut | null> {
  if (!USE_LLM) return null
  try {
    const model = resolveModel(process.env.MODEL_RESEARCH, process.env.MODEL_DEFAULT)
    const sys = [
      'You are a research assistant for trade promotions.',
      'Return ONLY strict JSON. No markdown. No prose.',
      'Provide up to 8 URLs per list. Use authoritative sources: brand sites, retailer promo hubs, press/newsroom, T&Cs, government/industry bodies.',
      'Avoid social (reddit, x/twitter, tiktok, facebook, instagram).'
    ].join(' ')
    const user = {
      task: "Propose high-quality URLs for brand/category/audience/retailer and live promo pages (competitions, cashback, GWP). Australia preferred when market is AU.",
      brand: opts.brand,
      category: opts.category,
      market: opts.market,
      retailers: opts.retailers,
      competitors: opts.competitors,
      assuredMode: opts.assured ? 'ASSURED' : 'PRIZE',
      schema: {
        brandSources: [{ title: '...', url: '...' }],
        categorySources: [{ title: '...', url: '...' }],
        audienceSources: [{ title: '...', url: '...' }],
        retailerSources: [{ title: '...', url: '...' }],
        promoSources: [{ title: '...', url: '...' }]
      }
    }
    const chatPayload = {
      model,
      system: sys,
      messages: [{ role: 'user' as const, content: JSON.stringify(user) }],
      json: true,
      temperature: 0,
      top_p: 1,
      max_output_tokens: 900,
      meta: {
        scope: 'research.llmSuggest',
        brand: opts.brand,
        category: opts.category,
        market: opts.market,
      },
    }
    const raw = await chat(chatPayload)
    const parsed = JSON.parse(raw || '{}')
    const clean = (arr: any) =>
      Array.isArray(arr)
        ? arr.map((x: any) => ({ title: String(x?.title || ''), url: String(x?.url || ''), why: x?.why ? String(x.why) : undefined }))
            .filter((x: any) => x.title && x.url && /^https?:/i.test(x.url))
            .slice(0, 8)
        : []
    const out: LlmSuggestOut = {
      brandSources: clean(parsed.brandSources),
      categorySources: clean(parsed.categorySources),
      audienceSources: clean(parsed.audienceSources),
      retailerSources: clean(parsed.retailerSources),
      promoSources: clean(parsed.promoSources)
    }
    const hasData = Object.values(out).some((arr) => Array.isArray(arr) && arr.length)
    if (hasData) {
      await logLlmInsight({
        campaignId: opts.campaignId,
        market: opts.market,
        category: opts.category,
        promoType: opts.promoType,
        intent: 'RESEARCH_SOURCE_SUGGEST',
        payload: out,
        prompt: JSON.stringify({ system: sys, user }),
        model,
        confidence: 0.5,
      })
    }
    return out
  } catch {
    return null
  }
}

/* ---------------------------- HTTP fetch helpers -------------------------- */

async function fetchJSON(url: string, opts: RequestInit = {}, timeoutMs = 10000): Promise<any | null> {
  if (!fetchFn) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchFn(url, { ...opts, signal: ctrl.signal })
    if (!res.ok) return null
    return await res.json().catch(() => null)
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function fetchText(url: string, timeoutMs = 10000, lang = 'en-AU'): Promise<string | null> {
  if (!fetchFn) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchFn(url, { signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 TrudyResearch/1.1', 'accept-language': lang } })
    if (!res.ok) return null
    const text = await res.text()
    return text
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

/* ------------------------------- Main entry ------------------------------- */

export async function runResearch(
  ctx: CampaignContext,
  level: ResearchLevel = 'LITE',
  opts: { forceRefresh?: boolean } = {}
): Promise<ResearchPack | null> {
  try {
    if (!opts.forceRefresh && level !== 'MAX') {
      const cached = await loadCachedResearch(ctx.id, level)
      if (cached) return cached
      console.info(JSON.stringify({ type: 'research.cache.miss', campaignId: ctx.id, level }))
    }

    if (!fetchFn) return null

    const brandRaw = safe((ctx.briefSpec as any)?.brand || ctx.clientName || '')
    const categoryRaw = safe(ctx.category || (ctx.briefSpec as any)?.category || '')
    const briefCompetitors = Array.isArray(ctx.briefSpec?.competitors) ? (ctx.briefSpec!.competitors as string[]) : []
    const activationProfile = ctx.activationProfile
    const briefRetailers = uniqueStrings([
      ...(Array.isArray((ctx.briefSpec as any)?.retailers) ? ((ctx.briefSpec as any).retailers as string[]) : []),
      ...(activationProfile?.retailerBanners ?? []),
    ])

    const brief = ctx.briefSpec || {}
    const marketLabel = safe(ctx.market || 'Australia') || 'Australia'

    const audienceProfile = ctx.audienceProfile || ({} as any)
    const personaHints = uniqueStrings([
      String(audienceProfile.summary ?? ''),
      String(audienceProfile.mindset ?? ''),
      String(audienceProfile.behaviour ?? ''),
      ...(
        Array.isArray(audienceProfile.signals)
          ? audienceProfile.signals.map((signal: any) => String(signal ?? ''))
          : []
      ),
    ], 12)
    const personaKeywordTokens = uniqueStrings(
      personaHints
        .flatMap((hint) =>
          String(hint || '')
            .split(/[^a-z0-9]+/i)
            .map((token) => token.trim().toLowerCase())
            .filter((token) => token.length >= 3)),
      24,
    )
    const audienceDescriptors = uniqueStrings([
      ...briefList((brief as any).audience),
      ...briefList((brief as any).targetAudience),
      ...briefList((brief as any).target),
      ...briefList((brief as any).audienceSegments),
      ...briefList((brief as any).loyaltyTier?.summary),
      ...personaHints,
    ], 18)

    const buyerTensions = uniqueStrings([
      ...briefList((brief as any).buyerTensions),
      ...briefList(audienceProfile?.signals),
    ], 12)
    const purchaseTriggers = uniqueStrings(briefList((brief as any).purchaseTriggers), 12)
    const brandTruths = uniqueStrings(briefList((brief as any).brandTruths), 8)
  const distinctiveAssets = uniqueStrings([
    ...briefList((brief as any).distinctiveAssets?.visual),
    ...briefList((brief as any).distinctiveAssets?.verbal),
    ...briefList((brief as any).distinctiveAssets?.ritual),
  ], 12)
    const toneOfVoice = uniqueStrings([
      ...briefList((brief as any).toneOfVoice?.do),
      ...briefList((brief as any).toneOfVoice?.dont),
    ], 12)
    const keyObjectives = uniqueStrings(briefList([(brief as any).primaryObjective, (brief as any).primaryKpi, (brief as any).secondaryKpis]), 8)
  const keyChannels = uniqueStrings([
    ...briefList((brief as any).media),
    ...(activationProfile?.activationChannels ?? []),
  ], 10)
    const hookSignals = uniqueStrings([
      safe((brief as any).hook),
      safe((brief as any).mechanicOneLiner),
      safe((brief as any).cadenceCopy),
    ], 10)
  const prizeSignals = uniqueStrings([
    safe((brief as any).heroPrize),
    safe((brief as any).rewardUnit),
    safe((brief as any).prizeBudgetNotes),
  ], 10)

  const onPremise = activationProfile?.onPremise ?? detectOnPremiseCampaign(briefRetailers, keyChannels, brief)

    const { gl, hl } = marketToGLHL(ctx.market)
    const catType = classifyCategory(ctx)
    const liquorSub: LiquorSub = catType === 'ALCOHOL' ? classifyLiquorSubcategory(ctx) : 'UNKNOWN'
    const assured = isAssuredValue(ctx)

    // Normalize brand/category with Wikipedia suggestion (helps typos like “Westinhouse”)
    const brandTitle = brandRaw ? (await wikipediaOpenSearch(brandRaw)) || brandRaw : ''
    const categoryTitle = categoryRaw ? (await wikipediaOpenSearch(categoryRaw)) || categoryRaw : ''

    // Retailers by category
    let retailerNames: string[] = []
    if (briefRetailers.length) {
      retailerNames = briefRetailers
    } else {
      switch (catType) {
        case 'ALCOHOL': retailerNames = DEFAULT_LIQUOR_RETAILERS_AU; break
        case 'ENERGY':
        case 'FMCG':
        case 'COFFEE':
        case 'DAIRY':
        case 'CHEESE':
        case 'SNACKS': retailerNames = DEFAULT_GROCERY_RETAILERS_AU; break
        case 'APPLIANCES':
        case 'ELECTRONICS': retailerNames = DEFAULT_RETAILERS_AU; break
        case 'TELCO': retailerNames = DEFAULT_TELCO_RETAILERS_AU; break
        case 'INSURANCE': retailerNames = DEFAULT_INSURANCE_RETAILERS_AU; break
        case 'BANKING': retailerNames = DEFAULT_BANKING_RETAILERS_AU; break
        case 'QSR': retailerNames = DEFAULT_QSR_RETAILERS_AU; break
        case 'BEAUTY': retailerNames = DEFAULT_BEAUTY_RETAILERS_AU; break
        case 'PET': retailerNames = DEFAULT_PET_RETAILERS_AU; break
        default: retailerNames = []
      }
    }

    const dessertCategory = /\b(dessert|pudding|custard|frozen dessert|ice cream|gelato|sweet treat|protein pudding)\b/i.test(
      [categoryTitle, brandTitle, ctx.title || ''].join(' ')
    )

    // Competitors by category
    let competitorNames: string[] = []
    if (briefCompetitors.length) {
      competitorNames = briefCompetitors.map(safe)
    } else {
      switch (catType) {
        case 'ALCOHOL':
          competitorNames =
            liquorSub === 'WINE'    ? DEFAULT_WINE_COMPETITORS
          : liquorSub === 'SPIRITS' ? DEFAULT_SPIRITS_COMPETITORS
          : liquorSub === 'CIDER'   ? DEFAULT_CIDER_COMPETITORS
          : liquorSub === 'RTD'     ? DEFAULT_RTD_COMPETITORS
          : DEFAULT_BEER_COMPETITORS
          break
        case 'ENERGY': competitorNames = DEFAULT_ENERGY_COMPETITORS; break
        case 'APPLIANCES': competitorNames = DEFAULT_APPLIANCE_COMPETITORS; break
        case 'ELECTRONICS': competitorNames = DEFAULT_APPLIANCE_COMPETITORS; break
        case 'TELCO': competitorNames = DEFAULT_TELCO_COMPETITORS; break
        case 'INSURANCE': competitorNames = DEFAULT_INSURANCE_COMPETITORS; break
        case 'BANKING': competitorNames = DEFAULT_BANKING_COMPETITORS; break
        case 'QSR': competitorNames = DEFAULT_QSR_COMPETITORS; break
        case 'BEAUTY': competitorNames = DEFAULT_BEAUTY_COMPETITORS; break
        case 'PET': competitorNames = DEFAULT_PET_COMPETITORS; break
        case 'COFFEE': competitorNames = DEFAULT_COFFEE_COMPETITORS; break
        case 'DAIRY': competitorNames = DEFAULT_DAIRY_COMPETITORS; break
        case 'CHEESE': competitorNames = DEFAULT_CHEESE_COMPETITORS; break
        case 'SNACKS':
          competitorNames = dessertCategory ? DEFAULT_DESSERT_COMPETITORS : DEFAULT_SNACKS_COMPETITORS
          break
        default: competitorNames = []
      }
    }

    if (!briefCompetitors.length && dessertCategory && !competitorNames.length) {
      competitorNames = DEFAULT_DESSERT_COMPETITORS.slice(0, 10)
    }

    // Auto-discover generic/FMCG and merge (robust brandish filter prevents junk like “Browse”, “Best”, etc.)
    const allowCompetitorDiscovery = !['APPLIANCES','ELECTRONICS'].includes(catType)
    if (categoryTitle && allowCompetitorDiscovery) {
      const discovered = await discoverCompetitors(categoryTitle, (ctx.market || 'Australia'), brandTitle)
      if (discovered.length) {
        competitorNames = uniqueStrings([...(competitorNames || []), ...discovered]).slice(0, 14)
      }
    }

    const brandExclusionTokens = uniqueStrings([brandTitle, ctx.clientName || '', ctx.title || ''])
      .map((token) => token.toLowerCase())
      .filter(Boolean)
    if (brandExclusionTokens.length) {
      competitorNames = competitorNames.filter((name) => {
        const lower = name.toLowerCase()
        return !brandExclusionTokens.some((token) => token && lower.includes(token))
      })
    }
    if (!competitorNames.length && dessertCategory && !briefCompetitors.length) {
      competitorNames = DEFAULT_DESSERT_COMPETITORS.slice(0, 10)
    }
    if (dessertCategory) {
      competitorNames = uniqueStrings([...DEFAULT_DESSERT_COMPETITORS, ...competitorNames])
        .filter((name) => {
          if (DEFAULT_DESSERT_COMPETITORS.includes(name)) return true
          const first = name.split(/\s+/)[0]?.toLowerCase() || ''
          if (CATEGORY_WORDS.has(first) || GENERIC_WORD_TOKENS.has(first)) return false
          return true
        })
        .slice(0, 12)
    }

    const alcoholContext = inferAlcoholContext(ctx, retailerNames)

    const warnings: string[] = []
    const usedFallbacks: string[] = []
    const logs: string[] = []

    /* ---- Encyclopaedic summaries (brand & category) ---- */
    const [brandSum, catSum] = await Promise.all([
      brandTitle ? wikipediaSummary(brandTitle) : Promise.resolve(null),
      categoryTitle ? wikipediaSummary(categoryTitle) : Promise.resolve(null),
    ])

    const pack: ResearchPack = {
      brand: {
        query: brandTitle || null,
        summary: brandSum?.extract,
        facts: brandSum ? [{
          claim: brandSum.extract.slice(0, 280) + (brandSum.extract.length > 280 ? '…' : ''),
          source: `Source: Wikipedia — ${brandSum.title} (${brandSum.url})`
        }] : []
      },
      audience: { notes: '', facts: [] },
      category: {
        query: categoryTitle || null,
        summary: catSum?.extract,
        facts: catSum ? [{
          claim: catSum.extract.slice(0, 280) + (catSum.extract.length > 280 ? '…' : ''),
          source: `Source: Wikipedia — ${catSum.title} (${catSum.url})`
        }] : []
      },
      competitors: { names: competitorNames, facts: [], promos: [] },
      retailers: { names: retailerNames.map(safe), facts: [] },
      season: { label: seasonLabel(ctx), facts: [] },
      market: { facts: [] },
      signals: { facts: [] },
      benchmarks: undefined,
      meta: {
        level,
        warnings,
        usedFallbacks,
        searchProvider: (SERPER ? 'serper' : (BRAVE ? 'brave' : 'none')),
        logs: DEBUG ? logs : undefined
      }
    }

    const briefSignals: Fact[] = []
    pushBriefFacts(briefSignals, 'Client', safe(ctx.clientName))
    pushBriefFacts(briefSignals, 'Brand', brandRaw)
    pushBriefFacts(briefSignals, 'Campaign objective', safe((brief as any).primaryObjective || (brief as any).primaryKpi))
    pushBriefFacts(briefSignals, 'Secondary KPIs', uniqueStrings(briefList((brief as any).secondaryKpis), 6))
    pushBriefFacts(briefSignals, 'Promotion type', safe((brief as any).typeOfPromotion))
    pushBriefFacts(briefSignals, 'Mechanic', safe((brief as any).mechanicOneLiner))
    pushBriefFacts(briefSignals, 'Hook', safe((brief as any).hook))
    pushBriefFacts(briefSignals, 'Reward unit', safe((brief as any).rewardUnit))
    pushBriefFacts(briefSignals, 'Budget band', safe((brief as any).budgetBand))
    pushBriefFacts(briefSignals, 'Channels', keyChannels)
    pushBriefFacts(briefSignals, 'Season/theme', safe((brief as any).calendarTheme))
    pushBriefFacts(briefSignals, 'Staff burden', safe((brief as any).staffBurden))
    pushBriefFacts(briefSignals, 'Proof requirement', safe((brief as any).proofType))
    pushBriefFacts(briefSignals, 'Entry mechanic cues', hookSignals)
    pushBriefFacts(briefSignals, 'Prize cues', prizeSignals)
    pushBriefFacts(briefSignals, 'Buyer tensions', buyerTensions)
    pushBriefFacts(briefSignals, 'Purchase triggers', purchaseTriggers)
    pushBriefFacts(briefSignals, 'Tone of voice', toneOfVoice)
    if (briefSignals.length) {
      pack.signals.facts.push(...briefSignals)
    }

    const audienceFromBrief = uniqueStrings([
      ...audienceDescriptors,
      safe((brief as any).primaryAudience),
      safe((brief as any).audienceSummary),
    ].filter(Boolean) as string[], 10)
    if (audienceFromBrief.length) {
      pack.audience.notes = audienceFromBrief.join(' • ')
      pack.audience.facts.push(...audienceFromBrief.map(a => ({ claim: `Audience focus: ${a}`, source: 'Source: brief' })))
    }

    if (brandTruths.length) pushBriefFacts(pack.brand.facts, 'Brand truths', brandTruths)
    if (distinctiveAssets.length) pushBriefFacts(pack.category.facts, 'Distinctive asset', distinctiveAssets)
    if (briefRetailers.length) pushBriefFacts(pack.retailers.facts, 'Priority retailer', uniqueStrings(briefRetailers, 10))
    if (briefCompetitors.length) pushBriefFacts(pack.competitors.facts, 'Brief competitor', uniqueStrings(briefCompetitors, 10))
    pushBriefFacts(pack.market.facts, 'Primary market', marketLabel)
    if (safe(ctx.title)) pushBriefFacts(pack.signals.facts, 'Campaign title', safe(ctx.title))

    // Brief-sourced IP tie-in signal (no web fetch): makes the tie-up explicit downstream
    const ip = (ctx.briefSpec as any)?.ipTieIn
    if (ip && (ip.franchise || ip.theme || ip.activationType || ip.eventWindow || ip.partner || ip.notes)) {
      const headline = [ip.franchise, ip.theme].filter(Boolean).join(' — ')
      const detailParts = [
        ip.activationType ? `type: ${ip.activationType}` : null,
        ip.eventWindow ? `window: ${ip.eventWindow}` : null,
        ip.partner ? `partner: ${ip.partner}` : null,
        ip.notes ? ip.notes : null,
      ].filter(Boolean)
      const segments = [headline, ...detailParts].filter(Boolean).join(' | ')
      pack.signals.facts.push({
        claim: `IP tie-in briefed (${ip.licensed ? 'licensed' : 'pending'}): ${segments || 'details TBC'}.`,
        source: 'Source: brief'
      })
    }

    /* ---- Category fallbacks so packs are never thin ---- */
    const addIndicative = (arr: Fact[], ...facts: string[]) => {
      for (const f of facts) arr.push({ claim: f, source: 'Source: indicative (category playbook)' })
    }

    switch (catType) {
      case 'TELCO':
        addIndicative(pack.audience.facts,
          'Bundled value (handset, data, streaming) drives sign-ups; fees and contract lock-ins are barriers.',
          'Clarity on allowances (GB), throttling and extras reduces perceived risk.'
        )
        addIndicative(pack.retailers.facts,
          'Carrier stores and big-box partners (JB Hi-Fi, Harvey Norman) are primary channels for plan push.',
          'Plan promos often use instant-win codes or gift cards for activation at POS.'
        )
        break
      case 'INSURANCE':
        addIndicative(pack.audience.facts,
          'Trust and claims simplicity outweigh small premium differences; renewal inertia is strong.',
          'Promos work when they avoid fine-print traps and emphasise transparency.'
        )
        addIndicative(pack.retailers.facts,
          'Direct online, aggregator sites, and owned CRM are key sales channels in AU.',
        )
        break
      case 'BANKING':
        addIndicative(pack.audience.facts,
          'Upfront clarity on fees, interest, and eligibility is essential; perceived hassle suppresses uptake.',
        )
        break
      case 'QSR':
        addIndicative(pack.audience.facts,
          'Recency and convenience drive choice; limited-time offers and collectibles lift repeat.',
        )
        addIndicative(pack.retailers.facts,
          'Stores need zero staff adjudication; POS kits must be simple and durable.',
        )
        break
      case 'BEAUTY':
        addIndicative(pack.audience.facts,
          'Trial and visible value (mini, GWP) outperform abstract prize chances; UGC/social proof helps.',
        )
        addIndicative(pack.retailers.facts,
          'Pharmacy and specialty retailers rely on testers and gift sets; loyalty programs are activation points.',
        )
        break
      case 'PET':
        addIndicative(pack.audience.facts,
          'Health and ingredient reassurance drive trade-ups; vet endorsement cues reduce risk.',
        )
        break
      case 'COFFEE':
        addIndicative(pack.audience.facts,
          'Routine and habit cues (morning ritual) matter; immediate value (bonus pods, mugs) beats remote prizes.',
        )
        break
      case 'DAIRY':
      case 'CHEESE':
      case 'SNACKS':
      case 'FMCG':
        addIndicative(pack.audience.facts,
          'Fast, on-pack mechanics at shelf perform best; many-winner cues improve perceived odds.',
          'Primary grocery buyers (often mums) purchase chilled desserts for the household; the eater and buyer differ, so cues must reassure the gatekeeper and excite the family.',
          'Cost-of-living pressure forces shoppers to justify “little luxuries”; desserts that signal affordable indulgence win space in tight baskets.'
        )
        addIndicative(pack.retailers.facts,
          'Grocery and convenience require simple POS and clear entry triggers; avoid staff involvement.',
          'Coles and Woolworths control the bulk of chilled dessert facings; incremental traffic proof is required each range review to defend space versus private label and Sara Lee.',
          'Freezer space is rationed, so smaller brands must bring exclusive mechanic support or co-fund promotions to stay ranged across majors and key independents.'
        )
        break
      case 'APPLIANCES':
      case 'ELECTRONICS':
        addIndicative(pack.audience.facts,
          'Considered purchases: concrete value (bonus gift, cashback) and trusted retailer cues lift conversion.',
        )
        break
    }

    /* ---- Exit early for LITE ---- */
    if (level === 'LITE') return pack

    /* ---- LIVE SEARCHED FACTS (brand/category/audience/market/retailers) ---- */
    const maybeCashback = (...qs: string[]) => assured ? qs : ([] as string[])

    const qRetailReality = buildRetailRealityQueries({
      brand: brandTitle,
      category: categoryTitle,
      retailers: retailerNames,
      competitors: competitorNames,
      market: marketLabel,
    })
    const qShopperTensionsExtra = buildShopperTensionQueries({
      brand: brandTitle,
      category: categoryTitle,
      market: marketLabel,
    })

function buildRetailRealityQueries(opts: {
  brand?: string | null
  category?: string | null
  retailers: string[]
  competitors: string[]
  market: string
}): string[] {
  const majors = ['Coles', 'Woolworths']
  const retailerFocus = uniqueStrings([...majors, ...opts.retailers], 6)
  const queries: string[] = []
  for (const retailer of retailerFocus) {
    queries.push(
      `${retailer} freezer space ${opts.category || 'promotion'} ${opts.market}`,
      `${retailer} range review ${opts.category || 'dessert'} ${opts.market}`,
      `${retailer} shelf space competition ${opts.category || 'dessert'}`
    )
  }
  if (opts.brand) {
    queries.push(
      `${opts.brand} Coles ranging`,
      `${opts.brand} Woolworths range`,
      `${opts.brand} freezer facings Australia`
    )
  }
  const cat = opts.category || 'frozen dessert'
  queries.push(
    `${cat} freezer space Australia`,
    `${cat} shelf share supermarket`,
    `${cat} private label competition Australia`,
    `${cat} range review Coles`,
    `${cat} range review Woolworths`,
    `${cat} independent grocer freezer`
  )
  for (const comp of opts.competitors.slice(0, 4)) {
    queries.push(`${comp} freezer space Coles`, `${comp} Woolworths freezer`)
  }
  return uniqueStrings(queries.filter(Boolean), 32)
}

function buildShopperTensionQueries(opts: {
  brand?: string | null
  category?: string | null
  market: string
}): string[] {
  const cat = opts.category || 'dessert'
  const base = [
    `${cat} treat cost of living ${opts.market}`,
    `${cat} grocery budget indulgence ${opts.market}`,
    `${cat} family dessert sharing insight`,
    `${cat} shopper mum buying for family`,
    `${cat} affordable luxury Australia`,
    `cost of living grocery treat australia`,
    `grocery buyer vs eater insight australia`
  ]
  if (opts.brand) {
    base.push(
      `${opts.brand} shopper insight australia`,
      `${opts.brand} cost of living`,
      `${opts.brand} treat mom insight`
    )
  }
  return uniqueStrings(base.filter(Boolean), 24)
}

    const qBrand: string[] = []
    if (brandTitle) {
      qBrand.push(
        `${brandTitle} shopper promotion ${marketLabel}`,
        `${brandTitle} consumer insights ${marketLabel}`,
        `${brandTitle} brand campaign ${marketLabel}`
      )
      for (const objective of keyObjectives.slice(0, 4)) {
        qBrand.push(`${brandTitle} ${objective} promotion ${marketLabel}`)
      }
      for (const hook of hookSignals.slice(0, 3)) {
        qBrand.push(`${brandTitle} ${hook} promotion ${marketLabel}`)
      }
    }

    switch (catType) {
      case 'ALCOHOL':
        qBrand.push(`${brandTitle} Australia`, `${brandTitle} win competition Australia`, `${brandTitle} gift with purchase Australia`)
        break
      case 'ENERGY':
      case 'FMCG':
      case 'COFFEE':
      case 'DAIRY':
      case 'CHEESE':
      case 'SNACKS':
        qBrand.push(`${brandTitle} Australia`, `${brandTitle} instant win Australia`, `${brandTitle} prize draw Australia`, `${brandTitle} on-pack promotion Australia`)
        break
      case 'TELCO':
        qBrand.push(`${brandTitle} Australia`, `${brandTitle} plan bonus Australia`, `${brandTitle} competition Australia`)
        break
      case 'INSURANCE':
        qBrand.push(`${brandTitle} Australia`, `${brandTitle} promotion Australia`, `${brandTitle} competition Australia`)
        break
      case 'BANKING':
        qBrand.push(`${brandTitle} Australia`, `${brandTitle} bonus offer Australia`, `${brandTitle} competition Australia`)
        break
      case 'QSR':
        qBrand.push(`${brandTitle} Australia`, `${brandTitle} instant win Australia`, `${brandTitle} prize Australia`)
        break
      case 'APPLIANCES':
      case 'ELECTRONICS':
        qBrand.push(`${brandTitle} Australia`, ...maybeCashback(`${brandTitle} cashback Australia`), `${brandTitle} prize draw Australia`)
        break
      default:
        qBrand.push(`${brandTitle} Australia`, ...maybeCashback(`${brandTitle} cashback Australia`), `${brandTitle} prize draw Australia`)
    }

    const qCategory: string[] = []
    switch (catType) {
      case 'ALCOHOL':
        qCategory.push(`${categoryTitle} Australia promotion`, `${categoryTitle} prize draw Australia`, `${categoryTitle} gift with purchase Australia`)
        break
      case 'ENERGY':
      case 'FMCG':
      case 'COFFEE':
      case 'DAIRY':
      case 'CHEESE':
      case 'SNACKS':
        qCategory.push(`${categoryTitle} promotions Australia`, `${categoryTitle} instant win Australia`, `${categoryTitle} on-pack promotion Australia`)
        break
      case 'TELCO':
        qCategory.push(`${categoryTitle} Australia plan promotion`, `${categoryTitle} bonus gift Australia`)
        break
      case 'INSURANCE':
        qCategory.push(`${categoryTitle} Australia promotion`, `${categoryTitle} prize draw Australia`)
        break
      case 'BANKING':
        qCategory.push(`${categoryTitle} Australia promotion`, `${categoryTitle} prize draw Australia`)
        break
      case 'QSR':
        qCategory.push(`${categoryTitle} instant win Australia`, `${categoryTitle} app rewards Australia`)
        break
      case 'APPLIANCES':
      case 'ELECTRONICS':
        qCategory.push(`${categoryTitle} Australia promotion`, ...maybeCashback(`${categoryTitle} cashback Australia`), `${categoryTitle} prize draw Australia`)
        break
      default:
        qCategory.push(`${categoryTitle} Australia market trend`, `${categoryTitle} promotion Australia`)
    }

    const qAudience: string[] = []
    if (brandTitle) {
      qAudience.push(
        `${brandTitle} shopper insights ${marketLabel}`,
        `${brandTitle} consumer research ${marketLabel}`,
        `${brandTitle} buyer insight ${marketLabel}`,
        `${brandTitle} audience profile Australia`
      )
    }
    for (const descriptor of audienceDescriptors.slice(0, 6)) {
      qAudience.push(`${descriptor} shopper insights ${marketLabel}`)
      qAudience.push(`${descriptor} promotion response ${marketLabel}`)
    }
    for (const tension of buyerTensions.slice(0, 5)) {
      qAudience.push(`${tension} consumer tension ${marketLabel}`)
    }
    for (const trigger of purchaseTriggers.slice(0, 5)) {
      qAudience.push(`${trigger} purchase trigger insights ${marketLabel}`)
    }
    for (const channel of keyChannels.slice(0, 4)) {
      qAudience.push(`${channel} shopper behaviour ${marketLabel}`)
    }
    switch (catType) {
      case 'ALCOHOL':
        qAudience.push('Australia liquor promotion regulations RSA ABAC', 'Australia liquor shopper trends prize draws', `${categoryTitle} purchase drivers Australia`)
        break
      case 'TELCO':
        qAudience.push('ACMA Australia telco customer complaints summary', 'Australia mobile plan purchase drivers', 'telco promo response Australia')
        break
      case 'INSURANCE':
        qAudience.push('ASIC Australia insurance consumer insights', 'insurance purchase drivers Australia', 'claims simplicity consumer research AU')
        break
      case 'BANKING':
        qAudience.push('ASIC Australia banking consumer insights', 'credit card sign-up drivers Australia', 'bank promotions Australia')
        break
      case 'QSR':
        qAudience.push('Australia quick service restaurant consumer trends', 'QSR promotions Australia app rewards')
        break
      case 'APPLIANCES':
      case 'ELECTRONICS':
        qAudience.push('Australia consumer durables purchase drivers', 'electronics retail promotion trends AU')
        break
      default:
        qAudience.push('Australia grocery shopper promotion trends', 'front-of-store impulse purchase research Australia', 'AU retail promotional response study')
    }

    const qCompetitors: string[] = []
    const qCompetitorProfiles: string[] = []
    for (const comp of competitorNames.slice(0, 8)) {
      const base = `${comp} promotion ${marketLabel}`
      qCompetitors.push(base)
      if (catType === 'FMCG' || catType === 'SNACKS' || catType === 'DAIRY' || catType === 'COFFEE') {
        qCompetitors.push(`${comp} instant win ${marketLabel}`, `${comp} movie ticket promotion`)
      } else if (catType === 'ALCOHOL') {
        qCompetitors.push(`${comp} tasting experience Australia`)
      } else {
        qCompetitors.push(`${comp} competition ${marketLabel}`)
      }
      qCompetitorProfiles.push(
        `${comp} brand overview ${marketLabel}`,
        `${comp} chilled dessert brand Australia`,
        `${comp} shopper insight ${marketLabel}`,
        `${comp} retail distribution Australia`
      )
      if (brandTitle) {
        qCompetitorProfiles.push(
          `${brandTitle} vs ${comp}`,
          `${brandTitle} and ${comp} market share`,
          `${brandTitle} ${comp} comparison Australia`
        )
      }
    }
    const competitorProfileQueries = uniqueStrings(qCompetitorProfiles, 48)

    const qMarket: string[] = []
    switch (catType) {
      case 'ALCOHOL': {
        const sub =
          liquorSub === 'WINE' ? 'wine'
          : liquorSub === 'SPIRITS' ? 'spirits'
          : liquorSub === 'CIDER' ? 'cider'
          : liquorSub === 'RTD' ? 'RTD'
          : 'beer'
        qMarket.push('Australia liquor retail trends Nielsen IRI', `Australia ${sub} category promotion trends`)
        break
      }
      case 'TELCO':
        qMarket.push('Australia telco market share ACMA', 'mobile plan market trends Australia')
        break
      case 'INSURANCE':
        qMarket.push('Australia insurance market trends', 'insurance customer behaviour Australia')
        break
      case 'BANKING':
        qMarket.push('Australia consumer banking trends', 'credit card acquisition Australia trends')
        break
      case 'QSR':
        qMarket.push('Australia QSR market trends', 'QSR promotions Australia')
        break
      case 'APPLIANCES':
      case 'ELECTRONICS':
        qMarket.push('Australia electronics retail trends', 'durables category growth Australia')
        break
      default:
        qMarket.push('Australia grocery & convenience retail trends', `${categoryTitle} category growth Australia`)
    }
    if (brandTitle) {
      qMarket.push(
        `${brandTitle} market share ${marketLabel}`,
        `${brandTitle} category performance ${marketLabel}`,
        `${brandTitle} sales growth ${marketLabel}`
      )
    }

    const qRetailers: string[] = []
    for (const r of retailerNames.slice(0, 8)) {
      if (brandTitle) {
        qRetailers.push(
          `${brandTitle} ${r} promotion ${marketLabel}`,
          `${brandTitle} ${r} activation Australia`,
          `${brandTitle} ${r} buyer pitch`,
          `${brandTitle} ${r} range review`,
          `${brandTitle} ${r} case study`
        )
      }
      switch (catType) {
        case 'ALCOHOL':
          qRetailers.push(`${r} prize draw Australia`, `${r} instant win Australia`, `${r} bonus gift Australia`)
          break
        case 'ENERGY':
        case 'FMCG':
        case 'COFFEE':
        case 'DAIRY':
        case 'CHEESE':
        case 'SNACKS':
          qRetailers.push(`${r} instant win Australia`, `${r} prize draw Australia`, `${r} on-pack promotion Australia`, `${r} dessert promotion Australia`)
          break
        case 'APPLIANCES':
        case 'ELECTRONICS':
          qRetailers.push(`${r} prize draw Australia`, `${r} instant win Australia`, ...maybeCashback(`${r} cashback Australia`), `${r} bonus gift Australia`)
          break
        case 'TELCO':
        case 'INSURANCE':
        case 'BANKING':
          qRetailers.push(`${r} competition Australia`, `${r} prize Australia`, `${r} bonus offer Australia`)
          break
        case 'QSR':
          qRetailers.push(`${r} instant win Australia`, `${r} app rewards Australia`, `${r} competition Australia`)
          break
      }
    }
    if (brandTitle) {
      qRetailers.push(
        `${brandTitle} ranging Australia`,
        `${brandTitle} retail buyer feedback`,
        `${brandTitle} supermarket partnership Australia`
      )
    }

    async function runAndToFacts(queries: string[], numPer = 6, capFacts = 10): Promise<Fact[]> {
      const all: SearchResult[] = []
      for (const q of queries.filter(Boolean)) {
        // eslint-disable-next-line no-await-in-loop
        const { provider, results } = await runSearch(q, { num: numPer, gl, hl })
        if (provider === 'none') usedFallbacks.push(`no-provider:${q}`)
        if (DEBUG) logs.push(`search:${provider}:${q} -> ${results.length}`)
        const filtered = filterResultsAlcoholAware(results, { alcohol: alcoholContext, onPremise })
        all.push(...filtered)
      }
      return capArr(toFacts(uniqBy(all, r => (r.url || '')).slice(0, 40)), capFacts)
    }

    // Primary: provider-based facts
    const [brandFactsLive, catFactsLive, audFactsLive, marketFactsLive, retailerFactsLive] = await Promise.all([
      runAndToFacts(qBrand, 6, 12),
      runAndToFacts(qCategory, 6, 12),
      runAndToFacts(qAudience, 6, 10),
      runAndToFacts(qMarket, 6, 10),
      runAndToFacts(qRetailers, 6, 12),
    ])

    const [retailerRealityFacts, shopperPressureFacts] = await Promise.all([
      qRetailReality.length ? runAndToFacts(qRetailReality, 5, 10) : Promise.resolve([]),
      qShopperTensionsExtra.length ? runAndToFacts(qShopperTensionsExtra, 5, 10) : Promise.resolve([]),
    ])

    pack.brand.facts = filterOutUSDFacts(capArr(uniqBy([...(pack.brand.facts || []), ...brandFactsLive], f => f.source), 12))
    pack.category.facts = filterOutUSDFacts(capArr(uniqBy([...(pack.category.facts || []), ...catFactsLive], f => f.source), 12))
    pack.audience.facts = capArr(uniqBy([...(pack.audience.facts || []), ...audFactsLive, ...shopperPressureFacts], f => f.source), 12)
    pack.market.facts = capArr(uniqBy([...(pack.market.facts || []), ...marketFactsLive], f => f.source), 12)
    pack.retailers.facts = capArr(uniqBy([...(pack.retailers.facts || []), ...retailerFactsLive, ...retailerRealityFacts], f => f.source), 14)

    const competitorFactsLive = qCompetitors.length ? await runAndToFacts(qCompetitors, 6, 12) : []
    const competitorProfileFacts = competitorProfileQueries.length ? await runAndToFacts(competitorProfileQueries, 6, 12) : []
    const combinedCompetitorFacts = filterOutUSDFacts([...competitorFactsLive, ...competitorProfileFacts])
    if (combinedCompetitorFacts.length) {
      pack.competitors.facts = capArr(
        uniqBy([...(pack.competitors.facts || []), ...combinedCompetitorFacts], f => f.source),
        12
      )
    }

    if (onPremise) {
      pack.retailers.facts = scrubFactsForOnPremise(pack.retailers.facts)
      pack.audience.facts = scrubFactsForOnPremise(pack.audience.facts)
      pack.market.facts = scrubFactsForOnPremise(pack.market.facts)
    }

    /* ---- LLM propose→verify fallback (URLs only; then we fetch & verify) ---- */
    const thinFacts =
      (pack.brand.facts.length < 2) ||
      (pack.category.facts.length < 2) ||
      (pack.audience.facts.length < 2) ||
      (pack.retailers.facts.length < 2)

    if (USE_LLM && thinFacts) {
      const llm = await llmSuggestSources({
        brand: brandTitle,
        category: categoryTitle,
        market: String(ctx.market || 'AU'),
        retailers: retailerNames,
        competitors: competitorNames,
        assured,
        promoType: ctx.briefSpec?.typeOfPromotion || null,
        campaignId: ctx.id,
      })
      const langHeader = hl === 'en' && gl === 'au' ? 'en-AU' : 'en'

      const toFactsFromUrls = async (sugs?: URLSuggestion[], cap = 8) => {
        const arr = (sugs || []).slice(0, cap)
        const htmls = await mapLimit(arr, CONCURRENCY, async s => {
          if (!s?.url) return null
          if (DOMAIN_BLOCKLIST.some(d => host(s.url).endsWith(d))) return null
          const html = await fetchText(s.url, 10000, langHeader)
          if (!html) return null
          const h = host(s.url)
          const title = s.title || h
          return { title, url: s.url, html }
        })
        const facts: Fact[] = []
        for (const row of (htmls || [])) {
          if (!row) continue
          const snippet = row.html.replace(/\s+/g, ' ').slice(0, 160)
          facts.push({ claim: `${row.title} — ${snippet}`, source: `Source: ${host(row.url)} (${row.url})` })
        }
        return facts.slice(0, cap)
      }

      // Merge verified facts (we keep de-dup logic)
      const merged = async (dst: Fact[], add: Fact[], cap = 12) =>
        capArr(uniqBy([...(dst || []), ...(add || [])], f => f.source), cap)

      if (llm) {
        const [bf, cf, af, rf] = await Promise.all([
          toFactsFromUrls(llm.brandSources, 8),
          toFactsFromUrls(llm.categorySources, 8),
          toFactsFromUrls(llm.audienceSources, 8),
          toFactsFromUrls(llm.retailerSources, 8),
        ])
        pack.brand.facts = await merged(pack.brand.facts, bf || [], 12)
        pack.category.facts = await merged(pack.category.facts, cf || [], 12)
        pack.audience.facts = await merged(pack.audience.facts, af || [], 10)
        pack.retailers.facts = await merged(pack.retailers.facts, rf || [], 12)
      }
    }

    const brandTokens = normaliseTokens([brandTitle, ctx.clientName || '', ctx.title || ''])
    const retailerTokens = normaliseTokens([...retailerNames, ...CORE_RETAILER_TOKENS])
    const marketTokens = normaliseTokens([marketLabel || '', ctx.market || ''])

    const brandHostTokens = brandTokens.filter((token) => token.length >= 4)
    const retailerHostTokens = retailerTokens.filter((token) => token.length >= 3)

    const brandFiltered = brandHostTokens.length ? enforceHostTokenMatch(pack.brand.facts, brandHostTokens) : pack.brand.facts
    const retailerFiltered = retailerHostTokens.length ? enforceHostTokenMatch(pack.retailers.facts, retailerHostTokens) : pack.retailers.facts

    const dessertTokens = ['dessert','pudding','custard','ice cream','movie ticket','wicked','sweet','indulgence']
    pack.brand.facts = filterOutUSDFacts(filterFactsByTokens(requireKeywordPresence(brandFiltered, dessertTokens), brandTokens))
    pack.retailers.facts = filterOutUSDFacts(filterFactsByTokens(retailerFiltered, retailerTokens))
    pack.audience.facts = filterOutUSDFacts(requireKeywordPresence(filterFactsByHostAllowlist(pack.audience.facts, AUDIENCE_HOST_ALLOWLIST), marketTokens))
    pack.market.facts = filterOutUSDFacts(requireKeywordPresence(filterFactsByHostAllowlist(pack.market.facts, MARKET_HOST_ALLOWLIST), marketTokens))

    const insights: ResearchInsights = {
      brand: buildInsightEntries(pack.brand.facts),
      audience: buildInsightEntries(pack.audience.facts),
      retailers: buildInsightEntries(pack.retailers.facts),
      market: buildInsightEntries(pack.market.facts),
      signals: buildInsightEntries(pack.signals?.facts || []),
      competitors: buildInsightEntries(pack.competitors?.facts || []),
    }
    pack.insights = insights
    const marketCode = normaliseMarketCode(String(ctx.market || marketLabel))
    const baseDossier = buildResearchDossier(pack, marketCode, { onPremise, personaKeywords: personaKeywordTokens })
    const brandHints = await getBrandDossierHints(ctx.briefSpec?.brand, ctx.market)
    const dossierWithBrand = applyBrandKnowledgeToDossier(baseDossier, brandHints)
    const editorialDossier = await editorializeDossier(ctx, pack, dossierWithBrand, { logs })
    const finalDossier = editorialDossier
      ? applyBrandKnowledgeToDossier(editorialDossier, brandHints)
      : dossierWithBrand
    pack.dossier = finalDossier

    /* ---- Competitor promotions discovery ---- */
    const qSeeds: string[] = []

    // Competitor-based seeds
    for (const c of pack.competitors.names.slice(0, 14)) {
      switch (catType) {
        case 'ALCOHOL':
          qSeeds.push(`${c} win competition Australia`, `${c} gift with purchase Australia`, `${c} prize draw Australia`, `${c} instant win Australia`)
          if (onPremise) {
            qSeeds.push(
              `${c} pub promotion ${marketLabel}`,
              `${c} bar activation ${marketLabel}`,
              `${c} on premise promotion ${marketLabel}`
            )
          }
          break
        case 'ENERGY':
        case 'FMCG':
        case 'COFFEE':
        case 'DAIRY':
        case 'CHEESE':
        case 'SNACKS':
          qSeeds.push(`${c} instant win Australia`, `${c} prize draw Australia`, `${c} on-pack promotion Australia`, `${c} competition Australia`)
          break
        case 'APPLIANCES':
        case 'ELECTRONICS':
          qSeeds.push(`${c} win competition Australia`, ...maybeCashback(`${c} cashback promotion Australia`), `${c} gift with purchase Australia`, `${c} prize draw Australia`)
          break
        case 'TELCO':
        case 'BANKING':
        case 'INSURANCE':
          qSeeds.push(`${c} competition Australia`, `${c} prize Australia`, `${c} bonus offer Australia`)
          break
        case 'QSR':
          qSeeds.push(`${c} instant win Australia`, `${c} app rewards Australia`, `${c} prize draw Australia`)
          break
        default:
          qSeeds.push(`${c} prize draw Australia`, `${c} competition Australia`)
      }
    }

    // Brand-based seeds
    if (brandTitle) {
      switch (catType) {
        case 'ALCOHOL':
          qSeeds.push(`${brandTitle} prize draw Australia`, `${brandTitle} competition Australia`, `${brandTitle} gift with purchase Australia`)
          if (onPremise) {
            qSeeds.push(
              `${brandTitle} pub promotion ${marketLabel}`,
              `${brandTitle} bar activation ${marketLabel}`,
              `${brandTitle} St Patrick's Day pub promotion`,
              `${brandTitle} on premise promotion ${marketLabel}`
            )
          }
          break
        case 'ENERGY':
        case 'FMCG':
        case 'COFFEE':
        case 'DAIRY':
        case 'CHEESE':
        case 'SNACKS':
          qSeeds.push(`${brandTitle} instant win Australia`, `${brandTitle} prize draw Australia`, `${brandTitle} on-pack promotion Australia`)
          break
        case 'APPLIANCES':
        case 'ELECTRONICS':
          qSeeds.push(...maybeCashback(`${brandTitle} cashback Australia`), `${brandTitle} prize draw Australia`, `${brandTitle} competition Australia`)
          break
        case 'TELCO':
        case 'BANKING':
        case 'INSURANCE':
          qSeeds.push(`${brandTitle} competition Australia`, `${brandTitle} prize Australia`, `${brandTitle} bonus offer Australia`)
          break
        case 'QSR':
          qSeeds.push(`${brandTitle} instant win Australia`, `${brandTitle} app rewards Australia`, `${brandTitle} competition Australia`)
          break
        default:
          qSeeds.push(`${brandTitle} prize draw Australia`, `${brandTitle} competition Australia`)
      }
      for (const hook of hookSignals.slice(0, 3)) {
        qSeeds.push(`${brandTitle} ${hook} promotion ${marketLabel}`)
      }
      for (const r of retailerNames.slice(0, 5)) {
        qSeeds.push(`${brandTitle} ${r} promotion ${marketLabel}`)
      }
    }

    // Category-based seeds
    if (categoryTitle) {
      switch (catType) {
        case 'ALCOHOL':
          qSeeds.push(`${categoryTitle} prize draw Australia`, `${categoryTitle} gift with purchase Australia`, `${categoryTitle} instant win Australia`)
          if (onPremise) {
            qSeeds.push(
              `${categoryTitle} pub promotion ${marketLabel}`,
              `${categoryTitle} bar activation ${marketLabel}`,
              `${categoryTitle} on premise promotion ${marketLabel}`
            )
          }
          break
        case 'ENERGY':
        case 'FMCG':
        case 'COFFEE':
        case 'DAIRY':
        case 'CHEESE':
        case 'SNACKS':
          qSeeds.push(`${categoryTitle} instant win Australia`, `${categoryTitle} prize draw Australia`, `${categoryTitle} on-pack Australia`)
          break
        case 'APPLIANCES':
        case 'ELECTRONICS':
          qSeeds.push(...maybeCashback(`${categoryTitle} cashback Australia`), `${categoryTitle} prize draw Australia`)
          break
        case 'TELCO':
        case 'BANKING':
        case 'INSURANCE':
          qSeeds.push(`${categoryTitle} competition Australia`, `${categoryTitle} prize draw Australia`)
          break
        case 'QSR':
          qSeeds.push(`${categoryTitle} instant win Australia`, `${categoryTitle} app rewards Australia`)
          break
        default:
          qSeeds.push(`${categoryTitle} prize draw Australia`)
      }
    }

    // Retailer-based seeds
    for (const r of pack.retailers.names.slice(0, 10)) {
      switch (catType) {
        case 'ALCOHOL':
          qSeeds.push(`${r} win competition Australia`, `${r} prize draw Australia`, `${r} instant win Australia`, `${r} bonus gift Australia`)
          if (onPremise) {
            qSeeds.push(
              `${r} pub promotion ${marketLabel}`,
              `${r} bar activation ${marketLabel}`,
              `${r} on premise promotion ${marketLabel}`
            )
          }
          break
        case 'ENERGY':
        case 'FMCG':
        case 'COFFEE':
        case 'DAIRY':
        case 'CHEESE':
        case 'SNACKS':
          qSeeds.push(`${r} instant win Australia`, `${r} prize draw Australia`, `${r} on-pack Australia`)
          break
        case 'APPLIANCES':
        case 'ELECTRONICS':
          qSeeds.push(`${r} win competition Australia`, `${r} prize draw Australia`, `${r} instant win Australia`, ...maybeCashback(`${r} cashback Australia`))
          break
        case 'TELCO':
        case 'BANKING':
        case 'INSURANCE':
          qSeeds.push(`${r} competition Australia`, `${r} prize Australia`, `${r} bonus Australia`)
          break
        case 'QSR':
          qSeeds.push(`${r} instant win Australia`, `${r} app rewards Australia`, `${r} competition Australia`)
          break
    }
  }

    if (onPremise) {
      const anchor = brandTitle || ctx.clientName || ctx.title || 'brand'
      qSeeds.push(
        `${anchor} pub activation ${marketLabel}`,
        `${anchor} bar promotion ${marketLabel}`,
        'St Patrick\'s Day pub promotion Australia',
        'on premise bar promotion Australia',
        'pub promotion instant win Australia'
      )
    }

    const maxUrls = level === 'MAX' ? MAX_URLS_MAX : level === 'DEEP' ? Math.min(60, MAX_URLS_MAX) : Math.min(30, MAX_URLS_MAX)
    const queries = Array.from(new Set(qSeeds.filter(q => q && !/^all\s/i.test(q)))).slice(0, maxUrls)

    // Search → fetch pages concurrently → parse promos
    const langHeader = hl === 'en' && gl === 'au' ? 'en-AU' : 'en'

    const resultSets: Array<SearchResult> = []
    for (const q of queries) {
      // eslint-disable-next-line no-await-in-loop
      const { results } = await runSearch(q, { num: 6, gl, hl })
      const filtered = filterResultsAlcoholAware(results, { alcohol: alcoholContext, onPremise })
      resultSets.push(...filtered)
    }

    // Dedup by hostname + path & drop social blocklist again for safety
    const seenHP = new Set<string>()
    const filtered = resultSets.filter(r => {
      try {
        const u = new URL(r.url)
        const key = `${u.hostname}${u.pathname}`.toLowerCase()
        if (DOMAIN_BLOCKLIST.some(d => u.hostname.endsWith(d))) return false
        if (seenHP.has(key)) return false
        seenHP.add(key); return true
      } catch { return false }
    }).slice(0, maxUrls)

    const pages = await mapLimit(filtered, CONCURRENCY, async (r) => {
      let html = await fetchText(r.url, 9000, langHeader)
      if (!html) {
        // one gentle retry
        await sleep(250)
        html = await fetchText(r.url, 14000, langHeader)
      }
      return { r, html }
    })

    for (const { r, html } of pages) {
      if (!html) continue
      const h = host(r.url)
      const signals = extractPromoSignals(html)

      // Must contain a promo signal to include
      if (!signals.type || signals.type === 'OTHER') continue

      // Brand guess: prefer named competitors/retailers present in title/url
      const lowerTitle = (r.title || '').toLowerCase()
      const brandGuess =
        pack.competitors.names.find(n => lowerTitle.includes(n.toLowerCase())) ||
        pack.retailers.names.find(n => lowerTitle.includes(n.toLowerCase())) ||
        (host(r.url).split('.')[0] || '').toUpperCase() ||
        brandTitle ||
        'Unknown'

      const promo: CompetitorPromo = {
        brand: brandGuess,
        url: r.url,
        source: `Source: ${h} (${r.url})`,
        title: signals.title || r.title || null,
        headline: signals.headline || r.snippet || null,
        type: signals.type,
        heroCount: signals.heroCount ?? null,
        totalWinners: signals.totalWinners ?? null,
        cadence: signals.cadence ?? null,
        prizeItems: signals.prizeItems || [],
        prizeValueHint: signals.prizeValueHint || signals.giftCard || null,
        confidence: 0.6,
        viaRedemption: signals.viaRedemption ?? null,
        giftCard: signals.giftCard || null
      }
      if ((promo.type === 'CASHBACK' || promo.type === 'GWP') && !assured) continue
      pack.competitors.promos.push(promo)
    }

    /* ---- LLM promo propose→verify if thin ---- */
    if (USE_LLM && pack.competitors.promos.length < 5) {
      const llm = await llmSuggestSources({
        brand: brandTitle,
        category: categoryTitle,
        market: String(ctx.market || 'AU'),
        retailers: retailerNames,
        competitors: competitorNames,
        assured,
        promoType: ctx.briefSpec?.typeOfPromotion || null,
        campaignId: ctx.id,
      })
      const promos = (llm?.promoSources || []).slice(0, 16)
      const pages2 = await mapLimit(promos, CONCURRENCY, async (p) => {
        if (!p?.url) return null
        if (DOMAIN_BLOCKLIST.some(d => host(p.url).endsWith(d))) return null
        const html = await fetchText(p.url, 10000, langHeader)
        if (!html) return null
        return { p, html }
      })
      for (const row of (pages2 || [])) {
        if (!row) continue
        const signals = extractPromoSignals(row.html)
        if (!signals.type || signals.type === 'OTHER') continue
        const promo: CompetitorPromo = {
          brand: host(row.p.url).split('.')[0]?.toUpperCase() || brandTitle || 'Unknown',
          url: row.p.url,
          source: `Source: ${host(row.p.url)} (${row.p.url})`,
          title: signals.title || row.p.title || null,
          headline: signals.headline || null,
          type: signals.type,
          heroCount: signals.heroCount ?? null,
          totalWinners: signals.totalWinners ?? null,
          cadence: signals.cadence ?? null,
          prizeItems: signals.prizeItems || [],
          prizeValueHint: signals.prizeValueHint || signals.giftCard || null,
          confidence: 0.55,
          viaRedemption: signals.viaRedemption ?? null,
          giftCard: signals.giftCard || null
        }
        if ((promo.type === 'CASHBACK' || promo.type === 'GWP') && !assured) continue
        pack.competitors.promos.push(promo)
      }
    }

    /* ---- Derive promo norms / prize ladder signals + cashback hints ---- */
    const benchmarks: ResearchBenchmarks = {}

    if (pack.competitors.promos.length) {
      const heroes = pack.competitors.promos.map(p => p.heroCount || 0).filter(n => n > 0).sort((a,b)=>a-b)
      const medHero = median(heroes)
      const modeHero = modeNumber(heroes)
      const cadVals = pack.competitors.promos.map(p => p.cadence || '').filter(Boolean)
      const denom = cadVals.length || 1
      const shareInstant = cadVals.filter(c => c === 'instant').length / denom
      const shareWeekly  = cadVals.filter(c => c === 'weekly').length / denom
      const shareDaily   = cadVals.filter(c => c === 'daily').length / denom
      const manyWinnersShare = pack.competitors.promos.filter(p => (p.totalWinners || 0) >= 100).length / pack.competitors.promos.length

      benchmarks.heroPrize = { median: medHero ?? null, mode: modeHero ?? null }
      benchmarks.cadenceShare = { instant: shareInstant, weekly: shareWeekly, daily: shareDaily }
      benchmarks.manyWinnersShare = manyWinnersShare

      // Export-facing: prizeCountsObserved + recommendedHeroCount
      const counts: number[] = heroes
      const total = counts.length
      const freq: Record<number, number> = {}
      counts.forEach(n => { freq[n] = (freq[n] || 0) + 1 })
      const common = Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([k,v]) => ({ count: Number(k), share: total ? v/total : 0 }))
      benchmarks.prizeCountsObserved = { total, common }
      const hasTwo = !!common.find(c => c.count === 2)
      const hasThree = !!common.find(c => c.count === 3)
      benchmarks.recommendedHeroCount = hasTwo ? 2 : hasThree ? 3 : (modeHero || medHero || 3) || 3

      if (medHero) {
        pack.signals.facts.push({ claim: `Recent promos show hero prize counts clustering around ~${medHero}${modeHero && modeHero !== medHero ? ` (mode ≈ ${modeHero})` : ''}.`, source: 'Source: indicative (live promo scan)' })
      }
      if (shareInstant > 0 || shareWeekly > 0 || shareDaily > 0) {
        const cades = [shareInstant > 0 ? 'instant' : '', shareWeekly > 0 ? 'weekly' : '', shareDaily > 0 ? 'daily' : ''].filter(Boolean).join(' & ')
        pack.signals.facts.push({ claim: `Cadence cues common in-market: ${cades}.`, source: 'Source: indicative (live promo scan)' })
      }
    }

    // Cashback absolute values (rough) — only when assured
    if (assured) {
      const cbPromos = pack.competitors.promos.filter(p => p.type === 'CASHBACK')
      const cbAbsVals = cbPromos
        .map(p => p.prizeValueHint)
        .filter(Boolean)
        .map(v => numOrNull(v))
        .filter((n): n is number => Number.isFinite(n))

      const typicalAbs = cbAbsVals.length ? median(cbAbsVals) : null
      const maxAbs = cbAbsVals.length ? Math.max(...cbAbsVals) : null
      const typicalPct: number | null = null
      const maxPct: number | null = null

      benchmarks.cashback = {
        sample: cbPromos.length,
        typicalAbs,
        typicalPct,
        maxAbs,
        maxPct
      }
      benchmarks.cashbackAbs = {
        median: typicalAbs ?? null,
        p25: quantile(cbAbsVals || [], 0.25),
        p75: quantile(cbAbsVals || [], 0.75),
        sampleSize: cbAbsVals.length
      }
    }

    // Position vs market (assured only)
    benchmarks.positionVsMarket = 'UNKNOWN'
    if (assured && benchmarks.cashback?.sample && (benchmarks.cashback.typicalAbs || benchmarks.cashback.typicalPct)) {
      const spec: any = ctx.briefSpec || {}
      const cb = spec.cashback || null
      const asp =
        Number(spec.avgPrice) ||
        Number(spec.averageSellingPrice) ||
        (spec.categoryBenchmarks && Number(spec.categoryBenchmarks?.avgPrice)) ||
        categoryDefaults(ctx.category || '').aspFallback

      const bands = normaliseBands(Array.isArray(cb?.bands) ? cb.bands : [])
      const repAmount = bands.length ? amountFromBandAtASP(bandForASP(bands, asp)!, asp) : Number(cb?.amount || 0)

      const briefAbs = Number.isFinite(repAmount) && repAmount > 0 ? repAmount : null
      const typicalAbs = benchmarks.cashback?.typicalAbs || null
      if (briefAbs && typicalAbs) {
        const ratio = briefAbs / typicalAbs
        benchmarks.positionVsMarket =
          ratio >= 1.15 ? 'ABOVE_TYPICAL'
          : (ratio <= 0.85 ? 'BELOW_TYPICAL' : 'AT_TYPICAL')
      }
    }

    pack.benchmarks = benchmarks

    /* ---- Behavioural evidence ---- */
    if (ENABLE_BEHAVIOURAL_SEARCH) {
      const beQueries = [
        'multiple prize effect sweepstakes perceived odds',
        'denominator neglect promotions many winners',
        'lottery many prizes perceived probability marketing paper'
      ]
      const beFacts: Fact[] = []
      for (const q of beQueries) {
        // eslint-disable-next-line no-await-in-loop
        const { results } = await runSearch(q, { num: 6, gl, hl })
        beFacts.push(...toFacts(filterResultsAlcoholAware(results, { alcohol: alcoholContext, onPremise }), 6))
      }
      const beResults = capArr(uniqBy(beFacts, f => f.source), 6)
      if (beResults.length) {
        pack.market.facts = capArr(uniqBy([...(pack.market.facts || []), ...beResults], f => f.source), 12)
      }
    } else {
      // single indicative note only (no off-category search)
      pack.market.facts.push({
        claim: 'People infer better odds when many winners are visible; cadence visibility (e.g., daily awards) increases perceived fairness.',
        source: 'Source: indicative (behavioural marketing literature)'
      })
    }

    if (DEBUG) {
      logs.push(`catType=${catType}`)
      logs.push(`liquorSub=${liquorSub}`)
      logs.push(`assured=${assured}`)
      logs.push(`promos_collected=${pack.competitors.promos.length}`)
      logs.push(`benchmarks=${JSON.stringify(pack.benchmarks || {})}`)
    }

    const cachedAt = new Date().toISOString()
    pack.meta = { ...(pack.meta || { level }), cachedAt }
    await saveCachedResearch(ctx.id, level, pack)

    return { ...pack, meta: pack.meta }
  } catch (e: any) {
    if (DEBUG) console.error('[research] error', e?.message || e)
    return null
  }
}
