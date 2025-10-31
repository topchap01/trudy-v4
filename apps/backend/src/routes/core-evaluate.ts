// apps/backend/src/routes/core-evaluate.ts
import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext } from '../lib/context.js'
import { runEvaluate } from '../lib/orchestrator/evaluate.js'
import { runIdeation } from '../lib/orchestrator/ideation.js'
import { extractFramingMeta } from '../lib/orchestrator/framing.js'
import { readWarRoomPrefsFromBrief, saveWarRoomPrefs } from '../lib/war-room-prefs.js'
import { applyResearchOverrides, readResearchOverridesFromBrief, saveResearchOverrides } from '../lib/war-room-research.js'

const router = Router()

/* -------------------------------------------------------------------------- */
/*                              small helpers                                 */
/* -------------------------------------------------------------------------- */

const MODE_ENUM = new Set(['CREATE', 'EVALUATE'] as const)
const STATUS_ENUM = new Set(['DRAFT', 'LIVE', 'COMPLETE'] as const)
const RULE_FLEX_ENUM = new Set(['KEEP', 'BEND', 'BREAK'] as const)

function guardEnum<T extends string>(value: any, allowed: Set<T>, fallback: T): T {
  const v = String(value ?? '').toUpperCase() as T
  return allowed.has(v) ? v : fallback
}
function parseISODateOrNull(v: any): Date | null {
  if (v == null || v === '') return null
  const s = String(v)
  const isYMD = /^\d{4}-\d{2}-\d{2}$/.test(s)
  const isISO = /^\d{4}-\d{2}-\d{2}T/.test(s)
  if (!isYMD && !isISO) return null
  const t = Date.parse(s)
  return Number.isFinite(t) ? new Date(t) : null
}

/* -------------------------------------------------------------------------- */
/*                         content extraction helper                           */
/* -------------------------------------------------------------------------- */

function parseMaybeJson(x: any): any {
  if (!x) return null
  if (typeof x === 'string') {
    try { return JSON.parse(x) } catch { return null }
  }
  return typeof x === 'object' ? x : null
}

function safeJson(value: any): any {
  if (!value) return null
  if (typeof value === 'object') return value
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return null
}

function extractPrimaryContent(row: { content?: any; params?: any } | null | undefined): string | null {
  if (!row) return null
  const direct = row.content
  if (typeof direct === 'string' && direct.trim()) return direct.trim()

  const p = parseMaybeJson((row as any).params) || (row as any).params || null
  if (p && typeof p === 'object') {
    const candidates = [
      p?.result?.content,
      p?.content,
      p?.narrative,
      p?.output?.content,
      p?.data?.content,
      p?.value?.content,
      p?.text,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/*                   campaigns: list minimal for dashboard                     */
/* -------------------------------------------------------------------------- */

router.get('/campaigns', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const rows = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, clientName: true, title: true, status: true, mode: true,
        market: true, category: true, startDate: true, endDate: true,
        createdAt: true, updatedAt: true,
      },
    })
    res.json(rows)
  } catch (err) { next(err) }
})

/**
 * Create a campaign
 */
router.post('/campaigns', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      title,
      clientName = null,
      market = null,
      category = null,
      mode = 'CREATE',
      status = 'DRAFT',
      startDate = null,
      endDate = null,
    } = req.body || {}

    if (!title || String(title).trim().length < 2) {
      return res.status(400).json({ error: 'Title is required' })
    }

    const row = await prisma.campaign.create({
      data: {
        title: String(title).trim(),
        clientName: clientName ? String(clientName).trim() : null,
        market: market ? String(market).trim() : null,
        category: category ? String(category).trim() : null,
        mode: guardEnum(mode, MODE_ENUM, 'CREATE'),
        status: guardEnum(status, STATUS_ENUM, 'DRAFT'),
        startDate: parseISODateOrNull(startDate),
        endDate: parseISODateOrNull(endDate),
      },
      select: {
        id: true, clientName: true, title: true, status: true, mode: true,
        market: true, category: true, startDate: true, endDate: true,
        createdAt: true, updatedAt: true,
      },
    })
    res.status(201).json(row)
  } catch (err) { next(err) }
})

/**
 * Update basic campaign fields
 */
async function updateCampaignHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id
    const camp = await prisma.campaign.findUnique({ where: { id } })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const {
      title,
      clientName,
      market,
      category,
      mode,
      status,
      startDate,
      endDate,
    } = (req.body || {}) as Record<string, unknown>

    const row = await prisma.campaign.update({
      where: { id },
      data: {
        ...(title != null ? { title: String(title).trim() } : {}),
        ...(clientName !== undefined ? { clientName: clientName ? String(clientName).trim() : null } : {}),
        ...(market !== undefined ? { market: market ? String(market).trim() : null } : {}),
        ...(category !== undefined ? { category: category ? String(category).trim() : null } : {}),
        ...(mode !== undefined ? { mode: guardEnum(mode as any, MODE_ENUM, camp.mode as any) } : {}),
        ...(status !== undefined ? { status: guardEnum(status as any, STATUS_ENUM, camp.status as any) } : {}),
        ...(startDate !== undefined ? { startDate: parseISODateOrNull(startDate) } : {}),
        ...(endDate !== undefined ? { endDate: parseISODateOrNull(endDate) } : {}),
      },
      select: {
        id: true, clientName: true, title: true, status: true, mode: true,
        market: true, category: true, startDate: true, endDate: true,
        createdAt: true, updatedAt: true,
      },
    })
    res.json(row)
  } catch (err) { next(err) }
}
router.patch('/campaigns/:id', updateCampaignHandler)
router.put('/campaigns/:id', updateCampaignHandler)

/* -------------------------------------------------------------------------- */
/*                     get single campaign (plus brief)                        */
/* -------------------------------------------------------------------------- */

router.get('/campaigns/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: { brief: true },
    })
    if (!row) return res.status(404).json({ error: 'Campaign not found' })

    res.json({
      id: row.id,
      clientName: row.clientName,
      title: row.title,
      status: row.status,
      mode: row.mode,
      market: row.market,
      category: row.category,
      startDate: row.startDate,
      endDate: row.endDate,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      brief: row.brief ? {
        rawText: row.brief.rawText,
        parsedJson: row.brief.parsedJson,
      } : null,
    })
  } catch (err) { next(err) }
})

// brief-only
router.get('/campaigns/:id/brief', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brief = await prisma.brief.findUnique({
      where: { campaignId: req.params.id },
      select: { rawText: true, parsedJson: true },
    })
    res.json({ brief: brief ?? null })
  } catch (err) { next(err) }
})

/**
 * PUT brief (rawText + parsedJson)
 */
router.put('/campaigns/:id/brief', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id
    let { rawText = undefined, parsedJson = undefined } = (req.body || {}) as {
      rawText?: unknown; parsedJson?: unknown
    }

    const camp = await prisma.campaign.findUnique({ where: { id }, include: { brief: true } })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    if (typeof parsedJson === 'string') {
      try { parsedJson = JSON.parse(parsedJson) } catch { /* leave as-is */ }
    }

    function mergeDeep<T>(base: any, patch: any): T {
      if (patch === null) return null as T
      if (patch === undefined) return base
      if (Array.isArray(patch)) return patch as T
      if (typeof patch !== 'object') return patch as T
      const out: any = { ...(base && typeof base === 'object' ? base : {}) }
      for (const k of Object.keys(patch)) {
        const pv = (patch as any)[k]
        const bv = out[k]
        if (pv === null) { out[k] = null; continue }
        if (pv === undefined) { continue }
        if (Array.isArray(pv)) { out[k] = pv; continue }
        if (typeof pv === 'object') {
          out[k] = mergeDeep(bv, pv)
        } else {
          out[k] = pv
        }
      }
      return out
    }

    const existingParsed = camp.brief?.parsedJson ?? {}
    const mergedParsed =
      parsedJson === undefined
        ? existingParsed
        : mergeDeep<any>(existingParsed, parsedJson)

    const nextRaw =
      rawText === undefined
        ? (camp.brief?.rawText ?? '')
        : String(rawText)

    const saved = await prisma.brief.upsert({
      where: { campaignId: id },
      update: { rawText: nextRaw, parsedJson: mergedParsed as any },
      create: {
        campaign: { connect: { id } },
        rawText: nextRaw,
        parsedJson: mergedParsed as any,
      },
      select: { rawText: true, parsedJson: true },
    })

    res.json({ ok: true, brief: saved })
  } catch (err) { next(err) }
})

/* -------------------------------------------------------------------------- */
/*                                outputs utils                                */
/* -------------------------------------------------------------------------- */

// Build a dual-path OR where (FK or relation)
function buildWhere(campaignId: string, types?: string[]) {
  const t = types && types.length ? { type: { in: types } } : {}
  return {
    OR: [
      { campaignId, ...t },
      { campaign: { id: campaignId }, ...t }
    ]
  }
}

async function fetchByTypesAsc(campaignId: string, types: string[]) {
  return prisma.output.findMany({
    where: buildWhere(campaignId, types),
    orderBy: { createdAt: 'asc' },
    select: { id: true, type: true, content: true, params: true, createdAt: true },
  })
}
function pickPreferredEvaluation(
  rows: Array<{ id: string; type: string; content: string | null; params: any; createdAt: Date }>
) {
  if (!rows.length) return null
  const tagged = rows.filter(r => {
    const p = r?.params as any
    return p && (p.codeVersion === 'v4-eval-prose-au-locked' || p.kind === 'eval-prose-au')
  })
  if (tagged.length) return tagged[tagged.length - 1]
  const nonLegacy = rows.filter(r => !String(r.content || '').startsWith('## Evaluation (Superb)'))
  if (nonLegacy.length) return nonLegacy[nonLegacy.length - 1]
  return rows[rows.length - 1]
}
async function getLatestByTypeSmart(campaignId: string, types: string[]) {
  const rows = await fetchByTypesAsc(campaignId, types)
  if (types.some(t => t.toLowerCase().startsWith('evaluation'))) {
    return pickPreferredEvaluation(rows)
  }
  return rows.length ? rows[rows.length - 1] : null
}
async function getRecentByType(campaignId: string, types: string[], take = 2) {
  return prisma.output.findMany({
    where: buildWhere(campaignId, types),
    orderBy: { createdAt: 'desc' },
    take,
    select: { id: true, type: true, content: true, params: true, createdAt: true },
  })
}

/* -------------------------------------------------------------------------- */
/*                         latest outputs snapshot API                         */
/* -------------------------------------------------------------------------- */

router.get('/campaigns/:id/outputs/latest', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id
    const wantDebug = String(req.query.debug || '') === '1'

    const framingOut = await getLatestByTypeSmart(id, ['framingNarrative', 'framing'])
    const evalOut    = await getLatestByTypeSmart(id, ['evaluationNarrative', 'evaluation'])
    const ideasOut   = await getLatestByTypeSmart(id, ['ideaRoutes', 'ideas'])
    const synthOut   = await getLatestByTypeSmart(id, ['synthesisNarrative', 'synthesis'])
    const opinionOut = await getLatestByTypeSmart(id, ['opinionNarrative', 'opinion'])
    const strategistOut = await getLatestByTypeSmart(id, ['strategistNarrative', 'strategist'])
    const ideationHarnessOut = await getLatestByTypeSmart(id, ['ideationHarness'])
    const ideationUnboxedOut = await getLatestByTypeSmart(id, ['ideationUnboxed'])

    const allTypesForFallback = [
      'framingNarrative','framing',
      'evaluationNarrative','evaluation',
      'ideaRoutes','ideas',
      'synthesisNarrative','synthesis',
      'opinionNarrative','opinion',
      'strategistNarrative','strategist',
      'ideationHarness','ideationUnboxed',
    ]
    const recent = await prisma.output.findMany({
      where: buildWhere(id, allTypesForFallback),
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: { id: true, type: true, content: true, params: true, createdAt: true },
    })
    const outputs = recent.map(r => ({
      id: r.id,
      type: r.type,
      createdAt: r.createdAt,
      content: extractPrimaryContent(r),
      params: r.params,
    }))

    const result: any = {
      framing: extractPrimaryContent(framingOut),
      evaluation: extractPrimaryContent(evalOut),
      ideas: extractPrimaryContent(ideasOut),
      synthesis: extractPrimaryContent(synthOut),
      opinion: extractPrimaryContent(opinionOut),
      strategist: extractPrimaryContent(strategistOut),
      ideation: {
        harness: safeJson(ideationHarnessOut?.content) || null,
        unboxed: safeJson(ideationUnboxedOut?.content) || [],
      },
      outputs,
      _meta: {
        framingType: framingOut?.type || null,
        evaluationType: evalOut?.type || null,
        ideasType: ideasOut?.type || null,
        synthesisType: synthOut?.type || null,
        opinionType: opinionOut?.type || null,
        strategistType: strategistOut?.type || null,
        ideationHarnessType: ideationHarnessOut?.type || null,
        ideationUnboxedType: ideationUnboxedOut?.type || null,
        ids: {
          framing: framingOut ? { id: framingOut.id, createdAt: framingOut.createdAt } : null,
          evaluation: evalOut ? { id: evalOut.id, createdAt: evalOut.createdAt } : null,
          ideas: ideasOut ? { id: ideasOut.id, createdAt: ideasOut.createdAt } : null,
          synthesis: synthOut ? { id: synthOut.id, createdAt: synthOut.createdAt } : null,
          opinion: opinionOut ? { id: opinionOut.id, createdAt: opinionOut.createdAt } : null,
          strategist: strategistOut ? { id: strategistOut.id, createdAt: strategistOut.createdAt } : null,
          ideationHarness: ideationHarnessOut ? { id: ideationHarnessOut.id, createdAt: ideationHarnessOut.createdAt } : null,
          ideationUnboxed: ideationUnboxedOut ? { id: ideationUnboxedOut.id, createdAt: ideationUnboxedOut.createdAt } : null,
        },
      },
    }

    if (wantDebug) {
      try {
        const [countFK, countRel] = await Promise.all([
          prisma.output.count({ where: { campaignId: id } }),
          prisma.output.count({ where: { campaign: { id } } }),
        ])
        const groups = await prisma.output.groupBy({
          by: ['type'],
          where: buildWhere(id),
          _count: { _all: true },
          _max: { createdAt: true },
        })
        const peekOpinion = await getRecentByType(id, ['opinionNarrative', 'opinion'], 2)
        const peekStrategist = await getRecentByType(id, ['strategistNarrative','strategist'], 2)
        Object.assign(result, {
          _debug: {
            idEcho: id,
            counts: { byFK: countFK, byRelation: countRel },
            typesPresent: groups,
            peekOpinion: peekOpinion.map(r => ({ id: r.id, type: r.type, createdAt: r.createdAt, head: String(extractPrimaryContent(r) || '').slice(0,80) })),
            peekStrategist: peekStrategist.map(r => ({ id: r.id, type: r.type, createdAt: r.createdAt, head: String(extractPrimaryContent(r) || '').slice(0,80) })),
          }
        })
      } catch {
        Object.assign(result, { _debug: { idEcho: id } })
      }
    }

    res.json(result)
  } catch (err) {
    next(err)
  }
})

/* -------------------------------------------------------------------------- */
/*                  War Room hydrate (single canonical payload)                */
/* -------------------------------------------------------------------------- */

router.get('/campaigns/:id/war-room', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id

    const camp = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const researchOverrides = readResearchOverridesFromBrief(camp.brief)

    const [framingOut, evalOut, ideasOut, synthOut, opinionOut, strategistOut, ideationHarnessOut, ideationUnboxedOut] = await Promise.all([
      getLatestByTypeSmart(id, ['framingNarrative', 'framing']),
      getLatestByTypeSmart(id, ['evaluationNarrative', 'evaluation']),
      getLatestByTypeSmart(id, ['ideaRoutes', 'ideas']),
      getLatestByTypeSmart(id, ['synthesisNarrative', 'synthesis']),
      getLatestByTypeSmart(id, ['opinionNarrative', 'opinion']),
      getLatestByTypeSmart(id, ['strategistNarrative', 'strategist']),
      getLatestByTypeSmart(id, ['ideationHarness']),
      getLatestByTypeSmart(id, ['ideationUnboxed']),
    ])

    const framingMetaRaw = framingOut ? extractFramingMeta(framingOut) : null
    const framingMeta = framingMetaRaw
      ? { ...framingMetaRaw, research: applyResearchOverrides(framingMetaRaw.research ?? null, researchOverrides) || framingMetaRaw.research || null }
      : null
    const researchPack = framingMeta?.research || null

    res.json({
      campaign: {
        id: camp.id,
        clientName: camp.clientName,
        title: camp.title,
        status: camp.status,
        mode: camp.mode,
        market: camp.market,
        category: camp.category,
        startDate: camp.startDate,
        endDate: camp.endDate,
        createdAt: camp.createdAt,
        updatedAt: camp.updatedAt,
      },
      brief: camp.brief ? {
        rawText: camp.brief.rawText,
        parsedJson: camp.brief.parsedJson,
      } : null,
      latest: {
        framing: extractPrimaryContent(framingOut),
        evaluation: extractPrimaryContent(evalOut),
        ideas: extractPrimaryContent(ideasOut),
        synthesis: extractPrimaryContent(synthOut),
        opinion: extractPrimaryContent(opinionOut),
        strategist: extractPrimaryContent(strategistOut),
        ideation: {
          harness: safeJson(ideationHarnessOut?.content) || null,
          unboxed: safeJson(ideationUnboxedOut?.content) || [],
        },
      },
      _meta: {
        ids: {
          framing: framingOut ? { id: framingOut.id, createdAt: framingOut.createdAt } : null,
          evaluation: evalOut ? { id: evalOut.id, createdAt: evalOut.createdAt } : null,
          ideas: ideasOut ? { id: ideasOut.id, createdAt: ideasOut.createdAt } : null,
          synthesis: synthOut ? { id: synthOut.id, createdAt: synthOut.createdAt } : null,
          opinion: opinionOut ? { id: opinionOut.id, createdAt: opinionOut.createdAt } : null,
          strategist: strategistOut ? { id: strategistOut.id, createdAt: strategistOut.createdAt } : null,
          ideationHarness: ideationHarnessOut ? { id: ideationHarnessOut.id, createdAt: ideationHarnessOut.createdAt } : null,
          ideationUnboxed: ideationUnboxedOut ? { id: ideationUnboxedOut.id, createdAt: ideationUnboxedOut.createdAt } : null,
        },
      },
      research: researchPack,
      researchOverrides: researchOverrides || null,
      prefs: readWarRoomPrefsFromBrief(camp.brief),
    })
  } catch (err) { next(err) }
})

router.post('/campaigns/:id/war-room/prefs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id
    const prefs = await saveWarRoomPrefs(id, {
      allowHeroOverlay: req.body?.allowHeroOverlay,
      entryFrictionAccepted: req.body?.entryFrictionAccepted,
      notes: req.body?.notes,
    })
    res.json({ prefs })
  } catch (err) { next(err) }
})

router.post('/campaigns/:id/war-room/research/overrides', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id
    const overrides = await saveResearchOverrides(id, req.body || {})
    res.json({ overrides })
  } catch (err) { next(err) }
})

/* -------------------------------------------------------------------------- */
/*   run ideation (UNBOXED + HARNESS)                                         */
/* -------------------------------------------------------------------------- */

router.post('/campaigns/:id/ideation/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id

    const camp = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const ctx = buildCampaignContext(camp)
    const { unboxed, harness } = await runIdeation(ctx, {})

    const [unboxedRow, harnessRow] = await prisma.$transaction([
      prisma.output.create({
        data: {
          campaignId: id,
          type: 'ideationUnboxed',
          prompt: 'ideation.unboxed',
          content: JSON.stringify(unboxed),
          params: {
            agentCount: unboxed.length,
            agents: unboxed.map((entry) => entry.agent),
            codeVersion: 'v1-unboxed',
          } as any,
        },
      }),
      prisma.output.create({
        data: {
          campaignId: id,
          type: 'ideationHarness',
          prompt: 'ideation.harness',
          content: JSON.stringify(harness),
          params: {
            codeVersion: 'v1-harness',
            selectedHook: harness?.selectedHook || null,
            sourceAgent: harness?.sourceIdea?.agent || null,
            sourceTier: harness?.sourceIdea?.tier || null,
          } as any,
        },
      }),
    ])

    res.json({
      result: {
        harness: {
          id: harnessRow.id,
          createdAt: harnessRow.createdAt,
          data: harness,
        },
        unboxed: {
          id: unboxedRow.id,
          createdAt: unboxedRow.createdAt,
          data: unboxed,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

/* -------------------------------------------------------------------------- */
/*   run evaluation                                                            */
/* -------------------------------------------------------------------------- */

router.post('/campaigns/:id/evaluate/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id

    const camp = await prisma.campaign.findUnique({
      where: { id },
      include: { brief: true },
    })
    if (!camp) return res.status(404).json({ error: 'Campaign not found' })

    const framingRows = await fetchByTypesAsc(id, ['framingNarrative', 'framing'])
    const latestFraming = framingRows.length ? framingRows[framingRows.length - 1] : null
    if (!latestFraming) {
      // Hard-stop: we only evaluate *after* Framing has run
      return res.status(409).json({ error: 'FRAMING_REQUIRED' })
    }

    const priorFraming = (latestFraming?.content || '').trim()
    const priorFramingMeta = latestFraming ? extractFramingMeta(latestFraming) : null

    // Optional: enforce research presence if you want to be strict
    // If you ALWAYS run Framing first (with research attached), uncomment:
    // if (!priorFramingMeta?.research) {
    //   return res.status(409).json({ error: 'FRAMING_RESEARCH_REQUIRED' })
    // }

    const ctx = buildCampaignContext(camp)
    const researchOverrides = readResearchOverridesFromBrief(camp.brief)
    const ruleFlex = guardEnum((req.body?.ruleFlex as any) ?? 'KEEP', RULE_FLEX_ENUM, 'KEEP')

    const { content, meta } = await runEvaluate(ctx, {
      ruleFlex,
      priorFraming,
      priorFramingMeta, // ⬅️ Evaluation reuses Framing.research; no new research here
      researchOverrides,
    })

    const saved = await prisma.output.create({
      data: {
        campaign: { connect: { id } },
        type: 'evaluationNarrative',
        content,
        params: {
          ...(meta || {}),
          codeVersion: 'v4-eval-prose-au-locked',
          kind: 'eval-prose-au',
        } as any,
        prompt: '',
      },
      select: { id: true, type: true, content: true, params: true, createdAt: true },
    })

    res.json(saved)
  } catch (err) {
    next(err)
  }
})

export default router
