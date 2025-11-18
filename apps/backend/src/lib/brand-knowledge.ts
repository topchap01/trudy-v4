import { prisma } from '../db/prisma.js'
import { chat } from './openai.js'
import { normaliseMarketCode } from './campaign-rules.js'

export type BrandKnowledgeDossier = {
  brandTruths?: string[]
  shopperTensions?: string[]
  retailerReality?: string[]
  competitorMoves?: string[]
  categorySignals?: string[]
  benchmarks?: string[]
}

const MODEL =
  process.env.MODEL_BRAND_KNOWLEDGE ||
  process.env.MODEL_DEFAULT ||
  'gpt-4o'

const SYSTEM_PROMPT = `You are a concise brand strategist. When asked about a brand in a specific market, you answer with structured JSON summarising brand truths, shopper tensions, retailer/ channel reality, competitors, category truths, and benchmarks. Competitor lines must include the competitor name plus a short positioning summary. Category truths should describe enduring category dynamics, not one-off stats.`

function buildPrompt(brand: string, marketCode: string) {
  const marketLabel = marketCode ? marketCode : 'the stated market'
  return [
    `Brand: ${brand}`,
    `Market: ${marketLabel}`,
    '',
    'Return JSON only with keys: brandTruths, shopperTensions, retailerReality, competitorMoves, categorySignals, benchmarks.',
    '- brandTruths: 3-6 honest, enduring truths about the brand.',
    '- shopperTensions: 3-6 tensions that influence purchase behaviour.',
    '- retailerReality: 3-6 observations about retailer/channel constraints in this market.',
    '- competitorMoves: list 3-6 lines in the format "Competitor — what they stand for or how they attack this category".',
    '- categorySignals: 3-6 bullet-style category truths/dynamics (penetration vs premium, seasonality, etc.).',
    '- benchmarks: optional proof points or reference metrics.',
    'Keep every line under 30 words; no markdown outside the JSON.',
    'Do not include markdown or prose outside the JSON.',
  ].join('\n')
}

function normalizeList(input: any): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') return item.trim()
        if (item && typeof item === 'object') {
          const text = (item.text || item.claim || '').toString().trim()
          return text
        }
        return ''
      })
      .filter(Boolean)
  }
  if (typeof input === 'string') return [input.trim()].filter(Boolean)
  return []
}

function buildSlug(brand: string, marketCode: string) {
  const brandKey = brand.trim().toLowerCase()
  const marketKey = (marketCode || 'GLOBAL').trim().toUpperCase()
  return `${brandKey}::${marketKey}`
}

export async function ensureBrandKnowledge(brand?: string | null, market?: string | null): Promise<BrandKnowledgeDossier | null> {
  if (!brand) return null
  const brandName = brand.trim()
  if (!brandName) return null
  const marketCode = normaliseMarketCode(market || '') || 'GLOBAL'
  const slug = buildSlug(brandName, marketCode)

  const existing = await prisma.brandKnowledge.findUnique({ where: { slug } })
  if (existing?.dossier) {
    return existing.dossier as BrandKnowledgeDossier
  }

  try {
    const prompt = buildPrompt(brandName, marketCode)
    const response = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: 0.2,
      json: true,
      max_output_tokens: 900,
      meta: { scope: 'brand.knowledge', brand: brandName, market: marketCode },
    })

    let parsed: any = null
    try {
      parsed = response ? JSON.parse(response) : null
    } catch (err) {
      console.warn('[brand-knowledge] failed to parse JSON response', err)
      parsed = null
    }

    if (!parsed || typeof parsed !== 'object') return null

    const dossier: BrandKnowledgeDossier = {
      brandTruths: normalizeList(parsed.brandTruths),
      shopperTensions: normalizeList(parsed.shopperTensions),
      retailerReality: normalizeList(parsed.retailerReality),
      competitorMoves: normalizeList(parsed.competitorMoves),
      categorySignals: normalizeList(parsed.categorySignals),
      benchmarks: normalizeList(parsed.benchmarks),
    }

    const hasContent = Object.values(dossier).some((arr) => Array.isArray(arr) && arr.length)
    if (!hasContent) {
      return null
    }

    await prisma.brandKnowledge.create({
      data: {
        slug,
        brand: brandName,
        market: marketCode,
        dossier,
        sourceModel: MODEL,
        prompt,
        rawResponse: parsed,
      },
    })
    return dossier
  } catch (err) {
    console.warn('[brand-knowledge] failed to fetch GPT knowledge', err)
    return null
  }
}
