// apps/backend/scripts/seed.js
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  // 1) Find-or-create client (no unique constraint needed)
  let client = await prisma.client.findFirst({ where: { name: 'Default Client' } })
  if (!client) {
    client = await prisma.client.create({ data: { name: 'Default Client', notes: '' } })
  }

  // 2) Create a campaign
  const campaign = await prisma.campaign.create({
    data: {
      clientId: client.id,
      title: 'Grant Burge — Easter Adventure',
      status: 'DRAFT',
      mode: 'EVALUATION',
      market: 'AU',
      category: 'Wine',
      score: 67,
    },
  })

  // 3) Create some routes (adjust fields to match your schema)
// apps/backend/scripts/seed.js  (only the createMany block shown)
await prisma.ideaRoute.createMany({
  data: [
    {
      campaignId: campaign.id,
      riskLevel: 'SAFE',
      archetype: 'Price-Value',
      mechanic: 'GWP',
      hook: 'Free picnic set with 2 bottles',
      prizeLadder: {
        tiers: [{ prize: 'Picnic set', qty: 2000, arv: 25 }]
      },
      channels: ['In-store', 'POS', 'Social'],
      feasibilityNotes: 'Seed: simple GWP; logistics straightforward.',
      complianceNotes: 'Seed: standard T&Cs; age gate applies.',
      hash: `seed-${campaign.id}-safe`
    },
    {
      campaignId: campaign.id,
      riskLevel: 'BALANCED',
      archetype: 'Bucket List',
      mechanic: 'Prize Ladder',
      hook: 'Win your Easter bucket-list trip',
      prizeLadder: {
        tiers: [
          { prize: 'Major trip', qty: 1, arv: 20000 },
          { prize: 'Runner-up kits', qty: 50, arv: 200 }
        ]
      },
      channels: ['Retailer.com', 'Social', 'Email'],
      feasibilityNotes: 'Seed: vendor booking required; lead time 6–8 weeks.',
      complianceNotes: 'Seed: permit states required; travel blackout dates.',
      hash: `seed-${campaign.id}-balanced`
    },
    {
      campaignId: campaign.id,
      riskLevel: 'BOLD',
      archetype: 'Adventure',
      mechanic: 'Instant Win',
      hook: '$100 instant wins in-store',
      prizeLadder: {
        tiers: [{ prize: '$100 instant credit', qty: 1000, odds: '1 in 50' }]
      },
      channels: ['In-store', 'OOH', 'Social'],
      feasibilityNotes: 'Seed: instant win engine + codes; POS rollout needed.',
      complianceNotes: 'Seed: ensure fair odds disclosure; retailer approval.',
      hash: `seed-${campaign.id}-bold`
    }
  ],
  skipDuplicates: true  // in case hash is unique
})


  console.log('Seeded:', { campaignId: campaign.id })
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => { console.error(e); return prisma.$disconnect().finally(() => process.exit(1)) })
