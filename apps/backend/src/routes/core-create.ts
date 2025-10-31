// apps/backend/src/routes/core-create.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runCreate, type Intensity, type RuleFlex } from '../lib/orchestrator/create.js'
import { CampaignStatus } from '../lib/status.js'
import { extractFramingMeta, type FramingV2Meta } from '../lib/orchestrator/framing.js'

const router = Router()

type Mode = 'BUILD' | 'GREENFIELD' | 'DISRUPT' // keep compat with orchestrator

router.post('/campaigns/:id/create/run', async (req, res, next) => {
  try {
    const camp = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      // Keep outputs so we can read the latest Framing meta (newest → oldest)
      include: { brief: true, outputs: { orderBy: { createdAt: 'desc' } } },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const count = Math.min(Math.max(Number(req.body?.count ?? 7), 5), 10)
    const intensity = (req.body?.intensity || 'DISRUPTIVE') as Intensity
    const mode = (req.body?.mode || 'GREENFIELD') as Mode
    const ruleFlex = (req.body?.ruleFlex || 'KEEP') as RuleFlex
    const tipFraming = req.body?.tipFraming !== false // default true

    const ctx = buildCampaignContext(camp)

    const pr = await prisma.phaseRun.create({
      data: { campaignId: camp.id, phase: 'CREATE', status: 'RUNNING' },
    })

    const framingOut = (camp.outputs || []).find(o => ['framingNarrative','framing'].includes(o.type))
    const framingMetaFull: FramingV2Meta | null = framingOut ? extractFramingMeta(framingOut) : null
    const framingHints = framingMetaFull ? {
      tensions: Array.isArray(framingMetaFull.tensions) ? framingMetaFull.tensions.slice(0, 5) : [],
      categoryCodes: guessCategoryCodes(framingMetaFull),
    } : undefined

    console.log(
      `[create] ${camp.id} • intensity=${intensity} • mode=${mode} • ruleFlex=${ruleFlex} • tipFraming=${tipFraming}` +
      (framingHints ? ` • hints: tensions=${framingHints.tensions.length} codes=${framingHints.categoryCodes.length}` : '')
    )

    const content = await runCreate(ctx, {
      count, intensity, mode, ruleFlex, tipFraming, framingHints, framingMeta: framingMetaFull || undefined
    })

    await prisma.output.create({
      data: {
        campaignId: camp.id,
        phaseRunId: pr.id,
        type: 'ideaRoutes',
        prompt: `CREATE routes x${count} (${intensity}) • mode=${mode} • ruleFlex=${ruleFlex} • tipFraming=${tipFraming} — structured brief + SAFE framing hints (no hooks/prizes)`,
        content,
        params: { count, intensity, mode, ruleFlex, tipFraming } as any,
      },
    })

    res.json({ result: { phaseRunId: pr.id, content } })
  } catch (e) {
    next(e)
  }
})

router.post('/campaigns/:id/create/accept', async (req, res, next) => {
  try {
    const last = await prisma.phaseRun.findFirst({
      where: { campaignId: req.params.id, phase: 'CREATE' },
      orderBy: { createdAt: 'desc' },
    })
    if (!last) return res.status(400).json({ error: 'No CREATE run found' })

    await prisma.phaseRun.update({
      where: { id: last.id },
      data: { status: 'COMPLETE', endedAt: new Date() },
    })
    await prisma.campaign.update({
      where: { id: req.params.id },
      data: { status: CampaignStatus.READY_FOR_SYNTHESIS },
    })

    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

export default router

// ---------------- helpers (local) ----------------

function toStrArray(x: any): string[] {
  if (!x) return []
  if (Array.isArray(x)) return x.map(String).filter(Boolean)
  if (typeof x === 'string') return x.split(/[•,;|\n]+/).map(s => s.trim()).filter(Boolean)
  return []
}

function guessCategoryCodes(meta: any): string[] {
  const arr = toStrArray(meta?.category_codes)
  return arr.slice(0, 6)
}
