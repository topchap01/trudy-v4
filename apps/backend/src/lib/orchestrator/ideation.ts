// apps/backend/src/lib/orchestrator/ideation.ts
import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { renderBriefSnapshot } from '../context.js'
import { resolveModel } from '../models.js'

export type IdeationTier = 'SAFE' | 'STEAL' | 'HERESY'

export type IdeationIdea = {
  tier: IdeationTier
  hook: string
  what: string
  why: string
  retailRun: string
  xForY: string
  operatorCards: string[]
  legalVariant?: string | null
}

export type IdeationAgentResult = {
  agent: IdeationAgent
  ideas: IdeationIdea[]
}

export type HarnessOutput = {
  selectedHook: string
  point: string
  move: string
  risk: string
  oddsCadence: string
  retailerLine: string
  legalVariant?: string | null
  sourceIdea?: {
    agent: IdeationAgent
    tier: IdeationTier
    hook: string
  }
}

export type IdeationResult = {
  unboxed: IdeationAgentResult[]
  harness: HarnessOutput | null
}

type IdeationOptions = {
  agents?: IdeationAgent[]
}

type IdeationAgent =
  | 'Cross-Pollinator'
  | 'Mechanic Alchemist'
  | 'NameSmith'
  | 'Contrarian'
  | 'Stunt Producer'

const IDEATION_AGENTS: IdeationAgent[] = [
  'Cross-Pollinator',
  'Mechanic Alchemist',
  'NameSmith',
  'Contrarian',
  'Stunt Producer',
]

const OPERATOR_CARDS = [
  'Personalise at scale (names, numbers, avatars)',
  'Ownership sliver (symbolic share, naming rights, co-ownership)',
  'Cashback / negative price (money boomerang, get paid to try)',
  'Cadence illusion (winner-an-hour, streaks, rolling jackpots)',
  'Ticketisation (upgrades, golden ticket, mystery tiers)',
  'Collection pressure (sets, seasons, swaps)',
  'Cross-category steal (lift mechanic from another industry)',
]

const MARK_LENSES = [
  'Cashback “money boomerang”: pay now, brand pays you back later (negative price/conditional rebate).',
  '“Name a Coke” mass personalisation right at consumption.',
  '“Sir Guinness” symbolic co-ownership with live narrative, rituals, updates.',
]

const BASE_SYSTEM = [
  'You are part of CREATE_UNBOXED. Ideate like Mark Alexander: lateral, audacious, anti-safe.',
  'Decoding: temperature 1.1, top_p 0.98, presence_penalty 0.6, frequency_penalty 0.3.',
  'Prefer mechanics people have not run. Steal shamelessly from other categories.',
  'Every idea must cite at least two Operator Cards.',
  'If an idea is edgy, also return a “legalVariant” that tones it down.',
  'Return JSON only, matching the schema you were given.',
].join('\n')

const AGENT_PERSONAS: Record<IdeationAgent, string> = {
  'Cross-Pollinator':
    'Agent profile: Cross-Pollinator. You raid other industries and transpose their loyalty mechanics, hype tricks, and behavioural loops into this brand’s world.',
  'Mechanic Alchemist':
    'Agent profile: Mechanic Alchemist. You fuse multiple promotion mechanics (cashback × instant win × collectible pass) into new hybrids.',
  'NameSmith':
    'Agent profile: NameSmith. You create naming, identity, and ownership plays that make the product feel personal, scarce, or ritualistic.',
  'Contrarian':
    'Agent profile: Contrarian. You attack sacred cows, ask why the obvious idea hasn’t been run, and ship a version that could actually run.',
  'Stunt Producer':
    'Agent profile: Stunt Producer. You build PR-able theatre, symbolic ownership, live updates, and rituals that brands can point cameras at.',
}

const IDEA_SCHEMA = `
Return strict JSON with shape:
{
  "agent": "Cross-Pollinator" | "Mechanic Alchemist" | "NameSmith" | "Contrarian" | "Stunt Producer",
  "ideas": [
    {
      "tier": "SAFE" | "STEAL" | "HERESY",
      "hook": string,
      "what": string,
      "why": string,
      "retailRun": string,
      "xForY": string,
      "operatorCards": string[],
      "legalVariant": string | null
    },
    ...
  ]
}
`

const HARNESS_SYSTEM = [
  'You are BRUCE (HARNESS). Commercialise the strongest UNBOXED concept.',
  'Output JSON only.',
  'Format: {"selectedHook": "...","point": "...","move": "...","risk": "...","oddsCadence": "...","retailerLine": "...","legalVariant": "...","sourceIdea":{"agent":"...","tier":"...","hook":"..."}}',
  '≤120 words across point/move/risk.',
  'OddsCadence = simple odds & winner rhythm.',
  'Retailer line = till + POS talking point.',
  'If concept is already clean, legalVariant may be null.',
].join('\n')

const HARNESS_PROMPT = (ideas: IdeationAgentResult[]) => {
  const lines: string[] = []
  ideas.forEach((agent) => {
    agent.ideas.forEach((idea, index) => {
      lines.push(
        [
          `Agent: ${agent.agent}`,
          `Tier: ${idea.tier}`,
          `Hook: ${idea.hook}`,
          `What: ${idea.what}`,
          `Why: ${idea.why}`,
          `Retail run: ${idea.retailRun}`,
          `Operator cards: ${idea.operatorCards.join(', ') || 'n/a'}`,
          `X-for-Y: ${idea.xForY}`,
          `Legal variant: ${idea.legalVariant || 'n/a'}`,
        ].join('\n')
      )
      lines.push('---')
    })
  })
  return [
    'Here are candidate concepts from CREATE_UNBOXED.',
    'Choose the one with the best upside and make it retail-ready.',
    lines.join('\n'),
  ].join('\n\n')
}

function campaignSynopsis(ctx: CampaignContext) {
  const parts = [
    `Brand: ${ctx.clientName || ctx.briefSpec?.brand || 'Unknown'}`,
    `Campaign: ${ctx.title}`,
    `Market: ${ctx.market || 'AU'}`,
    `Category: ${ctx.category || 'n/a'}`,
    ctx.briefSpec?.hook ? `Brief hook: ${ctx.briefSpec.hook}` : '',
    ctx.briefSpec?.mechanicOneLiner ? `Mechanic: ${ctx.briefSpec.mechanicOneLiner}` : '',
    ctx.briefSpec?.typeOfPromotion ? `Promotion type: ${ctx.briefSpec.typeOfPromotion}` : '',
    ctx.briefSpec?.rewardPosture ? `Reward posture: ${ctx.briefSpec.rewardPosture}` : '',
  ]
  return parts.filter(Boolean).join(' | ')
}

function agentOperatorCardText(agent: IdeationAgent) {
  return OPERATOR_CARDS.map((card) => `- ${card}`).join('\n')
}

function agentPrompt(agent: IdeationAgent, ctx: CampaignContext, brief: string) {
  const synopsis = campaignSynopsis(ctx)
  return [
    AGENT_PERSONAS[agent],
    '',
    'Operator cards (choose at least two per idea):',
    agentOperatorCardText(agent),
    '',
    'Mark lenses to mutate:',
    MARK_LENSES.map((lens) => `- ${lens}`).join('\n'),
    '',
    IDEA_SCHEMA,
    '',
    'MANDATES:',
    '- Output exactly three concepts.',
    '- Concept 1 tier = SAFE (board-comfortable but fresh).',
    '- Concept 2 tier = STEAL (blatant cross-category lift).',
    '- Concept 3 tier = HERESY (break a sacred cow; still runnable).',
    '- Provide "xForY" to explain cross-category steal: “[Mechanic] from [Category A] applied to [Category B] because [human job]”.',
    '- Add "legalVariant" when the main idea feels edgy; otherwise set to null.',
    '- Keep what/why/retailRun concise but concrete (≤80 words each).',
    '- Use only plain text; no markdown beyond JSON.',
    '',
    'Campaign synopsis:',
    synopsis,
    '',
    'Brief snapshot:',
    brief,
  ].join('\n')
}

function parseAgentResult(agent: IdeationAgent, raw: string): IdeationAgentResult {
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Failed to parse JSON for ${agent}`)
  }
  const ideas: IdeationIdea[] = Array.isArray(parsed?.ideas)
    ? parsed.ideas.map((idea: any) => ({
        tier: (String(idea?.tier || '').toUpperCase() as IdeationTier) || 'SAFE',
        hook: String(idea?.hook || '').trim(),
        what: String(idea?.what || '').trim(),
        why: String(idea?.why || '').trim(),
        retailRun: String(idea?.retailRun || '').trim(),
        xForY: String(idea?.xForY || '').trim(),
        operatorCards: Array.isArray(idea?.operatorCards)
          ? idea.operatorCards.map((card: any) => String(card || '').trim()).filter(Boolean)
          : [],
        legalVariant: idea?.legalVariant ? String(idea.legalVariant).trim() : null,
      }))
    : []
  return {
    agent: parsed?.agent || agent,
    ideas: ideas.filter((idea) => idea.hook && idea.what),
  }
}

function parseHarness(raw: string): HarnessOutput {
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Failed to parse HARNESS output JSON')
  }
  return {
    selectedHook: String(parsed?.selectedHook || '').trim(),
    point: String(parsed?.point || '').trim(),
    move: String(parsed?.move || '').trim(),
    risk: String(parsed?.risk || '').trim(),
    oddsCadence: String(parsed?.oddsCadence || '').trim(),
    retailerLine: String(parsed?.retailerLine || '').trim(),
    legalVariant: parsed?.legalVariant ? String(parsed.legalVariant).trim() : null,
    sourceIdea: parsed?.sourceIdea
      ? {
          agent: parsed.sourceIdea.agent,
          tier: parsed.sourceIdea.tier,
          hook: parsed.sourceIdea.hook,
        }
      : undefined,
  }
}

export async function runIdeation(
  ctx: CampaignContext,
  opts: IdeationOptions = {}
): Promise<IdeationResult> {
  const agents = opts.agents?.length ? opts.agents : IDEATION_AGENTS
  const brief = renderBriefSnapshot(ctx) || '_no brief snapshot available_'
  const model = resolveModel(process.env.MODEL_IDEATION || process.env.MODEL_DEFAULT, undefined, 'gpt-4o')

  const unboxed: IdeationAgentResult[] = []
  for (const agent of agents) {
    let attempt = 0
    let parsed: IdeationAgentResult | null = null
    let lastResponse = ''
    while (attempt < 3 && !parsed) {
      const prompt = attempt === 0
        ? agentPrompt(agent, ctx, brief)
        : `Rewrite the following output as VALID JSON that matches the schema. Do not add commentary.\n\n${lastResponse}`

      const response = await chat({
        model,
        temperature: 1.1,
        top_p: 0.98,
        max_output_tokens: 1200,
        system: BASE_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
        meta: { scope: `ideation.unboxed.${agent}`, campaignId: ctx.id, attempt },
        presence_penalty: 0.6,
        frequency_penalty: 0.3,
        json: true,
      })
      lastResponse = response
      try {
        parsed = parseAgentResult(agent, response)
      } catch (err) {
        attempt += 1
      }
    }
    if (!parsed) throw new Error(`Failed to obtain valid JSON from ${agent}`)
    unboxed.push(parsed)
  }

  const harnessModel = resolveModel(process.env.MODEL_HARNESS || process.env.MODEL_DEFAULT, undefined, 'gpt-4o-mini')
  const harnessRaw = await chat({
    model: harnessModel,
    temperature: 0.4,
    top_p: 0.9,
    max_output_tokens: 600,
    system: HARNESS_SYSTEM,
    messages: [{ role: 'user', content: HARNESS_PROMPT(unboxed) }],
    meta: { scope: 'ideation.harness', campaignId: ctx.id },
    json: true,
  })
  const harness = parseHarness(harnessRaw)

  return { unboxed, harness }
}
