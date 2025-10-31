// apps/backend/src/routes/exceptions.ts
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'

const router = Router()

// We store Dissent Cards as outputs with type='exception'.
// content: human-readable markdown summary
// params: full structured JSON so UI/export can render beautifully.

const CreateBody = z.object({
  ruleId: z.string().min(1),                           // e.g., "PromoTrack25-S6"
  tier: z.enum(['HARD','SOFT','FORMAT']).default('SOFT'),
  ruleFlex: z.enum(['STRICT','BEND','BREAK']).default('BEND'),
  hypothesis: z.string().min(3),
  risks: z.array(z.string().min(3)).default([]),
  mitigations: z.array(z.string().min(3)).default([]),
  measures: z.array(z.string().min(2)).default([]),    // “what we’ll measure”
  exitCriteria: z.string().min(3).default(''),
  note: z.string().optional(),
})

function renderMarkdownSummary(p: z.infer<typeof CreateBody>) {
  const bullets = (xs: string[]) => xs.map(x => `- ${x}`).join('\n')
  return [
    `**Designed Exception** — ${p.ruleId}`,
    ``,
    `- **Tier:** ${p.tier}`,
    `- **RuleFlex:** ${p.ruleFlex}`,
    ``,
    `**Hypothesis**`,
    `${p.hypothesis}`,
    ``,
    p.risks.length ? `**Risks**\n${bullets(p.risks)}` : '',
    p.mitigations.length ? `**Mitigations**\n${bullets(p.mitigations)}` : '',
    p.measures.length ? `**Measures**\n${bullets(p.measures)}` : '',
    p.exitCriteria ? `**Exit criteria**\n${p.exitCriteria}` : '',
    p.note ? `\n> ${p.note}` : '',
  ].filter(Boolean).join('\n')
}

// List all exceptions for a campaign
router.get('/campaigns/:id/exceptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.output.findMany({
      where: { campaignId: req.params.id, type: 'exception' },
      orderBy: { createdAt: 'asc' },
    })
    res.json({
      exceptions: rows.map(r => ({
        id: r.id,
        createdAt: r.createdAt,
        content: r.content,
        params: r.params,
      })),
    })
  } catch (e) { next(e) }
})

// Create a new exception (Dissent Card)
router.post('/campaigns/:id/exceptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = CreateBody.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const p = parsed.data

    const md = renderMarkdownSummary(p)
    const saved = await prisma.output.create({
      data: {
        campaignId: req.params.id,
        type: 'exception',
        prompt: `Dissent Card: ${p.ruleId}`,
        params: p as any,
        content: md,
      } as any,
    })
    res.json({ ok: true, exception: { id: saved.id, createdAt: saved.createdAt, content: saved.content, params: saved.params } })
  } catch (e) { next(e) }
})

// (Optional) delete an exception (kept minimal and safe)
router.delete('/campaigns/:id/exceptions/:exId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.output.findUnique({ where: { id: req.params.exId } })
    if (!item || item.campaignId !== req.params.id || item.type !== 'exception') {
      return res.status(404).json({ error: 'Not found' })
    }
    await prisma.output.delete({ where: { id: item.id } })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
