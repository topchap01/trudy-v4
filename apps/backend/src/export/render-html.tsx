import type { ExportSections, ExportTheme, ExportSnapshot } from './types.js'
import { markdownToHtml } from './markdown.js'
import { escapeHtml, preferredBrand } from './utils.js'

type SnapshotRich = ExportSnapshot & {
  evaluationMeta?: any
  opinionMeta?: any
  hooksTop: string[]
  extrasAll: Array<{ type: string; title: string; content: string }>
  champion: { name: string; hooks: string[]; mechanic?: string } | null
  research?: any
  benchmarks?: any
}

export type RenderOptionsRuntime = {
  sections: ExportSections
  theme?: ExportTheme
  judgeVerdict: any
  timestamp?: string
  mode?: 'BRIEFED' | 'IMPROVE' | 'REBOOT'
}

export type SummaryModel = {
  meta: {
    campaignId: string
    campaignTitle: string
    brand: string
    documentTitle: string
    timestamp: string
    accent: string
    chips: string[]
  }
  sections: Array<{ id: string; title: string; html: string }>
  governance: { blockers: string[]; warnings: string[] }
  references: { rider: any }
  copyBlocks: string[]
  ideation?: {
    unboxed: Array<{ agent: string; ideas: any[] }>
    harness: any
  }
}

const NARRATIVE_SEGUE_TERMS = [
  'Firstly',
  'Secondly',
  'Thirdly',
  'Fourthly',
  'Fifthly',
  'Finally',
  'Next',
  'Additionally',
  'Also',
  'Meanwhile',
  'Overall',
  'Recommendation',
  'Recommendations',
  'Verdict',
  'Decision',
  'Hook upgrade',
  'Hook path',
  'Hook strategy',
  'Fix it',
  'Fix this',
  'The fix',
  'Fix',
  'Outcome',
  'Opportunity',
  'Concern',
  'Priority',
  'Guardrail',
  'Retail reality',
  'Retailer reality',
  'Shopper reality',
  'Shopper insight',
  'Retailer insight',
  'Shopper tension',
  'Measurement',
  'Action',
  'Where it breaks',
  'What to fix',
  'What to keep',
  'Stretch',
  'Tighten',
  'Why it works',
  'Signal',
  'Implication',
  'In this moment',
  'To tighten',
  'To stretch',
  'To improve',
  'Scenario',
  'Summary',
  'Next steps',
  'Hook options',
  'Recommended hooks',
]

const NARRATIVE_SEGUE_PATTERN = NARRATIVE_SEGUE_TERMS.map((term) => term.trim().replace(/\s+/g, '\\s+')).join('|')
const ARTICLE_PREFIX_PATTERN_SRC = '(?:A|An|The)\\s+'
const SEGMENT_SPLIT_REGEX =
  NARRATIVE_SEGUE_PATTERN.length > 0
    ? new RegExp(`(?=\\b(?:${ARTICLE_PREFIX_PATTERN_SRC})?(?:${NARRATIVE_SEGUE_PATTERN})\\b)`, 'gi')
    : null
const SEGUE_PREFIX_REGEX =
  NARRATIVE_SEGUE_PATTERN.length > 0
    ? new RegExp(
        `^(((?:${ARTICLE_PREFIX_PATTERN_SRC})?(?:${NARRATIVE_SEGUE_PATTERN}))|\\d+\\.|\\(?\\d+\\)|[A-Z]\\))\\b`,
        'i'
      )
    : new RegExp('^(\\d+\\.|\\(?\\d+\\)|[A-Z]\\))\\b', 'i')
const SEGUE_PUNCTUATION_REGEX = /^[\\s,.;:—–-]+/

export function renderExportHtml(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const model = buildSummaryModel(snapshot, opts)
  const html = buildHtmlDocument(model)
  return {
    html,
    title: model.meta.documentTitle,
    accent: model.meta.accent,
    model,
  }
}

const MODE_LABELS: Record<'BRIEFED' | 'IMPROVE' | 'REBOOT', string> = {
  BRIEFED: 'Review as briefed',
  IMPROVE: 'Sharpen with improvements',
  REBOOT: 'Reboot with alternatives',
}

function buildSummaryModel(snapshot: SnapshotRich, opts: RenderOptionsRuntime): SummaryModel {
  const brand = preferredBrand(snapshot.context) || snapshot.campaign.clientName || snapshot.campaign.title
  const documentTitle = `${brand} — ${snapshot.campaign.title}`
  const timestamp = opts.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19)
  const accent = opts.theme?.accent || '#0ea5e9'
  const chips: string[] = []
  if (opts.judgeVerdict?.score != null) chips.push(`Judge ${opts.judgeVerdict.score}/100`)
  if (snapshot.offerIQ?.verdict) chips.push(`OfferIQ ${snapshot.offerIQ.verdict}`)
  if (opts.mode && MODE_LABELS[opts.mode]) chips.push(MODE_LABELS[opts.mode])

  const sections = buildSections(snapshot, opts)
  const rider = extractSynthesisRider(snapshot.narratives.synthesis?.raw || '')
  const copyBlocks = buildCopyBlocks(snapshot, rider)

  return {
    meta: {
      campaignId: snapshot.campaign.id,
      campaignTitle: snapshot.campaign.title,
      brand,
      documentTitle,
      timestamp,
      accent,
      chips,
    },
    sections,
    governance: { blockers: [], warnings: [] },
    references: { rider },
    copyBlocks,
    ideation: snapshot.ideation,
  }
}

function buildSections(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  if (opts.mode && MODE_LABELS[opts.mode]) {
    return [
      {
        id: 'one-pager',
        title: MODE_LABELS[opts.mode],
        html: renderOnePager(snapshot, opts),
      },
    ]
  }

  const sections: Array<{ id: string; title: string; html: string }> = []
  const add = (id: string, title: string, html: string) => {
    if (!html) return
    sections.push({ id, title, html })
  }

  add('marks-view', 'Mark’s View', renderMarksViewSection(snapshot, opts))
  add('synthesis', 'Executive Synthesis', renderMarkdownBlock(snapshot.narratives.synthesis?.sanitized || snapshot.narratives.synthesis?.raw))
  add('ideation', 'Creative Sparks', renderIdeationSection(snapshot))
  add('evaluation', 'Evaluation Highlights', renderEvaluationSection(snapshot, opts))
  add('strategist', 'Strategist Scenarios', renderStrategistSection(snapshot))
  add('research', 'Research Signals', renderResearchSection(snapshot))
  add('brief', 'Brief Snapshot', renderBriefSection(snapshot))
  return sections
}

function renderBriefSection(snapshot: SnapshotRich) {
  const html = snapshot.brief?.snapshot ? markdownToHtml(snapshot.brief.snapshot) : '<p>No brief snapshot saved.</p>'
  return html
}

function renderOnePager(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const ctx = buildLensContext(snapshot, opts)
  if (!opts.mode || opts.mode === 'BRIEFED') {
    return renderReviewAsBriefed(ctx)
  }
  if (opts.mode === 'IMPROVE') {
    return renderSharpenWithImprovements(ctx)
  }
  if (opts.mode === 'REBOOT') {
    return renderRebootWithAlternatives(ctx)
  }
  return renderReviewAsBriefed(ctx)
}

function renderMarksViewSection(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const ctx = buildLensContext(snapshot, opts)
  const chapters = [
    {
      id: 'review',
      title: 'Review as briefed',
      eyebrow: 'Read it exactly as briefed',
      html: renderReviewAsBriefed(ctx),
    },
    {
      id: 'sharpen',
      title: 'Sharpen with improvements',
      eyebrow: 'Tighten the existing route',
      html: renderSharpenWithImprovements(ctx),
    },
    {
      id: 'reboot',
      title: 'Reboot with alternatives',
      eyebrow: 'Pitch the bolder reroute',
      html: renderRebootWithAlternatives(ctx),
    },
  ].filter((chapter) => chapter.html && chapter.html.trim().length > 0)

  if (!chapters.length) return ''

  return `<div class="marks-view">
    ${chapters
      .map(
        (chapter) => `<article class="marks-chapter" data-chapter="${chapter.id}">
        <header class="marks-chapter__head">
          <div class="chapter-eyebrow">${escapeHtml(chapter.eyebrow)}</div>
          <h3>${escapeHtml(chapter.title)}</h3>
        </header>
        <div class="marks-chapter__body">
          ${chapter.html}
        </div>
      </article>`
      )
      .join('')}
  </div>`
}

type ScoreEntry = {
  label: string
  status: string
  why: string
  fix: string
}

type LensContext = {
  brand: string
  campaign: string
  category: string
  briefHook: string
  shopperTension: string
  brandTruth: string
  retailerReality: string
  measurement: string
  verdict: string
  offerIq: string | null
  judgeScore: number | null
  judgeVerdict: string | null
  judgeFlags: string[]
  scoreboard: ScoreEntry[]
  positives: string[]
  watchouts: string[]
  fixes: string[]
  runAgainMoves: string[]
  strategistHighlights: string[]
  founderNotes: string[]
  researchSignals: string[]
  harness: any
  harnessPoint: string
  harnessMove: string
  harnessRetailerLine: string
  harnessOdds: string
  harnessLegal: string
  altHooks: string[]
  altIdeasDetailed: { hook: string; agent?: string; tier?: string; what?: string }[]
  guardrails: string[]
}

function buildLensContext(snapshot: SnapshotRich, opts: RenderOptionsRuntime): LensContext {
  const spec: Record<string, any> = snapshot.context?.briefSpec || {}
  const brand = preferredBrand(snapshot.context) || snapshot.campaign.clientName || snapshot.campaign.title || ''
  const campaign = snapshot.campaign.title || 'Campaign'
  const category = snapshot.context.category || snapshot.context.briefSpec?.category || ''
  const dossier = snapshot.research?.dossier || {}
  const firstNonEmpty = (...candidates: any[]) => {
    for (const candidate of candidates) {
      const text = cleanText(candidate)
      if (text) return text
    }
    return ''
  }
  const firstText = (arr?: Array<{ text?: string }>) =>
    Array.isArray(arr) && arr.length ? String(arr[0]?.text || '').trim() : ''
  const shopperTensionRaw =
    firstText(dossier.shopperTensions) ||
    firstText(snapshot.research?.audience?.facts) ||
    snapshot.narratives.evaluation?.hookWhy ||
    ''
  const brandTruthRaw =
    firstText(dossier.brandTruths) ||
    firstText(snapshot.research?.brand?.facts) ||
    ''
  const retailerRealityRaw =
    firstText(dossier.retailerReality) ||
    firstText(snapshot.research?.retailers?.facts) ||
    ''
  const measurementRaw =
    snapshot.narratives.evaluation?.meta?.ui?.measurement ||
    snapshot.narratives.evaluation?.meta?.measurement ||
    snapshot.narratives.evaluation?.meta?.scoreboard?.measurement ||
    ''
  const briefHookRaw = firstNonEmpty(
    spec?.mechanicOneLiner,
    spec?.hook,
    spec?.promotionHeadline,
    spec?.entryMechanic,
    spec?.proposition,
    spec?.campaignHeadline,
    spec?.mechanic,
    snapshot.narratives.framing?.sanitized?.split('\n')?.[0],
    Array.isArray(snapshot.hooksTop) && snapshot.hooksTop.length ? snapshot.hooksTop[0] : '',
    snapshot.ideation?.harness?.selectedHook
  )
  const shopperTension = cleanText(shopperTensionRaw)
  const brandTruth = cleanText(brandTruthRaw)
  const retailerReality = cleanText(retailerRealityRaw)
  const measurement = cleanText(measurementRaw)
  const briefHook = cleanText(briefHookRaw)

  const scoreboardRaw = snapshot.narratives.evaluation?.meta?.scoreboard || snapshot.evaluationMeta?.scoreboard || null
  const scoreboardEntries = extractScoreboardEntries(scoreboardRaw)
  const positives = scoreboardEntries
    .filter((entry) => isPositiveStatus(entry.status) && entry.why)
    .map((entry) => {
      const why = cleanText(entry.why)
      return why ? `${entry.label}: ${why}` : ''
    })
    .filter(Boolean)
  const watchouts = scoreboardEntries
    .filter((entry) => !isPositiveStatus(entry.status))
    .map((entry) => {
      const reason = cleanText(entry.why) || cleanText(entry.fix) || 'Needs attention'
      return reason ? `${entry.label}: ${reason}` : ''
    })
    .filter(Boolean)
  const fixes = scoreboardEntries
    .filter((entry) => !isPositiveStatus(entry.status) && entry.fix)
    .map((entry) => {
      const fix = cleanText(entry.fix)
      return fix ? `${entry.label}: ${fix}` : ''
    })
    .filter(Boolean)

  const runAgainMoves = Array.isArray(snapshot.narratives.evaluation?.runAgainMoves)
    ? snapshot.narratives.evaluation?.runAgainMoves.filter(Boolean).map(cleanText)
    : []
  const runAgainMovesFiltered = filterBrandAligned(runAgainMoves, brand)

  const judgeScore = typeof opts.judgeVerdict?.score === 'number' ? Number(opts.judgeVerdict.score) : null
  const judgeVerdict = opts.judgeVerdict?.verdict ? String(opts.judgeVerdict.verdict) : null
  const judgeFlags = Array.isArray(opts.judgeVerdict?.flags)
    ? opts.judgeVerdict.flags
        .map((flag: any) => cleanText(String(flag?.message || flag?.code || flag || '')))
        .filter(Boolean)
    : []

  const strategistHighlights = extractSentences(snapshot.narratives.strategist?.sanitized || '', 3)
  const founderNotes =
    Array.isArray(snapshot.framingMeta?.rules?.founder?.notes) && snapshot.framingMeta?.rules?.founder?.notes.length
      ? snapshot.framingMeta?.rules?.founder?.notes.map((note: string) => cleanText(note)).slice(0, 4)
      : []

  const researchSignals = collectResearchSignals(snapshot).slice(0, 4)

  const harness = snapshot.ideation?.harness || null
  const harnessPoint = cleanText(harness?.point || '')
  const harnessMove = cleanText(harness?.move || '')
  const harnessRetailerLine = cleanText(harness?.retailerLine || '')
  const harnessOdds = cleanText(harness?.oddsCadence || '')
  const harnessLegal = cleanText(harness?.legalVariant || '')
  const altHooksRaw = Array.isArray(snapshot.hooksTop) ? snapshot.hooksTop.map(cleanText).slice(0, 6) : []
  const altHooks = filterBrandAligned(altHooksRaw, brand).slice(0, 4)
  const altIdeasDetailed = Array.isArray(snapshot.ideation?.unboxed)
    ? snapshot.ideation?.unboxed.flatMap((agent) => {
        const agentName = agent?.agent || ''
        return (agent?.ideas || []).slice(0, 2).map((idea: any) => ({
          hook: cleanText(idea?.hook || ''),
          agent: cleanText(agentName),
          tier: cleanText(String(idea?.tier || '')),
          what: cleanText(idea?.what || ''),
        }))
      }).filter((idea) => idea.hook).slice(0, 4)
    : []

  const offerIqVerdict = snapshot.offerIQ?.verdict ? String(snapshot.offerIQ.verdict) : null
  const evalVerdict =
    snapshot.narratives.evaluation?.meta?.ui?.verdict ||
    snapshot.narratives.evaluation?.meta?.decision ||
    snapshot.narratives.evaluation?.meta?.verdict ||
    ''

  const guardrails = collectGuardrails(snapshot, opts)

  return {
    brand,
    campaign,
    category,
    briefHook,
    shopperTension,
    brandTruth,
    retailerReality,
    measurement,
    verdict: cleanText(evalVerdict),
    offerIq: offerIqVerdict ? cleanText(offerIqVerdict) : null,
    judgeScore,
    judgeVerdict: judgeVerdict ? cleanText(judgeVerdict) : null,
    judgeFlags: judgeFlags.map(cleanText),
    scoreboard: scoreboardEntries,
    positives,
    watchouts,
    fixes,
    runAgainMoves: runAgainMovesFiltered,
    strategistHighlights,
    founderNotes,
    researchSignals,
    harness,
    harnessPoint,
    harnessMove,
    harnessRetailerLine,
    harnessOdds,
    harnessLegal,
    altHooks,
    altIdeasDetailed,
    guardrails,
  }
}

function renderReviewAsBriefed(ctx: LensContext) {
  const parts: string[] = []
  parts.push(
    `<p>${escapeHtml(
      [
        `We read ${ctx.brand}'s "${ctx.campaign}" exactly as briefed.`,
        ctx.shopperTension ? `The shopper tension is ${ctx.shopperTension}.` : '',
        ctx.briefHook ? `The promise on paper is ${ctx.briefHook}.` : '',
        ctx.brandTruth ? `The brand truth in play is ${ctx.brandTruth}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
    )}</p>`
  )

  parts.push(renderListSection('What works', ctx.positives))
  const strengths: string[] = []
  if (ctx.offerIq) strengths.push(`OfferIQ verdict: ${ctx.offerIq}`)
  if (ctx.retailerReality) strengths.push(`Retail reality observed: ${ctx.retailerReality}`)
  if (ctx.brandTruth) strengths.push(`Brand proof: ${ctx.brandTruth}`)
  if (ctx.researchSignals.length) strengths.push(`Category signal: ${ctx.researchSignals[0]}`)
  if (strengths.length) parts.push(renderListSection('Proof points', strengths))

  const watchouts = [
    ...ctx.watchouts,
    ...ctx.judgeFlags.slice(0, 3),
    ctx.measurement ? `Measurement focus: ${ctx.measurement}` : '',
  ].filter(Boolean)
  parts.push(renderListSection('Where it breaks', watchouts))

  if (ctx.runAgainMoves.length) {
    parts.push(renderListSection('Fix on next iteration', ctx.runAgainMoves.slice(0, 4)))
  } else if (ctx.fixes.length) {
    parts.push(renderListSection('Fix on next iteration', ctx.fixes.slice(0, 4)))
  }

  const decisionLines: string[] = []
  if (ctx.verdict) decisionLines.push(`Evaluation verdict: ${ctx.verdict}`)
  if (ctx.judgeScore != null) decisionLines.push(`Judge score ${ctx.judgeScore}/100`)
  if (ctx.judgeVerdict) decisionLines.push(`Governance: ${ctx.judgeVerdict}`)
  parts.push(renderListSection('Decision snapshot', decisionLines))

  return parts.filter(Boolean).join('')
}

function renderSharpenWithImprovements(ctx: LensContext) {
  const parts: string[] = []
  parts.push(
    `<p>${escapeHtml(
      [
        `We keep ${ctx.brand}'s "${ctx.campaign}" intact but sharpen it for launch.`,
        ctx.briefHook ? `Anchor hook: ${ctx.briefHook}.` : '',
        ctx.shopperTension ? `Tension we're solving: ${ctx.shopperTension}.` : '',
      ]
        .filter(Boolean)
        .join(' ')
    )}</p>`
  )

  const keepers = [
    ...ctx.positives.slice(0, 4),
    ctx.brandTruth ? `Hold onto the brand proof: ${ctx.brandTruth}` : '',
  ].filter(Boolean)
  parts.push(renderListSection('Keep and amplify', keepers))

  const upgrades = [
    ...ctx.runAgainMoves.slice(0, 4),
    ...ctx.fixes.slice(0, 4),
    ctx.measurement ? `Reset success measure to ${ctx.measurement}` : '',
  ].filter(Boolean)
  parts.push(renderListSection('Upgrade now', dedupeStrings(upgrades).slice(0, 5)))

  const experiments = [
    ...ctx.strategistHighlights.slice(0, 3),
    ...ctx.altHooks.slice(0, 2).map((hook) => `Optional hook variant: ${hook}`),
  ].filter(Boolean)
  parts.push(renderListSection('Experiments and theatre', dedupeStrings(experiments)))

  const guardrails = [
    ...ctx.guardrails,
    ...ctx.founderNotes.slice(0, 3),
    ...ctx.judgeFlags.filter((flag) => flag.toLowerCase().includes('legal') || flag.toLowerCase().includes('compliance')),
  ].filter(Boolean)
  parts.push(renderListSection('Guardrails', dedupeStrings(guardrails)))

  return parts.filter(Boolean).join('')
}

function renderRebootWithAlternatives(ctx: LensContext) {
  const parts: string[] = []
  const diagnosis = [
    ctx.watchouts[0] ? `Stall point: ${ctx.watchouts[0]}` : '',
    ctx.shopperTension ? `Tension unresolved: ${ctx.shopperTension}` : '',
    ctx.judgeFlags[0] ? `Governance concern: ${ctx.judgeFlags[0]}` : '',
  ]
    .filter(Boolean)
    .join(' ')
  parts.push(`<p>${escapeHtml(diagnosis || `The briefed route needs a stronger hook to earn attention in this aisle.`)}</p>`)

  const newHook = ctx.altHooks[0] || ctx.altIdeasDetailed[0]?.hook || ctx.briefHook
  const alternativeLines: string[] = []
  if (newHook) alternativeLines.push(`New hero hook: ${newHook}`)
  if (ctx.harnessPoint) alternativeLines.push(`Position it as ${ctx.harnessPoint}`)
  if (ctx.harnessMove) alternativeLines.push(`Lead move: ${ctx.harnessMove}`)
  if (ctx.harnessRetailerLine) alternativeLines.push(`Retail shorthand: ${ctx.harnessRetailerLine}`)
  if (ctx.harnessLegal) alternativeLines.push(`Legal variant: ${ctx.harnessLegal}`)
  parts.push(renderListSection('Replacement narrative', alternativeLines))

  const routes = ctx.altIdeasDetailed.slice(0, 3).map((idea) => {
    const details = []
    if (idea.what) details.push(idea.what)
    if (idea.agent) details.push(`Agent ${idea.agent}`)
    if (idea.tier) details.push(`Tier ${idea.tier}`)
    return `${idea.hook}${details.length ? ` — ${details.join(' · ')}` : ''}`
  })
  parts.push(renderListSection('Routes to develop', dedupeStrings(routes)))

  const proof = [
    ctx.researchSignals[0] ? `Research: ${ctx.researchSignals[0]}` : '',
    ctx.researchSignals[1] ? `Market signal: ${ctx.researchSignals[1]}` : '',
    ctx.offerIq ? `OfferIQ: ${ctx.offerIq}` : '',
    ctx.measurement ? `Success metric: ${ctx.measurement}` : '',
  ].filter(Boolean)
  parts.push(renderListSection('Why this wins', dedupeStrings(proof)))

  const nextSteps = [
    ctx.guardrails[0],
    ctx.judgeFlags.find((flag) => flag.toLowerCase().includes('approval')),
    ctx.founderNotes[0],
  ].filter(Boolean)
  parts.push(renderListSection('Next steps to unlock', dedupeStrings(nextSteps)))

  return parts.filter(Boolean).join('')
}

function renderListSection(title: string, items: string[]) {
  const filtered = items.filter(Boolean)
  if (!filtered.length) return ''
  return `<div class="lens-section">
    <h3>${escapeHtml(title)}</h3>
    <ul>${filtered.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </div>`
}

function cleanText(value: string) {
  const raw = String(value || '')
  const withoutWhitespace = raw.replace(/\s+/g, ' ').trim()
  if (!withoutWhitespace) return ''
  if (/^[A-Z0-9_ -]+$/.test(withoutWhitespace) && withoutWhitespace === withoutWhitespace.toUpperCase()) {
    return ''
  }
  return withoutWhitespace
}

function dedupeStrings(items: Array<string | undefined>) {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    if (!item) continue
    const key = item.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      out.push(item)
    }
  }
  return out
}

function extractScoreboardEntries(board: any): ScoreEntry[] {
  if (!board || typeof board !== 'object') return []
  return Object.entries(board as Record<string, any>)
    .filter(([key]) => !['decision', 'conditions', 'measurement'].includes(key))
    .map(([key, value]) => ({
      label: prettifyScoreboardKey(key),
      status: String(value?.status || 'NA').toUpperCase(),
      why: cleanText(value?.why || ''),
      fix: cleanText(value?.fix || value?.improve || ''),
    }))
    .filter((entry) => entry.label)
}

function isPositiveStatus(status: string) {
  const good = new Set(['GREEN', 'POSITIVE', 'GOOD', 'STRONG', 'BLUE'])
  return good.has(String(status || '').toUpperCase())
}

function extractSentences(text: string, limit: number) {
  if (!text) return []
  const sentences = text
    .split(/[\r\n]+/)
    .map((line) => line.replace(/^\s*[-*•]+\s*/, '').trim())
    .filter(Boolean)
  const out: string[] = []
  for (const sentence of sentences) {
    if (!sentence) continue
    out.push(cleanText(sentence))
    if (out.length >= limit) break
  }
  return out
}

function collectResearchSignals(snapshot: SnapshotRich): string[] {
  const signals: string[] = []
  const dossier = snapshot.research?.dossier || {}
  const pushTexts = (arr?: Array<{ text?: string }>, prefix?: string) => {
    if (!Array.isArray(arr)) return
    arr.forEach((entry) => {
      const text = cleanText(entry?.text || '')
      if (text) signals.push(prefix ? `${prefix}: ${text}` : text)
    })
  }
  pushTexts(dossier.shopperTensions, 'Shopper tension')
  pushTexts(dossier.categorySignals, 'Category signal')
  pushTexts(dossier.competitorMoves, 'Competitor move')
  pushTexts(dossier.brandTruths, 'Brand truth')
  pushTexts(dossier.retailerReality, 'Retail reality')
  if (!signals.length && Array.isArray(snapshot.research?.audience?.facts)) {
    snapshot.research.audience.facts.forEach((fact: any) => {
      const text = cleanText(fact?.claim || fact || '')
      if (text) signals.push(text)
    })
  }
  return dedupeStrings(signals)
}

function collectGuardrails(snapshot: SnapshotRich, opts: RenderOptionsRuntime): string[] {
  const lines: string[] = []
  const conditions =
    cleanText(
      snapshot.narratives.evaluation?.meta?.scoreboard?.conditions ||
        snapshot.narratives.evaluation?.meta?.conditions ||
        ''
    ) ||
    ''
  if (conditions) lines.push(conditions)
  const prohibitions = snapshot.framingMeta?.handoff?.prohibitions
  if (Array.isArray(prohibitions)) {
    prohibitions.slice(0, 3).forEach((item: any) => {
      const text = cleanText(String(item || ''))
      if (text) lines.push(`Framing handoff: ${text}`)
    })
  }
  if (Array.isArray(opts.judgeVerdict?.flags)) {
    opts.judgeVerdict.flags.forEach((flag: any) => {
      const severity = String(flag?.severity || '').toUpperCase()
      if (severity === 'BLOCKER') {
        const message = cleanText(flag?.message || flag?.code || '')
        if (message) lines.push(`Blocker: ${message}`)
      }
    })
  }
  return dedupeStrings(lines).slice(0, 5)
}

const BRAND_SAFE_TOKENS = new Set([
  'OfferIQ',
  'POS',
  'KPI',
  'RSA',
  'ABAC',
  'LLM',
  'GWP',
  'ROI',
  'SKU',
  'CRM',
  'SMS',
  'QR',
  'VIP',
  'NFC',
  'URL',
  'CTA',
])

function filterBrandAligned(items: string[], brand: string): string[] {
  if (!brand) return items
  const brandLower = brand.toLowerCase()
  return items.filter((item) => {
    const text = item || ''
    const matches = text.match(/\b[A-Z][A-Za-z0-9&]+\b/g)
    if (!matches) return true
    return matches.every((token) => {
      if (BRAND_SAFE_TOKENS.has(token)) return true
      const tokenLower = token.toLowerCase()
      if (tokenLower === brandLower) return true
      if (tokenLower.length <= 2) return true
      return false
    })
  })
}

function renderResearchSection(snapshot: SnapshotRich) {
  const research = snapshot.research || {}
  const dossier = research.dossier || null
  let cards: string[] = []

  if (dossier) {
    const toFacts = (entries?: Array<{ text?: string; source?: string }>) =>
      Array.isArray(entries) && entries.length
        ? entries.map((entry) => ({ claim: entry?.text || '', source: entry?.source || '' }))
        : undefined
    cards = [
      renderResearchCard('Brand truths', toFacts(dossier.brandTruths)),
      renderResearchCard('Shopper tensions', toFacts(dossier.shopperTensions)),
      renderResearchCard('Retailer reality', toFacts(dossier.retailerReality)),
      renderResearchCard('Competitor moves', toFacts(dossier.competitorMoves)),
      renderResearchCard('Category signals', toFacts(dossier.categorySignals)),
      renderResearchCard('Benchmarks', toFacts(dossier.benchmarks)),
    ].filter(Boolean)
  } else {
    cards = [
      renderResearchCard('Brand insight', insightOrFacts(research.insights?.brand, research.brand?.facts)),
      renderResearchCard('Audience insight', insightOrFacts(research.insights?.audience, research.audience?.facts)),
      renderResearchCard('Retailer insight', insightOrFacts(research.insights?.retailers, research.retailers?.facts)),
      renderResearchCard('Market insight', insightOrFacts(research.insights?.market, research.market?.facts)),
      renderResearchCard('Signals', insightOrFacts(research.insights?.signals, research.signals?.facts)),
      renderResearchCard('Competitor watch', insightOrFacts(research.insights?.competitors, research.competitors?.facts)),
    ].filter(Boolean)
  }

  const grid = cards.length ? `<div class="research-grid">${cards.join('')}</div>` : ''
  const benchmarks = renderResearchBenchmarks(snapshot.benchmarks || research.benchmarks || null)

  if (!grid && !benchmarks) return '<p>No research snapshot saved.</p>'
  return `${grid}${benchmarks || ''}`
}

function renderExecutiveSummary(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const meta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const ui = meta.ui || {}
  const verdict = ui.verdict || snapshot.offerIQ?.verdict || 'Review'
  const judgeScore = opts.judgeVerdict?.score
  const offerIQVerdict = snapshot.offerIQ?.verdict
  const board = meta.scoreboard || {}
  const conditions = board.conditions || meta.conditions || ''
  const riskLines = extractRiskLines(board)
  const measurement = ui.measurement || meta.measurement || ''

  const decisionMetaParts: string[] = []
  if (offerIQVerdict) decisionMetaParts.push(`OfferIQ verdict: ${escapeHtml(String(offerIQVerdict))}`)
  if (typeof judgeScore === 'number') decisionMetaParts.push(`Judge score: ${escapeHtml(String(judgeScore))}/100`)

  const decisionCard = `<div class="decision-card">
    <h3>Decision</h3>
    <div class="decision-value">${escapeHtml(String(verdict))}</div>
    ${decisionMetaParts.length ? `<div class="decision-meta">${decisionMetaParts.map((line) => escapeHtml(line)).join('<br />')}</div>` : '<div class="decision-meta">Waiting on approval chain.</div>'}
  </div>`

  const guardList = []
  if (conditions) guardList.push(conditions)
  if (riskLines.length) guardList.push(...riskLines)
  const guardHtml = `<div class="decision-card">
    <h3>Guardrails</h3>
    ${guardList.length ? `<ul class="decision-list">${guardList.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div class="decision-meta">No critical conditions flagged.</div>'}
  </div>`

  const start = formatDate(snapshot.campaign.startDate)
  const end = formatDate(snapshot.campaign.endDate)
  const redemption = formatDate(snapshot.context?.briefSpec?.redemptionEndDate)
  const timelineRows = [
    start ? `<div class="timeline-row"><strong>Start</strong><span>${escapeHtml(start)}</span></div>` : '',
    end ? `<div class="timeline-row"><strong>End</strong><span>${escapeHtml(end)}</span></div>` : '',
    redemption ? `<div class="timeline-row"><strong>Redemption close</strong><span>${escapeHtml(redemption)}</span></div>` : ''
  ].filter(Boolean).join('')
  const timelineHtml = `<div class="decision-card">
    <h3>Key dates</h3>
    ${timelineRows || '<div class="decision-meta">Dates not yet confirmed.</div>'}
  </div>`

  const measurementHtml = measurement
    ? `<div class="kpi-bar"><span class="kpi-label">Primary KPI</span><span class="kpi-detail">${escapeHtml(measurement)}</span></div>`
    : ''

  return `<div class="decision-grid">${decisionCard}${guardHtml}${timelineHtml}</div>${measurementHtml}`
}

function renderEvaluationSection(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const meta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const ui = meta.ui || {}
  const chips: string[] = []
  if (ui.verdict) chips.push(`Verdict — ${escapeHtml(String(ui.verdict))}`)
  if (snapshot.offerIQ?.verdict) chips.push(`OfferIQ ${escapeHtml(String(snapshot.offerIQ.verdict))}`)
  if (opts.judgeVerdict?.score != null) chips.push(`Judge ${opts.judgeVerdict.score}/100`)
  const chipsHtml = chips.length ? `<div class="summary-tags">${chips.map((chip) => `<span class="summary-tag">${chip}</span>`).join('')}</div>` : ''

  const scoreboardHtml = renderScoreboard(meta?.scoreboard || null)
  const conditions = meta?.scoreboard?.conditions || meta?.conditions || ''
  const measurement = ui.measurement || meta.measurement || ''
  const conditionsHtml = conditions
    ? `<div class="callout callout-conditions"><h4>Mandatory conditions</h4><p>${escapeHtml(conditions)}</p></div>`
    : ''
  const measurementHtml = measurement
    ? `<div class="callout callout-measurement"><h4>Primary measurement</h4><p>${escapeHtml(measurement)}</p></div>`
    : ''

  const body = renderStructuredNarrative(snapshot.narratives.evaluation?.sanitized || snapshot.narratives.evaluation?.raw || '')
  return `${chipsHtml}${scoreboardHtml}${conditionsHtml}${measurementHtml}${body}`
}

function renderScoreboard(board: any) {
  if (!board) return ''
  const entries = Object.entries(board)
    .filter(([key]) => !['decision', 'conditions'].includes(key))
    .map(([key, value]: [string, any]) => ({
      label: prettifyScoreboardKey(key),
      status: (value?.status || 'NA') as string,
      why: value?.why || '',
      fix: value?.fix || '',
    }))
    .filter((row) => row.label)
  if (!entries.length) return ''
  const rows = entries
    .map(
      (row) => `<tr>
    <th scope="row">
      <span class="score-label">${escapeHtml(row.label)}</span>
      <span class="score-pill score-pill-${escapeHtml(row.status.toLowerCase())}">${escapeHtml(row.status)}</span>
    </th>
    <td>${row.why ? escapeHtml(row.why) : '<span class="muted">No rationale supplied.</span>'}</td>
    <td>${row.fix ? escapeHtml(row.fix) : '<span class="muted">–</span>'}</td>
  </tr>`
    )
    .join('')
  return `<div class="scoreboard">
    <div class="scoreboard-title">Scoreboard</div>
    <table>
      <thead>
        <tr><th scope="col">Lens</th><th scope="col">Why it sits here</th><th scope="col">Fix path</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
}

function prettifyScoreboardKey(key: string): string {
  const map: Record<string, string> = {
    objectiveFit: 'Objective fit',
    hookStrength: 'Hook strength',
    mechanicFit: 'Mechanic fit',
    frequencyPotential: 'Frequency potential',
    friction: 'Friction',
    rewardShape: 'Reward shape',
    retailerReadiness: 'Retail readiness',
    complianceRisk: 'Compliance risk',
    fulfilment: 'Fulfilment',
    kpiRealism: 'KPI realism',
  }
  return map[key] || key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function extractRiskLines(board: any): string[] {
  if (!board || typeof board !== 'object') return []
  return Object.entries(board)
    .filter(([key]) => !['decision', 'conditions'].includes(key))
    .map(([key, value]: [string, any]) => {
      const status = String(value?.status || '').toUpperCase()
      if (!status || status === 'GREEN' || status === 'NA') return null
      const why = value?.why || 'Clarify this area before launch.'
      return `${prettifyScoreboardKey(key)} — ${why}`
    })
    .filter((line): line is string => Boolean(line))
}

function formatDate(input: any): string | null {
  if (!input) return null
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function renderStrategistSection(snapshot: SnapshotRich) {
  const text = snapshot.narratives.strategist?.sanitized || snapshot.narratives.strategist?.raw || ''
  if (!text.trim()) return '<p>No strategist scenarios saved.</p>'
  return renderStructuredNarrative(text)
}

function renderIdeationSection(snapshot: SnapshotRich) {
  const ideation = snapshot.ideation
  if (!ideation) return ''
  const harness = ideation.harness || null
  const unboxed = Array.isArray(ideation.unboxed) ? ideation.unboxed : []
  const ideaItems = unboxed.flatMap((agent) => (
    Array.isArray(agent?.ideas)
      ? agent.ideas.slice(0, 1).map((idea: any) => ({
          agent: agent.agent,
          tier: String(idea?.tier || '').toUpperCase(),
          hook: idea?.hook || '',
          what: idea?.what || '',
          xForY: idea?.xForY || '',
          operatorCards: Array.isArray(idea?.operatorCards) ? idea.operatorCards : [],
        }))
      : []
  )).slice(0, 5)

  const harnessHtml = harness
    ? `<div class="harness-card">
        <div class="harness-title">Bruce (Retailise)</div>
        ${harness.selectedHook ? `<h3>${escapeHtml(harness.selectedHook)}</h3>` : ''}
        ${harness.point ? `<p><strong>Point</strong> — ${escapeHtml(harness.point)}</p>` : ''}
        ${harness.move ? `<p><strong>Move</strong> — ${escapeHtml(harness.move)}</p>` : ''}
        ${harness.risk ? `<p><strong>Risk</strong> — ${escapeHtml(harness.risk)}</p>` : ''}
        ${harness.oddsCadence ? `<p><strong>Odds & cadence</strong> — ${escapeHtml(harness.oddsCadence)}</p>` : ''}
        ${harness.retailerLine ? `<p><strong>Retailer line</strong> — ${escapeHtml(harness.retailerLine)}</p>` : ''}
        ${harness.legalVariant ? `<p><strong>Legalised variant</strong> — ${escapeHtml(harness.legalVariant)}</p>` : ''}
      </div>`
    : ''

  const ideasHtml = ideaItems.length
    ? `<div class="ideation-list">
        <div class="ideation-list-title">Create_Unboxed Highlights</div>
        <ul>
          ${ideaItems
            .map((idea) => `<li>
              <div class="idea-hook"><span>${escapeHtml(idea.hook)}</span><small>${escapeHtml(idea.agent)} · ${escapeHtml(idea.tier)}</small></div>
              ${idea.what ? `<p>${escapeHtml(idea.what)}</p>` : ''}
              ${idea.xForY ? `<p class="idea-xfy">${escapeHtml(idea.xForY)}</p>` : ''}
              ${idea.operatorCards.length ? `<p class="idea-ops">Operator cards: ${idea.operatorCards.map((card: string) => escapeHtml(card)).join(', ')}</p>` : ''}
            </li>`)
            .join('')}
        </ul>
      </div>`
    : ''

  if (!harnessHtml && !ideasHtml) return ''
  return `<div class="ideation-grid">${harnessHtml}${ideasHtml}</div>`
}

function renderSynthesisSection(snapshot: SnapshotRich) {
  const rider = extractSynthesisRider(snapshot.narratives.synthesis?.raw || '')
  const stripped = stripSynthesisRider(snapshot.narratives.synthesis?.sanitized || snapshot.narratives.synthesis?.raw || '')
  const blocks: string[] = []
  blocks.push(renderMarkdownBlock(stripped || '_No synthesis narrative._'))
  if (rider) {
    blocks.push(renderRiderTable(rider))
  }
  return blocks.join('')
}

function renderMarkdownBlock(value: string | null | undefined) {
  if (!value || !value.trim()) return '<p>No content.</p>'
  return markdownToHtml(value)
}

function renderStructuredNarrative(raw: string) {
  const expanded = expandInlineBullets(String(raw || ''))
  const text = expanded.trim()
  if (!text) return '<p>No content.</p>'
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
  const parts: string[] = []
  let list: string[] = []

  const emitParagraphSegments = (value: string) => {
    if (!value?.trim()) return
    const segments = splitParagraphSegments(value)
    for (const segment of segments) {
      if (!segment) continue
      const rendered = formatNarrativeParagraph(segment)
      if (rendered) parts.push(rendered)
    }
  }

  const flushList = () => {
    if (!list.length) return
    parts.push(`<ul>${list.join('')}</ul>`)
    list = []
  }

  for (const block of blocks) {
    const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean)
    if (!lines.length) continue
    const paragraphBuffer: string[] = []

    const flushParagraphBuffer = () => {
      if (!paragraphBuffer.length) return
      flushList()
      const paragraph = paragraphBuffer.join(' ')
      paragraphBuffer.length = 0
      const bulletSplit = extractInlineBulletSequence(paragraph)
      if (bulletSplit) {
        if (bulletSplit.lead) emitParagraphSegments(bulletSplit.lead)
        if (bulletSplit.bullets.length) {
          const items = bulletSplit.bullets
            .map((item) => escapeHtml(item))
            .filter(Boolean)
            .map((item) => `<li>${item}</li>`)
          if (items.length) parts.push(`<ul>${items.join('')}</ul>`)
        }
        if (bulletSplit.trailing) emitParagraphSegments(bulletSplit.trailing)
        return
      }
      emitParagraphSegments(paragraph)
    }

    for (const line of lines) {
      if (line.startsWith('- ')) {
        flushParagraphBuffer()
        list.push(`<li>${escapeHtml(line.slice(2).trim())}</li>`)
        continue
      }
      if (list.length) flushList()
      paragraphBuffer.push(line)
    }
    flushParagraphBuffer()
  }
  flushList()
  return `<div class="structured-block">${parts.join('')}</div>`
}

function expandInlineBullets(value: string): string {
  if (typeof value === 'string') return value
  if (value == null) return ''
  return String(value)
}

function extractInlineBulletSequence(paragraph: string): { lead: string; bullets: string[]; trailing: string } | null {
  if (!paragraph) return null
  const hyphenMatches = paragraph.match(/\s-\s+/g)
  if (!hyphenMatches || hyphenMatches.length < 2) return null
  const firstIdx = paragraph.indexOf(' - ')
  if (firstIdx === -1) return null
  const lead = paragraph.slice(0, firstIdx).trimEnd()
  const len = paragraph.length
  let cursor = firstIdx
  const bullets: string[] = []

  while (cursor < len) {
    while (cursor < len && /\s/.test(paragraph[cursor])) cursor++
    if (cursor >= len || paragraph[cursor] !== '-') break
    cursor += 1
    while (cursor < len && /\s/.test(paragraph[cursor])) cursor++
    const start = cursor
    let nextIdx = paragraph.indexOf(' - ', cursor)
    let bulletText: string
    if (nextIdx === -1) {
      bulletText = paragraph.slice(start).trim()
      cursor = len
    } else {
      bulletText = paragraph.slice(start, nextIdx).trim()
      cursor = nextIdx
    }
    if (bulletText) bullets.push(bulletText)
  }

  if (bullets.length < 2) return null

  let trailing = ''
  if (bullets.length) {
    const lastSplit = detachTrailingFromBullet(bullets[bullets.length - 1])
    bullets[bullets.length - 1] = lastSplit.bullet
    trailing = lastSplit.trailing
  }

  if (cursor < len) {
    const remainder = paragraph.slice(cursor).trim()
    if (remainder) trailing = trailing ? `${trailing} ${remainder}`.trim() : remainder
  }

  return {
    lead: lead.trim(),
    bullets: bullets.filter(Boolean),
    trailing: trailing.trim(),
  }
}

const BULLET_TRAILING_TOKENS = [
  '\u201c',
  '"',
  ' Success ',
  ' Measurement ',
  ' We ',
  ' We\u2019ll ',
  " We'll ",
  ' This ',
  ' That ',
  ' Track ',
  ' Monitor ',
  ' KPI',
  ' Ensure ',
  ' Watch ',
  ' Summary ',
  ' Hook ',
  ' Outcome ',
  ' Measurement \u2014',
]

function detachTrailingFromBullet(text: string): { bullet: string; trailing: string } {
  let bullet = String(text || '').trim()
  let trailing = ''
  let splitIdx = Number.POSITIVE_INFINITY
  let selected: { before: string; after: string } | null = null
  for (const token of BULLET_TRAILING_TOKENS) {
    const idx = bullet.indexOf(token)
    if (idx > 0 && idx < splitIdx) {
      const before = bullet.slice(0, idx).trim()
      const after = bullet.slice(idx).trim()
      if (!before || !after) continue
      splitIdx = idx
      selected = { before, after }
    }
  }
  if (selected) {
    bullet = selected.before
    trailing = selected.after
  }
  return { bullet, trailing }
}

function splitParagraphSegments(paragraph: string): string[] {
  const trimmed = String(paragraph || '').trim()
  if (!trimmed) return []
  const bySegue =
    SEGMENT_SPLIT_REGEX != null
      ? trimmed.split(SEGMENT_SPLIT_REGEX).map((segment) => segment.trim()).filter(Boolean)
      : [trimmed]
  const expanded: string[] = []
  const source = bySegue.length ? bySegue : [trimmed]
  for (const segment of source) {
    const byNumeric = segment.split(/(?=\b\d+\.)/g).map((entry) => entry.trim()).filter(Boolean)
    if (byNumeric.length > 1) {
      expanded.push(...byNumeric)
      continue
    }
    expanded.push(segment)
  }
  if (!expanded.length) return [trimmed]
  const merged: string[] = []
  const articleSet = new Set(['a', 'an', 'the'])
  for (let i = 0; i < expanded.length; i++) {
    const current = expanded[i]
    const lower = current.trim().toLowerCase()
    if (articleSet.has(lower) && i + 1 < expanded.length) {
      const combined = `${current} ${expanded[i + 1]}`.replace(/\s+/g, ' ').trim()
      merged.push(combined)
      i += 1
      continue
    }
    merged.push(current)
  }
  return merged
}

function formatNarrativeParagraph(paragraph: string): string {
  const original = String(paragraph || '').trim()
  if (!original) return ''
  const prefixMatch = original.match(SEGUE_PREFIX_REGEX)
  if (!prefixMatch) {
    return `<p>${escapeHtml(original)}</p>`
  }
  let prefix = prefixMatch[0]
  let article = ''
  const articleMatch = prefix.match(/^((?:A|An|The)\s+)(.*)$/i)
  if (articleMatch) {
    article = articleMatch[1]
    prefix = articleMatch[2]
  }
  const remainderAfterPrefix = original.slice(prefixMatch[0].length)
  const punctuationMatch = remainderAfterPrefix.match(SEGUE_PUNCTUATION_REGEX)
  const punctuationRaw = punctuationMatch ? punctuationMatch[0] : ''
  const punctuationNormal =
    punctuationRaw && /\s+$/.test(punctuationRaw) ? punctuationRaw.replace(/\s+$/, ' ') : punctuationRaw
  const remainder = remainderAfterPrefix.slice(punctuationRaw.length).trimStart()
  const needsGap = remainder.length > 0 && (!punctuationNormal || !punctuationNormal.endsWith(' '))
  const gap = needsGap ? ' ' : ''
  const articleHtml = article ? escapeHtml(article) : ''
  return `<p>${articleHtml}<strong>${escapeHtml(prefix)}</strong>${escapeHtml(punctuationNormal)}${gap}${escapeHtml(remainder)}</p>`
}

function formatStructuredContent(value: any): string {
  if (typeof value === 'string') {
    return markdownToHtml(value)
  }
  if (Array.isArray(value)) {
    const items = value.map((entry) => `<li>${escapeHtml(typeof entry === 'string' ? entry : JSON.stringify(entry))}</li>`).join('')
    return `<ul>${items}</ul>`
  }
  if (value && typeof value === 'object') {
    return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`
  }
  return '<p>No data.</p>'
}

function insightOrFacts(entries?: Array<{ text: string; source?: string }>, fallback?: Array<{ claim?: string; source?: string }>) {
  if (Array.isArray(entries) && entries.length) {
    return entries.map((entry) => ({
      claim: entry.text,
      source: entry.source ? `Source: ${entry.source}` : '',
    }))
  }
  return fallback || []
}

function renderResearchCard(title: string, facts?: Array<{ claim?: string; source?: string }>, cap = 4) {
  if (!Array.isArray(facts) || !facts.length) return ''
  const entries = facts
    .map((fact) => {
      const claim = sanitizeResearchClaim(fact?.claim || '')
      if (!claim) return null
      return { claim, source: formatResearchSource(fact?.source || '') }
    })
    .filter((entry): entry is { claim: string; source: string } => Boolean(entry))
    .slice(0, cap)
  if (!entries.length) return ''
  const items = entries
    .map((entry) => `<li><span>${escapeHtml(entry.claim)}</span>${entry.source ? `<span class="source">${escapeHtml(entry.source)}</span>` : ''}</li>`)
    .join('')
  return `<div class="research-card"><h3>${escapeHtml(title)}</h3><ul>${items}</ul></div>`
}

function sanitizeResearchClaim(raw: string) {
  return String(raw || '')
    .replace(/^[#>\-\u2022•▪︎→↘\s]+/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatResearchSource(raw: string) {
  const text = String(raw || '').trim()
  if (!text) return ''
  const match = text.match(/\((https?:\/\/[^\s)]+)\)/)
  const candidate = match ? match[1] : text.replace(/^Source:\s*/i, '')
  if (!candidate) return ''
  try {
    const url = new URL(candidate)
    return url.hostname.replace(/^www\./, '')
  } catch {
    return candidate
  }
}

function renderResearchBenchmarks(data: any) {
  if (!data) return ''
  const cb = data.cashback || {}
  const prize = data.prizeCountsObserved || {}
  const rec = data.recommendedHeroCount
  const pos = data.positionVsMarket
  const lines: string[] = []

  if (cb.sample || cb.typicalAbs || cb.typicalPct || cb.maxAbs || cb.maxPct) {
    const typical = cb.typicalAbs ? `$${Math.round(cb.typicalAbs)}` : (cb.typicalPct ? `${cb.typicalPct}%` : 'n/a')
    const span = cb.sample ? ` (n=${cb.sample})` : ''
    const max = cb.maxAbs ? `max ~$${Math.round(cb.maxAbs)}` : (cb.maxPct ? `max ${cb.maxPct}%` : '')
    lines.push(`Cashback typical: ${typical}${span}${max ? ` (${max})` : ''}`)
  }
  if (prize.total) {
    const details = Array.isArray(prize.common)
      ? prize.common.map((row: any) => `${row.count} (${Math.round((row.share || 0) * 100)}%)`).join(', ')
      : ''
    lines.push(`Hero counts seen (${prize.total} promos): ${details || 'n/a'}`)
  }
  if (rec) lines.push(`Recommended hero overlay count: ${rec}`)
  if (pos && pos !== 'UNKNOWN') lines.push(`Cashback vs market: ${String(pos).replace(/_/g, ' ').toLowerCase()}`)

  return lines.length
    ? `<div class="bench-note"><strong>Benchmarks</strong><ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`
    : ''
}

function buildCopyBlocks(snapshot: SnapshotRich, rider: any): string[] {
  const blocks: string[] = []
  if (rider?.hook) blocks.push(rider.hook)
  if (rider?.pack_line) blocks.push(rider.pack_line)
  if (Array.isArray(snapshot.hooksTop)) {
    blocks.push(...snapshot.hooksTop.slice(0, 4))
  }
  return blocks.filter(Boolean)
}

function stripSynthesisRider(text: string) {
  if (!text) return ''
  const candidate = findRiderJson(text)
  if (!candidate) return text
  return `${text.slice(0, candidate.start)}${text.slice(candidate.end)}`.trim()
}

function extractSynthesisRider(raw: string) {
  if (!raw) return null
  const candidate = findRiderJson(raw)
  if (!candidate) return null
  try {
    return JSON.parse(candidate.json)
  } catch {
    return null
  }
}

function findRiderJson(raw: string): { json: string; start: number; end: number } | null {
  const fenceMatch = raw.match(/```json\s*([\s\S]*?)```/i)
  if (fenceMatch) {
    const start = fenceMatch.index ?? 0
    const end = start + fenceMatch[0].length
    return { json: fenceMatch[1].trim(), start, end }
  }
  const anchor = raw.indexOf('"kind"')
  if (anchor === -1) return null
  const start = raw.lastIndexOf('{', anchor)
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < raw.length; i++) {
    const char = raw[i]
    if (char === '{') depth++
    else if (char === '}') {
      depth--
      if (depth === 0) {
        return { json: raw.slice(start, i + 1), start, end: i + 1 }
      }
    }
  }
  return null
}

function renderRiderTable(rider: any) {
  const rows: string[] = []
  if (rider.hook) rows.push(renderRiderRow('Hook', rider.hook))
  if (rider.pack_line) rows.push(renderRiderRow('Pack line', rider.pack_line))
  if (rider.cadence_line) rows.push(renderRiderRow('Cadence', rider.cadence_line))
  if (typeof rider.use_double_passes === 'boolean') rows.push(renderRiderRow('Double passes', rider.use_double_passes ? 'Yes' : 'No'))
  if (rider.hero_overlay) {
    rows.push(renderRiderRow('Hero overlay allowed', rider.hero_overlay.allowed ? 'Yes' : 'No'))
    if (rider.hero_overlay.recommended_winners) {
      rows.push(renderRiderRow('Overlay winners', String(rider.hero_overlay.recommended_winners)))
    }
    if (rider.hero_overlay.theme_hint) rows.push(renderRiderRow('Overlay theme', rider.hero_overlay.theme_hint))
  }
  if (Array.isArray(rider.priority_outputs) && rider.priority_outputs.length) {
    rows.push(renderRiderRow('Priority outputs', rider.priority_outputs.join(', ')))
  }
  if (rows.length === 0) return ''
  return `<div class="rider"><h3>JSON Rider</h3><table>${rows.join('')}</table></div>`
}

function renderRiderRow(label: string, value: string) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
}

function buildHtmlDocument(model: SummaryModel) {
  const numberedSections = model.sections.map((section, index) => ({
    ...section,
    number: index + 1,
    numberLabel: String(index + 1).padStart(2, '0'),
  }))
  const sectionsHtml = numberedSections
    .map(
      (section) => `<article id="${section.id}" data-section-id="${section.id}" class="content-section${section.number === 1 ? ' is-lead' : ''}">
  <header class="section-header">
    <span class="section-index">${escapeHtml(section.numberLabel)}</span>
    <h2>${escapeHtml(section.title)}</h2>
  </header>
  <div class="section-body">
    ${section.html}
  </div>
</article>`
    )
    .join('')

  const servicesSection = `<article id="trevor-services" class="content-section services-callout">
  <header class="section-header">
    <span class="section-index">TS</span>
    <h2>Partnering With Trevor Services</h2>
  </header>
  <div class="section-body">
    <p><strong>Trevor Services&trade;</strong> is a digital competition and sales promotion platform which allows brands, agencies and media owners to deliver mobile and digital promotions globally, whilst being managed centrally.</p>
    <p>Trevor Services&trade; provides the engine and mechanisms to get your most complex promotional campaigns in-market and engaging your customers.</p>
    <p>With our robust promotional platform, your promotion is guaranteed to be 100% compliant. Trevor Services&trade; technology operates stand-alone or as an integrated solution within a partner CMS environment.</p>
    <p>Speak with Mark Alexander at <a href="mailto:mark@trevor.services">mark@trevor.services</a> to bring Trevor Services&trade; into your next activation.</p>
  </div>
</article>`

  const tocHtml = numberedSections.length
    ? `<section class="page contents">
  <div class="section-label">Inside this dossier</div>
  <ol>
    ${numberedSections
      .map(
        (section) =>
          `<li data-section-id="${section.id}"><span>${escapeHtml(section.numberLabel)}</span><a href="#${section.id}">${escapeHtml(section.title)}</a></li>`
      )
      .join('')}
  </ol>
</section>`
    : ''

  const coverCopy = model.copyBlocks.length
    ? `<div class="cover-copy">
    ${model.copyBlocks
      .map(
        (line) => `<div class="cover-chip">
      <span>${escapeHtml(line)}</span>
    </div>`
      )
      .join('')}
  </div>`
    : ''

  const controlsHtml = numberedSections.length
    ? `<section class="page controls-panel">
  <div class="controls-panel__inner">
    <div class="controls-panel__head">
      <div class="controls-panel__title">Curate this export</div>
      <div class="controls-panel__actions">
        <button type="button" data-toggle-action="all" aria-label="Select all sections">Select all</button>
        <button type="button" data-toggle-action="none" aria-label="Clear all sections">Clear all</button>
      </div>
    </div>
    <div class="controls-panel__grid">
      ${numberedSections
        .map(
          (section) =>
            `<label class="controls-panel__option">
        <input type="checkbox" data-toggle-target="${section.id}" checked />
        <span>${escapeHtml(section.title)}</span>
      </label>`
        )
        .join('')}
    </div>
    <p class="controls-panel__note">Untick any sections you don't need. Hidden sections disappear from the contents page and the final PDF.</p>
  </div>
</section>`
    : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charSet="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(model.meta.documentTitle)}</title>
<style>
:root{color-scheme:only light;--accent:${model.meta.accent};--ink:#1a2233;--muted:#55627a;--muted-soft:#778199;--soft:#d9dee8;--softer:#edf1f7;--paper:#ffffff;--canvas:#f3f5f9;}
@page{
  size:A4;
  margin:12mm;
  @top-left{content: string(report-title);font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#64748b;}
  @top-right{content: string(section-title) "  •  " counter(page) "/" counter(pages);font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;}
  @bottom-center{content:"Mark Alexander  •  mark@trevor.services";font-size:10px;color:#94a3b8;letter-spacing:0.08em;text-transform:uppercase;}
}
*{box-sizing:border-box;}
body{margin:0;background:var(--canvas);font-family:"IBM Plex Sans","Inter","Segoe UI",-apple-system,BlinkMacSystemFont,sans-serif;color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;font-size:15px;}
.document{position:relative;max-width:900px;margin:0 auto;padding:24px 20px 40px;display:flex;flex-direction:column;gap:24px;}
.page{background:var(--paper);padding:32px;border-radius:20px;box-shadow:0 24px 48px rgba(15,23,42,0.04),0 4px 20px rgba(15,23,42,0.06);}
.cover{position:relative;overflow:hidden;border:1px solid rgba(15,23,42,0.12);display:grid;grid-template-columns: minmax(0,1fr);gap:24px;}
.cover::before{content:"";position:absolute;inset:0;background:linear-gradient(140deg,rgba(15,23,42,0.04),rgba(15,23,42,0));opacity:1;}
.cover::after{content:"";position:absolute;inset:0;border-left:10px solid var(--accent);}
.cover-inner{position:relative;z-index:1;padding-left:28px;display:grid;gap:18px;}
.eyebrow{letter-spacing:0.32em;text-transform:uppercase;font-size:11px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:12px;}
.eyebrow span:last-child{font-size:11px;letter-spacing:0.24em;color:var(--muted-soft);}
.cover h1{margin:0;font-size:38px;font-weight:600;line-height:1.2;color:var(--ink);string-set:report-title content();}
.cover-meta{font-size:15px;color:var(--muted);}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
.chip{border-radius:999px;background:rgba(15,28,48,0.06);color:var(--ink);padding:5px 12px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;border:1px solid rgba(15,28,48,0.12);}
.cover-copy{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin-top:10px;}
.cover-chip{border-radius:18px;padding:18px;border:1px solid rgba(15,23,42,0.12);background:linear-gradient(180deg,#ffffff 0%,#f6f8fc 100%);font-size:16px;font-weight:500;color:var(--ink);}
.contents{display:flex;flex-direction:column;gap:18px;}
.contents .section-label{font-size:12px;letter-spacing:0.32em;text-transform:uppercase;color:var(--muted);font-weight:600;}
.contents ol{margin:0;padding:0;list-style:none;}
.contents li{display:flex;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--soft);font-size:15px;font-weight:500;color:var(--ink);}
.contents li span{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,var(--accent),rgba(14,165,233,0.18));display:flex;align-items:center;justify-content:center;color:#0f172a;font-weight:600;letter-spacing:0.08em;}
  .contents li a{text-decoration:none;color:inherit;}
  .contents li:last-child{border-bottom:none;}
  .controls-panel{background:var(--paper);padding:30px;border-radius:20px;border:1px solid rgba(15,23,42,0.08);box-shadow:0 18px 36px rgba(15,23,42,0.04);page-break-inside:avoid;}
  .controls-panel__inner{display:flex;flex-direction:column;gap:22px;}
  .controls-panel__head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;}
  .controls-panel__title{font-size:18px;font-weight:600;color:var(--ink);}
  .controls-panel__actions{display:flex;gap:10px;}
  .controls-panel__actions button{border:1px solid rgba(14,165,233,0.32);background:rgba(14,165,233,0.12);color:#0369a1;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;padding:8px 12px;border-radius:999px;cursor:pointer;font-weight:600;}
  .controls-panel__actions button:hover{background:rgba(14,165,233,0.18);}
  .controls-panel__grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;}
  .controls-panel__option{display:flex;align-items:center;gap:10px;border:1px solid rgba(15,23,42,0.1);border-radius:14px;padding:10px 14px;background:#f7f9fc;cursor:pointer;font-size:14px;color:var(--ink);}
  .controls-panel__option input{width:18px;height:18px;border-radius:4px;border:1px solid rgba(15,23,42,0.2);}
  .controls-panel__note{margin:0;font-size:13px;color:#64748b;}
  .content-section{background:var(--paper);padding:36px;border:1px solid rgba(15,23,42,0.08);border-radius:20px;margin-bottom:28px;page-break-inside:avoid;box-shadow:0 12px 26px rgba(15,23,42,0.04);}
  .content-section.is-lead{border-color:rgba(14,165,233,0.35);box-shadow:0 18px 36px rgba(14,165,233,0.08);}
  .content-section.is-hidden{display:none !important;}
  .contents li.is-hidden{display:none !important;}
  .services-callout{background:linear-gradient(135deg,#ffffff,rgba(14,165,233,0.08));border:1px solid rgba(14,165,233,0.22);}
.section-header{display:flex;align-items:center;gap:14px;margin-bottom:18px;}
.section-index{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--accent),rgba(14,165,233,0.16));font-weight:600;color:#0f172a;letter-spacing:0.08em;font-size:13px;border:1px solid rgba(14,165,233,0.22);}
.section-header h2{margin:0;font-size:24px;line-height:1.3;font-weight:600;color:var(--ink);string-set:section-title content();}
.section-body>p:first-of-type{margin-top:0;}
.section-body>p:last-of-type{margin-bottom:0;}
.chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}
.chip-row .chip{background:rgba(14,165,233,0.12);color:var(--accent);border:1px solid rgba(14,165,233,0.25);}
.summary-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px;}
.summary-tag{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;background:rgba(14,165,233,0.16);color:var(--accent);font-size:12px;letter-spacing:0.08em;text-transform:uppercase;border:1px solid rgba(14,165,233,0.26);}
.structured-block{display:flex;flex-direction:column;gap:16px;font-size:15px;}
.structured-block h3{margin:14px 0 6px;font-size:13px;letter-spacing:0.24em;text-transform:uppercase;color:var(--muted);font-weight:600;}
.structured-block p{margin:0;color:var(--ink);line-height:1.65;font-size:15px;}
.marks-view{display:grid;gap:24px;margin-bottom:8px;}
.marks-chapter{border:1px solid rgba(15,23,42,0.08);border-radius:20px;padding:24px;background:linear-gradient(180deg,#ffffff 0%,#f6f8fc 100%);box-shadow:0 16px 32px rgba(15,23,42,0.04);}
.marks-chapter__head{margin-bottom:12px;}
.marks-chapter__head h3{margin:6px 0 0;font-size:21px;font-weight:600;color:var(--ink);}
.chapter-eyebrow{font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:var(--muted);font-weight:600;}
.marks-chapter__body .lens-section{margin-top:12px;}
.marks-chapter__body .lens-section:first-of-type{margin-top:0;}
.structured-block strong{color:#0f172a;font-weight:700;}
.structured-block ul{margin:0 0 12px 18px;padding:0;}
.structured-block li{margin:4px 0;color:var(--ink);line-height:1.5;font-size:14px;}
.ideation-grid{display:grid;gap:18px;margin-top:8px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));}
.harness-card{border:1px solid rgba(15,23,42,0.12);border-radius:20px;background:linear-gradient(135deg,rgba(14,165,233,0.12),rgba(14,165,233,0.04));padding:20px;display:flex;flex-direction:column;gap:10px;}
.harness-title{letter-spacing:0.24em;text-transform:uppercase;font-size:11px;color:#0ea5e9;font-weight:600;}
.ideation-list{border:1px solid rgba(15,23,42,0.08);border-radius:20px;background:#f8fafc;padding:18px;}
.ideation-list-title{letter-spacing:0.2em;text-transform:uppercase;font-size:11px;color:var(--muted);margin-bottom:12px;font-weight:600;}
.ideation-list ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px;}
.ideation-list li{padding-bottom:12px;border-bottom:1px solid rgba(148,163,184,0.2);}
.ideation-list li:last-child{border-bottom:none;padding-bottom:0;}
.idea-hook{display:flex;flex-direction:column;gap:4px;font-weight:600;color:var(--ink);}
.idea-hook small{font-size:11px;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;}
.idea-xfy{font-size:13px;color:#0369a1;margin-top:4px;}
.idea-ops{font-size:12px;color:#475569;margin-top:4px;letter-spacing:0.02em;}
.research-grid{margin-top:10px;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;}
.research-card{border-radius:18px;padding:18px;background:#f8fafc;border:1px solid rgba(148,163,184,0.32);}
.research-card h3{margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:var(--muted);}
.research-card ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;}
.research-card li{font-size:13px;line-height:1.5;color:var(--ink);}
.research-card .source{display:block;font-size:10px;color:#64748b;margin-top:3px;letter-spacing:0.04em;text-transform:uppercase;}
.bench-note{margin-top:18px;padding:16px;border-radius:18px;border:1px solid rgba(14,165,233,0.25);background:rgba(14,165,233,0.08);font-size:13px;}
.bench-note ul{margin:6px 0 0 18px;padding:0;}
.bench-note li{margin:4px 0;}
pre{background:#0f172a;color:#f8fafc;padding:14px;border-radius:14px;overflow:auto;font-size:12px;}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;}
th,td{padding:9px 10px;border-bottom:1px solid var(--soft);text-align:left;}
.prose-block p{margin:0 0 16px 0;font-size:15px;color:var(--ink);line-height:1.6;}
.prose-block p:last-child{margin-bottom:0;}
ul{margin-top:0;}
main p,main li{orphans:3;widows:3;}
.scoreboard{margin-bottom:20px;border:1px solid rgba(15,23,42,0.12);border-radius:18px;overflow:hidden;background:#fff;}
.scoreboard-title{background:linear-gradient(135deg,rgba(14,165,233,0.12),rgba(14,165,233,0.08));padding:14px 18px;font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#0f172a;font-weight:600;}
.scoreboard table{margin:0;width:100%;border-collapse:collapse;font-size:13px;}
.scoreboard th{background:#f7f9fc;text-transform:uppercase;letter-spacing:0.12em;font-size:10px;color:var(--muted);border-bottom:1px solid var(--soft);}
.scoreboard td,.scoreboard th{padding:12px 16px;vertical-align:top;}
.score-label{display:block;font-weight:600;margin-bottom:6px;}
.score-pill{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;}
.score-pill-green{background:rgba(34,197,94,0.16);color:#047857;border:1px solid rgba(34,197,94,0.24);}
.score-pill-amber{background:rgba(250,204,21,0.18);color:#92400e;border:1px solid rgba(250,204,21,0.3);}
.score-pill-red{background:rgba(248,113,113,0.16);color:#b91c1c;border:1px solid rgba(248,113,113,0.28);}
.score-pill-na{background:rgba(148,163,184,0.18);color:#475569;border:1px solid rgba(148,163,184,0.28);}
.muted{color:var(--muted);}
.callout{border-radius:18px;border:1px solid rgba(15,23,42,0.12);padding:18px 20px;margin-bottom:18px;background:#f8fafc;}
.callout h4{margin:0 0 8px;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted);font-weight:600;}
.callout-conditions{background:rgba(248,113,113,0.1);border-color:rgba(248,113,113,0.25);}
.callout-measurement{background:rgba(14,165,233,0.1);border-color:rgba(14,165,233,0.25);}
.services-callout ul{margin:0 0 12px 18px;padding:0;font-size:14px;}
.services-callout li{margin-bottom:6px;}
footer{text-align:center;font-size:12px;color:#94a3b8;margin-top:32px;}
footer strong{display:block;margin-bottom:4px;letter-spacing:0.24em;text-transform:uppercase;font-size:11px;color:#1e293b;}
footer a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(148,163,184,0.5);}
@media print{
  body{background:#fff;}
  .document{padding:18px;}
  .page{padding:26px;margin-bottom:18px;box-shadow:none;border:1px solid rgba(148,163,184,0.35);}
  .cover{border-left:8px solid var(--accent);}
  .cover::after{display:none;}
  .cover-chip{background:#f8fafc;border:1px solid rgba(148,163,184,0.35);}
  .chip{border:1px solid rgba(148,163,184,0.5);color:var(--muted);background:rgba(148,163,184,0.1);}
  .controls-panel{display:none !important;}
  footer{margin-top:24px;}
  .content-section{page-break-inside:avoid;}
}
</style>
</head>
<body>
<div class="document">
  <section class="page cover">
    <div class="cover-grid">
      <div class="cover-left">
        <div class="cover-inner">
          <div class="eyebrow"><span>Campaign appraisal</span><span>Trevor Services</span></div>
          <h1>${escapeHtml(model.meta.campaignTitle)}</h1>
          <div class="cover-meta">${escapeHtml(model.meta.brand)} • ${escapeHtml(model.meta.timestamp)}</div>
          ${model.meta.chips.length ? `<div class="chips">${model.meta.chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join('')}</div>` : ''}
          ${coverCopy}
        </div>
      </div>
      <div class="cover-right">
        <div class="cover-pattern"></div>
        <div class="cover-logo">Trevor Services</div>
      </div>
    </div>
  </section>
  ${tocHtml}
  ${controlsHtml}
  <main>
    ${sectionsHtml}
    ${servicesSection}
  </main>
  <footer>
    <strong>Trevor Services</strong>
    Generated by Trudy • ${escapeHtml(model.meta.campaignId)} • Mark Alexander · <a href="mailto:mark@trevor.services">mark@trevor.services</a>
  </footer>
</div>
</body>
<script>
const TrudyExportToggles = (() => {
  const checkboxSelector = '[data-toggle-target]'
  const checkboxes = Array.from(document.querySelectorAll(checkboxSelector))
  if (!checkboxes.length) return

  const map = new Map()
  checkboxes.forEach((checkbox) => {
    const targetId = checkbox.getAttribute('data-toggle-target')
    if (!targetId) return
    const section = document.querySelector(\`[data-section-id=\"\${targetId}\"]\`)
    const tocItem = document.querySelector(\`.contents li[data-section-id=\"\${targetId}\"]\`)
    map.set(checkbox, { section, tocItem })
  })

  const sync = () => {
    let hiddenCount = 0
    map.forEach(({ section, tocItem }, checkbox) => {
      const checked = checkbox.checked
      if (!checked) hiddenCount += 1
      if (section) section.classList.toggle('is-hidden', !checked)
      if (tocItem) tocItem.classList.toggle('is-hidden', !checked)
    })
    document.body.classList.toggle('has-hidden-sections', hiddenCount > 0)
  }

  map.forEach((_, checkbox) => {
    checkbox.addEventListener('change', sync)
  })
  sync()

  const handleAction = (action) => {
    const shouldCheck = action === 'all'
    map.forEach((_, checkbox) => {
      checkbox.checked = shouldCheck
    })
    sync()
  }

  document.addEventListener('click', (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const action = target.getAttribute('data-toggle-action')
    if (!action) return
    event.preventDefault()
    handleAction(action)
  })
})()
</script>
</html>`
}
