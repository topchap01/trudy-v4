import type { CampaignContext } from './context.js'
import type { BenchmarkSlice } from './knowledge-grid.js'
import { getBenchmarkSlice, getFounderNotes } from './knowledge-grid.js'

export type CampaignRules = {
  marketCode: string
  promotionType: string
  retailers: string[]
  guardrails: {
    allStockists: boolean
    zeroStaff: boolean
    prizePoolFixed: boolean
  }
  staff: {
    burden: string
    zeroCapacity: boolean
  }
  prize: {
    totalWinners: number | null
    ticketPool: number | null
    shareableReward: boolean
    shareableAlternateWinnerCount: number | null
  }
  heuristics: {
    breadthStrong: boolean
    breadthSolid: boolean
  }
  founder: {
    notes: string[]
  }
  benchmarks?: BenchmarkSlice | null
}

const BREADTH_STRONG_THRESHOLD = 1500
const BREADTH_SOLID_THRESHOLD = 800

const SHAREABLE_PATTERN = /(double\s+(?:movie\s+)?pass|double\s+ticket|two\s+tickets)/i

const MARKET_CODE_FALLBACKS: Record<string, string> = {
  AUSTRALIA: 'AU',
  AUST: 'AU',
  AUS: 'AU',
  NEWZEALAND: 'NZ',
  NZ: 'NZ',
  UNITEDKINGDOM: 'UK',
  UK: 'UK',
  GREATBRITAIN: 'UK',
  GB: 'UK',
  IRELAND: 'IE',
  IE: 'IE',
  UNITEDSTATES: 'US',
  USA: 'US',
  US: 'US',
  CANADA: 'CA',
  CA: 'CA',
}

const toNumber = (value: any): number | null => {
  if (value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

export const normaliseMarketCode = (rawMarket: string | null | undefined): string => {
  if (!rawMarket) return 'GLOBAL'
  const compact = rawMarket.replace(/[^a-z]/gi, '').toUpperCase()
  if (!compact) return 'GLOBAL'
  if (compact.length <= 3 && compact in MARKET_CODE_FALLBACKS) return MARKET_CODE_FALLBACKS[compact]
  return MARKET_CODE_FALLBACKS[compact] || compact.slice(0, 3)
}

type CampaignRulesOptions = {
  benchmark?: BenchmarkSlice | null
}

export function buildCampaignRules(ctx: CampaignContext, opts: CampaignRulesOptions = {}): CampaignRules {
  const spec: any = ctx.briefSpec || {}
  const retailers: string[] = Array.isArray(spec.retailers) ? spec.retailers.filter(Boolean) : []
  const totalWinners = toNumber(spec.totalWinners ?? spec.breadthPrizeCount ?? spec.winnerCount ?? null)
  const heroPrize = typeof spec.heroPrize === 'string' ? spec.heroPrize : ''
  const assuredItems: string[] = Array.isArray(spec.assuredItems)
    ? spec.assuredItems.map((item: any) => String(item)).filter(Boolean)
    : []
  const shareableReward = [heroPrize, ...assuredItems].some((value) => SHAREABLE_PATTERN.test(String(value || '')))
  const shareableAlternateWinnerCount =
    !shareableReward && totalWinners != null ? Math.max(1, Math.round(totalWinners / 2)) : null
  const ticketPool = totalWinners != null ? totalWinners * (shareableReward ? 2 : 1) : null
  const staffBurden = String(spec.staffBurden || '').toUpperCase() || 'UNKNOWN'
  const zeroStaff = staffBurden === 'ZERO'
  const allStockists = retailers.some((retailer) => retailer.toLowerCase().includes('all stockists'))
  const breadthStrongThreshold = opts.benchmark?.breadthStrong ?? BREADTH_STRONG_THRESHOLD
  const breadthSolidThreshold = opts.benchmark?.breadthTypical ?? opts.benchmark?.breadthStrong ?? BREADTH_SOLID_THRESHOLD
  const breadthStrong = totalWinners != null && totalWinners >= breadthStrongThreshold
  const breadthSolid = totalWinners != null && totalWinners >= breadthSolidThreshold
  const promotionType = String(spec.typeOfPromotion || '').toUpperCase() || 'PRIZE'
  const prizePoolFixed = totalWinners != null
  const marketCode = normaliseMarketCode(String(ctx.market || spec.market || ''))

  return {
    marketCode,
    promotionType,
    retailers,
    guardrails: {
      allStockists,
      zeroStaff,
      prizePoolFixed,
    },
    staff: {
      burden: staffBurden,
      zeroCapacity: zeroStaff,
    },
    prize: {
      totalWinners,
      ticketPool,
      shareableReward,
      shareableAlternateWinnerCount,
    },
    heuristics: {
      breadthStrong,
      breadthSolid,
    },
    founder: { notes: [] },
    benchmarks: opts.benchmark ?? null,
  }
}

export async function loadCampaignRules(ctx: CampaignContext): Promise<CampaignRules> {
  const spec: any = ctx.briefSpec || {}
  const benchmark = await getBenchmarkSlice({
    market: ctx.market || spec.market || null,
    category: ctx.category || spec.category || null,
    promoType: spec.typeOfPromotion || null,
  })
  const founderNotes = await getFounderNotes({
    campaignId: ctx.id,
    market: ctx.market || spec.market || null,
    category: ctx.category || spec.category || null,
    promoType: spec.typeOfPromotion || null,
  })
  const rules = buildCampaignRules(ctx, { benchmark })
  rules.founder.notes = founderNotes
  return rules
}
