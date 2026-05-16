// apps/backend/src/shelf/research.ts
// Simplified research pipeline — answers 4 key questions for a promotional brief.

import { chat } from '../lib/openai.js'
import { prisma } from '../db/prisma.js'
import { resolveModel } from '../lib/models.js'

/* --------------------------------- Types --------------------------------- */

export type ResearchDossier = {
  competitorPromos: Array<{
    brand: string; mechanic: string; headline: string;
    source: string; what_works: string; what_to_avoid: string
  }>
  culturalMoments: Array<{
    event: string; date: string; relevance: string; hook_angle: string
  }>
  retailerContext: Array<{
    insight: string; source: string; implication: string
  }>
  mechanicPrecedents: Array<{
    brand: string; mechanic: string; category: string; outcome: string; source: string
  }>
  categoryFacts: Array<{ fact: string; source: string }>
}

type SearchResult = { title: string; url: string; snippet?: string }

/** Escape XML special characters to prevent injection */
function escapeXml(str: string): string {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

const EMPTY_DOSSIER: ResearchDossier = {
  competitorPromos: [], culturalMoments: [],
  retailerContext: [], mechanicPrecedents: [], categoryFacts: [],
}

const SERPER_KEY = process.env.SERPER_API_KEY ?? ''
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

/* ----------------------------- Serper search ------------------------------ */

async function searchSerper(q: string): Promise<SearchResult[]> {
  if (!SERPER_KEY) { console.warn('[shelf-research] SERPER_API_KEY not set'); return [] }
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': SERPER_KEY },
      body: JSON.stringify({ q, gl: 'au', hl: 'en', num: 8 }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    if (!res.ok) { console.error('[shelf-research] Serper HTTP', res.status); return [] }
    const data = await res.json() as any
    const organic: any[] = Array.isArray(data?.organic) ? data.organic : []
    return organic.map(r => ({
      title: String(r.title ?? ''),
      url: String(r.link ?? ''),
      snippet: String(r.snippet ?? ''),
    }))
  } catch (err: any) {
    console.error('[shelf-research] Serper error:', err?.message ?? err)
    return []
  }
}

/* ----------------------------- Query builder ----------------------------- */

function buildQueries(p: {
  brand: string; category: string; market: string;
  retailers?: string[]; mechanic?: string; competitors?: string[]
}): string[] {
  const now = new Date()
  const year = now.getFullYear()
  const monthName = now.toLocaleString('en-AU', { month: 'long' })
  const queries: string[] = []

  // Q1 — competitor promos
  const compBrands = p.competitors?.length ? p.competitors.join(' OR ') : p.category
  queries.push(`${compBrands} promotion ${year} ${p.market}`)
  queries.push(`${p.category} cashback instant win prize ${p.market} ${year}`)

  // Q2 — cultural moments
  queries.push(`${p.market} events ${monthName} ${year} marketing`)

  // Q3 — retailer context
  if (p.retailers?.length) {
    for (const r of p.retailers.slice(0, 2)) {
      queries.push(`${r} ${p.category} strategy shopper marketing ${year}`)
    }
  } else {
    queries.push(`${p.market} ${p.category} retail trends ${year}`)
  }

  // Q4 — mechanic precedent
  if (p.mechanic) {
    queries.push(`${p.category} ${p.mechanic} promotion ${p.market}`)
  }

  return queries
}

/* ----------------------------- Cache helpers ------------------------------ */

function cacheKey(brand: string, category: string, market: string): string {
  return `shelfResearch::${brand.toLowerCase()}::${category.toLowerCase()}::${market.toLowerCase()}`
}

async function getCached(brand: string, category: string, market: string): Promise<ResearchDossier | null> {
  try {
    const key = cacheKey(brand, category, market)
    const cutoff = new Date(Date.now() - CACHE_TTL_MS)
    const row = await prisma.output.findFirst({
      where: { type: 'shelfResearch', prompt: key, createdAt: { gte: cutoff } },
      orderBy: { createdAt: 'desc' },
    })
    if (row) return JSON.parse(row.content) as ResearchDossier
  } catch { /* cache miss is fine */ }
  return null
}

async function setCache(brand: string, category: string, market: string, dossier: ResearchDossier, campaignId?: string): Promise<void> {
  try {
    const key = cacheKey(brand, category, market)
    // We need a campaignId for the Output table — use a sentinel if none supplied
    const cid = campaignId ?? 'shelf-research-cache'
    await prisma.output.create({
      data: {
        campaignId: cid,
        type: 'shelfResearch',
        prompt: key,
        params: { brand, category, market },
        content: JSON.stringify(dossier),
      },
    })
  } catch (err: any) {
    console.error('[shelf-research] cache write failed:', err?.message ?? err)
  }
}

/* ------------------------------ LLM analysis ----------------------------- */

const ANALYSIS_SYSTEM = `You are a promotional marketing research analyst for the Australian market.
You will receive web search results. Extract structured insights answering four questions:

1. COMPETITOR PROMOS — What promotions are competitors running right now in this category?
2. CULTURAL MOMENTS — What upcoming events, seasons, or cultural moments (next 4-8 weeks) could a brand attach to?
3. RETAILER CONTEXT — What does the retailer care about? Category trends, retail media, shopper behaviour.
4. MECHANIC PRECEDENTS — Has this specific promotional mechanic been done in this category before?

Also extract any useful CATEGORY FACTS (market size, growth, consumer behaviour stats).

Respond with ONLY valid JSON matching this exact shape (no markdown, no wrapping):
{
  "competitorPromos": [{ "brand": "", "mechanic": "", "headline": "", "source": "", "what_works": "", "what_to_avoid": "" }],
  "culturalMoments": [{ "event": "", "date": "", "relevance": "", "hook_angle": "" }],
  "retailerContext": [{ "insight": "", "source": "", "implication": "" }],
  "mechanicPrecedents": [{ "brand": "", "mechanic": "", "category": "", "outcome": "", "source": "" }],
  "categoryFacts": [{ "fact": "", "source": "" }]
}

If you have no data for a section, return an empty array. Be concise but insightful. Every insight should be actionable for a promotional marketer. Cite the source URL where possible.`

async function analyseResults(
  params: { brand: string; category: string; market: string; mechanic?: string; retailers?: string[] },
  allResults: Array<{ query: string; results: SearchResult[] }>,
): Promise<ResearchDossier> {
  // Build the user message with XML-tagged sections
  let userContent = `<brief>
  <brand>${escapeXml(params.brand)}</brand>
  <category>${escapeXml(params.category)}</category>
  <market>${escapeXml(params.market)}</market>
  ${params.mechanic ? `<mechanic>${escapeXml(params.mechanic)}</mechanic>` : ''}
  ${params.retailers?.length ? `<retailers>${params.retailers.map(escapeXml).join(', ')}</retailers>` : ''}
</brief>\n\n`

  for (const { query, results } of allResults) {
    userContent += `<search_results query="${escapeXml(query)}">\n`
    for (const r of results) {
      userContent += `  <result>\n    <title>${escapeXml(r.title)}</title>\n    <url>${escapeXml(r.url)}</url>\n    <snippet>${escapeXml(r.snippet ?? '')}</snippet>\n  </result>\n`
    }
    userContent += `</search_results>\n\n`
  }

  const model = resolveModel('claude-sonnet-4-20250514')
  const raw = await chat({
    model,
    system: ANALYSIS_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
    thinking: true,
    thinkingBudget: 8000,
    max_output_tokens: 4000,
    json: true,
    meta: { source: 'shelf-research' },
  })

  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```(?:json)?\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      competitorPromos: Array.isArray(parsed.competitorPromos) ? parsed.competitorPromos : [],
      culturalMoments: Array.isArray(parsed.culturalMoments) ? parsed.culturalMoments : [],
      retailerContext: Array.isArray(parsed.retailerContext) ? parsed.retailerContext : [],
      mechanicPrecedents: Array.isArray(parsed.mechanicPrecedents) ? parsed.mechanicPrecedents : [],
      categoryFacts: Array.isArray(parsed.categoryFacts) ? parsed.categoryFacts : [],
    }
  } catch (err: any) {
    console.error('[shelf-research] Failed to parse LLM JSON:', err?.message)
    console.error('[shelf-research] Raw output (first 500):', raw.slice(0, 500))
    return { ...EMPTY_DOSSIER }
  }
}

/* ----------------------------- Main export ------------------------------- */

export async function runShelfResearch(params: {
  brand: string
  category: string
  market?: string
  retailers?: string[]
  mechanic?: string
  competitors?: string[]
  campaignId?: string
}): Promise<ResearchDossier> {
  const market = params.market ?? 'Australia'
  const { brand, category, retailers, mechanic, competitors, campaignId } = params

  // 1. Check cache
  const cached = await getCached(brand, category, market)
  if (cached) {
    console.info('[shelf-research] returning cached dossier for', brand, category, market)
    return cached
  }

  // 2. Build and run searches
  const queries = buildQueries({ brand, category, market, retailers, mechanic, competitors })
  console.info('[shelf-research] running', queries.length, 'searches for', brand, category)

  const allResults: Array<{ query: string; results: SearchResult[] }> = []
  const searchPromises = queries.map(async (q) => {
    const results = await searchSerper(q)
    return { query: q, results }
  })
  const settled = await Promise.allSettled(searchPromises)
  for (const s of settled) {
    if (s.status === 'fulfilled') allResults.push(s.value)
  }

  const totalHits = allResults.reduce((n, r) => n + r.results.length, 0)
  if (totalHits === 0) {
    console.warn('[shelf-research] no search results found — returning empty dossier')
    return { ...EMPTY_DOSSIER }
  }

  console.info('[shelf-research]', totalHits, 'total search results — sending to Claude for analysis')

  // 3. Analyse with Claude
  const dossier = await analyseResults({ brand, category, market, mechanic, retailers }, allResults)

  // 4. Cache result
  await setCache(brand, category, market, dossier, campaignId)

  return dossier
}
