// apps/backend/src/routes/promo-builder.ts
import { Router } from 'express'
import { listBuilderCards } from '../lib/promo-builder.js'

const router = Router()

router.get('/promo-builder/cards', (_req, res) => {
  const cards = listBuilderCards()
  res.json({ cards })
})

router.post('/promo-builder/evaluate', (_req, res) => {
  // Placeholder endpoint; a future iteration will wire this into the evaluation engine.
  res.status(501).json({ error: 'Promo builder evaluation is not yet implemented.' })
})

export default router
