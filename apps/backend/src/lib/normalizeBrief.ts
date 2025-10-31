// apps/backend/src/lib/normalizeBrief.ts
type AnyObj = Record<string, any>

function coerceString(v: any): string | undefined {
  if (v == null) return undefined
  if (typeof v === 'string') return v.trim() || undefined
  try {
    const s = String(v).trim()
    return s.length ? s : undefined
  } catch {
    return undefined
  }
}

function firstString(val: any): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'string') return val.trim() || undefined
  if (Array.isArray(val)) {
    for (const item of val) {
      if (typeof item === 'string' && item.trim()) return item.trim()
    }
  }
  return undefined
}

/**
 * Normalizes brief.parsedJson:
 * - lowercases keys
 * - maps synonyms → canonical keys
 * - collapses arrays for category/mechanics to a single canonical string (keeps arrays as-is)
 * - trims string values
 */
export function normalizeBrief(input: AnyObj | null | undefined): AnyObj {
  const src: AnyObj = input && typeof input === 'object' ? input : {}

  // 1) lowercase all keys (shallow)
  const lower: AnyObj = {}
  for (const [k, v] of Object.entries(src)) lower[k.toLowerCase()] = v

  // 2) read with synonyms (don’t mutate yet)
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      if (k in lower && lower[k] != null) return lower[k]
    }
    return undefined
  }

  const brandRaw    = pick('brand', 'brandname')
  const categoryRaw = pick('category', 'categories', 'cat', 'vertical', 'segment', 'categoryname')
  const mechanicRaw = pick('mechanic', 'mechanics', 'entrymechanic', 'entry_mechanic')

  // 3) compute canonical string values (prefer first non-empty string when arrays provided)
  const brand    = firstString(brandRaw)    ?? coerceString(brandRaw)
  const category = firstString(categoryRaw) ?? coerceString(categoryRaw)
  const mechanic = firstString(mechanicRaw) ?? coerceString(mechanicRaw)

  if (brand !== undefined)    lower['brand'] = brand
  if (category !== undefined) lower['category'] = category
  if (mechanic !== undefined) lower['mechanic'] = mechanic

  // 4) trim obvious strings for all other keys (keep numbers/booleans as-is)
  for (const k of Object.keys(lower)) {
    const v = lower[k]
    if (typeof v === 'string') lower[k] = v.trim()
  }

  return lower
}
