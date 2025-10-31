// apps/backend/src/routes/judge.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runJudge } from '../lib/orchestrator/judge.js'
import { extractFramingMeta } from '../lib/orchestrator/framing.js'
import { applyResearchOverrides, readResearchOverridesFromBrief } from '../lib/war-room-research.js'

const router = Router()

router.post('/campaigns/:id/judge/run', async (req, res, next) => {
  try {
    const id = String(req.params.id)

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true, outputs: { orderBy: { createdAt: 'desc' } } },
    })
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const ctx = buildCampaignContext(campaign)

    const outputs = campaign.outputs || []
    const pick = (aliases: string[]) => outputs.find((o) => aliases.includes(o.type))

    const framingOut = pick(['framingNarrative', 'framing'])
    const evaluationOut = pick(['evaluationNarrative', 'evaluation'])
    const opinionOut = pick(['opinionNarrative', 'opinion'])
    const exportOut = pick(['exportNarrative','export'])

    const researchOverrides = readResearchOverridesFromBrief(campaign.brief)
    const framingMetaRaw = framingOut ? extractFramingMeta(framingOut) : null
    const framingMeta = framingMetaRaw
      ? { ...framingMetaRaw, research: applyResearchOverrides(framingMetaRaw.research ?? null, researchOverrides) || framingMetaRaw.research || null }
      : null
    const baselineResearch = framingMeta?.research ?? null

    const judgeInputs: Record<string, any> = {}
    if (framingOut?.content) judgeInputs.framing = framingOut.content
    if (evaluationOut?.content) judgeInputs.evaluation = evaluationOut.content
    if (opinionOut?.content) judgeInputs.opinion = opinionOut.content
    if (exportOut?.content) judgeInputs.exportSummary = exportOut.content


    const judgeVerdict = await runJudge(ctx, {
      useLLM: Boolean(req.body?.useLLM),
      baselineResearch: baselineResearch || undefined,
      ...(Object.keys(judgeInputs).length ? { inputs: judgeInputs } : {}),
    })

    // Persist the latest verdict so exports / war room can reference it
    const summary = [
      `pass=${judgeVerdict.pass ? 'yes' : 'no'}`,
      `score=${Math.round(judgeVerdict.score || 0)}`,
      `issues=${Array.isArray(judgeVerdict.issues) ? judgeVerdict.issues.length : 0}`,
    ].join(' | ')

    await prisma.output.create({
      data: {
        campaign: { connect: { id } },
        type: 'judgeVerdict',
        content: summary,
        params: {
          kind: 'judge.v1',
          result: judgeVerdict,
        } as any,
        prompt: '',
      },
      select: { id: true },
    })

    res.json({ result: judgeVerdict })
  } catch (err) {
    next(err)
  }
})

export default router
