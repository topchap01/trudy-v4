// apps/backend/src/routes/ask.ts
import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { normalizeBrief } from '../lib/normalizeBrief.js'

const router = Router()

// -----------------------------
// Types
// -----------------------------
type AskQuestion = {
  id: string
  label: string
  key: string
  type?: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'boolean'
  options?: string[]
  placeholder?: string
  theme?: string
}

// -----------------------------
// Helpers
// -----------------------------
const THEMES = [
  'Brand Basics',
  'Category',
  'Mechanic',
  'Prize',
  'Dates & Regions',
  'Retail & Channels',
  'Compliance',
  'Budget & Volume',
  'Proof & UGC',
]

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

function normLabel(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/mechanics?/g, 'mechanic')
    .replace(/prize (pool|tiers|value)/g, 'prize')
    .replace(/category( type)?/g, 'category')
    .trim()
}

function withTheme(q: AskQuestion): AskQuestion {
  const l = q.label.toLowerCase()
  const theme =
    l.includes('brand') ? 'Brand Basics' :
    l.includes('category') ? 'Category' :
    l.includes('mechanic') ? 'Mechanic' :
    l.includes('prize') || l.includes('reward') ? 'Prize' :
    l.includes('date') || l.includes('region') || l.includes('state') ? 'Dates & Regions' :
    l.includes('retail') || l.includes('channel') ? 'Retail & Channels' :
    l.includes('age') || l.includes('alcohol') || l.includes('permit') || l.includes('privacy') ? 'Compliance' :
    l.includes('budget') || l.includes('volume') ? 'Budget & Volume' :
    l.includes('ugc') || l.includes('proof') || l.includes('receipt') ? 'Proof & UGC' :
    ''
  return { ...q, theme }
}

function orderByTheme(questions: AskQuestion[]): AskQuestion[] {
  const idx = (t?: string) => {
    const i = t ? THEMES.indexOf(t) : -1
    return i === -1 ? 999 : i
  }
  return [...questions].sort((a, b) => idx(a.theme) - idx(b.theme) || a.label.localeCompare(b.label))
}

function dedupeAndHygiene(questions: AskQuestion[]): AskQuestion[] {
  const map = new Map<string, AskQuestion>()
  for (const q of questions) {
    const key = normLabel(q.label)
    if (!map.has(key)) {
      map.set(key, withTheme(q))
    }
  }
  return orderByTheme(Array.from(map.values()))
}

function mechanicOptions(): string[] {
  // Common global / AU-friendly promotion mechanics
  return [
    'Sweepstakes (Game of Chance)',
    'Game of Skill (25 words or less)',
    'Instant Win',
    'Gift with Purchase (GWP)',
    'Buy X Get Y',
    'Collect & Win',
    'Loyalty Stamp/Card',
    'Cashback / Rebate',
    'Trade Promotion Lottery',
    'Prize Draw',
    'UGC Contest',
    'Sampling / Trial',
    'Trade-in',
  ]
}

// Build questions based on what’s missing/ambiguous
async function buildBriefQuestions(campaignId: string): Promise<AskQuestion[]> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { brief: true },
  })
  const pj = normalizeBrief((campaign?.brief?.parsedJson ?? {}) as Record<string, any>)

  const qs: AskQuestion[] = []

  // Required core
  if (!pj.brand) {
    qs.push({
      id: 'brand',
      key: 'brand',
      label: 'What is the brand?',
      type: 'text',
      placeholder: 'e.g., Grant Burge',
    })
  }
  if (!pj.category) {
    qs.push({
      id: 'category',
      key: 'category',
      label: 'Which product category is this for?',
      type: 'text',
      placeholder: 'e.g., Sparkling wine',
    })
  }
  if (!pj.mechanic) {
    qs.push({
      id: 'mechanic',
      key: 'mechanic',
      label: 'Select the core promotion mechanic',
      type: 'select',
      options: mechanicOptions(),
    })
  }

  // Prize clarity
  if (!pj.prize && !pj.prizePool && !pj.prizeTiers) {
    qs.push({
      id: 'prize',
      key: 'prize',
      label: 'Describe the prize (headline)',
      type: 'text',
      placeholder: 'e.g., Win $10,000 for your next adventure',
    })
  }
  if (!pj.prizePool && !pj.prizeTiers) {
    qs.push({
      id: 'prize-pool',
      key: 'prizePool',
      label: 'Total prize pool (approximate, in local currency)',
      type: 'number',
      placeholder: 'e.g., 10000',
    })
  }

  // Dates & Regions
  if (!pj.startDate) {
    qs.push({
      id: 'start-date',
      key: 'startDate',
      label: 'Promotion start date',
      type: 'date',
    })
  }
  if (!pj.endDate) {
    qs.push({
      id: 'end-date',
      key: 'endDate',
      label: 'Promotion end date',
      type: 'date',
    })
  }
  if (!pj.regions && !pj.states) {
    qs.push({
      id: 'regions',
      key: 'regions',
      label: 'Regions/States included',
      type: 'text',
      placeholder: 'e.g., National (or NSW/VIC only)',
    })
  }

  // Retail & Channels
  if (!pj.retailers && !pj.channels) {
    qs.push({
      id: 'retailers',
      key: 'retailers',
      label: 'Key retailers / channels',
      type: 'text',
      placeholder: 'e.g., Dan Murphy’s, Liquorland, IGA',
    })
  }

  // Compliance basics
  if (!pj.ageGate && /wine|beer|alcohol|spirit/i.test(String(pj.category ?? ''))) {
    qs.push({
      id: 'age-gate',
      key: 'ageGate',
      label: 'Alcohol: Is an 18+ age-gate required?',
      type: 'boolean',
    })
  }
  if (!pj.permits && /chance|sweepstake|lottery/i.test(String(pj.mechanic ?? ''))) {
    qs.push({
      id: 'permits',
      key: 'permits',
      label: 'Will permits be required (e.g., NSW/SA)?',
      type: 'boolean',
    })
  }

  // Proof & UGC
  if (!pj.proofOfPurchase && !pj.ugcPolicy) {
    qs.push({
      id: 'proof',
      key: 'proofOfPurchase',
      label: 'Required proof of purchase or UGC?',
      type: 'text',
      placeholder: 'e.g., Upload receipt; or Submit a photo with the product',
    })
  }

  // Budget & Volume (optional nudges)
  if (!pj.estimatedVolume) {
    qs.push({
      id: 'volume',
      key: 'estimatedVolume',
      label: 'Estimated promo volume (entries or units)',
      type: 'number',
      placeholder: 'e.g., 5000',
    })
  }
  if (!pj.budget) {
    qs.push({
      id: 'budget',
      key: 'budget',
      label: 'Est. working budget (excluding prize pool)',
      type: 'number',
      placeholder: 'e.g., 25000',
    })
  }

  // Always offer a free-text clarifier at the end
  qs.push({
    id: 'notes',
    key: 'notes',
    label: 'Anything else that will help us design or evaluate?',
    type: 'textarea',
    placeholder: 'Edge cases, must-include assets, retailer asks, etc.',
  })

  // Hygiene (dedupe, theme, order)
  return dedupeAndHygiene(qs.map(q => ({ ...q, id: slug(q.id || q.key || q.label) })))
}

// -----------------------------
// Routes
// -----------------------------

/**
 * POST /api/campaigns/:id/ask/brief
 * Returns a clean, de-duplicated, themed list of questions with stable ids.
 */
router.post('/campaigns/:id/ask/brief', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const Params = z.object({ id: z.string().min(1) })
    const { id } = Params.parse(req.params)

    const questions = await buildBriefQuestions(id)

    res.json({ questions })
  } catch (err) {
    next(err)
  }
})

/**
 * (Placeholder) POST /api/campaigns/:id/ask/outputs
 * Kept minimal to avoid drift. Returns an empty list for now.
 */
router.post('/campaigns/:id/ask/outputs', async (_req: Request, res: Response) => {
  res.json({ questions: [] })
})

// -----------------------------
// Error handler (local)
// -----------------------------
router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const http = typeof err?.status === 'number' ? err.status : 500
  const message = err?.message ?? 'Internal Server Error'
  // eslint-disable-next-line no-console
  if (http >= 500) console.error('[TRUDY][ask] ERROR', { http, message, stack: err?.stack })
  res.status(http).json({ error: { code: http === 400 ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR', message } })
})

export default router
