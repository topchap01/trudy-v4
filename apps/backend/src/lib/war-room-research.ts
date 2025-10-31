import type { Brief } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import type { ResearchDossier, ResearchInsightEntry, ResearchPack } from './research.js'

export type ResearchOverrides = {
  brandTruths?: ResearchInsightEntry[] | null
  shopperTensions?: ResearchInsightEntry[] | null
  retailerReality?: ResearchInsightEntry[] | null
  competitorMoves?: ResearchInsightEntry[] | null
  categorySignals?: ResearchInsightEntry[] | null
  benchmarks?: ResearchInsightEntry[] | null
  updatedAt?: string | null
  updatedBy?: string | null
}

type DossierKey = keyof Pick<
  ResearchDossier,
  'brandTruths' | 'shopperTensions' | 'retailerReality' | 'competitorMoves' | 'categorySignals' | 'benchmarks'
>

const SECTION_KEYS: DossierKey[] = [
  'brandTruths',
  'shopperTensions',
  'retailerReality',
  'competitorMoves',
  'categorySignals',
  'benchmarks',
]

const KEY = '__warRoomResearchOverrides'

const trim = (value: any): string => (typeof value === 'string' ? value.trim() : '')

const sanitizeEntry = (value: any): ResearchInsightEntry | null => {
  if (!value) return null
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? { text } : null
  }
  if (typeof value === 'object') {
    const text = trim(value.text ?? value.claim ?? '')
    const source = trim(value.source ?? value.sourceHint ?? '')
    if (!text) return null
    return source ? { text, source } : { text }
  }
  return null
}

const sanitizeEntries = (value: any, cap = 5): ResearchInsightEntry[] | null => {
  if (!Array.isArray(value)) return null
  const entries: ResearchInsightEntry[] = []
  for (const raw of value) {
    const entry = sanitizeEntry(raw)
    if (!entry) continue
    entries.push(entry)
    if (entries.length >= cap) break
  }
  return entries.length ? entries : null
}

const blankDossier = (): ResearchDossier => ({
  brandTruths: [],
  shopperTensions: [],
  retailerReality: [],
  competitorMoves: [],
  categorySignals: [],
  benchmarks: [],
})

const overridesToDossier = (overrides?: ResearchOverrides | null): ResearchDossier | null => {
  if (!overrides) return null
  const dossier = blankDossier()
  let hasData = false
  for (const key of SECTION_KEYS) {
    const entries = sanitizeEntries((overrides as any)[key]) || null
    if (entries?.length) {
      ;(dossier as any)[key] = entries
      hasData = true
    }
  }
  return hasData ? dossier : null
}


const buildStubPackFromOverrides = (dossier: ResearchDossier): ResearchPack => ({
  brand: { query: null, facts: [] },
  audience: { facts: [] },
  category: { query: null, facts: [] },
  competitors: { names: [], facts: [], promos: [] },
  retailers: { names: [], facts: [] },
  season: { label: null, facts: [] },
  market: { facts: [] },
  signals: { facts: [] },
  meta: {
    level: 'MAX',
    warnings: ['manual dossier overrides applied'],
    cachedAt: new Date().toISOString(),
    searchProvider: 'manual',
  },
  insights: {},
  dossier,
})

export function normalizeOverrides(raw: any): ResearchOverrides | null {
  if (!raw || typeof raw !== 'object') return null
  const cleaned: ResearchOverrides = {}
  for (const key of SECTION_KEYS) {
    const entries = sanitizeEntries(raw[key])
    if (entries?.length) cleaned[key] = entries
  }
  if (typeof raw.updatedAt === 'string') cleaned.updatedAt = raw.updatedAt
  if (typeof raw.updatedBy === 'string') cleaned.updatedBy = raw.updatedBy
  return Object.keys(cleaned).length ? cleaned : null
}

export function readResearchOverridesFromBrief(brief?: Brief | null): ResearchOverrides | null {
  if (!brief || !brief.assets || typeof brief.assets !== 'object') return null
  const raw = (brief.assets as Record<string, any>)[KEY]
  return normalizeOverrides(raw)
}

export async function saveResearchOverrides(
  campaignId: string,
  updates: Partial<Record<DossierKey, ResearchInsightEntry[] | string[]>> & { editor?: string | null }
): Promise<ResearchOverrides> {
  const brief = await prisma.brief.findUnique({ where: { campaignId }, select: { assets: true } })
  if (!brief) {
    throw Object.assign(new Error('Brief not found'), { status: 404 })
  }
  const current = normalizeOverrides((brief.assets as Record<string, any> | null)?.[KEY]) || {}
  const next: ResearchOverrides = { ...current }
  for (const key of SECTION_KEYS) {
    if (key in updates) {
      const entries = sanitizeEntries((updates as any)[key])
      next[key] = entries || null
    }
  }
  const now = new Date().toISOString()
  next.updatedAt = now
  const editor = trim(updates.editor)
  if (editor) next.updatedBy = editor

  const assets =
    brief.assets && typeof brief.assets === 'object'
      ? { ...(brief.assets as Record<string, any>) }
      : {}
  assets[KEY] = next
  await prisma.brief.update({ where: { campaignId }, data: { assets } })
  return next
}

export function applyResearchOverrides(
  pack: ResearchPack | null,
  overrides?: ResearchOverrides | null
): ResearchPack | null {
  const dossierOverrides = overridesToDossier(overrides)
  if (!dossierOverrides) return pack

  if (!pack) return buildStubPackFromOverrides(dossierOverrides)

  const merged = { ...(pack.dossier || blankDossier()) }
  for (const key of SECTION_KEYS) {
    const overrideEntries = (dossierOverrides as any)[key]
    if (overrideEntries?.length) {
      (merged as any)[key] = overrideEntries
    }
  }
  return { ...pack, dossier: merged }
}
