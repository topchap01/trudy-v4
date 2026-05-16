import { Router, type Request, type Response } from 'express'
import { getCampaignOutcomes } from '../lib/campaign-outcomes.js'

const router = Router()

router.get('/campaign-outcomes', (req: Request, res: Response) => {
  const statusRaw = typeof req.query.status === 'string' ? req.query.status : 'all'
  const status: 'active' | 'completed' | 'all' =
    statusRaw === 'active' || statusRaw === 'completed' ? statusRaw : 'all'
  const result = getCampaignOutcomes({
    mechanic: typeof req.query.mechanic === 'string' ? req.query.mechanic : undefined,
    statusFilter: status,
    includeTest: req.query.includeTest === '1',
  })
  res.json(result)
})

export default router
