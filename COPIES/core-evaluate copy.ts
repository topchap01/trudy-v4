// apps/backend/src/routes/core-evaluate.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runEvaluate } from '../lib/orchestrator/evaluate.js'

const router = Router()

type RuleFlex = 'KEEP' | 'BEND' | 'BREAK'

router.post('/campaigns/:id/evaluate/run', async (req, res, next) => {
  try {
    const camp = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { brief: true },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const pr = await prisma.phaseRun.create({
      data: { campaignId: camp.id, phase: 'EVALUATE', status: 'RUNNING' },
    })

    const ctx = buildCampaignContext(camp)

    // Optional flexibility flag for PromoTrack-guided evaluation
    const ruleFlex = ((req.body?.ruleFlex as RuleFlex) || 'KEEP') as RuleFlex

    // May return string or { content, meta }
    const result = await runEvaluate(ctx, { ruleFlex })

    // normalise
    const content =
      typeof result === 'string' ? result : (result?.content ?? '')
    const meta =
      typeof result === 'object' && result && 'meta' in result ? (result as any).meta : null

    // Store meta (and ruleFlex) inside params since Output has no `meta` column
    await prisma.output.create({
      data: {
        campaignId: camp.id,
        phaseRunId: pr.id,
        type: 'evaluationNarrative',
        prompt: `EVALUATION (Ferrier+Suit) • ruleFlex=${ruleFlex}`,
        content,
        params: { ...(meta ? { meta } : {}), ruleFlex } as any,
      },
    })

    await prisma.phaseRun.update({
      where: { id: pr.id },
      data: { status: 'COMPLETE', endedAt: new Date() },
    })

    res.json({ result: { content, meta, ruleFlex } })
  } catch (e) {
    next(e)
  }
})

export default router
