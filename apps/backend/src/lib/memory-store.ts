import { prisma } from '../db/prisma.js'
import { normaliseMarketCode } from './campaign-rules.js'

type MemorySnapshot = {
  campaignId: string
  market?: string | null
  category?: string | null
  promoType?: string | null
  brief: any
  rules: any
  offerIQ?: any
  strategist?: any
  evaluation?: any
  synthesis?: any
  outcomes?: any
}

export async function writeCampaignMemory(snapshot: MemorySnapshot) {
  try {
    const marketCode = normaliseMarketCode(snapshot.market || '')
    const categoryCode = String(snapshot.category || 'GENERIC').toUpperCase()
    const promoType = String(snapshot.promoType || 'ANY').toUpperCase()

    await prisma.campaignMemory.create({
      data: {
        campaignId: snapshot.campaignId,
        marketCode,
        categoryCode,
        promoType,
        briefSnapshot: snapshot.brief,
        rulesSnapshot: snapshot.rules,
        offerIqVerdict: snapshot.offerIQ ?? null,
        strategistNotes: snapshot.strategist ?? null,
        evaluationMeta: snapshot.evaluation ?? null,
        synthesisMeta: snapshot.synthesis ?? null,
        outcomes: snapshot.outcomes ?? null,
      },
    })
  } catch (err) {
    console.warn('[memory-store] failed to write campaign memory', err)
  }
}
