import type { Brief } from '@prisma/client'
import { prisma } from '../db/prisma.js'

export type WarRoomPrefs = {
  allowHeroOverlay?: boolean | null
  entryFrictionAccepted?: boolean | null
  notes?: string | null
}

const KEY = '__warRoomPrefs'

const normalizeBoolean = (value: any): boolean | null => {
  if (value === true || value === false) return value
  if (value == null) return null
  const s = String(value).toLowerCase()
  if (['true', '1', 'yes', 'y', 'on'].includes(s)) return true
  if (['false', '0', 'no', 'n', 'off'].includes(s)) return false
  return null
}

export function readWarRoomPrefsFromBrief(brief?: Brief | null): WarRoomPrefs {
  const raw = brief && brief.assets && typeof brief.assets === 'object'
    ? (brief.assets as Record<string, any>)[KEY]
    : null
  return normalizePrefs(raw)
}

export function normalizePrefs(raw: any): WarRoomPrefs {
  if (!raw || typeof raw !== 'object') {
    return { allowHeroOverlay: null, entryFrictionAccepted: null, notes: null }
  }
  return {
    allowHeroOverlay: normalizeBoolean(raw.allowHeroOverlay),
    entryFrictionAccepted: normalizeBoolean(raw.entryFrictionAccepted),
    notes: typeof raw.notes === 'string' ? raw.notes : null,
  }
}

export async function saveWarRoomPrefs(campaignId: string, updates: WarRoomPrefs): Promise<WarRoomPrefs> {
  const brief = await prisma.brief.findUnique({
    where: { campaignId },
    select: { assets: true },
  })
  if (!brief) {
    throw Object.assign(new Error('Brief not found'), { status: 404 })
  }

  const current = normalizePrefs((brief.assets as Record<string, any> | null)?.[KEY])
  const merged: WarRoomPrefs = {
    allowHeroOverlay: updates.allowHeroOverlay ?? current.allowHeroOverlay ?? null,
    entryFrictionAccepted: updates.entryFrictionAccepted ?? current.entryFrictionAccepted ?? null,
    notes: typeof updates.notes === 'string' ? updates.notes : current.notes ?? null,
  }

  const assets =
    brief.assets && typeof brief.assets === 'object'
      ? { ...(brief.assets as Record<string, any>) }
      : {}
  assets[KEY] = merged

  await prisma.brief.update({
    where: { campaignId },
    data: { assets },
  })

  return merged
}
