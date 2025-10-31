import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { loadCampaignRules } from '../campaign-rules.js'
import { prisma } from '../../db/prisma.js'
import type { CampaignContext, ActivationProfile, AudienceProfile } from '../context.js'

const baseActivationProfile: ActivationProfile = {
  activationChannels: [],
  channelNotes: null,
  retailerTags: [],
  retailerGroups: [],
  retailerBanners: [],
  retailerNotes: null,
  onPremise: false,
  grocery: false,
  convenience: false,
  liquorRetail: false,
  ecommerce: false,
  event: false,
  digital: false,
  rewardPosture: 'CHANCE',
  assuredValue: false,
  assuredItems: [],
  majorPrizeOverlay: false,
  zeroStaff: true,
  staffBurden: null,
}

const baseAudienceProfile: AudienceProfile = {
  summary: null,
  ageBand: null,
  lifeStage: null,
  mindset: null,
  behaviour: null,
  signals: [],
}

const baseContext = {
  clientName: 'Test Client',
  title: 'Test Campaign',
  brandPosition: 'LEADER',
  mode: 'EVALUATE',
  status: 'DRAFT',
  startDate: null,
  endDate: null,
  nowISO: new Date().toISOString(),
  orientation: 'LIVE',
  briefRaw: null,
  assets: [] as any[],
  timingWindow: null,
  warRoomPrefs: { allowHeroOverlay: false, entryFrictionAccepted: true },
  activationProfile: baseActivationProfile,
  audienceProfile: baseAudienceProfile,
} as const

beforeAll(async () => {
  await prisma.$connect()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('loadCampaignRules', () => {
  it('hydrates benchmarks and founder guidance for instant win', async () => {
    const ctx: CampaignContext = {
      id: 'ctx-instant',
      market: 'AU',
      category: 'FROZEN_DESSERTS',
      briefSpec: {
        brand: 'Wicked Sister',
        market: 'AU',
        category: 'FROZEN_DESSERTS',
        retailers: ['All stockists'],
        typeOfPromotion: 'INSTANT_WIN',
        heroPrize: 'Movie Ticket',
        heroPrizeCount: 1,
        assuredItems: ['Single movie pass'],
        breadthPrizeCount: 2010,
        mechanicOneLiner: 'Buy 2, upload receipt',
      },
      ...baseContext,
    }

    const rules = await loadCampaignRules(ctx)
    expect(rules.marketCode).toBe('AU')
    expect(rules.benchmarks?.breadthStrong).toBe(1800)
    expect(rules.founder.notes.some((note) => note.includes('2010 instant wins'))).toBe(true)
  })

  it('hydrates cashback benchmarks and founder notes', async () => {
    const ctx: CampaignContext = {
      id: 'ctx-cashback',
      market: 'AU',
      category: 'Appliances',
      briefSpec: {
        brand: 'Beko',
        market: 'AU',
        category: 'Appliances',
        retailers: ['Harvey Norman'],
        typeOfPromotion: 'CASHBACK',
        cashback: { amount: 0.15, currency: 'AUD' },
        mechanicOneLiner: 'Buy selected appliances and claim 15% back',
      },
      ...baseContext,
    }

    const rules = await loadCampaignRules(ctx)
    expect(rules.benchmarks?.cashbackTypicalPct).toBeCloseTo(0.12, 2)
    expect(rules.founder.notes.some((note) => note.includes('Cashback under 12%'))).toBe(true)
  })
})
