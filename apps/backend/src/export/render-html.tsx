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

function toNumber(value: any): number | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const cleaned = trimmed.replace(/[, ]+/g, '')
    const direct = Number(cleaned)
    if (Number.isFinite(direct)) return direct
    const match = trimmed.match(/-?\d+(?:\.\d+)?/)
    return match ? Number(match[0]) : null
  }
  return null
}

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

type Archetype =
  | 'VALUE_LED_HERO'
  | 'GWP_ONLY'
  | 'PRIZE_LADDER'
  | 'IP_PROMO'
  | 'FINANCE_ASSURED'

export function renderClientDeck(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const spec = snapshot.context?.briefSpec || {}
  const evaluationMeta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const detectedArchetype = detectArchetype(spec, evaluationMeta)
  const archetype = normalizeArchetype(detectedArchetype, evaluationMeta)
  const upgradeRaw = pickRecommendedUpgradeOption(evaluationMeta?.multiAgentImprovement)
  const upgradeOption = normalizeUpgradeOption(
    upgradeRaw ? enforceSimpleLadderOption(upgradeRaw, evaluationMeta, spec) : null,
    spec
  )
  const brand = preferredBrand(snapshot.context) || snapshot.campaign.clientName || snapshot.campaign.title
  const title = `${brand} — ${snapshot.campaign.title}`
  const verdict = opts.judgeVerdict?.verdict || snapshot.offerIQ?.verdict || 'REVIEW'
  const timestamp = opts.timestamp || new Date().toISOString()
  const misaligned = buildMustFixList(evaluationMeta, archetype, spec)
  const changeSummary = buildChangeSummary(evaluationMeta, spec, archetype, upgradeOption)
  const runThisParagraph = buildRunThisParagraph(spec, evaluationMeta, archetype, upgradeOption)
  const pageStyles = `
  <style>
    :root{
      --bg:#f3f4f8;
      --page:#ffffff;
      --ink:#0f172a;
      --muted:#5b6475;
      --card:#f7f9fc;
      --border:rgba(15,23,42,0.08);
      --accent:${opts.theme?.accent || '#0ea5e9'};
    }
    body{
      font-family:"IBM Plex Sans","Inter","Segoe UI",sans-serif;
      background:var(--bg);
      color:var(--ink);
      margin:0;
      padding:48px 20px;
      line-height:1.55;
    }
    .deck{max-width:960px;margin:0 auto;}
    .page{
      background:var(--page);
      border-radius:28px;
      padding:36px 40px;
      margin-bottom:32px;
      box-shadow:0 35px 70px rgba(15,23,42,0.08);
    }
    h1{margin:0;font-size:30px;font-weight:600;}
    h2{margin:0 0 12px;font-size:24px;font-weight:600;}
    h3{
      margin:28px 0 8px;
      font-size:15px;
      letter-spacing:0.12em;
      text-transform:uppercase;
      color:var(--muted);
    }
    ul{padding-left:20px;margin:8px 0;}
    li+li{margin-top:4px;}
    .badge{
      display:inline-flex;
      align-items:center;
      border-radius:999px;
      border:1px solid rgba(15,23,42,0.15);
      padding:4px 14px;
      font-size:12px;
      letter-spacing:0.08em;
      text-transform:uppercase;
      margin-top:12px;
      background:rgba(14,165,233,0.08);
    }
    .badge--go{border-color:#10b981;color:#047857;background:rgba(16,185,129,0.12);}
    .badge--iterate{border-color:#f97316;color:#9a3412;background:rgba(249,115,22,0.12);}
    .badge--review{border-color:#facc15;color:#854d0e;background:rgba(250,204,21,0.12);}
    .meta-row{display:flex;justify-content:space-between;color:var(--muted);font-size:13px;margin-bottom:12px;}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:18px;}
    .card{
      border:1px solid var(--border);
      border-radius:18px;
      padding:18px;
      background:var(--card);
    }
    .card h3:first-child{margin-top:0;}
    .comparison{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:28px;}
    .room-callout{
      border:1px solid rgba(15,23,42,0.12);
      border-radius:22px;
      padding:22px;
      background:#fff8f2;
      margin-bottom:22px;
    }
    .room-lists{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:24px;}
    .room-list-card ul{padding-left:18px;margin:0;}
    .appendix details{
      border:1px solid var(--border);
      border-radius:18px;
      margin-bottom:12px;
      background:var(--card);
    }
    .appendix summary{
      cursor:pointer;
      padding:14px 18px;
      font-weight:600;
      list-style:none;
    }
    .appendix summary::-webkit-details-marker{display:none;}
    .appendix details[open] summary{border-bottom:1px solid var(--border);}
    .appendix .appendix-body{padding:18px;}
  </style>`
  const verdictPage = `
    <section class="page page--verdict">
      <div class="meta-row"><span>${timestamp}</span><span>${escapeHtml(snapshot.context?.market || '')}</span></div>
      <h1>${escapeHtml(title)}</h1>
      <div class="badge badge--${escapeHtml(String(verdict).toLowerCase())}">Trudy verdict — ${escapeHtml(String(verdict))}</div>
      <p>${escapeHtml(runThisParagraph)}</p>
      <h3>What’s misaligned</h3>
      ${renderListOrParagraph(misaligned)}
      <h3>What Trudy changed</h3>
      ${renderListOrParagraph(changeSummary.after, changeSummary.before)}
      <h3>Run this</h3>
      <p>${escapeHtml(buildRecommendationLine(spec, evaluationMeta, archetype, upgradeOption))}</p>
    </section>
  `
  const mechanicSteps = upgradeOption?.mechanic
    ? buildMechanicStepsFromText(upgradeOption.mechanic)
    : buildMechanicSteps(evaluationMeta, spec)
  const hooksList = buildHookList(snapshot, spec, archetype, upgradeOption)
  const brandHost = buildBrandHostLine(spec, brand)
  const beforeAfterHtml = buildBeforeAfterComparison(spec, evaluationMeta, archetype, upgradeOption)
  const promoPage = `
    <section class="page page--plan">
      <h2>Recommended Promotion</h2>
      <div class="grid">
        <div class="card">
          <h3>Value story</h3>
          <p>${escapeHtml(summarisePlanValueStory(spec, upgradeOption))}</p>
        </div>
        <div class="card">
          <h3>Hero story</h3>
          <p>${archetype === 'GWP_ONLY' ? 'No hero required — the guaranteed gift does the heavy lifting.' : escapeHtml(summariseHeroStory(spec, evaluationMeta) || 'Use the hero overlay purely as theatre.')}</p>
        </div>
        <div class="card">
          <h3>Mechanic</h3>
          <ol>${mechanicSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        </div>
        <div class="card">
          <h3>Hooks & brand role</h3>
          <ul>${hooksList.map((hook) => `<li>${escapeHtml(hook)}</li>`).join('')}</ul>
          ${brandHost ? `<p>${escapeHtml(brandHost)}</p>` : ''}
          <p>${escapeHtml(summariseFinanceRisk(spec, evaluationMeta) || '')}</p>
        </div>
      </div>
      ${beforeAfterHtml}
    </section>
  `
  const roomSummary = buildRoomSummaryCards(evaluationMeta, archetype, spec)
  const roomPage = `
    <section class="page page--room">
      <h2>Inside the Trudy Room</h2>
      <div class="room-callout">
        <div class="badge">Room verdict — ${escapeHtml(roomSummary.verdict)}</div>
        ${roomSummary.notes ? `<p>${escapeHtml(roomSummary.notes)}</p>` : ''}
        ${
          roomSummary.topReasons.length
            ? `<ul>${roomSummary.topReasons.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
            : ''
        }
      </div>
      ${
        roomSummary.cards.length
          ? `<div class="grid">
              ${roomSummary.cards
                .map(
                  (card) => `
                    <div class="card">
                      <h3>${escapeHtml(card.agent)}</h3>
                      <div class="badge">${escapeHtml(card.verdict)}</div>
                      <p>${escapeHtml(card.headline)}</p>
                      ${
                        card.points.length
                          ? `<ul>${card.points.map((pt) => `<li>${escapeHtml(pt)}</li>`).join('')}</ul>`
                          : ''
                      }
                    </div>
                  `
                )
                .join('')}
            </div>`
          : '<p>No agent dialogue captured.</p>'
      }
      <div class="room-lists">
        ${renderRoomListCard('Must-fix', roomSummary.mustFix)}
        ${renderRoomListCard('Quick wins', roomSummary.quickWins)}
      </div>
    </section>
  `
  const appendix = renderAppendixSection(snapshot, opts)
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title
  )}</title>${pageStyles}</head><body><div class="deck">${verdictPage}${promoPage}${roomPage}${appendix}</div></body></html>`

  const timestampClean = opts.timestamp || new Date().toISOString().replace('T', ' ').slice(0, 19)
  const chips: string[] = []
  if (opts.judgeVerdict?.score != null) chips.push(`Judge ${opts.judgeVerdict.score}/100`)
  if (opts.judgeVerdict?.verdict) chips.push(`Verdict ${opts.judgeVerdict.verdict}`)

  const summaryModel: SummaryModel = {
    meta: {
      campaignId: snapshot.campaign.id,
      campaignTitle: snapshot.campaign.title,
      brand,
      documentTitle: title,
      timestamp: timestampClean,
      accent: opts.theme?.accent || '#0ea5e9',
      chips,
    },
    sections: [
      { id: 'verdict', title: 'Trudy Verdict', html: verdictPage },
      { id: 'plan', title: 'Recommended Promotion', html: promoPage },
      { id: 'room', title: 'Inside the Trudy Room', html: roomPage },
    ],
    governance: {
      blockers: [],
      warnings: misaligned,
    },
    references: {
      rider: snapshot.narratives?.synthesis?.raw || snapshot.narratives?.synthesis?.sanitized || null,
    },
    copyBlocks: [],
  }

  return { html, title, accent: opts.theme?.accent || '#0ea5e9', model: summaryModel }
}

function detectArchetype(spec: Record<string, any>, meta?: any): Archetype {
  const rewardPosture = String(spec?.rewardPosture || '').toUpperCase()
  const hasCashback = Boolean(spec?.cashback && hasMeaningfulCashbackPayload(spec.cashback))
  const hasGwp = Boolean(spec?.gwp && (spec.gwp.item || spec.gwp.triggerQty != null || spec.gwp.cap))
  const hasHero =
    (typeof spec?.heroPrize === 'string' && spec.heroPrize.trim()) ||
    (typeof spec?.majorPrizeOverlay === 'string' && spec.majorPrizeOverlay.trim())
  const hasIp = Boolean(spec?.ipTieIn?.franchise)
  const simpleLadderPreferred = Boolean(meta?.simpleLadderPreferred)
  if (hasIp) return 'IP_PROMO'
  if (simpleLadderPreferred && (hasCashback || hasGwp || hasHero)) return 'VALUE_LED_HERO'
  if (hasCashback && hasHero) return 'VALUE_LED_HERO'
  if (hasGwp && !hasHero) return 'GWP_ONLY'
  if (rewardPosture === 'ASSURED' && hasCashback) return 'FINANCE_ASSURED'
  return 'PRIZE_LADDER'
}

function normalizeArchetype(archetype: Archetype, meta?: any): Archetype {
  if (archetype === 'VALUE_LED_HERO') return archetype
  if (meta?.simpleLadderPreferred) return 'VALUE_LED_HERO'
  return archetype
}

function renderListOrParagraph(primary: string[] = [], fallback: string[] = []) {
  const lines = primary.filter(Boolean)
  if (!lines.length && fallback.length) return renderListOrParagraph(fallback, [])
  if (!lines.length) return '<p>No critical issues.</p>'
  return `<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
}

function buildMustFixList(meta: any, archetype?: Archetype, spec: Record<string, any> = {}): string[] {
  const mustFix: string[] = []
  const bruce = meta?.multiAgentEvaluation?.bruce
  const valueLedSpec = hasMeaningfulCashbackPayload(spec?.cashback || null) || Boolean(spec?.assuredValue || spec?.gwp)
  const effectiveArchetype =
    archetype === 'VALUE_LED_HERO' || meta?.simpleLadderPreferred || valueLedSpec ? 'VALUE_LED_HERO' : archetype
  if (bruce?.must_fix_items) {
    mustFix.push(
      ...bruce.must_fix_items
        .map((line: string) => scrubLineForArchetype(line, effectiveArchetype))
        .filter(Boolean)
    )
  }
  return mustFix.slice(0, 4)
}

function buildChangeSummary(meta: any, spec: Record<string, any>, archetype: Archetype, upgrade: any | null) {
  const before: string[] = []
  const after: string[] = []
  before.push(`Original plan: ${summariseValueStory(spec)}`)
  if (archetype !== 'GWP_ONLY') {
    const heroBefore = summariseHeroStory(spec, meta)
    if (heroBefore) before.push(`Hero overlay as briefed: ${heroBefore}`)
  }
  if (upgrade?.summary) {
    after.push(upgrade.summary)
  }
  if (upgrade?.mechanic) {
    after.push(`Mechanic: ${tidySentence(upgrade.mechanic)}`)
  }
  if (!after.length) {
    if (archetype === 'GWP_ONLY') {
      after.push('Recommendation: keep it a pure guaranteed gift; use pub ritual/story for theatre instead of faux cadence.')
    } else {
      after.push('Recommendation: tighten the value story and make the hero feel premium without clutter.')
    }
  }
  return { before, after }
}

function buildRunThisParagraph(
  spec: Record<string, any>,
  meta: any,
  archetype: Archetype,
  upgrade: any | null
): string {
  const parts: string[] = []
  appendUniqueLine(parts, summarisePlanValueStory(spec, upgrade))
  appendUniqueLine(parts, archetype === 'GWP_ONLY' ? '' : summariseHeroStory(spec, meta))
  appendUniqueLine(parts, upgrade?.mechanic || '')
  appendUniqueLine(parts, upgrade?.summary || '')
  appendUniqueLine(parts, summariseFinanceRisk(spec, meta))
  return parts.join(' ')
}

function buildRecommendationLine(
  spec: Record<string, any>,
  meta: any,
  archetype: Archetype,
  upgrade: any | null
): string {
  const parts: string[] = []
  appendUniqueLine(parts, summarisePlanValueStory(spec, upgrade))
  appendUniqueLine(parts, archetype === 'GWP_ONLY' ? '' : summariseHeroStory(spec, meta))
  appendUniqueLine(parts, upgrade?.mechanic || '')
  appendUniqueLine(parts, upgrade?.summary || '')
  appendUniqueLine(parts, summariseFinanceRisk(spec, meta))
  return parts.join(' ')
}

function summariseValueStory(spec: Record<string, any>): string {
  if (spec?.cashback && hasMeaningfulCashbackPayload(spec.cashback)) {
    const amount = toNumber(spec.cashback.amount ?? spec.cashback.basePayout ?? null)
    const processing =
      spec.cashback.processingDays != null ? ` within ${spec.cashback.processingDays} days` : ''
    if (amount) return `Every eligible purchase triggers $${Math.round(amount)} cashback${processing}.`
    const percent = toNumber(spec.cashback.percent ?? null)
    if (percent) return `Every eligible purchase returns ${percent}% of spend${processing}.`
    return 'Guaranteed cashback is the base value; keep comms tight.'
  }
  if (spec?.gwp && (spec.gwp.item || spec.gwp.triggerQty != null)) {
    const trigger =
      spec.gwp.triggerQty != null ? `Buy ${spec.gwp.triggerQty}` : 'Buy the participating products'
    return `${trigger} and receive ${spec.gwp.item || 'the guaranteed gift'} instantly.`
  }
  if (Array.isArray(spec?.assuredItems) && spec.assuredItems.length) {
    return `Every entrant receives ${spec.assuredItems.join(', ')}; no raffle required.`
  }
  return 'Deliver clear value to every entrant; detail pending.'
}

function summarisePlanValueStory(spec: Record<string, any>, upgrade: any | null): string {
  if (upgrade) {
    const baseValue = describeBaseValueOption(upgrade?.base_value || upgrade?.offer?.base_value || null)
    if (baseValue) return baseValue.endsWith('.') ? baseValue : `${baseValue}.`
    const threshold = extractThresholdFromMechanic(upgrade?.mechanic || '')
    if (threshold && spec?.gwp?.item) {
      return `Buy ${threshold} and receive ${spec.gwp.item} instantly.`
    }
  }
  return summariseValueStory(spec)
}

function summariseHeroStory(spec: Record<string, any>, meta: any): string {
  const heroPrize = cleanText(spec?.heroPrize || spec?.majorPrizeOverlay || '')
  if (heroPrize) {
    const count = spec?.heroPrizeCount ? ` (${spec.heroPrizeCount} winners)` : ''
    return `${heroPrize}${count}`
  }
  const upgrade = pickRecommendedUpgradeOption(meta?.multiAgentImprovement)
  if (upgrade?.hero_overlay) return upgrade.hero_overlay
  return ''
}

function summariseFinanceRisk(spec: Record<string, any>, meta: any): string {
  if (spec?.cashback && hasMeaningfulCashbackPayload(spec.cashback)) {
    const cap = spec.cashback.cap
    if (!cap || String(cap).trim().toUpperCase() === 'UNLIMITED') {
      return 'Finance note: cashback liability is open—cap claims or insure the upside.'
    }
  }
  if (meta?.liabilityStatus === 'OPEN') {
    return 'Finance note: Liability flagged as OPEN; align Finance before launch.'
  }
  return ''
}

function hasMeaningfulCashbackPayload(cashback: any): boolean {
  if (!cashback || typeof cashback !== 'object') return false
  const amount = toNumber(cashback.amount ?? cashback.basePayout ?? cashback.topPayout ?? null)
  if (amount) return true
  const percent = toNumber(cashback.percent ?? null)
  if (percent) return true
  if (cashback.cap && String(cashback.cap).trim()) return true
  if (cashback.processingDays != null && String(cashback.processingDays).trim()) return true
  if (typeof cashback.odds === 'string' && cashback.odds.trim().length) return true
  if (typeof cashback.headline === 'string' && cashback.headline.trim().length) return true
  if (Array.isArray((cashback as any).bands) && cashback.bands.length) return true
  return false
}

function extractThresholdFromMechanic(text: string): string | null {
  if (!text) return null
  const match = text.match(/\bbuy\s+(\d+)/i)
  return match ? match[1] : null
}

function scrubLineForArchetype(line: string, archetype?: Archetype): string {
  let out = cleanText(line)
  if (!out) return ''
  if ((archetype === 'GWP_ONLY' || archetype === 'FINANCE_ASSURED')) {
    if (/runner|cadence|weekly/i.test(out)) return ''
    out = out.replace(/lower the entry threshold[^.]+/gi, '').trim()
  }
  if (archetype === 'VALUE_LED_HERO') {
    if (/(add|increas)[^.]*runner/i.test(out)) return ''
    if (/(add|increas)[^.]*hero/i.test(out)) return ''
    if (/cadence|weekly|mass winner/i.test(out)) return ''
  }
  return out
}

function buildHookList(
  snapshot: SnapshotRich,
  spec: Record<string, any>,
  archetype: Archetype,
  upgrade?: any | null
): string[] {
  const hooks = new Set<string>()
  if (Array.isArray(upgrade?.hooks)) {
    upgrade.hooks.forEach((hook: string) => {
      const clean = scrubHookLine(hook, archetype)
      if (clean) hooks.add(clean)
    })
  }
  const evaluationMeta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const evaluationHooks = evaluationMeta?.ui?.hookOptions || []
  evaluationHooks.forEach((hook: string) => {
    const clean = scrubHookLine(hook, archetype)
    if (clean) hooks.add(clean)
  })
  if (Array.isArray(snapshot.hooksTop)) {
    snapshot.hooksTop.forEach((hook) => {
      const clean = scrubHookLine(hook, archetype)
      if (clean) hooks.add(clean)
    })
  }
  const cleaned = Array.from(hooks).slice(0, 3)
  if (cleaned.length) return cleaned
  return buildDefaultHooks(spec, archetype, evaluationMeta)
}

function scrubHookLine(line: string, archetype: Archetype): string {
  let output = cleanText(line)
  if (!output) return ''
  if (
    (archetype === 'GWP_ONLY' || archetype === 'FINANCE_ASSURED' || archetype === 'VALUE_LED_HERO') &&
    /limited[^.]*chance/i.test(output)
  ) {
    return ''
  }
  if (/double pass/i.test(output) && !/double/i.test(output)) {
    output = output.replace(/pass/gi, 'double pass')
  }
  if (output.length < 32) return ''
  if (
    (archetype === 'VALUE_LED_HERO' || archetype === 'FINANCE_ASSURED') &&
    !/\b(cash|back|money|guarantee|chef|experience|draw|win|gift|receive)\b/i.test(output)
  ) {
    return ''
  }
  return output
}

function buildDefaultHooks(spec: Record<string, any>, archetype: Archetype, meta: any): string[] {
  const hooks: string[] = []
  const valueLine = summariseValueStory(spec)
  if (valueLine) {
    hooks.push(valueLine.replace(/^Every eligible purchase triggers/i, 'Get').replace(/within/i, 'inside'))
  }
  if (archetype !== 'GWP_ONLY') {
    const heroLine = summariseHeroStory(spec, meta)
    if (heroLine) hooks.push(`Plus ${heroLine} as a premium overlay.`)
  }
  const mechanic = cleanText(spec?.mechanicOneLiner || spec?.hook || '')
  if (mechanic) hooks.push(mechanic)
  return hooks.filter(Boolean).slice(0, 3)
}

function tidySentence(text: string): string {
  if (!text) return ''
  return text.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '')
}

function appendUniqueLine(list: string[], text: string | null | undefined) {
  const line = tidySentence(text || '')
  if (!line) return
  const key = line.toLowerCase()
  if (list.some((entry) => entry.toLowerCase() === key)) return
  list.push(line.endsWith('.') ? line : `${line}.`)
}

function buildBeforeAfterComparison(spec: Record<string, any>, meta: any, archetype: Archetype, upgrade: any | null) {
  const beforeValue = tidySentence(summariseValueStory(spec))
  const beforeHero = archetype === 'GWP_ONLY' ? '' : tidySentence(summariseHeroStory(spec, meta))
  const beforeMechanic = tidySentence(cleanText(spec?.mechanicOneLiner || spec?.entryMechanic || ''))
  const beforeLines = [
    beforeValue ? `Base — ${beforeValue}` : null,
    beforeHero ? `Hero overlay — ${beforeHero}.` : 'Hero overlay — none; base value carries the story.',
    beforeMechanic ? `Mechanic — ${beforeMechanic}.` : null,
  ].filter(Boolean)

  if (!upgrade) return ''

  const afterBase = tidySentence(summarisePlanValueStory(spec, upgrade))
  const afterHero =
    archetype === 'GWP_ONLY'
      ? ''
      : tidySentence(describeHeroTierFromOption(upgrade) || summariseHeroStory(spec, meta) || '')
  const afterMechanic = tidySentence(cleanText(upgrade?.mechanic || ''))
  const afterSummary = upgrade?.summary ? tidySentence(upgrade.summary) : ''
  const afterLines = [
    afterBase ? `Base — ${afterBase}.` : null,
    afterHero ? `Hero — ${afterHero}.` : null,
    afterMechanic ? `Mechanic — ${afterMechanic}.` : null,
    afterSummary ? afterSummary : null,
  ].filter(Boolean)

  if (!beforeLines.length && !afterLines.length) return ''
  return `
    <div class="comparison">
      <div class="card">
        <h3>Before Trudy</h3>
        <ul>${beforeLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>
      <div class="card">
        <h3>Trudy plan</h3>
        <ul>${afterLines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>
    </div>
  `
}

function buildRoomSummaryCards(meta: any, archetype: Archetype, spec: Record<string, any>) {
  const room = meta?.multiAgentEvaluation || {}
  const agents = Array.isArray(room.agents) ? room.agents : []
  const bruce = room.bruce || {}
  const metaForCards =
    archetype === 'VALUE_LED_HERO' && !meta?.simpleLadderPreferred ? { ...meta, simpleLadderPreferred: true } : meta
  let cards = agents.slice(0, 4).map((agent: any) => {
    const headline = sanitizeDeckAgentHeadline(agent?.headline || '', metaForCards, archetype)
    const points = scrubValueLedLines(Array.isArray(agent?.key_points) ? agent.key_points.slice(0, 3) : [], metaForCards)
    return {
      agent: agent?.agent || 'Agent',
      verdict: agent?.verdict || 'ITERATE',
      headline: headline || 'Focus on the guaranteed value; let the hero be theatre.',
      points,
    }
  })
  if (!cards.length) {
    cards = [
      {
        agent: 'OfferIQ',
        verdict: meta?.offerIQVerdict || 'ITERATE',
        headline: 'Multi-agent evaluation not captured for this campaign.',
        points: [],
      },
    ]
  }
  const mustFix = buildMustFixList(meta, archetype, spec)
  const quickWins = scrubValueLedLines(
    Array.isArray(bruce.quick_wins) ? bruce.quick_wins.slice(0, 4) : [],
    metaForCards
  )
  const topReasons = scrubValueLedLines(
    Array.isArray(bruce.top_reasons) ? bruce.top_reasons.slice(0, 3) : [],
    metaForCards
  )
  const verdict = bruce.verdict || room.verdict || 'ITERATE'
  const notes = cleanText(bruce.notes || '')
  return { cards, mustFix, quickWins, topReasons, verdict, notes }
}

function sanitizeDeckAgentHeadline(line: string, meta: any, archetype: Archetype) {
  const cleaned = cleanText(line)
  if (!cleaned) return ''
  if (archetype === 'VALUE_LED_HERO' && /(runner|cadence|weekly|more winner)/i.test(cleaned)) {
    return 'Keep the hero overlay limited; cashback already delivers fairness.'
  }
  return sanitizeValueLedLine(cleaned, meta)
}

function renderRoomListCard(title: string, lines: string[]) {
  const safeLines = (lines || []).filter(Boolean)
  if (!safeLines.length) {
    return `<div class="card room-list-card"><h3>${escapeHtml(title)}</h3><p>No ${escapeHtml(
      title.toLowerCase()
    )} captured.</p></div>`
  }
  return `<div class="card room-list-card"><h3>${escapeHtml(title)}</h3><ul>${safeLines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('')}</ul></div>`
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
  const sections: Array<{ id: string; title: string; html: string }> = []
  const add = (id: string, title: string, html: string) => {
    if (!html) return
    sections.push({ id, title, html })
  }

  add('executive', 'Trudy Verdict at a Glance', renderExecutiveSummary(snapshot, opts))
  add('promo-plan', 'Recommended Promotion', renderPromoPlanSection(snapshot, opts))
  add('room', 'Inside the Trudy Room', renderRoomSummarySection(snapshot))
  const appendixHtml = renderAppendixSection(snapshot, opts)
  if (appendixHtml) {
    add('appendix', 'Appendix — Framing & Evaluation', appendixHtml)
  }
  return sections
}

function renderExecutiveSummary(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const brand = preferredBrand(snapshot.context) || snapshot.campaign.clientName || snapshot.campaign.title
  const verdict = opts.judgeVerdict?.verdict || snapshot.offerIQ?.verdict || 'Review'
  const verdictLabel = `Trudy verdict — ${verdict}`
  const evaluationMeta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const recommendedUpgradeRaw = pickRecommendedUpgradeOption(evaluationMeta?.multiAgentImprovement)
  const recommendedUpgrade = enforceSimpleLadderOption(
    recommendedUpgradeRaw,
    evaluationMeta,
    snapshot.context?.briefSpec || {}
  )
  const upgradeSummary = summarizeUpgradeOption(recommendedUpgrade)
  const baselineSummary = summarizeBaselineLadder(snapshot)
  const bullets = buildUpgradeBullets(recommendedUpgrade, snapshot)
  const chipRecommended = recommendedUpgrade
    ? `<div class="hero-chip is-bold">Recommended — ${escapeHtml(String(recommendedUpgrade.label || 'Upgrade'))}</div>`
    : ''

  return `
    <div class="hero-summary">
      <div class="hero-head">
        <div class="hero-head__copy">
          <p class="hero-eyebrow">${escapeHtml(snapshot.context?.market || 'Campaign')}</p>
          <h1>${escapeHtml(snapshot.campaign.title)}</h1>
          <p class="hero-brand">${escapeHtml(brand)}</p>
        </div>
        <div class="hero-pills">
          <div class="hero-chip">${escapeHtml(verdictLabel)}</div>
          ${chipRecommended}
        </div>
      </div>
      <div class="hero-bullets">
        <h3>What Trudy changed</h3>
        <ul>
          ${bullets.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}
        </ul>
      </div>
      <div class="hero-ladders">
        ${renderMiniLadderCard('Before Trudy', baselineSummary)}
        ${renderMiniLadderCard('Trudy plan', upgradeSummary)}
      </div>
    </div>
  `
}

function renderPromoPlanSection(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const meta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const recommendedUpgrade = enforceSimpleLadderOption(
    pickRecommendedUpgradeOption(meta?.multiAgentImprovement),
    meta,
    snapshot.context?.briefSpec || {}
  )
  const ladderDetails = recommendedUpgrade ? describeUpgradeValueHeadline(recommendedUpgrade) : null
  const heroCard = recommendedUpgrade ? renderDetailedLadder(recommendedUpgrade) : ''

  const mechanicSteps = buildMechanicSteps(meta)
  const hooks = buildHookLines(snapshot, recommendedUpgrade, snapshot.context?.briefSpec || {})
  const brandHostLine = buildBrandHostLine(snapshot.context?.briefSpec || {}, preferredBrand(snapshot.context) || snapshot.campaign.clientName || snapshot.campaign.title)
  const cadenceLine = describeCadenceLine(recommendedUpgrade, meta, snapshot.offerIQ)

  return `
    <div class="promo-plan">
      <div class="promo-ladder">
        <div class="promo-card">
          <div class="promo-card__eyebrow">Recommended ladder</div>
          ${heroCard || `<p>${escapeHtml(ladderDetails || 'Upgrade plan will populate once Bruce recommends an option.')}</p>`}
        </div>
        <div class="promo-card promo-card--note">
          <div class="promo-card__eyebrow">Budget & cadence</div>
          <p>${escapeHtml(cadenceLine || 'Cadence will be finalised once prize maths are locked.')}</p>
        </div>
      </div>
      <div class="promo-mechanic">
        <div class="promo-mechanic__col">
          <div class="promo-card">
            <div class="promo-card__eyebrow">Mechanic</div>
            <ol>${mechanicSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
          </div>
        </div>
        <div class="promo-mechanic__col">
          <div class="promo-card">
            <div class="promo-card__eyebrow">Hooks</div>
            <ul>${hooks.map((hook) => `<li>${escapeHtml(hook)}</li>`).join('')}</ul>
          </div>
          ${brandHostLine ? `<div class="promo-card promo-card--soft"><div class="promo-card__eyebrow">Brand host</div><p>${escapeHtml(brandHostLine)}</p></div>` : ''}
        </div>
      </div>
    </div>
  `
}

function renderRoomSummarySection(snapshot: SnapshotRich) {
  const meta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const room = meta?.multiAgentEvaluation || {}
  const agents = Array.isArray(room.agents) ? room.agents : []
  const bruce = room.bruce || {}
  if (!agents.length && !bruce.verdict) {
    return '<p>Multi-agent evaluation not captured for this campaign.</p>'
  }

  const agentCards = agents
    .map((agent: any) => {
      const verdict = agent.verdict || 'ITERATE'
      const headline = sanitizeValueLedLine(agent.headline || `Review from ${agent.agent}`, meta)
      const points = scrubValueLedLines(Array.isArray(agent.key_points) ? agent.key_points.slice(0, 3) : [], meta)
      return `<div class="agent-card">
        <div class="agent-card__head">
          <div>
            <div class="agent-name">${escapeHtml(agent.agent || 'Agent')}</div>
            <div class="agent-verdict agent-verdict--${escapeHtml(verdict.toLowerCase())}">${escapeHtml(verdict)}</div>
          </div>
        </div>
        <p class="agent-headline">${escapeHtml(headline)}</p>
    <ul>${points.map((pt: string) => `<li>${escapeHtml(pt)}</li>`).join('')}</ul>
      </div>`
    })
    .join('')

  const mustFix = scrubValueLedLines(Array.isArray(bruce.must_fix_items) ? bruce.must_fix_items.slice(0, 5) : [], meta)

  return `
    <div class="room-summary">
      <div class="room-callout">
        <p class="room-verdict">Bruce verdict — ${escapeHtml(bruce.verdict || 'ITERATE')}</p>
        ${mustFix.length ? `<ul>${mustFix.map((item: string) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>No must-fix items.</p>'}
      </div>
      <div class="room-grid">
        ${agentCards}
      </div>
    </div>
  `
}

function renderAppendixSection(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const framingHtml = renderFramingSection(snapshot)
  const evaluationHtml = renderEvaluationSection(snapshot, opts)
  const toggles: string[] = []
  if (framingHtml) {
    toggles.push(`
      <details class="appendix-toggle">
        <summary>Framing detail</summary>
        <div class="appendix-body">${framingHtml}</div>
      </details>
    `)
  }
  if (evaluationHtml) {
    toggles.push(`
      <details class="appendix-toggle">
        <summary>Evaluation detail</summary>
        <div class="appendix-body">${evaluationHtml}</div>
      </details>
    `)
  }
  if (!toggles.length) return ''
  return `
    <section class="page page--appendix">
      <h2>Appendix (internal)</h2>
      <div class="appendix">
        ${toggles.join('')}
      </div>
    </section>
  `
}

function enforceSimpleLadderOption(option: any | null, meta: any, spec: Record<string, any>): any | null {
  if (!option) return null
  if (!shouldForceSimpleLadder(meta, spec)) return option
  const clone: any = {
    ...option,
    runner_up_prize_count: 0,
    runner_up_prizes: [],
  }
  if (Array.isArray(option.runner_up_prizes)) {
    clone.runner_up_prizes = []
  }
  if (clone.offer) {
    clone.offer = { ...clone.offer, runner_up_prizes: [], runner_up_prize_count: 0 }
  }
  return clone
}

function shouldForceSimpleLadder(meta: any, spec: Record<string, any>): boolean {
  if (meta?.simpleLadderPreferred) return true
  const posture = String(spec?.rewardPosture || '').toUpperCase()
  if (posture !== 'ASSURED') return false
  const hasHero =
    (typeof spec?.majorPrizeOverlay === 'string' && Boolean(spec.majorPrizeOverlay.trim())) ||
    (typeof spec?.heroPrize === 'string' && Boolean(spec.heroPrize.trim()))
  if (!hasHero) return false
  const cashbackAmount = spec?.cashback?.amount
  const cashbackPercent = spec?.cashback?.percent
  const hasCashback = Number(cashbackAmount || cashbackPercent || 0) > 0
  const assuredItems = Array.isArray(spec?.assuredItems) && spec.assuredItems.length > 0
  return hasCashback || assuredItems
}

type LadderSummary = {
  hero?: string
  runners?: string[]
  budget?: string
  cadence?: string
}

function summarizeBaselineLadder(snapshot: SnapshotRich): LadderSummary {
  const diagnostics = snapshot.offerIQ?.diagnostics || {}
  const heroLabel = snapshot.offerIQ?.heroOverlay?.label || snapshot.offerIQ?.storyNotes?.[0] || ''
  const heroCount = snapshot.offerIQ?.heroOverlay?.count || diagnostics.heroCount || null
  const runnerCount = diagnostics.totalWinners && heroCount ? diagnostics.totalWinners - heroCount : diagnostics.totalWinners || null
  const runnerLabel = runnerCount ? `${formatCount(runnerCount)} other winners` : ''
  return {
    hero: heroLabel ? `${heroCount ? `${formatCount(heroCount)} × ` : ''}${heroLabel}` : '',
    runners: runnerLabel ? [runnerLabel] : [],
    budget: diagnostics.budgetNote || '',
    cadence: diagnostics.cadenceSignals ? (diagnostics.cadenceSignals ? 'Cadence visible' : '') : '',
  }
}

function summarizeUpgradeOption(option: any | null): LadderSummary {
  if (!option) return {}
  const hero = describeHeroTierFromOption(option)
  const runners = describeRunnerTierFromOption(option)
  const budget = option?.offer?.cashback != null ? `Cashback base — $${Number(option.offer.cashback).toLocaleString('en-US')}` : ''
  const trade = option?.trade_incentive ? `Trade: ${option.trade_incentive}` : ''
  return {
    hero: hero || '',
    runners,
    budget: trade || '',
    cadence: option?.cadence_comment || '',
  }
}

function renderMiniLadderCard(title: string, summary: LadderSummary) {
  return `<div class="mini-ladder-card">
    <div class="mini-ladder-card__title">${escapeHtml(title)}</div>
    <ul>
      ${summary?.hero ? `<li><strong>Hero</strong> — ${escapeHtml(summary.hero)}</li>` : ''}
      ${(summary?.runners || []).map((line) => `<li><strong>Winners</strong> — ${escapeHtml(line)}</li>`).join('')}
      ${summary?.budget ? `<li><strong>Budget</strong> — ${escapeHtml(summary.budget)}</li>` : ''}
    </ul>
  </div>`
}

function renderDetailedLadder(option: any) {
  const hero = describeHeroTierFromOption(option)
  const runners = describeRunnerTierFromOption(option)
  const baseValue = describeBaseValueOption(option?.base_value || option?.offer?.base_value || null)
  const runnerMessage = baseValue
    ? `${baseValue} is the mass value layer.`
    : 'Guaranteed value carries the mass value layer.'
  const runnersHtml = runners.length
    ? `<ul>${runners.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
    : `<p>No runner tier — ${escapeHtml(runnerMessage)}</p>`
  return `
    <div class="ladder-hero">
      <h4>Hero tier</h4>
      <p>${escapeHtml(hero || 'To be defined')}</p>
    </div>
    <div class="ladder-runners">
      <h4>Runner-ups</h4>
      ${runnersHtml}
    </div>
  `
}

function buildUpgradeBullets(option: any | null, snapshot: SnapshotRich): string[] {
  const meta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const spec = snapshot.context?.briefSpec || {}
  if (option && Array.isArray(option.why_this) && option.why_this.length) {
    const cleaned = scrubValueLedLines(option.why_this, meta)
    if (cleaned.length) return cleaned.slice(0, 3)
  }
  const defaults = meta?.simpleLadderPreferred
    ? [
        'Keep the structure clean: the guaranteed cashback carries fairness while the hero remains a limited premium draw.',
        'Sell the hero as theatre on its own cadence instead of inflating the ladder.',
        'Cap the cashback liability and highlight the guarantee on pack.',
      ]
    : [
        'Clarifies the ladder so hooks can promise specific odds.',
        'Keeps staff effort low with a one-screen mechanic.',
        'Stays inside the budget while feeling more generous.',
      ]
  if (meta?.simpleLadderPreferred) {
    const capRaw = spec?.cashback?.cap
    if (!capRaw || String(capRaw).trim().toUpperCase() === 'UNLIMITED') {
      defaults[2] = 'Align Finance on a claims cap, fund limit, or insurance for the cashback liability.'
    }
  }
  const diag = snapshot.offerIQ?.diagnostics
  if (diag?.budgetNote) defaults[2] = diag.budgetNote
  return defaults
}

function buildMechanicSteps(meta: any, spec: Record<string, any> = {}): string[] {
  const steps: string[] = []
  const raw = meta?.ui?.mechanic || meta?.mechanic || ''
  const fromArrows = raw.includes('→') ? raw.split('→') : raw.split(/[\n\.,]+/)
  fromArrows
    .map((segment: string) => cleanText(segment))
    .filter(Boolean)
    .forEach((line) => steps.push(line))

  const oneLiner = spec?.mechanicOneLiner || spec?.entryMechanic || ''
  if (steps.length < 3 && oneLiner) {
    oneLiner
      .split(/(?:→|,|then|\+)/i)
      .map((segment) => cleanText(segment))
      .filter(Boolean)
      .forEach((line) => steps.push(line))
  }

  if (steps.length < 3 && spec?.proofType && spec.proofType !== 'NONE') {
    steps.push('Upload proof of purchase online')
  }
  if (steps.length < 3 && spec?.processingTime && spec.processingTime !== 'INSTANT') {
    steps.push(`Receive the reward within ${spec.processingTime.toLowerCase()}`)
  }
  if (steps.length < 3 && spec?.cashback?.processingDays) {
    steps.push(`Cashback lands within ${spec.cashback.processingDays} days`)
  }
  if (steps.length < 3 && hasMeaningfulCashbackPayload(spec?.cashback)) {
    steps.push('Receive the cashback and be entered into the hero draw automatically')
  }

  let deduped = Array.from(new Set(steps.map((line) => cleanText(line)).filter(Boolean)))
  if (
    deduped.length < 4 &&
    hasMeaningfulCashbackPayload(spec?.cashback) &&
    !deduped.some((line) => /^receive/i.test(line))
  ) {
    deduped = [...deduped, 'Receive the cashback and sit in the hero draw at the end.']
  }
  if (deduped.length) return deduped.slice(0, 4)
  return ['Buy participating products', 'Upload or enter', 'Receive reward'].map((line) => cleanText(line))
}

function buildMechanicStepsFromText(text: string): string[] {
  if (!text) return []
  const steps = text
    .split(/(?:→|,|;|then|\+)/i)
    .map((segment) => cleanText(segment))
    .filter(Boolean)
  if (steps.length) return steps.slice(0, 4)
  return ['Buy', 'Enter', 'Receive reward']
}

function buildHookLines(snapshot: SnapshotRich, option: any | null, spec: Record<string, any>): string[] {
  const hooks: string[] = []
  if (option?.hooks) {
    hooks.push(...option.hooks)
  }
  const evalHooks = snapshot.narratives.evaluation?.meta?.ui?.hookOptions || []
  hooks.push(...evalHooks)
  const deduped = hooks
    .map((line) => sanitizeHookLine(cleanText(line), spec))
    .filter(Boolean)
  return Array.from(new Set(deduped)).slice(0, 4)
}

function describeCadenceLine(option: any | null, meta: any, offerIQ: any) {
  if (meta?.simpleLadderPreferred) {
    const baseValue = describeBaseValueOption(option?.base_value || option?.offer?.base_value || meta?.offer_state?.base_value || null)
    const guarantee = baseValue ? baseValue : 'The guaranteed value'
    return `${guarantee} carries fairness; the hero overlay is drawn at the promotion’s close as a PR-only theatre moment.`
  }
  const cadenceEntries = Array.isArray(meta?.multiAgentImprovement?.cadence_summary)
    ? meta.multiAgentImprovement.cadence_summary
    : []
  const match = option ? findOptionByLabel(cadenceEntries, option.label) : null
  if (match?.majors_text || match?.runners_text) {
    const hero = match.majors_text ? `Hero cadence — ${match.majors_text}` : null
    const runners = match.runners_text ? `Runner cadence — ${match.runners_text}` : null
    return [hero, runners].filter(Boolean).join(' • ')
  }
  if (offerIQ?.diagnostics?.budgetNote) return offerIQ.diagnostics.budgetNote
  return ''
}

function renderBriefSection(snapshot: SnapshotRich) {
  const html = snapshot.brief?.snapshot ? markdownToHtml(snapshot.brief.snapshot) : '<p>No brief snapshot saved.</p>'
  return html
}

function renderSparkSection(snapshot: SnapshotRich) {
  const payload: any = (snapshot as any).spark
  if (!payload) return '<p>No Spark concept captured for this campaign.</p>'
  const analysis = payload.analysis || {}
  const hookOptions = Array.isArray(payload?.hookPlayground?.options)
    ? payload.hookPlayground.options.filter((opt: any) => opt && typeof opt.headline === 'string').slice(0, 5)
    : []
  const cadenceIdeas = Array.isArray(payload?.hookPlayground?.cadence)
    ? payload.hookPlayground.cadence.filter((line: any) => typeof line === 'string' && line.trim()).slice(0, 5)
    : []
  const tensions = Array.isArray(analysis.tensions)
    ? analysis.tensions.filter((line: any) => typeof line === 'string' && line.trim()).slice(0, 4)
    : []
  const compliance = Array.isArray(analysis.compliance)
    ? analysis.compliance.filter((line: any) => typeof line === 'string' && line.trim()).slice(0, 4)
    : []

  const card = (title: string, body: string) => `<div class="spark-card"><h4>${escapeHtml(title)}</h4>${body}</div>`
  const textCard = (title: string, value?: string) =>
    value ? card(title, `<p>${escapeHtml(value)}</p>`) : ''
  const listCard = (title: string, values: string[]) =>
    values.length ? card(title, `<ul>${values.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`) : ''

  const valueLine =
    typeof analysis?.value?.description === 'string'
      ? analysis.value.description
      : (typeof analysis?.value?.summary === 'string' && analysis.value.summary) || ''
  const tradeLine = [analysis?.trade?.reward, analysis?.trade?.guardrail]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' • ')

  const cards = [
    textCard('Summary', analysis.summary),
    textCard('Audience', analysis.audience),
    textCard('Value lens', valueLine),
    textCard('Cadence', analysis.cadence),
    textCard('Trade cue', tradeLine),
    listCard('Shopper tensions', tensions as string[]),
    listCard('Compliance guardrails', compliance as string[]),
  ].filter(Boolean)

  const cardsHtml = cards.length ? `<div class="spark-grid">${cards.join('')}</div>` : ''

  const hookBadges = hookOptions
    .map(
      (opt: any) =>
        `<span class="spark-badge spark-badge--hooks"><strong>${escapeHtml(opt.headline)}</strong>${
          opt.support ? `<small>${escapeHtml(opt.support)}</small>` : ''
        }</span>`
    )
    .join('')
  const cadenceBadges = cadenceIdeas
    .map((line: string) => `<span class="spark-badge spark-badge--cadence">${escapeHtml(line)}</span>`)
    .join('')
  const badgeRow =
    hookBadges || cadenceBadges ? `<div class="spark-badge-row">${hookBadges}${cadenceBadges}</div>` : ''

  return `
    <div class="spark-panel">
      <div class="spark-panel-head">
        <div>
          <p class="spark-panel-eyebrow">Spark primer</p>
          <p class="spark-panel-title">Lock the promise before you riff.</p>
          <p class="spark-panel-subtitle">Trudy distilled these cues from your Spark sketch. Keep them intact as you iterate.</p>
        </div>
        <span class="spark-chip"><span class="spark-chip-dot"></span>Spark</span>
      </div>
      ${cardsHtml}
      ${badgeRow}
    </div>
  `
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

function renderFramingSection(snapshot: SnapshotRich) {
  const framingText = snapshot.narratives.framing?.sanitized || snapshot.narratives.framing?.raw || ''
  const meta =
    (snapshot as any).framingMeta ||
    (snapshot.narratives.framing as any)?.metaFull ||
    snapshot.narratives.framing?.meta ||
    null
  const spec = snapshot.context?.briefSpec || {}
  if (meta && framingMetaHasContent(meta)) {
    return renderFramingFromMeta(meta, spec)
  }
  if (framingText.trim()) {
    return renderMarkdownBlock(framingText)
  }
  return '<p>No framing narrative saved.</p>'
}

function framingMetaHasContent(meta: any) {
  const hasString = (value: any) => typeof value === 'string' && cleanText(value).length > 0
  const hasList = (list: any) => Array.isArray(list) && list.some((item) => cleanText(item || '').length > 0)

  if (hasString(meta?.behavioural_objective)) return true
  if (hasList(meta?.tensions)) return true
  if (Array.isArray(meta?.audience?.mindsets) && meta.audience.mindsets.length) return true
  if (hasList(meta?.hooks)) return true
  if (hasList(meta?.proposition_candidates)) return true
  if (hasList(meta?.brand_truths)) return true
  if (hasList(meta?.prize_truths)) return true
  if (hasList(meta?.reasons_to_believe)) return true
  if (hasList(meta?.category_codes?.lean)) return true
  if (hasList(meta?.category_codes?.break)) return true
  return false
}

function renderFramingFromMeta(meta: any, spec: Record<string, any>) {
  const summaryLines: string[] = []
  if (meta.behavioural_objective) {
    summaryLines.push(`<p><strong>Behavioural objective</strong> — ${escapeHtml(meta.behavioural_objective)}</p>`)
  }
  const tensions = takeStrings(meta.tensions, 3)
  if (tensions.length) {
    summaryLines.push(`<p><strong>Shopper tensions</strong> — ${escapeHtml(tensions.join(' · '))}</p>`)
  }
  const mindsets = Array.isArray(meta.audience?.mindsets)
    ? meta.audience.mindsets
        .slice(0, 2)
        .map((mind: any) => cleanText([mind?.name, mind?.job].filter(Boolean).join(' — ')))
        .filter(Boolean)
    : []
  if (mindsets.length) {
    summaryLines.push(`<p><strong>Audience lens</strong> — ${escapeHtml(mindsets.join(' | '))}</p>`)
  }
  const summaryHtml = summaryLines.length ? `<div class="framing-summary">${summaryLines.join('')}</div>` : ''

  const sections: string[] = []
  const hooks = takeStrings(meta.hooks, 4)
  if (hooks.length) sections.push(renderListSection('Hooks to test', hooks))

  const props = takeStrings(meta.proposition_candidates, 4)
  if (props.length) sections.push(renderListSection('Proposition candidates', props))

  const leanOns = takeStrings(meta.brand_truths, 4)
  if (leanOns.length) sections.push(renderListSection('Brand truths to lean on', leanOns))

  const rb = takeStrings(meta.reasons_to_believe, 4)
  if (rb.length) sections.push(renderListSection('Reasons to believe', rb))

  const hypotheses = buildFramingHypotheses(meta, spec)
  if (hypotheses.length) sections.push(renderListSection('Hypotheses to test', hypotheses))

  const prizeItems = Array.isArray(meta.prize_map?.items)
    ? meta.prize_map.items
        .map((item: any) => cleanText([item?.label, item?.rationale].filter(Boolean).join(' — ')))
        .filter(Boolean)
        .slice(0, 4)
    : []
  if (prizeItems.length) sections.push(renderListSection('Reward shape', prizeItems))

  const prizeTruths = takeStrings(meta.prize_truths, 4)
  if (prizeTruths.length) sections.push(renderListSection('Prize truths', prizeTruths))

  const leanCodes = takeStrings(meta.category_codes?.lean, 3)
  const breakCodes = takeStrings(meta.category_codes?.break, 3)
  if (leanCodes.length || breakCodes.length) {
    const inner: string[] = []
    if (leanCodes.length) inner.push(`<p><strong>Codes to lean</strong> — ${escapeHtml(leanCodes.join(' · '))}</p>`)
    if (breakCodes.length) inner.push(`<p><strong>Codes to break</strong> — ${escapeHtml(breakCodes.join(' · '))}</p>`)
    sections.push(`<div class="lens-section"><h3>Category codes</h3>${inner.join('')}</div>`)
  }

  const gridHtml = sections.length ? `<div class="framing-grid">${sections.join('')}</div>` : ''
  return `<div class="framing-structured">${summaryHtml}${gridHtml}</div>`
}

function buildFramingHypotheses(meta: any, spec: Record<string, any>): string[] {
  const base = takeStrings(meta.improvement_hypotheses, 4).filter(
    (line) => !/symbolic prize|cultural resonance|premiumisation|owners?[’']?\s*kit|passport/i.test(line || '')
  )
  const derived: string[] = []
  const mechanicText = [spec.mechanicOneLiner, spec.entryMechanic, spec.promotionHeadline, spec.mechanic]
    .map((value) => cleanText(value || ''))
    .filter(Boolean)
    .join(' ')
  const thresholdMatch = mechanicText.match(/(\d+)\s*(?:pints|stamp|stamps)/i)
  if (thresholdMatch) {
    const threshold = Number(thresholdMatch[1])
    if (threshold >= 8) {
      const reduced = Math.max(3, Math.round(threshold / 2))
      derived.push(`If we drop the passport from ${threshold} pints to ${reduced}, completion should at least double without cheapening the owners’ kit.`)
    }
  }
  if (includesKeyword(mechanicText, ['passport', 'stamp']) && !includesKeyword(mechanicText, ['digital', 'qr'])) {
    derived.push('Testing a fully digital passport (QR at the bar) versus paper should prove far higher staff adoption during St Pat’s peaks.')
  }
  if (meta?.prize_map?.has_symbolic_prize) {
    const symbolicLabel = (meta.prize_map.items || []).find((item: any) => item?.type === 'PRIZE_SYMBOLIC')?.label || 'the symbolic reward'
    derived.push(`Leading with ${symbolicLabel} (and treating the T-shirt as owners’ colours) should lift perceived fairness versus merch-first copy.`)
  }
  if (spec.assuredValue || spec.rewardPosture === 'ASSURED') {
    derived.push('Guaranteeing the owners’ kit for every completed passport should keep complaint rates under 1% despite the effort required.')
  }
  return dedupeStrings([...derived, ...base])
    .filter((line) => !/\bpassport\b|owners?\s*['’]?s?\s*kit/i.test(line))
    .slice(0, 4)
}

function renderCampaignSpine(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const evaluationText = snapshot.narratives.evaluation?.sanitized || snapshot.narratives.evaluation?.raw || ''
  const evaluationSections = parseEvaluationSections(evaluationText || '')
  if (!evaluationText.trim()) {
    return '<p>No evaluation narrative saved yet.</p>'
  }
  const strategistParsed = parseStrategistNarrative(snapshot.narratives.strategist?.sanitized || snapshot.narratives.strategist?.raw || '')
  const summary = evaluationSections['Verdict'] || evaluationSections['Why It Works'] || ''
  const whyWorks = evaluationSections['Why It Works'] ? `<p><strong>Why it resonates</strong> — ${escapeHtml(evaluationSections['Why It Works'])}</p>` : ''
  const breaks = evaluationSections['Where It Breaks'] ? `<p><strong>Where it breaks</strong> — ${escapeHtml(evaluationSections['Where It Breaks'])}</p>` : ''
  const hookUpgrade = evaluationSections['Hook Upgrade'] ? `<p><strong>Hook upgrade</strong> — ${escapeHtml(evaluationSections['Hook Upgrade'])}</p>` : ''

  const fixIt = evaluationSections['Fix It'] ? `<p><strong>Fix it now</strong> — ${escapeHtml(evaluationSections['Fix It'])}</p>` : ''
  const tighten = evaluationSections['Tighten'] ? `<p><strong>Tighten</strong> — ${escapeHtml(evaluationSections['Tighten'])}</p>` : ''
  const measurement = evaluationSections['Measurement'] ? `<p><strong>Measure</strong> — ${escapeHtml(evaluationSections['Measurement'])}</p>` : ''
  const packLine = evaluationSections['Pack Line'] ? `<p><strong>Pack line</strong> — ${escapeHtml(evaluationSections['Pack Line'])}</p>` : ''
  const staffLine = evaluationSections['Staff Line'] ? `<p><strong>Staff line</strong> — ${escapeHtml(evaluationSections['Staff Line'])}</p>` : ''

  const hooks = parseHookLines(evaluationSections['Hook Shortlist'] || '')
    .map(formatHookCandidate)
    .filter((hook) => hook.length <= 80)
    .slice(0, 4)
  const hookHtml = hooks.length
    ? `<div class="lens-section"><h3>Hook contenders</h3><ul>${hooks.map((hook) => `<li>${escapeHtml(hook)}</li>`).join('')}</ul></div>`
    : ''

  const stretchScenarioObj = strategistParsed.scenarios[0]
  const stretchScenario = stretchScenarioObj
    ? `<p><strong>${escapeHtml(stretchScenarioObj.label)}</strong> — ${markdownToHtml(stretchScenarioObj.body).replace(/^<p>|<\/p>$/g, '')}</p>`
    : ''

  return `
    <div class="spine-intro">
      ${summary ? `<div class="callout callout-decision"><h4>Read of the campaign</h4><p>${escapeHtml(summary)}</p></div>` : ''}
    </div>
    <div class="spine-grid">
      <article class="spine-card">
        <h4>As briefed</h4>
        ${whyWorks || breaks ? `${whyWorks}${breaks}` : '<p>No evaluation summary yet.</p>'}
        ${hookUpgrade}
      </article>
      <article class="spine-card">
        <h4>Make it land</h4>
        ${fixIt}${tighten}${measurement}
        ${packLine}${staffLine}
      </article>
      <article class="spine-card">
        <h4>Bolder stretch</h4>
        ${stretchScenario || '<p>No stretch scenario captured.</p>'}
      </article>
    </div>
    ${hookHtml}
  `
}

function renderEvidenceSection(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const parts: string[] = []
  const offerIQ = snapshot.offerIQ
  if (offerIQ) {
    const offerLines = [
      offerIQ.verdict ? `<p><strong>OfferIQ verdict</strong> — ${escapeHtml(offerIQ.verdict)}</p>` : '',
      offerIQ.lenses?.adequacy?.why ? `<p>${escapeHtml(offerIQ.lenses.adequacy.why)}</p>` : '',
    ].filter(Boolean).join('')
    parts.push(`<div class="callout callout-offeriq">${offerLines || '<p>No OfferIQ detail.</p>'}</div>`)
  }
  const scoreboardHtml = renderScoreboard(snapshot.narratives.evaluation?.meta?.scoreboard || snapshot.evaluationMeta?.scoreboard || null)
  if (scoreboardHtml) parts.push(scoreboardHtml)
  const researchHtml = renderResearchSection(snapshot)
  if (researchHtml) parts.push(researchHtml)
  const sparkHtml = renderSparkSection(snapshot)
  if (sparkHtml) parts.push(sparkHtml)
  return parts.length ? `<div class="evidence-grid">${parts.join('')}</div>` : '<p>No supporting evidence captured.</p>'
}

function renderWildcardsSection(snapshot: SnapshotRich) {
  const strategistParsed = parseStrategistNarrative(snapshot.narratives.strategist?.sanitized || snapshot.narratives.strategist?.raw || '')
  const scenarios = strategistParsed.scenarios.slice(1).concat(strategistParsed.scenarios.slice(0, 1)).slice(0, 2)
  const cards = scenarios.map((scenario) => `<article class="strategist-card">
      <h4>${escapeHtml(scenario.label)}</h4>
      ${markdownToHtml(scenario.body)}
    </article>`)

  const sparkHighlights = collectSparkFacts((snapshot as any).spark).map((fact) => fact.claim).slice(0, 4)
  const sparkHtml = sparkHighlights.length
    ? `<div class="callout callout-spark">
        <h4>Spark cues</h4>
        <ul>${sparkHighlights.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>`
    : ''
  if (!cards.length && !sparkHtml) {
    return '<p>No wild ideas captured.</p>'
  }
  return `<div class="wild-grid">${cards.join('')}${sparkHtml}</div>`
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

function parseHookLines(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s•*+-]+/, '').trim())
    .map((line) => line.replace(/^["“]+/, '').replace(/["”]+$/, ''))
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .map((line) => line.replace(/\bguinness\b/gi, 'Guinness'))
    .map((line) =>
      line
        .split(' ')
        .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
        .join(' ')
    )
    .filter((line) => line && line.length >= 3)
}

function formatHookCandidate(line: string): string {
  if (!line) return ''
  let text = line.trim()
  text = text.replace(/["“”]+/g, '"')
  text = text.replace(/"[-–—\s]*"$/g, '')
  text = text.replace(/!?"\s*[-–—]\s*"?$/g, '')
  text = text.replace(/^"|"$/g, '')
  text = text.replace(/\s+/g, ' ')
  text = text.replace(/\bGuinness\b/gi, 'Guinness')
  if (text) {
    text = text[0].toUpperCase() + text.slice(1)
  }
  return text
}

function dedupeByLower(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of items) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function describeValueScale(scoreboard: any, meta: any, offerIQ: any): string | null {
  const rewardStatus = String(scoreboard?.rewardShape?.status || '').toUpperCase()
  const mode = offerIQ?.mode || meta?.offerIQ?.mode || null
  const position = offerIQ?.diagnostics?.cashbackVsMarket || meta?.ui?.benchmarks?.positionVsMarket
  if (mode === 'ASSURED') {
    if (rewardStatus === 'GREEN') {
      if (position === 'ABOVE_P75' || position === 'ABOVE_TYPOLOGICAL') {
        return 'Zone 2 — richer than typical cashback; keep the story tight and evidence the payout.'
      }
      if (position === 'BELOW_P25' || position === 'BELOW_TYPICAL') {
        return 'Zone 1 — value feels light versus the market; either lift it or make fairness/winners hyper-visible.'
      }
      return 'Zone 1–2 — guaranteed cashback sits in the normal band; the job now is clarity and low hassle.'
    }
    if (rewardStatus === 'AMBER') {
      return 'Zone 2 — acceptable band, but fix the friction so the guarantee feels real.'
    }
    if (rewardStatus === 'RED') {
      return 'Zone 3 — effort outweighs perceived reward; either raise the cashback or slash the admin.'
    }
    return null
  }
  // prize-led default
  const frictionStatus = String(scoreboard?.friction?.status || '').toUpperCase()
  if (rewardStatus === 'RED' || frictionStatus === 'RED') {
    return 'Zone 3 — effort outweighs perceived reward. Cut the threshold or dramatise a richer guaranteed value.'
  }
  if (rewardStatus === 'GREEN') {
    return 'Zone 2 — hero + breadth feels believable; keep cadence visible.'
  }
  return null
}

type ValueUpgradeSummary = {
  status?: string
  lead?: string
  summary?: string
  fix?: string
  tail?: string
}

function formatCount(value: number | null | undefined): string | null {
  if (value == null || Number.isNaN(value)) return null
  const num = Math.round(Number(value))
  if (!Number.isFinite(num) || num <= 0) return null
  return num.toLocaleString('en-US')
}

function describeBaseValueOption(base: any): string | null {
  if (!base || base.type === 'none') return null
  const amount = typeof base.amount === 'number' && Number.isFinite(base.amount) ? base.amount : null
  if (base.type === 'cashback') {
    return amount != null ? `$${amount.toLocaleString('en-US')} cashback` : 'Cashback'
  }
  if (base.type === 'voucher') {
    return amount != null ? `$${amount.toLocaleString('en-US')} voucher` : 'Voucher on next shop'
  }
  if (base.type === 'gwp') {
    return amount != null ? `GWP worth ~$${amount.toLocaleString('en-US')}` : 'Gift with purchase'
  }
  return null
}

function mapScaleZoneToStatus(zone?: string | null): string | undefined {
  const z = String(zone || '').toUpperCase()
  if (z === 'ZONE_3_BREAKS_SYSTEM') return 'RED'
  if (z === 'ZONE_1_NORMAL' || z === 'ZONE_2_BRAVE') return 'GREEN'
  return undefined
}

function describeScaleZoneBand(zone?: string | null): string {
  const z = String(zone || '').toUpperCase()
  if (z === 'ZONE_1_NORMAL') return 'Zone 1 — back inside normal category value once upgrades land.'
  if (z === 'ZONE_2_BRAVE') return 'Zone 2 — a purposeful richer band; sell the theatre and cadence.'
  if (z === 'ZONE_3_BREAKS_SYSTEM') return 'Zone 3 — still reckless; cut friction or value before pitching.'
  return ''
}

function normalizeUpgradeLabel(label?: string | null): string {
  if (!label) return ''
  return String(label)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .filter((word) => !['UPGRADE', 'UPGRADES', 'OPTION', 'OPTIONS', 'PLAN'].includes(word))
    .join(' ')
    .trim()
}

function findOptionByLabel(options: any[] | null | undefined, targetLabel?: string | null) {
  if (!options || !options.length || !targetLabel) return null
  const normalizedTarget = normalizeUpgradeLabel(targetLabel)
  if (!normalizedTarget) return null
  const direct = options.find((opt) => normalizeUpgradeLabel(opt?.label) === normalizedTarget)
  if (direct) return direct
  const priorityTokens = ['SAFE', 'BOLD', 'RIDICULOUS']
  const preferredToken = priorityTokens.find((token) => normalizedTarget.includes(token))
  if (preferredToken) {
    const match = options.find((opt) => normalizeUpgradeLabel(opt?.label).includes(preferredToken))
    if (match) return match
  }
  const targetTokens = normalizedTarget.split(' ').filter(Boolean)
  if (!targetTokens.length) return null
  return (
    options.find((opt) => {
      const normalized = normalizeUpgradeLabel(opt?.label)
      if (!normalized) return false
      const optionTokens = normalized.split(' ').filter(Boolean)
      return optionTokens.some((token) => targetTokens.includes(token))
    }) || null
  )
}

function deriveImprovedValuePromise(meta: any): ValueUpgradeSummary | null {
  const improvement = meta?.multiAgentImprovement
  if (!improvement || !Array.isArray(improvement.agents)) return null
  const offerAgent = improvement.agents.find(
    (agent: any) => agent?.agent === 'OfferIQ' && Array.isArray(agent.options) && agent.options.length
  )
  if (!offerAgent) return null
  const bruceOptions = Array.isArray(improvement.bruce?.upgrade_options) ? improvement.bruce.upgrade_options : []
  const bruceRecommendedLabel = improvement.bruce?.recommended_option_label || null
  const candidate =
    findOptionByLabel(offerAgent.options, bruceRecommendedLabel) ||
    findOptionByLabel(offerAgent.options, offerAgent.recommended_option_label) ||
    offerAgent.options[0] ||
    null
  const bruceOption =
    findOptionByLabel(bruceOptions, bruceRecommendedLabel) ||
    (candidate ? findOptionByLabel(bruceOptions, candidate.label) : null) ||
    bruceOptions[0] ||
    null
  if (!candidate) return null

  const status = mapScaleZoneToStatus(candidate.scale_zone)
  const leadLabel = bruceOption?.label || candidate.label || bruceRecommendedLabel || offerAgent.recommended_option_label || ''
  const lead = leadLabel ? `Upgrade — ${String(leadLabel)} option` : undefined

  const summaryParts: string[] = []
  const baseValueText = describeBaseValueOption(candidate.base_value)
  if (bruceOption?.summary) summaryParts.push(String(bruceOption.summary))
  else if (candidate.description) summaryParts.push(String(candidate.description))
  else if (candidate.rationale) summaryParts.push(String(candidate.rationale))
  if (baseValueText) summaryParts.push(baseValueText)
  const majorCount =
    typeof candidate.major_prize_count === 'number' && Number.isFinite(candidate.major_prize_count)
      ? candidate.major_prize_count
      : null
  const majors = formatCount(majorCount)
  if (majors) summaryParts.push(`${majors} major prize${majorCount === 1 ? '' : 's'}`)
  const runnerCount =
    typeof candidate.runner_up_prize_count === 'number' && Number.isFinite(candidate.runner_up_prize_count)
      ? candidate.runner_up_prize_count
      : null
  const runnerUps = formatCount(runnerCount)
  if (runnerUps) summaryParts.push(`${runnerUps} runner-up prize${runnerCount === 1 ? '' : 's'}`)
  if (candidate.cadence_comment) summaryParts.push(String(candidate.cadence_comment))
  const summary = summaryParts.join(' • ')

  const tailParts: string[] = []
  const zoneText = describeScaleZoneBand(candidate.scale_zone)
  if (zoneText) tailParts.push(zoneText)
  if (Array.isArray(candidate.trade_offs) && candidate.trade_offs.length) {
    tailParts.push(String(candidate.trade_offs[0]))
  }
  if (bruceOption?.why_this?.length) {
    tailParts.push(String(bruceOption.why_this[0]))
  }
  const cadenceEntry =
    improvement?.cadence_summary && Array.isArray(improvement.cadence_summary)
      ? findOptionByLabel(improvement.cadence_summary, bruceOption?.label || candidate.label || null)
      : null
  if (cadenceEntry?.majors_per_day != null && cadenceEntry.majors_per_day < 0.05 && cadenceEntry.majors_text) {
    tailParts.push(
      `Hero cadence is extremely sparse (${cadenceEntry.majors_text}); treat it as PR-only or add more majors.`
    )
  }

  const fix = Array.isArray(offerAgent.must_fix) && offerAgent.must_fix.length ? String(offerAgent.must_fix[0]) : undefined

  return {
    status,
    lead,
    summary: summary || undefined,
    fix,
    tail: tailParts.join(' ').trim() || undefined,
  }
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
  rewardPosture: string
  staffBurden: string
  assuredSummary: string
  evaluationNarrative: string
}

function buildLensContext(snapshot: SnapshotRich, opts: RenderOptionsRuntime): LensContext {
  const spec: Record<string, any> = snapshot.context?.briefSpec || {}
  const brand = preferredBrand(snapshot.context) || snapshot.campaign.clientName || snapshot.campaign.title || ''
  const campaign = snapshot.campaign.title || 'Campaign'
  const category = snapshot.context.category || snapshot.context.briefSpec?.category || ''
  const dossier = snapshot.research?.dossier || {}
  const briefTensions = listFromBrief(spec.buyerTensions || spec.tensions)
  const briefTruths = listFromBrief(spec.brandTruths)
  const briefRetailFocus = cleanText(spec.retailerFocusNotes || spec.retailerNotes || '')
  const retailerNames = listFromBrief(spec.retailers)
  const retailerTags = listFromBrief(spec.retailerTags)
  const activationChannels = listFromBrief(spec.activationChannels)
  const displayedCreativeHooks = collectIdeationDisplayHooks(snapshot)
  const creativeHooksSet = new Set(displayedCreativeHooks.map((hook) => hook.toLowerCase()))
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
    briefTensions[0] ||
    firstText(dossier.shopperTensions) ||
    firstText(snapshot.research?.audience?.facts) ||
    snapshot.narratives.evaluation?.hookWhy ||
    ''
  const brandTruthRaw =
    briefTruths[0] ||
    distinctiveAssetFact(spec) ||
    firstText(dossier.brandTruths) ||
    firstText(snapshot.research?.brand?.facts) ||
    ''
  const retailerRealityRaw =
    briefRetailFocus ||
    formatRetailSummary(retailerNames, retailerTags, activationChannels) ||
    firstText(dossier.retailerReality) ||
    firstText(snapshot.research?.retailers?.facts) ||
    ''
  const measurementRaw =
    snapshot.narratives.evaluation?.meta?.ui?.measurement ||
    snapshot.narratives.evaluation?.meta?.measurement ||
    snapshot.narratives.evaluation?.meta?.scoreboard?.measurement ||
    spec.primaryKpi ||
    spec.primaryObjective ||
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

  const specSignals = buildBriefSignals(spec)
  const researchSignals = dedupeStrings([
    ...specSignals,
    ...collectResearchSignals(snapshot),
  ]).slice(0, 4)

  const harness = snapshot.ideation?.harness || null
  const harnessPoint = cleanText(harness?.point || '')
  const harnessMove = cleanText(harness?.move || '')
  const harnessRetailerLine = cleanText(harness?.retailerLine || '')
  const harnessOdds = cleanText(harness?.oddsCadence || '')
  const harnessLegal = cleanText(harness?.legalVariant || '')
  const baselinePhrases = collectBaselinePhrases(spec)
  const altHooksRaw = Array.isArray(snapshot.hooksTop) ? snapshot.hooksTop.map(cleanText).slice(0, 6) : []
  let altHooks = filterBrandAligned(altHooksRaw, brand)
    .filter((hook) => !referencesBaseline(hook, baselinePhrases))
    .map((hook) => hook.trim())
    .filter((hook) => hook && !creativeHooksSet.has(hook.toLowerCase()))
    .slice(0, 4)
  let altIdeasDetailed = Array.isArray(snapshot.ideation?.unboxed)
    ? snapshot.ideation?.unboxed.flatMap((agent) => {
        const agentName = agent?.agent || ''
        return (agent?.ideas || []).slice(0, 2).map((idea: any) => ({
          hook: cleanText(idea?.hook || ''),
          agent: cleanText(agentName),
          tier: cleanText(String(idea?.tier || '')),
          what: cleanText(idea?.what || ''),
        }))
      })
        .filter(
          (idea) =>
            idea.hook &&
            !referencesBaseline(`${idea.hook} ${idea.what || ''}`, baselinePhrases) &&
            !creativeHooksSet.has(idea.hook.toLowerCase())
        )
        .slice(0, 4)
    : []
  if (!altIdeasDetailed.length) {
    altIdeasDetailed = buildFallbackRebootIdeas({
      brand,
      shopperTension: shopperTension,
      assuredSummary: formatAssuredSummary(spec),
    })
  }
  if (!altHooks.length && altIdeasDetailed.length) {
    altHooks = altIdeasDetailed.map((idea) => idea.hook).slice(0, 4)
  }

  const offerIqVerdict = snapshot.offerIQ?.verdict ? String(snapshot.offerIQ.verdict) : null
  const evalVerdict =
    snapshot.narratives.evaluation?.meta?.ui?.verdict ||
    snapshot.narratives.evaluation?.meta?.decision ||
    snapshot.narratives.evaluation?.meta?.verdict ||
    ''

  const guardrails = collectGuardrails(snapshot, opts)
  const rewardPosture = String(spec.rewardPosture || '').toUpperCase()
  const staffBurden = String(spec.staffBurden || '').toUpperCase()
  const assuredSummary = formatAssuredSummary(spec)
  const evaluationNarrative = snapshot.narratives.evaluation?.sanitized || snapshot.narratives.evaluation?.raw || ''

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
    rewardPosture,
    staffBurden,
    assuredSummary,
    evaluationNarrative,
  }
}

function renderReviewAsBriefed(ctx: LensContext) {
  const narrative = ctx.evaluationNarrative?.trim()
  if (narrative) {
    return renderEvaluationNarrative(narrative)
  }
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

  const priorities = dedupeStrings([
    ctx.assuredSummary ? `Keep the guaranteed reward (${ctx.assuredSummary}) front and centre.` : '',
    ctx.measurement ? `Prove success via ${ctx.measurement}.` : '',
    ...ctx.runAgainMoves.slice(0, 3),
    ...ctx.fixes.slice(0, 2),
  ]).slice(0, 4)
  parts.push(renderListSection('Immediate priorities', priorities))

  const experiments = ctx.altHooks
    .slice(0, 3)
    .map((hook) => `Prototype alternate hook: ${hook}`)
    .map((line) => annotateExperiment(line, ctx))
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
  if (ctx.assuredSummary) alternativeLines.push(`Keep the guaranteed value (${ctx.assuredSummary}) and use this route to grow incremental pints.`)
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

  const nextSteps = dedupeStrings([
    ctx.measurement ? `Prove it moves ${ctx.measurement}` : '',
    ctx.guardrails[0],
    ctx.judgeFlags.find((flag) => flag.toLowerCase().includes('approval')),
    ctx.founderNotes[0],
  ]).filter(Boolean)
  parts.push(renderListSection('Next steps to unlock', dedupeStrings(nextSteps)))

  return parts.filter(Boolean).join('')
}

function renderListSection(title: string, items: string[]) {
  const filtered = items.map(normalizeBulletText).filter(Boolean)
  if (!filtered.length) return ''
  return `<div class="lens-section">
    <h3>${escapeHtml(title)}</h3>
    <ul>${filtered.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
  </div>`
}

function takeStrings(source: any, limit = 4): string[] {
  if (!source) return []
  const arr = Array.isArray(source) ? source : [source]
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of arr) {
    const value = cleanText(entry || '')
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

function cleanText(value: string) {
  const raw = String(value || '')
  let withoutWhitespace = raw.replace(/\s+/g, ' ').trim()
  withoutWhitespace = withoutWhitespace.replace(/Change-from:[^→]+→\s*Change-to:\s*/gi, '')
  if (!withoutWhitespace) return ''
  if (/^[A-Z0-9_ -]+$/.test(withoutWhitespace) && withoutWhitespace === withoutWhitespace.toUpperCase()) {
    return ''
  }
  return withoutWhitespace
}

function includesKeyword(text: string, keywords: string[]): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return keywords.some((word) => lower.includes(word.toLowerCase()))
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

function scrubValueLedLines(lines: Array<string | undefined>, meta: any): string[] {
  const cleaned = (Array.isArray(lines) ? lines : [lines])
    .map((line) => cleanText(line || ''))
    .filter(Boolean)
  if (!meta?.simpleLadderPreferred) return cleaned
  const banned = /(runner|cadence|instant win|weekly|mid[-\s]?tier)/i
  const keep = cleaned.filter((line) => !banned.test(line))
  if (keep.length) return keep
  return [
    'Keep the structure clean: the guaranteed cashback carries fairness while the hero remains a limited premium draw.',
    'Sell the hero as theatre on its own cadence rather than inflating the ladder.',
  ]
}

function listFromBrief(value: any): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map((entry) => cleanText(entry || '')).filter(Boolean)
  if (typeof value === 'string') {
    return value
      .split(/[•\n,;|]+/)
      .map((item) => cleanText(item))
      .filter(Boolean)
  }
  return []
}

function collectIdeationDisplayHooks(snapshot: SnapshotRich): string[] {
  const unboxed = Array.isArray(snapshot.ideation?.unboxed) ? snapshot.ideation?.unboxed : []
  const hooks = unboxed
    .flatMap((agent) => {
      if (!Array.isArray(agent?.ideas) || !agent.ideas.length) return []
      const hook = cleanText(agent.ideas[0]?.hook || '')
      return hook ? [hook] : []
    })
    .slice(0, 5)
  return hooks.filter(Boolean)
}

function distinctiveAssetFact(spec: Record<string, any>): string {
  const visual = listFromBrief(spec?.distinctiveAssets?.visual)
  const ritual = listFromBrief(spec?.distinctiveAssets?.ritual)
  if (visual.length) return `${spec.brand || 'brand'} owns ${visual[0]}`
  if (ritual.length) return `${spec.brand || 'brand'} ritual: ${ritual[0]}`
  return ''
}

function formatRetailSummary(names: string[], tags: string[], channels: string[]): string {
  const slices = dedupeStrings([...(names || []), ...(tags || []), ...(channels || [])]).slice(0, 4)
  if (!slices.length) return ''
  return `Priority venues: ${slices.join(', ')}`
}

function formatAssuredSummary(spec: Record<string, any>): string {
  const items = [
    spec?.gwp?.item,
    ...(Array.isArray(spec?.assuredItems) ? spec.assuredItems : []),
  ]
    .map((item) => cleanText(item))
    .filter(Boolean)
  if (!items.length) return ''
  const trigger = spec?.gwp?.triggerQty ? `${spec.gwp.triggerQty}x purchase` : spec.mechanicOneLiner || ''
  return `${items.join(' + ')}${trigger ? ` • Trigger: ${trigger}` : ''}`
}

function buildBriefSignals(spec: Record<string, any>): string[] {
  const signals: string[] = []
  listFromBrief(spec.buyerTensions).slice(0, 2).forEach((tension) => signals.push(`Buyer tension: ${tension}`))
  if (spec.primaryObjective) signals.push(`Primary objective: ${cleanText(spec.primaryObjective)}`)
  if (spec.primaryKpi) signals.push(`Primary KPI: ${cleanText(spec.primaryKpi)}`)
  if (spec.calendarTheme) signals.push(`Calendar: ${cleanText(spec.calendarTheme)}`)
  if (spec.retailerFocusNotes) signals.push(`Retail focus: ${cleanText(spec.retailerFocusNotes)}`)
  return signals.filter(Boolean)
}

function collectBaselinePhrases(spec: Record<string, any>): string[] {
  const phrases = [
    spec.mechanicOneLiner,
    spec.entryMechanic,
    spec.hook,
    spec.gwp?.item,
    ...(Array.isArray(spec?.assuredItems) ? spec.assuredItems : []),
  ]
    .map((phrase) => cleanText(phrase).toLowerCase())
    .filter((phrase) => phrase.length >= 6)
  return Array.from(new Set(phrases))
}

function referencesBaseline(text: string, phrases: string[]): boolean {
  if (!text) return false
  const lower = text.toLowerCase()
  return phrases.some((phrase) => phrase && lower.includes(phrase))
}

type AltIdea = { hook: string; what: string; agent: string; tier: string }
type FallbackIdeaArgs = { brand: string; shopperTension: string; assuredSummary: string }
function buildFallbackRebootIdeas(args: FallbackIdeaArgs): AltIdea[] {
  const { brand, shopperTension, assuredSummary } = args
  const guard = shopperTension ? `Solves: ${shopperTension}` : 'Drives extra pint velocity.'
  return [
    {
      hook: `${brand} Two-Pint Passport`,
      what: `Switch to a 2-pint stamp (not 12) so light drinkers join in; every 6 stamps unlock an Irish share plate. ${guard}`,
      agent: 'Fallback',
      tier: 'REBOOT',
    },
    {
      hook: `${brand} Mate's Rates Hour`,
      what: `Happy-hour bundle: buy a Guinness, shout a mate at 50% between 4–6pm to own the shoulder period. Keep fulfilment central and leave staff workload at zero.`,
      agent: 'Fallback',
      tier: 'REBOOT',
    },
    {
      hook: `${brand} Live Trad Drop`,
      what: `Each pint vote adds a song to the St Pat's trad setlist; instant wins drop merch or pints mid-set. ${assuredSummary ? `Assured reward stays (${assuredSummary}). ` : ''}${guard}`,
      agent: 'Fallback',
      tier: 'REBOOT',
    },
  ]
}

function annotateExperiment(line: string, ctx: LensContext): string {
  if (!line) return ''
  let annotated = line
  if (/overlay/i.test(line)) {
    const metric = ctx.measurement || 'incremental pint velocity'
    annotated += ` (Overlay only if it proves ${metric} and can be centrally fulfilled.)`
  }
  if (/(hourly|burst|every hour|instant win|spin)/i.test(line) && ctx.staffBurden === 'ZERO') {
    annotated += ' (Automate the draw so staff remain zero-touch.)'
  }
  if (/(cashback|bar tab|discount)/i.test(line) && ctx.rewardPosture === 'ASSURED') {
    annotated += ' (Layer on top of the guaranteed reward—do not replace it.)'
  }
  return annotated
}

function normalizeBulletText(value: string): string {
  let text = cleanText(value)
  if (!text) return ''
  text = text.replace(/Change-from:[^→]+→\s*Change-to:\s*/gi, '')
  text = text.replace(/Change-from:[^→]+/gi, '')
  text = text.replace(/\s{2,}/g, ' ').trim()
  text = text.replace(/^[-•\s]+/, '')
  return text
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
  const sparkFacts = collectSparkFacts((snapshot as any).spark).slice(0, 5)

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

  if (sparkFacts.length) {
    cards = [renderResearchCard('Spark cues', sparkFacts, 6), ...cards]
  }

  const grid = cards.length ? `<div class="research-grid">${cards.join('')}</div>` : ''
  const benchmarks = renderResearchBenchmarks(snapshot.benchmarks || research.benchmarks || null)

  if (!grid && !benchmarks) return '<p>No research snapshot saved.</p>'
  return `${grid}${benchmarks || ''}`
}

function renderMultiAgentRoomHtml(payload: any) {
  if (!payload || !payload.bruce) return ''
  const bruce = payload.bruce || {}
  const reasons = Array.isArray(bruce.top_reasons) ? bruce.top_reasons.filter((line: any) => line).slice(0, 3) : []
  const mustFix = Array.isArray(bruce.must_fix_items) ? bruce.must_fix_items.filter((line: any) => line).slice(0, 3) : []
  const quickWins = Array.isArray(bruce.quick_wins) ? bruce.quick_wins.filter((line: any) => line).slice(0, 3) : []
  const snapshots = Array.isArray(bruce.agent_snapshots) && bruce.agent_snapshots.length
    ? bruce.agent_snapshots
    : Array.isArray(payload.agents)
      ? payload.agents.map((agent: any) => ({
          agent: agent?.agent || 'Agent',
          verdict: agent?.verdict || '',
          headline: agent?.headline || agent?.notes_for_bruce || '',
        }))
      : []

  const listBlock = (title: string, lines: string[]) => {
    const safeLines = (lines || []).filter(Boolean)
    if (!safeLines.length) return ''
    return `<div class="multi-room-list"><div class="multi-room-list-title">${escapeHtml(title)}</div><ul>${safeLines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('')}</ul></div>`
  }

  const agentsHtml = snapshots.length
    ? `<div class="multi-room-agents">${snapshots
        .map(
          (snap: any) =>
            `<div class="multi-room-agent">
              <div class="multi-room-agent-head">
                <span class="multi-room-agent-name">${escapeHtml(snap.agent || 'Agent')}</span>
                <span class="multi-room-agent-pill">${escapeHtml(snap.verdict || '—')}</span>
              </div>
              <p>${escapeHtml(snap.headline || 'No headline provided.')}</p>
            </div>`
        )
        .join('')}</div>`
    : ''

  const notesHtml = bruce.notes ? `<p class="multi-room-notes">${escapeHtml(bruce.notes)}</p>` : ''

  return `
    <div class="multi-room">
      <div class="multi-room-head">
        <div>
          <p class="multi-room-label">Room verdict</p>
          <p class="multi-room-verdict">${escapeHtml(bruce.verdict || '—')}</p>
          ${notesHtml}
        </div>
      </div>
      <div class="multi-room-body">
        ${listBlock('Top reasons', reasons)}
        ${listBlock('Must-fix', mustFix)}
        ${listBlock('Quick wins', quickWins)}
      </div>
      ${agentsHtml}
    </div>
  `
}

function renderMultiAgentImprovementHtml(payload: any, meta?: any) {
  if (!payload || !payload.bruce) return ''
  const bruce = payload.bruce || {}
  const options = Array.isArray(bruce.upgrade_options) ? bruce.upgrade_options.slice(0, 2) : []
  const recommended = bruce.recommended_option_label || null
  const agentBlocks = Array.isArray(payload.agents) ? payload.agents : []
  const offerIqImprove = agentBlocks.find(
    (block: any) => block?.agent === 'OfferIQ' && Array.isArray(block.options) && block.options.length
  )
  const canonicalOptions = offerIqImprove?.options || []
  const cadenceSummaryEntries = Array.isArray(payload.cadence_summary) ? payload.cadence_summary : []
  if (!options.length && !agentBlocks.length) return ''
  const toNumberOrNull = (value: any) => {
    if (value == null || value === '') return null
    const num = Number(value)
    return Number.isFinite(num) ? num : null
  }

  const simpleLadder = Boolean(meta?.simpleLadderPreferred)

  const optionCards = options
    .map((opt: any) => {
      const hooks = Array.isArray(opt.hooks) ? opt.hooks.slice(0, 3) : []
      const whyThis = Array.isArray(opt.why_this) ? opt.why_this.slice(0, 3) : []
      const canonical = findOptionByLabel(canonicalOptions, opt?.label) || null
      const cadenceEntry = simpleLadder ? null : findOptionByLabel(cadenceSummaryEntries, opt?.label) || null
      const offerParts: string[] = []
      const baseValueText = describeBaseValueOption((canonical && canonical.base_value) || opt?.base_value || null)
      if (baseValueText) offerParts.push(`Base: ${baseValueText}`)
      if (opt.offer?.cashback != null) offerParts.push(`Cashback: $${opt.offer.cashback}`)
      const effectiveMajorCount =
        toNumberOrNull(opt?.offer?.major_prizes) ?? (canonical ? toNumberOrNull(canonical.major_prize_count) : null)
      const majorsText = formatCount(effectiveMajorCount)
      if (majorsText) offerParts.push(`Majors: ${majorsText}`)
      const runnerUpsFromList =
        Array.isArray(opt.runner_up_prizes) && opt.runner_up_prizes.length
          ? opt.runner_up_prizes.reduce((sum: number, rp: any) => {
              const val = toNumberOrNull(rp?.count)
              return val != null ? sum + val : sum
            }, 0)
          : null
      const effectiveRunnerCount =
        (runnerUpsFromList && runnerUpsFromList > 0 ? runnerUpsFromList : null) ??
        (canonical ? toNumberOrNull(canonical.runner_up_prize_count) : null)
      const runnerSummary = formatCount(effectiveRunnerCount)
      if (!simpleLadder && runnerSummary) offerParts.push(`Runner-ups: ${runnerSummary}`)
      if (cadenceEntry?.majors_text) offerParts.push(`Hero cadence: ${cadenceEntry.majors_text}`)
      if (cadenceEntry?.runners_text) offerParts.push(`Runner cadence: ${cadenceEntry.runners_text}`)
      const runnerUps = Array.isArray(opt.runner_up_prizes) ? opt.runner_up_prizes : []
      const runnerDescriptions = runnerUps.map((rp: any) => String(rp?.description || '').toLowerCase()) as string[]
      const filteredRunnerDescriptions = runnerDescriptions.filter((desc: string) => Boolean(desc))
      const hasSharedPrize = filteredRunnerDescriptions.some((desc: string) => /double|two|pair|family/.test(desc))
      const sanitizedHooks = hooks.map((hook: string) => sanitizeHookPrizeLanguage(hook, hasSharedPrize))
      const runnerList = runnerUps.length
        ? `<div class="multi-upgrade-runners"><strong>Runner-ups</strong><ul>${runnerUps
            .map(
              (rp: any) =>
                `<li>${rp.count != null ? `${escapeHtml(String(rp.count))} × ` : ''}${
                  rp.value != null ? `$${escapeHtml(String(rp.value))}` : ''
                } ${escapeHtml(rp.description || '').trim()}</li>`
            )
            .join('')}</ul></div>`
        : ''
      const tradeLine = opt.trade_incentive ? `<div class="multi-upgrade-trade"><strong>Trade:</strong> ${escapeHtml(opt.trade_incentive)}</div>` : ''
      const heroLine = opt.hero_overlay ? `<div class="multi-upgrade-hero"><strong>Hero overlay</strong><p>${escapeHtml(opt.hero_overlay)}</p></div>` : ''
      const mechLine = opt.mechanic ? `<div class="multi-upgrade-mechanic"><strong>Mechanic:</strong> ${escapeHtml(opt.mechanic)}</div>` : ''
      const hookList = sanitizedHooks.length
        ? `<ul>${sanitizedHooks.map((hook: string) => `<li>${escapeHtml(hook)}</li>`).join('')}</ul>`
        : ''
      const whyList = whyThis.length
        ? `<ul>${whyThis.map((line: string) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
        : ''
      return `<div class="multi-upgrade-card">
        <div class="multi-upgrade-card-head">
          <span>${escapeHtml(opt.label || 'Upgrade')}</span>
          ${recommended && recommended === opt.label ? '<span class="multi-upgrade-pill">Recommended</span>' : ''}
        </div>
        ${opt.summary ? `<p class="multi-upgrade-summary">${escapeHtml(opt.summary)}</p>` : ''}
        ${offerParts.length ? `<div class="multi-upgrade-offer">${offerParts.map((p) => `<span>${escapeHtml(p)}</span>`).join(' • ')}</div>` : ''}
        ${hookList ? `<div class="multi-upgrade-hooks"><strong>Hooks</strong>${hookList}</div>` : ''}
        ${tradeLine}
        ${mechLine}
        ${heroLine}
        ${runnerList}
        ${whyList ? `<div class="multi-upgrade-why"><strong>Why</strong>${whyList}</div>` : ''}
      </div>`
    })
    .join('')

  const agentBlocksHtml = agentBlocks.length
    ? `<div class="multi-upgrade-agents">${agentBlocks
        .map((block: any) => {
          const mustFix = Array.isArray(block.must_fix) ? block.must_fix.filter(Boolean).slice(0, 3) : []
          return `<div class="multi-upgrade-agent">
            <div class="multi-upgrade-agent-name">${escapeHtml(block.agent || 'Agent')}</div>
            ${
              mustFix.length
                ? `<ul>${mustFix.map((line: string) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`
                : '<p>No must-fix items provided.</p>'
            }
          </div>`
        })
        .join('')}</div>`
    : ''
  const hypothesisStatus: Array<{ id: string; status: string; note?: string }> = Array.isArray(payload.hypothesis_status)
    ? payload.hypothesis_status
    : []
  const hypothesisHtml = hypothesisStatus.length
    ? `<div class="multi-upgrade-hypotheses"><strong>Hypotheses</strong><ul>${hypothesisStatus
        .map((entry) => {
          const label = entry.id ? entry.id.replace(/_/g, ' ') : 'Hypothesis'
          const status = entry.status ? entry.status.toUpperCase() : 'UNKNOWN'
          const note = entry.note ? ` — ${entry.note}` : ''
          return `<li>${escapeHtml(status)}: ${escapeHtml(label)}${escapeHtml(note)}</li>`
        })
        .join('')}</ul></div>`
    : ''

  return `
    <div class="multi-upgrade">
      <div class="multi-upgrade-head">
        <div>
          <p class="multi-upgrade-label">Upgrade plan</p>
          <p class="multi-upgrade-title">Room recommendations</p>
          ${bruce.notes ? `<p class="multi-upgrade-notes">${escapeHtml(bruce.notes)}</p>` : ''}
        </div>
      </div>
      ${optionCards ? `<div class="multi-upgrade-grid">${optionCards}</div>` : ''}
      ${agentBlocksHtml}
      ${hypothesisHtml}
    </div>
  `
}

function renderEvaluationSection(snapshot: SnapshotRich, opts: RenderOptionsRuntime) {
  const meta = snapshot.narratives.evaluation?.meta || snapshot.evaluationMeta || {}
  const ui = meta.ui || {}
  const scoreboard = meta.scoreboard || {}
  const chips: string[] = []
  if (scoreboard.decision || ui.verdict) chips.push(`Verdict — ${escapeHtml(String(scoreboard.decision || ui.verdict))}`)
  if (snapshot.offerIQ?.verdict) chips.push(`OfferIQ ${escapeHtml(String(snapshot.offerIQ.verdict))}`)
  if (opts.judgeVerdict?.score != null) chips.push(`Judge ${opts.judgeVerdict.score}/100`)
  const chipsHtml = chips.length ? `<div class="summary-tags">${chips.map((chip) => `<span class="summary-tag">${chip}</span>`).join('')}</div>` : ''

  const evaluationText = snapshot.narratives.evaluation?.sanitized || snapshot.narratives.evaluation?.raw || ''
  const sections = evaluationText ? parseEvaluationSections(evaluationText) : {}
  if (sections['Staff Line']) {
    sections['Staff Line'] = sections['Staff Line'].replace(/Key campaign[-–—:].*/i, '').trim()
  }
  const stalePattern = /(CREATE_UNBOXED|personaliz|cinema escape)/i
  if (sections['Where It Breaks'] && stalePattern.test(sections['Where It Breaks'])) {
    sections['Where It Breaks'] =
      scoreboard?.rewardShape?.why ||
      scoreboard?.objectiveFit?.why ||
      sections['Where It Breaks'].replace(stalePattern, '').trim()
  }

  const verdictCopy = sections['Verdict'] || ''
  const decisionHtml = verdictCopy
    ? `<div class="callout callout-decision"><h4>Verdict</h4><p>${escapeHtml(verdictCopy)}</p></div>`
    : ''

  const spec = snapshot.context?.briefSpec || {}
  const brandName = preferredBrand(snapshot.context) || snapshot.campaign.clientName || snapshot.campaign.title || ''
  const kpiFallback = cleanText(spec.primaryKpi || spec.primaryObjective || '')
  let measurement = sections['Measurement'] || ui.measurement || meta.measurement || ''
  const hookListRaw = sections['Hook Shortlist'] ? parseHookLines(sections['Hook Shortlist']) : []
  for (const hook of hookListRaw) {
    if (/^measurement\b/i.test(hook)) {
      const extracted = hook.replace(/^measurement\b[:\s-]*/i, '').trim()
      if (extracted) measurement = measurement || extracted
    }
  }

  const recommendedUpgrade = pickRecommendedUpgradeOption(meta?.multiAgentImprovement)
  const upgradeSummaryHtml = recommendedUpgrade ? renderUpgradeNarrativeFromOption(recommendedUpgrade) : ''
  const evaluationProseHtml = evaluationText ? renderMarkdownBlock(evaluationText) : ''
  const fallbackHtml = renderEvaluationFallbackProse(scoreboard, sections)
  const narrativeHtml = upgradeSummaryHtml || evaluationProseHtml || fallbackHtml
  const legacyHtml =
    upgradeSummaryHtml && evaluationProseHtml
      ? `<details class="evaluation-legacy"><summary>Original evaluation transcript</summary>${evaluationProseHtml}</details>`
      : ''

  const measurementLines: string[] = []
  if (kpiFallback) measurementLines.push(`Primary KPI — ${kpiFallback}`)
  if (measurement && cleanText(measurement)) {
    measurementLines.push(cleanText(measurement))
  }
  if (!measurementLines.length) {
    measurementLines.push('Primary KPI — Incremental unit sales vs last year/control across participating retailers.')
  }
  const measurementHtml = measurementLines.length
    ? `<div class="callout callout-measurement"><h4>Measurement</h4><p>${escapeHtml(measurementLines.join('. '))}</p></div>`
    : ''

  const extras: string[] = []
  let packLine = sections['Pack Line'] ? ensureChanceLanguage(sections['Pack Line']) : ''
  if (!packLine && recommendedUpgrade) {
    const rebuiltPack = buildUpgradeHookLine(recommendedUpgrade, brandName, 'pack')
    if (rebuiltPack) packLine = ensureChanceLanguage(rebuiltPack)
  }
  let staffLine = sections['Staff Line'] ? ensureChanceLanguage(sections['Staff Line']) : ''
  if (!staffLine && recommendedUpgrade) {
    const rebuiltStaff = buildUpgradeHookLine(recommendedUpgrade, brandName, 'staff')
    if (rebuiltStaff) staffLine = ensureChanceLanguage(rebuiltStaff)
  }
  const packGuarantee = buildGuaranteedValueSentence(spec, 'pack')
  if (packGuarantee) {
    packLine = packLine ? `${packLine}. ${packGuarantee}` : packGuarantee
  }
  const staffGuarantee = buildGuaranteedValueSentence(spec, 'staff')
  if (staffGuarantee) {
    staffLine = staffLine ? `${staffLine}. ${staffGuarantee}` : staffGuarantee
  }
  if (packLine) {
    extras.push(`<p><strong>Pack line</strong> — ${escapeHtml(packLine)}</p>`)
  }
  if (staffLine) {
    extras.push(`<p><strong>Staff line</strong> — ${escapeHtml(staffLine)}</p>`)
  }
  const brandHostLine = buildBrandHostLine(spec, brandName)
  if (brandHostLine) {
    extras.push(`<p><strong>Brand host</strong> — ${escapeHtml(brandHostLine)}</p>`)
  }
  if (recommendedUpgrade) {
                       const ladderLine = describeUpgradeValueHeadline(recommendedUpgrade)
    if (ladderLine) {
      extras.push(`<p><strong>Value headline</strong> — ${escapeHtml(ladderLine)}</p>`)
    }
  }

  const roomHtml = renderMultiAgentRoomHtml(meta?.multiAgentEvaluation)
  const upgradeHtml = renderMultiAgentImprovementHtml(meta?.multiAgentImprovement, meta)

  return [chipsHtml, roomHtml, upgradeHtml, decisionHtml, narrativeHtml, legacyHtml, measurementHtml, extras.join('')]
    .filter(Boolean)
    .join('')
}

const SCOREBOARD_PROSE_FIELDS: Array<[string, string]> = [
  ['objectiveFit', 'Objective fit'],
  ['hookStrength', 'Hook strength'],
  ['mechanicFit', 'Mechanic fit'],
  ['frequencyPotential', 'Cadence & odds'],
  ['rewardShape', 'Value promise'],
  ['friction', 'Entry friction'],
  ['retailerReadiness', 'Retail readiness'],
  ['fulfilment', 'Fulfilment'],
  ['complianceRisk', 'Compliance risk'],
  ['kpiRealism', 'KPI realism'],
]

function renderEvaluationFallbackProse(scoreboard: any, sections: Record<string, string>) {
  const paragraphs: string[] = []
  if (sections['Why It Works']) {
    paragraphs.push(`<p><strong>Why it works</strong> — ${escapeHtml(sections['Why It Works'])}</p>`)
  }
  if (sections['Where It Breaks']) {
    paragraphs.push(`<p><strong>Where it breaks</strong> — ${escapeHtml(sections['Where It Breaks'])}</p>`)
  }
  if (!scoreboard) {
    return paragraphs.length ? `<div class="evaluation-prose">${paragraphs.join('')}</div>` : ''
  }
  for (const [key, label] of SCOREBOARD_PROSE_FIELDS) {
    const cell = (scoreboard as Record<string, any>)[key]
    if (!cell) continue
    const parts = [cell.why, cell.fix].map((line: any) => cleanText(line || '')).filter(Boolean)
    if (!parts.length) continue
    paragraphs.push(`<p><strong>${label}</strong> — ${escapeHtml(parts.join(' '))}</p>`)
  }
  if (scoreboard.conditions) {
    paragraphs.push(`<p><strong>Conditions</strong> — ${escapeHtml(String(scoreboard.conditions))}</p>`)
  }
  return paragraphs.length ? `<div class="evaluation-prose">${paragraphs.join('')}</div>` : ''
}

function ensureChanceLanguage(text: string): string {
  if (!text) return text
  if (/\bchance\b/i.test(text)) return text
  if (!/\bwin\b/i.test(text)) return text
  return text.replace(/\bwin\b/i, (match) => {
    const replacement = 'chance to win'
    return match === match.toUpperCase() ? replacement.toUpperCase() : replacement
  })
}

function sanitizeHookPrizeLanguage(text: string, hasSharedPrize: boolean): string {
  let line = ensureChanceLanguage(text)
  if (!hasSharedPrize) {
    line = line.replace(/double (movie )?pass(es)?/gi, 'movie ticket')
    line = line.replace(/\bfor two\b/gi, '')
  }
  return line
}

function sanitizeHookLine(line: string, spec: Record<string, any>): string {
  if (!line) return ''
  let output = line.trim()
  if (!output) return ''
  if (spec?.assuredValue && /((limited|scarce)[^.!?]*chance)/i.test(output)) {
    output = output.replace(/[-–—,]*\s*(limited|scarce)[^.!?]*chance[s]?/gi, '').trim()
  }
  output = output.replace(/\s+/g, ' ').trim()
  if (output.length < 25) return ''
  return output
}

function sanitizeValueLedLine(line: string, meta: any): string {
  if (!line) return ''
  if (!meta?.simpleLadderPreferred) return line
  if (/(runner|cadence|instant win|weekly prize)/i.test(line)) {
    return 'Keep the hero overlay as a limited premium draw layered on top of the guaranteed cashback.'
  }
  return line
}

function buildBrandHostLine(spec: any, brand: string): string | null {
  const brandName = brand || spec?.brand || spec?.clientName || ''
  if (!brandName) return null
  const occasion =
    spec?.ipTieIn?.franchise ||
    spec?.ip ||
    spec?.calendarTheme ||
    spec?.occasion ||
    ''
  const category = String(spec?.category || spec?.typeOfPromotion || 'brand').toLowerCase()
  if (category.includes('appliance')) {
    if (occasion) return `${brandName} is the appliance brand your ${occasion.toLowerCase()} nights run on.`
    return `${brandName} keeps your kitchen running when the cooking stakes are high.`
  }
  if (category.includes('wine') || category.includes('beer') || category.includes('spirit')) {
    if (occasion) return `${brandName} is the drink you put on the table for your ${occasion} night.`
    return `${brandName} is the bottle that completes the occasion.`
  }
  if (occasion) return `${brandName} is the ${spec?.category || 'brand'} you put on the table for your ${occasion} night.`
  return `${brandName} is the ${spec?.category || 'brand'} that completes the occasion.`
}

function pickRecommendedUpgradeOption(improvement: any) {
  const road = improvement?.bruce
  if (!road) return null
  const options = Array.isArray(road.upgrade_options) ? road.upgrade_options : []
  if (!options.length) return null
  const preferred = road.recommended_option_label || null
  return options.find((opt: any) => preferred && opt?.label === preferred) || options[0]
}

function normalizeUpgradeOption(option: any | null, spec: Record<string, any>) {
  if (!option) return null
  const normalized = { ...option }
  const assuredBase = Boolean(spec?.assuredValue || spec?.gwp)
  if (assuredBase) {
    if (normalized.mechanic && /\bdraw|winner/i.test(normalized.mechanic)) {
      normalized.mechanic = normalized.mechanic.replace(/[,;]?\s*(and\s+)?enter[^.]+draw[^.]+/gi, '').trim()
      normalized.summary =
        "Lower the pint threshold so more drinkers earn the guaranteed kit without adding extra prize tiers."
    }
    normalized.hero_overlay = ''
    normalized.runner_up_prizes = []
  }
  return normalized
}

function renderUpgradeNarrativeFromOption(option: any): string {
  if (!option) return ''
  const pieces: string[] = []
  const title = option.label ? `${option.label} upgrade` : 'Recommended upgrade'
  const summary = option.summary ? ` — ${option.summary}` : ''
  pieces.push(`<p><strong>${escapeHtml(title)}</strong>${escapeHtml(summary)}</p>`)
  if (option.mechanic) {
    pieces.push(`<p><strong>Mechanic</strong> — ${escapeHtml(option.mechanic)}</p>`)
  }
  const hero = describeHeroTierFromOption(option)
  if (hero) {
    pieces.push(`<p><strong>Hero prize</strong> — ${escapeHtml(hero)}</p>`)
  }
  const runners = describeRunnerTierFromOption(option)
  if (runners.length) {
    pieces.push(`<p><strong>Runner-ups</strong> — ${escapeHtml(runners.join('; '))}</p>`)
  }
  if (option.trade_incentive) {
    pieces.push(`<p><strong>Trade</strong> — ${escapeHtml(option.trade_incentive)}</p>`)
  }
  if (Array.isArray(option.hooks) && option.hooks.length) {
    pieces.push(`<p><strong>Hook focus</strong> — ${escapeHtml(String(option.hooks[0]))}</p>`)
  }
  return pieces.length ? `<div class="evaluation-prose">${pieces.join('')}</div>` : ''
}

function describeHeroTierFromOption(option: any): string | null {
  if (!option) return null
  const heroCountRaw = Number(option?.offer?.major_prizes)
  const heroCount = Number.isFinite(heroCountRaw) ? heroCountRaw : null
  const heroLabel = cleanText(option?.hero_overlay || option?.summary || '')
  if (!heroCount && !heroLabel) return null
  const bits: string[] = []
  if (heroCount) {
    bits.push(`${formatCount(heroCount)} winner${heroCount === 1 ? '' : 's'}`)
  }
  if (heroLabel) {
    bits.push(heroLabel)
  }
  return bits.join(' — ')
}

function describeRunnerTierFromOption(option: any): string[] {
  const prizes = Array.isArray(option?.runner_up_prizes) ? option.runner_up_prizes : []
  const lines: string[] = []
  for (const prize of prizes) {
    const count = typeof prize?.count === 'number' && Number.isFinite(Number(prize.count)) ? Number(prize.count) : null
    const desc = cleanText(prize?.description || '')
    const value =
      typeof prize?.value === 'number' && Number.isFinite(prize.value) ? `$${Math.round(prize.value).toLocaleString('en-US')}` : ''
    const parts: string[] = []
    if (count) parts.push(`${formatCount(count)}×`)
    if (desc) parts.push(desc)
    if (value) parts.push(value)
    if (!parts.length) continue
    lines.push(parts.join(' '))
  }
  return lines.slice(0, 3)
}

function describeRunnerHeadline(option: any): string | null {
  const prizes = Array.isArray(option?.runner_up_prizes) ? option.runner_up_prizes : []
  if (!prizes.length) return null
  const primary = prizes[0]
  const count =
    typeof primary?.count === 'number' && Number.isFinite(primary.count) ? `${formatCount(primary.count)}× ` : ''
  const desc = cleanText(primary?.description || '')
  const label = (count || desc) ? `${count || ''}${desc || 'runner-up prizes'}`.trim() : ''
  return label || null
}

function buildUpgradeHookLine(option: any, brandName: string, audience: 'pack' | 'staff'): string | null {
  if (!option) return null
  const heroLabel = cleanText(option?.hero_overlay || option?.summary || '')
  const runnerHeadline = describeRunnerHeadline(option)
  const brand = brandName ? `${brandName} ` : ''
  const subject = audience === 'staff' ? 'Sell' : 'Buy'
  const hookParts = [`${subject} ${brand || 'the participating range'} for a chance to win ${heroLabel || 'the hero prize'}`]
  if (runnerHeadline) {
    hookParts.push(`plus ${runnerHeadline}`)
  }
  return hookParts.join(' ')
}

function describeUpgradeValueHeadline(option: any): string | null {
  if (!option) return null
  const hero = describeHeroTierFromOption(option)
  const runner = describeRunnerHeadline(option)
  if (!hero && !runner) return null
  return [hero, runner ? runner : null].filter(Boolean).join(' • ')
}

function buildGuaranteedValueSentence(spec: Record<string, any>, audience: 'pack' | 'staff'): string | null {
  if (!spec?.assuredValue) return null
  const noun = audience === 'staff' ? 'customer' : 'purchase'
  const capRaw = spec?.cashback?.cap
  const capText =
    capRaw && String(capRaw).trim().toUpperCase() !== 'UNLIMITED'
      ? ` (capped at ${String(capRaw).trim()})`
      : ''
  const amount = Number(spec?.cashback?.amount || 0)
  if (amount > 0) {
    return `Guaranteed $${Math.round(amount)} cashback for every eligible ${noun}${capText}.`
  }
  const assuredItem = Array.isArray(spec?.assuredItems) && spec.assuredItems.length ? spec.assuredItems[0] : ''
  if (assuredItem) {
    return `Guaranteed reward for every eligible ${noun}: ${assuredItem}.`
  }
  return `Guaranteed reward for every eligible ${noun}.`
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
  const sparkHighlights = collectSparkFacts((snapshot as any).spark)
    .map((fact) => fact.claim)
    .slice(0, 4)
  const sparkCallout = sparkHighlights.length
    ? `<div class="callout callout-spark">
        <h4>Spark cues carried through</h4>
        <ul>${sparkHighlights.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
      </div>`
    : ''

  const parsed = parseStrategistNarrative(text)
  const cards = parsed.scenarios.map(
    (scenario) => `<article class="strategist-card">
      <h4>${escapeHtml(scenario.label)}</h4>
      ${markdownToHtml(scenario.body)}
    </article>`
  )
  const measurementHtml = parsed.measurement
    ? `<div class="callout callout-measurement"><h4>Measurement</h4><p>${escapeHtml(parsed.measurement)}</p></div>`
    : ''
  const summaryHtml =
    parsed.summary.length > 0
      ? `<div class="callout callout-summary">
          <h4>Summary</h4>
          <ul>${parsed.summary.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </div>`
      : ''

  return `${sparkCallout}<div class="strategist-grid">${cards.join('')}</div>${measurementHtml}${summaryHtml}`
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
  const rawText = snapshot.narratives.synthesis?.sanitized || snapshot.narratives.synthesis?.raw || ''
  const rider = extractSynthesisRider(rawText || '')
  let text = stripSynthesisRider(rawText || '')
  const measurementMatch = /Measurement\s+—\s*(.+)/i.exec(text)
  let measurement = ''
  if (measurementMatch) {
    measurement = measurementMatch[1].trim()
    text = text.replace(measurementMatch[0], '').trim()
  }
  const packMatch = /Pack line\s+—\s*(.+)/i.exec(text)
  let packLine = ''
  if (packMatch) {
    packLine = packMatch[1].trim()
    text = text.replace(packMatch[0], '').trim()
  }
  const staffMatch = /Staff line\s+—\s*(.+)/i.exec(text)
  let staffLine = ''
  if (staffMatch) {
    staffLine = staffMatch[1].trim()
    text = text.replace(staffMatch[0], '').trim()
  }

  const blocks: string[] = []
  blocks.push(renderMarkdownBlock(text || '_No synthesis narrative._'))
  if (measurement) {
    blocks.push(`<div class="callout callout-measurement"><h4>Measurement</h4><p>${escapeHtml(measurement)}</p></div>`)
  }
  if (packLine || staffLine) {
    const extras: string[] = []
    if (packLine) extras.push(`<p><strong>Pack line</strong> — ${escapeHtml(packLine)}</p>`)
    if (staffLine) extras.push(`<p><strong>Staff line</strong> — ${escapeHtml(staffLine)}</p>`)
    blocks.push(`<div class="synthesis-extras">${extras.join('')}</div>`)
  }
  if (rider) {
    blocks.push(renderRiderTable(rider))
  }
  return blocks.join('')
}

function renderMarkdownBlock(value: string | null | undefined) {
  if (!value || !value.trim()) return '<p>No content.</p>'
  return markdownToHtml(value)
}

function renderEvaluationNarrative(text: string): string {
  const sections = parseEvaluationSections(text)
  const order = [
    'Verdict',
    'Why It Works',
    'Where It Breaks',
    'Fix It',
    'Retailer Reality',
    'Tighten',
    'Stretch',
    'Hook Upgrade',
    'Hook Shortlist',
    'Measurement',
    'Pack Line',
    'Staff Line',
  ]
  const parts: string[] = []
  for (const key of order) {
    const content = sections[key]
    if (!content) continue
    if (key === 'Hook Shortlist') {
      const hooks = content
        .split(/\n|•|-|\u2022/)
        .map((line) => cleanText(line))
        .filter(Boolean)
      if (hooks.length) {
        parts.push(renderListSection('Hook shortlist', hooks))
      }
      continue
    }
    if (key === 'Measurement') {
      parts.push(`<div class="callout callout-measurement"><h4>Measurement</h4><p>${escapeHtml(content)}</p></div>`)
      continue
    }
    if (key === 'Pack Line' || key === 'Staff Line') {
      parts.push(`<p><strong>${escapeHtml(key)}</strong> — ${escapeHtml(content)}</p>`)
      continue
    }
    parts.push(`<p><strong>${escapeHtml(key)}</strong> — ${escapeHtml(content)}</p>`)
  }
  return parts.length ? `<div class="structured-block">${parts.join('')}</div>` : renderMarkdownBlock(text)
}

function parseEvaluationSections(text: string): Record<string, string> {
  let cleaned = text.replace(/\r\n/g, '\n').trim()
  cleaned = cleaned.replace(/-\s*([^-\n]+?)\s+Measurement\s*:/gi, (_, hook) => `- ${hook.trim()}\nMeasurement:`)
  const sections: Record<string, string> = {}
  const regex = /([A-Za-z’'&]+(?:[ \t]+[A-Za-z’'&]+)*)\s*(?:—|:)\s+/g
  let match: RegExpExecArray | null
  let lastIndex = 0
  let currentKey: string | null = null
  while ((match = regex.exec(cleaned))) {
    const heading = normalizeHeading(match[1])
    if (heading === 'Source') {
      continue
    }
    if (currentKey) {
      sections[currentKey] = cleaned.slice(lastIndex, match.index).trim()
    }
    currentKey = heading
    lastIndex = match.index + match[0].length
  }
  if (currentKey) {
    sections[currentKey] = cleaned.slice(lastIndex).trim()
  }
  return sections
}

function normalizeHeading(raw: string): string {
  const heading = raw.replace(/[^A-Za-z’' ]+/g, '').trim()
  return heading
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : ''))
    .join(' ')
}

function parseStrategistNarrative(text: string): { scenarios: Array<{ label: string; body: string }>; measurement: string | null; summary: string[] } {
  const cleaned = text.replace(/\r\n/g, '\n').trim()
  const scenarioRegex = /Scenario\s+—\s*([^—\n]+?)\s+—\s*/g
  let match: RegExpExecArray | null
  let lastIndex = 0
  let currentLabel: string | null = null
  const scenarios: Array<{ label: string; body: string }> = []
  while ((match = scenarioRegex.exec(cleaned))) {
    if (currentLabel) {
      const body = cleaned.slice(lastIndex, match.index).trim()
      scenarios.push({ label: currentLabel, body })
    }
    currentLabel = match[1].trim()
    lastIndex = match.index + match[0].length
  }
  let measurement: string | null = null
  const measurementRegex = /Measurement\s+—\s*([^\n]+)/i
  const measurementMatch = measurementRegex.exec(cleaned)
  if (measurementMatch) {
    measurement = measurementMatch[1].trim()
  }
  if (currentLabel) {
    const tailEnd = measurementMatch ? measurementMatch.index : cleaned.length
    const body = cleaned.slice(lastIndex, tailEnd).trim()
    scenarios.push({ label: currentLabel, body })
  }
  const summary: string[] = []
  const summaryRegex = /Summary\s*(?:\n|[-–]\s*)([\s\S]*)$/i
  const summaryMatch = summaryRegex.exec(cleaned)
  if (summaryMatch) {
    summary.push(
      ...summaryMatch[1]
        .split(/\s*[-–]\s+/)
        .map((line) => cleanText(line))
        .filter(Boolean)
    )
  }
  return { scenarios, measurement, summary }
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
    return `Source: ${url.hostname.replace(/^www\./, '')}`
  } catch {
    return `Source: ${candidate}`
  }
}

function collectSparkFacts(payload: any): Array<{ claim: string; source?: string }> {
  if (!payload) return []
  const analysis = payload.analysis || {}
  const hookOptions = Array.isArray(payload?.hookPlayground?.options)
    ? payload.hookPlayground.options.filter((opt: any) => opt && typeof opt.headline === 'string')
    : []
  const cadenceIdeas = Array.isArray(payload?.hookPlayground?.cadence)
    ? payload.hookPlayground.cadence.filter((line: any) => typeof line === 'string' && line.trim())
    : []
  const facts: Array<{ claim: string; source?: string }> = []
  const push = (claim?: string, source?: string) => {
    if (!claim) return
    const text = String(claim).trim()
    if (!text) return
    facts.push({ claim: text, source })
  }

  push(analysis.summary, 'Spark summary')
  push(analysis.audience, 'Spark audience')
  const valueLine =
    (typeof analysis?.value?.description === 'string' && analysis.value.description) ||
    (typeof analysis?.value?.summary === 'string' && analysis.value.summary) ||
    ''
  push(valueLine, 'Value lens')
  push(analysis.cadence, 'Cadence')
  const tradeLine = [analysis?.trade?.reward, analysis?.trade?.guardrail]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' • ')
  push(tradeLine, 'Trade cue')

  if (Array.isArray(analysis.tensions)) {
    analysis.tensions
      .filter((line: any) => typeof line === 'string' && line.trim())
      .slice(0, 4)
      .forEach((line: string) => push(line, 'Shopper tension'))
  }
  if (Array.isArray(analysis.compliance)) {
    analysis.compliance
      .filter((line: any) => typeof line === 'string' && line.trim())
      .slice(0, 4)
      .forEach((line: string) => push(line, 'Compliance guardrail'))
  }
  hookOptions.slice(0, 3).forEach((opt: any) => {
    const support = opt.support ? ` — ${opt.support}` : ''
    push(`Hook: ${opt.headline}${support}`, 'Hook contender')
  })
  cadenceIdeas.slice(0, 3).forEach((line: string) => push(`Cadence riff: ${line}`, 'Cadence cue'))

  return facts
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
.multi-room{border:1px solid rgba(15,23,42,0.08);border-radius:16px;padding:18px;background:#f8fafc;margin-bottom:18px;}
.multi-room-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;}
.multi-room-label{letter-spacing:0.28em;text-transform:uppercase;font-size:11px;color:#64748b;margin:0;}
.multi-room-verdict{margin:4px 0 0;font-size:22px;font-weight:600;color:#0f172a;}
.multi-room-notes{margin:6px 0 0;font-size:12px;color:#475569;}
.multi-room-body{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:14px;}
.multi-room-list{border:1px solid rgba(15,23,42,0.06);border-radius:12px;padding:12px;background:#ffffff;}
.multi-room-list-title{font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#475569;margin-bottom:6px;}
.multi-room-list ul{margin:0;padding-left:18px;font-size:13px;color:#0f172a;}
.multi-room-list li{margin-bottom:4px;}
.multi-room-agents{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;}
.multi-room-agent{border:1px solid rgba(15,23,42,0.08);border-radius:12px;padding:12px;background:#ffffff;}
.multi-room-agent-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;}
.multi-room-agent-name{text-transform:uppercase;font-size:11px;color:#475569;letter-spacing:0.18em;}
.multi-room-agent-pill{font-size:11px;padding:4px 8px;border-radius:999px;background:rgba(14,165,233,0.14);color:#0369a1;border:1px solid rgba(14,165,233,0.32);}
.multi-upgrade{border:1px solid rgba(15,23,42,0.08);border-radius:16px;padding:20px;background:#ffffff;margin-bottom:18px;}
.multi-upgrade-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;}
.multi-upgrade-label{letter-spacing:0.28em;text-transform:uppercase;font-size:11px;color:#64748b;margin:0;}
.multi-upgrade-title{margin:6px 0 0;font-size:20px;font-weight:600;color:#0f172a;}
.multi-upgrade-notes{margin:4px 0 0;font-size:12px;color:#475569;}
.multi-upgrade-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-bottom:16px;}
.multi-upgrade-card{border:1px solid rgba(15,23,42,0.08);border-radius:12px;padding:14px;background:#f8fafc;}
.multi-upgrade-card-head{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:600;color:#0f172a;margin-bottom:6px;}
.multi-upgrade-pill{font-size:11px;padding:4px 8px;border-radius:999px;background:rgba(14,165,233,0.12);color:#0369a1;border:1px solid rgba(14,165,233,0.24);}
.multi-upgrade-summary{margin:0 0 6px;font-size:13px;color:#0f172a;}
.multi-upgrade-offer{font-size:12px;color:#0369a1;margin-bottom:6px;}
.multi-upgrade-hooks ul,.multi-upgrade-why ul{margin:4px 0 0;padding-left:18px;font-size:12px;color:#0f172a;}
.multi-upgrade-hooks strong,.multi-upgrade-why strong,.multi-upgrade-trade strong,.multi-upgrade-mechanic strong{display:block;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#475569;margin-bottom:2px;}
.multi-upgrade-runners strong{display:block;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#475569;margin-bottom:2px;}
.multi-upgrade-runners ul{margin:4px 0 0;padding-left:18px;font-size:12px;color:#0f172a;}
.multi-upgrade-trade,.multi-upgrade-mechanic{font-size:12px;color:#0f172a;margin-bottom:4px;}
.multi-upgrade-hero{font-size:12px;color:#0f172a;margin-bottom:4px;}
.multi-upgrade-hero strong{display:block;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#475569;margin-bottom:2px;}
.multi-upgrade-agents{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;}
.multi-upgrade-agent{border:1px solid rgba(15,23,42,0.08);border-radius:12px;padding:12px;background:#f9fafc;}
.multi-upgrade-agent-name{text-transform:uppercase;font-size:11px;color:#475569;letter-spacing:0.18em;margin-bottom:4px;}
.multi-upgrade-agent ul{margin:0;padding-left:18px;font-size:12px;color:#0f172a;}
.lens-section{border:1px solid rgba(15,23,42,0.08);border-radius:16px;padding:16px;background:#ffffff;}
.lens-section h3{margin:0 0 10px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;}
.lens-section ul{margin:0;padding-left:18px;color:#0f172a;}
.lens-section li{margin-bottom:6px;}
.framing-structured{display:flex;flex-direction:column;gap:18px;}
.framing-summary{border:1px solid rgba(15,23,42,0.08);border-radius:18px;padding:18px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);}
.framing-summary p{margin:0 0 8px;}
.framing-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;}
.framing-narrative{border:1px solid rgba(15,23,42,0.08);border-radius:18px;padding:18px;background:#ffffff;}
.framing-narrative :where(p,ul){margin-bottom:10px;}
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
.spark-panel{position:relative;overflow:hidden;border-radius:28px;padding:28px;border:1px solid rgba(14,165,233,0.22);background:linear-gradient(135deg,rgba(13,148,136,0.12),rgba(59,130,246,0.1),rgba(234,179,8,0.12));box-shadow:0 24px 48px rgba(15,23,42,0.08);}
.spark-panel::after{content:\"\";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 15% 20%,rgba(16,185,129,0.25),transparent 45%),radial-gradient(circle at 85% 0%,rgba(59,130,246,0.2),transparent 40%),radial-gradient(circle at 50% 120%,rgba(234,179,8,0.25),transparent 55%);opacity:0.7;animation:sparkGlow 8s ease-in-out infinite alternate;}
.spark-panel>*{position:relative;z-index:1;}
.spark-panel-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:18px;}
.spark-panel-eyebrow{letter-spacing:0.32em;text-transform:uppercase;font-size:11px;color:#0f766e;margin:0 0 4px 0;}
.spark-panel-title{margin:0;font-size:22px;font-weight:600;color:#0f172a;}
.spark-panel-subtitle{margin:4px 0 0;font-size:14px;color:#0f172a99;}
.spark-chip{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;border:1px solid rgba(255,255,255,0.7);background:rgba(255,255,255,0.85);font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#0f172a;}
.spark-chip-dot{width:8px;height:8px;border-radius:999px;background:#059669;box-shadow:0 0 8px rgba(5,150,105,0.8);}
.spark-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:18px;}
.spark-card{border-radius:18px;padding:16px;border:1px solid rgba(255,255,255,0.8);background:rgba(255,255,255,0.9);backdrop-filter:blur(6px);box-shadow:0 10px 25px rgba(15,23,42,0.08);}
.spark-card h4{margin:0 0 8px;font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:#475569;}
.spark-card p{margin:0;font-size:14px;color:#0f172a;}
.spark-card ul{margin:0;padding-left:18px;font-size:14px;color:#0f172a;}
.spark-card li{margin:4px 0;}
.spark-badge-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:18px;}
.spark-badge{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:600;color:#0f172a;background:rgba(255,255,255,0.9);border:1px solid rgba(255,255,255,0.8);box-shadow:0 8px 20px rgba(15,23,42,0.08);}
.spark-badge small{display:block;font-size:11px;font-weight:400;color:#475569;}
.spark-badge--hooks{background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.4);color:#065f46;}
.spark-badge--cadence{background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.4);color:#0f4c81;}
.spine-grid{display:grid;gap:18px;margin-top:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));}
.spine-card{border:1px solid rgba(15,23,42,0.08);border-radius:20px;padding:20px;background:linear-gradient(180deg,#ffffff 0%,#f6f8fc 100%);box-shadow:0 16px 28px rgba(15,23,42,0.05);}
.spine-card h4{margin:0 0 10px;font-size:13px;letter-spacing:0.24em;text-transform:uppercase;color:#0f172a;}
.spine-card p{margin:0 0 10px;font-size:14px;line-height:1.6;}
.evidence-grid{display:grid;gap:18px;margin-top:10px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));}
.wild-grid{display:grid;gap:18px;margin-top:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));}
@keyframes sparkGlow{0%{opacity:0.55;transform:scale(1);}100%{opacity:0.85;transform:scale(1.05);}}
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
.callout-offeriq{background:rgba(16,185,129,0.12);border-color:rgba(16,185,129,0.32);}
.callout-decision{background:rgba(14,165,233,0.12);border-color:rgba(14,165,233,0.35);}
.evaluation-reason-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin:18px 0;}
.evaluation-reason{border:1px solid rgba(15,23,42,0.08);border-radius:16px;padding:18px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);box-shadow:0 10px 20px rgba(15,23,42,0.04);}
.evaluation-reason h4{margin:0 0 8px;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;}
.evaluation-focus-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin:24px 0;}
.evaluation-focus{border:1px solid rgba(15,23,42,0.12);border-radius:18px;padding:20px;background:linear-gradient(180deg,#ffffff 0%,#f6f8fc 100%);box-shadow:0 16px 30px rgba(15,23,42,0.05);}
.evaluation-focus-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;}
.evaluation-focus h4{margin:0;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;}
.evaluation-focus p{margin:8px 0;color:#0f172a;}
.evaluation-focus-lead{font-weight:600;color:#0f172a;}
.evaluation-focus-fix{font-weight:600;color:#0f172a;}
.evaluation-focus-tail{color:#475569;font-style:italic;}
.evaluation-pill{border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;border:1px solid transparent;}
.evaluation-pill.is-green{background:rgba(16,185,129,0.12);color:#047857;border-color:rgba(16,185,129,0.2);}
.evaluation-pill.is-amber{background:rgba(251,191,36,0.15);color:#92400e;border-color:rgba(251,191,36,0.3);}
.evaluation-pill.is-red{background:rgba(248,113,113,0.18);color:#b91c1c;border-color:rgba(248,113,113,0.28);}
.evaluation-focus-list{margin-top:12px;}
.evaluation-focus-list strong{display:block;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#475569;margin-bottom:6px;}
.evaluation-focus-list ul{margin:0;padding-left:18px;color:#0f172a;}
.strategist-grid{display:grid;gap:18px;margin-bottom:12px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));}
.strategist-card{border:1px solid rgba(15,23,42,0.08);border-radius:18px;padding:18px;background:#f6f8fc;box-shadow:0 10px 22px rgba(15,23,42,0.05);}
.strategist-card h4{margin:0 0 8px;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:#1f2937;}
.strategist-card p{margin:0 0 10px;font-size:14px;line-height:1.5;}
.callout-summary{background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.3);}
.synthesis-extras p{margin:6px 0;font-size:14px;color:#0f172a;}
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
  <main>
    ${sectionsHtml}
  </main>
  <section class="page services-callout">
    <div class="section-body">
      <p><strong>Mark Alexander</strong> — <a href="mailto:mark@trevor.services">mark@trevor.services</a></p>
      <p>Generated by Trudy • ${escapeHtml(model.meta.campaignId)}</p>
    </div>
  </section>
  <footer>
    <strong>Trevor Services</strong>
    ${escapeHtml(model.meta.documentTitle)}
  </footer>
</div>
</body>
</html>`
}
function renderScoreboard(board: any) {
  if (!board || typeof board !== 'object') return ''
  const rows = Object.entries(board)
    .filter(([key]) => !['decision', 'conditions', 'measurement'].includes(key))
    .map(([key, value]: [string, any]) => {
      const label = prettifyScoreboardKey(key)
      const status = String(value?.status || 'NA').toUpperCase()
      const why = cleanText(value?.why || '')
      const fix = cleanText(value?.fix || '')
      return { label, status, why, fix }
    })
    .filter((row) => row.why || row.fix)
  if (!rows.length) return ''
  return `
    <div class="scoreboard">
      <div class="scoreboard-title">Scoreboard</div>
      <table>
        <thead><tr><th>Area</th><th>Status</th><th>Notes</th></tr></thead>
        <tbody>
          ${rows
            .map((row) => {
              const pillClass =
                row.status === 'GREEN' ? 'score-pill-green' :
                row.status === 'RED' ? 'score-pill-red' :
                row.status === 'AMBER' ? 'score-pill-amber' : 'score-pill-na'
              return `<tr>
                <td>${escapeHtml(row.label)}</td>
                <td><span class="score-pill ${pillClass}">${escapeHtml(row.status)}</span></td>
                <td>${escapeHtml(row.fix || row.why || '')}</td>
              </tr>`
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `
}
