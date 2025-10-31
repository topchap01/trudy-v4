// apps/backend/src/routes/heuristics.ts
import { Router } from 'express'
import { prisma } from '../db/prisma.js'
import { analyzeRoute, parseRoutesFromMarkdown } from '../lib/heuristics.js'

const router = Router()

// Score all IdeaRoutes for a campaign and persist a HeuristicScore per route
router.post('/campaigns/:id/heuristics/score-idea-routes', async (req, res, next) => {
  try {
    const { id } = req.params
    const routes = await prisma.ideaRoute.findMany({ where: { campaignId: id } })
    const results = []
    for (const r of routes) {
      const blob = [r.hook, r.mechanic, r.archetype]
        .filter(Boolean)
        .join('\n')
        .trim() || JSON.stringify(r.payload || {})
      const scorecard = analyzeRoute(blob)

      const row = await prisma.heuristicScore.create({
        data: {
          campaignId: id,
          ideaRouteId: r.id,
          score: scorecard.total,
          breakdown: scorecard as any,
          rationale: scorecard.tips.join(' '),
        },
      })
      results.push({ routeId: r.id, title: r.hook?.slice(0,80) || r.archetype, scorecard, row })
      // Optionally: store into IdeaRoute.payload.scores for quick UI access
      await prisma.ideaRoute.update({
        where: { id: r.id },
        data: { payload: { ...(r.payload as any || {}), scores: scorecard } as any },
      })
    }
    res.json({ ok: true, results })
  } catch (e) {
    next(e)
  }
})

// Score ad-hoc markdown (does NOT persist unless you tell it to)
router.post('/campaigns/:id/heuristics/score-markdown', async (req, res, next) => {
  try {
    const { text } = req.body || {}
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing text' })
    const parsed = parseRoutesFromMarkdown(text)
    const scored = parsed.map(({ title, content }) => ({ title, scorecard: analyzeRoute(content) }))
    res.json({ ok: true, routes: scored })
  } catch (e) {
    next(e)
  }
})

export default router
