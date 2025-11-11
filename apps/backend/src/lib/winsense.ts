import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { CampaignContext } from './context.js'
import type { BenchmarkSlice } from './knowledge-grid.js'

const SOURCE_FILE = fileURLToPath(new URL('../../docs/science/winsense.sources.json', import.meta.url))

export type WinSenseSource = {
  id: string
  title: string
  authors?: string[]
  year?: number
  url?: string
  publisher?: string
  finding?: string
  implication?: string
  tags?: string[]
}

export type WinSenseDimension = {
  status: 'STRONG' | 'OK' | 'WEAK' | 'UNKNOWN'
  summary: string
  signals: string[]
  sources: string[]
}

export type FeltWinnabilityProfile = {
  winnerDensityPerDay: number | null
  campaignDays: number | null
  frequencyCopy: string | null
  overallStatus: 'STRONG' | 'OK' | 'WEAK' | 'UNKNOWN'
  dimensions: {
    frequency: WinSenseDimension
    tiering: WinSenseDimension
    cash: WinSenseDimension
    progress: WinSenseDimension
    cadence: WinSenseDimension
  }
  guidance: Array<{ headline: string; detail: string; sources: string[] }>
  sourceRefs: string[]
}

const SOURCE_IDS = {
  NATURAL_FREQUENCY: 'GGH95',
  RATIO_BIAS: 'DRE94',
  PROSPECT: 'KT79',
  PROB_WEIGHT: 'PRE98',
  TEMPORAL_FRAMING: 'TFH13',
  REINFORCEMENT: 'FS57',
  GOAL_GRADIENT: 'KUZ06',
  ENDOWED_PROGRESS: 'ND06',
  PRIZE_TIERING: 'KAL14',
  SCARCITY: 'AJH11',
  CONTEST: 'AEA01',
}

let sourceCache: WinSenseSource[] | null = null

export function loadWinSenseSources(): WinSenseSource[] {
  if (sourceCache) return sourceCache
  try {
    const raw = fs.readFileSync(SOURCE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    sourceCache = Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('[winsense] unable to read science pack', err)
    sourceCache = []
  }
  return sourceCache
}

type BuildWinSenseOptions = {
  benchmark?: BenchmarkSlice | null
}

export function buildFeltWinnabilityProfile(
  ctx: CampaignContext,
  opts: BuildWinSenseOptions = {}
): FeltWinnabilityProfile {
  const spec: any = ctx.briefSpec || {}
  const benchmark = opts.benchmark ?? null
  const start = parseDate(spec.startDate || ctx.startDate)
  const end = parseDate(spec.endDate || ctx.endDate)
  const campaignDays = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) : null
  const totalWinners = numeric(spec.totalWinners ?? spec.breadthPrizeCount ?? spec.expectedWinners ?? null)
  const winnerDensityPerDay = totalWinners != null && campaignDays ? totalWinners / campaignDays : null

  const cadenceCopy = String(spec.cadenceCopy || spec.cadence || spec.mechanicOneLiner || '').trim()
  const frequencyCopy = detectFrequencyCopy(cadenceCopy, spec)

  const heroCount = numeric(spec.heroPrizeCount ?? spec.majorPrizeCount ?? 0) || 0
  const recommendedHero = numeric(benchmark?.heroCountTypical ?? benchmark?.heroCountStrong ?? null)
  const tiering = evaluateTiering(heroCount, recommendedHero, totalWinners, benchmark)

  const topPrizeValue = extractTopPrizeValue(spec)
  const meta = (benchmark?.metadata || {}) as Record<string, any>
  const sweetSpot = numeric(benchmark?.topPrizeSweetSpot ?? meta.topPrizeSweetSpot ?? null)
  const cashDimension = evaluateCashValue(topPrizeValue, sweetSpot)

  const progressDimension = evaluateProgressSignals(spec)
  const cadenceDimension = evaluateCadence(winnerDensityPerDay, frequencyCopy, benchmark)
  const frequencyDimension = evaluateFrequency(frequencyCopy, winnerDensityPerDay)

  const guidance: Array<{ headline: string; detail: string; sources: string[] }> = []
  const sourceRefs = new Set<string>()

  function pushGuidance(headline: string, detail: string, sources: string[]) {
    sources.forEach((id) => sourceRefs.add(id))
    guidance.push({ headline, detail, sources })
  }

  if (frequencyDimension.status !== 'STRONG') {
    pushGuidance(
      'Reframe odds as natural frequencies',
      frequencyCopy
        ? 'Anchor the promise in hourly/daily language so shoppers can feel the odds.'
        : 'Convert winner totals into “winner every X” copy to leverage numerator salience.',
      [SOURCE_IDS.NATURAL_FREQUENCY, SOURCE_IDS.RATIO_BIAS, SOURCE_IDS.TEMPORAL_FRAMING]
    )
  } else {
    sourceRefs.add(SOURCE_IDS.NATURAL_FREQUENCY)
  }

  if (tiering.status !== 'STRONG') {
    pushGuidance(
      'Balance the prize ladder',
      tiering.summary,
      [SOURCE_IDS.PRIZE_TIERING, SOURCE_IDS.CONTEST]
    )
  }

  if (cashDimension.status !== 'STRONG' && topPrizeValue != null) {
    pushGuidance(
      'Right-size the top prize',
      cashDimension.summary,
      [SOURCE_IDS.PROSPECT, SOURCE_IDS.PROB_WEIGHT]
    )
  }

  if (progressDimension.status !== 'STRONG') {
    pushGuidance(
      'Show progress or streaks',
      progressDimension.summary,
      [SOURCE_IDS.GOAL_GRADIENT, SOURCE_IDS.ENDOWED_PROGRESS]
    )
  } else {
    sourceRefs.add(SOURCE_IDS.GOAL_GRADIENT)
  }

  if (cadenceDimension.status !== 'STRONG') {
    pushGuidance(
      'Tighten cadence / reinforcement',
      cadenceDimension.summary,
      [SOURCE_IDS.REINFORCEMENT]
    )
  } else {
    sourceRefs.add(SOURCE_IDS.REINFORCEMENT)
  }

  const statuses = [
    frequencyDimension.status,
    tiering.status,
    cashDimension.status,
    progressDimension.status,
    cadenceDimension.status,
  ]
  const strongCount = statuses.filter((s) => s === 'STRONG').length
  const weakCount = statuses.filter((s) => s === 'WEAK').length
  const overallStatus = weakCount > 1 ? 'WEAK' : (strongCount >= 3 ? 'STRONG' : statuses.some((s) => s === 'OK') ? 'OK' : 'UNKNOWN')

  return {
    winnerDensityPerDay,
    campaignDays,
    frequencyCopy,
    overallStatus,
    dimensions: {
      frequency: frequencyDimension,
      tiering,
      cash: cashDimension,
      progress: progressDimension,
      cadence: cadenceDimension,
    },
    guidance,
    sourceRefs: Array.from(sourceRefs),
  }
}

function parseDate(value?: string | null): Date | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? new Date(ts) : null
}

function numeric(value: any): number | null {
  if (value == null || value === '') return null
  const num = Number(value)
  if (Number.isFinite(num)) return num
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
    return match ? Number(match[0]) : null
  }
  return null
}

function detectFrequencyCopy(raw: string, spec: Record<string, any>): string | null {
  if (raw) return raw
  const notes = [
    spec.rewardCopy,
    spec.hook,
    spec.promoLine,
    Array.isArray(spec.runnerUps) ? spec.runnerUps.join(' ') : '',
  ].join(' ')
  const match = notes.match(/(winner|winners)\s+(every|per)\s+([0-9]+)?\s*(minute|hour|day|week)/i)
  return match ? match[0] : null
}

function evaluateFrequency(copy: string | null, density: number | null): WinSenseDimension {
  if (copy) {
    return {
      status: 'STRONG',
      summary: `Natural-frequency copy detected (“${copy.trim()}”).`,
      signals: [copy.trim()],
      sources: [SOURCE_IDS.NATURAL_FREQUENCY, SOURCE_IDS.TEMPORAL_FRAMING],
    }
  }
  if (density != null && density >= 24) {
    return {
      status: 'OK',
      summary: 'Winner density is high; convert into hourly angles to amplify perceived odds.',
      signals: [`${density.toFixed(1)} winners/day`],
      sources: [SOURCE_IDS.NATURAL_FREQUENCY],
    }
  }
  if (density != null && density < 1) {
    return {
      status: 'WEAK',
      summary: 'Fewer than one winner per day detected; copy must compensate with clarity or instant wins.',
      signals: [`${density.toFixed(2)} winners/day`],
      sources: [SOURCE_IDS.NATURAL_FREQUENCY],
    }
  }
  return {
    status: 'UNKNOWN',
    summary: 'No cadence copy or winner density detected.',
    signals: [],
    sources: [SOURCE_IDS.NATURAL_FREQUENCY],
  }
}

function evaluateTiering(
  heroCount: number,
  recommendedHero: number | null,
  totalWinners: number | null,
  benchmark: BenchmarkSlice | null
): WinSenseDimension {
  const tiers = (benchmark?.prizeTierGuidance || benchmark?.metadata?.prizeTierGuidance || {}) as Record<string, any>
  const instantShare = typeof tiers.instantShare === 'number' ? Number(tiers.instantShare) : null

  if (recommendedHero != null) {
    if (heroCount === recommendedHero) {
      return {
        status: 'STRONG',
        summary: `Hero prize count (${heroCount}) matches market guidance.`,
        signals: [`Recommended hero count: ${recommendedHero}`],
        sources: [SOURCE_IDS.PRIZE_TIERING],
      }
    }
    if (heroCount > recommendedHero + 1) {
      return {
        status: 'WEAK',
        summary: `Hero prizes (${heroCount}) exceed the ${recommendedHero} typical target; reallocate budget into instant wins.`,
        signals: [`Instant-win share guidance: ${instantShare ?? 'n/a'}`],
        sources: [SOURCE_IDS.PRIZE_TIERING],
      }
    }
  }
  if (totalWinners != null && totalWinners < (benchmark?.breadthTypical ?? 500)) {
    return {
      status: 'WEAK',
      summary: `Total winners (${totalWinners}) below breadth norms; cadence will feel thin.`,
      signals: [`Breadth typical: ${benchmark?.breadthTypical ?? 'n/a'}`],
      sources: [SOURCE_IDS.PRIZE_TIERING],
    }
  }
  return {
    status: 'OK',
    summary: 'Prize ladder detected but could lean harder into instant wins / breadth.',
    signals: [`Hero prizes: ${heroCount}`, `Total winners: ${totalWinners ?? 'n/a'}`],
    sources: [SOURCE_IDS.PRIZE_TIERING],
  }
}

function evaluateCashValue(topPrize: number | null, sweetSpot: number | null): WinSenseDimension {
  if (topPrize == null) {
    return {
      status: 'UNKNOWN',
      summary: 'Top prize amount not detected; Prospect weighting cannot be assessed.',
      signals: [],
      sources: [SOURCE_IDS.PROSPECT, SOURCE_IDS.PROB_WEIGHT],
    }
  }
  if (sweetSpot == null) {
    return {
      status: 'OK',
      summary: `Top prize captured (~$${Math.round(topPrize)}). Validate against market data.`,
      signals: [`Top prize: $${Math.round(topPrize)}`],
      sources: [SOURCE_IDS.PROSPECT, SOURCE_IDS.PROB_WEIGHT],
    }
  }
  if (topPrize > sweetSpot * 1.8) {
    return {
      status: 'WEAK',
      summary: `Headline prize ($${Math.round(topPrize)}) far above the sweet spot ($${sweetSpot}). Consider splitting into majors.`,
      signals: [`Sweet spot: $${sweetSpot}`],
      sources: [SOURCE_IDS.PROSPECT, SOURCE_IDS.PRIZE_TIERING],
    }
  }
  if (topPrize < sweetSpot * 0.6) {
    return {
      status: 'WEAK',
      summary: `Headline prize ($${Math.round(topPrize)}) feels under-sized versus the $${sweetSpot} benchmark.`,
      signals: [`Sweet spot: $${sweetSpot}`],
      sources: [SOURCE_IDS.PROSPECT, SOURCE_IDS.PRIZE_TIERING],
    }
  }
  return {
    status: 'STRONG',
    summary: `Top prize (~$${Math.round(topPrize)}) sits inside the perceived sweet spot.`,
    signals: [`Sweet spot: $${sweetSpot}`],
    sources: [SOURCE_IDS.PROSPECT],
  }
}

function evaluateProgressSignals(spec: Record<string, any>): WinSenseDimension {
  const haystack = JSON.stringify({
    entry: spec.entryMechanic,
    loyalty: spec.loyaltyTier,
    notes: spec.mechanicOneLiner,
    copy: spec.cadenceCopy,
    proof: spec.proofType,
  }).toLowerCase()
  const keywords = ['stamp', 'streak', 'progress', 'bonus entry', 'unlock', 'collect', 'tiers', 'mission', 'challenge']
  const hits = keywords.filter((word) => haystack.includes(word))
  if (hits.length) {
    return {
      status: 'STRONG',
      summary: `Progress cues detected (${hits.slice(0, 3).join(', ')}).`,
      signals: hits.slice(0, 5),
      sources: [SOURCE_IDS.GOAL_GRADIENT, SOURCE_IDS.ENDOWED_PROGRESS],
    }
  }
  return {
    status: 'WEAK',
    summary: 'No visible progress cues; add stamp cards, streaks, or auto-start bonuses.',
    signals: [],
    sources: [SOURCE_IDS.GOAL_GRADIENT, SOURCE_IDS.ENDOWED_PROGRESS],
  }
}

function evaluateCadence(
  density: number | null,
  frequencyCopy: string | null,
  benchmark: BenchmarkSlice | null
): WinSenseDimension {
  if (frequencyCopy) {
    return {
      status: 'STRONG',
      summary: `Cadence already framed (“${frequencyCopy.trim()}”).`,
      signals: [frequencyCopy.trim()],
      sources: [SOURCE_IDS.REINFORCEMENT],
    }
  }
  if (density == null) {
    return {
      status: 'UNKNOWN',
      summary: 'Unable to infer cadence density.',
      signals: [],
      sources: [SOURCE_IDS.REINFORCEMENT],
    }
  }
  const winnersPerDayTypical = benchmark?.winnersPerDayTypical ?? 10
  if (density >= winnersPerDayTypical) {
    return {
      status: 'OK',
      summary: `Winner density (${density.toFixed(1)}/day) meets market norms—surface it in copy.`,
      signals: [`Typical: ${winnersPerDayTypical}/day`],
      sources: [SOURCE_IDS.REINFORCEMENT],
    }
  }
  return {
    status: 'WEAK',
    summary: `Winner density (${density.toFixed(2)}/day) trails the ${winnersPerDayTypical}/day benchmark.`,
    signals: [`Typical: ${winnersPerDayTypical}/day`],
    sources: [SOURCE_IDS.REINFORCEMENT],
  }
}

function extractTopPrizeValue(spec: Record<string, any>): number | null {
  if (spec.heroPrizeValue != null) return numeric(spec.heroPrizeValue)
  if (spec.heroPrizeAmount != null) return numeric(spec.heroPrizeAmount)
  if (spec.topPrizeValue != null) return numeric(spec.topPrizeValue)
  if (spec.prizePool) {
    const pool = numeric(spec.prizePool)
    if (pool != null && spec.heroPrizeCount) {
      const count = numeric(spec.heroPrizeCount) || 1
      return pool / count
    }
  }
  if (typeof spec.heroPrize === 'string') {
    const match = spec.heroPrize.replace(/,/g, '').match(/\$?\s*(\d+(?:\.\d+)?)/)
    if (match) return Number(match[1])
  }
  return null
}
