import { describe, it, expect } from 'vitest'
import type { WarRoomVariant } from '../war-room-variants.js'
import { buildVariantAssets } from '../war-room-variants.js'

const stubVariants: WarRoomVariant[] = [
  {
    id: 'v1',
    name: 'Variant 1',
    overrides: { hook: 'Hook A' },
    notes: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  },
]

describe('buildVariantAssets', () => {
  it('preserves existing spark payload when no spark option is provided', () => {
    const existing = { __spark: { analysis: { summary: 'Keep me' } } }
    const merged = buildVariantAssets(existing, stubVariants)
    expect(merged.__spark).toEqual(existing.__spark)
    expect(merged.__warRoomVariants).toHaveLength(1)
  })

  it('overwrites spark payload when a new spark option is supplied', () => {
    const existing = { __spark: { analysis: { summary: 'Old' } } }
    const nextSpark = { analysis: { summary: 'New' } }
    const merged = buildVariantAssets(existing, stubVariants, { spark: nextSpark })
    expect(merged.__spark).toEqual(nextSpark)
  })

  it('removes spark payload when spark option is explicitly null', () => {
    const existing = { __spark: { analysis: { summary: 'Old' } } }
    const merged = buildVariantAssets(existing, stubVariants, { spark: null })
    expect(merged.__spark).toBeUndefined()
  })
})
