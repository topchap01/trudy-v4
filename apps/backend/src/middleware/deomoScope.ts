import type { Request, Response, NextFunction } from 'express'

const DEMO_MODE = String(process.env.DEMO_MODE || '').toLowerCase() === 'true'
const ALLOWLIST = new Set(
  String(process.env.DEMO_CLIENTS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
)

export type DemoScopedRequest = Request & { demoClient?: string }

export function demoScope(req: DemoScopedRequest, res: Response, next: NextFunction) {
  if (!DEMO_MODE) return next()

  const raw = (req.header('X-Demo-Client') || req.query.client || '').toString().trim()
  const norm = raw.toLowerCase()

  if (!raw) {
    return res.status(400).json({ error: 'Demo mode requires ?client=<Name> or X-Demo-Client header' })
  }
  if (ALLOWLIST.size && !ALLOWLIST.has(norm)) {
    return res.status(403).json({ error: `Client not allowed in demo: ${raw}` })
  }
  req.demoClient = raw
  next()
}
