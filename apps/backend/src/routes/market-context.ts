import { Router, type Request, type Response } from 'express'
import { getMarketContext } from '../lib/market-context.js'

const router = Router()

router.get('/market-context', (req: Request, res: Response) => {
  const result = getMarketContext({
    category: typeof req.query.category === 'string' ? req.query.category : undefined,
    mechanic: typeof req.query.mechanic === 'string' ? req.query.mechanic : undefined,
    status: typeof req.query.status === 'string' ? req.query.status : undefined,
  })
  res.json(result)
})

export default router
