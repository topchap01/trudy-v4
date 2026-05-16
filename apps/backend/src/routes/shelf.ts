// apps/backend/src/routes/shelf.ts
// The Shelf API — two modes: generate routes and evaluate ideas.
// Replaces the old multi-phase War Room flow with a clean 3-step pipeline.

import { Router, type Request, type Response, type NextFunction } from 'express'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { runShelfResearch } from '../shelf/research.js'
import { generateRoutes, evaluateIdea } from '../shelf/orchestrator.js'

const router = Router()

// ---- Shared validation ----
const BriefInput = z.object({
  brand: z.string().min(1),
  category: z.string().min(1),
  market: z.string().default('Australia'),
  retailers: z.array(z.string()).optional(),
  competitors: z.array(z.string()).optional(),
  oneJob: z.enum(['BREAKER', 'BUILDER', 'LOADER', 'HARVESTER', 'KEEPER']).optional(),
  budget: z.number().optional(),
  duration: z.number().int().optional(), // days
  constraints: z.string().optional(),
  audienceSummary: z.string().optional(),
  title: z.string().optional(),
})

const IdeaInput = z.object({
  idea: z.string().min(10), // free text or structured description
  brand: z.string().min(1),
  category: z.string().min(1),
  market: z.string().default('Australia'),
  retailers: z.array(z.string()).optional(),
  budget: z.number().optional(),
  mechanic: z.string().optional(), // if they know the mechanic
  headline: z.string().optional(), // on-pack message if they have one
})

// ---- Mode 1: Generate Routes ----
// POST /shelf/generate
router.post('/shelf/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BriefInput.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const input = parsed.data

    // Step 1: Research (cached if same brand+category+market within 24h)
    const research = await runShelfResearch({
      brand: input.brand,
      category: input.category,
      market: input.market,
      retailers: input.retailers,
      competitors: input.competitors,
    })

    // Step 2: Generate routes with Provocateur + Pragmatist scoring
    const routes = await generateRoutes({
      brand: input.brand,
      category: input.category,
      market: input.market || 'Australia',
      retailers: input.retailers || [],
      oneJob: input.oneJob || 'BREAKER',
      budget: input.budget ?? 0,
      duration: String(input.duration ?? ''),
      constraints: input.constraints,
      researchDossier: research ? JSON.stringify(research) : undefined,
    })

    // Step 3: Save to database
    const campaign = await prisma.campaign.create({
      data: {
        title: input.title || `${input.brand} — ${input.category}`,
        clientName: input.brand,
        market: input.market || 'AU',
        category: input.category,
        mode: 'CREATE',
        status: 'DRAFT',
      },
    })

    await prisma.output.create({
      data: {
        campaignId: campaign.id,
        type: 'shelfRoutes',
        prompt: JSON.stringify(input),
        content: JSON.stringify(routes),
      },
    })

    if (research) {
      await prisma.output.create({
        data: {
          campaignId: campaign.id,
          type: 'shelfResearch',
          prompt: `${input.brand} ${input.category} ${input.market}`,
          content: JSON.stringify(research),
        },
      })
    }

    res.json({
      ok: true,
      campaignId: campaign.id,
      research,
      routes,
    })
  } catch (e) { next(e) }
})

// ---- Mode 2: Evaluate Idea ----
// POST /shelf/evaluate
router.post('/shelf/evaluate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = IdeaInput.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })
    const input = parsed.data

    // Step 1: Research
    const research = await runShelfResearch({
      brand: input.brand,
      category: input.category,
      market: input.market,
      retailers: input.retailers,
      mechanic: input.mechanic,
    })

    // Step 2: Evaluate with Shelf diagnostic
    const verdict = await evaluateIdea({
      idea: input.idea,
      brand: input.brand,
      category: input.category,
      market: input.market || 'Australia',
      retailers: input.retailers || [],
      budget: input.budget,
      researchDossier: research ? JSON.stringify(research) : undefined,
    })

    // Step 3: Save
    const campaign = await prisma.campaign.create({
      data: {
        title: `Evaluate: ${input.brand} — ${input.category}`,
        clientName: input.brand,
        market: input.market || 'AU',
        category: input.category,
        mode: 'EVALUATION',
        status: 'DRAFT',
      },
    })

    await prisma.output.create({
      data: {
        campaignId: campaign.id,
        type: 'shelfEvaluation',
        prompt: input.idea,
        content: JSON.stringify(verdict),
      },
    })

    res.json({
      ok: true,
      campaignId: campaign.id,
      research,
      verdict,
    })
  } catch (e) { next(e) }
})

// ---- Stress Test a specific route ----
// POST /shelf/stress-test
router.post('/shelf/stress-test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { route, brand, category, market, budget } = req.body
    if (!route) return res.status(400).json({ error: 'route is required' })

    // Run full Pragmatist stress test on a single route
    const research = await runShelfResearch({ brand, category, market })

    const verdict = await evaluateIdea({
      idea: JSON.stringify(route),
      brand,
      category,
      market: market || 'Australia',
      retailers: [],
      budget,
      researchDossier: research ? JSON.stringify(research) : undefined,
    })

    res.json({ ok: true, verdict })
  } catch (e) { next(e) }
})

// ---- Export to Trevor ----
// POST /shelf/export-trevor
router.post('/shelf/export-trevor', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { route } = req.body
    if (!route) return res.status(400).json({ error: 'route is required' })

    // Map CampaignRoute to Trevor's wizard data format
    const trevorPayload = {
      campaignName: route.name,
      campaignType: route.trevorCampaignType || 'Simple Entry',
      prizes: (route.prizes || []).map((p: any) => ({
        name: p.name,
        description: p.description || '',
        value: p.value,
        quantity: p.quantity,
        type: p.type === 'Cash' || p.type === 'Voucher' ? 'Voucher' : 'Physical',
      })),
      // Entry form config from friction profile
      fields: route.trevorEntryConfig?.fields || { firstName: true, lastName: true, email: true },
      fieldsRequired: route.trevorEntryConfig?.fieldsRequired || { firstName: true, lastName: true, email: true },
      receiptRequired: route.frictionProfile?.receiptRequired || false,
      maxReceipts: route.trevorEntryConfig?.maxReceipts || 1,
      codeRequired: route.trevorEntryConfig?.codeRequired || false,
      entryLimit: route.trevorEntryConfig?.entryLimit || null,
      maximumDailyEntries: route.trevorEntryConfig?.dailyEntryLimit || null,
      // Messaging (for creative team, not in Trevor's Salesforce schema)
      _trudy: {
        headline: route.messageHierarchy?.headline,
        subline: route.messageHierarchy?.subline,
        packCopy: route.messageHierarchy?.packCopy,
        staffLine: route.messageHierarchy?.staffLine,
        retailerPitch: route.retailerPitch,
        budgetScenarios: route.budgetScenarios,
        oneJob: route.oneJob,
        mechanic: route.mechanic,
        concept: route.concept,
      },
    }

    res.json({ ok: true, trevorPayload })
  } catch (e) { next(e) }
})

export default router
