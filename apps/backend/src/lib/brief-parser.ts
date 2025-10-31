// apps/backend/src/lib/brief-parser.ts
import type { Campaign } from '@prisma/client'

export type BriefStruct = {
  clientName?: string
  brand?: string
  campaignTitle?: string

  category?: string
  markets?: string[] // e.g. ["AU:NSW","AU:SA","AU:ACT"]

  startDate?: string // ISO-ish
  endDate?: string   // ISO-ish
  timingStance?: 'PAST'|'ACTIVE'|'FUTURE'
  calendarEvent?: string // "St Patrick's", "Mother's Day", ...

  brandPosture?: 'Leader'|'Challenger'|'Disruptor'|'Premium'|'Value'
  primaryObjective?: 'Entries'|'Scan-rate'|'Rate-of-Sale'|'Penetration'|'Retailer-win'
  riskAppetite?: 'Conservative'|'Mainstream'|'Bold'

  frictionBudget?: 'Scan only'|'One purchase + One scan'|'Other'
  bannedMechanics?: string[] // ["Receipt upload","App download","Hashtag UGC",...]

  retailers?: string[]       // ["Coles","Woolworths","BWS","Dan Murphy's",...]
  tradeIncentive?: string    // "Scan-to-win + display bonus"

  mechanicType?: string[]    // ["Instant win","Weekly draw","Collect-to-unlock",...]
  mechanicOneLiner?: string

  hookLine?: string
  theme?: string[]           // ["Ritual","Heritage","Adventure",...]

  heroPrize?: string
  heroPrizeCount?: number
  runnerUps?: string
  opvBudget?: string         // "A$120–150k"
  fulfilmentReality?: string // "have glassware at 8-week lead time..."

  regulatedCategory?: 'Alcohol'|'Gaming'|'Pharma'|'None'
  ageGate?: boolean
  permits?: string[]         // ["NSW","SA","ACT"]
  mandatoryLines?: string

  // PAST/ACTIVE evidence
  entriesObserved?: string|number
  scanRateObserved?: string|number
  rosChangeObserved?: string|number
  issuesNoted?: string
  retailerFeedback?: string
  creativeURLs?: string[]

  // Your one sentence
  ownerNote?: string
}

/** Light normaliser for strings / arrays */
function normStr(x: any): string|undefined {
  if (x == null) return undefined
  if (typeof x === 'string') return x.trim() || undefined
  return String(x ?? '').trim() || undefined
}
function normArr(x: any): string[]|undefined {
  if (Array.isArray(x)) return x.map(v => String(v).trim()).filter(Boolean)
  const s = normStr(x); if (!s) return undefined
  return s.split(',').map(t => t.trim()).filter(Boolean)
}
function toISO(x?: string) {
  if (!x) return undefined
  const d = new Date(x)
  return isNaN(+d) ? undefined : d.toISOString()
}

/** Infer timing stance if missing */
function inferTiming(startISO?: string, endISO?: string): 'PAST'|'ACTIVE'|'FUTURE'|undefined {
  const now = Date.now()
  const s = startISO ? Date.parse(startISO) : undefined
  const e = endISO ? Date.parse(endISO) : undefined
  if (e && e < now) return 'PAST'
  if (s && e && s <= now && now <= e) return 'ACTIVE'
  if (s && s > now) return 'FUTURE'
  return undefined
}

/** Parse raw text heuristically (very light touch) */
function parseFreeText(raw?: string): Partial<BriefStruct> {
  const r = raw || ''
  const out: Partial<BriefStruct> = {}
  // simple regex hints (non-destructive)
  if (/st ?patrick/i.test(r)) out.calendarEvent = out.calendarEvent || "St Patrick's"
  if (/mother'?s day/i.test(r)) out.calendarEvent = out.calendarEvent || "Mother's Day"
  if (/leader/i.test(r)) out.brandPosture = out.brandPosture || 'Leader'
  if (/disrupt/i.test(r)) out.brandPosture = out.brandPosture || 'Disruptor'
  if (/dan ?murphy/i.test(r)) out.retailers = (out.retailers || []).concat("Dan Murphy's")
  if (/coles/i.test(r)) out.retailers = (out.retailers || []).concat('Coles')
  if (/bws/i.test(r)) out.retailers = (out.retailers || []).concat('BWS')
  if (/receipt upload/i.test(r)) out.bannedMechanics = (out.bannedMechanics || []).concat('Receipt upload')
  if (/app( |-)?download/i.test(r)) out.bannedMechanics = (out.bannedMechanics || []).concat('App download')
  return out
}

/** Merge precedence: overrides > provided parsedJson > heuristics(raw) */
export function parseBriefInput(
  rawText?: string,
  provided?: Partial<BriefStruct>
): BriefStruct {
  const heur = parseFreeText(rawText)
  const inObj = { ...(heur || {}), ...(provided || {}) } as any

  const startISO = toISO(normStr(inObj.startDate))
  const endISO = toISO(normStr(inObj.endDate))
  const stance = (inObj.timingStance as any) || inferTiming(startISO, endISO)

  const obj: BriefStruct = {
    clientName: normStr(inObj.clientName),
    brand: normStr(inObj.brand),
    campaignTitle: normStr(inObj.campaignTitle),

    category: normStr(inObj.category),
    markets: normArr(inObj.markets),

    startDate: startISO,
    endDate: endISO,
    timingStance: stance,
    calendarEvent: normStr(inObj.calendarEvent),

    brandPosture: inObj.brandPosture,
    primaryObjective: inObj.primaryObjective,
    riskAppetite: inObj.riskAppetite,

    frictionBudget: inObj.frictionBudget || 'One purchase + One scan',
    bannedMechanics: Array.isArray(inObj.bannedMechanics) ? inObj.bannedMechanics : [],

    retailers: normArr(inObj.retailers),
    tradeIncentive: normStr(inObj.tradeIncentive),

    mechanicType: Array.isArray(inObj.mechanicType) ? inObj.mechanicType : normArr(inObj.mechanicType),
    mechanicOneLiner: normStr(inObj.mechanicOneLiner),

    hookLine: normStr(inObj.hookLine),
    theme: Array.isArray(inObj.theme) ? inObj.theme : normArr(inObj.theme),

    heroPrize: normStr(inObj.heroPrize),
    heroPrizeCount: inObj.heroPrizeCount != null ? Number(inObj.heroPrizeCount) : undefined,
    runnerUps: normStr(inObj.runnerUps),
    opvBudget: normStr(inObj.opvBudget),
    fulfilmentReality: normStr(inObj.fulfilmentReality),

    regulatedCategory: inObj.regulatedCategory || 'None',
    ageGate: !!inObj.ageGate,
    permits: normArr(inObj.permits),
    mandatoryLines: normStr(inObj.mandatoryLines),

    entriesObserved: inObj.entriesObserved,
    scanRateObserved: inObj.scanRateObserved,
    rosChangeObserved: inObj.rosChangeObserved,
    issuesNoted: normStr(inObj.issuesNoted),
    retailerFeedback: normStr(inObj.retailerFeedback),
    creativeURLs: normArr(inObj.creativeURLs),

    ownerNote: normStr(inObj.ownerNote),
  }

  // de-dupe arrays
  if (obj.retailers) obj.retailers = Array.from(new Set(obj.retailers))
  if (obj.bannedMechanics) obj.bannedMechanics = Array.from(new Set(obj.bannedMechanics))
  if (obj.theme) obj.theme = Array.from(new Set(obj.theme))
  if (obj.mechanicType) obj.mechanicType = Array.from(new Set(obj.mechanicType))

  return obj
}

/** Classify: EVALUATE when we have hook/mechanic/prizes; else CREATE */
export function classifyMode(b: BriefStruct): {
  mode: 'EVALUATE'|'CREATE',
  signals: { hasHook: boolean, hasMechanic: boolean, hasPrize: boolean },
  confidence: number
} {
  const hasHook = !!b.hookLine
  const hasMech = !!(b.mechanicOneLiner || (b.mechanicType && b.mechanicType.length))
  const hasPrize = !!(b.heroPrize || b.runnerUps)
  const score = [hasHook, hasMech, hasPrize].filter(Boolean).length
  return {
    mode: score >= 2 ? 'EVALUATE' : 'CREATE',
    signals: { hasHook: hasHook, hasMechanic: hasMech, hasPrize: hasPrize },
    confidence: score / 3
  }
}

/** Light campaign patch from brief */
export function patchCampaignFromBrief(camp: Campaign, b: BriefStruct) {
  const data: Partial<Campaign> = {}
  if (b.clientName && b.clientName !== camp.clientName) data.clientName = b.clientName
  if (b.campaignTitle && b.campaignTitle !== camp.title) data.title = b.campaignTitle
  if (b.category && b.category !== camp.category) data.category = b.category
  return data
}
