// apps/backend/src/shelf/research.ts
// Simplified research pipeline — answers 4 key questions for a promotional brief.

import { chat } from '../lib/openai.js'
import { prisma } from '../db/prisma.js'
import { resolveModel } from '../lib/models.js'
import { getMarketContext } from '../lib/market-context.js'
import { getCampaignOutcomes } from '../lib/campaign-outcomes.js'
import { getSeoContext } from '../lib/seo-context.js'

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

  // 1. Build the web-research dossier (Serper + Claude). Cache hits short-circuit this.
  let dossier: ResearchDossier
  const cached = await getCached(brand, category, market)
  if (cached) {
    console.info('[shelf-research] returning cached dossier for', brand, category, market)
    dossier = cached
  } else {
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
      console.warn('[shelf-research] no search results found — proceeding with empty web dossier')
      dossier = { ...EMPTY_DOSSIER }
    } else {
      console.info('[shelf-research]', totalHits, 'total search results — sending to Claude for analysis')
      dossier = await analyseResults({ brand, category, market, mechanic, retailers }, allResults)
      await setCache(brand, category, market, dossier, campaignId)
    }
  }

  // 2. Always layer in fresh local data (after cache lookup so it doesn't get stale-cached).
  //    Three independent augmentations:
  //      a. Promo Monitor baseline — live AU competitor promos
  //      b. Trevor Salesforce outcomes — past campaign performance with claim rates
  //      c. SEO Deep Dive baseline — keyword gaps and content health for route generation
  let augmented = augmentWithMarketContext(dossier, { category, mechanic })
  augmented = augmentWithCampaignOutcomes(augmented, { mechanic })
  augmented = augmentWithSeoContext(augmented, { brand, category })
  return augmented
}

function augmentWithMarketContext(
  dossier: ResearchDossier,
  params: { category: string; mechanic?: string }
): ResearchDossier {
  const local = getMarketContext({ category: params.category, mechanic: params.mechanic })
  if (local.filtered.count === 0) return dossier

  const stats = local.filtered.valueStats
  const observedDate = local.baselineLastUpdated?.slice(0, 10) ?? 'recent'
  const factParts = [
    `${local.filtered.count} matching promo${local.filtered.count === 1 ? '' : 's'} currently active in AU (observed via Promo Monitor baseline as of ${observedDate})`,
  ]
  if (stats.count > 0 && stats.min != null && stats.max != null && stats.mean != null) {
    factParts.push(
      `prize values $${stats.min.toLocaleString()}–$${stats.max.toLocaleString()} (mean $${stats.mean.toLocaleString()})`
    )
  }
  const topPromoters = local.filtered.topPromoters.slice(0, 3).map((p) => p.promoter).join(', ')
  if (topPromoters) factParts.push(`most active promoters: ${topPromoters}`)

  const summaryFact = {
    fact: factParts.join('. '),
    source: 'Promo Monitor fortnightly baseline',
  }

  const observed = local.filtered.promos.slice(0, 20).map((p) => ({
    brand: p.promoter || 'Unknown',
    mechanic: p.technique || '',
    headline: [
      p.title,
      p.value ? `Value: ${p.value}` : null,
      p.dates ? `Dates: ${p.dates}` : null,
    ]
      .filter(Boolean)
      .join(' | '),
    source: 'Promo Monitor baseline (observed)',
    what_works: '',
    what_to_avoid: '',
  }))

  console.info(
    `[shelf-research] augmented dossier with ${observed.length} observed promos from Promo Monitor baseline`
  )

  return {
    ...dossier,
    categoryFacts: [summaryFact, ...dossier.categoryFacts],
    competitorPromos: [...observed, ...dossier.competitorPromos],
  }
}

function augmentWithCampaignOutcomes(
  dossier: ResearchDossier,
  params: { mechanic?: string }
): ResearchDossier {
  if (!params.mechanic) return dossier
  const sf = getCampaignOutcomes({ mechanic: params.mechanic })
  if (sf.matched.count === 0) return dossier

  const factParts = [
    `Trevor has run ${sf.matched.count} ${params.mechanic} campaign${sf.matched.count === 1 ? '' : 's'} (${sf.matched.totalEntries.toLocaleString()} total entries${sf.matched.avgEntries != null ? `, avg ${sf.matched.avgEntries.toLocaleString()}` : ''})`,
  ]
  if (sf.matched.aggregateClaimRate != null) {
    factParts.push(
      `overall prize claim rate ${Math.round(sf.matched.aggregateClaimRate * 100)}%`
    )
  }
  // Cashback campaigns don't carry prize claim data; expose tier structure instead.
  const allCashbackTiers = sf.matched.top.flatMap((c) => c.cashbackTiers)
  if (allCashbackTiers.length > 0) {
    const cbValues = allCashbackTiers.map((t) => t.cashbackValue).filter((v): v is number => v != null)
    const minSpends = allCashbackTiers.map((t) => t.minSpend).filter((v): v is number => v != null)
    if (cbValues.length && minSpends.length) {
      factParts.push(
        `cashback structures: $${Math.min(...cbValues).toLocaleString()}–$${Math.max(...cbValues).toLocaleString()} cashback against $${Math.min(...minSpends).toLocaleString()}–$${Math.max(...minSpends).toLocaleString()} spend thresholds`
      )
    }
  }
  const topCampaign = sf.matched.top[0]
  if (topCampaign) {
    const claimNote =
      topCampaign.overallClaimRate != null
        ? `, ${Math.round(topCampaign.overallClaimRate * 100)}% claim rate`
        : ''
    factParts.push(
      `highest-entry: ${topCampaign.name} (${topCampaign.entryCount.toLocaleString()} entries${claimNote})`
    )
  }

  const summaryFact = {
    fact: factParts.join('. '),
    source: `Trevor / Salesforce campaign outcomes (exported ${sf.exportDate ?? 'recent'})`,
  }

  const precedents = sf.matched.top.map((c) => {
    const outcomeParts: string[] = [`${c.entryCount.toLocaleString()} entries`]
    if (c.totalPrizePoolValue) {
      outcomeParts.push(`prize pool $${c.totalPrizePoolValue.toLocaleString()}`)
    }
    if (c.overallClaimRate != null) {
      outcomeParts.push(`${Math.round(c.overallClaimRate * 100)}% prizes claimed`)
    }
    if (c.prizeLadder.length) {
      const ladderDesc = c.prizeLadder
        .map(
          (p) =>
            `L${p.level} ${p.name} $${p.value.toLocaleString()} (${p.claimed}/${p.maxWinners})`
        )
        .join(', ')
      outcomeParts.push(`top ladder rungs: ${ladderDesc}`)
    }
    if (c.cashbackTiers.length) {
      const tierDesc = c.cashbackTiers
        .map((t) => {
          const spendRange =
            t.maxSpend != null
              ? `$${t.minSpend.toLocaleString()}–$${t.maxSpend.toLocaleString()}`
              : `$${t.minSpend.toLocaleString()}+`
          return `${spendRange} → $${t.cashbackValue.toLocaleString()}`
        })
        .join('; ')
      outcomeParts.push(`cashback tiers: ${tierDesc}`)
    }
    return {
      brand: c.clientName ?? 'Unknown client',
      mechanic: c.mechanic,
      category: '',
      outcome: outcomeParts.join(' | '),
      source: `Trevor SF campaign "${c.name}"${c.campaignWindow ? ` (${c.campaignWindow})` : ''}`,
    }
  })

  console.info(
    `[shelf-research] augmented dossier with ${precedents.length} Trevor campaign precedents (mechanic="${params.mechanic}")`
  )

  return {
    ...dossier,
    categoryFacts: [summaryFact, ...dossier.categoryFacts],
    mechanicPrecedents: [...precedents, ...dossier.mechanicPrecedents],
  }
}

/* ---------- 3. SEO Deep Dive augmentation ---------- */

function augmentWithSeoContext(
  dossier: ResearchDossier,
  params: { brand?: string; category?: string }
): ResearchDossier {
  const seo = getSeoContext()
  if (!seo.available) {
    console.info('[shelf-research] SEO baseline not available — skipping SEO augmentation')
    return dossier
  }

  const extraFacts: Array<{ fact: string; source: string }> = []
  const src = `SEO Deep Dive baseline (${seo.baselineDate ?? 'unknown date'})`

  // 1. Keyword gaps — topics with no Trevor content coverage
  if (seo.keywordGaps.length > 0) {
    extraFacts.push({
      fact: `SEO keyword gaps with no Trevor content coverage: ${seo.keywordGaps.join(', ')}. Route concepts touching these topics may also serve content marketing goals.`,
      source: src,
    })
  }

  // 2. Content pillar distribution — shows where content weight sits
  const pillarEntries = Object.entries(seo.pillarDistribution)
  if (pillarEntries.length > 0) {
    const pillarDesc = pillarEntries
      .sort(([, a], [, b]) => b - a)
      .map(([pillar, count]) => `${pillar}: ${count}`)
      .join(', ')
    extraFacts.push({
      fact: `Current blog content distribution across One Job pillars: ${pillarDesc}. Under-represented pillars may benefit from promotional tie-in content.`,
      source: src,
    })
  }

  // 3. Refresh candidates — existing articles needing updates
  if (seo.refreshCandidates.length > 0) {
    const relevant = params.category
      ? seo.refreshCandidates.filter((url) =>
          url.toLowerCase().includes(params.category!.toLowerCase())
        )
      : seo.refreshCandidates
    if (relevant.length > 0) {
      extraFacts.push({
        fact: `Blog articles flagged for content refresh (potential tie-in with new campaign content): ${relevant.slice(0, 5).join(', ')}${relevant.length > 5 ? ` (+${relevant.length - 5} more)` : ''}.`,
        source: src,
      })
    }
  }

  // 4. Cannibalisation risks — keyword pairs competing with each other
  if (seo.cannibalisationRisks.length > 0) {
    const riskDesc = seo.cannibalisationRisks
      .slice(0, 3)
      .map((pair) => pair.join(' ↔ '))
      .join('; ')
    extraFacts.push({
      fact: `Content cannibalisation risks (avoid creating content that worsens these): ${riskDesc}.`,
      source: src,
    })
  }

  // 5. Top-performing keywords (page 1) relevant to this brand/category
  if (seo.topKeywords.length > 0) {
    const relevant = seo.topKeywords.filter((kw) => {
      const kwLower = kw.keyword.toLowerCase()
      const brandMatch = params.brand && kwLower.includes(params.brand.toLowerCase())
      const catMatch = params.category && kwLower.includes(params.category.toLowerCase())
      return brandMatch || catMatch
    })
    if (relevant.length > 0) {
      const kwDesc = relevant
        .slice(0, 5)
        .map((kw) => `"${kw.keyword}" (${kw.visibility})`)
        .join(', ')
      extraFacts.push({
        fact: `Trevor already ranks on page 1 for: ${kwDesc}. Campaign messaging can reinforce these positions.`,
        source: src,
      })
    }
  }

  // 6. Competitor domains appearing in SEO results
  if (seo.competitorDomains.length > 0) {
    const relevant = params.category
      ? seo.competitorDomains.filter((cd) =>
          cd.keyword.toLowerCase().includes(params.category!.toLowerCase())
        )
      : seo.competitorDomains.slice(0, 5)
    if (relevant.length > 0) {
      const compDesc = relevant
        .slice(0, 3)
        .map((cd) => `"${cd.keyword}": ${cd.domains.slice(0, 3).join(', ')}`)
        .join('; ')
      extraFacts.push({
        fact: `Competitor domains appearing in search results: ${compDesc}. Consider differentiation in campaign landing page SEO.`,
        source: src,
      })
    }
  }

  console.info(
    `[shelf-research] augmented dossier with ${extraFacts.length} SEO context facts (baseline: ${seo.baselineDate})`
  )

  if (extraFacts.length === 0) return dossier

  return {
    ...dossier,
    categoryFacts: [...dossier.categoryFacts, ...extraFacts],
  }
}
