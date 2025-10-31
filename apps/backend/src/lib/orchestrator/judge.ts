// apps/backend/src/lib/orchestrator/judge.ts
import { prisma } from '../../db/prisma.js'
import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { renderBriefSnapshot } from '../context.js'
import { runResearch, type ResearchPack, type ResearchLevel } from '../research.js'
import { scoreOffer, type OfferIQ } from '../offeriq.js'
import { resolveModel } from '../models.js'

export type JudgeSeverity = 'BLOCKER' | 'WARN' | 'NIT'

export type JudgeIssue = {
  code: string
  severity: JudgeSeverity
  message: string
  evidence?: string
}

export type JudgeVerdict = {
  kind: 'judge.v1'
  pass: boolean
  score: number // 0–100
  issues: JudgeIssue[]
  flags: string[] // normalised booleans/markers
  recommendations: string[] // short actionable lines
  requiresRegeneration: Array<'framing' | 'evaluation' | 'opinion' | 'export'>
  context: {
    promotionType: string
    assuredMode: 'ASSURED' | 'NON_ASSURED'
    prizeLed: boolean
    totalWinnersFromBrief: number | null
    heroPrizeCountFromBrief: number | null
    majorFriction: boolean
    /** NEW (optional) */
    talkabilityScore?: number // 0–100
    culturalSparkScore?: number // 0–100
    fameFirst?: boolean
    ideaLedOverrideApplied?: boolean
    manyWinnersDetected?: boolean
    badgeValueDetected?: boolean
    socialUGCSignals?: boolean
    calendarFit?: 'STRONG' | 'WEAK' | 'NONE'
  }
  meta?: {
    usedLLM?: boolean
    model?: string
  }
}

/* --------------------------------- helpers -------------------------------- */

function safe(v: any): string {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(safe).filter(Boolean).join(', ')
  try { return JSON.stringify(v) } catch { return String(v) }
}

async function getLatest(campaignId: string, types: string[]): Promise<string> {
  const row = await prisma.output.findFirst({
    where: { campaignId, type: { in: types } },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  })
  return row?.content || ''
}

function detectMajorFriction(ctx: CampaignContext, narratives: string[]): boolean {
  const spec: any = ctx.briefSpec || {}
  const hay = [
    JSON.stringify(spec || {}),
    String(spec?.mechanicOneLiner || ''),
    String(spec?.rawNotes || ''),
    ...narratives.map(n => String(n || ''))
  ].join(' ').toLowerCase()

  const strong = [
    /\bmail[-\s]?in\b|\bpostal\b|\bpostage\b/,
    /\bdownload\s+app\b|\bmobile\s+app\b/,
    /\bmanual\s+(review|validation)\b/,
    /\blong\s+survey\b|\b20\+?\s*questions\b/
  ]
  const accum = [
    /\bregister\b|\bcreate\s+account\b|\bsign[-\s]?up\b/,
    /\b(receipt|proof)\b.*\bupload\b|\bupload\b.*\b(receipt|proof)\b/,
    /\benter\s+code\b|\bbarcode\b|\bupc\b/,
    /\bmultiple\s+purchases\b|\bbuy\s+(?:3|three|\d{2,})\b/,
    /\bprint\b.*\bform\b/,
  ]
  if (strong.some(rx => rx.test(hay))) return true
  const hits = accum.reduce((n, rx) => n + (rx.test(hay) ? 1 : 0), 0)
  if (hits >= 2) return true
  const triggerQty = Number(spec?.gwp?.triggerQty ?? spec?.triggerQty ?? 1)
  return Number.isFinite(triggerQty) && triggerQty >= 3
}

function isAssuredValue(ctx: CampaignContext): boolean {
  // Align with OfferIQ/exports: Cashback is assured; GWP assured only if uncapped/unlimited.
  const spec: any = ctx.briefSpec || {}
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const cashback = !!spec?.cashback
  const gwp = spec?.gwp
  const gwpAssured = (type === 'GWP' || !!gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null)
  return type === 'CASHBACK' || cashback || gwpAssured
}

function getTotalWinnersFromBrief(spec: any): number | null {
  const keys = ['totalWinners','winners','winnerCount','numberOfWinners','totalPrizes','prizeCount','manyWinners']
  for (const k of keys) {
    const v = spec?.[k]
    const n = Number(v)
    if (Number.isFinite(n) && n > 0) return n
    if (typeof v === 'string') {
      const m = v.match(/(\d{2,7})/)
      if (m) return Number(m[1])
    }
  }
  const hay = `${spec?.hook||''} ${spec?.rawNotes||''}`.toLowerCase()
  const m = hay.match(/(\d{2,7})\s*\+?\s*winners/)
  return m ? Number(m[1]) : null
}

function getHeroPrizeCountFromBrief(spec: any): number | null {
  // accept '1', 1, or strings like "3 major prizes"
  const v = spec?.heroPrizeCount ?? spec?.heroPrize ?? null
  if (v == null) return null
  const m = String(v).match(/(\d{1,6})/)
  if (m) {
    const n = Number(m[1])
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

function textIncludes(texts: string[], rx: RegExp): string | null {
  for (const t of texts) if (rx.test(t)) return t
  return null
}

function normaliseScore(issues: JudgeIssue[]): number {
  let score = 100
  for (const is of issues) {
    if (is.severity === 'BLOCKER') score -= 25
    else if (is.severity === 'WARN') score -= 10
    else score -= 3
  }
  if (score < 0) score = 0
  if (score > 100) score = 100
  return score
}

/* ---------- Fame-first / idea-led detection (talkability & culture) -------- */

function detectBadgeValue(text: string): boolean {
  // wearable/collectible merch that confers social or identity signal
  const merch = /\b(ugly\s*(jumper|sweater|vest)|jumper|sweater|vest|hoodie|tee|t-shirt|cap|beanie|scarf|pin|patch|tote|merch|limited[-\s]?edition|drop)\b/i
  return merch.test(text)
}
function detectCalendarFit(text: string): 'STRONG'|'WEAK'|'NONE' {
  const strong = /\b(christmas|xmas|holiday|easter|ramadan|diwali|summer|back[-\s]?to[-\s]?school|black\s*friday|father'?s|mother'?s|valentine|world\s+cup|olympic)\b/i
  const weak = /\b(season|seasonal|calendar|tradition|ritual|annual|festive)\b/i
  if (strong.test(text)) return 'STRONG'
  if (weak.test(text)) return 'WEAK'
  return 'NONE'
}
function detectUGCSignals(text: string): boolean {
  const ugc = /\b(hashtag|#\w+|tag\s+us|post\s+(a|your)|share\s+(a|your)|ugc|selfie|stitch|duet|tiktok|reel|shorts)\b/i
  return ugc.test(text)
}
function computeTalkabilityScore(text: string): number {
  let score = 0
  if (detectBadgeValue(text)) score += 35
  if (detectUGCSignals(text)) score += 25
  if (/\b(weird|ugly|bold|provocative|meme|viral|tongue[-\s]?in[-\s]?cheek|joke|funny)\b/i.test(text)) score += 20
  if (/\b(drop|limited run|limited[-\s]?edition|collectible|exclusive)\b/i.test(text)) score += 10
  if (/\b(shareable|talkable|talkability|buzz)\b/i.test(text)) score += 10
  return Math.max(0, Math.min(100, score))
}
function computeCulturalSparkScore(text: string): number {
  const cal = detectCalendarFit(text)
  let score = 0
  if (cal === 'STRONG') score += 35
  if (cal === 'WEAK') score += 15
  if (/\b(ritual|tradition|in[-\s]?joke|community|fandom|code|signifier|signal)\b/i.test(text)) score += 25
  if (/\b(earned\s+media|pr\s+stunt|talkability)\b/i.test(text)) score += 15
  if (/\b(share|post|tag)\b/i.test(text)) score += 10
  return Math.max(0, Math.min(100, score))
}

/* --------------------------------- main ----------------------------------- */

export async function runJudge(
  ctx: CampaignContext,
  opts?: {
    researchLevel?: ResearchLevel
    baselineResearch?: ResearchPack | null
    // Provide outputs to judge, else they'll be read from DB:
    inputs?: {
      framing?: string
      evaluation?: string
      opinion?: string
      strategist?: string
      exportSummary?: string
    }
    useLLM?: boolean
  }
): Promise<JudgeVerdict> {
  const researchLevel = (opts?.researchLevel ?? (process.env.RESEARCH_LEVEL as ResearchLevel) ?? 'DEEP') as ResearchLevel

  // Pull inputs (explicit or latest from DB)
  const framing = typeof opts?.inputs?.framing === 'string'
    ? opts!.inputs!.framing!
    : await getLatest(ctx.id, ['framingNarrative', 'framing'])

  const evaluation = typeof opts?.inputs?.evaluation === 'string'
    ? opts!.inputs!.evaluation!
    : await getLatest(ctx.id, ['evaluationNarrative', 'evaluation'])

  const opinion = typeof opts?.inputs?.opinion === 'string'
    ? opts!.inputs!.opinion!
    : await getLatest(ctx.id, ['opinionNarrative', 'opinion'])

  const strategistText = typeof opts?.inputs?.strategist === 'string'
    ? opts!.inputs!.strategist!
    : await getLatest(ctx.id, ['strategistNarrative', 'strategist'])

  const exportSummary = typeof opts?.inputs?.exportSummary === 'string'
    ? opts!.inputs!.exportSummary!
    : await getLatest(ctx.id, ['exportNarrative', 'export'])

  // Research + Offer lens
  let research: ResearchPack | null = opts?.baselineResearch ?? null
  if (!research) {
    try { research = await runResearch(ctx, researchLevel) } catch { research = null }
  }

  const offerIQ: OfferIQ = scoreOffer(Object.assign({}, ctx, { research }) as any)
  const assured = isAssuredValue(ctx)

  // Derived flags
  const type = String((ctx.briefSpec as any)?.typeOfPromotion || '').toUpperCase()
  const prizeLed = !assured && (
    type === 'PRIZE' ||
    Boolean((ctx.briefSpec as any)?.heroPrize) ||
    (Array.isArray((ctx.briefSpec as any)?.runnerUps) && (ctx.briefSpec as any).runnerUps.length > 0)
  )
  const totalWinners = getTotalWinnersFromBrief(ctx.briefSpec || {})
  const heroFromBrief = getHeroPrizeCountFromBrief(ctx.briefSpec || {})
  const majorFriction = detectMajorFriction(ctx, [framing, evaluation, opinion, strategistText, exportSummary])

  const issues: JudgeIssue[] = []
  const recommendations: string[] = []
  const requiresRegeneration = new Set<JudgeVerdict['requiresRegeneration'][number]>()

  const allText = [framing, evaluation, opinion, strategistText, exportSummary, renderBriefSnapshot(ctx)].map(safe)
  const haystack = allText.join('\n').toLowerCase()

  /* ---- Fame-first: talkability & cultural spark detection ---- */
  const manyWinnersDetected = typeof totalWinners === 'number' && totalWinners >= 50
  const badgeValueDetected = detectBadgeValue(haystack)
  const socialUGCSignals = detectUGCSignals(haystack)
  const calendarFit = detectCalendarFit(haystack)
  const talkabilityScore = computeTalkabilityScore(haystack)
  const culturalSparkScore = computeCulturalSparkScore(haystack)

  // Fame-first if the idea naturally carries talkability/cultural spark,
  // with many winners OR badge-value merch, and no major friction.
  const fameFirst = (
    (talkabilityScore >= 60 || culturalSparkScore >= 60) &&
    (manyWinnersDetected || badgeValueDetected) &&
    !majorFriction
  )

  /* ---- 1) Prize vs Cashback correctness ---- */
  if (prizeLed) {
    const offender = textIncludes(allText, /\b(cash\s*back|cashback|rebate|claim\s+back|banded\s+cashback|gwp|gift\s+with\s+purchase)\b/i)
    if (offender) {
      issues.push({
        code: 'PRIZE_NOT_CASHBACK',
        severity: 'BLOCKER',
        message: 'Outputs reference cashback/GWP in a prize-led, non-assured brief.',
        evidence: offender.slice(0, 240)
      })
      recommendations.push('Strip cashback/GWP talk. Keep prize shape and winners story only.')
      requiresRegeneration.add('opinion')
    }
  }

  /* ---- 2) Ease/QR chatter unless major friction ---- */
  if (!majorFriction) {
    const offender = textIncludes(allText, /(ease of entry|simple entry|low[-\s]?friction|few steps|frictionless|one[-\s]?screen|ocr\b|scan (the )?qr|qr code|upload a receipt|\bonboarding\b|\bux\b|\bui\b)/i)
    if (offender) {
      issues.push({
        code: 'EASE_CHATTER',
        severity: 'WARN',
        message: 'Ease/QR/fields/OCR mentioned without major friction present.',
        evidence: offender.slice(0, 240)
      })
      recommendations.push('Remove ease-of-entry and QR/fields/OCR chatter unless the brief requires it.')
      requiresRegeneration.add('opinion')
    }
  }

  /* ---- 3) Prize-shape guidance (soft when fame-first) ---- */
  if (prizeLed && !assured) {
    // Old behaviour forced mandates as BLOCKERs. New behaviour:
    // - If fame-first: treat as OPTIONAL overlays (no BLOCKER); suggest tasteful add-ons.
    // - Else: keep as WARN (not BLOCKER) nudges, still recommending best-practice shape.
    const severityWhen = fameFirst ? 'NIT' as JudgeSeverity : 'WARN' as JudgeSeverity

    const prizeText = `${evaluation}\n${opinion}`
    const has3Majors = /increase (the )?major (prizes|prize) to 3/i.test(prizeText) || /3 (major )?prizes/i.test(prizeText)

    const hasInstantConvert = /convert (the )?second[-\s]?tier (prizes|rewards?) (to|into) instant wins/i.test(prizeText) ||
                              /instant wins/i.test(prizeText)

    const hasHookReplace = /(replace|change) (the )?hook/i.test(prizeText)

    if (!has3Majors) {
      issues.push({
        code: fameFirst ? 'PRIZE_SHAPE_MAJORS_OPTIONAL' : 'PRIZE_SHAPE_MAJORS',
        severity: severityWhen,
        message: fameFirst
          ? 'Fame-first detected: 3 majors can be an optional overlay, not mandatory.'
          : 'Consider lifting major prizes to 3 for prize credibility.',
      })
      if (fameFirst) {
        recommendations.push('Optional: add one “Golden Vest” style overlay (single spectacle moment) if budget permits.')
      } else {
        recommendations.push('Recommend: increase major prizes to ~3 to strengthen perceived fairness.')
      }
    }
    if (!hasInstantConvert) {
      issues.push({
        code: fameFirst ? 'PRIZE_SHAPE_INSTANTS_OPTIONAL' : 'PRIZE_SHAPE_INSTANTS',
        severity: severityWhen,
        message: fameFirst
          ? 'Fame-first detected: instant-win conversion is optional; idea already carries participation energy.'
          : 'Consider converting second-tier prizes to instant wins to improve cadence and fairness cues.',
      })
      if (fameFirst) {
        recommendations.push('Optional: sprinkle small “instant shout-out” moments (social stories, crew picks) instead of formal instants.')
      } else {
        recommendations.push('Recommend: convert second-tier to instant wins to improve pace and odds visibility.')
      }
    }
    if (!hasHookReplace) {
      issues.push({
        code: 'HOOK_REPLACE',
        severity: 'NIT',
        message: 'Ensure a short 2–6 word brand-locked hook exists (even if idea-led).',
      })
      recommendations.push('Craft a 2–6 word brand-locked hook; test 2–3 variants.')
    }
  }

  /* ---- 4) Winner count surfaced when large ---- */
  if (typeof totalWinners === 'number' && totalWinners >= 50) {
    const mentionsWinners = new RegExp(`\\b${totalWinners}\\b\\s*winners`, 'i')
    const surfaced = mentionsWinners.test(`${evaluation} ${opinion}`) || /lead with .*winners/i.test(opinion)
    if (!surfaced) {
      issues.push({
        code: 'WINNERS_NOT_SURFACED',
        severity: 'WARN',
        message: `Brief has many winners (${totalWinners.toLocaleString()}) but copy doesn’t lead with it.`
      })
      recommendations.push(`Lead with “${totalWinners.toLocaleString()} winners” in the hook/visual lock-up.`)
      requiresRegeneration.add('opinion')
    }
  }

  /* ---- 5) Research depth sanity (category/retailer/audience/competitors) ---- */
  if (research) {
    const wantAudience = 3
    const wantCategory = 3
    const wantRetailers = 2
    const wantCompetitorPromos = prizeLed ? 5 : 3

    const audFacts = research.audience?.facts?.length || 0
    const catFacts = research.category?.facts?.length || 0
    const retFacts = research.retailers?.facts?.length || 0
    const compPromos = research.competitors?.promos?.length || 0

    if (audFacts < wantAudience) {
      issues.push({ code: 'RESEARCH_AUDIENCE_LIGHT', severity: 'WARN', message: `Audience facts are light (${audFacts}/${wantAudience}).` })
      recommendations.push('Deepen audience signals (AU shopper, channel nuances, category drivers).')
      requiresRegeneration.add('evaluation'); requiresRegeneration.add('opinion')
    }
    if (catFacts < wantCategory) {
      issues.push({ code: 'RESEARCH_CATEGORY_LIGHT', severity: 'WARN', message: `Category facts are light (${catFacts}/${wantCategory}).` })
      recommendations.push('Add current category cues and promotional norms.')
      requiresRegeneration.add('evaluation'); requiresRegeneration.add('opinion')
    }
    if (retFacts < wantRetailers) {
      issues.push({ code: 'RESEARCH_RETAILERS_LIGHT', severity: 'NIT', message: `Retailer facts are light (${retFacts}/${wantRetailers}).` })
      recommendations.push('Add retailer expectations and past promo motifs.')
    }
    if (compPromos < wantCompetitorPromos) {
      issues.push({ code: 'RESEARCH_COMPETITORS_LIGHT', severity: 'WARN', message: `Competitor promos collected are light (${compPromos}/${wantCompetitorPromos}).` })
      recommendations.push('Scan more live promos; capture hero counts, cadence, and winner volumes.')
      requiresRegeneration.add('evaluation'); requiresRegeneration.add('opinion')
    }
  } else {
    issues.push({ code: 'RESEARCH_MISSING', severity: 'WARN', message: 'Research pack missing; cannot benchmark norms.' })
    recommendations.push('Run research at DEEP/MAX and re-score OfferIQ.')
  }

  /* ---- 6) OfferIQ adequacy alignment ---- */
  if (offerIQ?.verdict === 'NO-GO' || (offerIQ?.hardFlags || []).includes('INADEQUATE_VALUE')) {
    const msg = offerIQ?.lenses?.adequacy?.fix
      ? `Offer inadequate. ${offerIQ.lenses.adequacy.fix}`
      : 'Offer inadequate for category; specify a value change.'
    issues.push({ code: 'OFFER_INADEQUATE', severity: 'BLOCKER', message: msg })
    recommendations.push('Reflect OfferIQ value change in Risk with explicit “Change-from → Change-to”.')
    requiresRegeneration.add('opinion')
  }

/* ---- 7) Optional LLM judge (strict JSON) ---- */

// ...

let usedLLM = false
let judgeModelUsed: string | null = null
if (opts?.useLLM) {
  usedLLM = true
  const model = resolveModel(process.env.MODEL_JUDGE, process.env.MODEL_DEFAULT, 'gpt-4o-mini')
  judgeModelUsed = model
  const sys = [
    'You are a strict promotion copy auditor.',
    'Output ONLY valid JSON. No markdown. No prose.',
    'Never invent facts. Only flag patterns present in the provided text.',
    'Schema: {"flags": string[], "llm_issues":[{"code": string, "severity":"BLOCKER"|"WARN"|"NIT", "message": string, "evidence?": string}], "notes": string[] }'
  ].join(' ')
  const user = [
    `PromotionType: ${type || 'UNKNOWN'} | Assured: ${assured ? 'YES' : 'NO'} | PrizeLed: ${prizeLed ? 'YES' : 'NO'} | MajorFriction: ${majorFriction ? 'YES' : 'NO'}`,
    `TotalWinnersFromBrief: ${totalWinners ?? 'n/a'} | HeroPrizeCountFromBrief: ${heroFromBrief ?? 'n/a'}`,
    '',
    'BRIEF SNAPSHOT:',
    renderBriefSnapshot(ctx),
    '',
    'FRAMING:',
    framing || '_none_',
    '',
    'EVALUATION:',
    evaluation || '_none_',
    '',
  'OPINION:',
  opinion || '_none_',
  '',
  'STRATEGIST:',
  strategistText || '_none_',
  '',
  'EXPORT:',
  exportSummary || '_none_',
    '',
    'Checklist (binary):',
    '- If prize-led and NOT assured, any cashback/GWP talk is a BLOCKER.',
    '- Do NOT talk about ease/QR/fields/OCR unless there is major friction.',
    '- Prize-led must include: (a) many-winner story OR (b) alt fame driver. Avoid hard-coding “3 majors”.',
    '- If many winners (>=50), surface that number in copy.',
    '- No audience segmentation boilerplate.',
    'Return JSON only.'
  ].join('\n')

  try {
    const raw = await chat({
      model,
      system: sys,
      messages: [{ role: 'user', content: user }],
      json: true,
      temperature: 0,
      top_p: 1,
      max_output_tokens: 600,
      meta: { scope: 'judge.audit', campaignId: ctx.id },
    })
    const parsed = JSON.parse(raw || '{}')
    const llmIssues: JudgeIssue[] = Array.isArray(parsed?.llm_issues)
      ? parsed.llm_issues.map((x: any) => ({
          code: String(x?.code || 'LLM_ISSUE'),
          severity: (['BLOCKER','WARN','NIT'].includes(String(x?.severity)) ? String(x.severity) : 'WARN') as JudgeSeverity,
          message: String(x?.message || ''),
          evidence: x?.evidence ? String(x.evidence) : undefined
        })).filter((issue: JudgeIssue) => Boolean(issue.message))
      : []
    issues.push(...llmIssues)
  } catch {
    // Ignore LLM failures; deterministic checks remain.
  }
}

  /* ---- Finalise verdict ---- */
  const score = normaliseScore(issues)
  const pass = !issues.some((issue) => issue.severity === 'BLOCKER') && score >= 70

  const verdict: JudgeVerdict = {
    kind: 'judge.v1',
    pass,
    score,
    issues,
    flags: [
      `TYPE_${type || 'UNKNOWN'}`,
      assured ? 'ASSURED' : 'NON_ASSURED',
      prizeLed ? 'PRIZE_LED' : 'NOT_PRIZE_LED',
      majorFriction ? 'MAJOR_FRICTION' : 'NO_MAJOR_FRICTION',
      manyWinnersDetected ? 'MANY_WINNERS' : 'FEW_WINNERS',
      fameFirst ? 'FAME_FIRST' : 'NOT_FAME_FIRST',
      badgeValueDetected ? 'BADGE_VALUE' : 'NO_BADGE_VALUE',
      socialUGCSignals ? 'UGC_SIGNALS' : 'NO_UGC_SIGNALS',
      `CAL_${calendarFit || 'NONE'}`
    ],
    recommendations: Array.from(new Set(recommendations)).slice(0, 12),
    requiresRegeneration: Array.from(requiresRegeneration),
    context: {
      promotionType: type || 'UNKNOWN',
      assuredMode: assured ? 'ASSURED' : 'NON_ASSURED',
      prizeLed,
      totalWinnersFromBrief: totalWinners,
      heroPrizeCountFromBrief: heroFromBrief,
      majorFriction,
      talkabilityScore,
      culturalSparkScore,
      fameFirst,
      ideaLedOverrideApplied: fameFirst, // for consumers that want an explicit toggle
      manyWinnersDetected,
      badgeValueDetected,
    socialUGCSignals,
    calendarFit
  },
  meta: usedLLM ? { usedLLM: true, model: judgeModelUsed || undefined } : undefined
}

  return verdict
}
