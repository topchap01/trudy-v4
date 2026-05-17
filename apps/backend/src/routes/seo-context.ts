// apps/backend/src/routes/seo-context.ts
// GET /seo-context — returns the latest SEO baseline data from the weekly deep dive.

import { Router, type Request, type Response } from 'express'
import { getSeoContext } from '../lib/seo-context.js'

const router = Router()

router.get('/seo-context', (_req: Request, res: Response) => {
  const result = getSeoContext()
  res.json(result)
})

export default router
