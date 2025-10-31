#!/usr/bin/env tsx
import { prisma } from '../src/db/prisma.js'
import { normaliseMarketCode } from '../src/lib/campaign-rules.js'

type ArgMap = Record<string, string>

function parseArgs(argv: string[]): ArgMap {
  const out: ArgMap = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      out[key] = next
      i += 1
    } else {
      out[key] = 'true'
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const take = args.limit ? Number(args.limit) : 20
  const where: any = {}

  if (args.intent) where.intent = args.intent.toUpperCase()
  if (args.campaign) where.campaignId = args.campaign
  if (args.market) where.marketCode = normaliseMarketCode(args.market)
  if (args.category) where.categoryCode = args.category.toUpperCase()
  if (args.promo) where.promoType = args.promo.toUpperCase()

  const rows = await prisma.llmInsightLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  })

  if (!rows.length) {
    console.log('No LLM insights found for given filters.')
    return
  }

  for (const row of rows) {
    console.log('─'.repeat(80))
    console.log(`id: ${row.id}`)
    console.log(`created: ${row.createdAt.toISOString()}`)
    console.log(`campaign: ${row.campaignId ?? 'n/a'}`)
    console.log(`market: ${row.marketCode} • category: ${row.categoryCode} • promo: ${row.promoType}`)
    console.log(`intent: ${row.intent} • confidence: ${row.confidence ?? 'n/a'}`)
    console.log(`model: ${row.model}`)
    console.log('prompt:')
    console.log(row.prompt)
    console.log('payload:')
    console.log(JSON.stringify(row.payload, null, 2))
  }

  console.log('─'.repeat(80))
  console.log(`Total rows listed: ${rows.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
