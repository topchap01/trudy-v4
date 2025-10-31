import type { CampaignContext } from './context.js'
import type { ResearchPack } from './research.js'
import crypto from 'crypto'

type Orchestrator = 'evaluation' | 'strategist' | 'synthesis'

export type CampaignStyleSpec = {
  persona: string
  toneDirectives: string[]
  structuralDirectives: Record<Orchestrator, string[]>
  mustInclude: string[]
  avoidPhrases: string[]
  lexiconHints: string[]
}

const DEFAULT_TONE = [
  'Keep language grounded in Australian vernacular—plain-spoken, commercially sharp.',
  'Avoid generic marketing tropes. Each paragraph should feel crafted for this brand.',
]

function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0
  const hash = crypto.createHash('sha1').update(seed).digest()
  const value = hash.readUInt32BE(0)
  return value % length
}

function collectInsights(research: ResearchPack | null, limit = 3): string[] {
  if (!research) return []
  const lines: string[] = []
  const dossier = research.dossier
  if (dossier) {
    const order: Array<[keyof NonNullable<typeof dossier>, string]> = [
      ['shopperTensions', 'shopper tension'],
      ['brandTruths', 'brand truth'],
      ['retailerReality', 'retailer reality'],
      ['competitorMoves', 'competitor move'],
      ['categorySignals', 'category signal'],
    ]
    for (const [key, label] of order) {
      for (const entry of (dossier as any)[key] || []) {
        const text = String(entry?.text || '').trim()
        if (!text) continue
        const source = String(entry?.source || '').trim()
        lines.push(`${label}: ${text}${source ? ` (${source})` : ''}`)
        if (lines.length >= limit) return lines
      }
    }
  }
  const insights = research.insights
  if (insights) {
    const buckets: Array<keyof typeof insights> = ['audience', 'retailers', 'competitors', 'signals', 'brand', 'market']
    for (const bucket of buckets) {
      for (const entry of (insights as any)[bucket] || []) {
        const text = String(entry?.text || '').trim()
        if (!text) continue
        const source = String(entry?.source || '').trim()
        lines.push(`${bucket.slice(0, 1).toUpperCase()}${bucket.slice(1)}: ${text}${source ? ` (${source})` : ''}`)
        if (lines.length >= limit) return lines
      }
    }
  }
  return lines
}

function industryTone(category: string | null): string[] {
  const cat = (category || '').toLowerCase()
  if (cat.includes('beer') || cat.includes('alcohol') || cat.includes('beverage')) {
    return [
      'Channel the cadence of a pub leader: confident, quick-witted, steeped in ritual.',
      'Reference the theatre of the pour or the shared round when it supports the argument.',
    ]
  }
  if (cat.includes('ice cream') || cat.includes('dessert')) {
    return [
      'Balance indulgence with practicality—make the treats feel joyful without drifting into whimsy.',
      'Surface sensory cues (texture, serving moment) when anchoring shopper behaviour.',
    ]
  }
  if (cat.includes('computer') || cat.includes('tech') || cat.includes('electronics')) {
    return [
      'Write like a pragmatic product strategist—precise, finance-aware, focused on governance.',
      'Highlight proof-points (verification, escrow, fulfilment) with crisp, reassuring language.',
    ]
  }
  return []
}

function rewardTone(spec: any): { tone: string[]; lexicon: string[] } {
  const tone: string[] = []
  const lexicon: string[] = []
  if (spec?.cashback) {
    tone.push('Make the conditional cashback mechanics feel concrete—dates, proof, payout cadence.')
    lexicon.push('conditional cashback', 'escrow', 'graduation verification')
  }
  if (spec?.gwp) {
    tone.push('Spotlight the guaranteed gift as a brag-worthy keepsake; show how it lands instantly.')
    const item = spec.gwp?.item ? String(spec.gwp.item) : 'gift-with-purchase'
    lexicon.push(item)
  }
  if (spec?.majorPrizeOverlay) {
    tone.push('Hero overlay must read as theatre, not an afterthought—tie it to retailer fame or earned reach.')
  }
  if (spec?.assuredItems?.length) {
    lexicon.push(...spec.assuredItems.slice(0, 3).map((item: any) => String(item)))
  }
  return { tone, lexicon }
}

function calendarTone(spec: any): string[] {
  const out: string[] = []
  const calendar = (spec?.calendarTheme || '').toLowerCase()
  if (calendar.includes('st patrick')) {
    out.push('Infuse Gaelic energy without cliché—nod to pub circuits, green rituals, and shared storytelling.')
  }
  if (calendar.includes('spring') || calendar.includes('summer')) {
    out.push('Lean into seasonal momentum—contrast the promotion with competitor noise that peaks the same season.')
  }
  return out
}

export function buildCampaignStyleSpec(
  ctx: CampaignContext,
  orchestrator: Orchestrator,
  research: ResearchPack | null,
  extra: { briefSpec?: any; analystHighlights?: string[] } = {}
): CampaignStyleSpec {
  const spec = extra.briefSpec || ctx.briefSpec || {}
  const tone: string[] = [...DEFAULT_TONE]
  tone.push(...industryTone(ctx.category || null))

  const reward = rewardTone(spec)
  tone.push(...reward.tone)
  tone.push(...calendarTone(spec))

  const persona = (() => {
    if ((ctx.category || '').toLowerCase().includes('beer')) return 'Pub floor general'
    if ((ctx.category || '').toLowerCase().includes('dessert')) return 'Treats growth strategist'
    if ((ctx.category || '').toLowerCase().includes('computer')) return 'Student acquisition architect'
    return 'Shopper marketing consigliere'
  })()

  const insights = collectInsights(research, 4)
  const analyst = (extra.analystHighlights || []).map((line) => line.trim()).filter(Boolean)
  const mustInclude = [...new Set([...insights.slice(0, 3), ...analyst.slice(0, 2)])]

  const avoidPhrases = [
    'In this moment',
    'Firstly',
    'Ultimately',
    'Zeitgeist',
    'Moat',
    'Unlocking synergy',
  ]

  const structural: Record<Orchestrator, string[]> = {
    evaluation: [
      'Structure: open with a vivid scene featuring the priority shopper, pivot to retailer politics, land on the recommendation and guardrails without using headings.',
      'Structure: three movements—1) Shopper reality, 2) Brand/retailer stakes, 3) Decision and measurement. Use connective clauses to transition; no bullet points.',
      'Structure: narrate like a board memo—thesis statement, then two supporting “proof” mini-stories, then a close that names the KPI and cadence.',
    ],
    strategist: [
      'Frame the scenarios as cinematic storyboards: opening beat, tension, resolution. Finish with one measurement sentence.',
      'Lay out three plays: defend, stretch, disrupt. Each should cite a specific shopper or retailer cue from the research.',
      'Use a “What if / So what / Guardrail” cadence for each scenario. Keep it punchy, 3-4 sentences per scenario.',
    ],
    synthesis: [
      'Tell the story as a one-night campaign war room: the briefing, the field move, the scoreboard. Use present tense when describing activation.',
      'Write a memo from the strategist to the CMO—start with the positioning, then the move, then the measurement focus.',
      'Narrate a before/after contrast: how the shopper feels today vs. with this idea, then close with retailer confidence building.',
    ],
  }

  const lexiconHints = [...new Set([...(reward.lexicon || []), ...(ctx.audienceProfile?.signals || []).slice(0, 3)])]

  return {
    persona,
    toneDirectives: tone.filter(Boolean),
    structuralDirectives: structural,
    mustInclude,
    avoidPhrases,
    lexiconHints,
  }
}

export function pickStructure(style: CampaignStyleSpec, orchestrator: Orchestrator, seed: string): string {
  const options = style.structuralDirectives[orchestrator] || []
  if (!options.length) return ''
  const index = seededIndex(`${seed}:${orchestrator}`, options.length)
  return options[index]
}

export function enforceLexicon(finalText: string, style: CampaignStyleSpec): string {
  const missing: string[] = []
  for (const phrase of style.mustInclude) {
    if (!phrase) continue
    if (!finalText.toLowerCase().includes(phrase.toLowerCase())) {
      missing.push(phrase)
    }
  }
  if (!missing.length) return finalText
  const appendix = missing
    .map((line) => `• ${line}`)
    .join('\n')
  return `${finalText.trim()}\n\nKey campaign-specific directives:\n${appendix}`
}

export function stripAvoided(finalText: string, style: CampaignStyleSpec): string {
  let output = finalText
  for (const phrase of style.avoidPhrases) {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    output = output.replace(regex, '')
  }
  return output.replace(/\n{3,}/g, '\n\n').trim()
}
