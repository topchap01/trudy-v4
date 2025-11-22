// apps/backend/src/lib/offeriq.ts
import type { CampaignContext } from './context.js'

export type OfferIQLensKey =
  | 'adequacy' | 'simplicity' | 'certainty' | 'salience'
  | 'talkability' | 'retailerFit' | 'brandFit'

export type OfferIQLens = {
  score: number
  why: string
  fix: string
}

export type OfferIQVerdict = 'GO' | 'GO WITH CONDITIONS' | 'REVIEW' | 'NO-GO'

export type OfferIQ = {
  score: number
  verdict: OfferIQVerdict
  confidence: number // 0–1
  lenses: Record<OfferIQLensKey, OfferIQLens>
  hardFlags: string[]
  recommendations: string[]
  asks: string[]
  heroOverlay?: {
    label: string
    valueHint?: string
    count?: number
    narrative?: string
  }
  storyNotes?: string[]
  mode: 'ASSURED' | 'PRIZE'
  diagnostics: {
    valueAmount?: number              // representative amount at ASP
    aspAnchor?: number
    percentOfASP?: number
    expectedBuyers?: number | null
    totalWinners?: number | null
    coverageRate?: number | null
    cadenceSignals?: boolean
    symbolicSignals?: boolean
    prizePoolEstimate?: number | null
    budgetNote?: string | null
    prizeBudgetRatio?: number | null
    // — not typed, but kept inside diagnostics narrative:
    //   headlineMax?: number
    //   banded?: boolean
    //   overlay?: boolean
    //   overlayExperiential?: boolean
    //   overlayLabel?: string
    //   researchBenchmarks?: any
    //   cashbackVsMarket?: 'BELOW_P25'|'BETWEEN_P25_P75'|'ABOVE_P75'|'UNKNOWN'
    //   heroVsMarket?: 'BELOW_MEDIAN'|'AT_MEDIAN'|'ABOVE_MEDIAN'|'UNKNOWN'
  }
}

/* -------------------- Small utilities -------------------- */
const clamp = (n: number, lo = 0, hi = 10) => Math.max(lo, Math.min(hi, n))
const pct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : 0)
const asNum = (v: any) => (v == null ? 0 : Number(v) || 0)
const lower = (s: any) => String(s || '').toLowerCase()
const uniq = <T,>(xs: T[]) => Array.from(new Set(xs))

function includesAny(hay: string, needles: string[]) {
  const h = lower(hay)
  return needles.some((n) => h.includes(lower(n)))
}

function parseCountFromPrize(text: string): number {
  if (!text) return 1
  const explicit = text.match(/(\d[\d,]*)\s*[×x]/i)
  if (explicit) return asNum(explicit[1].replace(/,/g, ''))
  const tokens = text.split(/[\s,]+/)
  for (const token of tokens) {
    if (!token) continue
    if (/^\$/.test(token)) continue
    if (/^\d[\d,]*$/.test(token)) return asNum(token.replace(/,/g, ''))
  }
  return 1
}

function parseValueFromText(text: string): number | null {
  const match = text.match(/\$ ?([\d,]+(?:\.\d+)?)/)
  if (match) {
    return Number(match[1].replace(/,/g, ''))
  }
  return null
}

/** Category heuristics (can be expanded / learned later). */
function categoryDefaults(category: string) {
  const c = lower(category)
  if (includesAny(c, ['whitegood', 'fridge', 'appliance', 'dishwasher', 'cooking'])) {
    return { aspFallback: 1500, absoluteFloor: 50, percentFloor: 4 }
  }
  if (includesAny(c, ['phone', 'laptop', 'tech'])) {
    return { aspFallback: 1200, absoluteFloor: 30, percentFloor: 3 }
  }
  if (includesAny(c, ['beer', 'wine', 'spirit', 'liquor'])) {
    return { aspFallback: 20, absoluteFloor: 5, percentFloor: 10 }
  }
  if (includesAny(c, ['grocery', 'snack', 'cpg', 'fmcg', 'supermarket'])) {
    return { aspFallback: 6, absoluteFloor: 1, percentFloor: 15 }
  }
  return { aspFallback: 100, absoluteFloor: 10, percentFloor: 5 }
}

export function resolveAspAnchor(ctx: CampaignContext): number {
  const b: any = ctx.briefSpec || {}
  return (
    asNum(b.avgPrice) ||
    asNum(b.averageSellingPrice) ||
    (b.categoryBenchmarks && asNum(b.categoryBenchmarks?.avgPrice)) ||
    categoryDefaults(ctx.category || '').aspFallback
  )
}

/* ---------- Banded cashback helpers ---------- */
export type CashbackBand = {
  minPrice?: number | null
  maxPrice?: number | null
  amount?: number | null       // absolute $
  percent?: number | null      // % of price
}

function normaliseBands(bands: any[]): CashbackBand[] {
  if (!Array.isArray(bands)) return []
  return bands.map((b) => ({
    minPrice: (b?.minPrice == null ? null : asNum(b.minPrice)),
    maxPrice: (b?.maxPrice == null ? null : asNum(b.maxPrice)),
    amount: (b?.amount == null ? null : asNum(b.amount)),
    percent: (b?.percent == null ? null : asNum(b.percent)),
  }))
  .filter((b) => (b.amount != null && b.amount > 0) || (b.percent != null && b.percent > 0))
}

/** Find the band that applies near ASP (prefers the band that actually spans ASP). */
function bandForASP(bands: CashbackBand[], asp: number): CashbackBand | null {
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

function amountFromBandAtASP(b: CashbackBand, asp: number): number {
  if (!b) return 0
  if (b.amount != null && b.amount > 0) return b.amount
  if (b.percent != null && b.percent > 0) return (b.percent / 100) * asp
  return 0
}

function headlineMaxFromBands(bands: CashbackBand[], asp: number): number {
  if (!bands.length) return 0
  let maxAbs = 0
  for (const b of bands) {
    const abs = (b.amount != null && b.amount > 0)
      ? b.amount
      : (b.percent != null && b.percent > 0 ? (b.percent / 100) * asp : 0)
    if (abs > maxAbs) maxAbs = abs
  }
  return maxAbs
}

export function deriveCashbackValue(
  cashback: any,
  asp: number
): {
  bands: CashbackBand[]
  banded: boolean
  representative: number
  headlineMax: number
  percentValue: number | null
} {
  const bands = normaliseBands(Array.isArray(cashback?.bands) ? cashback.bands : [])
  const banded = bands.length > 0
  const singleAmount = asNum(cashback?.amount)
  const percent = asNum(cashback?.percent)
  const percentAmount = percent > 0 ? (percent / 100) * asp : 0
  const baseSingle = singleAmount || percentAmount
  let representative = baseSingle
  if (banded) {
    const band = bandForASP(bands, asp)
    representative = band ? amountFromBandAtASP(band, asp) : baseSingle
  }
  const headlineMax = banded ? headlineMaxFromBands(bands, asp) : baseSingle
  const percentValue = percent > 0 ? percent : null
  return { bands, banded, representative, headlineMax, percentValue }
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

/** Extract structured facts from brief/context + research benchmarks. */
function extract(ctx: CampaignContext) {
  const b: any = ctx.briefSpec || {}
  const type = String(b.typeOfPromotion || '').toUpperCase()

  // Assured payloads
  const cashback = b.cashback || null
  const gwp = b.gwp || null

  // ASP anchor (best available, else category fallback)
  const asp = resolveAspAnchor(ctx)

  // --- Cashback value derivation (single value OR banded) ---
  const { banded, representative: repAmount, headlineMax } = deriveCashbackValue(cashback, asp)

  // Assured flag
  const cashbackAssured =
    (type === 'CASHBACK' && (cashback ? cashback.assured !== false : true)) ||
    Boolean(cashback && cashback.assured !== false)
  const gwpAssured =
    ((type === 'GWP' || !!gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null))
  const assured = cashbackAssured || gwpAssured

  // GWP proxy value
  const gwpRrp = gwp ? asNum(gwp.rrp || gwp.value || gwp.estimatedValue) : 0

  // Effort proxy (hassle)
  const fields = asNum(b.claimFieldsCount)
  const proof = includesAny(JSON.stringify(b), ['receipt', 'upload', 'proof', 'serial'])
  const waitDays = asNum(b.processingDays || (cashback?.processingDays) || 0)
  const screens = asNum(b.screens || 1)
  const hasApp = includesAny(JSON.stringify(b), ['app-only', 'mobile app'])
  const effort =
    (screens ? Math.min(screens, 4) : 1) +
    (fields ? Math.min(fields, 6) * 0.5 : 0) +
    (proof ? 1.5 : 0) +
    (hasApp ? 1.5 : 0) +
    (waitDays >= 21 ? 1.5 : waitDays >= 7 ? 0.75 : 0)

  // Prize-mode signals
  const cadenceSignals = includesAny(JSON.stringify(b), [
    'instant win', 'weekly', 'daily', 'thousands of winners', 'bonus entries', 'ladder', 'stamp', 'collect'
  ])

  // Overlay detection (for talkability/salience support; never to mask adequacy)
  const heroLabel = String(b.heroPrize || '').toLowerCase()
  const overlayRaw = (typeof b.majorPrizeOverlay === 'string') ? b.majorPrizeOverlay : (b.majorPrizeOverlay ? b.heroPrize : '')
  const overlayLabel = String(overlayRaw || '').toLowerCase()
  const overlay = !!overlayLabel || b.majorPrizeOverlay === true
  const overlayExperiential = /chef|private chef|cook(ing)? (at )?home|dinner|experience|concierge|vip|ticket(s)?|trip|travel|butler|maid|home service/.test(overlayLabel || heroLabel)

  // symbolic / fame signals
  const symbolicSignals =
    includesAny(JSON.stringify(b), [
      'symbolic', 'status', 'membership', 'club', 'lifetime', 'money-can’t-buy', 'money cant buy'
    ]) || overlayExperiential

  // Volume / winners (if provided)
  const expectedBuyers =
    asNum(b.expectedBuyers) ||
    asNum(b.expectedUnits) ||
    asNum(b.kpiEntriesTarget) ||
    null

  const heroCount = asNum(b.heroPrizeCount)
  const heroValueHint = asNum(b.heroPrizeValue) || parseValueFromText(String(b.heroPrize || '')) || 0
  const runnerUpsRaw = Array.isArray(b.runnerUps) ? b.runnerUps : []
  const ruDetails = runnerUpsRaw.map((item: any) => {
    const text = String(item || '')
    const count = parseCountFromPrize(text)
    const value = parseValueFromText(text)
    return { count, value }
  })
  const ruCount = ruDetails.reduce((sum: number, r: { count: number }) => sum + r.count, 0)
  const totalWinners = (heroCount || 0) + (ruCount || 0) || (asNum(b.totalWinners) || null)
  const fallbackRunnerValue = asNum(b.runnerUpValue) || asNum(b.runnerUpAmount) || parseValueFromText(String(b.prizeValueHint || '')) || 0
  const ruValueTotal = ruDetails.reduce((sum: number, r: { count: number; value: number | null }) => sum + r.count * (r.value || fallbackRunnerValue), 0)
  const heroValueTotal = (heroCount || 0) * heroValueHint
  const prizePoolEstimateRaw = heroValueTotal + ruValueTotal
  const prizePoolEstimate =
    prizePoolEstimateRaw > 0
      ? prizePoolEstimateRaw
      : asNum(b.prizeBudgetNotes?.match(/\$[\d,]+/)?.[0]?.replace(/[^0-9.]/g, '')) || null
  const approxRevenue = expectedBuyers ? expectedBuyers * asp : null
  const prizeBudgetRatio =
    prizePoolEstimate && approxRevenue && approxRevenue > 0
      ? prizePoolEstimate / approxRevenue
      : null

  const coverageRate =
    expectedBuyers && totalWinners ? totalWinners / expectedBuyers : null

  // Research benchmarks (optional)
  const research = getResearch(ctx)
  const benchmarks = research?.benchmarks || null
  const cbBench = benchmarks?.cashbackAbs || benchmarks?.cashback || null
  const heroBenchMedian = (benchmarks?.heroPrize?.median ?? null) as number | null
  const heroBenchMode = (benchmarks?.heroPrize?.mode ?? null) as number | null
  const cadenceShare = benchmarks?.cadenceShare || null
  const manyWinnersShare = typeof benchmarks?.manyWinnersShare === 'number' ? benchmarks.manyWinnersShare : null

  // Final assured representative amount: choose cashback rep OR gwp value
  const assuredRepValue = (type === 'CASHBACK' || cashback) ? repAmount : gwpRrp

  return {
    assured,
    banded,
    overlay,
    // @ts-ignore
    overlayExperiential,
    // @ts-ignore
    overlayLabel,
    repAmount: assuredRepValue,
    headlineMax,
    asp,
    effort,
    cadenceSignals,
    symbolicSignals,
    expectedBuyers,
    totalWinners,
    coverageRate,
    prizePoolEstimate: prizePoolEstimate || null,
    prizeBudgetRatio: prizeBudgetRatio || null,
    // Research surfaces for scoring
    researchBenchmarks: benchmarks,
    cbBench,
    heroBenchMedian,
    heroBenchMode,
    cadenceShare,
    manyWinnersShare,
    heroCount
  }
}

/** Main scorer: research-aware, band-aware, overlay-aware. */
export function scoreOffer(ctx: CampaignContext): OfferIQ {
  const b: any = ctx.briefSpec || {}
  const {
    assured, banded, overlay, overlayExperiential, overlayLabel, repAmount, headlineMax, asp,
    effort: claimEffort,
    cadenceSignals, symbolicSignals,
    expectedBuyers, totalWinners, coverageRate,
    // research
    researchBenchmarks, cbBench, heroBenchMedian, heroBenchMode, cadenceShare, manyWinnersShare, heroCount,
    prizePoolEstimate, prizeBudgetRatio
  } = extract(ctx)

  const percentRep = pct(repAmount, asp)
  const catDefaults = categoryDefaults(ctx.category || '')
  const absoluteFloor = asNum(b.absoluteFloor) || catDefaults.absoluteFloor
  const percentFloor = asNum(b.percentFloor) || catDefaults.percentFloor

  const mode: 'ASSURED' | 'PRIZE' = assured ? 'ASSURED' : 'PRIZE'
  const asks: string[] = []

  /* ---------- Adequacy ---------- */
  let adequacyScore = 0
  let adequacyWhy = ''
  let adequacyFix = ''
  const hardFlags: string[] = []

  // Helpers for research-relative notes
  let cashbackVsMarket: 'BELOW_P25'|'BETWEEN_P25_P75'|'ABOVE_P75'|'UNKNOWN' = 'UNKNOWN'
  let heroVsMarket: 'BELOW_MEDIAN'|'AT_MEDIAN'|'ABOVE_MEDIAN'|'UNKNOWN' = 'UNKNOWN'

  if (mode === 'ASSURED') {
    const adequateAbs = repAmount >= absoluteFloor
    const adequatePct = percentRep >= percentFloor

    // Base score from floors
    adequacyScore =
      repAmount <= 0 ? 0 :
      (adequateAbs && adequatePct) ? 8.5 :
      adequateAbs ? 6 :
      adequatePct ? 5 :
      Math.max(1, Math.min(4, (repAmount / absoluteFloor) * 4))

    // Research-relative tweak (vs market cashback medians/IQR)
    if (repAmount > 0 && cbBench?.median) {
      if (cbBench.p25 != null && repAmount < cbBench.p25) {
        cashbackVsMarket = 'BELOW_P25'
        adequacyScore -= 0.8
      } else if (cbBench.p75 != null && repAmount >= cbBench.p75) {
        cashbackVsMarket = 'ABOVE_P75'
        adequacyScore += 0.6
      } else {
        cashbackVsMarket = 'BETWEEN_P25_P75'
        adequacyScore += 0.1
      }
    }

    const headlineNote = banded && headlineMax > 0
      ? ` Headline “up to” ≈ $${headlineMax.toFixed(0)}; typical at ASP ≈ $${repAmount.toFixed(0)}.`
      : ''

    const marketNote = (cbBench?.median
      ? ` Market check: median ≈ $${Math.round(cbBench.median)}${cbBench.p25 ? ` (IQR ~$${Math.round(cbBench.p25)}–$${Math.round(cbBench.p75 || cbBench.median)})` : ''}.`
      : '')

    adequacyWhy =
      repAmount <= 0
        ? 'No tangible assured value specified.'
        : `≈$${repAmount.toFixed(0)} on ~$${asp.toFixed(0)} (${percentRep.toFixed(1)}%) ` +
          `${(adequateAbs && adequatePct) ? 'meets' : 'misses'} category floors.` +
          headlineNote + marketNote

    adequacyFix =
      (adequateAbs && adequatePct)
        ? 'Keep the number round and prominent.'
        : cbBench?.median
          ? `Change-from: $${repAmount.toFixed(0)} on ~$${asp.toFixed(0)}. → Change-to: ≥$${Math.max(absoluteFloor, Math.round(cbBench.p25 || cbBench.median))} or ≥${percentFloor}% of ASP, or pivot to a premium GWP with clear RRP.`
          : `Change-from: ${repAmount ? `$${repAmount.toFixed(0)}` : 'n/a'} on ~$${asp.toFixed(0)}. → Change-to: ≥$${absoluteFloor} or ≥${percentFloor}% of ASP, or pivot to a premium GWP with clear RRP.`

    if (banded && repAmount <= 0) asks.push('Provide band thresholds (min/max price) and amount/percent per band.')
    if (adequacyScore < 3) hardFlags.push('INADEQUATE_VALUE')
  } else {
    // PRIZE mode — perceived odds & visibility + research norms
    const hasVolume = expectedBuyers != null && expectedBuyers > 0
    const hasWinners = totalWinners != null && totalWinners > 0

    // Research-relative hero count note
    if (heroCount > 0 && heroBenchMedian != null) {
      if (heroCount < heroBenchMedian) heroVsMarket = 'BELOW_MEDIAN'
      else if (heroCount === heroBenchMedian) heroVsMarket = 'AT_MEDIAN'
      else heroVsMarket = 'ABOVE_MEDIAN'
    }

    if (!hasVolume || !hasWinners) {
      adequacyScore = cadenceSignals ? 6 : 4.5
      adequacyWhy = !hasVolume
        ? 'Expected buyers/entries not provided; adequacy judged via cadence and visibility.'
        : 'Winner count not provided; adequacy judged via cadence and visibility.'
      adequacyFix = 'Add: expected buyers/entries and total winners, or show “Total winners” and cadence in communications.'
      if (!hasVolume) asks.push('Provide expected buyers/entries (range).')
      if (!hasWinners) asks.push('Provide total winners (hero + runner-ups).')
    } else {
      const cov = coverageRate as number
      if (cov >= 0.05) adequacyScore = 8.5
      else if (cov >= 0.01) adequacyScore = 7
      else if (cov >= 0.003) adequacyScore = cadenceSignals ? 6 : 4.5
      else adequacyScore = cadenceSignals ? 4.5 : 3.5

      // Heuristic nudges for perceived odds + research
      if (heroCount === 1 && !cadenceSignals) adequacyScore -= 0.4
      if (heroCount >= 2 && heroCount <= 3) adequacyScore += 0.3
      if (cadenceShare?.instant && cadenceShare.instant >= 0.25 && !cadenceSignals) {
        // Market uses instant often; penalise absence slightly
        adequacyScore -= 0.2
      }

      const poolLine = prizePoolEstimate
        ? ` Prize pool ≈ $${Math.round(prizePoolEstimate).toLocaleString('en-US')}${prizeBudgetRatio != null ? ` (~${(prizeBudgetRatio * 100).toFixed(1)}% of ASP × entries)` : ''}.`
        : ''
      adequacyWhy =
        `Coverage ≈ ${(cov * 100).toFixed(2)}% (${totalWinners} winners on ~${expectedBuyers} buyers/entries).` +
        poolLine +
        (cadenceSignals ? ' Visible cadence/many-winners cues present.' : ' Cadence not clearly visible.') +
        (heroVsMarket !== 'UNKNOWN' ? ` Hero prizes vs market: ${heroVsMarket.toLowerCase().replace('_',' ')}.` : '')

      adequacyFix =
        cov >= 0.01
          ? 'Keep cadence clear; publish “Total winners”.'
          : 'Change-from: thin perceived odds. → Change-to: more winners OR stronger cadence/visibility; publish “Total winners”.'

      if (cov < 0.003 && !cadenceSignals) hardFlags.push('COVERAGE_TINY')
    }
    if (symbolicSignals) adequacyScore = Math.min(9, adequacyScore + 0.5)
  }

  const adequacy: OfferIQLens = {
    score: clamp(adequacyScore),
    why: adequacyWhy,
    fix: adequacyFix,
  }

  /* ---------- Simplicity ---------- */
  const simplicityScore = clamp(10 - (claimEffort * 1.4), 0, 10)
  const simplicity: OfferIQLens = {
    score: simplicityScore,
    why:
      claimEffort <= 2 ? 'One-screen claim with low admin.' :
      claimEffort <= 4 ? 'Some admin implied (fields/proof or wait time).' :
      'High perceived hassle (multi-step, proof and/or long wait).',
    fix: 'Keep claim one-screen; limit fields; good OCR; publish timelines.',
  }

  /* ---------- Certainty ---------- */
  let certaintyBase: number
  if (mode === 'ASSURED') {
    certaintyBase = adequacy.score <= 3 ? 5 : 8
  } else {
    certaintyBase = cadenceSignals ? 7 : 4
    // nudge if market commonly shows cadence but we don’t
    if (!cadenceSignals && cadenceShare && (cadenceShare.instant >= 0.25 || cadenceShare.weekly >= 0.3)) {
      certaintyBase -= 0.3
    }
  }
  const certainty: OfferIQLens = {
    score: clamp(certaintyBase),
    why: mode === 'ASSURED'
      ? 'Assured value for qualifiers.'
      : (cadenceSignals ? 'Cadence/many-winners signal fairness.' : 'Perceived odds unclear; cadence thin.'),
    fix: mode === 'ASSURED'
      ? 'Fix adequacy first; certainty only works if value feels worth it.'
      : 'Show cadence and “Total winners”; avoid fine print that hides odds.',
  }

  /* ---------- Salience ---------- */
  const salienceBase =
    mode === 'ASSURED'
      ? (repAmount >= absoluteFloor ? 7 : repAmount >= absoluteFloor * 0.6 ? 5 : repAmount > 0 ? 3 : 1)
        + (overlay && overlayExperiential ? 0.5 : 0)
      : (cadenceSignals ? 6 : 4) + (symbolicSignals ? 1 : 0)
  const salience: OfferIQLens = {
    score: clamp(salienceBase),
    why: mode === 'ASSURED'
      ? (repAmount >= absoluteFloor
          ? 'Headline number can carry pack/POS.'
          : 'Number reads small; lacks stopping power.')
      : (cadenceSignals ? 'Cadence gives it presence; easier to headline winners.' : 'Needs a visible moment or total-winners headline.'),
    fix: mode === 'ASSURED'
      ? (repAmount >= absoluteFloor ? 'State it cleanly, large, and early.' : 'Round up or pivot to premium GWP with explicit RRP.')
      : 'Publish “Total winners” and name the cadence; add a bold moment line.',
  }

  /* ---------- Talkability / Retailer / Brand ---------- */
  const hasSymbolic = symbolicSignals
  const seasonal = includesAny(JSON.stringify(b || {}), ['spring', 'summer', 'holiday', 'christmas', 'eofy'])
  let talkabilityBase =
    overlay && overlayExperiential ? 7.5 :
    hasSymbolic ? 7 :
    seasonal ? 5 : 2

  const talkability: OfferIQLens = {
    score: clamp(talkabilityBase),
    why:
      overlay && overlayExperiential
        ? 'Experiential overlay (e.g., Private Chef) is inherently talkable; use it as the story.'
        : overlay
          ? 'Overlay adds a headline moment.'
          : (hasSymbolic ? 'Cultural/status angle present; dramatise the myth and bridge story.' : (seasonal ? 'Seasonal hook helps.' : 'Little social currency.')),
    fix:
      overlay && overlayExperiential
        ? 'Let the overlay carry PR and mood; keep cashback as the headline value line.'
        : overlay
          ? 'Let the overlay add fame without overshadowing the guaranteed value.'
          : (hasSymbolic ? 'Bring the symbolic reward to life (naming, live updates, owners’ colours). Place it at the heart of comms.' : 'Add a brand-right experiential or symbolic angle.'),
  }

  const zeroLift = includesAny(JSON.stringify(b || {}), ['zero staff', 'central fulfilment', 'centralized fulfillment', 'pre-packed pos', 'prepacked pos'])
  const retailerFit: OfferIQLens = {
    score: zeroLift ? 8 : 6,
    why: zeroLift ? 'Zero staff burden; central processing.' : 'Ensure any adjudication is central; ship pre-packed POS.',
    fix: 'Keep staff script ≤5s; no in-store adjudication.',
  }

  const assets = b.brandAssets || b.distinctiveAssets || {}
  const usesAssets =
    (Array.isArray(assets.visual) && assets.visual.length) ||
    (Array.isArray(assets.verbal) && assets.verbal.length) ||
    includesAny(JSON.stringify(b || {}), ['distinctive asset', 'brand truth'])
  const brandFit: OfferIQLens = {
    score: usesAssets ? 6.5 : 5,
    why: usesAssets ? 'Hook/value linked to brand assets.' : 'Feels generic; weak brand lock.',
    fix: 'Lock line and visuals to distinctive assets and the brand’s functional truth.',
  }

  /* ---------- Composite and verdict ---------- */
  const w = { adequacy: 0.3, simplicity: 0.15, certainty: 0.15, salience: 0.15, talkability: 0.1, retailerFit: 0.1, brandFit: 0.05 }
  const score =
    adequacy.score * w.adequacy +
    simplicity.score * w.simplicity +
    certainty.score * w.certainty +
    salience.score * w.salience +
    talkability.score * w.talkability +
    retailerFit.score * w.retailerFit +
    brandFit.score * w.brandFit

  // Confidence: high when inputs are concrete; lower when we guessed.
  let confidence = 0.7
  if (mode === 'PRIZE' && (expectedBuyers == null || totalWinners == null)) confidence = 0.45
  if (mode === 'ASSURED' && repAmount <= 0) confidence = 0.4
  if (mode === 'ASSURED' && banded && repAmount > 0 && headlineMax > 0 && Math.abs(headlineMax - repAmount) / (headlineMax || 1) > 0.35) {
    asks.push('Confirm typical cashback at ASP vs “up to” headline.')
    confidence = Math.max(0.5, confidence - 0.05)
  }
  // Confidence nudge if we actually had benchmarks
  if (researchBenchmarks) confidence = Math.min(0.85, confidence + 0.05)

  // Verdict logic (gentle with low confidence)
  let verdict: OfferIQVerdict = 'GO WITH CONDITIONS'
  if (score >= 7.5 && hardFlags.length === 0) verdict = 'GO'
  else if (mode === 'ASSURED' && (adequacy.score < 3 || hardFlags.includes('INADEQUATE_VALUE')) && confidence >= 0.7) verdict = 'NO-GO'
  else if (mode === 'PRIZE') {
    if (hardFlags.includes('COVERAGE_TINY') && confidence >= 0.7) verdict = 'NO-GO'
    else if (confidence < 0.6) verdict = 'REVIEW'
  }

  // Research-aware recommendations (only if signals present; no invention)
  const recs: string[] = []
  if (mode === 'ASSURED' && cbBench?.median && repAmount > 0) {
    if (cbBench.p25 != null && repAmount < cbBench.p25) {
      recs.push(`Raise assured value toward market lower quartile (≥$${Math.round(cbBench.p25)}), or shift to premium GWP with explicit RRP.`)
    } else if (cbBench.p75 != null && repAmount >= cbBench.p75) {
      recs.push('Exploit strength: headline the number; keep claim flow low-hassle to convert.')
    }
  }
  if (mode === 'PRIZE') {
    if (heroCount === 1 && (heroBenchMedian || heroBenchMode)) {
      recs.push('Boost perceived odds: consider 2–3 major prizes and/or instant/weekly cadence headline.')
    }
    if (heroCount >= 4 && manyWinnersShare != null && manyWinnersShare > 0.2) {
      recs.push('Rebalance: trim major-prize count; fund “many winners” or instant wins to widen perceived odds.')
    }
    if (!cadenceSignals && cadenceShare && (cadenceShare.instant >= 0.25 || cadenceShare.weekly >= 0.3)) {
      recs.push('Add visible cadence (instant or weekly) to match in-market fairness signals.')
    }
    if (prizeBudgetRatio != null && prizeBudgetRatio > 0.12) {
      recs.push('Prize budget is heavy (>12% of projected retail). Sense-check ROI or add spend thresholds before funding 2,000+ prizes.')
    } else if (prizeBudgetRatio != null && prizeBudgetRatio < 0.005) {
      recs.push('Prize spend is under 0.5% of projected retail; consider adding a small guaranteed element or more winners.')
    }
  }

  const recommendations = uniq([
    ...(adequacy.score < 7 ? [adequacy.fix] : []),
    ...(simplicity.score < 7 ? [simplicity.fix] : []),
    ...(salience.score < 7 ? [salience.fix] : []),
    ...(mode === 'PRIZE' && (!cadenceSignals || coverageRate == null) ? ['Publish “Total winners” and show cadence prominently.'] : []),
    ...(mode === 'ASSURED' && banded && repAmount < absoluteFloor
        ? ['Consider rebasing band near ASP or spotlighting a premium GWP with explicit RRP.'] : []),
    ...recs,
  ]).slice(0, 8)

  // Asks (research-aware)
  if (mode === 'PRIZE' && heroCount == null) asks.push('Confirm hero-prize count (1 vs 2 vs 3) to calibrate perceived odds.')
  if (mode === 'PRIZE' && totalWinners == null) asks.push('Provide total winners (hero + runner-ups) to compute perceived coverage.')
  if (mode === 'ASSURED' && !repAmount) asks.push('Provide single cashback amount or band near ASP.')

  return {
    score: Math.round(score * 10) / 10,
    verdict,
    confidence,
    lenses: { adequacy, simplicity, certainty, salience, talkability, retailerFit, brandFit },
    hardFlags,
    recommendations,
    asks,
    heroOverlay: overlay || b.heroPrize
      ? {
          label: (typeof b.majorPrizeOverlay === 'string' ? b.majorPrizeOverlay : b.heroPrize || ''),
          valueHint: b.heroPrizeValue || (overlayExperiential ? 'Experiential' : undefined),
          count: heroCount || undefined,
          narrative: overlayExperiential ? 'Premium/experience overlay intended to add PR heat.' : undefined
        }
      : undefined,
    storyNotes: symbolicSignals ? ['If there is a symbolic or bridge reward, dramatise it with naming and storytelling so shoppers grasp why it matters.'] : undefined,
    mode,
    diagnostics: {
      valueAmount: repAmount,
      aspAnchor: asp,
      percentOfASP: mode === 'ASSURED' ? percentRep : undefined,
      expectedBuyers,
      totalWinners,
      coverageRate,
      cadenceSignals,
      symbolicSignals,
      prizePoolEstimate: prizePoolEstimate || null,
      prizeBudgetRatio: prizeBudgetRatio || null,
      budgetNote: prizePoolEstimate && totalWinners
        ? `Approx prize pool $${Math.round(prizePoolEstimate).toLocaleString('en-US')} covering ${totalWinners} winners${prizeBudgetRatio ? ` (~${(prizeBudgetRatio * 100).toFixed(1)}% of retail at ASP × entries)` : ''}.`
        : undefined,
      // non-typed notes (still accessible to your UI if needed)
      // @ts-ignore
      headlineMax,
      // @ts-ignore
      banded,
      // @ts-ignore
      overlay,
      // @ts-ignore
      overlayExperiential,
      // @ts-ignore
      overlayLabel,
      // research echoes
      // @ts-ignore
      researchBenchmarks,
      // @ts-ignore
      cashbackVsMarket,
      // @ts-ignore
      heroVsMarket,
    },
  }
}
