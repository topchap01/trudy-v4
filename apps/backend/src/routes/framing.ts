// apps/backend/src/routes/framing.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runFraming as runFramingLLM } from '../lib/orchestrator/framing.js'

const router = Router()

// Run Framing v2 (Ava + Clara)
router.post('/campaigns/:id/framing/run', async (req, res, next) => {
  try {
    const { id } = req.params

    const camp = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true, outputs: true },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const ctx = buildCampaignContext(camp)

    // Optional addendum/notes from UI – robustly coerce to string
    const addendumRaw =
      typeof req.body?.addendum === 'string'
        ? req.body.addendum
        : Array.isArray(req.body?.addendum)
        ? req.body.addendum.join(' ').slice(0, 4000)
        : ''
    const addendum = addendumRaw.trim()

    // New orchestrator returns { content, meta }
    const { content, meta } = await runFramingLLM(ctx)

    // Persist latest framing narrative with meta tucked into params.meta
    const row = await prisma.output.create({
      data: {
        campaignId: id,
        type: 'framingNarrative',
        prompt: addendum ? 'framing + addendum' : 'framing',
        params: {
          meta: meta || null,
          codeVersion: 'framing.v2',
          kind: 'framing.v2',
          ...(addendum ? { addendum } : {}),
        } as any,
        content,
      },
      select: { id: true, createdAt: true },
    })

    // Return both flat and legacy envelopes for compatibility
    res.json({
      id: row.id,
      content,
      meta,
      result: { id: row.id, content, meta },
    })
  } catch (e) {
    next(e)
  }
})

// Accept Framing (simple marker)
router.post('/campaigns/:id/framing/accept', async (req, res, next) => {
  try {
    const { id } = req.params
    await prisma.campaign.update({ where: { id }, data: { status: 'ACTIVE' } })
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

export default router
