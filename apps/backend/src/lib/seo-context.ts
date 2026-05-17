// apps/backend/src/lib/seo-context.ts
// Reads the SEO Deep Dive baseline JSON produced by the Cowork weekly task.
// Same mtime-cache pattern as market-context.ts and campaign-outcomes.ts.

import { readFileSync, readdirSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const SEO_DIR = join(
  homedir(),
  'Documents/Claude/Scheduled/weekly-seo-deep-dive'
)

// --- Types matching the Cowork task's output schema ---

export type KeywordObservation = {
  visibility: string // "Found on page 1" | "Found on page 2+" | "Not found in results"
  url: string | null
}

export type SeoBaseline = {
  date: string
  keyword_observations: Record<string, KeywordObservation>
  indexation: {
    total_pages_indexed: number
    blog_articles_indexed: number
  }
  content_analysis: {
    total_articles: number
    articles_this_week: number
    pillar_distribution: Record<string, number>
    refresh_candidates: string[]
    cannibalisation_risks: string[][]
    keyword_gaps: string[]
  }
  competitors_observed: Record<string, string[]>
  actions_taken: {
    urls_submitted_for_indexing: string[]
    meta_descriptions_fixed: string[]
    seo_titles_fixed: string[]
    alt_text_fixed: string[]
    cache_purged: boolean
    sitemap_verified: boolean
  }
}

type CacheEntry = {
  mtimeMs: number
  baseline: SeoBaseline
}

let cache: CacheEntry | null = null

/**
 * Find the most recent seo-baseline-*.json file in the SEO directory.
 */
function findLatestBaseline(): string | null {
  try {
    const files = readdirSync(SEO_DIR)
      .filter((f) => f.startsWith('seo-baseline-') && f.endsWith('.json'))
      .sort()
      .reverse()
    return files.length > 0 ? join(SEO_DIR, files[0]) : null
  } catch {
    return null
  }
}

function loadBaseline(): { baseline: SeoBaseline | null; mtimeMs: number | null; path: string | null } {
  const filePath = findLatestBaseline()
  if (!filePath) return { baseline: null, mtimeMs: null, path: null }

  let mtimeMs: number
  try {
    mtimeMs = statSync(filePath).mtimeMs
  } catch {
    return { baseline: null, mtimeMs: null, path: filePath }
  }

  if (cache && cache.mtimeMs === mtimeMs) {
    return { baseline: cache.baseline, mtimeMs, path: filePath }
  }

  try {
    const raw = readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw) as SeoBaseline
    cache = { mtimeMs, baseline: parsed }
    return { baseline: parsed, mtimeMs, path: filePath }
  } catch {
    return { baseline: null, mtimeMs, path: filePath }
  }
}

// --- Public API ---

export type SeoContextResult = {
  source: 'seo-deep-dive-weekly'
  baselinePath: string | null
  baselineDate: string | null
  available: boolean
  keywordGaps: string[]
  pillarDistribution: Record<string, number>
  refreshCandidates: string[]
  cannibalisationRisks: string[][]
  topKeywords: Array<{ keyword: string; visibility: string; url: string | null }>
  competitorDomains: Array<{ keyword: string; domains: string[] }>
  indexation: { totalPages: number; blogArticles: number } | null
}

export function getSeoContext(): SeoContextResult {
  const { baseline, path } = loadBaseline()

  if (!baseline) {
    return {
      source: 'seo-deep-dive-weekly',
      baselinePath: path,
      baselineDate: null,
      available: false,
      keywordGaps: [],
      pillarDistribution: {},
      refreshCandidates: [],
      cannibalisationRisks: [],
      topKeywords: [],
      competitorDomains: [],
      indexation: null,
    }
  }

  // Extract top keywords (page 1 visibility)
  const topKeywords = Object.entries(baseline.keyword_observations || {})
    .filter(([, obs]) => obs.visibility?.includes('page 1'))
    .map(([keyword, obs]) => ({
      keyword,
      visibility: obs.visibility,
      url: obs.url,
    }))

  // Extract competitor domains with keyword context
  const competitorDomains = Object.entries(baseline.competitors_observed || {})
    .filter(([, domains]) => domains.length > 0)
    .map(([keyword, domains]) => ({ keyword, domains }))

  return {
    source: 'seo-deep-dive-weekly',
    baselinePath: path,
    baselineDate: baseline.date ?? null,
    available: true,
    keywordGaps: baseline.content_analysis?.keyword_gaps ?? [],
    pillarDistribution: baseline.content_analysis?.pillar_distribution ?? {},
    refreshCandidates: baseline.content_analysis?.refresh_candidates ?? [],
    cannibalisationRisks: baseline.content_analysis?.cannibalisation_risks ?? [],
    topKeywords,
    competitorDomains,
    indexation: baseline.indexation
      ? {
          totalPages: baseline.indexation.total_pages_indexed,
          blogArticles: baseline.indexation.blog_articles_indexed,
        }
      : null,
  }
}
