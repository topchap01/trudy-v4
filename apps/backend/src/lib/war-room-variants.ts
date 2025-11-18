import type { Brief } from '@prisma/client'
import { prisma } from '../db/prisma.js'
import { randomUUID } from 'crypto'

const KEY = '__warRoomVariants'

export type WarRoomVariant = {
  id: string
  name: string
  notes?: string | null
  overrides: Record<string, any>
  createdAt: string
  updatedAt: string
}

type VariantInput = {
  id?: string
  name?: string
  notes?: string | null
  overrides?: any
}

const sanitizeOverrides = (value: any): Record<string, any> => {
  if (!value) return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return (parsed && typeof parsed === 'object') ? parsed : {}
    } catch {
      return {}
    }
  }
  if (typeof value === 'object') return { ...value }
  return {}
}

const normalizeVariant = (
  raw: VariantInput,
  existing?: WarRoomVariant | null,
  now = new Date().toISOString()
): WarRoomVariant | null => {
  const name = typeof raw?.name === 'string' ? raw.name.trim() : ''
  if (!name) return existing ?? null
  const id =
    (typeof raw?.id === 'string' && raw.id.trim()) ||
    existing?.id ||
    randomUUID()
  const overrides = sanitizeOverrides(raw?.overrides ?? existing?.overrides ?? {})
  return {
    id,
    name,
    notes: typeof raw?.notes === 'string'
      ? raw.notes.trim()
      : (existing?.notes ?? null),
    overrides,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  }
}

export function readVariantsFromBrief(brief?: Pick<Brief, 'assets'> | null): WarRoomVariant[] {
  if (!brief || !brief.assets || typeof brief.assets !== 'object') return []
  const raw = (brief.assets as Record<string, any>)[KEY]
  if (!Array.isArray(raw)) return []
  const now = new Date().toISOString()
  return raw
    .map((entry) => normalizeVariant(entry, null, now))
    .filter((v): v is WarRoomVariant => Boolean(v))
}

export function buildVariantAssets(
  currentAssets: Record<string, any> | null | undefined,
  variants: WarRoomVariant[],
  opts: { spark?: any } = {}
): Record<string, any> {
  const assets =
    currentAssets && typeof currentAssets === 'object'
      ? { ...currentAssets }
      : {}
  assets[KEY] = variants
  if (Object.prototype.hasOwnProperty.call(opts, 'spark')) {
    if (opts.spark == null) {
      delete (assets as any).__spark
    } else {
      (assets as any).__spark = opts.spark
    }
  }
  return assets
}

export async function saveVariants(
  campaignId: string,
  variants: VariantInput[],
  opts: { spark?: any } = {}
): Promise<WarRoomVariant[]> {
  const brief = await prisma.brief.findUnique({
    where: { campaignId },
    select: { assets: true },
  })
  if (!brief) {
    throw Object.assign(new Error('Brief not found'), { status: 404 })
  }
  const existing = readVariantsFromBrief(brief)
  const existingMap = new Map(existing.map((v) => [v.id, v]))
  const now = new Date().toISOString()
  const cleaned: WarRoomVariant[] = []
  for (const raw of Array.isArray(variants) ? variants : []) {
    const base = normalizeVariant(raw, existingMap.get(raw?.id || ''), now)
    if (base) cleaned.push(base)
  }
  const assets = buildVariantAssets(brief.assets as Record<string, any> | null, cleaned, opts)
  await prisma.brief.update({
    where: { campaignId },
    data: { assets },
  })
  return cleaned
}

export function findVariant(
  variants: WarRoomVariant[],
  variantId: string
): WarRoomVariant | null {
  return variants.find((v) => v.id === variantId) || null
}
