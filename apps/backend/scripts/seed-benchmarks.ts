#!/usr/bin/env tsx
import { prisma } from '../src/db/prisma.js'
import { normaliseMarketCode } from '../src/lib/campaign-rules.js'
import { readFileSync } from 'fs'
import { resolve as resolvePath } from 'path'

type BenchmarkRow = {
  marketCode: string
  categoryCode: string
  promoType: string
  breadthTypical?: number | null
  breadthStrong?: number | null
  heroCountTypical?: number | null
  heroCountStrong?: number | null
  cashbackTypicalPct?: number | null
  cashbackHighPct?: number | null
  cashbackMaxPct?: number | null
  cadenceHint?: string | null
  frictionHint?: string | null
  source?: string | null
  confidence?: number | null
  metadata?: Record<string, unknown> | null
}

const SEED: BenchmarkRow[] = [
  {
    marketCode: 'AU',
    categoryCode: 'FROZEN_DESSERTS',
    promoType: 'INSTANT_WIN',
    breadthTypical: 1200,
    breadthStrong: 1800,
    heroCountTypical: 3,
    heroCountStrong: 5,
    cadenceHint: 'Daily winners + in-feed reminder drive velocity. Publish winner tallies weekly.',
    frictionHint: 'Receipt upload acceptable if instant confirmation + no staff tasks.',
    source: 'Promotrack AU Frozen Desserts 2025',
    confidence: 0.8,
  },
  {
    marketCode: 'AU',
    categoryCode: 'APPLIANCES',
    promoType: 'CASHBACK',
    cashbackTypicalPct: 0.12,
    cashbackHighPct: 0.18,
    cashbackMaxPct: 0.25,
    cadenceHint: 'Instant credit or <48h refund beats mail-in. Highlight energy savings alongside cashback.',
    frictionHint: 'Proof upload is fine; avoid forms over 4 fields.',
    source: 'Promotrack AU Appliances 2025',
    confidence: 0.75,
  },
  {
    marketCode: 'NZ',
    categoryCode: 'DAIRY',
    promoType: 'INSTANT_WIN',
    breadthTypical: 800,
    breadthStrong: 1200,
    heroCountTypical: 2,
    heroCountStrong: 4,
    cadenceHint: 'Communicate “winners across NZ each day” via retail media + owned social.',
    frictionHint: 'SMS entry acceptable; keep receipt upload optional where supermarket partners allow.',
    source: 'Promotrack NZ Dairy 2024',
    confidence: 0.7,
  },
  {
    marketCode: 'UK',
    categoryCode: 'BEVERAGE_ALCOHOL',
    promoType: 'DRAW',
    heroCountTypical: 3,
    heroCountStrong: 10,
    breadthTypical: 500,
    breadthStrong: 900,
    cadenceHint: 'Leverage pub/retail merchandising weeks & national press for hero prize publicity.',
    frictionHint: 'Age-gate and purchase proof mandatory; staff execution must remain zero-lift.',
    source: 'Promotrack UK Spirits 2024',
    confidence: 0.65,
  },
  {
    marketCode: 'US',
    categoryCode: 'QSR',
    promoType: 'APP_REWARDS',
    breadthTypical: 5000,
    breadthStrong: 12000,
    cadenceHint: 'Hourly drops maintain app MAU; push notifications with localized copy.',
    frictionHint: 'Login + tap-to-claim only; any upload kills conversion.',
    source: 'Promotrack US QSR 2025',
    confidence: 0.6,
  },
]

function loadExternalJson(): BenchmarkRow[] {
  try {
    const path = resolvePath(process.cwd(), 'apps/backend/scripts/benchmarks.json')
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as BenchmarkRow[] : []
  } catch {
    return []
  }
}

async function seedRow(row: BenchmarkRow) {
  const marketCode = normaliseMarketCode(row.marketCode)
  const categoryCode = row.categoryCode.toUpperCase()
  const promoType = row.promoType.toUpperCase()
  await prisma.marketCategoryBenchmark.upsert({
    where: { id: `${marketCode}-${categoryCode}-${promoType}` },
    update: {
      breadthTypical: row.breadthTypical ?? null,
      breadthStrong: row.breadthStrong ?? null,
      heroCountTypical: row.heroCountTypical ?? null,
      heroCountStrong: row.heroCountStrong ?? null,
      cashbackTypicalPct: row.cashbackTypicalPct ?? null,
      cashbackHighPct: row.cashbackHighPct ?? null,
      cashbackMaxPct: row.cashbackMaxPct ?? null,
      cadenceHint: row.cadenceHint ?? null,
      frictionHint: row.frictionHint ?? null,
      source: row.source ?? null,
      confidence: row.confidence ?? 0.6,
      metadata: row.metadata ?? null,
    },
    create: {
      id: `${marketCode}-${categoryCode}-${promoType}`,
      marketCode,
      categoryCode,
      promoType,
      breadthTypical: row.breadthTypical ?? null,
      breadthStrong: row.breadthStrong ?? null,
      heroCountTypical: row.heroCountTypical ?? null,
      heroCountStrong: row.heroCountStrong ?? null,
      cashbackTypicalPct: row.cashbackTypicalPct ?? null,
      cashbackHighPct: row.cashbackHighPct ?? null,
      cashbackMaxPct: row.cashbackMaxPct ?? null,
      cadenceHint: row.cadenceHint ?? null,
      frictionHint: row.frictionHint ?? null,
      source: row.source ?? null,
      confidence: row.confidence ?? 0.6,
      metadata: row.metadata ?? null,
    },
  })
}

async function main() {
  const external = loadExternalJson()
  const rows = [...SEED, ...external]
  console.log(`Seeding ${rows.length} benchmark rows...`)
  for (const row of rows) {
    await seedRow(row)
  }
  console.log('Benchmark seeding complete.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
