#!/usr/bin/env tsx
import { prisma } from '../src/db/prisma.js'

async function main() {
  console.log('Seeding Knowledge Grid benchmarks and founder notes...')

  // Benchmarks
await prisma.marketCategoryBenchmark.upsert({
  where: { id: 'benchmark-au-frozen-instant' },
  update: {
    breadthTypical: 1200,
      breadthStrong: 1800,
      heroCountTypical: 3,
      heroCountStrong: 5,
      cadenceHint: 'Daily winners perform best when shouted on pack + socials.',
      frictionHint: 'Receipt upload acceptable if win feels instant; no staff enablement.',
      source: 'Promotrack AU 2024',
      confidence: 0.8,
    },
  create: {
    id: 'benchmark-au-frozen-instant',
    marketCode: 'AU',
    categoryCode: 'FROZEN_DESSERTS',
    promoType: 'INSTANT_WIN',
      breadthTypical: 1200,
      breadthStrong: 1800,
      heroCountTypical: 3,
      heroCountStrong: 5,
      cadenceHint: 'Daily winners perform best when shouted on pack + socials.',
      frictionHint: 'Receipt upload acceptable if win feels instant; no staff enablement.',
      source: 'Promotrack AU 2024',
      confidence: 0.8,
    },
  })

await prisma.marketCategoryBenchmark.upsert({
  where: { id: 'benchmark-au-appliances-cashback' },
  update: {
      cashbackTypicalPct: 0.12,
      cashbackHighPct: 0.18,
      cashbackMaxPct: 0.25,
      cadenceHint: 'Instant credit at POS or within 48h keeps perceived value high.',
      frictionHint: 'Avoid mail-in; digital proof acceptable with automated confirmation.',
      source: 'Promotrack AU Appliances 2025',
      confidence: 0.75,
    },
  create: {
    id: 'benchmark-au-appliances-cashback',
    marketCode: 'AU',
    categoryCode: 'APPLIANCES',
    promoType: 'CASHBACK',
      cashbackTypicalPct: 0.12,
      cashbackHighPct: 0.18,
      cashbackMaxPct: 0.25,
      cadenceHint: 'Instant credit at POS or within 48h keeps perceived value high.',
      frictionHint: 'Avoid mail-in; digital proof acceptable with automated confirmation.',
      source: 'Promotrack AU Appliances 2025',
      confidence: 0.75,
    },
  })

  // Founder notes
await prisma.founderNote.upsert({
  where: { id: 'founder-au-frozen-instant' },
  update: {
    guidance: '2010 instant wins is generous—never halve the pool unless extra budget covers the difference. Cadence must be consumer-facing, not staff-driven.',
    tags: { principles: ['breadth', 'cadence', 'staff-zero'] },
    updatedAt: new Date(),
  },
  create: {
    id: 'founder-au-frozen-instant',
    scopeType: 'SEGMENT',
    scopeId: 'AU:FROZEN_DESSERTS:INSTANT_WIN',
    author: 'Mark Alexander',
    headline: 'Instant win breadth doctrine',
    guidance: '2010 instant wins is generous—never halve the pool unless extra budget covers the difference. Cadence must be consumer-facing, not staff-driven.',
    weight: 1.0,
    tags: { principles: ['breadth', 'cadence', 'staff-zero'] },
  },
})

await prisma.founderNote.upsert({
  where: { id: 'founder-au-appliances-cashback' },
  update: {
    guidance: 'Cashback under 12% feels stingy in AU durables. Aim for 12–15% and position it as instant credit, not “cashback later”.',
    tags: { principles: ['cashback-floor', 'instant-credit'] },
    updatedAt: new Date(),
  },
  create: {
    id: 'founder-au-appliances-cashback',
    scopeType: 'SEGMENT',
    scopeId: 'AU:APPLIANCES:CASHBACK',
    author: 'Mark Alexander',
    headline: 'Cashback credibility threshold',
    guidance: 'Cashback under 12% feels stingy in AU durables. Aim for 12–15% and position it as instant credit, not “cashback later”.',
    weight: 1.0,
    tags: { principles: ['cashback-floor', 'instant-credit'] },
  },
})

// Playbook snippets
await prisma.playbookSnippet.upsert({
  where: { id: 'snippet-instant-cadence-packline' },
  update: {
    body: '“Winners every day—2,010 chances to feel wicked.”',
    metadata: { channel: 'pack_line' },
    updatedAt: new Date(),
  },
  create: {
    id: 'snippet-instant-cadence-packline',
    promoType: 'INSTANT_WIN',
    useCase: 'CADENCE_STATEMENT',
    tone: 'planner',
    body: '“Winners every day—2,010 chances to feel wicked.”',
    source: 'Founder copy bank',
    confidence: 0.9,
    metadata: { channel: 'pack_line' },
  },
})

await prisma.playbookSnippet.upsert({
  where: { id: 'snippet-cashback-headline' },
  update: {
    body: '“Take 15% off your new Beko—credited instantly at checkout.”',
    metadata: { channel: 'retail_deck' },
    updatedAt: new Date(),
  },
  create: {
    id: 'snippet-cashback-headline',
    promoType: 'CASHBACK',
    useCase: 'VALUE_HEADLINE',
    tone: 'retail_deck',
    body: '“Take 15% off your new Beko—credited instantly at checkout.”',
    source: 'Founder copy bank',
    confidence: 0.9,
    metadata: { channel: 'retail_deck' },
  },
})

await prisma.playbookSnippet.upsert({
  where: { id: 'snippet-instant-shared-reward-guard' },
  update: {
    body: 'Double passes beat 2,000 solo prizes: shoppers buy dessert to share, so protect the “movie night for two” promise even if the headline winner count halves.',
    metadata: { behaviour: 'shared_reward_guardrail' },
    updatedAt: new Date(),
  },
  create: {
    id: 'snippet-instant-shared-reward-guard',
    promoType: 'INSTANT_WIN',
    useCase: 'REWARD_GUARDRAIL',
    tone: 'behavioural',
    body: 'Double passes beat 2,000 solo prizes: shoppers buy dessert to share, so protect the “movie night for two” promise even if the headline winner count halves.',
    source: 'Shopper behaviour memo • Option B vs Option A test',
    confidence: 0.85,
    metadata: { behaviour: 'shared_reward_guardrail' },
  },
})

  console.log('Knowledge Grid seed complete.')
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
