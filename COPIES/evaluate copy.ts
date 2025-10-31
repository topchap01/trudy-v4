// apps/backend/src/lib/orchestrator/evaluate.ts
import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { EVAL_DIAGNOSIS_JSON_SPEC } from '../bible.js'
import { analyzeRoute } from '../heuristics.js'
import { buildEvaluationGuide } from '../promotrack.js' // PromoTrack guide (private prompt bias)
import { composeSuperbEvaluation } from '../composers/super-eval.js' // ✅ new composer (no extra deps)

type Traffic = 'GREEN'|'AMBER'|'RED'|'NA'

type BoardCell = { status: Traffic, why: string, fix?: string }
type Scoreboard = {
  objectiveFit: BoardCell
  hookStrength: BoardCell
  mechanicFit: BoardCell
  frequencyPotential: BoardCell
  friction: BoardCell
  rewardShape: BoardCell
  retailerReadiness: BoardCell
  complianceRisk: BoardCell
  fulfilment: BoardCell
  kpiRealism: BoardCell
  decision?: 'GO'|'GO WITH CONDITIONS'|'NO-GO'
  conditions?: string
}

function trimWords(s: string | null | undefined, max = 16): string {
  if (!s) return ''
  const parts = s.replace(/\s+/g, ' ').trim().split(' ')
  return parts.length <= max ? s.trim() : parts.slice(0, max).join(' ')
}

function includesAny(hay: string | undefined, needles: string[]): boolean {
  if (!hay) return false
  const h = hay.toLowerCase()
  return needles.some(n => h.includes(n.toLowerCase()))
}

// only used to check if the actual mechanic text contains a banned term
function includesAnyWord(hay?: string, words: string[] = []) {
  if (!hay) return false
  const h = hay.toLowerCase()
  return words.some(w => h.includes(String(w).toLowerCase()))
}

function decideFromVerdict(verdict?: string): 'GO'|'GO WITH CONDITIONS'|'NO-GO'|undefined {
  if (!verdict) return undefined
  const v = verdict.toUpperCase().replace(/\s+/g, '_')
  if (v.includes('NO') && v.includes('GO')) return 'NO-GO'
  if (v.includes('GO_WITH_CONDITIONS') || v.includes('CONDITION')) return 'GO WITH CONDITIONS'
  if (v === 'GO') return 'GO'
  // lenient map
  if (v.includes('REVISE') || v.includes('AMEND') || v.includes('TWEAK')) return 'GO WITH CONDITIONS'
  return undefined
}

function buildScoreboard(ctx: CampaignContext, diagnosis: any): Scoreboard {
  // Pull common fields defensively
  const hook = diagnosis?.creative_hook_current ?? ctx.briefSpec?.hook ?? ''
  const betterHook = diagnosis?.creative_hook_better ?? null
  const mech = diagnosis?.mechanic ?? ctx.briefSpec?.mechanicOneLiner ?? ''
  const typeOfPromo = ctx.briefSpec?.typeOfPromotion ?? ''
  const retailers: string[] = (diagnosis?.retailers ?? ctx.briefSpec?.retailers ?? []) as string[]
  const market = (ctx.market ?? 'AU').toUpperCase()
  const category = (ctx.category ?? '').toLowerCase()
  const frictionBudget = (ctx.briefSpec?.frictionBudget ?? diagnosis?.friction ?? '').toString().toLowerCase()
  const prizes = diagnosis?.prizes ?? {}
  const heroPrize = prizes?.hero ?? ctx.briefSpec?.heroPrize ?? ''
  const heroCount = Number(prizes?.hero_count ?? ctx.briefSpec?.heroPrizeCount ?? 0) || 0
  const runnerUps: string[] = (prizes?.runner_ups ?? ctx.briefSpec?.runnerUps ?? []) as string[]
  const banned: string[] = (diagnosis?.banned_mechanics ?? ctx.briefSpec?.bannedMechanics ?? []) as string[]
  const verdict = decideFromVerdict(diagnosis?.judgement?.verdict)
  const because = diagnosis?.judgement?.because ?? ''

  // === objectiveFit ===
  let objectiveFit: BoardCell
  if (verdict === 'GO') objectiveFit = { status: 'GREEN', why: 'Plan matches stated objective' }
  else if (verdict === 'GO WITH CONDITIONS') objectiveFit = { status: 'AMBER', why: 'Works with fixes applied' }
  else if (verdict === 'NO-GO') objectiveFit = { status: 'RED', why: 'Does not meet objective' }
  else objectiveFit = { status: 'AMBER', why: 'Partially aligned; needs specifics' }

  // === hookStrength ===
  let hookStrength: BoardCell
  if (!hook || hook.trim().length < 3) hookStrength = { status: 'RED', why: 'No clear consumer-facing line' }
  else if (betterHook) hookStrength = { status: 'AMBER', why: 'Current hook soft; stronger variants exist' }
  else hookStrength = { status: 'GREEN', why: 'Clear, consumer-facing hook' }

  // === mechanicFit === (SOFT on banned: only RED if the text actually contains a banned motif)
  let mechanicFit: BoardCell
  if (!mech || mech.trim().length < 3) {
    mechanicFit = { status: 'AMBER', why: 'Mechanic underspecified' }
  } else if (Array.isArray(banned) && banned.length && includesAnyWord(mech, banned)) {
    mechanicFit = { status: 'RED', why: 'Conflicts with banned mechanics' }
  } else {
    mechanicFit = { status: 'GREEN', why: 'Simple, staff-explainable mechanic' }
  }

  // === frequencyPotential ===
  const typeLower = typeOfPromo.toLowerCase()
  let frequencyPotential: BoardCell
  if (includesAny(typeLower, ['stamp', 'collect', 'tier', 'loyalty', 'streak'])) {
    frequencyPotential = { status: 'GREEN', why: 'Built-in repeat behaviour' }
  } else if (includesAny(typeLower, ['instant win', 'purchase + scan', 'buy & scan', 'qr'])) {
    frequencyPotential = { status: 'AMBER', why: 'One-and-done without repeat nudge' }
  } else if (!typeLower) {
    frequencyPotential = { status: 'AMBER', why: 'Promotion type unclear' }
  } else {
    frequencyPotential = { status: 'AMBER', why: 'Repeat incentive not explicit' }
  }

  // === friction === (smarter mapping + infer from promo type)
  let friction: BoardCell
  const fb = frictionBudget.replace(/[_-]/g,' ').toLowerCase()
  if (includesAny(fb, ['none','low','1 step','one step','single step'])) {
    friction = { status: 'GREEN', why: 'Low barrier; quick entry' }
  } else if (includesAny(fb, ['med','medium'])) {
    friction = { status: 'AMBER', why: 'Some effort; acceptable' }
  } else if (includesAny(fb, ['high','multi','receipt','proof'])) {
    friction = { status: 'RED', why: 'High effort to enter' }
  } else if (includesAny(typeLower, ['receipt','upload','proof'])) {
    friction = { status: 'RED', why: 'Receipt/proof upload required' }
  } else if (includesAny(typeLower, ['qr','scan'])) {
    friction = { status: 'GREEN', why: 'Scan-and-enter flow' }
  } else {
    friction = { status: 'AMBER', why: 'Friction not specified' }
  }

  // === rewardShape ===
  let rewardShape: BoardCell
  if (!heroPrize) rewardShape = { status: 'RED', why: 'No prize articulated' }
  else if (heroCount <= 1 && (!runnerUps || runnerUps.length === 0)) {
    rewardShape = { status: 'AMBER', why: 'Single big prize; low perceived odds' }
  } else if (runnerUps && runnerUps.length >= 3) {
    rewardShape = { status: 'GREEN', why: 'Hero + ladder improves perceived odds' }
  } else {
    rewardShape = { status: 'AMBER', why: 'Add ladder to improve odds' }
  }

  // === retailerReadiness ===
  let retailerReadiness: BoardCell
  if (retailers && retailers.length > 0) retailerReadiness = { status: 'GREEN', why: 'Banners identified; low staff burden' }
  else retailerReadiness = { status: 'AMBER', why: 'Retailers not specified' }

  // === complianceRisk ===
  let complianceRisk: BoardCell
  const isAlcohol = includesAny(category, ['alcohol','beer','wine','spirits','liquor']) ||
                    retailers.some(r => includesAny(r, ['bws','dan murphy','on-premise','pub','hotel']))
  if (isAlcohol && market === 'AU') complianceRisk = { status: 'AMBER', why: 'RSA/ABAC sensitivities in AU' }
  else complianceRisk = { status: 'GREEN', why: 'Standard trade promo risk' }

  // === fulfilment ===
  let fulfilment: BoardCell
  const travelish = includesAny(heroPrize, ['trip','travel','flight','flights','holiday'])
  if (travelish) fulfilment = { status: 'AMBER', why: 'Travel prize logistics require buffers' }
  else fulfilment = { status: 'GREEN', why: 'Manageable fulfilment' }

  // === kpiRealism ===
  let kpiRealism: BoardCell
  if (verdict === 'NO-GO') kpiRealism = { status: 'RED', why: 'Targets unlikely under current plan' }
  else if (verdict === 'GO WITH CONDITIONS') kpiRealism = { status: 'AMBER', why: 'Achievable with changes' }
  else kpiRealism = { status: 'GREEN', why: 'Targets realistic for mechanic' }

  // Decision / conditions
  const board: Scoreboard = {
    objectiveFit,
    hookStrength,
    mechanicFit,
    frequencyPotential,
    friction,
    rewardShape,
    retailerReadiness,
    complianceRisk,
    fulfilment,
    kpiRealism,
    decision: decideFromVerdict(diagnosis?.judgement?.verdict),
    conditions: trimWords(diagnosis?.judgement?.because || (diagnosis?.fixes?.[0] ?? ''), 16),
  }

  // Enforce ≤16 words for each "why"
  for (const k of Object.keys(board) as (keyof Scoreboard)[]) {
    const cell = (board as any)[k]
    if (cell && typeof cell === 'object' && 'why' in cell) {
      cell.why = trimWords(cell.why, 16)
    }
  }

  // 🎯 Add pragmatic FIX lines so Export's Fix column is never blank
  enrichFixes(ctx, board, { hook, mech, typeOfPromo, frictionBudget, heroPrize, heroCount, runnerUps, retailers, market, category })

  return board
}

// Add concrete fix suggestions per dimension (no model call)
function enrichFixes(
  ctx: CampaignContext,
  board: Scoreboard,
  env: {
    hook: string; mech: string; typeOfPromo: string; frictionBudget: string;
    heroPrize: string; heroCount: number; runnerUps: string[]; retailers: string[];
    market: string; category: string
  }
) {
  const brand = ctx.clientName || ''
  const includesAny = (hay: string, xs: string[]) => {
    const h = (hay || '').toLowerCase()
    return xs.some(x => h.includes(x.toLowerCase()))
  }

  const retailerList = env.retailers.length ? env.retailers.join(', ') : 'priority banners'
  const hooksTopCandidates = [env.hook].filter(Boolean)
  const top1 = hooksTopCandidates[0] || ''
  const lockBrand = (line: string) => {
    if (!line) return line
    const lower = line.toLowerCase()
    if (brand && !lower.includes(brand.toLowerCase())) return `${line} — ${brand}`
    return line
  }

  const fixes: Record<keyof Scoreboard, string> = {
    objectiveFit: `Name one success metric (e.g., +8–12% ROS) and align mechanic and spend to it.`,
    hookStrength: !env.hook
      ? `Commit to a single premium line across touchpoints. For example: “${lockBrand(top1 || 'Make it matter')}”.`
      : `Shorten to 2–6 words, lock brand into the line, and art-direct a minimal, premium layout.`,
    mechanicFit: env.mech
      ? `Keep “Buy, scan, auto-entry”. Add bonus entry at 2+ units; keep adjudication and winner contact centralised.`
      : `Specify “Buy X, scan QR, auto-entry”. Staff explanation under five seconds; no receipt handling in-store.`,
    frequencyPotential: includesAny(env.typeOfPromo, ['stamp','collect','tier','loyalty'])
      ? `Maintain tiers and add a weekly draw; message “more entries on 2+ units”.`
      : `Add a light ladder: bonus entries at 2 and 4 units + weekly micro-draws for repeaters.`,
    friction: includesAny(env.frictionBudget, ['high','receipt','proof','multi']) || includesAny(env.typeOfPromo, ['receipt','upload'])
      ? `Replace receipt upload with QR-on-pack → single-screen form. Pre-fill fields; show 30s progress cue.`
      : `Remove optional fields; compress to one screen; show progress cue (“30s left”).`,
    rewardShape: !env.heroPrize
      ? `Define a hero prize and add a visible ladder (instants + weekly draws) to fix perceived odds.`
      : `Add 100–300 instant-win items and a weekly draw cadence. Signpost “Total winners” prominently on POS.`,
    retailerReadiness: env.retailers.length
      ? `Pre-pack neck tags/wobblers and use a central draw. ${retailerList}: no staff adjudication or prize fulfilment.`
      : `Confirm ranging and POS with target banners. Ship pre-packed kits; keep store workload at zero.`,
    complianceRisk: (includesAny(env.category, ['alcohol','beer','wine','spirits','liquor']) ||
                    env.retailers.some(r => includesAny(String(r), ['bws','dan murphy','on-premise','pub','hotel']))) && env.market==='AU'
      ? `Add RSA/ABAC lines, age gate, and moderation plan. Avoid consumption cues; exclude on-premise if needed.`
      : `Maintain RSA compliance copy and avoid risky imagery; log a moderation plan.`,
    fulfilment: includesAny(env.heroPrize, ['trip','travel','flight','holiday'])
      ? `Use travel credit/concierge with blackout dates and flexible booking windows; publish timelines in T&Cs.`
      : `Keep centralised fulfilment with clear SLAs; publish timelines in T&Cs.`,
    kpiRealism: `Set an entry band not a point estimate; back-solve prize/value and media to that range.`,
  }

  // Apply only when status is AMBER/RED (so GREEN cells don’t get noisy)
  const keys: (keyof Scoreboard)[] = [
    'objectiveFit','hookStrength','mechanicFit','frequencyPotential','friction',
    'rewardShape','retailerReadiness','complianceRisk','fulfilment','kpiRealism'
  ]
  for (const k of keys) {
    const c = board[k]
    if (!c) continue
    if (c.status === 'AMBER' || c.status === 'RED') {
      c.fix = fixes[k]
    }
  }
}

export async function runEvaluate(ctx: CampaignContext) {
  const model = process.env.MODEL_EVAL || process.env.MODEL_DEFAULT

  // Strategist: produce structured JSON from the BRIEF (not framing)
  const strategistSystem = [
    'You are a hard-nosed strategist producing structured diagnosis (JSON only).',
    'Ground everything in shopper behaviour and retailer operations. No fluff.',
  ].join(' ')

  // Heuristics bias (private)
  const hintBlob = [
    ctx.briefSpec?.hook,
    ctx.briefSpec?.mechanicOneLiner,
    ctx.briefSpec?.heroPrize,
  ].filter(Boolean).join('\n')

  let heuristicsHint = ''
  try {
    if (hintBlob) {
      const h = analyzeRoute(hintBlob)
      heuristicsHint =
        `HEURISTICS (private): OPV=${h.subs.opv} PR=${h.subs.pr} IW=${h.subs.iw} FREQ=${h.subs.freq} ` +
        `Friction=${h.subs.friction} Prize=${h.subs.prize} RAS=${h.subs.ras} HCI=${h.subs.hci}.`
    }
  } catch { /* best-effort */ }

  // PromoTrack bias (private) — pulled from promotrack.ts
  let promotrackGuide = ''
  try {
    promotrackGuide = buildEvaluationGuide(ctx) || ''
  } catch { /* best-effort; safe if module returns nothing */ }

  const briefFacts = [
    ctx.briefSpec?.hook ? `Hook: ${ctx.briefSpec.hook}` : '',
    ctx.briefSpec?.mechanicOneLiner ? `Mechanic: ${ctx.briefSpec.mechanicOneLiner}` : '',
    ctx.briefSpec?.typeOfPromotion ? `Promotion: ${ctx.briefSpec.typeOfPromotion}` : '',
    ctx.briefSpec?.retailers?.length ? `Retailers: ${ctx.briefSpec.retailers.join(', ')}` : '',
    ctx.briefSpec?.tradeIncentive ? `Trade incentive: ${ctx.briefSpec.tradeIncentive}` : '',
    ctx.briefSpec?.heroPrize ? `Hero prize: ${ctx.briefSpec.heroPrize}${ctx.briefSpec.heroPrizeCount ? ` x${ctx.briefSpec.heroPrizeCount}` : ''}` : '',
    ctx.briefSpec?.runnerUps?.length ? `Runner-ups: ${ctx.briefSpec.runnerUps.join(', ')}` : '',
    ctx.briefSpec?.frictionBudget ? `Friction: ${ctx.briefSpec.frictionBudget}` : '',
    ctx.briefSpec?.bannedMechanics?.length ? `Banned: ${ctx.briefSpec.bannedMechanics.join(', ')}` : '',
    ctx.briefSpec?.calendarTheme ? `Calendar: ${ctx.briefSpec.calendarTheme}` : '',
    `Orientation: ${ctx.orientation || 'UNKNOWN'}`,
  ].filter(Boolean).join(' | ')

  const strategistUser = [
    `Campaign: ${ctx.clientName} — ${ctx.title}`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Brand position: ${ctx.brandPosition || 'UNKNOWN'}`,
    '',
    'BRIEF (facts):',
    briefFacts || '_none_',
    '',
    heuristicsHint,
    promotrackGuide ? `\nPROMOTRACK (private guardrails & winning patterns):\n${promotrackGuide}\n` : '',
    '',
    EVAL_DIAGNOSIS_JSON_SPEC,
    'Return ONLY the JSON object.',
  ].join('\n')

  const jsonText = await chat({
    model,
    system: strategistSystem,
    messages: [{ role: 'user', content: strategistUser }],
    temperature: Number(process.env.EVAL_DIAG_TEMP ?? 0.35),
    top_p: 1,
    json: true, // Responses API JSON mode
    max_output_tokens: 1400,
  })

  let diagnosis: any
  try {
    diagnosis = JSON.parse(jsonText)
  } catch {
    // Fallback: populate from brief to avoid null output
    diagnosis = {
      stance: ctx.orientation || 'UNKNOWN',
      brand_position: ctx.brandPosition || 'UNKNOWN',
      creative_hook_current: ctx.briefSpec?.hook || null,
      mechanic: ctx.briefSpec?.mechanicOneLiner || null,
      retailers: ctx.briefSpec?.retailers || [],
      prizes: {
        hero: ctx.briefSpec?.heroPrize || null,
        hero_count: Number(ctx.briefSpec?.heroPrizeCount || 0) || null,
        runner_ups: ctx.briefSpec?.runnerUps || [],
      },
      friction: ctx.briefSpec?.frictionBudget || null,
      banned_mechanics: ctx.briefSpec?.bannedMechanics || [],
      calendar_theme: ctx.briefSpec?.calendarTheme || null,
      what_worked: [],
      what_didnt: [],
      retailer_ops: { staff_explainable: true, stock_risk: 'unknown', auditability: 'unknown' },
      risks: [],
      fixes: [],
      creative_hook_better: null,
      judgement: { verdict: 'GO_WITH_CONDITIONS', because: 'Fallback parsing.' },
    }
  }

  // Build scoreboard with pragmatic fixes (used by export + visible in narrative table)
  const scoreboard = buildScoreboard(ctx, diagnosis)

  // Compose Superb Evaluation narrative (markdown)
  const prose = composeSuperbEvaluation(ctx, {
    verdict: (diagnosis?.judgement?.verdict && decideFromVerdict(diagnosis.judgement.verdict) === 'GO') ? 'STRONG'
           : (decideFromVerdict(diagnosis?.judgement?.verdict) === 'NO-GO') ? 'WEAK'
           : 'WORKABLE',
    one_breath: diagnosis?.judgement?.because || '',
    narrative: diagnosis?.narrative || '',
    diagnosis: diagnosis?.deep || diagnosis?.diagnosis || {}, // pass-through if present
    rebuild_spec: diagnosis?.rebuild_spec || {
      staff_script: 'Buy any participating product, scan the on-pack QR, and you’re in.',
      hooks: [ diagnosis?.creative_hook_better || diagnosis?.creative_hook_current || ctx.briefSpec?.hook || '' ].filter(Boolean),
      ladder: {
        hero: diagnosis?.prizes?.hero ? { title: diagnosis.prizes.hero, qty: diagnosis.prizes?.hero_count || 1, value_band: diagnosis.prizes?.hero_value_band || '$5k–$10k' } : undefined,
        runner_ups: Array.isArray(diagnosis?.prizes?.runner_ups) ? diagnosis.prizes.runner_ups.map((t: string) => ({ title: t, qty: 10, value_each: '$50–$100' })) : [],
        instants: [],
        odds_note: 'Visible ladder improves perceived odds vs. single mega prize.'
      },
      entry_path: diagnosis?.mechanic || ctx.briefSpec?.mechanicOneLiner || 'QR → one-screen form → auto-entry',
      cadence: 'Weekly micro-draws + final hero',
      fulfilment: 'Centralised winner contact; no store adjudication',
      compliance_line: (ctx.category || '').toLowerCase().includes('alcohol') ? 'RSA/ABAC safe; age gate; no consumption cues' : 'Standard trade promo compliance',
    },
    bold_variants: diagnosis?.bold_variants || [],
    promotrack_applied: diagnosis?.promotrack_applied || [], // optional lens
    scoreboard,
  })

  return {
    content: prose,
    meta: {
      stance: diagnosis?.stance || ctx.orientation || 'UNKNOWN',
      model,
      temp: Number(process.env.EVAL_TEMP ?? 0.8),
      scoreboard,
    },
  }
}
