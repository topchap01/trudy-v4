import { prisma } from '../db/prisma.js'
import type { PlaybookSnippet } from '@prisma/client'
import { normaliseMarketCode } from './campaign-rules.js'

export type BenchmarkSlice = {
  breadthTypical?: number | null
  breadthStrong?: number | null
  cashbackTypicalPct?: number | null
  cashbackHighPct?: number | null
  cashbackMaxPct?: number | null
  heroCountTypical?: number | null
  heroCountStrong?: number | null
  cadenceHint?: string | null
  frictionHint?: string | null
  source?: string | null
  confidence?: number | null
  metadata?: Record<string, unknown> | null
}

export type BenchmarkQuery = {
  market?: string | null
  category?: string | null
  promoType?: string | null
}

export type PlaybookQuery = {
  promoType: string
  useCase: string
  tone?: string
}

export type LlmInsightInput = {
  campaignId?: string | null
  market?: string | null
  category?: string | null
  promoType?: string | null
  intent: string
  payload: any
  prompt: string
  model: string
  confidence?: number | null
}

const benchmarkCache = new Map<string, BenchmarkSlice | null>()
const snippetCache = new Map<string, PlaybookSnippet[]>()
const founderCache = new Map<string, string[]>()

function benchmarkKey(query: BenchmarkQuery) {
  const market = normaliseMarketCode(query.market || '')
  const category = String(query.category || 'GENERIC').toUpperCase()
  const promo = String(query.promoType || 'ANY').toUpperCase()
  return `${market}::${category}::${promo}`
}

export async function getBenchmarkSlice(query: BenchmarkQuery): Promise<BenchmarkSlice | null> {
  const key = benchmarkKey(query)
  if (benchmarkCache.has(key)) {
    return benchmarkCache.get(key) ?? null
  }

  const marketCode = normaliseMarketCode(query.market || '')
  const categoryCode = String(query.category || 'GENERIC').toUpperCase()
  const promoType = String(query.promoType || 'ANY').toUpperCase()

  const record = await prisma.marketCategoryBenchmark.findFirst({
    where: {
      marketCode,
      categoryCode,
      promoType,
    },
    orderBy: { updatedAt: 'desc' },
  })

  if (!record) {
    benchmarkCache.set(key, null)
    return null
  }

  const slice: BenchmarkSlice = {
    breadthTypical: record.breadthTypical,
    breadthStrong: record.breadthStrong,
    cashbackTypicalPct: record.cashbackTypicalPct,
    cashbackHighPct: record.cashbackHighPct,
    cashbackMaxPct: record.cashbackMaxPct,
    heroCountTypical: record.heroCountTypical,
    heroCountStrong: record.heroCountStrong,
    cadenceHint: record.cadenceHint,
    frictionHint: record.frictionHint,
    source: record.source,
    confidence: record.confidence,
    metadata: record.metadata as Record<string, unknown> | null,
  }

  benchmarkCache.set(key, slice)
  return slice
}

function snippetKey(query: PlaybookQuery) {
  return `${query.promoType.toUpperCase()}::${query.useCase.toUpperCase()}::${(query.tone || 'ANY').toUpperCase()}`
}

export async function getPlaybookSnippets(query: PlaybookQuery): Promise<PlaybookSnippet[]> {
  const key = snippetKey(query)
  if (snippetCache.has(key)) {
    return snippetCache.get(key) ?? []
  }

  const promoType = query.promoType.toUpperCase()
  const useCase = query.useCase.toUpperCase()
  const tone = query.tone?.toUpperCase()

  const snippets = await prisma.playbookSnippet.findMany({
    where: {
      promoType,
      useCase,
      ...(tone ? { tone } : {}),
    },
    orderBy: [
      { confidence: 'desc' },
      { updatedAt: 'desc' },
    ],
  })

  snippetCache.set(key, snippets)
  return snippets
}

export function clearKnowledgeCache() {
  benchmarkCache.clear()
  snippetCache.clear()
  founderCache.clear()
}

function founderKey(scopeType: string, scopeId: string) {
  return `${scopeType.toUpperCase()}::${scopeId.toUpperCase()}`
}

export async function getFounderNotes(scope: { campaignId?: string | null; market?: string | null; category?: string | null; promoType?: string | null }): Promise<string[]> {
  const notes: string[] = []
  if (scope.campaignId) {
    const key = founderKey('CAMPAIGN', scope.campaignId)
    if (founderCache.has(key)) {
      notes.push(...(founderCache.get(key) || []))
    } else {
      const rows = await prisma.founderNote.findMany({
        where: { scopeType: 'CAMPAIGN', scopeId: scope.campaignId },
        orderBy: [{ weight: 'desc' }, { updatedAt: 'desc' }],
      })
      const values = rows.map((row) => row.guidance)
      founderCache.set(key, values)
      notes.push(...values)
    }
  }

  const marketCode = normaliseMarketCode(scope.market || '')
  const categoryCode = String(scope.category || 'GENERIC').toUpperCase()
  const promoType = String(scope.promoType || 'ANY').toUpperCase()
  const segmentId = `${marketCode}:${categoryCode}:${promoType}`
  const segmentKey = founderKey('SEGMENT', segmentId)
  if (founderCache.has(segmentKey)) {
    notes.push(...(founderCache.get(segmentKey) || []))
  } else {
    const rows = await prisma.founderNote.findMany({
      where: { scopeType: 'SEGMENT', scopeId: segmentId },
      orderBy: [{ weight: 'desc' }, { updatedAt: 'desc' }],
    })
    const values = rows.map((row) => row.guidance)
    founderCache.set(segmentKey, values)
    notes.push(...values)
  }

  return notes
}

export async function logLlmInsight(input: LlmInsightInput) {
  const marketCode = normaliseMarketCode(input.market || '')
  const categoryCode = String(input.category || 'GENERIC').toUpperCase()
  const promoType = String(input.promoType || 'ANY').toUpperCase()
  try {
    await prisma.llmInsightLog.create({
      data: {
        campaignId: input.campaignId || null,
        marketCode,
        categoryCode,
        promoType,
        intent: input.intent,
        payload: input.payload,
        prompt: input.prompt,
        model: input.model,
        confidence: input.confidence ?? 0.5,
      },
    })
  } catch (err) {
    console.warn('[knowledge-grid] failed to log LLM insight', err)
  }
}
