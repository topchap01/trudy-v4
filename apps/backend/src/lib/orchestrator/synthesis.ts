import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { renderBriefSnapshot } from '../context.js'
import { resolveModel } from '../models.js'
import { getPlaybookSnippets } from '../knowledge-grid.js'
import { loadCampaignRules } from '../campaign-rules.js'
import { polishText } from '../polish.js'
import { prisma } from '../../db/prisma.js'
import { buildCampaignStyleSpec, pickStructure, enforceLexicon, stripAvoided } from '../style-spec.js'
import type { ResearchPack } from '../research.js'

type SynthesisInputs = {
  framing: string
  evaluation: string
  ideas?: string
  opinion: string
  strategist?: string
  offerIQ?: any
  evaluationMeta?: any
}

const gatherInsightLines = (research: any, limit = 5): string[] => {
  const lines: string[] = []
  const dossier = research?.dossier
  if (dossier) {
    const sections: Array<[string, string]> = [
      ['brandTruths', 'Brand truth'],
      ['shopperTensions', 'Shopper tension'],
      ['retailerReality', 'Retailer reality'],
      ['competitorMoves', 'Competitor move'],
      ['categorySignals', 'Category signal'],
      ['benchmarks', 'Benchmark'],
    ]
    for (const [key, label] of sections) {
      for (const entry of dossier[key] || []) {
        const text = (entry?.text || '').trim()
        if (!text) continue
        const source = (entry?.source || '').trim()
        lines.push(`${label}: ${text}${source ? ` (${source})` : ''}`)
        if (lines.length >= limit) return lines
      }
    }
  }
  const legacy = research?.insights
  if (legacy) {
    const buckets = ['brand', 'audience', 'retailers', 'market', 'competitors', 'signals'] as const
    for (const bucket of buckets) {
      for (const entry of legacy[bucket] || []) {
        const text = (entry?.text || '').trim()
        if (!text) continue
        const source = (entry?.source || '').trim()
        lines.push(source ? `${text} (${source})` : text)
        if (lines.length >= limit) return lines
      }
    }
  }
  return lines
}

const toNumber = (value: any): number | null => {
  if (value == null) return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

const parseDateLike = (value: any): Date | null => {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'string') {
    const dt = new Date(value)
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  return null
}

const daysBetweenInclusive = (start: Date | null, end: Date | null): number | null => {
  if (!start || !end) return null
  const diff = end.getTime() - start.getTime()
  if (!Number.isFinite(diff)) return null
  const days = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
  return days > 0 ? days : null
}

async function fetchLatestHarness(campaignId: string) {
  const row = await prisma.output.findFirst({
    where: { campaignId, type: 'ideationHarness' },
    orderBy: { createdAt: 'desc' },
  })
  if (!row?.content) return null
  try {
    return JSON.parse(row.content)
  } catch {
    return null
  }
}

export async function runSynthesis(ctx: CampaignContext, inputs: SynthesisInputs) {
  const model = resolveModel(
    process.env.MODEL_SYNTHESIS,
    process.env.MODEL_EVAL,
    process.env.MODEL_DEFAULT,
    'gpt-4.1'
  )

  const spec: any = ctx.briefSpec || {}
  const rules = await loadCampaignRules(ctx)
  const briefSnapshot = renderBriefSnapshot(ctx) || '_none_'

  const retailers = rules.retailers
  const retailerLine = retailers.length ? retailers.slice(0, 6).join(', ') : 'n/a'

  const promotionType = rules.promotionType
  const assuredItemsList = Array.isArray(spec.assuredItems)
    ? spec.assuredItems.map((item: any) => String(item || '').trim()).filter(Boolean)
    : (typeof spec.assuredItems === 'string'
        ? String(spec.assuredItems).split(/[,•\n]+/).map((item) => item.trim()).filter(Boolean)
        : [])
  const assuredValue = Boolean(
    spec.cashback ||
    spec.gwp ||
    spec.assuredValue ||
    assuredItemsList.length > 0
  )
  const ideationHarness = await fetchLatestHarness(ctx.id)
  const heroPrize = typeof spec.heroPrize === 'string' ? spec.heroPrize.trim() : ''
  const heroPrizeCount = toNumber(spec.heroPrizeCount ?? spec.hero_prize_count ?? spec.heroPrize_count ?? null)
  const totalWinners = rules.prize.totalWinners
  const ticketPool = rules.prize.ticketPool
  const isDoublePassReward = rules.prize.shareableReward
  const shareableAlternate = rules.prize.shareableAlternateWinnerCount
  const shareableWinnerCount = shareableAlternate ?? (ticketPool != null ? Math.max(1, Math.round(ticketPool / 2)) : null)

  const start = parseDateLike(ctx.startDate || spec.startDate || null)
  const end = parseDateLike(ctx.endDate || spec.endDate || null)
  const durationDays = daysBetweenInclusive(start, end)
  const winnersPerDay = totalWinners && durationDays ? totalWinners / durationDays : null

  const offerIQ = inputs.offerIQ || inputs.evaluationMeta?.offerIQ || inputs.evaluationMeta?.ui?.offerIQ || null
  const evaluationMeta = inputs.evaluationMeta || {}
  const research = (evaluationMeta.ui?.research || evaluationMeta.research || null) as ResearchPack | null
  const style = buildCampaignStyleSpec(ctx, 'synthesis', research, { briefSpec: spec })
  const structureDirective = pickStructure(style, 'synthesis', ctx.id)
  const researchHighlights = gatherInsightLines(research, 5)
  const cadenceSnippets = await getPlaybookSnippets({ promoType: promotionType, useCase: 'CADENCE_STATEMENT', tone: 'planner' })
  const headlineSnippets = await getPlaybookSnippets({ promoType: promotionType, useCase: 'VALUE_HEADLINE', tone: 'retail_deck' })

  const strategistNote = (inputs.strategist || '').trim().split('\n').filter(Boolean).slice(0, 6).join(' ')
  const evaluationNote = (inputs.evaluation || '').trim().split('\n').filter(Boolean).slice(0, 6).join(' ')
  const framingNote = (inputs.framing || '').trim().split('\n').filter(Boolean).slice(0, 6).join(' ')
  const opinionNote = (inputs.opinion || '').trim().split('\n').filter(Boolean).slice(0, 6).join(' ')
  const ideasNote = (inputs.ideas || '').trim().split('\n').filter(Boolean).slice(0, 6).join(' ')

  const safe = (value: any): string => {
    if (value == null) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try { return JSON.stringify(value) } catch { return String(value) }
  }

  const contextLines: string[] = []
  const benchmarks = rules.benchmarks
  contextLines.push(`Campaign: ${safe(ctx.clientName) || spec.brand || 'Unknown'} — ${safe(ctx.title) || 'Untitled'}`)
  contextLines.push(`Market: ${safe(ctx.market) || 'AU'} (code ${rules.marketCode}) | Category: ${safe(ctx.category) || 'n/a'} | Position: ${safe(ctx.brandPosition) || 'UNKNOWN'}`)
  contextLines.push(`Retailers: ${retailerLine}`)
  contextLines.push(`Promotion type: ${promotionType} | Assured value: ${assuredValue ? 'Yes' : 'No'}`)
  if (ctx.audienceProfile?.summary) contextLines.push(`Primary audience: ${safe(ctx.audienceProfile.summary)}`)
  if (Array.isArray(ctx.audienceProfile?.signals) && ctx.audienceProfile!.signals.length) {
    contextLines.push(`Audience cues: ${ctx.audienceProfile!.signals.slice(0, 3).join(', ')}`)
  }
  const convenienceFocus = Array.isArray(spec.activationChannels)
    ? spec.activationChannels.some((ch: any) => String(ch || '').toUpperCase() === 'CONVENIENCE')
    : false
  if (convenienceFocus) {
    contextLines.push('Remember the on-the-way-home convenience shopper alongside the planned grocery mission.')
  }
  if (heroPrize) contextLines.push(`Hero prize: ${heroPrize}${heroPrizeCount ? ` x${heroPrizeCount}` : ''}`)
  if (totalWinners != null) contextLines.push(`Total winners (brief): ${totalWinners}${winnersPerDay ? ` (~${winnersPerDay.toFixed(1)} per day)` : ''}`)
  if (assuredValue) {
    const cbPercent =
      spec.cashback && typeof (spec.cashback as any).percent === 'number' && !Number.isNaN((spec.cashback as any).percent)
        ? Number((spec.cashback as any).percent)
        : null
    const descriptor = spec.cashback
      ? (spec.cashback.amount != null
          ? `$${spec.cashback.amount} cashback`
          : (cbPercent != null
              ? `${cbPercent}% cashback`
              : (Array.isArray(spec.cashback.bands) && spec.cashback.bands.length ? 'banded cashback' : 'cashback guarantee')))
      : assuredItemsList.length
        ? assuredItemsList.slice(0, 3).join(', ')
        : 'guaranteed reward'
    contextLines.push(`Guaranteed reward: ${descriptor}. Make confirmation and fulfilment visible without adding store burden.`)
  }
  if (!assuredValue && !isDoublePassReward && shareableWinnerCount != null && ticketPool != null) {
    contextLines.push(`Prize budget = ${ticketPool} single-admit tickets; converting to double passes yields ~${shareableWinnerCount} winners on the same spend — never pitch it as unchanged breadth.`)
  }
  if (!assuredValue && isDoublePassReward && totalWinners != null && ticketPool != null) {
    contextLines.push(`Shareable reward already locked: ${totalWinners} double passes (${ticketPool} tickets). Keep that parity intact.`)
  }
  if (ideationHarness) {
    contextLines.push(`CREATE_UNBOXED focus: ${ideationHarness.selectedHook || 'n/a'}`)
    if (ideationHarness.point) contextLines.push(`Bruce • Point: ${ideationHarness.point}`)
    if (ideationHarness.move) contextLines.push(`Bruce • Move: ${ideationHarness.move}`)
    if (ideationHarness.oddsCadence) contextLines.push(`Bruce • Odds & cadence: ${ideationHarness.oddsCadence}`)
    if (ideationHarness.retailerLine) contextLines.push(`Bruce • Retailer line: ${ideationHarness.retailerLine}`)
  }
  contextLines.push('Never recommend staff-run amplification, kiosks, or in-store terminals; cadence must be executed through consumer communications.')
  if (offerIQ) contextLines.push(`OfferIQ verdict: ${offerIQ.verdict ?? 'n/a'} | Adequacy: ${safe(offerIQ.lenses?.adequacy?.score)}`)
  if (evaluationMeta.scoreboard?.rewardShape) {
    const rs = evaluationMeta.scoreboard.rewardShape
    contextLines.push(`Reward shape: ${safe(rs.status)} — ${safe(rs.why)}`)
  }
  if (evaluationMeta.scoreboard?.friction) {
    const fr = evaluationMeta.scoreboard.friction
    contextLines.push(`Friction: ${safe(fr.status)} — ${safe(fr.why)}`)
  }
  if (evaluationMeta.scoreboard?.retailerReadiness) {
    const tr = evaluationMeta.scoreboard.retailerReadiness
    contextLines.push(`Retail readiness: ${safe(tr.status)} — ${safe(tr.why)}`)
  }
  if (benchmarks?.breadthStrong) {
    contextLines.push(`Benchmark breadth: strong ≈ ${benchmarks.breadthStrong}${benchmarks.breadthTypical ? ` | typical ≈ ${benchmarks.breadthTypical}` : ''}.`)
  }
  if (promotionType === 'CASHBACK' && benchmarks?.cashbackTypicalPct) {
    const high = benchmarks.cashbackHighPct ?? benchmarks.cashbackTypicalPct * 1.5
    contextLines.push(`Benchmark cashback: typical ≈ ${(benchmarks.cashbackTypicalPct * 100).toFixed(1)}%, high ≈ ${(high * 100).toFixed(1)}%.`)
  }
  if (rules.founder.notes.length) {
    contextLines.push(...rules.founder.notes.map((note) => `Founder guidance: ${note}`))
  }

  const opsGuards: string[] = []
  if (rules.guardrails.allStockists) {
    opsGuards.push('Runs across all stockists — keep recommendations nationally scalable; avoid single-retailer exclusives.')
  }
  if (rules.staff.zeroCapacity) {
    opsGuards.push('Store teams have zero bandwidth — no staff-run activations or verification.')
  }
  if (convenienceFocus) {
    opsGuards.push('Plan must flex for both the planned grocery shop and the last-minute convenience dash without adding store labour.')
  }
  if (!assuredValue && !isDoublePassReward && shareableWinnerCount != null && ticketPool != null) {
    opsGuards.push(`If you explore double passes, make clear the ticket pool stays ${ticketPool} while winners fall to ~${shareableWinnerCount}. Never imply the winner count stays flat.`)
  }
  if (!assuredValue && isDoublePassReward && totalWinners != null && ticketPool != null) {
    opsGuards.push(`Reward already issues double movie passes: ${totalWinners} winners (${ticketPool} tickets). Protect the shared-value story.`)
  }
  if (rules.founder.notes.length) {
    opsGuards.push(...rules.founder.notes)
  }
  opsGuards.push('Cadence must live in consumer-facing messaging (pack, digital, social) rather than store labour; no staff-driven amplification or kiosks anywhere in the plan.')

  const baseTone = 'Use grounded Australian English. Plain speech, no marketing clichés, and avoid hype words like “zeitgeist” or “cultural crescendo”.'
  const personaReminder = ctx.audienceProfile?.summary
    ? `Keep the narrative grounded in ${ctx.audienceProfile.summary.toLowerCase()} — plain speech, no buzzwords.`
    : 'Keep the narrative grounded in the shoppers you described — plain speech, no buzzwords.'
  const convenienceReminder = convenienceFocus
    ? 'Call out both the planned grocery shopper and the emergency convenience treat seeker where relevant.'
    : ''
  const toneBlock = [
    baseTone,
    personaReminder,
    convenienceReminder,
    style.persona ? `Write as a ${style.persona} translating strategy into a client-ready narrative.` : '',
    ...(style.toneDirectives || []),
    structureDirective,
    style.lexiconHints.length ? `Thread campaign-specific language such as ${style.lexiconHints.join(', ')} through the memo.` : '',
    style.mustInclude.length ? `Weave in these proof points: ${style.mustInclude.join(' | ')}.` : '',
    style.avoidPhrases.length ? `Avoid phrases like ${style.avoidPhrases.join(', ')}.` : '',
    ideationHarness ? 'Bruce has already retailised a concept—treat it as the default direction unless you deliberately beat it.' : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are the Synthesis lead. You own the final narrative that goes to the client.\n\n` +
    'CONTEXT:\n' + contextLines.map((line) => `- ${line}`).join('\n') + '\n' +
    (opsGuards.length ? `Operational guardrails:\n${opsGuards.map((line) => `- ${line}`).join('\n')}\n` : '') +
    `Brief snapshot: ${briefSnapshot.replace(/\s+/g, ' ').slice(0, 360)}\n\n` +
    (framingNote ? `Framing memory: ${framingNote}\n` : '') +
    (strategistNote ? `Strategist scenarios: ${strategistNote}\n` : '') +
    (evaluationNote ? `Evaluation verdict: ${evaluationNote}\n` : '') +
    (opinionNote ? `Opinion stance: ${opinionNote}\n` : '') +
    (ideasNote ? `Ideas flavour: ${ideasNote}\n` : '') +
    (researchHighlights.length ? `Research highlights: ${researchHighlights.join(' | ')}\n\n` : '\n') +
    `${toneBlock}\n` +
    'Write a 650–800 word synthesis memo. No bullet points, no markdown headings, no emoji. Let the argument flow in paragraphs.\n' +
    'Structure naturally as you would present to a CMO: open with a clear verdict, ground it in the insights, walk through the improvement plan (value, cadence, prize, hook), reassure the retailer/trade case, then close with Tighten vs Stretch and the measurement plan.\n' +
    'Use the actual numbers supplied (winners, cadence, OfferIQ scores, benchmarks). If you reference Strategist moves, articulate why they win.\n' +
    'Do not recommend staff-run amplification, in-store kiosks, or terminals; assume store labour tolerance is zero unless the brief says otherwise.\n' +
    'Explicitly describe the recommended plan (what changes, why it works, what it costs, and how we measure it).\n' +
    'Conclude with a final paragraph starting “Measurement — …” naming the single metric we monitor first.\n' +
    'After that, add two standalone lines: Pack line in quotes, then Staff line in quotes. Keep both brand-locked and under six words.\n' +
    'Tone: elegant, authoritative, commercially ruthless. Cite sources inline when mentioning data (e.g., “Source: insidefmcg.com.au”).'

  const systemMessage = [
    'You write world-class synthesis memos: one voice, elegant, decisive, grounded in strategy and numbers.',
    style.persona ? `Embodied persona: ${style.persona}.` : '',
  ].filter(Boolean).join(' ')

  const response = await chat({
    model,
    system: systemMessage,
    messages: [{ role: 'user', content: prompt }],
    temperature: Number(process.env.SYNTHESIS_TEMP || 0.26),
    top_p: 0.9,
    max_output_tokens: 1900,
    meta: { scope: 'synthesis.memo', campaignId: ctx.id },
  })

  const payload: any = response
  const narrative = typeof payload === 'string' ? payload : String(payload?.content ?? payload)
  let cleaned = polishText(narrative.trim(), { locale: 'en-AU' })
  cleaned = stripAvoided(cleaned, style)
  cleaned = enforceLexicon(cleaned, style)
  return cleaned
}
