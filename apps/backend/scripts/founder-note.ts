#!/usr/bin/env tsx
import { prisma } from '../src/db/prisma.js'
import { normaliseMarketCode } from '../src/lib/campaign-rules.js'

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token.startsWith('--')) {
      const key = token.slice(2)
      const value = argv[i + 1]
      if (value && !value.startsWith('--')) {
        out[key] = value
        i += 1
      } else {
        out[key] = 'true'
      }
    }
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const scope = args.scope || 'segment'
  const headline = args.headline
  const guidance = args.guidance
  const author = args.author || 'Mark Alexander'
  const weight = args.weight ? Number(args.weight) : 1

  if (!headline || !guidance) {
    console.error('Usage: pnpm -C apps/backend exec tsx scripts/founder-note.ts --headline "..." --guidance "..." [--campaign CAMPAIGN_ID | --market AU --category FROZEN_DESSERTS --promo INSTANT_WIN] [--author "Mark Alexander"] [--weight 1] [--tags key=value,key2=value2]')
    process.exit(1)
  }

  let scopeType: 'CAMPAIGN' | 'SEGMENT'
  let scopeId: string

  if (scope === 'campaign' || args.campaign) {
    const campaignId = args.campaign
    if (!campaignId) {
      console.error('Error: --campaign must be provided when scope is campaign')
      process.exit(1)
    }
    scopeType = 'CAMPAIGN'
    scopeId = campaignId
  } else {
    const market = normaliseMarketCode(args.market || '')
    const category = String(args.category || '').trim().toUpperCase()
    const promo = String(args.promo || '').trim().toUpperCase()
    if (!market || !category || !promo) {
      console.error('Error: --market, --category, and --promo are required for segment scope')
      process.exit(1)
    }
    scopeType = 'SEGMENT'
    scopeId = `${market}:${category}:${promo}`
  }

  const tags: Record<string, string> | undefined = args.tags
    ? Object.fromEntries(
        args.tags
          .split(',')
          .map((pair: string) => pair.trim())
          .filter(Boolean)
          .map((pair: string) => {
            const [k, v] = pair.split('=').map((s) => s.trim())
            return [k, v || 'true']
          })
      )
    : undefined

  const record = await prisma.founderNote.create({
    data: {
      scopeType,
      scopeId,
      author,
      headline,
      guidance,
      weight,
      tags,
    },
  })

  console.log('Founder note stored:', record)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
