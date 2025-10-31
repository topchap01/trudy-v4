import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runSynthesis } from '../lib/orchestrator/synthesis.js'
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
  const params = parseMaybeJson(row.params) || row.params
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
    if (params.result?.data?.meta) return params.result.data.meta
  }
  const meta = parseMaybeJson(row.meta)
  return meta || null
}

const router = Router()

router.post('/campaigns/:id/synthesis/run', async (req, res, next) => {
  try {
    const { id } = req.params
    const camp = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true, outputs: true },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })
    const ctx = buildCampaignContext(camp)
    const researchOverrides = readResearchOverridesFromBrief(camp.brief)

    const latestOutputOf = (types: string[]) =>
      camp.outputs
        .filter((o) => types.includes(o.type))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .at(-1) || null

    const framingOut = latestOutputOf(['framingNarrative', 'framing'])
    const evaluationOut = latestOutputOf(['evaluationNarrative', 'evaluation'])
    if (!evaluationOut) {
      return res.status(409).json({ error: 'EVALUATION_REQUIRED' })
    }
    const ideasOut = latestOutputOf(['ideaRoutes', 'ideas'])
    const opinionOut = latestOutputOf(['opinionNarrative', 'opinion'])
    const strategistOut = latestOutputOf(['strategistNarrative', 'strategist'])

    const framing = extractPrimaryContent(framingOut) || ''
    const evaluation = extractPrimaryContent(evaluationOut) || ''
    const ideas = extractPrimaryContent(ideasOut) || ''
    const opinion = extractPrimaryContent(opinionOut) || ''
    const strategist = extractPrimaryContent(strategistOut) || ''
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

    const content = await runSynthesis(ctx, {
      framing,
      evaluation,
      ideas: ideas || undefined,
      opinion,
      strategist: strategist || undefined,
      evaluationMeta,
      offerIQ,
    })

    const row = await prisma.output.create({
      data: {
        campaignId: id,
        type: 'synthesisNarrative',
        prompt: 'synthesis',
        content,
      },
    })

    res.json({ result: { id: row.id, content } })
  } catch (e) {
    next(e)
  }
})

router.post('/campaigns/:id/synthesis/accept', async (req, res, next) => {
  try {
    const { id } = req.params
    await prisma.campaign.update({ where: { id }, data: { status: 'ACTIVE' } })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

export default router
