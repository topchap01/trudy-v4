// apps/backend/src/index.ts
import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import morgan from 'morgan'
import compression from 'compression'
import { join } from 'path'

import campaignsRouter from './routes/campaigns.js'
import briefsRouter from './routes/briefs.js'
import framingRouter from './routes/framing.js'
import evalRouter from './routes/core-evaluate.js'
import createRouter from './routes/core-create.js'
import exportsRouter from './routes/exports.js'
import askOutputsRouter from './routes/ask-outputs.js'
import synthesisRouter from './routes/core-synthesis.js'
import heuristicsRouter from './routes/heuristics.js'
import outputsLatestRouter from './routes/outputs-latest.js'

import { authMiddleware } from './middleware/auth.js'


const app = express()

app.use(morgan('dev'))
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173'],
    credentials: true,
  })
)
app.use(compression())
app.use(express.json({ limit: '1mb' }))

// Health (kept public)
app.get('/api/health', (_req: Request, res: Response) =>
  res.json({ ok: true, ts: new Date().toISOString() })
)

// Static files for export artifacts
const storageRoot = join(process.cwd(), 'storage')
app.use('/files', express.static(storageRoot))     // direct (useful when same-origin)
app.use('/api/files', express.static(storageRoot)) // dev-friendly (proxied via /api)

// API (mount ALL routes on the router first, then attach under /api with auth)
const api = express.Router()
api.use(campaignsRouter)
api.use(briefsRouter)
api.use(framingRouter)
api.use(evalRouter)
api.use(createRouter)
api.use(exportsRouter)
api.use(askOutputsRouter)
api.use(synthesisRouter)
api.use(heuristicsRouter)
api.use(outputsLatestRouter)


// Protect everything under /api via auth middleware
app.use('/api', authMiddleware, api)

// Error handler (surface status/message when available)
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
  console.log(`Serving export files at http://localhost:${PORT}/api/files/… (and /files/…)`)
})

export default app
