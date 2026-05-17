// apps/backend/src/shelf/orchestrator.ts
// Shelf-powered orchestrator — two modes:
//   1. generateRoutes — "I need ideas" -> 6-8 campaign routes, scored by Provocateur + Pragmatist
//   2. evaluateIdea  — "I have an idea" -> evaluation verdict with Kill Sheet + budget scenarios

import { chat, chatFull } from '../lib/openai.js'
import { resolveModel } from '../lib/models.js'
import { SHELF_CONSTITUTION, PROVOCATEUR_SYSTEM, PRAGMATIST_SYSTEM, CREATIVE_DIRECTOR_SYSTEM } from './constitution.js'
import type { CampaignRoute, EvaluationVerdict, BudgetScenario, RetailerPitch, HeadlineAngle, CreativeDirectorBlock } from './trevor-schema.js'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface GenerateRoutesInput {
  brand: string; category: string; market: string; retailers: string[]
  oneJob: string; budget: number | string; duration: string
  constraints?: string; researchDossier?: string
}

export interface EvaluateIdeaInput {
  brand: string; category: string; market: string
  retailers: string[]
  // Free-text supplemental context. Optional — structured fields are primary.
  idea?: string
  budget?: number | string
  researchDossier?: string

  // Structured campaign description. All optional individually but the route
  // handler enforces a sufficiency rule before reaching this function.
  mechanic?: string
  oneJob?: string
  startDate?: string
  endDate?: string
  prizeCount?: number
  majorPrizeValue?: number
  totalPrizePool?: number
  rewardDescription?: string
  entryRequirement?: string
  headline?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getModel = () => resolveModel(process.env.MODEL_SHELF, process.env.MODEL_DEFAULT)

function safeParseJSON<T = unknown>(raw: string, context: string): T {
  let cleaned = raw.trim()
  if (cleaned.startsWith('```'))
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
  try { return JSON.parse(cleaned) }
  catch {
    console.error(`[shelf.${context}] JSON parse failure. Raw:\n${raw.slice(0, 2000)}`)
    throw new Error(`[shelf.${context}] Failed to parse JSON. First 200 chars: ${raw.slice(0, 200)}`)
  }
}

function clamp(n: number, lo = 1, hi = 10) { return Math.min(hi, Math.max(lo, n)) }

function escapeXml(str: string): string {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function buildBriefXML(input: GenerateRoutesInput | EvaluateIdeaInput): string {
  const p: string[] = ['<brief>']
  p.push(`  <brand>${escapeXml(input.brand)}</brand>`)
  p.push(`  <category>${escapeXml(input.category)}</category>`)
  p.push(`  <market>${escapeXml(input.market)}</market>`)
  p.push(`  <retailers>${input.retailers.map(escapeXml).join(', ')}</retailers>`)

  // oneJob — present on GenerateRoutesInput always, on EvaluateIdeaInput when supplied
  const oneJob = (input as any).oneJob
  if (oneJob) p.push(`  <one_job>${escapeXml(String(oneJob))}</one_job>`)

  if (input.budget) p.push(`  <budget>${escapeXml(String(input.budget))}</budget>`)

  // GenerateRoutesInput-only fields
  if ('duration' in input) p.push(`  <duration>${escapeXml(String((input as GenerateRoutesInput).duration))}</duration>`)
  if ('constraints' in input && (input as GenerateRoutesInput).constraints)
    p.push(`  <constraints>${escapeXml((input as GenerateRoutesInput).constraints!)}</constraints>`)

  // EvaluateIdeaInput structured campaign fields. Each is rendered only when present
  // so the agent sees a clean brief and can identify gaps.
  const e = input as EvaluateIdeaInput
  if (e.mechanic) p.push(`  <mechanic>${escapeXml(e.mechanic)}</mechanic>`)
  if (e.headline) p.push(`  <headline>${escapeXml(e.headline)}</headline>`)
  if (e.rewardDescription) p.push(`  <reward_description>${escapeXml(e.rewardDescription)}</reward_description>`)
  if (e.entryRequirement) p.push(`  <entry_requirement>${escapeXml(e.entryRequirement)}</entry_requirement>`)
  if (e.startDate || e.endDate) {
    p.push(`  <campaign_window start="${escapeXml(e.startDate ?? '')}" end="${escapeXml(e.endDate ?? '')}" />`)
  }
  if (e.prizeCount != null || e.majorPrizeValue != null || e.totalPrizePool != null) {
    const attrs: string[] = []
    if (e.prizeCount != null) attrs.push(`count="${e.prizeCount}"`)
    if (e.majorPrizeValue != null) attrs.push(`major_value="${e.majorPrizeValue}"`)
    if (e.totalPrizePool != null) attrs.push(`total_pool="${e.totalPrizePool}"`)
    p.push(`  <prizes ${attrs.join(' ')} />`)
  }

  p.push('</brief>')
  if (input.researchDossier) {
    p.push('', '<research_dossier>', input.researchDossier, '</research_dossier>')
  }
  return p.join('\n')
}

// ---------------------------------------------------------------------------
// Provocateur — scores surprise, cultural relevance, talkability
// ---------------------------------------------------------------------------

async function scoreProvocateur(
  content: string, briefCtx: string, scope: string,
): Promise<{ provocateurScore: number; provocateurNote: string }> {
  const raw = await chat({
    model: getModel(),
    system: PROVOCATEUR_SYSTEM,
    messages: [{ role: 'user', content: [
      `Score this campaign idea/route for surprise, cultural relevance, and talkability.`,
      '', briefCtx, '', content, '',
      `Ground your assessment in the research dossier above. Reference what competitors are doing. Reference any cultural moments that could be leveraged.`,
      `Respond with JSON: { "provocateurScore": <1-10>, "provocateurNote": "<4-6 sentence assessment that a creative director would find genuinely useful. Paint the scene. Be specific about what makes this idea invisible or remarkable.>" }`,
    ].join('\n') }],
    json: true, max_output_tokens: 800,
    meta: { scope: `shelf.${scope}` },
  })
  const p = safeParseJSON<{ provocateurScore: number; provocateurNote: string }>(raw, scope)
  return { provocateurScore: clamp(p.provocateurScore ?? 5), provocateurNote: p.provocateurNote ?? '' }
}

// ---------------------------------------------------------------------------
// Creative Director — produces 5 distinctly-positioned headlines + a signature moment
// ---------------------------------------------------------------------------

async function scoreCreativeDirector(
  content: string, briefCtx: string, scope: string,
): Promise<CreativeDirectorBlock> {
  const raw = await chat({
    model: getModel(),
    system: CREATIVE_DIRECTOR_SYSTEM,
    messages: [{ role: 'user', content: [
      `Produce five distinctly-positioned headlines (one per lens — TRANSACTIONAL, CULTURAL_MOMENT, BRAND_TRUTH, EMOTIONAL_JOB, WILDCARD), plus one signatureMoment, for this campaign.`,
      '', briefCtx, '', content, '',
      `Use the research dossier's culturalMoments where present. Reference observed competitor activity to differentiate. Each headline must follow the message hierarchy: trigger word, prize, quantity, odds, cost to enter.`,
      `Respond with JSON: { "score": <1-10>, "note": "<3-4 sentences — name the strongest, name the one the brand will reject, explain why>", "headlineAngles": [{ "lens": "TRANSACTIONAL"|"CULTURAL_MOMENT"|"BRAND_TRUTH"|"EMOTIONAL_JOB"|"WILDCARD", "headline": "<6-14 words>", "subhead": "<optional 10-15 words>", "rationale": "<1-2 sentences — why this lens, why this line, what behavioural insight>", "pilot": "GAMBLER"|"ACCOUNTANT"|"HYBRID" }, ...exactly 5 entries, one per lens], "signatureMoment": "<the scene people will talk about — concrete, shareable, proprietary>" }`,
    ].join('\n') }],
    json: true, max_output_tokens: 1800,
    meta: { scope: `shelf.${scope}` },
  })
  const p = safeParseJSON<CreativeDirectorBlock>(raw, scope)
  return {
    score: clamp(p.score ?? 5),
    note: p.note ?? '',
    headlineAngles: Array.isArray(p.headlineAngles) ? p.headlineAngles : [],
    signatureMoment: p.signatureMoment ?? '',
  }
}

// ---------------------------------------------------------------------------
// Pragmatist — scores feasibility, budget, retailer readiness
// ---------------------------------------------------------------------------

async function scorePragmatist(
  content: string, briefCtx: string, scope: string,
): Promise<{ pragmatistScore: number; pragmatistNote: string; budgetScenarios?: BudgetScenario[]; retailerPitch?: RetailerPitch }> {
  const raw = await chat({
    model: getModel(),
    system: PRAGMATIST_SYSTEM,
    messages: [{ role: 'user', content: [
      `Evaluate this campaign idea/route for commercial feasibility.`,
      '', briefCtx, '', content, '',
      `Ground your budget analysis in category-specific redemption norms. Cite the research dossier where relevant.`,
      `For the S.O.S. pitch, write it as if rehearsing for a category review meeting at Coles or Woolworths. The "sales" line must include actual maths.`,
      `Respond with JSON: { "pragmatistScore": <1-10>, "pragmatistNote": "<4-6 sentences grounded in operational reality — cite specific cost drivers, category redemption rates, and ops implications>",`,
      `"budgetScenarios": [{ "redemptionRate": 0.10, "totalCost": <n>, "prizePoolCost": <n>, "verdict": "SAFE"|"WATCH"|"BLOWOUT", "note": "<what drives this scenario — cite category norms>" }, ...for 0.30, 0.60],`,
      `"retailerPitch": { "simple": "...", "operational": "...", "sales": "<include maths: baseline × expected lift × unit margin>" } }`,
    ].join('\n') }],
    json: true, max_output_tokens: 1500,
    meta: { scope: `shelf.${scope}` },
  })
  const p = safeParseJSON<{ pragmatistScore: number; pragmatistNote: string; budgetScenarios?: BudgetScenario[]; retailerPitch?: RetailerPitch }>(raw, scope)
  return {
    pragmatistScore: clamp(p.pragmatistScore ?? 5), pragmatistNote: p.pragmatistNote ?? '',
    budgetScenarios: p.budgetScenarios, retailerPitch: p.retailerPitch,
  }
}

// ---------------------------------------------------------------------------
// Route-specific wrappers (format route info for the scorers)
// ---------------------------------------------------------------------------

function routeToContent(r: CampaignRoute): string {
  return [
    '<route>',
    `Name: ${r.name} | Job: ${r.oneJob} | Mechanic: ${r.mechanic} | Pilot: ${r.pilot}`,
    `Concept: ${r.concept}`,
    `Why It Works: ${r.whyItWorks}`,
    `What Breaks: ${r.whatBreaks}`,
    `Headline: ${r.messageHierarchy.headline}`,
    `Prize Pool: $${r.totalPrizePoolValue} | Entry: ${r.frictionProfile.entryMethod} (${r.frictionProfile.estimatedSeconds}s) | Friction: ${r.frictionProfile.frictionLevel}`,
    '</route>',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Mode 1: generateRoutes
// ---------------------------------------------------------------------------

export async function generateRoutes(input: GenerateRoutesInput): Promise<CampaignRoute[]> {
  const model = getModel()
  const briefXML = buildBriefXML(input)

  // Step 1 — Generate 6-8 routes with extended thinking
  const userMsg = [
    'Generate 6-8 genuinely different promotional campaign routes for this brief.',
    '', briefXML, '',
    'For each route produce a JSON object with: id, name, oneJob, mechanic, trevorCampaignType, concept, whyItWorks, whatBreaks, threeSecondScore {reward,rewardNote,belief,beliefNote,friction,frictionNote,conversion}, pilot, messageHierarchy {headline,subline?,packCopy?,shelfBreakScore}, frictionProfile {entryMethod,estimatedSeconds,fields[{name,required,justification}],receiptRequired,frictionLevel,frictionRationale}, prizes[{name,value,quantity,type,tier}], totalPrizePoolValue, suggestedDurationDays, trevorEntryConfig {fields,fieldsRequired,receiptRequired,codeRequired}.',
    '',
    'Respond with a JSON array. No markdown fences, no prose.',
    'Make routes genuinely diverse — different mechanics, pilots, friction trade-offs.',
    'At least one Wildcard mechanic (Conditional, Partnership, UGC, Cause-Related).',
    'Apply The Shelf framework rigorously.',
  ].join('\n')

  console.info('[shelf.generate] Starting route generation with extended thinking')

  const result = await chatFull({
    model, system: SHELF_CONSTITUTION,
    messages: [{ role: 'user', content: userMsg }],
    json: true, thinking: true, thinkingBudget: 16000, max_output_tokens: 16000,
    meta: { scope: 'shelf.generate' },
  })

  const routes = safeParseJSON<CampaignRoute[]>(result.text, 'generate')
  if (!Array.isArray(routes) || !routes.length)
    throw new Error('[shelf.generate] Expected array of routes, got: ' + typeof routes)

  console.info(`[shelf.generate] Generated ${routes.length} routes. Scoring...`)

  // Steps 2+3 — Score all routes in parallel (Provocateur + Pragmatist per route)
  const scored = await Promise.all(
    routes.map(async (route) => {
      const content = routeToContent(route)
      const [prov, prag] = await Promise.all([
        scoreProvocateur(content, briefXML, 'provocateur'),
        scorePragmatist(content, briefXML, 'pragmatist'),
      ])
      return {
        ...route,
        ...prov, ...prag,
        budgetScenarios: prag.budgetScenarios ?? route.budgetScenarios,
        retailerPitch: prag.retailerPitch ?? route.retailerPitch,
      }
    }),
  )

  // Step 4 — Sort by average score descending
  scored.sort((a, b) => {
    const avg = (r: typeof a) => ((r.provocateurScore ?? 5) + (r.pragmatistScore ?? 5)) / 2
    return avg(b) - avg(a)
  })

  const top = scored[0]
  console.info(`[shelf.generate] Done. Top: "${top?.name}" (avg ${(((top?.provocateurScore ?? 5) + (top?.pragmatistScore ?? 5)) / 2).toFixed(1)})`)
  return scored
}

// ---------------------------------------------------------------------------
// Mode 2: evaluateIdea
// ---------------------------------------------------------------------------

export async function evaluateIdea(input: EvaluateIdeaInput): Promise<EvaluationVerdict> {
  const model = getModel()
  const briefXML = buildBriefXML(input)

  const evalSystem = SHELF_CONSTITUTION + `

<evaluation_mode>
You are a senior promotional marketing consultant with 20 years of Australian retail experience delivering a written evaluation. This is not a checklist — it is a strategic consultation.

HOW TO READ THE INPUT:
- The <brief> block contains STRUCTURED FIELDS — these are your primary source of truth about what the campaign actually is. Read every field present (mechanic, headline, reward_description, entry_requirement, campaign_window, prizes attributes, budget). Cite them by name in your assessment.
- The <additional_context> block (if present) is OPTIONAL supplemental prose from the brief writer. Use it for colour, intent, or anything the structured fields can't express. Never let it contradict the structured fields — those win.
- If a structured field is missing, NAME the gap explicitly in your assessment rather than fabricating ("no end date specified — assume 4-week window for modelling, but this needs confirmation"). The reader should know what's evidence vs assumption.

YOUR VOICE:
- Write like Mark Alexander: direct, commercial, grounded in real shelf behaviour. No marketing buzzwords.
- Every claim must be grounded in evidence: the research dossier, The Shelf frameworks, or specific category precedent.
- When you identify a problem, illustrate it with a concrete example or analogy. "This is what happened when Red Lobster made Endless Shrimp permanent" is better than "This has uncapped liability."
- When you cite a Shelf framework, explain WHY it applies here, not just that it applies.

YOUR STANDARDS:
- The evaluation must be constructive. Tearing an idea apart without showing how to fix it is lazy. Every "what breaks" must have a specific, actionable "fix."
- Weave the research dossier into your analysis. If competitors are doing something similar, say so and explain why this idea needs to be different. If there's a cultural moment, explain how to leverage it.
- Budget scenarios should be strategic, not arithmetic. Don't just say "60% redemption = $X." Say what drives redemption in this category, what the likely rate is based on mechanic + friction, and what the real cost driver is (claims processing? fulfilment? customer service? fraud?).
- The Kill Sheet isn't binary pass/fail. Each check should explain the nuance — "friction is high, but justified because the prize value warrants it" or "friction is high AND unjustified because the reward doesn't compensate."
- The Retailer Readiness section should read like a pitch rehearsal. Would this get through a category review meeting at Coles or Woolworths? What would the buyer's first objection be?
- Message hierarchy isn't just about trigger words — it's about what the shopper SEES in 3 seconds at the shelf. Paint the scene.

THE TWO PILOTS:
- Always identify which pilot this idea targets (Gambler, Accountant, or Hybrid) and whether the mechanic actually delivers for that pilot.
- If it targets the Gambler but the odds feel impossible, say so.
- If it targets the Accountant but the friction makes the reward feel like admin, say so.

WHAT MAKES AN EVALUATION BRILLIANT:
- It notices things the brief writer missed ("you've designed a frequency mechanic but your entry limit of 1 per day caps the habit loop at exactly the wrong cadence")
- It connects the category research to the mechanic design ("in liquor, the Friday 5:30pm moment is when decisions are made — your 4-week campaign window means 4 decision points, not 28")
- It respects the ambition while improving the engineering ("the Trip to Dublin is the right Gambler hook — but 1 prize in a 4-week campaign at 2 retailers is a belief killer. The fix is 3 trips drawn weekly, which triples belief at the same total cost")
- It sounds like advice from a respected colleague, not a scoring rubric

VERDICT TAXONOMY — read this carefully:
- GO     — Ship it. Strong across all lenses, compliance clear, execution sound.
- REWORK — The concept has merit but specific execution choices are wrong. Issue alternative routes that fix the execution while preserving what works. USE REWORK GENEROUSLY — it's the most useful verdict because it forces creative reconstruction.
- KILL   — The CONCEPT itself is fundamentally broken. Not "the brief is incomplete" — that's a brief problem, not an idea problem. Not "the execution has compliance risks" — those usually fix-able with a different mechanic, which is REWORK. Reserve KILL for ideas that are bad at the strategic core (wrong job, no audience, off-brand to the point of damage, mechanic that can never work in this category, etc.)

If the Provocateur scored the concept ≥7 OR the Creative Director scored it ≥7, the concept HAS creative merit by definition. In that case the only honest verdicts are GO or REWORK — KILL is wrong. The system will downgrade KILL → REWORK automatically when these score signals contradict the verdict, but you should still pick REWORK upfront.

Examples:
- "Cashback structure has uncapped liability" → REWORK (cap the liability)
- "Mechanic requires staff training during peak season" → REWORK (use self-serve QR instead)
- "Racehorse equity creates AUSTRAC exposure" → REWORK (keep racehorse as mascot, drop the equity, use a regulated betting partner)
- "Brand wants premium positioning but mechanic positions them as discount" → KILL (the concept misreads the brand)
- "Targeting BUILDER job in a category nobody returns to" → KILL (the job is wrong for the category)
</evaluation_mode>`

  // Compose the body of the user message. Structured fields in <brief> are
  // the primary grounding; <idea> is optional supplemental prose. If the user
  // didn't write any prose, omit the tag entirely rather than send "<idea></idea>".
  const ideaBlock = input.idea?.trim()
    ? `<additional_context>\n${escapeXml(input.idea)}\n</additional_context>`
    : ''

  const userMsg = [
    'Evaluate this promotional campaign idea with the depth and insight of a senior consultant. Use the research dossier to ground every observation.',
    '', briefXML, '', ideaBlock, '',
    '',
    'Respond with a single JSON object. Follow these structural rules PRECISELY:',
    '',
    '<output_rules>',
    'RULE 1 — ONE JOB: Always define the job type inline. Not just "BUILDER" but "BUILDER — a frequency mechanic designed to create repeat purchase habits." If the job is unclear, explain the conflict.',
    '',
    'RULE 2 — THREE-SECOND SCORE: All scores are 1-10. Include an "interpretation" field that reads the three scores as a narrative: "A reward score of 6 means the prize is relevant but not compelling enough to change behaviour on its own. Combined with a belief score of 4, the shopper calculates low expected value."',
    '',
    'RULE 3 — KILL SHEET: Each check gets a nuanced note that explains the tension, not just pass/fail. "PASS — but only because..." or "FAIL — and this is the one that kills it because..."',
    '',
    'RULE 4 — BUDGET SCENARIOS: Exactly 3 rows: conservative (low redemption), expected (likely redemption based on category norms), and aggressive (high redemption). Each row MUST include: redemptionRate, estimatedVolume (how many claims), totalCost, costPerUnit, prizePoolCost, operationalCost (validation, fulfilment, customer service), verdict, and a note explaining what drives this scenario and citing category benchmarks.',
    '',
    'RULE 5 — RETAILER READINESS: The "wouldCategoryManagerSayYes" field MUST have a "rationale" explaining WHY — what specifically about this promotion makes it approvable or not. Risks must be specific objections a buyer would raise in a range review meeting.',
    '',
    'RULE 6 — WHAT TO CHANGE: Clean numbered list of prioritised actions. NO mixing of voices — this is YOUR voice as the senior consultant. The Provocateur and Pragmatist perspectives go in their own separate fields (see below).',
    '',
    'RULE 7 — ALTERNATIVE ROUTES (if verdict is REWORK): Each alternative must be a full strategic option, not a stub. Include: name, oneJob (with definition), mechanic, concept (3-4 sentences explaining the idea and WHY it works), prizeArchitecture, frictionDesign, headline, and whatThisFixesFromOriginal.',
    '</output_rules>',
    '',
    'JSON structure:',
    '{',
    '  "idea": "<restate concisely>",',
    '  "oneJob": "<JOB_TYPE — plain English definition of what this job means>",',
    '  "oneJobIssue": "<explain conflicts if any>",',
    '  "threeSecondScore": { "reward": <1-10>, "rewardNote": "...", "belief": <1-10>, "beliefNote": "...", "friction": <1-10>, "frictionNote": "...", "conversion": <1-10>, "interpretation": "<narrative reading of all three scores together — what does this combination mean for the shopper?>" },',
    '  "killSheet": { "reward": { "pass": bool, "note": "..." }, "urgency": {...}, "belief": {...}, "speed": {...}, "scan": {...}, "loadTime": {...}, "data": {...}, "ops": {...}, "passCount": <n>, "failCount": <n>, "verdict": "GO"|"REWORK"|"KILL" },',
    '  "frictionAudit": { "currentLevel": "...", "optimalLevel": "...", "fieldsToRemove": [...], "fieldsToAdd": [...], "rationale": "..." },',
    '  "budgetScenarios": [{ "label": "Conservative|Expected|Aggressive", "redemptionRate": <decimal>, "estimatedVolume": <claims>, "totalCost": <$>, "costPerUnit": <$>, "prizePoolCost": <$>, "operationalCost": <$>, "verdict": "SAFE|WATCH|BLOWOUT", "note": "<cite category norms, explain cost drivers>" }],',
    '  "messageHierarchy": { "current": { "headline": "...", "shelfBreakScore": <1-10> }, "improved": { "headline": "...", "subline": "...", "packCopy": "...", "staffLine": "...", "shelfBreakScore": <1-10> } },',
    '  "retailerReadiness": { "wouldCategoryManagerSayYes": bool, "approvalRationale": "<specific reasons why they would/wouldn\'t approve>", "risks": ["<specific buyer objections>"], "pitch": { "simple": "...", "operational": "...", "sales": "<include actual maths>" } },',
    '  "whatWorks": ["<specific, grounded insights>"],',
    '  "whatBreaks": [{ "issue": "...", "shelfReference": "...", "fix": "<specific actionable fix>" }],',
    '  "whatToChange": ["<clean prioritised actions in YOUR consultant voice — no Provocateur/Pragmatist mixing>"],',
    '  "verdict": "GO"|"REWORK"|"KILL",',
    '  "verdictRationale": "<2-3 sentences for a CMO>",',
    '  "alternativeRoutes": [{ "name": "...", "oneJob": "<JOB — definition>", "mechanic": "...", "concept": "<3-4 sentences explaining the idea, the behavioural logic, and why it fixes the original\'s problems>", "prizeArchitecture": "...", "frictionDesign": "...", "headline": "<8-12 words>", "whatThisFixesFromOriginal": "..." }]',
    '}',
    '',
    'alternativeRoutes: include 3 if verdict is REWORK, 0 if GO or KILL.',
    'No markdown fences. No prose outside the JSON.',
  ].join('\n')

  console.info('[shelf.evaluate] Starting idea evaluation with extended thinking')

  const result = await chatFull({
    model, system: evalSystem,
    messages: [{ role: 'user', content: userMsg }],
    json: true, thinking: true, thinkingBudget: 16000, max_output_tokens: 8000,
    meta: { scope: 'shelf.evaluate' },
  })

  const verdict = safeParseJSON<EvaluationVerdict>(result.text, 'evaluate')
  console.info(`[shelf.evaluate] Verdict: ${verdict.verdict}. Scoring...`)

  // Steps 2+3+4 — Provocateur, Pragmatist, Creative Director in parallel.
  // Synthesise a one-liner from structured fields when no free-text idea was supplied.
  const ideaContent = input.idea?.trim()
    ? `<additional_context>\n${input.idea}\n</additional_context>`
    : `<campaign_summary>${[input.mechanic, input.rewardDescription, input.headline].filter(Boolean).join(' — ')}</campaign_summary>`
  const [prov, prag, creative] = await Promise.all([
    scoreProvocateur(ideaContent, briefXML, 'provocateur-eval'),
    scorePragmatist(ideaContent, briefXML, 'pragmatist-eval'),
    scoreCreativeDirector(ideaContent, briefXML, 'creative-director-eval'),
  ])

  // Merge each agent as a separate top-level field (NOT mixed into whatToChange/whatBreaks)
  ;(verdict as any).provocateur = {
    score: prov.provocateurScore,
    note: prov.provocateurNote,
  }
  ;(verdict as any).pragmatist = {
    score: prag.pragmatistScore,
    note: prag.pragmatistNote,
    budgetScenarios: prag.budgetScenarios,
    retailerPitch: prag.retailerPitch,
  }
  ;(verdict as any).creativeDirector = creative
  // Only backfill budget scenarios if the main evaluation didn't produce them
  if (prag.budgetScenarios?.length && !verdict.budgetScenarios?.length)
    verdict.budgetScenarios = prag.budgetScenarios

  // Step 4 — Reclassify the verdict if the score signals contradict it.
  // KILL should mean "the concept is fundamentally flawed." If the Provocateur or
  // Creative Director scored ≥7, the concept clearly has merit — what's wrong is
  // execution. Downgrade to REWORK so the user gets alternative routes that route
  // around the Pragmatist's blockers instead of just walking away.
  const originalVerdict = verdict.verdict
  const reclassification = reclassifyVerdict({
    llmVerdict: originalVerdict,
    provocateurScore: prov.provocateurScore,
    creativeScore: creative.score,
    pragmatistScore: prag.pragmatistScore,
  })
  if (reclassification.changed) {
    verdict.verdict = reclassification.newVerdict
    ;(verdict as any).reclassification = {
      from: originalVerdict,
      to: reclassification.newVerdict,
      rationale: reclassification.rationale,
    }
    console.info(`[shelf.evaluate] Reclassified ${originalVerdict} → ${reclassification.newVerdict}: ${reclassification.rationale}`)
  }

  // Step 5 — Generate alternatives on REWORK *and* KILL. KILL alternatives are
  // framed differently: "preserve what the concept gets right, route around what
  // the Pragmatist says kills it." On REWORK they keep the original idea's bones.
  if (verdict.verdict === 'REWORK' || verdict.verdict === 'KILL') {
    console.info(`[shelf.evaluate] ${verdict.verdict} — generating 3 alternatives`)
    try {
      verdict.alternativeRoutes = await generateAlternatives(input, verdict, verdict.verdict, prag.pragmatistNote)
    } catch (err: any) {
      console.error('[shelf.evaluate] Alternatives failed:', err?.message)
    }
  }

  console.info(`[shelf.evaluate] Complete. Verdict: ${verdict.verdict}`)
  return verdict
}

/**
 * Reclassify the LLM's verdict when the score signals disagree with it.
 *
 * Rule: KILL means "the concept is fundamentally flawed." If the Provocateur
 * scored ≥7 OR the Creative Director scored ≥7, the concept has clear merit
 * and what's wrong is execution. Downgrade to REWORK and let the alternatives
 * generator do its job.
 *
 * We don't reclassify REWORK or GO upward — only KILL gets the downgrade
 * check, because the asymmetric cost is high: a wrongly-issued KILL gives the
 * user no creative path forward.
 */
function reclassifyVerdict(params: {
  llmVerdict: 'GO' | 'REWORK' | 'KILL'
  provocateurScore: number
  creativeScore: number
  pragmatistScore: number
}): { changed: false } | { changed: true; newVerdict: 'REWORK'; rationale: string } {
  if (params.llmVerdict !== 'KILL') return { changed: false }
  const conceptHasMerit = params.provocateurScore >= 7 || params.creativeScore >= 7
  if (!conceptHasMerit) return { changed: false }
  const reasons: string[] = []
  if (params.provocateurScore >= 7) reasons.push(`Provocateur ${params.provocateurScore}/10`)
  if (params.creativeScore >= 7) reasons.push(`Creative Director ${params.creativeScore}/10`)
  return {
    changed: true,
    newVerdict: 'REWORK',
    rationale: `Downgraded from KILL to REWORK — concept has demonstrated merit (${reasons.join(', ')}) but the Pragmatist (${params.pragmatistScore}/10) identified execution blockers. Alternative routes below route around those blockers while preserving what works.`,
  }
}

// ---------------------------------------------------------------------------
// Generate alternatives (REWORK verdicts only)
// ---------------------------------------------------------------------------

async function generateAlternatives(
  input: EvaluateIdeaInput,
  verdict: EvaluationVerdict,
  verdictType: 'REWORK' | 'KILL' = 'REWORK',
  pragmatistBlockers?: string,
): Promise<CampaignRoute[]> {
  const briefXML = buildBriefXML(input)
  const works = verdict.whatWorks?.join('\n- ') ?? 'Nothing identified'
  const breaks = verdict.whatBreaks?.map((b) => `${b.issue} (${b.shelfReference})`).join('\n- ') ?? ''
  const originalBlock = input.idea?.trim()
    ? `<original_idea>\n${input.idea}\n</original_idea>`
    : `<original_idea>See structured brief above — ${[input.mechanic, input.rewardDescription, input.headline].filter(Boolean).join(' — ') || 'no prose provided'}</original_idea>`

  // Verdict-specific framing. KILL alternatives must route AROUND the blockers,
  // not just iterate on the original mechanic.
  const framingLines = verdictType === 'KILL'
    ? [
        `The following idea received a KILL verdict — but the concept showed creative merit (Provocateur or Creative Director scored ≥7). The Pragmatist's blockers are what kill it:`,
        pragmatistBlockers ? `<pragmatist_blockers>\n${pragmatistBlockers}\n</pragmatist_blockers>` : '',
        '',
        'Generate exactly 3 alternative routes that PRESERVE WHAT WORKS but ROUTE AROUND the Pragmatist\'s blockers. The goal is to keep the cultural/creative concept intact — the brand world, the story, the emotional payoff — while using a different mechanic, fulfilment model, or commercial structure that the Pragmatist would approve.',
      ]
    : [
        `The following idea received a REWORK verdict:`,
        '',
        'Generate exactly 3 alternative routes that KEEP what works but FIX what breaks.',
      ]

  const raw = await chat({
    model: getModel(), system: SHELF_CONSTITUTION,
    messages: [{ role: 'user', content: [
      ...framingLines,
      originalBlock,
      `<what_works>\n- ${works}\n</what_works>`,
      `<what_breaks>\n- ${breaks}\n</what_breaks>`,
      '', briefXML, '',
      'CRITICAL — each route must occupy a distinct ambition zone:',
      '  Route 1 (ambitionZone: "SAFE")        — a proven category mechanic with disciplined execution. Low risk, predictable outcomes. A category manager will say yes in 10 seconds.',
      '  Route 2 (ambitionZone: "BOLD")        — twists a convention. Adds a cultural moment, a partnership, a content layer, or a new dimension the category isn\'t doing. A category manager will say yes after asking a question.',
      '  Route 3 (ambitionZone: "RIDICULOUS")  — would make a Coles category manager raise an eyebrow before they say yes. Genuinely surprising. May involve a partnership, a content franchise, an unusual fulfilment mechanism, or a flipped category convention. The Pragmatist might score this lower but the Provocateur will love it. The brand team can then decide if they\'re brave enough.',
      '',
      'Each route uses a different mechanic AND occupies its assigned ambition zone. Do not produce three SAFE routes dressed up.',
      'Every route MUST include a "name" field (a short memorable label) and an "ambitionZone" field with the assigned value.',
      'Respond with a JSON array. No markdown, no prose.',
    ].filter(Boolean).join('\n') }],
    json: true, max_output_tokens: 10000,
    meta: { scope: `shelf.alternatives-${verdictType.toLowerCase()}` },
  })

  const alts = safeParseJSON<CampaignRoute[]>(raw, 'alternatives')
  if (!Array.isArray(alts)) throw new Error('[shelf.alternatives] Expected array, got: ' + typeof alts)

  // Layer in Creative Director output per alternative — headline angles + signature moment.
  // Use a defensive content builder because alt routes can have leaner shapes than full
  // CampaignRoute (no messageHierarchy / frictionProfile nesting).
  const altsWithCreative = await Promise.all(
    alts.map(async (route) => {
      try {
        const r = route as any
        const altContent = [
          '<route>',
          `Name: ${r.name ?? r.route_name ?? 'unnamed'} | Job: ${r.oneJob ?? r.one_job ?? ''} | Mechanic: ${r.mechanic ?? ''}`,
          `Ambition zone: ${r.ambitionZone ?? r.ambition_zone ?? 'unknown'}`,
          `Concept: ${r.concept ?? r.how_it_works ?? ''}`,
          `Working headline (to be improved): ${r.headline ?? r.messageHierarchy?.headline ?? ''}`,
          `Prize architecture: ${r.prizeArchitecture ?? r.reward ?? ''}`,
          `Friction design: ${r.frictionDesign ?? r.friction ?? ''}`,
          `What this fixes from original: ${r.whatThisFixesFromOriginal ?? r.what_this_fixes ?? ''}`,
          '</route>',
        ].join('\n')
        const zoneTag = r.ambitionZone ?? r.ambition_zone ?? 'unknown'
        const creative = await scoreCreativeDirector(altContent, briefXML, `alt-creative-${zoneTag}`)
        return {
          ...route,
          headlineAngles: creative.headlineAngles,
          signatureMoment: creative.signatureMoment,
        }
      } catch (err: any) {
        console.error(`[shelf.alternatives] Creative Director failed for route "${(route as any).name}":`, err?.message)
        return route
      }
    }),
  )

  return altsWithCreative
}
