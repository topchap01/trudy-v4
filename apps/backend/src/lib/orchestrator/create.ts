// apps/backend/src/lib/orchestrator/create.ts
import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { composeFerrierRoutes } from '../copydesk.js'
import { runResearch, type ResearchPack } from '../research.js'
import { scoreOffer, type OfferIQ } from '../offeriq.js'
import type { FramingV2Meta } from './framing.js'
import { resolveModel } from '../models.js'
import { buildLawPrompt } from '../creative-laws.js'

function rid() { return Math.random().toString(36).slice(2, 10) }

export type Intensity = 'CONSERVATIVE'|'DISRUPTIVE'|'OUTRAGEOUS'
export type Mode = 'BUILD'|'GREENFIELD'|'DISRUPT' // DISRUPT alias
export type RuleFlex = 'KEEP' | 'BEND' | 'BREAK'

type RunCreateOpts = {
  intensity?: Intensity
  count?: number
  mode?: Mode
  ruleFlex?: RuleFlex
  /** Include a short nod to framing (tensions/category codes only). */
  tipFraming?: boolean
  /** SAFE hints extracted in the route from latest Framing v2. */
  framingHints?: { tensions: string[]; categoryCodes: string[] }
  /** Full framing meta (allows research/offer reuse). */
  framingMeta?: FramingV2Meta | null
}

export async function runCreate(
  ctx: CampaignContext,
  opts: RunCreateOpts = {}
) {
  const {
    intensity = 'CONSERVATIVE',
    count = 5,
    mode = 'GREENFIELD',
    ruleFlex = 'KEEP',
    tipFraming = true,
    framingHints,
    framingMeta = null,
  } = opts

  const isGreenfield = mode === 'GREENFIELD' || mode === 'DISRUPT'
  const model = resolveModel(process.env.MODEL_CREATE, process.env.MODEL_DEFAULT, 'gpt-4o-mini')

  const tempMap: Record<Intensity, number> = {
    CONSERVATIVE: 0.55,
    DISRUPTIVE: 0.80,
    OUTRAGEOUS: 0.92,
  }
  const temperature = tempMap[intensity]
  const top_p = intensity === 'CONSERVATIVE' ? 1 : 0.9

  // ---- DETECT ASSURED VALUE MODE (cashback/GWP-unlimited) ----
  const spec: any = ctx.briefSpec || {}
  const type = String(spec?.typeOfPromotion || '').toUpperCase()
  const gwp = spec?.gwp || null
  const cashback = spec?.cashback || null
  const hasCashback = Boolean(type === 'CASHBACK' || cashback)
  const assuredViaCashback = hasCashback && Boolean(!cashback || cashback.assured !== false)
  const assuredViaGWP = !!(type === 'GWP' || gwp) && (gwp?.cap === 'UNLIMITED' || gwp?.cap == null)
  const isAssuredValue = !!(assuredViaCashback || assuredViaGWP)

  // ---- LIVE RESEARCH + OFFER IQ (mirrors evaluate.ts behaviours) ----
  const researchLevel = (process.env.RESEARCH_LEVEL as 'LITE'|'DEEP'|'MAX') || 'DEEP'
  let research: ResearchPack | null = framingMeta?.research ?? null
  if (!research) {
    try { research = await runResearch(ctx, researchLevel) } catch { research = null }
  }

  // Pass research into OfferIQ for better adequacy read
  const ctxWithResearch = Object.assign({}, ctx, { research }) as CampaignContext & { research: ResearchPack | null }
  let offerIQ: OfferIQ | null = framingMeta?.offer_iq ?? null
  if (!offerIQ) {
    try { offerIQ = scoreOffer(ctxWithResearch) } catch { offerIQ = null }
  }

  // ---- BANNED MOTIFS from the brief (and known exemplars) ----
  const banned = collectBannedMotifs(ctx)

  // ---- BRAND snapshot / anchors ----
  const anchorLines = buildBriefAnchors(ctx)
  const anchorBlock = anchorLines.length
    ? ['BRIEF ANCHORS (non-negotiable):', ...anchorLines.map((line) => `- ${line}`)].join('\n')
    : ''

  const brandFacts = [
    ctx.clientName ? `Brand: ${ctx.clientName}` : '',
    `Market: ${ctx.market || 'AU'}`,
    `Category: ${ctx.category || 'n/a'}`,
    `Brand position: ${ctx.brandPosition || 'UNKNOWN'}`,
    Array.isArray(ctx.briefSpec?.retailers) && ctx.briefSpec!.retailers.length
      ? `Retailers/Channels: ${ctx.briefSpec!.retailers.join(', ')}`
      : '',
    ctx.briefSpec?.calendarTheme ? `Season/Theme: ${ctx.briefSpec.calendarTheme}` : '',
    ctx.briefSpec?.frictionBudget ? `Friction budget: ${ctx.briefSpec.frictionBudget}` : '',
    ctx.briefSpec?.tradeIncentive ? `Trade incentive: ${ctx.briefSpec.tradeIncentive}` : '',
  ].filter(Boolean).join(' | ')

  // (Optional) “hat tip” — prefer safe hints from Framing; else brief’s tensions/codes
  const tensions = framingHints?.tensions?.length
    ? framingHints.tensions.slice(0, 3)
    : coerceStrList(ctx.briefSpec?.tensions).slice(0, 3)

  const categoryCodes = framingHints?.categoryCodes?.length
    ? framingHints.categoryCodes.slice(0, 4)
    : coerceStrList((ctx.briefSpec as any)?.categoryCodes || (ctx.briefSpec as any)?.category_codes).slice(0, 4)

  const framingTip = tipFraming && (tensions.length || categoryCodes.length)
    ? [
        'Framing hints (do NOT copy phrasing; address the tension only):',
        tensions.length ? `- Tensions: ${tensions.join(' • ')}` : '',
        categoryCodes.length ? `- Category codes to lean/break: ${categoryCodes.join(' • ')}` : '',
      ].filter(Boolean).join('\n')
    : ''

  // ---- RESEARCH SNAPSHOT (compact; safe to expose to model) ----
  const bench = research?.benchmarks
  const prizeHeroMedian = bench?.heroPrize?.median ?? null
  const prizeHeroMode = bench?.heroPrize?.mode ?? null
  const cadenceShare = bench?.cadenceShare || null
  const manyWinnersShare = typeof bench?.manyWinnersShare === 'number' ? bench!.manyWinnersShare : null
  const cashbackAbs = bench?.cashbackAbs || null
  const seasonLabel = research?.season?.label || null
  const retailerNames = (research?.retailers?.names || []).slice(0,8)
  const researchSnapshot = {
    seasonLabel,
    retailerNames,
    prizeHeroMedian,
    prizeHeroMode,
    cadenceShare,
    manyWinnersShare,
    cashbackAbs, // { median, p25, p75, sampleSize }
  }

  // ---- OFFER IQ SNAPSHOT (never invent numbers) ----
  const oi = offerIQ || ({} as any)
  const oiSnap = {
    mode: oi.mode || null,
    verdict: oi.verdict || null,
    confidence: oi.confidence ?? null,
    valueAmount: (oi.diagnostics && oi.diagnostics.valueAmount) || null,
    headlineMax: (oi.diagnostics && (oi as any).diagnostics?.headlineMax) || null,
    asks: Array.isArray(oi.asks) ? oi.asks.slice(0,3) : [],
  }

  // ---- Intensity guidance ----
  const intensityBlock = (lvl: Intensity) => {
    if (lvl === 'CONSERVATIVE') return [
      'INTENSITY: CONSERVATIVE.',
      '- Brand-first, retailer-first. Proven shapes, premium tone.',
      '- Keep friction ultra-low. No app downloads; QR → one-screen. Avoid receipt upload unless OCR on one screen.',
      '- Avoid spectacle; no sports/weather/culture triggers.',
      '- Absolutely zero store burden; staff can explain in 5 seconds.',
    ].join('\n')
    if (lvl === 'DISRUPTIVE') return [
      'INTENSITY: DISRUPTIVE.',
      '- Brand-first with a sharper behavioural hook.',
      '- You may use ONE intelligent trigger (sports/weather/culture) with a clear backstop and named source of truth.',
      '- Add weekly cadence or instant wins to support frequency.',
      '- Keep ops simple: QR, one-screen forms, central fulfilment.',
      '- At most one cashback/conditional cashback across the set; only if brand-true.',
    ].join('\n')
    return [
      'INTENSITY: OUTRAGEOUS.',
      '- Permission-seeking, PR-able platform rooted in brand truth and category codes.',
      '- Singular, theatrical activation moment; still staff-explainable in 5 seconds.',
      '- Triggers allowed; ALWAYS include backstop + source of truth; keep legal/compliance clean (RSA/ABAC, age gate).',
      '- Do NOT default to cashback. If used, it must be re-framed in a brand-distinct way.',
    ].join('\n')
  }

  // ---- Policy gates ----
  type Gates = {
    TRIGGERS_ALLOWED: number | 'ANY'
    CASHBACK_MAX: number
    MUSTS: string[]
    FORBIDS: string[]
  }
  const gatesByIntensity: Record<Intensity, Gates> = {
    CONSERVATIVE: {
      TRIGGERS_ALLOWED: 0,
      CASHBACK_MAX: 0,
      MUSTS: [
        'Five-second staff script',
        'On-pack/neck-tag QR → one-screen mobile flow',
        'Zero store adjudication; central fulfilment/contact',
      ],
      FORBIDS: [
        'Sports/weather/culture triggers',
        'Conditional cashback',
        'Classic single-prize draw with thin odds',
      ],
    },
    DISRUPTIVE: {
      TRIGGERS_ALLOWED: 1,
      CASHBACK_MAX: 1,
      MUSTS: [
        'Weekly cadence and/or instant wins for frequency',
        'Any trigger must include a clear backstop and named source of truth',
      ],
      FORBIDS: [],
    },
    OUTRAGEOUS: {
      TRIGGERS_ALLOWED: 'ANY',
      CASHBACK_MAX: 1,
      MUSTS: [
        'Singular, theatrical signature moment that is still staff-explainable in five seconds',
        'Triggers MUST include backstop + source of truth',
      ],
      FORBIDS: [
        'Any mechanic requiring staff adjudication or handout at tills',
      ],
    },
  }
  const gates = gatesByIntensity[intensity]
  const gateLine = [
    `POLICY GATES:`,
    `- TRIGGERS_ALLOWED=${gates.TRIGGERS_ALLOWED}`,
    `- CASHBACK_MAX=${gates.CASHBACK_MAX} across the entire set`,
    ...gates.MUSTS.map(s => `- MUST: ${s}`),
    ...gates.FORBIDS.map(s => `- FORBID: ${s}`),
  ].join('\n')

  // ---- PRIZE DEPTH ENGINE (structure + echo rule) ----
  const prizeDepthBlock = [
    'PRIZE DEPTH ENGINE (hard rules):',
    '- No generic prizes. Every prize must contain at least one brand-world element: place, ritual, artifact, access, craft, provenance, or owned partnership.',
    '- Ladder echo rule: Hero, runners, and instants must speak the same language (same world). No random vouchers.',
    '- Hook → Prize golden thread: state how the hook leads to a specific scene, then to a tangible keepsake.',
    isAssuredValue
      ? '- Assured value brief detected (cashback/GWP). Lead with certainty. Any major-prize overlay only if clearly additive and store-safe.'
      : '- Prize mode brief detected. Improve perceived odds via breadth (runners/instants) and cadence; publish “total winners” (do not invent numbers).',
  ].join('\n')

  // ---- Novelty guard ----
  const bannedLines = banned.slice(0, 10).map(x => `- ${x}`).join('\n') || '- (none)'
  const noveltyBlock = [
    'NOVELTY / NON-REUSE (hard rule):',
    'Do NOT reuse or paraphrase any specific prizes/mechanics/examples named in the brief or known exemplars.',
    'Do NOT reuse hooks verbatim from the brief or framing.',
    'Replace any motif that collides with *BANNED* with a brand-true alternative.',
    'BANNED EXAMPLARS:',
    bannedLines,
  ].join('\n')

  // ---- Formatting rules (for neat on-screen output) ----
  const formatRules = [
    'FORMATTING:',
    '- Use clean label-value lines. Example: "Hook: ...".',
    '- Do NOT use bold, italics, code blocks, or asterisks for emphasis.',
    '- Use the bullet "•" for sub-lists (max 3 items each).',
    '- Keep spacing tight; one blank line between sections.',
  ].join('\n')

  // ---- Systems ----
  const anchorGuard = anchorLines.length
    ? 'Respect the BRIEF ANCHORS supplied by the user. They define the baseline mechanic/value; you may only enhance or clarify them.'
    : 'If the user supplies BRIEF ANCHORS, treat them as non-negotiable baseline mechanics/value.'

  const sysGreenfield = [
    'You are MAKERS, a senior creative duo inventing net-new, brand-first CAMPAIGN PLATFORMS for grocery brands.',
    'Write in Adam Ferrier’s voice: evidence-led, sharp, specific, human. No clichés. No marketing bingo.',
    MARK_LAW_PROMPT_CREATE,
    'When you cite or bend a law, reference its ID (e.g., L5.3, L9.2).',
    'Start from BRAND TRUTH → AUDIENCE TENSION → SEASONAL MOMENT → CATEGORY CODES. Then craft the idea.',
    'Do NOT start from mechanics. Mechanics serve the idea.',
    anchorGuard,
    '',
    intensityBlock(intensity),
    gateLine,
    '',
    prizeDepthBlock,
    '',
    noveltyBlock,
    '',
    formatRules,
    '',
    'Variety across outputs:',
    '- Provide distinct platforms (different ideas + brand levers).',
    '- At most one cashback/conditional cashback across the whole set, only if it fits the brand (otherwise none).',
    '- Do not use the same archetype twice unless the ideas are fundamentally different.',
    '',
    'If season/target unknown: propose the platform, then add a single line Seasonal variant (Winter/Summer tweak). Do NOT invent demographics.',
    '',
    'Each PLATFORM must include, in this exact order and with these labels:',
    'Platform name:',
    'Hook (use on-poster):',
    'Alt hook:',
    'Brand lens (truth, tension, codes to lean/break):',
    'Platform idea (one paragraph):',
    'Signature activation moment:',
    'Core mechanic (staff script):',
    'Value exchange (if any):',
    'Prize / Value architecture:',
    '• Hero prize — [place / who hosts / duration] + itinerary (3 bullets) + tangible keepsake.',
    '• Runner-up prizes — same world, smaller scale (2–3 examples).',
    '• Instant wins — token from the same world (2–3 examples).',
    'Hook–Prize lock (the golden thread, 1 sentence):',
    'Brand-fit rationale (2 lines):',
    'Retail scene (how staff say it in ≤5s):',
    'Frequency loop:',
    'Fulfilment note (complexity & fix):',
    'Assumptions/Asks (only if needed; no invented numbers):',
    'Retailer story:',
    'KPIs:',
    'Risks & mitigations:',
    'Compliance:',
    'Why it is right for this brand now:',
    'Seasonal variant:',
  ].join('\n')

  const sysBuild = [
    'You are MAKERS, generating retail-ready ROUTES but keep the same idea anchor.',
    'Write in Adam Ferrier’s voice: evidence-led, sharp, specific.',
    MARK_LAW_PROMPT_CREATE,
    'Reference law IDs whenever you justify ambition, ops, or risk decisions.',
    anchorGuard,
    intensityBlock(intensity),
    gateLine,
    '',
    prizeDepthBlock,
    '',
    noveltyBlock,
    '',
    formatRules,
    '',
    'Each ROUTE must include:',
    'Hook (use on-poster):',
    'Alt hook (same idea):',
    'Mechanic (staff script):',
    'Prize / Value architecture:',
    '• Hero prize — [place / who hosts / duration] + itinerary (3 bullets) + tangible keepsake.',
    '• Runner-up prizes — same world (2–3).',
    '• Instant wins — token from the same world (2–3).',
    'Hook–Prize lock:',
    'Value exchange (math, if any):',
    'Frequency loop:',
    'Retailer story:',
    'Fulfilment note:',
    'Assumptions/Asks:',
    'KPIs:',
    'Risks & mitigations:',
    'Compliance:',
    'Brand fit:',
  ].join('\n')

  const system = isGreenfield ? sysGreenfield : sysBuild

  // ---- User prompt ----
  const user = [
    `Client: ${ctx.clientName ?? ''} — ${ctx.title || ''}`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Brand position: ${ctx.brandPosition || 'unknown'}`,
    `Mode: ${isGreenfield ? 'GREENFIELD (brand-first)' : 'BUILD (tighten incumbent)'} | Intensity: ${intensity} | Number of platforms: ${count}`,
    '',
    'BRAND SNAPSHOT (facts):',
    brandFacts || '_none_',
    anchorBlock ? `\n${anchorBlock}` : '',
    framingTip ? `\n${framingTip}` : '',
    '',
    'RESEARCH SNAPSHOT (authoritative hints; do not fabricate):',
    JSON.stringify(researchSnapshot),
    '',
    'OFFERIQ SNAPSHOT (do not invent numbers; use only to judge adequacy & where to add breadth):',
    JSON.stringify(oiSnap),
    '',
    'Output rules:',
    `- Return exactly ${count} ${isGreenfield ? 'platforms' : 'routes'}.`,
    `- Use "### <Platform Name> — <one-line promise>" as the heading for each.`,
    '- Start brand-first; do NOT start from mechanics.',
    '- Adhere strictly to POLICY GATES, PRIZE DEPTH ENGINE and NOVELTY rules above.',
    '- Keep store burden at zero. Central fulfilment/winner contact.',
    '- Reference relevant law IDs (e.g., L5.3, L9.2) when defending ambition, fairness, or retailer feasibility.',
  ].join('\n')

  // ---- Generate candidates (K) and apply novelty screen ----
  const K = 4
  const gens = await Promise.all(
    Array.from({ length: K }, () =>
      chat({
        model,
        system,
        messages: [{ role: 'user', content: user }],
        temperature,
        top_p,
        meta: { scope: 'create.generate', campaignId: ctx.id },
      })
    )
  )

  const candidates = gens.map((g) => {
    const id = rid()
    const novelty = scoreNovelty(g, banned)
    return { id, content: g, novelty }
  })

  // If everything collided, attempt one regeneration pass
  if (candidates.every(c => c.novelty.tainted)) {
    const regen = await chat({
      model,
      system,
      messages: [{
        role: 'user',
        content: [
          user,
          '',
          'Your previous set overlapped BANNED motifs. Regenerate the full set:',
          '- Replace any prize/mechanic that overlaps BANNED with a brand-true alternative.',
          '- Keep the same structure and intensity; ensure platforms are distinct.',
        ].join('\n')
      }],
      temperature,
      top_p,
      meta: { scope: 'create.regenerate', campaignId: ctx.id },
    })
    const id = rid()
    candidates.push({ id, content: regen, novelty: scoreNovelty(regen, banned) })
  }

  // ---- Judge with prize–brand fit & adequacy awareness ----
  const judgeSys = 'You are BRUCE, a decisive creative director. Be crisp and commercial.'
  const rubric = [
    'Score each candidate 0–10 on:',
    '1) Prize–Brand Fit / Meaning (specificity, symbolism, provenance, access, ritual).',
    '2) Brand-first originality (no mechanic-first thinking).',
    '3) Retailer reality (five-second staff script; zero store burden).',
    '4) Behavioural impact (attainability, frequency).',
    '5) Variety discipline across the set (diverse levers; ≤1 cashback as per POLICY GATES).',
    `6) Intensity fidelity (${intensity}).`,
    'Adequacy awareness:',
    '- If OFFERIQ mode is PRIZE and odds feel thin, reward breadth/cadence and penalise thin hero-only shapes.',
    '- If Assured value (cashback/GWP) is briefed, reward leading with certainty; keep any major-prize overlay tasteful.',
    'Penalties:',
    '-5 if ANY overlap with BANNED motifs (prize/mechanic exemplars, proper nouns, hooks).',
    '-3 if any platform reads like a list of tools instead of an idea.',
    '-3 if triggers exceed TRIGGERS_ALLOWED or cashback count exceeds CASHBACK_MAX.',
    'Return JSON: {"winnerId":"...","rationale":"..."}',
  ].join('\n')

  const table = candidates.map(c => [
    `ID ${c.id}`,
    '---',
    `_Novelty: tainted=${c.novelty.tainted} • phrMatches=` + (c.novelty.phraseHits.join(', ') || 'none'),
    c.content,
  ].join('\n')).join('\n\n')

  const judgeUser = [
    `Campaign: ${ctx.clientName ?? ''} — ${ctx.title || ''}`,
    '',
    'BANNED (for judge reference):',
    banned.slice(0, 20).map(x => `- ${x}`).join('\n') || '- (none)',
    '',
    'RESEARCH SNAPSHOT:',
    JSON.stringify(researchSnapshot),
    '',
    'OFFERIQ SNAPSHOT:',
    JSON.stringify(oiSnap),
    '',
    rubric,
    '',
    'CANDIDATES:',
    table
  ].join('\n')

  const judgeRaw = await chat({
    model: resolveModel(process.env.MODEL_EVAL, process.env.MODEL_DEFAULT, model),
    system: judgeSys,
    messages: [{ role: 'user', content: judgeUser }],
    temperature: 0.2,
    json: true,
    max_output_tokens: 800,
    meta: { scope: 'create.judge', campaignId: ctx.id },
  })

  let winnerId = candidates[0].id
  let rationale = 'Selected strongest brand-first set.'
  try {
    const j = JSON.parse(judgeRaw)
    if (j?.winnerId) winnerId = j.winnerId
    if (j?.rationale) rationale = j.rationale
  } catch {}

  // Prefer a clean candidate if the pick was tainted
  const picked = candidates.find(c => c.id === winnerId) || candidates[0]
  if (picked.novelty.tainted) {
    const clean = candidates.find(c => !c.novelty.tainted)
    if (clean) winnerId = clean.id
  }

  const best = candidates.find(c => c.id === winnerId) || candidates[0]

  // ---- Ferrier polish → then prettify for screen
  const composed = await composeFerrierRoutes(ctx, best.content)
  const pretty = prettifyCreateOutput(composed)

  const debug = [
    `_Debug: intensity=${intensity}`,
    `gates: TRIGGERS_ALLOWED=${gates.TRIGGERS_ALLOWED} • CASHBACK_MAX=${gates.CASHBACK_MAX}`,
    `novelty: tainted=${best.novelty.tainted}`,
    `research.benchmarks: ${JSON.stringify(researchSnapshot || {})}`,
    `offerIQ: ${JSON.stringify(oiSnap || {})}`,
  ].join(' | ')

  // ---- UI controls hint (Conservative / Disruptive / Outrageous) ----
  const controlsHint =
    `<!-- UI:controls={"kind":"intensity","current":"${intensity}","options":["CONSERVATIVE","DISRUPTIVE","OUTRAGEOUS"],"mode":"${isGreenfield ? 'GREENFIELD' : 'BUILD'}","count":${count}} -->`

  return `${controlsHint}
${pretty}

---

${debug}

---

_Judge note: ${rationale}_`
}

/* ===================== helpers ===================== */

function coerceStrList(x: any): string[] {
  if (!x) return []
  if (Array.isArray(x)) return x.map(v => String(v)).filter(Boolean)
  if (typeof x === 'string') return String(x).split(/[•\n,;]+/).map(s => s.trim()).filter(Boolean)
  return []
}

function buildBriefAnchors(ctx: CampaignContext): string[] {
  const spec = ctx.briefSpec || {}
  const anchors: string[] = []

  const objective = String(spec.primaryObjective || '').trim()
  if (objective) {
    anchors.push(`Primary objective: ${objective}. Every platform must ladder to this exact outcome.`)
  }

  const mechanic = String(spec.mechanicOneLiner || spec.entryMechanic || '').trim()
  if (mechanic) {
    anchors.push(`Baseline mechanic: ${mechanic}. Keep this entry structure; only reduce friction or clarify copy.`)
  }

  const proofType = String(spec.proofType || '').trim()
  if (proofType && proofType.toUpperCase() !== 'UNKNOWN') {
    anchors.push(`Proof/entry requirement: ${proofType}. Do not add extra hoops beyond this.`)
  }

  const rewardPosture = String(spec.rewardPosture || '').trim().toUpperCase()
  const gwp = (spec as any).gwp || null
  const assuredItems = Array.isArray(spec.assuredItems) ? spec.assuredItems.filter(Boolean) : []
  const assuredValueParts: string[] = []
  if (gwp?.item) assuredValueParts.push(String(gwp.item))
  if (assuredItems.length) assuredValueParts.push(assuredItems.join(', '))
  if (rewardPosture === 'ASSURED' && !assuredValueParts.length && !gwp) {
    assuredValueParts.push('Guaranteed take-home reward (ASSURED posture).')
  }
  if (assuredValueParts.length) {
    const trigger = gwp?.triggerQty ? ` triggered by ${gwp.triggerQty} purchase${gwp.triggerQty === 1 ? '' : 's'}` : ''
    anchors.push(
      `Assured reward: ${assuredValueParts.join(' + ')}${trigger}. Keep the same guaranteed value; you may only layer upgrades on top.`
    )
  }

  const cashback = (spec as any).cashback || null
  if (cashback) {
    const amtLabel = formatCashback(cashback)
    anchors.push(`Cashback promise: ${amtLabel}. Maintain certainty and the same (or richer) math.`)
  }

  return anchors
}

function formatCashback(cb: any): string {
  if (!cb) return 'cashback'
  if (typeof cb.amount === 'number') {
    if (cb.amount > 0 && cb.amount <= 1) {
      return `${Math.round(cb.amount * 100)}% ${cb.currency || ''}`.trim()
    }
    return `${cb.currency || ''}${cb.amount}`.trim()
  }
  if (cb.amountLabel) return String(cb.amountLabel)
  return 'cashback'
}

/** Collect phrases/terms we want to forbid reusing. */
function collectBannedMotifs(ctx: CampaignContext): string[] {
  const spec = ctx.briefSpec || {}
  const out = new Set<string>()

  // Allow teams to explicitly mark banned motifs in the brief.
  addMany(out, (spec as any).bannedMotifs)

  // Only treat "example" style fields as off-limits; core brief inputs should remain usable.
  addMaybe(out, (spec as any).examplePrize)
  addMany(out, (spec as any).examplePrizes)
  addMaybe(out, (spec as any).exampleMechanic)
  addMany(out, (spec as any).examples)
  addMany(out, (spec as any).exemplarHooks)
  addMaybe(out, (spec as any).taglineExample)

  // Title can leak a prior campaign name.
  addMaybe(out, ctx.title)

  // Known leak motifs are safe to ban unless the brief explicitly uses them.
  const specText = JSON.stringify(spec ?? {}).toLowerCase()
  const leakMotifs = ['racehorse', 'share in a racehorse', 'the ghan', 'ghan', 'derby', 'stable', 'stud', 'sir guinness']
  for (const motif of leakMotifs) {
    const needle = motif.toLowerCase()
    if (!needle || specText.includes(needle)) continue
    addMaybe(out, motif)
  }

  const cleaned = Array.from(out)
    .map((s) => String(s || '').trim())
    .filter((s) => s && s.length >= 3)
    .slice(0, 50)

  return dedupeLower(cleaned)
}

function addMaybe(set: Set<string>, v: any) {
  if (!v) return
  const s = String(v).trim()
  if (s) set.add(s)
}
function addMany(set: Set<string>, arr: any) {
  if (!arr) return
  const xs = Array.isArray(arr) ? arr : [arr]
  for (const v of xs) addMaybe(set, v)
}
function dedupeLower(xs: string[]): string[] {
  const seen = new Set<string>(), out: string[] = []
  for (const s of xs) {
    const k = s.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(s)
  }
  return out
}

type NoveltyScore = { tainted: boolean; phraseHits: string[] }

/** Simple novelty screen: substring hits on lower-cased content against a curated banned list. */
function scoreNovelty(content: string, banned: string[]): NoveltyScore {
  const lc = String(content || '').toLowerCase()
  const hits: string[] = []
  for (const p of banned) {
    const q = p.toLowerCase().trim()
    if (!q || q.length < 3) continue
    if (lc.includes(q)) hits.push(p)
    if (hits.length >= 10) break
  }
  return { tainted: hits.length > 0, phraseHits: hits }
}

/** Final screen-clean pass: remove emphasis stars and tidy bullets/spacing. */
function prettifyCreateOutput(src: string): string {
  if (!src) return ''
  let s = String(src)

  // Remove bold/italics markers
  s = s.replace(/^\s*\*\*([^*]+?)\*\*:/gm, '$1:')     // **Label:** → Label:
  s = s.replace(/\*\*(.+?)\*\*/g, '$1')               // any remaining **text**
  s = s.replace(/__([^_]+)__/g, '$1')                 // __text__
  s = s.replace(/\*([^*\n]+)\*/g, '$1')               // *text*

  // Replace bullet markers at line start with •
  s = s.replace(/^\s*-\s+/gm, '• ')
  s = s.replace(/^\s*\*\s+/gm, '• ')

  // Remove stray asterism lines like ***, ****, etc.
  s = s.replace(/^\s*\*{3,}\s*$/gm, '—')

  // Collapse extra blank lines
  s = s.replace(/\n{3,}/g, '\n\n')

  // Ensure a blank line after headings like "### ..."
  s = s.replace(/^(### [^\n]+)\n(?!\n)/gm, '$1\n')

  // Trim whitespace
  return s.trim()
}
const LAW_CUES_CREATE = [
  'L0.1',
  'L0.3',
  'L1.1',
  'L2.1',
  'L2.2',
  'L2.3',
  'L3.2',
  'L3.3',
  'L3.4',
  'L3.6',
  'L4.1',
  'L4.2',
  'L4.4',
  'L5.1',
  'L5.2',
  'L5.3',
  'L5.4',
  'L5.5',
  'L5.6',
  'L5.7',
  'L5.8',
  'L5.9',
  'L5.10',
  'L6.1',
  'L6.2',
  'L7.1',
  'L7.2',
  'L8.1',
  'L8.2',
  'L9.1',
  'L9.2',
  'L9.3',
  'L9.4',
  'L9.5',
  'L10.1',
  'L10.2',
  'L12.2',
  'L12.3',
] as const

const MARK_LAW_PROMPT_CREATE = buildLawPrompt('create', LAW_CUES_CREATE)
