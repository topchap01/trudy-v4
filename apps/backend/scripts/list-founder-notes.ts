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

function segmentIdFromArgs(args: ArgMap) {
  const market = args.market ? normaliseMarketCode(args.market) : null
  const category = args.category ? args.category.toUpperCase() : null
  const promo = args.promo ? args.promo.toUpperCase() : null
  if (market && category && promo) {
    return `${market}:${category}:${promo}`
  }
  return null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const where: any = {}

  if (args.campaign) {
    where.scopeType = 'CAMPAIGN'
    where.scopeId = args.campaign
  } else {
    const segmentId = segmentIdFromArgs(args)
    if (segmentId) {
      where.scopeType = 'SEGMENT'
      where.scopeId = segmentId
    }
  }
  if (args.author) where.author = args.author

  const notes = await prisma.founderNote.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  })

  if (!notes.length) {
    console.log('No founder notes found. Use scripts/founder-note.ts to create one.')
    return
  }

  for (const note of notes) {
    console.log('─'.repeat(72))
    console.log(`id: ${note.id}`)
    console.log(`scope: ${note.scopeType} • ${note.scopeId}`)
    console.log(`author: ${note.author} • weight: ${note.weight ?? 1}`)
    console.log(`headline: ${note.headline}`)
    console.log(`guidance: ${note.guidance}`)
    if (note.tags) console.log(`tags: ${JSON.stringify(note.tags)}`)
    console.log(`updated: ${note.updatedAt.toISOString()}`)
  }

  console.log('─'.repeat(72))
  console.log(`Total notes: ${notes.length}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
