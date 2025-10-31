// apps/backend/src/middleware/auth.ts
import { type Request, type Response, type NextFunction } from 'express'

export function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Dev header to emulate user
  const email = req.header('x-user-email') || 'dev@trudy.local'
  ;(req as any).user = { email }
  next()
}

