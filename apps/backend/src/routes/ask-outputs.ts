// apps/backend/src/routes/ask-outputs.ts
import { Router, type Request, type Response, type NextFunction } from 'express'
import OpenAI from 'openai'
import { z } from 'zod'
import { prisma } from '../db/prisma.js'
import { buildCreationGuide, type RuleFlex } from '../lib/promotrack.js'

const router = Router()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const MODEL = process.env.TRUDY_SYNTH_MODEL || 'gpt-4o-mini'

// ---------- schema ----------
const Body = z.object({
  campaignId: z.string().min(1),
  type: z.enum([
    'ideas','hooks','hookEvaluation','hookRewrite',
    'retailerDeck','prizeLadder','mechanics','compliance','riskProfile','custom',
  ]),
  params: z.object({
    intensity: z.enum(['CONSERVATIVE','DISRUPTIVE','OUTRAGEOUS']).optional(),
    count: z.number().int().min(1).max(30).optional(),

    // Hook shaping
    length: z.enum(['SHORT','CORE','LONG','MIX']).optional(),
    brandLock: z.boolean().optional(),
    seasonal: z.enum(['NONE','LIGHT','HEAVY']).optional(),
    tone: z.enum(['PREMIUM','PLAYFUL','CHALLENGER']).optional(),

    // Portfolio targeting
    target: z.enum(['BANNER','PER_BRAND']).optional(),
    brands: z.array(z.string().min(1)).optional(),

    // Rule flexibility (PromoTrack)
    ruleFlex: z.enum(['KEEP','BEND','BREAK']).optional(),

    // For hookEvaluation matrix
    hooks: z.array(z.string().min(2)).optional(),
    routes: z.array(z.string().min(1)).optional(),

    // For hookRewrite
    hook: z.string().min(2).optional(),
  }).optional(),
  prompt: z.string().min(3).optional(), // for custom
  context: z.object({
    source: z.enum(['evaluation','synthesis','createRoute','custom']).optional(),
    routeName: z.string().min(1).optional(),
    customBrief: z.string().min(3).optional(),
  }).optional(),
})
.refine((v) => (v.type === 'custom' ? !!v.prompt : true), { message: '`prompt` is required for type=custom', path: ['prompt'] })
.refine((v) => (v.type !== 'hookEvaluation' ? true : !!v.params?.hooks?.length), { message: '`params.hooks` required for type=hookEvaluation', path: ['params','hooks'] })
.refine((v) => (v.type !== 'hookRewrite' ? true : !!v.params?.hook), { message: '`params.hook` required for type=hookRewrite', path: ['params','hook'] })

type AskType = z.infer<typeof Body>['type']

// ---------- helpers ----------
function fnv1a32(s: string): number { let h = 0x811c9dc5>>>0; for (let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,0x01000193)} return h>>>0 }
function temperatureBy(t: AskType, intensity?: 'CONSERVATIVE'|'DISRUPTIVE'|'OUTRAGEOUS') {
  if (t==='ideas'||t==='hooks'||t==='hookRewrite') {
    return intensity==='CONSERVATIVE'?0.5:intensity==='DISRUPTIVE'?0.8:intensity==='OUTRAGEOUS'?0.95:0.7
  }
  return 0.4
}
function defaultCount(t: AskType){ if(t==='ideas')return 7; if(t==='hooks')return 20; return 1 }

function systemMeta(meta: {
  market: string; category?: string|null; timing?: string|null; mode: 'EVALUATION'|'CREATE';
  clientName?: string|null; title: string; bannerName?: string|null; brands?: string[]
}) {
  const lines = [
    `You are Trudy's specialist output engine.`,
    `Market: ${meta.market}`,
    `Category: ${meta.category || 'n/a'}`,
    `Timing/Window: ${meta.timing || 'n/a'}`,
    `Mode: ${meta.mode}`,
    `Client/Brand (banner-first): ${meta.bannerName || meta.clientName || 'n/a'}`,
    Array.isArray(meta.brands) && meta.brands.length ? `Brands in portfolio: ${meta.brands.join(', ')}` : null,
    `Campaign: ${meta.title}`,
    `Voice & Quality: retail-aware, behaviourally intelligent, legally safe (AU default), consultant-grade prose.`,
  ].filter(Boolean)
  return lines.join('\n')
}

async function getLatestOutputs(campaignId: string) {
  const outs = await prisma.output.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } })
  const byType = (t: string) => outs.filter(o => o.type === t)
  const last = (xs: any[]) => (xs.length ? xs[xs.length - 1] : null)
  const evaluation = last(byType('evaluationNarrative'))?.content || ''
  const ideas      = last(byType('ideaRoutes'))?.content || ''
  const synthesis  = last(byType('synthesisNarrative'))?.content || ''
  return { evaluation, ideas, synthesis }
}

function parseIdeas(text: string): Array<{ name: string; body: string }> {
  if (!text) return []
  const blocks = text.split(/^###\s+/m).filter(Boolean)
  const routes: Array<{ name: string; body: string }> = []
  for (const b of blocks) {
    const [head, ...rest] = b.split('\n')
    const name = (head || '').split('—')[0].trim()
    const body = rest.join('\n').trim()
    if (name) routes.push({ name, body })
  }
  return routes
}
function pickRoute(ideasText: string, routeName?: string) {
  const routes = parseIdeas(ideasText)
  if (!routeName) return null
  const lower = routeName.toLowerCase()
  return routes.find(r => r.name.toLowerCase() === lower) || null
}
function banListFrom(texts: string[]) {
  const raw = (texts.join(' ') || '').toLowerCase()
  const bans = ['win a trip','trip','rail','train','the ghan','ghan','journey','holiday','escape','golden ticket']
  return bans.filter(k => raw.includes(k))
}

// ---------- instruction builder ----------
function buildInstruction(args: {
  type: AskType
  count: number
  intensity?: 'CONSERVATIVE'|'DISRUPTIVE'|'OUTRAGEOUS'
  ruleFlex?: RuleFlex
  // hook shaping
  length?: 'SHORT'|'CORE'|'LONG'|'MIX'
  brandLock?: boolean
  seasonal?: 'NONE'|'LIGHT'|'HEAVY'
  tone?: 'PREMIUM'|'PLAYFUL'|'CHALLENGER'
  // portfolio
  target?: 'BANNER'|'PER_BRAND'
  brandTargets?: string[]
  // evaluation
  hooks?: string[]
  routes?: Array<{ name: string; body: string }>
  // context text
  contextLabel: string
  contextText: string
  brand?: string | null
  seed: number
  creationGuide?: string // PromoTrack bias for ideas/hooks
}) {
  const prelude = [
    `SEED:${args.seed}`,
    `CONTEXT (${args.contextLabel}):`,
    args.contextText || '_none_',
    '',
    `Avoid generic words; reflect category, seasonality, and retailer realities.`,
  ].join('\n')

  const bans = banListFrom([args.contextText])
  const banLine = bans.length ? `Ban motifs: ${bans.join(', ')}.` : ''

  const lengthNote =
    args.length === 'SHORT' ? 'Target 2–4 words.'
    : args.length === 'CORE' ? 'Target 5–7 words.'
    : args.length === 'LONG' ? 'Target 8–12 words.'
    : 'Provide a mix of short (2–4), core (5–7), and long (8–12).'

  const brandLockNote =
    args.brandLock && args.brand ? `Lock the banner/brand into the line (e.g., end with “— ${args.brand}”).`
    : 'Keep lines brand-codable without forcing unnatural endings.'

  const seasonalNote =
    args.seasonal === 'HEAVY' ? 'Use strong seasonal cues.'
    : args.seasonal === 'LIGHT' ? 'Use light seasonal cues.'
    : 'Avoid explicit seasonal clichés; keep lines evergreen unless the context demands.'

  const toneNote =
    args.tone === 'PREMIUM' ? 'Tone: premium, restrained, confident.'
    : args.tone === 'PLAYFUL' ? 'Tone: playful, human, quick.'
    : args.tone === 'CHALLENGER' ? 'Tone: challenger, decisive, provocative.'
    : 'Tone: commercially sharp and human.'

  const promoBias = args.creationGuide ? `\n[PRIVATE BIAS — PROMOTRACK]\n${args.creationGuide}\n` : ''

  switch (args.type) {
    case 'hooks': {
      const perBrand = args.target === 'PER_BRAND' && Array.isArray(args.brandTargets) && args.brandTargets.length
      if (perBrand) {
        return [
          prelude, banLine, promoBias,
          `Generate distinct creative hooks/taglines **per brand** for the portfolio.`,
          lengthNote, brandLockNote, seasonalNote, toneNote,
          `Return Markdown with a section for each brand:`,
          `- "## <Brand>" header`,
          `- Under it, one hook per line as: **Hook** — Why it works (one sentence).`,
          `Deduplicate hard; vary archetypes (ritual, scarcity, belonging, wit, mastery).`,
          '',
          `Brands to cover (in order):`,
          ...(args.brandTargets || []).map(b => `- ${b}`),
        ].join('\n')
      }
      return [
        prelude, banLine, promoBias,
        `Generate ${String(args.count)} distinct creative hooks/taglines for the CONTEXT.`,
        lengthNote, brandLockNote, seasonalNote, toneNote,
        `Return each on one line as: **Hook** — Why it works (one sentence).`,
        `Deduplicate hard; vary archetypes (ritual, scarcity, belonging, wit, mastery).`,
      ].join('\n')
    }

    case 'ideas': {
      return [
        prelude, banLine, promoBias,
        `Creative intensity: ${args.intensity || 'DISRUPTIVE'}.`,
        `Generate ${args.count} campaign routes with the structure:`,
        `- Idea name`,
        `- **Creative Hook** — Why it works (one sentence)`,
        `- Mechanic (entry, prize ladder with rough values)`,
        `- Retailer angle`,
        `- Compliance notes (AU default)`,
      ].join('\n')
    }

    case 'hookEvaluation': {
      const routesList = (args.routes || []).map(r => `- ${r.name}`).join('\n') || '- (no routes passed)'
      const hooksList = (args.hooks || []).map(h => `- ${h}`).join('\n') || '- (no hooks passed)'
      return [
        prelude, banLine,
        `Evaluate the following HOOKS against the selected ROUTES.`,
        `ROUTES:\n${routesList}`,
        `HOOKS:\n${hooksList}`,
        '',
        `Output a Markdown table with rows = hooks and columns = each route.`,
        `Each cell: "score 0–3 | micro-rewrite for fit". Score on: brand truth, mechanic fit, retailer 5s explain, seasonal, distinctiveness.`,
        `After the table:`,
        `- Top cross-route performers (2–4) with one-line why.`,
        `- Per-route winners (2 each) with the micro-rewrite.`,
        `Keep it compact and export-ready.`,
      ].join('\n')
    }

    case 'hookRewrite': {
      const hook = (args.hooks && args.hooks[0]) || ''
      const perBrand = args.target === 'PER_BRAND' && Array.isArray(args.brandTargets) && args.brandTargets.length
      if (perBrand) {
        return [
          prelude, banLine, promoBias,
          `Rewrite and sharpen the HOOK **per brand**: "${hook}".`,
          brandLockNote, seasonalNote, toneNote,
          '',
          `For each brand, return:`,
          `- 2–4 words (brand-coded)`,
          `- Core (5–7 words)`,
          `- Long (8–12 words)`,
          `- Retailer-safe (explicit ask; 5-second staff script alignment)`,
          `- "Do not do" (one caution line if trope risk)`,
          '',
          `Use Markdown with a "## <Brand>" header for each brand, and bold the hooks.`,
        ].join('\n')
      }
      return [
        prelude, banLine, promoBias,
        `Rewrite and sharpen the HOOK: "${hook}".`,
        brandLockNote, seasonalNote, toneNote,
        '',
        `Return these variants (bold the hooks):`,
        `- 2–4 words (brand-coded)`,
        `- Core (5–7 words)`,
        `- Long (8–12 words)`,
        `- Retailer-safe (explicit ask; 5-second staff script alignment)`,
        `- "Do not do" (one caution line if trope risk)`,
      ].join('\n')
    }

    case 'retailerDeck': {
      return [
        prelude,
        `Create a retailer sell-in outline with bullets under:`,
        `- Proposition & shopper tension`,
        `- Mechanics (entry, prize ladder, value)`,
        `- Store impact (display, POS, logistics)`,
        `- Data capture & CRM`,
        `- Media & partners`,
        `- KPIs & proof`,
        `- Compliance/permits (AU)`,
        `Keep crisp and repeatable by a buyer.`,
      ].join('\n')
    }
    case 'prizeLadder': {
      return [
        prelude,
        `Propose 3 prize ladder options (Value-led / Experience-led / Hybrid).`,
        `For each: headline, itemised ladder (qty x value), total value, reasoning, fulfilment notes.`,
      ].join('\n')
    }
    case 'mechanics': {
      return [
        prelude,
        `Outline 4 mechanic variants with: entry path, data collection, draw logic, winner comms, fraud controls, fulfilment, complexity/impact trade-offs.`,
      ].join('\n')
    }
    case 'compliance': {
      return [
        prelude,
        `List permit and compliance considerations for AU by default (ABAC, state permits), privacy/data, fair draw, alcohol/sensitive-category constraints, and T&Cs essentials.`,
      ].join('\n')
    }
    case 'riskProfile': {
      return [
        prelude,
        `Create a risk register: risk, likelihood, impact, mitigation, owner.`,
      ].join('\n')
    }
    case 'custom':
    default: {
      return [prelude, `Produce the requested output with consultant-grade clarity.`].join('\n')
    }
  }
}

// ---------- route ----------
router.post('/ask/outputs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = Body.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

    const { campaignId, type, params, prompt, context } = parsed.data
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, include: { brief: true } })
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' })

    const briefJson: any = (campaign as any)?.brief?.parsedJson || {}
    const brands = Array.isArray(briefJson?.brands) ? briefJson.brands.filter(Boolean) : []
    const bannerName = briefJson?.bannerName || (campaign as any)?.clientName || null

    const meta = {
      market: campaign.market || 'AU',
      category: (campaign as any).category || null,
      timing: campaign.startDate ? new Date(campaign.startDate).toISOString().slice(0,10) : null,
      mode: (campaign.mode as 'EVALUATION'|'CREATE') || 'CREATE',
      clientName: (campaign as any).clientName || null,
      title: campaign.title,
      bannerName,
      brands,
    }

    const { evaluation, ideas, synthesis } = await getLatestOutputs(campaign.id)

    const ctxSource = context?.source || 'evaluation'
    let ctxLabel = 'Evaluation (latest)'
    let ctxText = evaluation || ''
    if (ctxSource === 'synthesis') { ctxLabel = 'Synthesis (latest)'; ctxText = synthesis || evaluation || '' }
    else if (ctxSource === 'createRoute') {
      ctxLabel = `Create Route: ${context?.routeName || ''}`
      const route = pickRoute(ideas, context?.routeName || '')
      if (!route) return res.status(400).json({ error: `Route not found: ${context?.routeName || '(none supplied)'}` })
      ctxText = `### ${route.name}\n${route.body}`
    } else if (ctxSource === 'custom') { ctxLabel = 'Custom Brief'; ctxText = context?.customBrief || '' }

    const dayBucket = new Date().toISOString().slice(0,10)
    const seed = fnv1a32(`${campaign.id}:${type}:${ctxSource}:${dayBucket}`)

    const selectedRoutes = (params?.routes || []).map(nm => {
      const r = pickRoute(ideas, nm); return r ? r : { name: nm, body: '' }
    }).filter(Boolean)

    const brandTargets =
      params?.target === 'PER_BRAND'
        ? (Array.isArray(params?.brands) && params!.brands!.length ? params!.brands! : brands)
        : undefined

    // PromoTrack creation bias for hooks/ideas (so hooks also respect/bend/break smartly)
    const creationGuide =
      (type === 'ideas' || type === 'hooks' || type === 'hookRewrite')
        ? buildCreationGuide(
            {
              ...campaign,
              briefSpec: briefJson,
              nowISO: new Date().toISOString(),
              orientation: 'UNKNOWN',
              timingWindow: null,
              assets: [],
            } as any,
            { ruleFlex: (params?.ruleFlex as RuleFlex) || 'KEEP', intensity: params?.intensity || 'DISRUPTIVE' }
          )
        : undefined

    const instruction = buildInstruction({
      type,
      count: params?.count ?? defaultCount(type),
      intensity: params?.intensity,
      ruleFlex: params?.ruleFlex as RuleFlex | undefined,
      length: params?.length,
      brandLock: params?.brandLock,
      seasonal: params?.seasonal,
      tone: params?.tone,
      target: params?.target,
      brandTargets,
      hooks: type === 'hookEvaluation' ? (params?.hooks || []) : (type === 'hookRewrite' ? [params?.hook || ''] : undefined),
      routes: type === 'hookEvaluation' ? selectedRoutes : undefined,
      contextLabel: ctxLabel,
      contextText: ctxText,
      brand: bannerName || campaign.clientName || null,
      seed,
      creationGuide,
    })

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = []
    messages.push({ role: 'system', content: systemMeta(meta) })
    if (type === 'custom' && prompt) {
      messages.push({ role: 'user', content: `CUSTOM PROMPT:\n${prompt.trim()}` })
    }
    messages.push({ role: 'user', content: instruction })

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: temperatureBy(type, params?.intensity),
      messages,
    })

    const text = (completion.choices?.[0]?.message?.content || '').trim()
    const saved = await prisma.output.create({
      data: {
        campaignId: campaign.id,
        type,
        prompt: instruction,
        params: params ? (params as any) : undefined,
        content: text,
      } as any,
    })

    res.json({ ok: true, output: { id: saved.id, type: saved.type, createdAt: saved.createdAt, content: saved.content } })
  } catch (e) { next(e) }
})

export default router
