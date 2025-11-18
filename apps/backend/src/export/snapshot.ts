import { prisma } from '../db/prisma.js'
import { buildCampaignContext, renderBriefSnapshot } from '../lib/context.js'
import { extractFramingMeta } from '../lib/orchestrator/framing.js'
import { normalizeText, sanitizeFraming, tidyText, scrubEase, preferredBrand, uniqLines, includesAny } from './utils.js'
import { applyResearchOverrides, readResearchOverridesFromBrief } from '../lib/war-room-research.js'
import type { ExportSections, ExportSnapshot, NarrativeBlock } from './types.js'

type NarrativeParams = {
  content: string
  meta?: any
  params?: any
  raw: string
  sanitized: string
}

type NarrativeExtraction = {
  content: string
  raw: string
  sanitized: string
  meta?: any
  params?: any
}

export async function collectExportSnapshot(campaignId: string, sections: ExportSections): Promise<ExportSnapshot & {
  evaluationMeta?: any
  opinionMeta?: any
  hooksTop: string[]
  extrasAll: Array<{ type: string; title: string; content: string }>
  champion: { name: string; hooks: string[]; mechanic?: string } | null
}> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      brief: true,
      outputs: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!campaign) {
    throw Object.assign(new Error('Campaign not found'), { status: 404 })
  }

  const ctx = buildCampaignContext(campaign)

  const { outputs = [] } = campaign
  const pickLatestByTypes = (aliases: string[]) =>
    outputs.find(o => aliases.includes(o.type))

  const framingOut = pickLatestByTypes(['framingNarrative', 'framing'])
  const evaluationOut = pickLatestByTypes(['evaluationNarrative', 'evaluation'])
  const ideasOut = pickLatestByTypes(['ideaRoutes', 'ideas'])
  const synthesisOut = pickLatestByTypes(['synthesisNarrative', 'synthesis'])
  const opinionOut = pickLatestByTypes(['opinionNarrative', 'opinion'])
  const strategistOut = pickLatestByTypes(['strategistNarrative', 'strategist'])
  const ideationUnboxedOut = pickLatestByTypes(['ideationUnboxed'])
  const ideationHarnessOut = pickLatestByTypes(['ideationHarness'])

  const framing = extractNarrative(framingOut, (value) => sanitizeFraming(tidyText(value)))
  const evaluation = extractNarrative(evaluationOut, (value) => scrubEase(tidyText(value)))
  const ideas = extractNarrative(ideasOut, tidyText)
  const synthesis = extractNarrative(synthesisOut, (value) => scrubEase(tidyText(value)))
  const opinion = extractNarrative(opinionOut, (value) => scrubEase(tidyText(value)))
  const strategist = extractNarrative(strategistOut, (value) => scrubEase(tidyText(value)))
  const ideationUnboxed = ideationUnboxedOut ? safeJson(ideationUnboxedOut.content) || [] : []
  const ideationHarness = ideationHarnessOut ? safeJson(ideationHarnessOut.content) || null : null

  const researchOverrides = readResearchOverridesFromBrief(campaign.brief)
  const framingMetaRaw = framingOut ? extractFramingMeta(framingOut) : null
  const framingMeta = framingMetaRaw
    ? { ...framingMetaRaw, research: applyResearchOverrides(framingMetaRaw.research ?? null, researchOverrides) || framingMetaRaw.research || null }
    : null

  const evaluationMeta = evaluation.meta || evaluation.params?.meta || evaluation.params?.result?.meta || null
  const opinionMeta = opinion.meta || opinion.params?.meta || opinion.params?.result?.meta || null
  const strategistMeta = strategist.meta || strategist.params?.meta || strategist.params?.result?.meta || null

  const evaluationResearchBase = evaluationMeta?.ui?.research || evaluationMeta?.research || null
  const researchData =
    applyResearchOverrides(evaluationResearchBase || framingMeta?.research || null, researchOverrides) ||
    framingMeta?.research ||
    null
  if (evaluationMeta) {
    if (!evaluationMeta.ui) evaluationMeta.ui = {}
    evaluationMeta.ui.research = researchData
    evaluationMeta.research = researchData
  }

  const benchmarks = evaluationMeta?.ui?.benchmarks || evaluationMeta?.benchmarks || null
  const evalOfferIQ = evaluationMeta?.ui?.offerIQ || null
  const opinionOfferIQ = opinionMeta?.offerIQ || null
  const offerIQ = evalOfferIQ || opinionOfferIQ || null

  const allExtras = outputs.filter((o) =>
    ['hooks', 'retailerDeck', 'prizeLadder', 'mechanics', 'compliance', 'riskProfile', 'custom'].includes(o.type)
  ).map(o => ({
    type: o.type,
    title: typeof (o as any).title === 'string' && (o as any).title.trim()
      ? String((o as any).title)
      : o.type,
    content: o.content || '',
  }))

  const ideasParsed = parseIdeas(ideas.raw)
  const champion = deriveChampionFromSynthesis(synthesis.raw, ideasParsed)
  const hooksTop = pickHooksStrict({
    brand: preferredBrand(ctx) || '',
    champion,
    evaluationProse: evaluation.raw,
    synthesisProse: synthesis.raw,
    extras: allExtras,
  })

  const briefSnapshot = renderBriefSnapshot(ctx)

  const sparkSeed = (campaign.brief?.assets as any)?.__spark || null

  const snapshot: ExportSnapshot & {
    evaluationMeta?: any
    opinionMeta?: any
    hooksTop: string[]
    extrasAll: Array<{ type: string; title: string; content: string }>
    champion: { name: string; hooks: string[]; mechanic?: string } | null
  } = {
    campaign: {
      id: campaign.id,
      title: campaign.title,
      clientName: campaign.clientName,
      market: campaign.market,
      category: campaign.category,
      mode: campaign.mode,
      status: campaign.status,
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
      startDate: campaign.startDate ?? null,
      endDate: campaign.endDate ?? null,
    },
    context: ctx,
    brief: {
      snapshot: briefSnapshot,
      rawText: campaign.brief?.rawText || '',
    },
    narratives: {
      framing: framingOut ? framing : undefined,
      evaluation: evaluationOut ? evaluation : undefined,
      synthesis: synthesisOut ? synthesis : undefined,
      ideas: ideasOut ? {
        ...ideas,
        parsed: ideasParsed,
        champion,
        hooksTop,
      } : undefined,
      opinion: opinionOut ? opinion : undefined,
      strategist: strategistOut ? strategist : undefined,
    },
    ideation: ideationUnboxedOut || ideationHarnessOut ? {
      unboxed: Array.isArray(ideationUnboxed) ? ideationUnboxed : [],
      harness: ideationHarness,
    } : undefined,
    extras: allExtras,
    offerIQ,
    research: researchData,
    benchmarks,
    framingMeta,
    judgeInputs: {
      framing: framing.raw,
      evaluation: evaluation.raw,
      opinion: opinion.raw,
      strategist: strategist.raw,
    },
    evaluationMeta,
    opinionMeta,
    hooksTop,
    extrasAll: allExtras,
    champion,
  }

  // attach full meta to narratives for convenience
  if (snapshot.narratives.framing && framingMeta) {
    snapshot.narratives.framing.metaFull = framingMeta
  }
  if (snapshot.narratives.evaluation) {
    snapshot.narratives.evaluation.meta = evaluationMeta
    snapshot.narratives.evaluation.ui = evaluationMeta?.ui
    snapshot.narratives.evaluation.hookWhy = evaluationMeta?.hook_why_change || null
    snapshot.narratives.evaluation.propositionHint = evaluationMeta?.proposition_hint || null
    snapshot.narratives.evaluation.runAgainMoves = Array.isArray(evaluationMeta?.run_again_moves) ? evaluationMeta.run_again_moves : []
    snapshot.narratives.evaluation.symbolism = evaluationMeta?.symbolism || null
    snapshot.narratives.evaluation.trade = evaluationMeta?.ui?.trade || null
  }
  if (snapshot.narratives.opinion) {
    snapshot.narratives.opinion.meta = opinionMeta
  }
  if (snapshot.narratives.strategist) {
    snapshot.narratives.strategist.meta = strategistMeta
  }

  ;(snapshot as any).spark = sparkSeed

  return snapshot
}

function extractNarrative(source: any, sanitize: (value: string) => string): NarrativeExtraction {
  if (!source) {
    return { content: '', raw: '', sanitized: '', meta: null, params: null }
  }

  const params = safeJson(source.params) || (typeof source.params === 'object' ? source.params : null)
  const result =
    (source?.result && typeof source.result === 'object') ? source.result :
    (params && typeof params === 'object' && params.result && typeof params.result === 'object') ? params.result :
    null

  const content = String(
    source?.content ??
    (result ? result.content : undefined) ??
    (params ? (params.content || params.narrative) : '')
  )

  const metaCandidate =
    safeJson(source?.meta) ??
    (result && result.meta ? result.meta : null) ??
    (params && params.meta ? params.meta : null) ??
    (looksMetaLike(params) ? params : null)

  const meta = (metaCandidate && typeof metaCandidate === 'object') ? metaCandidate : null

  return {
    content,
    raw: content,
    sanitized: sanitize(content),
    meta,
    params,
  }
}

function safeJson(value: any): any {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return null
  }
}

function looksMetaLike(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false
  return Boolean(
    obj.scoreboard ||
    obj.ui ||
    obj.kind === 'eval-prose-au' ||
    obj.hook_why_change ||
    obj.symbolism ||
    obj.run_again_moves ||
    obj.kind === 'opinion.v1'
  )
}

function pickHooksStrict(opts: {
  brand: string
  champion: { name: string; hooks: string[]; mechanic?: string } | null
  evaluationProse: string
  synthesisProse: string
  extras: Array<{ type: string; content: string }>
}): string[] {
  const { brand, champion, extras } = opts
  const fromChampion = cleanHooks(champion?.hooks || [], brand)
  if (fromChampion.length) return fromChampion.slice(0, 3)

  const hooksExtra = [...extras].filter(x => x.type === 'hooks').slice(0, 1)[0]
  const fromExtra = hooksExtra?.content ? cleanHooks(hooksExtra.content.split(/\r?\n/), brand) : []
  if (fromExtra.length) return fromExtra.slice(0, 3)

  return []
}

function cleanHooks(lines: any[], brand: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const rawLine of lines || []) {
    let s = String(rawLine || '')
      .replace(/^[\-\*\d\.\)\s]+/g, '')
      .replace(/^["“”'’]+|["“”'’]+$/g, '')
      .replace(/[.?!,:;]+$/g, '')
      .trim()
    if (!s) continue
    const words = s.split(/\s+/)
    if (words.length < 2 || words.length > 8) continue
    if (brand && !s.toLowerCase().includes(brand.toLowerCase())) {
      if (words.length <= 8) s = `${s} — ${brand}`
    }
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= 5) break
  }
  return out
}

function parseIdeas(text: string): Array<{
  name: string
  hook?: string
  altHook?: string
  brandLens?: string
  platformIdea?: string
  signatureMoment?: string
  mechanic?: string
  valueExchange?: string
  prizeArch?: string
  freqLoop?: string
  retailerStory?: string
  kpis?: string
  risks?: string
  compliance?: string
  whyNow?: string
  seasonal?: string
}> {
  if (!text) return []
  const blocks = text.split(/^###\s+/m).filter(Boolean)
  const routes: Array<any> = []
  for (const block of blocks) {
    const [headLine, ...rest] = block.split('\n')
    const name = (headLine || '').split('—')[0].trim()
    const body = rest.join('\n')
    const get = (rx: RegExp) => matchLine(body, rx)

    routes.push({
      name,
      hook: get(/^Hook(?:\s*\(.*\))?\s*:\s*(.+)$/im),
      altHook: get(/^Alt hook\s*:\s*(.+)$/im),
      brandLens: get(/^(?:Brand lens|Brand truth|Brand lens \(truth, tension, codes\))\s*:\s*(.+)$/im),
      platformIdea: get(/^(?:Platform idea|Idea|Platform)\s*:\s*(.+)$/im),
      signatureMoment: get(/^(?:Signature activation moment|Signature moment)\s*:\s*(.+)$/im),
      mechanic: get(/^(?:Core mechanic|Mechanic(?:\s*\(.*\))?)\s*:\s*(.+)$/im),
      valueExchange: get(/^(?:Value exchange|Value)\s*:\s*(.+)$/im),
      prizeArch: get(/^(?:Prize\s*\/\s*Value architecture|Prize\s*\/\s*Value math|Prize(?:s)?|Value architecture)\s*:\s*(.+)$/im),
      freqLoop: get(/^(?:Frequency loop|Frequency)\s*:\s*(.+)$/im),
      retailerStory: get(/^(?:Retailer story|Retailer)\s*:\s*(.+)$/im),
      kpis: get(/^KPIs?\s*:\s*(.+)$/im),
      risks: get(/^(?:Risks\s*&\s*mitigations|Risks(?: &| and) mitigations)\s*:\s*(.+)$/im),
      compliance: get(/^Compliance\s*:\s*(.+)$/im),
      whyNow: get(/^(?:Why (?:it is )?right for this brand now)\s*:\s*(.+)$/im),
      seasonal: get(/^Seasonal variant\s*:\s*(.+)$/im),
    })
  }
  return routes
}

function deriveChampionFromSynthesis(synthesis: string, ideas: ReturnType<typeof parseIdeas>) {
  if (!synthesis || !ideas.length) return null
  const hooks: string[] = []
  scrapeHookLines(synthesis, hooks)
  if (!hooks.length) scrapeQuotedHooks(synthesis, hooks)

  if (hooks.length) {
    const target = normalizeText(hooks[0]).toLowerCase()
    const found = ideas.find(r =>
      (r.hook && normalizeText(r.hook).toLowerCase().includes(target)) ||
      (r.altHook && normalizeText(r.altHook).toLowerCase().includes(target))
    )
    if (found) {
      return {
        name: found.name,
        hooks: [found.hook, found.altHook].filter(Boolean) as string[],
        mechanic: found.mechanic || '',
      }
    }
  }

  for (const idea of ideas) {
    const nm = normalizeText(idea.name).toLowerCase()
    if (nm.length > 3 && synthesis.toLowerCase().includes(nm)) {
      return {
        name: idea.name,
        hooks: [idea.hook, idea.altHook].filter(Boolean) as string[],
        mechanic: idea.mechanic || '',
      }
    }
  }
  return null
}

function matchLine(text: string, rx: RegExp): string | undefined {
  const match = rx.exec(text)
  return match ? match[1].trim() : undefined
}

function scrapeQuotedHooks(text: string, out: string[]) {
  if (!text) return
  const rx = /["“”]([^"“”]{2,100})["“”]/g
  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) out.push(m[1])
}

function scrapeHookLines(text: string, out: string[]) {
  if (!text) return
  const rx = /^(?:Hook(?:\s*\(.*\))?:)\s*(.+)$/gim
  let m: RegExpExecArray | null
  while ((m = rx.exec(text)) !== null) out.push(m[1].trim())
}
