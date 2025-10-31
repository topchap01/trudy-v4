import { prisma } from '../db/prisma.js'
import { collectExportSnapshot } from '../export/snapshot.js'
import { loadCampaignRules } from './campaign-rules.js'

export type CampaignBundle = {
  snapshot: Awaited<ReturnType<typeof collectExportSnapshot>>
  rules: Awaited<ReturnType<typeof loadCampaignRules>>
  outputs: Array<{
    id: string
    type: string
    content: string
    prompt: string | null
    params: any
    createdAt: string
  }>
  briefAssets: Record<string, any> | null
}

export async function buildCampaignBundle(campaignId: string): Promise<CampaignBundle> {
  const snapshot = await collectExportSnapshot(campaignId, {})
  const rules = await loadCampaignRules(snapshot.context)

  const outputsRaw = await prisma.output.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      type: true,
      content: true,
      prompt: true,
      params: true,
      createdAt: true,
    },
  })

  const briefAssets = await prisma.brief.findUnique({
    where: { campaignId },
    select: { assets: true },
  })

  const outputs = outputsRaw.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))

  return {
    snapshot,
    rules,
    outputs,
    briefAssets: (briefAssets?.assets as Record<string, any> | null) ?? null,
  }
}
