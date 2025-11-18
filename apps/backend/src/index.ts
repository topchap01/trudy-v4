// apps/backend/src/index.ts
import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import compression from 'compression'
import { join } from 'path'

import briefsRouter from './routes/briefs.js'
import framingRouter from './routes/framing.js'
import evalRouter from './routes/core-evaluate.js'
import createRouter from './routes/core-create.js'
import exportsRouter from './routes/export-artifacts.js'
import askOutputsRouter from './routes/ask-outputs.js'
import synthesisRouter from './routes/core-synthesis.js'
import strategistRouter from './routes/core-strategist.js'
import heuristicsRouter from './routes/heuristics.js'
import campaignDebugRouter from './routes/campaign-debug.js'
import promoBuilderRouter from './routes/promo-builder.js'
import sparkRouter from './routes/spark.js'

import opinionRoutes from './routes/opinion.js'
import judgeRouter from './routes/judge.js'

import { authMiddleware } from './middleware/auth.js'

const app = express()

app.use(morgan('dev'))
app.use(
  cors({
    // if you actually set FRONTEND_ORIGIN in .env, mirror it here or set CORS_ORIGIN in .env
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173'],
    credentials: true,
  })
)
app.use(compression())
app.use(express.json({ limit: '1mb' }))

// Health (public)
app.get('/api/health', (_req: Request, res: Response) =>
  res.json({ ok: true, ts: new Date().toISOString() })
)

const storageRoot = join(process.cwd(), 'storage')

// ---- Single API router: mount EVERYTHING here ----
const api = express.Router()

api.use('/files', express.static(storageRoot))
api.use(briefsRouter)
api.use(framingRouter)
api.use(evalRouter)          // <-- contains /campaigns/:id/outputs/latest (canonical)
api.use(createRouter)
api.use(exportsRouter)
api.use(askOutputsRouter)
api.use(synthesisRouter)
api.use(strategistRouter)
api.use(heuristicsRouter)
api.use(campaignDebugRouter)
api.use(promoBuilderRouter)
api.use(sparkRouter)

// Move these INSIDE the same api router so order is deterministic
api.use(opinionRoutes)
api.use(judgeRouter)

// Protect all of /api in one place
app.use('/api', authMiddleware, api)

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ERROR]', err)
  const status =
    typeof err?.status === 'number'
      ? err.status
      : typeof err?.code === 'number'
      ? err.code
      : 500
  const message = err?.error?.message || err?.message || 'INTERNAL_SERVER_ERROR'
  res.status(status).json({ error: message })
})

const PORT = Number(process.env.PORT || 4000)
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}/api/health`)
  console.log(`Serving export files at http://localhost:${PORT}/api/files/…`)
})

export default app
