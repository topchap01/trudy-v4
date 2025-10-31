import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runStrategist } from '../lib/orchestrator/strategist.js'
import { applyResearchOverrides, readResearchOverridesFromBrief } from '../lib/war-room-research.js'

function parseMaybeJson(value: any): any {
  if (!value) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return typeof value === 'object' ? value : null
}

function extractPrimaryContent(row: any): string | null {
  if (!row) return null
  const direct = row.content
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const params = parseMaybeJson(row.params) || row.params || null
  if (params && typeof params === 'object') {
    const candidates = [
      params?.result?.content,
      params?.content,
      params?.narrative,
      params?.output?.content,
      params?.data?.content,
      params?.value?.content,
      params?.text,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  }
  return null
}

function extractMeta(row: any): any {
  if (!row) return null
  const params = parseMaybeJson(row.params) || row.params || null
  if (params && typeof params === 'object') {
    if (params.meta) return params.meta
    if (params.result?.meta) return params.result.meta
  }
  const meta = parseMaybeJson(row.meta)
  return meta || null
}

const router = Router()

router.post('/campaigns/:id/strategist/run', async (req, res, next) => {
  try {
    const { id } = req.params
    const { customPrompts, deepDive } = req.body || {}
    const camp = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true, outputs: true },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const ctx = buildCampaignContext(camp)
    const researchOverrides = readResearchOverridesFromBrief(camp.brief)

    const latestOf = (types: string[]) =>
      camp.outputs
        .filter((o) => types.includes(o.type))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .at(-1) || null

    const framingOut = latestOf(['framingNarrative', 'framing'])
    const evaluationOut = latestOf(['evaluationNarrative', 'evaluation'])
    if (!evaluationOut) {
      return res.status(409).json({ error: 'EVALUATION_REQUIRED' })
    }
    const synthesisOut = latestOf(['synthesisNarrative', 'synthesis'])
    const opinionOut = latestOf(['opinionNarrative', 'opinion'])

    const framing = extractPrimaryContent(framingOut) || ''
    const evaluation = extractPrimaryContent(evaluationOut) || ''
    const synthesis = extractPrimaryContent(synthesisOut) || ''
    const opinion = extractPrimaryContent(opinionOut) || ''

    const evaluationMeta = extractMeta(evaluationOut) || {}
    const effectiveResearch = applyResearchOverrides(
      evaluationMeta?.ui?.research || evaluationMeta?.research || null,
      researchOverrides
    )
    if (effectiveResearch) {
      if (!evaluationMeta.ui) evaluationMeta.ui = {}
      evaluationMeta.ui.research = effectiveResearch
      evaluationMeta.research = effectiveResearch
    }
    const offerIQ = evaluationMeta?.ui?.offerIQ || evaluationMeta?.offerIQ || null

    const content = await runStrategist(ctx, {
      framing,
      evaluation,
      synthesis,
      opinion,
      evaluationMeta,
      offerIQ,
      customPrompts: Array.isArray(customPrompts) ? customPrompts.map((p: any) => String(p)).filter(Boolean) : undefined,
      deepDive: Boolean(deepDive),
    })

    const row = await prisma.output.create({
      data: {
        campaignId: id,
        type: 'strategistNarrative',
        prompt: 'strategist',
        content,
      },
    })

    res.json({ result: { id: row.id, content } })
  } catch (err) {
    next(err)
  }
})

export default router
