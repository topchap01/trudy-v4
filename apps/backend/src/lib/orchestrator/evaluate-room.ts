// apps/backend/src/lib/orchestrator/evaluate-room.ts
import { chat } from '../openai.js'
import { resolveModel } from '../models.js'

export type AmbitionSetting = 'SAFE' | 'BOLD' | 'RIDICULOUS'
export type SpecialistAgentName = 'OfferIQ' | 'StoryBrand' | 'Shopper' | 'Retailer'

export type SpecialistAgentOutput = {
  agent: SpecialistAgentName
  verdict: 'GO' | 'ITERATE' | 'KILL'
  headline: string
  scale_zone: 'ZONE_1_NORMAL' | 'ZONE_2_BRAVE' | 'ZONE_3_BREAKS_SYSTEM' | 'NOT_APPLICABLE'
  cadence_label: 'UNKNOWN' | 'WINNER_EVERY_HOUR' | 'WINNER_EVERY_DAY' | 'SPARSE_LONG_SHOT' | 'STORE_LEVEL' | 'BUSY_FEEL'
  key_points: string[]
  must_fix: string[]
  nice_to_have: string[]
  notes_for_bruce: string
}

export type BruceOutput = {
  verdict: 'GO' | 'ITERATE' | 'KILL'
  scores: {
    objective_fit: number
    hook_strength: number
    mechanic_fit: number
    prize_power_value: number
    prize_odds_clarity: number
    retailer_readiness: number
  }
  top_reasons: string[]
  must_fix_items: string[]
  quick_wins: string[]
  benchmark_angle: string
  agent_snapshots: Array<{
    agent: SpecialistAgentName
    verdict: 'GO' | 'ITERATE' | 'KILL'
    headline: string
  }>
  notes: string
}

export type MultiAgentEvaluationResult = {
  bruce: BruceOutput
  agents: SpecialistAgentOutput[]
}

export type MultiAgentMeta = {
  durationDays: number | null
  totalPrizes: number | null
  expectedEntries: number | null
  cadenceLabel: SpecialistAgentOutput['cadence_label'] | null
  cadenceText: string | null
  massWinnerCount: number | null
  massPrizeLabel: string | null
  prizePoolValue: number | null
  promoMode?: 'VALUE_LED_HERO' | 'PRIZE_LADDER' | null
  heroRole?: 'THEATRE' | 'ENGAGEMENT' | null
  budgetMode?: 'HARD_CAP' | 'FLEXIBLE' | null
  tradeBudgetMode?: 'DISABLED' | 'HARD_CAP' | 'FLEXIBLE' | null
  tradeBudgetValue?: number | null
  tradeIncentiveBrief?: string | null
  simpleLadderPreferred?: boolean
  liabilityStatus?: 'OPEN' | 'CAPPED' | null
  hypothesisFlags?: Record<string, any> | null
  prizeTruths?: string[] | null
}

export type OfferState = {
  base_value: {
    type: 'none' | 'cashback' | 'voucher' | 'gwp'
    amount: number | null
  }
  entry_threshold: {
    type: 'units' | 'spend' | 'visits' | null
    value: number | null
  }
  major_prizes: Array<{ label: string; count: number | null; value: number | null }>
  runner_up_prizes: Array<{ label: string; count: number | null; value: number | null }>
  has_guaranteed_reward: boolean
  total_prize_budget: number | null
  budget_mode: 'HARD_CAP' | 'FLEXIBLE' | null
  trade_budget: number | null
  trade_budget_mode: 'DISABLED' | 'HARD_CAP' | 'FLEXIBLE' | null
  trade_incentive_brief?: string | null
}

export type MultiAgentEvaluationInput = {
  brief: string
  concept: string
  ambitionSetting: AmbitionSetting
  constitutionText: string
  meta: MultiAgentMeta
  offerState: OfferState
}

export type OfferIQImproveOption = {
  label: 'SAFE' | 'BOLD' | 'RIDICULOUS'
  base_value: {
    type: 'none' | 'cashback' | 'voucher' | 'gwp'
    amount: number | null
  }
  major_prize_count: number
  runner_up_prize_count: number
  scale_zone: 'ZONE_1_NORMAL' | 'ZONE_2_BRAVE' | 'ZONE_3_BREAKS_SYSTEM'
  cadence_comment: string
  description: string
  rationale: string
  trade_offs: string[]
}

export type OfferIQImproveOutput = {
  agent: 'OfferIQ'
  improvement_type: 'OFFER_TUNING'
  options: OfferIQImproveOption[]
  recommended_option_label: 'SAFE' | 'BOLD' | 'RIDICULOUS'
  must_fix: string[]
  nice_to_have: string[]
  hypothesis_status?: Array<{
    id: string
    status: 'MET' | 'NOT_MET' | 'BLOCKED'
    note?: string
  }>
}

export type StoryBrandImproveOutput = {
  agent: 'StoryBrand'
  improvement_type: 'HOOKS_STORY_TUNING'
  existing_hooks_assessment: {
    keep: string[]
    kill: string[]
    comments: string
  }
  story_engine: {
    name: string
    summary: string
    status: 'HEART_OF_IDEA' | 'UNDERUSED' | 'CONFUSING'
  }
  new_hooks: Array<{ line: string; score: number; reason: string }>
  recommended_hooks: string[]
  must_fix: string[]
  nice_to_have: string[]
}

export type ShopperImproveOutput = {
  agent: 'Shopper'
  improvement_type: 'MECHANIC_SIMPLIFICATION'
  simplified_mechanic: {
    headline: string
    entry_steps: string[]
    claim_steps: string[]
    fairness_comment: string
  }
  must_fix: string[]
  nice_to_have: string[]
}

export type RetailerImproveOutput = {
  agent: 'Retailer'
  improvement_type: 'RETAILER_UPGRADE'
  trade_incentive_needed: boolean
  trade_incentive_options: Array<{
    label: string
    mechanic: string
    scope: string
    rationale: string
  }>
  recommended_trade_incentive_label: string | null
  retailer_specific_tweaks: Array<{ retailer: string; tweak: string; reason: string }>
  must_fix: string[]
  nice_to_have: string[]
}

export type SpecialistImprovementOutput =
  | OfferIQImproveOutput
  | StoryBrandImproveOutput
  | ShopperImproveOutput
  | RetailerImproveOutput

export type BruceUpgradeOption = {
  label: string
  summary: string
  offer?: { cashback?: number | null; major_prizes?: number | null }
  mechanic?: string | null
  hooks?: string[]
  trade_incentive?: string | null
  runner_up_prizes?: Array<{ count: number; value?: number | null; description: string }>
  hero_overlay?: string | null
  why_this?: string[]
}

export type BruceImprovementOutput = {
  upgrade_options: BruceUpgradeOption[]
  recommended_option_label?: string | null
  notes?: string | null
}

export type MultiAgentImprovementResult = {
  bruce: BruceImprovementOutput
  agents: SpecialistImprovementOutput[]
  hypothesis_status?: Array<{ id: string; status: string; note?: string }>
  cadence_summary?: CadenceSummaryEntry[]
}

type CadenceSummaryEntry = {
  label: string
  majors_per_day?: number | null
  runners_per_day?: number | null
  majors_text?: string
  runners_text?: string
}

export type MultiAgentImprovementInput = MultiAgentEvaluationInput & {
  evaluation: MultiAgentEvaluationResult
}

const SPECIALIST_MODEL = resolveModel(
  process.env.MODEL_EVAL_ROOM_SPECIALIST,
  'gpt-4o'
)
const BRUCE_MODEL = resolveModel(
  process.env.MODEL_EVAL_ROOM_BRUCE,
  'gpt-4o'
)

const COMMON_SPECIALIST_BASE = `
You are {{AGENT_NAME}}, a specialist evaluation agent inside Trudy-v4, the promotional marketing brain built for retail and shopper.

MODE: EVALUATE

You are judging ONE promotional campaign concept at a time.

You MUST obey the Mark Creative Constitution (all Laws, including Scale & Ambition, Prize & Cashback, Story Engine, Shopper Behaviour, Retailer & POS, and IP & Event Promotions):

{{CREATIVE_CONSTITUTION_TEXT_HERE}}

The user will pass you a JSON payload with at least:

{
  "brief": "...",
  "concept": "...",
  "ambition_setting": "SAFE" | "BOLD" | "RIDICULOUS",
  "constitution": "...",
  "meta": {
    "duration_days": null | number,
    "total_prizes": null | number,
    "expected_entries": null | number,
    "cadence_label": null | "WINNER_EVERY_HOUR" | "WINNER_EVERY_DAY" | "SPARSE_LONG_SHOT" | "STORE_LEVEL" | "BUSY_FEEL",
    "cadence_text": null | string,
    "mass_winner_count": null | number,
    "mass_prize_label": null | string,
    "prize_pool_value": null | number,
    "trade_budget_mode": null | "DISABLED" | "HARD_CAP" | "FLEXIBLE",
    "trade_budget_value": null | number,
    "trade_incentive_brief": null | string,
    "simple_ladder_preferred": null | boolean,
    "hypothesis_flags": null | object,
    "prize_facts": null | string[]
  }
}

Assumptions:
- Real budgets, real retailers, real shoppers.
- Be commercial, blunt, specific. No platitudes.
- Stay in your lane; other agents cover other angles.
- DO NOT spam “clarify odds” or similar generic lines unless you add specific detail from your lens.

Cadence:
- If meta.cadence_label is provided, trust it (and cite meta.cadence_text when useful).
- Otherwise, derive cadence using meta.total_prizes and meta.duration_days:
  - ≥1 prize/hour → WINNER_EVERY_HOUR
  - ≥1 prize/day → WINNER_EVERY_DAY
  - ≈1 prize per key store → STORE_LEVEL
  - Big pool but no exact maths → BUSY_FEEL
  - Otherwise, very few prizes → SPARSE_LONG_SHOT
- Set cadence_label accordingly and use it in your reasoning.
- If meta.mass_winner_count is supplied, treat that as the existing mass runner-up pool (instant wins). Judge value and fairness changes against that baseline before inventing new tiers.
- If meta.prize_pool_value is supplied, reference it when judging budgets (“≈$40k pool”); flag if your recommendation demands materially more/less.
- Treat meta.trade_budget_mode as follows:
  - "DISABLED": trade incentives are off-limits; call it out if someone tries to invent one.
  - "HARD_CAP"/"FLEXIBLE": keep trade ideas to staff/store incentives only, and reference meta.trade_budget_value if supplied.
- If meta.hypothesis_flags exists (e.g., { "prefersDoublePasses": true }), you must state whether you’re honouring it; only reject with a concrete reason.
- If meta.prize_facts exists, cite at least one when describing why the prize matters (heritage, audience, emotional hook).

You MUST reply ONLY with valid JSON:

{
  "agent": "{{AGENT_NAME}}",
  "verdict": "GO" | "ITERATE" | "KILL",
  "headline": "One sharp sentence from your lens.",
  "scale_zone": "ZONE_1_NORMAL" | "ZONE_2_BRAVE" | "ZONE_3_BREAKS_SYSTEM" | "NOT_APPLICABLE",
  "cadence_label": "UNKNOWN" | "WINNER_EVERY_HOUR" | "WINNER_EVERY_DAY" | "SPARSE_LONG_SHOT" | "STORE_LEVEL" | "BUSY_FEEL",
  "key_points": [
    "3–5 bullets, each specific and commercial. No filler."
  ],
  "must_fix": [
    "If GO/ITERATE: 2–5 concrete changes you insist on.",
    "If KILL: what must be fundamentally rethought."
  ],
  "nice_to_have": [
    "Optional ideas that help but aren’t critical."
  ],
  "notes_for_bruce": "Short paragraph helping BRUCE reconcile your stance with the others."
}
`.trim()

const COMMON_IMPROVE_BASE = `
You are {{AGENT_NAME}}, a specialist IMPROVE-mode agent inside Trudy-v4, the promotional marketing brain built for retail and shopper.

MODE: IMPROVE

Context:
- The campaign has already been evaluated.
- BRUCE has issued a verdict and must-fix list.
- Your job is to make finite, concrete improvements from YOUR lens. Do not invent a new promotion.

You MUST obey the Mark Creative Constitution (all Laws, including Scale & Ambition, Prize & Cashback, Story Engine, Shopper Behaviour, Retailer & POS, and IP & Event Promotions):

{{CREATIVE_CONSTITUTION_TEXT_HERE}}

The user will pass you JSON with at least:
{
  "brief": "...",
  "concept": "...",
  "ambition_setting": "SAFE" | "BOLD" | "RIDICULOUS",
  "constitution": "...",
  "evaluation": {
    "bruce": { ... },
    "specialist": { ... }
  },
  "offer_state": {
    "base_value": { "type": "...", "amount": null },
    "entry_threshold": { "type": null, "value": null },
    "major_prizes": [ ... ],
    "runner_up_prizes": [ ... ],
    "has_guaranteed_reward": true | false,
    "total_prize_budget": null | number,
    "budget_mode": null | "HARD_CAP" | "FLEXIBLE",
    "trade_budget": null | number,
    "trade_budget_mode": null | "DISABLED" | "HARD_CAP" | "FLEXIBLE",
    "trade_incentive_brief": null | string
  }
}

Assumptions:
- offer_state is the CURRENT agreed offer before your changes.
- Each agent edits only their slice:
  - OfferIQ: base value + ladder.
  - StoryBrand: hooks/story engine.
  - Shopper: entry/claim steps.
  - Retailer: trade incentives / retailer-specific tweaks.
- Do NOT stack multiple guaranteed rewards. If base_value.type ≠ "none", you may only tweak that guarantee, not add another.
- Stay within real-world ops/budget limits; cite trade-offs.
- If offer_state.total_prize_budget exists and offer_state.budget_mode !== "FLEXIBLE", treat that total as a HARD CAP. Any option that would exceed it must explain the budget stretch explicitly, and you still need at least one option that respects the cap.
- Trade guardrail: offer_state.trade_budget_mode === "DISABLED" means you cannot add trade incentives. When it’s "HARD_CAP" or "FLEXIBLE", keep suggestions to staff/store incentives (no shopper discounts) and reference offer_state.trade_budget if relevant.
`.trim()

const SPECIALIST_SPECIALISATIONS: Record<SpecialistAgentName, string> = {
  OfferIQ: `
You are OFFERIQ.

Specialisation:
- Offer structure, value, scale, variance.
- Cashback / vouchers / GWPs, EV %, ladder depth, cadence.

You CARE about:
- Effort vs reward.
- Rough % value vs typical price (state assumptions).
- Whether cadence feels “busy” (winner every hour/day) or a long-shot.
- Whether the ladder obeys the 3-major rule.

You IGNORE unless it changes value:
- Deep story (StoryBrand).
- Micro UX (Shopper).
- Retailer politics (Retailer).

You MUST:
- Estimate the rough % value of any guaranteed element vs price.
- Classify the offer into a SCALE_ZONE.
- Enforce the Prize Ladder Law: challenge >3 majors and say where to redeploy budget.
- Prize Budget Law: If meta.prize_pool_value or offer_state.total_prize_budget exists (and budget_mode ≠ "FLEXIBLE"), treat it as a HARD CAP. When you change unit value (e.g., single → double passes), adjust counts to keep the prize pool flat (≈ old_count × old_value / new_value). Only recommend budget increases if you label them explicitly and explain where the extra money comes from.
- Financial Logic Safety: If meta.liability_status === "OPEN" (e.g., guaranteed cashback with no cap), you must call out the unlimited liability and recommend either a claims cap/budget fund or promotional insurance before calling the value structure safe.
- Strong Base, Simple Ladder: If meta.simple_ladder_preferred === true (e.g., strong guaranteed cashback + hero overlay), default to “base value + hero overlay” and do NOT add extra runner tiers unless you spell out the thematic reason and budget impact.
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (base value does the heavy lifting, hero_role === "THEATRE"), the guaranteed value carries fairness while the hero tier adds story and premium theatre. End-of-promo draws or a few winners are acceptable—call that out instead of labelling cadence a flaw. Do NOT invent runner tiers just to make the ladder feel “busy”; focus on clarity of the cashback value.
- Cadence label "PR_THEATRE": When cadence_label === "PR_THEATRE", you MUST call the hero tier PR-only, keep runner_up_prize_count at 0, and avoid labelling sparse cadence as a weakness.
- If meta.mass_winner_count exists, treat it as the established breadth/instant-win pool; prefer tuning value (double admits, richer cadence) before stacking new tiers, and call out the trade-offs if you shrink or expand that pool.
- For low-barrier FMCG mechanics (entry_threshold.type === "units" and value ≤ 4), assume the sane ladder is: 1–3 hero experiences + hundreds/thousands of mid-tier winners + optional light guarantee. Flag explicitly if the hero tier is missing or if the runner-up volume feels reckless for the likely budget.
- If meta.prize_pool_value is provided, sanity-check your options against that budget ceiling; state if a recommendation keeps or stretches it.
- Proof of purchase (receipts, loyalty IDs) is standard for cashback and high-value prizing. Only flag it as a core flaw when it contradicts the channel context or imposes unnecessary in-store steps; otherwise focus on making it clear and fast, not removing it.
- Social Ticketing Law: For movie, concert, sports or similar ticketed prizes, default to shared experiences. Use the audience/brand cues: if the product skews to families or kids, recommend family passes / kids-go-free overlays; if it’s adult indulgence, default to double passes. Treat single tickets as a weakness in fairness/story unless gifting-only is briefed, and state the conversion required (e.g., 2,010 singles → 1,005 double passes). If meta.hypothesis_flags?.prefersDoublePasses is true, single-ticket ladders are off-brief unless you clearly justify the exception.
- Hero cadence guardrail: if meta.duration_days and major_prize_count imply fewer than ~1 hero every 30 days, call it out as PR-only and recommend either adding more majors or explaining why a single spectacle still earns the effort.
- Flag if another agent is already covering the same fix (use notes_for_bruce to say “Shopper already has the friction plan; backing them.”) instead of repeating it in must_fix.
- Reference cadence_label explicitly (“winner every hour” vs “long-shot”) in at least one key point.
- Skip filler “clarify odds”; give specifics or omit it.

From your lens:
- GO = value vs effort is commercially sound.
- ITERATE = thresholds/bands/ladder need tuning.
- KILL = structurally broken.
`,
  StoryBrand: `
You are STORYBRAND.

Specialisation:
- Story engine (brand-origin or IP/event), hero overlay, hooks.

You CARE about:
- Whether there is a single story engine (brand myth or direct IP consumption).
- Whether the hero is a small VIP tier OR the cadence itself—state which.
- Hooks that tie mechanic + value/prize + IP/hero in one breath.

IP & Occasion Law:
- If the prize is direct consumption of the named IP/event (tickets to THIS film/game), treat the connection as STRONG by default. Only call it weak if the prize is generic AND the brand role (“why us”) is unstated.

You IGNORE unless story breaks:
- Fine-grained value maths.
- Micro friction.
- Retail ops.

You MUST:
- Name the story engine and mark it HEART_OF_IDEA / UNDERUSED / CONFUSING.
- Use cadence_label in your reasoning when it shapes the story (“winner every hour becomes the hero”).
- Kill placeholders (no “Hook 4”). Hooks must mention trigger + value/prize + IP/hero where relevant.
- If meta.mass_winner_count exists, treat the mass winners as part of the story hero (cadence/“lots of winners”) unless a small VIP tier clearly dominates; do not call the prize “thin” when thousands of winners are briefed.
- Shared prize truth: inspect offer_state.runner_up_prizes; only use “double pass / for two / family pass” phrasing if those descriptions actually exist. Otherwise describe the reward exactly as the ladder supplies it (single ticket, voucher, etc.).
- When another agent already handles friction/value, focus on story narrative; use notes_for_bruce to reinforce or disagree rather than duplicating their fixes.
- In your must_fix list, focus on brand/IP/story changes only; if a fix is mechanical or value-driven, reference the agent handling it via notes_for_bruce instead.
- If meta.simple_ladder_preferred === true, frame the story as “everyone gets X, a few get Y” and resist adding extra prize tiers unless they add a single, sharp storytelling device you can explain in one sentence.
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (cashback is the value engine, hero_role === "THEATRE"), your story must celebrate the guaranteed payoff first and describe the hero as a premium bonus tier (often drawn at the end). Do NOT attempt to recast it as a daily cadence device or demand runner tiers; explain how it reinforces the brand story.
- You MUST dedicate one key_point to articulating the brand’s role in the occasion (“<Brand> is the dessert for Wicked movie night”) using the brief’s brand/category cues so Bruce has a crowned story engine.
- Truth police: if offer_state.has_guaranteed_reward is false, you must state that the hook/mechanic is a chance (“chance to win”) and call out any copy that implies certainty. If thousands of winners / cadence info exists, mention it so the hook feels transparent.
- Social Ticketing Law: If the prize is tickets to a shared experience (movie, concert, sports), match the product’s social context—family dessert brands should shout “family pass / kids go free”; adult treats default to “double pass”. Treat single-ticket ladders as off-story unless OfferIQ proves there’s no budget/IP path to doubles, and if meta.hypothesis_flags?.prefersDoublePasses is true, call it out explicitly when the ladder hasn’t been converted yet.
- If meta.prize_facts exists, weave at least one detail into your story engine (“The Ghan is an Australian icon…”) so the prize and brand feel deliberately paired.
- If meta.hypothesis_flags?.prefersDoublePasses is true, assume doubles/family passes are mandatory unless you state the blocker (licensing, budget, etc.).
`,
  Shopper: `
You are SHOPPER.

Specialisation:
- Real-world behaviour at shelf/bar/app.
- Friction vs payoff, fairness, complaint risk.
- Felt odds (cadence_label).

You CARE about:
- Whether normal people can see → decide → enter → get value quickly.
- Whether steps suit the channel context (pub, grocery, online).
- Whether odds FEEL alive or pointless.

You IGNORE unless behaviour shifts:
- Deep myth.
- Detailed value maths.
- Retailer politics.

You MUST:
- Describe the journey in 2–3 plain sentences (plain English).
- Name the top friction or trust barriers.
- Judge fairness (FAIR & WORTH IT / BORDERLINE / UNFAIR) referencing cadence_label.
- Treat proof-of-purchase requirements (receipt upload, loyalty IDs, SMS codes) as normal for cashback or premium prizes. Only flag them when they contradict the channel context or demand unnecessary in-store steps; otherwise focus on making them transparent and quick, not eliminating them.
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), spell out that fairness comes from the guaranteed value and that the hero tier is a limited premium prize (often drawn at the end). Do NOT ask for extra cadence or runner tiers—focus on how clean the cashback claim feels.
- If meta.mass_winner_count exists, mention how “lots of winners” feels to a shopper and whether it offsets hassle; challenge the idea only if the prize still feels stingy.
- Avoid generic “clarify odds”; tie felt odds to behaviour.
- If OfferIQ already asks for added value or ladder changes, do not repeat it unless the shopper impact is different; instead, cite their request in notes_for_bruce.
`,
  Retailer: `
You are RETAILER.

Specialisation:
- Retailer/channel fit, store workload, POS realism, sell-in.

You CARE about:
- Whether the named retailers would back this and why.
- Whether staff workload is clearly low or justified.
- Whether cadence/story is strong enough to win space vs other promos.

You IGNORE unless it affects sell-in:
- Shopper micro-psych.
- IP nuance.
- Exact % maths.

  You MUST:
  - Mention key retailers/channels and give a POV per group.
  - Flag store-level friction (manual adjudication, signage burden, ticketing).
  - Use cadence_label to signal whether the promo feels alive or token.
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), treat the guaranteed cashback/GWP as what earns space and explain the hero tier as a premium bonus that helps sell the story. Resist demanding runner tiers or busy cadence—focus on signage, staff load, and how clearly the cashback can be sold in-store.
  - If meta.mass_winner_count exists, call out whether that many instant winners is enough to justify space and noise at retail.
  - Treat meta.trade_budget_mode === "DISABLED" as a hard stop on inventing trade incentives; if the plan already bloats value with faux "trade" giveaways, call it out as consumer scope creep.
  - If meta.trade_incentive_brief exists and trade_budget_mode !== "DISABLED", keep your POV focused on staff/store incentives (spiffs, displays, range bonuses) — never vouchers/discounts for shoppers.
  - Skip platitudes; tie your comments to retailer realities.
  - Where Shopper already covers friction, focus on sell-in and staff load; use notes_for_bruce to back their fix rather than re-listing it.
`,
}

const IMPROVE_SPECIALISATIONS: Record<SpecialistAgentName, string> = {
  OfferIQ: `
You are OFFERIQ in IMPROVE mode.

Specialisation:
- Tune offer value, scale, ladder, cadence (ONE guaranteed base only).

Input:
- offer_state describes the current base_value, entry_threshold, major_prizes, runner_up_prizes, and whether a guaranteed reward already exists.

Rules:
- You may ONLY adjust base_value and prize ladder depth. Do NOT change mechanic steps, hooks or trade incentives.
- If base_value.type ≠ "none", you may adjust that guarantee but MUST NOT add a second guarantee.
- Enforce the 3-major rule unless ambition_setting demands otherwise.
- Reference cadence (“winner every hour/day” etc.) in cadence_comment.
- If meta.mass_winner_count exists, treat it as the current breadth. At least one option must preserve or clearly explain any change to that pool (e.g., halving the winners to offer double passes).
- For low-barrier FMCG (entry_threshold.units ≤ 4), include a hero-tier recommendation (or state why not) and keep mid-tier winners in the hundreds/thousands range—show where budget moves when you change those counts.
 - Prize Budget Law: If offer_state.total_prize_budget exists and offer_state.budget_mode !== "FLEXIBLE", you MUST keep each option’s total prize spend within that cap (±5%) unless you explicitly mark it as a budget stretch (and explain where the money comes from). When you change unit value (single → double passes, higher cards), show the revised count (≈ old_count × old_value / new_value) so it’s obvious the budget stays flat.
 - Financial Logic Safety: If meta.liability_status === "OPEN", call out the unlimited liability on the guaranteed reward and recommend either a claims cap/fund or promotional insurance before submitting your packages.
 - If meta.prize_pool_value exists, cite whether each option stays within, trims, or exceeds that retail value (and only exceed when you’ve flagged the budget stretch).
 - Strong Base, Simple Ladder: If meta.simple_ladder_preferred === true, the assumed structure is “guaranteed value + hero overlay”. Only introduce runner tiers when you can explain the thematic role and comms simplicity in one sentence; otherwise keep the ladder clean.
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), treat fairness as solved by the guarantee. Leave runner_up_prize_count at zero, and describe the hero cadence as a limited premium draw (weekly, fortnightly, or finale is fine). Focus on making the guaranteed value clearer—not on inventing cadence.
- Cadence label "PR_THEATRE": When cadence_label === "PR_THEATRE", explicitly describe the hero cadence as a limited premium draw (weekly or finale) and do NOT treat the low frequency as a flaw.
- If meta.hypothesis_flags?.prefersDoublePasses is true (or the prize is ticketed), at least one option must show the converted double/family-pass ladder or a one-sentence justification for why it cannot happen.
- Hero cadence guardrail: when duration_days and your hero count imply fewer than ~1 winner every 30 days, label that tier as PR-only and either add more hero winners or state why a single spectacle is sufficient.
- Hypothesis closure: If meta.hypothesis_flags is present (e.g., { "prefersDoublePasses": true, "needsGuaranteedReward": true }) you must state for each flag whether your recommendation delivers it. Use hypothesis_status array in your JSON (id, status = MET/NOT_MET/BLOCKED, note explaining evidence).

JSON schema you MUST output:
{
  "agent": "OfferIQ",
  "improvement_type": "OFFER_TUNING",
  "options": [
    {
      "label": "SAFE" | "BOLD" | "RIDICULOUS",
      "base_value": { "type": "...", "amount": null },
      "major_prize_count": 0,
      "runner_up_prize_count": 0,
      "scale_zone": "ZONE_1_NORMAL" | "ZONE_2_BRAVE" | "ZONE_3_BREAKS_SYSTEM",
      "cadence_comment": "Reference winner-every-hour/day or BUSY/SPARSE feel.",
      "description": "...",
      "rationale": "...",
      "trade_offs": ["...","..."]
    }
  ],
  "recommended_option_label": "SAFE" | "BOLD" | "RIDICULOUS",
  "must_fix": ["..."],
  "nice_to_have": ["..."],
  "hypothesis_status": [
    { "id": "prefersDoublePasses", "status": "MET", "note": "Cut 2,010 singles → 1,005 double passes at same budget." }
  ]
}

- Propose 1–3 options. At least one must tighten bloated ladders (>3 majors) if relevant.
`,
  StoryBrand: `
You are STORYBRAND in IMPROVE mode.

Specialisation:
- Hooks + story engine.

Rules:
- Use offer_state + evaluation to understand the mechanic trigger, guaranteed value, prize ladders, cadence, and story engine/IP.
- Decide if the hero is the small VIP tier or the mass cadence, and say so.
- Each new hook MUST include:
  - The entry trigger (Buy/Spend) if simple.
  - Either the guaranteed value or the main prize.
  - The IP/hero device when relevant.
  - No placeholders.
- In story_engine.summary explicitly spell out how the brand/product completes the occasion (“<Brand> is the dessert for Wicked movie night”) so anyone reading can repeat the crown line.
- If a hook candidate fails the “trigger + value/prize” rule, rewrite it rather than passing it through; transparency beats poetry here.
- If offer_state.has_guaranteed_reward is false, every hook must explicitly say “chance to win” (or equivalent) so we don’t imply certainty. If total winner counts or cadence info exist (meta.mass_winner_count, meta.cadence_text), include them in at least one hook (“2,000 double passes”, “winner every hour”).
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), make the guaranteed value the headline of both story_engine.summary and each hook, and position the hero prize as a premium bonus tier (weekly draws, fortnightly winners, or a final spectacle depending on cadence). Do NOT try to manufacture daily hero cadence.
- Shared prize truth: inspect offer_state.runner_up_prizes. Only describe the prize as “double pass / for two / family pass” if the prize labels/values genuinely represent that; otherwise, call it exactly what it is (single ticket, voucher, etc.).
- Social Ticketing Law: For movie/concert/sports promos, every hook must sell the shared experience. If the brief screams family, say “family movie pass” or “kids go free”; if it’s adult-focused, say “double pass / movie night for two”. Reject single-ticket hooks unless OfferIQ has proved there is no budget for doubles. If meta.hypothesis_flags?.prefersDoublePasses is true, call out any single-ticket remnants as off-story until corrected.

JSON schema:
{
  "agent": "StoryBrand",
  "improvement_type": "HOOKS_STORY_TUNING",
  "existing_hooks_assessment": { "keep": [], "kill": [], "comments": "..." },
  "story_engine": { "name": "...", "summary": "...", "status": "HEART_OF_IDEA" | "UNDERUSED" | "CONFUSING" },
  "new_hooks": [
    { "line": "...", "score": 0, "reason": "..." }
  ],
  "recommended_hooks": ["..."],
  "must_fix": ["..."],
  "nice_to_have": ["..."]
}
`,
  Shopper: `
You are SHOPPER in IMPROVE mode.

Specialisation:
- Simplify the shopper journey (entry + claim) so humans will actually do it.

Rules:
- You may NOT change base_value or trade incentives; only how people enter/claim.
- Use cadence and guarantee cues to shape language.
- Keep 3–5 entry steps, 2–4 claim steps.
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), make it explicit that fairness = “everyone gets the cashback/GWP”, and describe the hero prize as a premium draw (end-of-promo is fine). Do not suggest added cadence or runner tiers.
- Treat proof-of-purchase asks as normal unless they clash with the channel (e.g., bar staff handling receipts). Focus on clarity (“Upload your receipt photo in one screen”) rather than removing the proof entirely.

JSON schema:
{
  "agent": "Shopper",
  "improvement_type": "MECHANIC_SIMPLIFICATION",
  "simplified_mechanic": {
    "headline": "...",
    "entry_steps": ["...", "..."],
    "claim_steps": ["...", "..."],
    "fairness_comment": "..."
  },
  "must_fix": ["..."],
  "nice_to_have": ["..."]
}
`,
  Retailer: `
You are RETAILER in IMPROVE mode.

Specialisation:
- Decide if a simple trade incentive is needed; suggest retailer/channel-specific tweaks.

Rules:
- Stay in trade/tailoring lane. Do NOT touch base_value.
- Read offer_state.trade_budget_mode before doing anything.
  - "DISABLED": trade_incentive_needed MUST be false and trade_incentive_options empty. Explain why the shopper offer stands alone and focus on sell-in notes instead.
  - "HARD_CAP"/"FLEXIBLE": only propose staff/store rewards (spiffs, display bonuses, store challenges). Never add shopper-facing discounts, coupons, “extra tickets per purchase”, or anything that tampers with the consumer value ladder. Reference offer_state.trade_budget when you cite spend.
- Keep incentives simple (one sentence a store manager can grasp) and specify scope (e.g., “Top 20 Dan’s stores”).
- If the brief already includes trade guidance (offer_state.trade_incentive_brief), respect it; it is not permission to layer extra consumer value.
- If you recommend no trade incentive, explain the rationale (range already secured, staff load too high, etc.).
- Value-Led Hero Overlay: If meta.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), emphasise that the guaranteed cashback is the sell-in hook and the hero prize is a premium bonus tier that helps the story. Do not ask for extra prize tiers to “earn” space; instead, focus on signage/claim clarity and staff workload.

JSON schema:
{
  "agent": "Retailer",
  "improvement_type": "RETAILER_UPGRADE",
  "trade_incentive_needed": true,
  "trade_incentive_options": [
    { "label": "...", "mechanic": "...", "scope": "...", "rationale": "..." }
  ],
  "recommended_trade_incentive_label": "...",
  "retailer_specific_tweaks": [
    { "retailer": "...", "tweak": "...", "reason": "..." }
  ],
  "must_fix": ["..."],
  "nice_to_have": ["..."]
}
`,
}

const BRUCE_PROMPT = `
You are BRUCE, the chair and final voice of Trudy-v4.

MODE: EVALUATE

You have four specialist agents:
- OfferIQ – offer, value, scale, prize ladder.
- StoryBrand – story engine, hero overlays, bridge prizes.
- Shopper – behaviour, friction, fairness, felt odds.
- Retailer – retailer & channel fit, store team reality.

You MUST obey the Mark Creative Constitution (all Laws):

{{CREATIVE_CONSTITUTION_TEXT_HERE}}

The user will pass you:
- brief, concept, ambition_setting, constitution,
- agents: array of specialist JSON outputs.

Your job:
- Read everything, resolve disagreements, apply the Constitution + ambition.
- Produce a single hard verdict with clear reasoning.
- Be blunt, not diplomatic.
- Ambition rules:
  - If ambition_setting === "BOLD", you must prefer the boldest viable option (hero overlay + strong cadence/value). Only recommend the safer path if you explicitly state why the bold route is commercially or operationally impossible, and flag that compromise in top_reasons/must_fix. Never bury a bold-but-better option.
  - If ambition_setting === "SAFE", keep to disciplined, proven mechanics; do not escalate value unless an agent proves it is mandatory.
- Hero cadence: when majors are so sparse that shoppers would never realistically experience them (e.g., <1 winner per 30 days), say so explicitly and either demand more hero depth or label the hero tier “PR-only”. Do not let a single hero masquerade as meaningful shopper value.
- Value-Led Hero Overlay: When meta?.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), treat the guaranteed value as the fairness engine and describe the hero as a premium limited draw layered on top. Accept end-of-promo cadence and shut down attempts to bolt on runner tiers purely for noise—your notes should emphasise clarity of the cashback/GWP instead.
- Cadence label "PR_THEATRE": When meta?.cadence_label === "PR_THEATRE", explicitly state the hero tier is a limited premium draw (weekly, fortnightly, or finale) and do NOT cite cadence as a structural flaw.
- Trade guardrail: a trade incentive is for retailers/staff only. If any agent invents shopper discounts/coupons under the guise of trade, call it out as value scope creep and insist that consumer value changes route through OfferIQ.

Output JSON ONLY:
{
  "verdict": "GO" | "ITERATE" | "KILL",
  "scores": {
    "objective_fit": 0-10,
    "hook_strength": 0-10,
    "mechanic_fit": 0-10,
    "prize_power_value": 0-10,
    "prize_odds_clarity": 0-10,
    "retailer_readiness": 0-10
  },
  "top_reasons": ["...", "...", "..."],
  "must_fix_items": ["...", "..."],
  "quick_wins": ["...", "..."],
  "benchmark_angle": "paragraph",
  "agent_snapshots": [
    { "agent": "OfferIQ", "verdict": "...", "headline": "..." },
    { "agent": "StoryBrand", "verdict": "...", "headline": "..." },
    { "agent": "Shopper", "verdict": "...", "headline": "..." },
    { "agent": "Retailer", "verdict": "...", "headline": "..." }
  ],
  "notes": "optional short note"
}

If agents disagree, explicitly state whose view you back and why.
`.trim()

const BRUCE_IMPROVE_PROMPT = `
You are BRUCE, the chair of Trudy-v4, now in IMPROVE mode.

Task:
- You have improvement JSON from OfferIQ, StoryBrand, Shopper, Retailer.
- Assemble 1–2 coherent upgrade packages (offer + hook + mechanic + trade support).
- Keep any existing hero overlay (e.g., premiere experience, makeover, signature trip) at the heart of the story unless every agent agrees it should be replaced.
- Pick a recommended option.

Output JSON ONLY:
{
  "upgrade_options": [
    {
      "label": "SAFE UPGRADE",
      "summary": "One-liner describing this package.",
      "offer": { "cashback": 0, "major_prizes": 0 },
      "mechanic": "Short shopper-facing mechanic summary.",
      "hooks": ["..."],
      "trade_incentive": "Short description if relevant.",
      "runner_up_prizes": [ { "count": 0, "value": 0, "description": "..." } ],
      "hero_overlay": "Name how the hero/story engine shows up in this option (e.g., Sir Guinness owners’ kit).",
      "why_this": ["Reason 1", "Reason 2"]
    }
  ],
  "recommended_option_label": "SAFE UPGRADE",
  "notes": "Optional note to the human."
}

Rules:
- Maximum 2 upgrade options.
- Cite which specialist inputs informed each option.
- When you add depth to the prize ladder, include runner_up_prizes with clear counts/descriptions.
- Always show how the hero/story engine is preserved (use hero_overlay field) unless every agent agreed to replace it.
- Value-Led Hero Overlay: When meta?.promo_mode === "VALUE_LED_HERO" (hero_role === "THEATRE"), keep runner_up_prizes empty, label the hero overlay as a premium bonus tier, and focus your summaries on the guaranteed value improvements.
- Use notes to flag dependencies or risks.
- Trade guardrail: only include trade_incentive text if Retailer supplied a staff/store program AND offer_state.trade_budget_mode !== "DISABLED". Never let a consumer discount sneak into the upgrade plan under “trade”.
`.trim()

function buildSpecialistPrompt(agent: SpecialistAgentName, constitution: string): string {
  return COMMON_SPECIALIST_BASE.replace(/{{AGENT_NAME}}/g, agent).replace('{{CREATIVE_CONSTITUTION_TEXT_HERE}}', constitution) +
    '\n\n' +
    SPECIALIST_SPECIALISATIONS[agent].trim()
}

function buildBrucePrompt(constitution: string): string {
  return BRUCE_PROMPT.replace('{{CREATIVE_CONSTITUTION_TEXT_HERE}}', constitution)
}

function buildImprovePrompt(agent: SpecialistAgentName, constitution: string): string {
  return COMMON_IMPROVE_BASE.replace(/{{AGENT_NAME}}/g, agent).replace('{{CREATIVE_CONSTITUTION_TEXT_HERE}}', constitution) +
    '\n\n' +
    IMPROVE_SPECIALISATIONS[agent].trim()
}

function buildBruceImprovePrompt(constitution: string): string {
  return BRUCE_IMPROVE_PROMPT.replace('{{CREATIVE_CONSTITUTION_TEXT_HERE}}', constitution)
}

function describeCadence(count: number | null | undefined, durationDays: number | null | undefined) {
  if (count == null || durationDays == null) return null
  const total = Number(count)
  const duration = Number(durationDays)
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(duration) || duration <= 0) return null
  const perDay = total / duration
  if (perDay <= 0) return null
  let text: string
  if (perDay >= 1) {
    const rounded = perDay >= 5 ? Math.round(perDay) : Math.round(perDay * 10) / 10
    text = `≈${rounded} winner${rounded === 1 ? '' : 's'}/day`
  } else {
    const daysPer = Math.max(1, Math.round(1 / perDay))
    text = `≈1 winner every ${daysPer} day${daysPer === 1 ? '' : 's'}`
  }
  return { perDay, text }
}

async function callSpecialistAgent(
  agent: SpecialistAgentName,
  input: MultiAgentEvaluationInput
): Promise<SpecialistAgentOutput> {
  const system = buildSpecialistPrompt(agent, input.constitutionText)
  const metaPayload = {
    ...input.meta,
    duration_days: input.meta.durationDays,
    total_prizes: input.meta.totalPrizes,
    expected_entries: input.meta.expectedEntries,
    cadence_label: input.meta.cadenceLabel,
    cadence_text: input.meta.cadenceText,
    mass_winner_count: input.meta.massWinnerCount,
    mass_prize_label: input.meta.massPrizeLabel,
    prize_pool_value: input.meta.prizePoolValue,
    promo_mode: input.meta.promoMode || null,
    hero_role: input.meta.heroRole || null,
    budget_mode: input.offerState?.budget_mode || input.meta.budgetMode || null,
    trade_budget_mode: input.offerState?.trade_budget_mode || input.meta.tradeBudgetMode || null,
    trade_budget_value: input.offerState?.trade_budget ?? input.meta.tradeBudgetValue ?? null,
    trade_incentive_brief: input.offerState?.trade_incentive_brief || input.meta.tradeIncentiveBrief || null,
    simple_ladder_preferred: input.meta.simpleLadderPreferred || null,
    liability_status: input.meta.liabilityStatus || null,
    hypothesis_flags: input.meta.hypothesisFlags || null,
    prize_facts: input.meta.prizeTruths || null,
  }
  const payload = {
    brief: input.brief,
    concept: input.concept,
    ambition_setting: input.ambitionSetting,
    constitution: input.constitutionText,
    meta: metaPayload,
    offer_state: input.offerState,
  }
  const response = await chat({
    system,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    model: SPECIALIST_MODEL,
    json: true,
    temperature: Number(process.env.EVAL_ROOM_SPECIALIST_TEMP ?? 0.35),
    max_output_tokens: Number(process.env.EVAL_ROOM_SPECIALIST_MAX_TOKENS ?? 1200),
    meta: { scope: `evaluation.room.${agent.toLowerCase()}` },
  })
  try {
    return JSON.parse(response) as SpecialistAgentOutput
  } catch (err) {
    console.error(`[multi-agent] Failed to parse ${agent} response`, err, response)
    throw err
  }
}

async function callBruce(
  input: MultiAgentEvaluationInput,
  agentOutputs: SpecialistAgentOutput[]
): Promise<BruceOutput> {
  const system = buildBrucePrompt(input.constitutionText)
  const payload = {
    brief: input.brief,
    concept: input.concept,
    ambition_setting: input.ambitionSetting,
    constitution: input.constitutionText,
    meta: input.meta,
    agents: agentOutputs,
  }
  const response = await chat({
    system,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    model: BRUCE_MODEL,
    json: true,
    temperature: Number(process.env.EVAL_ROOM_BRUCE_TEMP ?? 0.2),
    max_output_tokens: Number(process.env.EVAL_ROOM_BRUCE_MAX_TOKENS ?? 1800),
    meta: { scope: 'evaluation.room.bruce' },
  })
  try {
    return JSON.parse(response) as BruceOutput
  } catch (err) {
    console.error('[multi-agent] Failed to parse BRUCE response', err, response)
    throw err
  }
}

export async function runMultiAgentEvaluation(
  input: MultiAgentEvaluationInput
): Promise<MultiAgentEvaluationResult> {
  const agents: SpecialistAgentName[] = ['OfferIQ', 'StoryBrand', 'Shopper', 'Retailer']
  const specialistOutputs = await Promise.all(agents.map((agent) => callSpecialistAgent(agent, input)))
  const bruce = await callBruce(input, specialistOutputs)
  return { bruce, agents: specialistOutputs }
}

async function callImproveSpecialistAgent(
  agent: SpecialistAgentName,
  input: MultiAgentImprovementInput
): Promise<SpecialistImprovementOutput> {
  const system = buildImprovePrompt(agent, input.constitutionText)
  const metaPayload = {
    ...input.meta,
    duration_days: input.meta.durationDays,
    total_prizes: input.meta.totalPrizes,
    expected_entries: input.meta.expectedEntries,
    cadence_label: input.meta.cadenceLabel,
    cadence_text: input.meta.cadenceText,
    mass_winner_count: input.meta.massWinnerCount,
    mass_prize_label: input.meta.massPrizeLabel,
    prize_pool_value: input.meta.prizePoolValue,
    promo_mode: input.meta.promoMode || null,
    hero_role: input.meta.heroRole || null,
    budget_mode: input.offerState?.budget_mode || input.meta.budgetMode || null,
    trade_budget_mode: input.offerState?.trade_budget_mode || input.meta.tradeBudgetMode || null,
    trade_budget_value: input.offerState?.trade_budget ?? input.meta.tradeBudgetValue ?? null,
    trade_incentive_brief: input.offerState?.trade_incentive_brief || input.meta.tradeIncentiveBrief || null,
    simple_ladder_preferred: input.meta.simpleLadderPreferred || null,
    liability_status: input.meta.liabilityStatus || null,
    hypothesis_flags: input.meta.hypothesisFlags || null,
    prize_facts: input.meta.prizeTruths || null,
  }
  const payload = {
    brief: input.brief,
    concept: input.concept,
    ambition_setting: input.ambitionSetting,
    constitution: input.constitutionText,
    meta: metaPayload,
    offer_state: input.offerState,
    evaluation: {
      bruce: input.evaluation.bruce,
      specialist: input.evaluation.agents.find((entry) => entry.agent === agent) || null,
    },
  }
  const response = await chat({
    system,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    model: SPECIALIST_MODEL,
    json: true,
    temperature: Number(process.env.EVAL_ROOM_IMPROVE_SPECIALIST_TEMP ?? 0.35),
    max_output_tokens: Number(process.env.EVAL_ROOM_IMPROVE_SPECIALIST_MAX_TOKENS ?? 1200),
    meta: { scope: `improve.room.${agent.toLowerCase()}` },
  })
  try {
    return JSON.parse(response) as SpecialistImprovementOutput
  } catch (err) {
    console.error(`[multi-agent-improve] Failed to parse ${agent} response`, err, response)
    throw err
  }
}

async function callBruceImprove(
  input: MultiAgentImprovementInput,
  agentOutputs: SpecialistImprovementOutput[]
): Promise<BruceImprovementOutput> {
  const system = buildBruceImprovePrompt(input.constitutionText)
  const payload = {
    brief: input.brief,
    concept: input.concept,
    ambition_setting: input.ambitionSetting,
    evaluation: input.evaluation,
    meta: input.meta,
    offer_state: input.offerState,
    improvements: agentOutputs,
  }
  const response = await chat({
    system,
    messages: [{ role: 'user', content: JSON.stringify(payload) }],
    model: BRUCE_MODEL,
    json: true,
    temperature: Number(process.env.EVAL_ROOM_IMPROVE_BRUCE_TEMP ?? 0.2),
    max_output_tokens: Number(process.env.EVAL_ROOM_IMPROVE_BRUCE_MAX_TOKENS ?? 1800),
    meta: { scope: 'improve.room.bruce' },
  })
  try {
    return JSON.parse(response) as BruceImprovementOutput
  } catch (err) {
    console.error('[multi-agent-improve] Failed to parse BRUCE improvement response', err, response)
    throw err
  }
}

export async function runMultiAgentImprovement(
  input: MultiAgentImprovementInput
): Promise<MultiAgentImprovementResult> {
  const agents: SpecialistAgentName[] = ['OfferIQ', 'StoryBrand', 'Shopper', 'Retailer']
  const rawOutputs = await Promise.all(agents.map((agent) => callImproveSpecialistAgent(agent, input)))
  const outputs = rawOutputs.map((entry) =>
    entry.agent === 'Retailer'
      ? sanitizeRetailerImprovementOutput(entry as RetailerImproveOutput, input.offerState, input.meta)
      : entry
  )
  const bruce = await callBruceImprove(input, outputs)
  const offerIq = outputs.find((entry) => entry.agent === 'OfferIQ')
  const hypStatus =
    offerIq && Array.isArray((offerIq as OfferIQImproveOutput).hypothesis_status)
      ? (offerIq as OfferIQImproveOutput).hypothesis_status
      : undefined
  const durationDays = input.meta?.durationDays && Number(input.meta.durationDays) > 0 ? Number(input.meta.durationDays) : null
  const simpleLadder = Boolean(input.meta?.simpleLadderPreferred)
  let cadenceSummary: CadenceSummaryEntry[] | undefined
  if (durationDays && offerIq && Array.isArray((offerIq as OfferIQImproveOutput).options)) {
    const canonicalOptions = (offerIq as OfferIQImproveOutput).options
    const summaries = canonicalOptions
      .map((opt): CadenceSummaryEntry | null => {
        const majors = simpleLadder
          ? { perDay: null, text: 'Drawn at the end of the promotion (PR-only theatre)' }
          : describeCadence(opt?.major_prize_count ?? null, durationDays)
        const runners = simpleLadder ? null : describeCadence(opt?.runner_up_prize_count ?? null, durationDays)
        if (!majors && !runners) return null
        return {
          label: opt?.label || 'OPTION',
          majors_per_day: majors?.perDay ?? null,
          majors_text: majors?.text,
          runners_per_day: runners?.perDay ?? null,
          runners_text: runners?.text,
        }
      })
      .filter((entry): entry is CadenceSummaryEntry => Boolean(entry))
    if (summaries.length) cadenceSummary = summaries
  }
  return {
    bruce,
    agents: outputs,
    hypothesis_status: hypStatus && hypStatus.length ? hypStatus : undefined,
    cadence_summary: cadenceSummary,
  }
}

function sanitizeRetailerImprovementOutput(
  output: RetailerImproveOutput,
  offerState: OfferState,
  meta: MultiAgentMeta
): RetailerImproveOutput {
  const tradeMode = offerState?.trade_budget_mode || meta.tradeBudgetMode || 'DISABLED'
  const clone: RetailerImproveOutput = {
    ...output,
    trade_incentive_options: Array.isArray(output.trade_incentive_options) ? [...output.trade_incentive_options] : [],
    retailer_specific_tweaks: Array.isArray(output.retailer_specific_tweaks) ? output.retailer_specific_tweaks : [],
    must_fix: Array.isArray(output.must_fix) ? output.must_fix : [],
    nice_to_have: Array.isArray(output.nice_to_have) ? output.nice_to_have : [],
  }
  if (tradeMode === 'DISABLED') {
    if (clone.trade_incentive_options.length || clone.trade_incentive_needed) {
      console.warn('[retailer] Dropping trade incentives because trade budget is disabled.')
    }
    clone.trade_incentive_needed = false
    clone.trade_incentive_options = []
    clone.recommended_trade_incentive_label = null
    return clone
  }
  const filtered = clone.trade_incentive_options.filter((option) => !looksConsumerFacing(option))
  if (filtered.length !== clone.trade_incentive_options.length) {
    console.warn('[retailer] Filtered consumer-facing trade incentives.', clone.trade_incentive_options)
  }
  clone.trade_incentive_options = filtered
  if (!filtered.length) {
    clone.trade_incentive_needed = false
    clone.recommended_trade_incentive_label = null
  } else if (
    clone.recommended_trade_incentive_label &&
    !filtered.some((opt) => opt?.label === clone.recommended_trade_incentive_label)
  ) {
    clone.recommended_trade_incentive_label = filtered[0]?.label || null
  }
  return clone
}

const CONSUMER_TRADE_PATTERNS = [
  /\bshoppers?\b/i,
  /\bcustomers?\b/i,
  /\bconsumer\b/i,
  /\bnext purchase\b/i,
  /\bevery purchase\b/i,
  /\bper purchase\b/i,
  /\bper receipt\b/i,
  /\bper bottle\b/i,
  /\bper pack\b/i,
  /\bdiscount\b/i,
  /\bvoucher\b/i,
  /\bcoupon\b/i,
  /\bcash\s*back\b/i,
  /\$ ?\d+\s*off/i,
  /\bdouble (?:tickets|passes)\b/i,
  /\bchance to win\b/i,
]

function looksConsumerFacing(option: { label?: string; mechanic?: string; scope?: string; rationale?: string }): boolean {
  const haystack = [option?.label, option?.mechanic, option?.scope, option?.rationale]
    .map((part) => String(part || '').toLowerCase())
    .join(' ')
  if (!haystack.trim()) return false
  return CONSUMER_TRADE_PATTERNS.some((pattern) => pattern.test(haystack))
}
