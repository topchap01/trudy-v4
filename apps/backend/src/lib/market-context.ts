import { readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const BASELINE_PATH = join(
  homedir(),
  'Documents/Claude/Scheduled/promo-monitor-fortnightly/baseline_promos.json'
)

export type BaselinePromo = {
  title: string
  category: string
  promoter: string
  technique: string
  method: string
  prizeCount: string
  value: string
  status: string
  dates: string
}

type CacheEntry = {
  mtimeMs: number
  promos: BaselinePromo[]
}

let cache: CacheEntry | null = null

function loadBaseline(): { promos: BaselinePromo[]; mtimeMs: number | null } {
  let mtimeMs: number
  try {
    mtimeMs = statSync(BASELINE_PATH).mtimeMs
  } catch {
    return { promos: [], mtimeMs: null }
  }
  if (cache && cache.mtimeMs === mtimeMs) {
    return { promos: cache.promos, mtimeMs }
  }
  try {
    const raw = readFileSync(BASELINE_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const promos = Array.isArray(parsed) ? (parsed as BaselinePromo[]) : []
    cache = { mtimeMs, promos }
    return { promos, mtimeMs }
  } catch {
    return { promos: [], mtimeMs }
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

function parseValue(value: string): number | null {
  if (!value) return null
  const cleaned = String(value).replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export type MarketContextFilter = {
  category?: string
  mechanic?: string
  status?: string
}

export type MarketContextResult = {
  source: 'promo-monitor-fortnightly'
  baselinePath: string
  baselineLastUpdated: string | null
  totalRecords: number
  appliedFilters: { category: string | null; mechanic: string | null; status: string }
  filtered: {
    count: number
    sampleTitles: string[]
    valueStats: { count: number; min: number | null; max: number | null; mean: number | null }
    topPromoters: Array<{ promoter: string; count: number }>
    topTechniques: Array<{ technique: string; count: number }>
    promos: BaselinePromo[]
  }
}

export function getMarketContext(filter: MarketContextFilter = {}): MarketContextResult {
  const { promos, mtimeMs } = loadBaseline()
  const status = filter.status ?? 'Active'

  const filtered = promos.filter((p) => {
    if (status !== 'all' && (p.status || '').toLowerCase() !== status.toLowerCase()) return false
    if (!fuzzyMatch(p.category, filter.category ?? '')) return false
    if (!fuzzyMatch(p.technique, filter.mechanic ?? '')) return false
    return true
  })

  const values = filtered
    .map((p) => parseValue(p.value))
    .filter((v): v is number => v != null)

  const valueStats = values.length
    ? {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        mean: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
      }
    : { count: 0, min: null, max: null, mean: null }

  const tally = (arr: string[]): Array<[string, number]> => {
    const map = new Map<string, number>()
    for (const item of arr) map.set(item, (map.get(item) ?? 0) + 1)
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }

  const topPromoters = tally(filtered.map((p) => p.promoter).filter(Boolean))
    .slice(0, 5)
    .map(([promoter, count]) => ({ promoter, count }))

  const topTechniques = tally(filtered.map((p) => p.technique).filter(Boolean))
    .slice(0, 5)
    .map(([technique, count]) => ({ technique, count }))

  return {
    source: 'promo-monitor-fortnightly',
    baselinePath: BASELINE_PATH,
    baselineLastUpdated: mtimeMs ? new Date(mtimeMs).toISOString() : null,
    totalRecords: promos.length,
    appliedFilters: {
      category: filter.category ?? null,
      mechanic: filter.mechanic ?? null,
      status,
    },
    filtered: {
      count: filtered.length,
      sampleTitles: filtered.slice(0, 5).map((p) => p.title),
      valueStats,
      topPromoters,
      topTechniques,
      promos: filtered,
    },
  }
}
