import { readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const DEFAULT_PATH = join(REPO_ROOT, 'data', 'sf-campaign-outcomes.json')
const SF_PATH = process.env.SF_OUTCOMES_PATH || DEFAULT_PATH

export type SfPrize = {
  name: string
  level: number
  value: number
  maxWinners: number
  claimed: number
  type: string
}

export type SfCashbackRange = {
  name: string
  cashbackValue: number
  minSpend: number
  maxSpend: number | null
}

export type SfCampaign = {
  id: string
  name: string
  jobNumber?: string | null
  mechanic: string
  status: string
  active: boolean
  entryCount: number
  campaignStart?: string | null
  campaignEnd?: string | null
  salesFrom?: string | null
  salesTo?: string | null
  clientName?: string | null
  majorPrizeValue?: number | null
  totalPrizePoolValue?: number | null
  prizes?: SfPrize[]
  cashbackRanges?: SfCashbackRange[]
  micrositeUrl?: string | null
}

type SfExport = {
  exportDate?: string
  source?: string
  totalCampaigns?: number
  schema?: string
  campaigns: SfCampaign[]
}

type CacheEntry = { mtimeMs: number; data: SfExport | null }
let cache: CacheEntry | null = null

function loadExport(): { data: SfExport | null; mtimeMs: number | null } {
  let mtimeMs: number
  try {
    mtimeMs = statSync(SF_PATH).mtimeMs
  } catch {
    return { data: null, mtimeMs: null }
  }
  if (cache && cache.mtimeMs === mtimeMs) {
    return { data: cache.data, mtimeMs }
  }
  try {
    const raw = readFileSync(SF_PATH, 'utf8')
    const parsed = JSON.parse(raw) as SfExport
    cache = { mtimeMs, data: parsed }
    return { data: parsed, mtimeMs }
  } catch {
    return { data: null, mtimeMs }
  }
}

function tokens(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 4)
}

function compact(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function fuzzyMatch(target: string, query: string): boolean {
  if (!query) return true
  const p = (target || '').toLowerCase()
  const q = query.toLowerCase()
  if (!p) return false
  if (p.includes(q) || q.includes(p)) return true
  const pc = compact(p)
  const qc = compact(q)
  if (pc && qc && (pc.includes(qc) || qc.includes(pc))) return true
  const pTokens = tokens(p)
  const qTokens = tokens(q)
  return qTokens.some((t) => pTokens.includes(t))
}

function isTestCampaign(c: SfCampaign): boolean {
  return /\btest\b/i.test(c.name || '') || /TEST/.test(c.jobNumber || '')
}

export type CampaignOutcomesFilter = {
  mechanic?: string
  statusFilter?: 'active' | 'completed' | 'all'
  includeTest?: boolean
}

export type CampaignSummary = {
  name: string
  clientName: string | null
  mechanic: string
  status: string
  entryCount: number
  campaignWindow: string | null
  totalPrizePoolValue: number | null
  majorPrizeValue: number | null
  prizeLadder: Array<{
    level: number
    name: string
    value: number
    maxWinners: number
    claimed: number
    claimRate: number
  }>
  cashbackTiers: SfCashbackRange[]
  overallClaimRate: number | null
  micrositeUrl: string | null
}

export type CampaignOutcomesResult = {
  source: 'trevor-salesforce'
  exportPath: string
  exportDate: string | null
  totalRecords: number
  appliedFilters: {
    mechanic: string | null
    status: 'active' | 'completed' | 'all'
    includeTest: boolean
  }
  matched: {
    count: number
    totalEntries: number
    avgEntries: number | null
    aggregateClaimRate: number | null
    top: CampaignSummary[]
  }
}

function toSummary(c: SfCampaign): CampaignSummary {
  const window =
    c.salesFrom && c.salesTo
      ? `${c.salesFrom} to ${c.salesTo}`
      : c.salesFrom || c.salesTo || null
  const allPrizes = Array.isArray(c.prizes) ? c.prizes : []
  const prizeLadder = allPrizes.slice(0, 3).map((p) => ({
    level: p.level,
    name: p.name,
    value: p.value,
    maxWinners: p.maxWinners,
    claimed: p.claimed ?? 0,
    claimRate: p.maxWinners > 0 ? (p.claimed ?? 0) / p.maxWinners : 0,
  }))
  const totalClaimed = allPrizes.reduce((s, p) => s + (p.claimed ?? 0), 0)
  const totalMax = allPrizes.reduce((s, p) => s + (p.maxWinners ?? 0), 0)
  const overallClaimRate = totalMax > 0 ? totalClaimed / totalMax : null

  return {
    name: c.name,
    clientName: c.clientName ?? null,
    mechanic: c.mechanic,
    status: c.status,
    entryCount: c.entryCount ?? 0,
    campaignWindow: window,
    totalPrizePoolValue: c.totalPrizePoolValue ?? null,
    majorPrizeValue: c.majorPrizeValue ?? null,
    prizeLadder,
    cashbackTiers: Array.isArray(c.cashbackRanges) ? c.cashbackRanges : [],
    overallClaimRate,
    micrositeUrl: c.micrositeUrl ?? null,
  }
}

export function getCampaignOutcomes(
  filter: CampaignOutcomesFilter = {}
): CampaignOutcomesResult {
  const status = filter.statusFilter ?? 'all'
  const includeTest = filter.includeTest ?? false
  const { data, mtimeMs } = loadExport()
  const campaigns = data?.campaigns ?? []

  const matched = campaigns.filter((c) => {
    if (!includeTest && isTestCampaign(c)) return false
    if (status === 'active' && !c.active) return false
    if (status === 'completed' && c.active) return false
    if (!fuzzyMatch(c.mechanic, filter.mechanic ?? '')) return false
    return true
  })

  const matchedSorted = [...matched].sort(
    (a, b) => (b.entryCount ?? 0) - (a.entryCount ?? 0)
  )
  const totalEntries = matched.reduce((s, c) => s + (c.entryCount ?? 0), 0)
  const avgEntries = matched.length ? Math.round(totalEntries / matched.length) : null

  let totalClaimed = 0
  let totalMaxWinners = 0
  for (const c of matched) {
    for (const p of c.prizes ?? []) {
      totalClaimed += p.claimed ?? 0
      totalMaxWinners += p.maxWinners ?? 0
    }
  }
  const aggregateClaimRate = totalMaxWinners > 0 ? totalClaimed / totalMaxWinners : null

  return {
    source: 'trevor-salesforce',
    exportPath: SF_PATH,
    exportDate: data?.exportDate ?? (mtimeMs ? new Date(mtimeMs).toISOString().slice(0, 10) : null),
    totalRecords: campaigns.length,
    appliedFilters: {
      mechanic: filter.mechanic ?? null,
      status,
      includeTest,
    },
    matched: {
      count: matched.length,
      totalEntries,
      avgEntries,
      aggregateClaimRate,
      top: matchedSorted.slice(0, 5).map(toSummary),
    },
  }
}
