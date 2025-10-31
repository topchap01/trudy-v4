// apps/backend/src/routes/opinion.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runOpinion } from '../lib/orchestrator/opinion.js'
import { extractFramingMeta } from '../lib/orchestrator/framing.js'

const router = Router()

router.post('/campaigns/:id/opinion/run', async (req, res, next) => {
  try {
    const id = String(req.params.id)

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true, outputs: { orderBy: { createdAt: 'desc' } } },
    })
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const ctx = buildCampaignContext(campaign)

    const framingOut = (campaign.outputs || []).find(o => ['framingNarrative','framing'].includes(o.type))
    const priorFraming = framingOut?.content || ''
    const priorFramingMeta = framingOut ? extractFramingMeta(framingOut) : null

    const run = await runOpinion(ctx, {
      stance: req.body?.stance || 'DECISIVE',
      priorFraming,
      priorFramingMeta,
    })
    const content = (typeof run === 'string') ? run : String(run?.content || '')
    const meta = (typeof run === 'string') ? null : (run?.meta ?? null)

    // Fallback so War Room never shows blank
    const safeContent = content?.trim()
      ? content.trim()
      : (meta
          ? [
              'Call',
              (meta.calls?.go || []).join('; ') || '—',
              '',
              'Why this wins',
              (meta.hook_alternatives || []).join(' · ') || '—',
              '',
              'Risks & mitigations',
              (meta.risks || []).join('; ') || '—',
              '',
              'Retailer POV',
              (meta.retailer_incentives || []).join('; ') || '—',
              '',
              'If not this, try',
              (meta.calls?.no_go || []).join('; ') || '—'
            ].join('\n')
          : '[no content]'
        )

    const saved = await prisma.output.create({
      data: {
        campaign: { connect: { id } },
        // War Room typically reads opinionNarrative; getLatest also checks both
        type: 'opinionNarrative',
        content: safeContent,
        // Store meta under params (JSON) — not a top-level column
        params: {
          kind: 'opinion.v1',
          codeVersion: 'v1-opinion-au',
          ...(meta ? { meta } : {}),
          result: { content, meta },
        } as any,
        prompt: '',
      },
      select: { id: true, type: true, content: true, params: true, createdAt: true },
    })

    res.json({ result: { id: saved.id, content: saved.content, meta } })
  } catch (e) {
    next(e)
  }
})

export default router
