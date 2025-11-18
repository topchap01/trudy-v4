import { chat } from '../openai.js'
import type { CampaignContext } from '../context.js'
import { renderBriefSnapshot } from '../context.js'
import { resolveModel } from '../models.js'
import { loadCampaignRules } from '../campaign-rules.js'
import { getPlaybookSnippets } from '../knowledge-grid.js'
import { polishText } from '../polish.js'
import { buildCampaignStyleSpec, pickStructure, enforceLexicon, stripAvoided } from '../style-spec.js'
import type { ResearchPack } from '../research.js'
import { proofreadProse } from '../proofreader.js'

type StrategistInputs = {
  framing: string
  evaluation: string
  synthesis?: string
  opinion?: string
  offerIQ?: any
  evaluationMeta?: any
  customPrompts?: string[]
  deepDive?: boolean
  mode?: 'CORE' | 'ALT'
}

const joinWithAnd = (values: string[]): string => {
  const items = values.filter(Boolean)
  if (!items.length) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
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

const gatherInsightLines = (research: any, limit = 3): string[] => {
  const output: string[] = []
  const dossier = research?.dossier
  if (dossier) {
    const keys: Array<[string, string]> = [
      ['brandTruths', 'Brand truth'],
      ['shopperTensions', 'Shopper tension'],
      ['retailerReality', 'Retailer reality'],
      ['competitorMoves', 'Competitor move'],
      ['categorySignals', 'Category signal'],
      ['benchmarks', 'Benchmark'],
    ]
    for (const [key, label] of keys) {
      for (const entry of dossier[key] || []) {
        const text = (entry?.text || '').trim()
        if (!text) continue
        const source = (entry?.source || '').trim()
        output.push(`${label}: ${text}${source ? ` (${source})` : ''}`)
        if (output.length >= limit) return output
      }
    }
  }
  const insights = research?.insights
  if (insights) {
    const buckets = ['brand', 'audience', 'retailers', 'market', 'competitors', 'signals'] as const
    for (const bucket of buckets) {
      for (const entry of insights[bucket] || []) {
        const text = (entry?.text || '').trim()
        if (!text) continue
        const source = (entry?.source || '').trim()
        output.push(source ? `${text} (${source})` : text)
        if (output.length >= limit) return output
      }
    }
  }
  return output
}

export async function runStrategist(ctx: CampaignContext, inputs: StrategistInputs) {
  const model = resolveModel(
    process.env.MODEL_STRATEGIST,
    process.env.MODEL_SYNTHESIS,
    process.env.MODEL_DEFAULT,
    'gpt-4o'
  )
  const strategistMode: 'CORE' | 'ALT' = inputs.mode === 'ALT' ? 'ALT' : 'CORE'

  const spec: any = ctx.briefSpec || {}
  const rules = await loadCampaignRules(ctx)
  const briefSnapshot = renderBriefSnapshot(ctx) || '_none_'

  const retailers = rules.retailers
  const retailerLine = retailers.length ? joinWithAnd(retailers.slice(0, 6)) : 'n/a'

  const promoType = rules.promotionType
  const cashbackSpec = spec.cashback || null
  const cashbackGuaranteed = Boolean(cashbackSpec && cashbackSpec.assured !== false)
  const assuredItemsList = Array.isArray(spec.assuredItems)
    ? spec.assuredItems.map((item: any) => String(item || '').trim()).filter(Boolean)
    : (typeof spec.assuredItems === 'string'
        ? String(spec.assuredItems).split(/[,•\n]+/).map((item) => item.trim()).filter(Boolean)
        : [])
  const assuredValue = Boolean(
    cashbackGuaranteed ||
    spec.gwp ||
    spec.assuredValue ||
    assuredItemsList.length > 0
  )
  const heroPrize = typeof spec.heroPrize === 'string' ? spec.heroPrize.trim() : ''
  const brandAliasSource = (spec.brand || ctx.clientName || ctx.title || 'Brand').toString()
  const brandAlias = brandAliasSource.includes('—')
    ? brandAliasSource.split('—')[0].trim()
    : brandAliasSource.trim()
  const heroPrizeCount = toNumber(spec.heroPrizeCount ?? spec.hero_prize_count ?? spec.heroPrize_count ?? null)
  const cadenceCopy = spec.cadenceCopy || ''
  const totalWinners = rules.prize.totalWinners
  const ticketPool = rules.prize.ticketPool
  const isDoublePassReward = rules.prize.shareableReward
  const shareableAlternate = rules.prize.shareableAlternateWinnerCount
  const shareableWinnerCount = shareableAlternate ?? (ticketPool != null ? Math.max(1, Math.round(ticketPool / 2)) : null)
  const rewardGuardSnippets = await getPlaybookSnippets({ promoType, useCase: 'REWARD_GUARDRAIL', tone: 'behavioural' })
  const convenienceFocus = Array.isArray(spec.activationChannels)
    ? spec.activationChannels.some((ch: any) => String(ch || '').toUpperCase() === 'CONVENIENCE')
    : false

  const startDate = parseDateLike(ctx.startDate || spec.startDate || null)
  const endDate = parseDateLike(ctx.endDate || spec.endDate || null)
  const duration = daysBetweenInclusive(startDate, endDate)
  const winnersPerDay = totalWinners && duration ? totalWinners / duration : null

  const evaluationMeta = inputs.evaluationMeta || {}
  const offerIQ = inputs.offerIQ || evaluationMeta.offerIQ || null
  const rewardShape = evaluationMeta.scoreboard?.rewardShape || null
  const friction = evaluationMeta.scoreboard?.friction || null
  const trade = evaluationMeta.scoreboard?.retailerReadiness || null
  const researchLines = gatherInsightLines(evaluationMeta.ui?.research || evaluationMeta.research || null, 3)
  const tradeOpportunity = evaluationMeta.ui?.tradeOpportunity || null
  const sparkPayload = (ctx as any).spark || spec.__spark || null
  const sparkAnalysis = sparkPayload?.analysis || null
  const sparkHookOptions = Array.isArray(sparkPayload?.hookPlayground?.options)
    ? sparkPayload.hookPlayground.options
        .map((opt: any) => (typeof opt?.headline === 'string' ? opt.headline.trim() : ''))
        .filter(Boolean)
    : []
  const sparkCadenceLines = Array.isArray(sparkPayload?.hookPlayground?.cadence)
    ? sparkPayload.hookPlayground.cadence
        .map((line: any) => (typeof line === 'string' ? line.trim() : ''))
        .filter(Boolean)
    : []
  const sparkSummaryLine = typeof sparkAnalysis?.summary === 'string' ? sparkAnalysis.summary.trim() : ''
  const sparkAudienceLine = typeof sparkAnalysis?.audience === 'string' ? sparkAnalysis.audience.trim() : ''
  const sparkCadenceNarrative = typeof sparkAnalysis?.cadence === 'string' ? sparkAnalysis.cadence.trim() : ''
  const sparkTensionLine = Array.isArray(sparkAnalysis?.tensions)
    ? sparkAnalysis.tensions
        .map((item: any) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, 2)
        .join(' | ')
    : ''
  const sparkTradeLine =
    (typeof sparkAnalysis?.trade?.reward === 'string' && sparkAnalysis.trade.reward.trim())
      ? sparkAnalysis.trade.reward.trim()
      : ''

  const heroPref = ctx.warRoomPrefs?.allowHeroOverlay
  const forbidHero = Boolean(heroPref === false || evaluationMeta.debug?.guards?.forbidHeroPrize || evaluationMeta.ui?.guards?.forbidHeroPrize)
  const entryLocked = ctx.warRoomPrefs?.entryFrictionAccepted === true

  const safe = (value: any): string => {
    if (value == null) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    try { return JSON.stringify(value) } catch { return String(value) }
  }

  const benchmarks = rules.benchmarks
  const contextLines: string[] = []
  contextLines.push(`Campaign: ${safe(ctx.clientName) || spec.brand || 'Unknown'} — ${safe(ctx.title) || 'Untitled'}`)
  contextLines.push(`Market: ${safe(ctx.market) || 'AU'} (code ${rules.marketCode}) | Category: ${safe(ctx.category) || 'n/a'} | Position: ${safe(ctx.brandPosition) || 'UNKNOWN'}`)
  contextLines.push(`Promotion type: ${promoType} | Assured value: ${assuredValue ? 'Yes' : 'No'}`)
  contextLines.push(`Strategist mode: ${strategistMode}`)
  contextLines.push(`Retailers: ${retailerLine}`)
  if (ctx.audienceProfile?.summary) contextLines.push(`Primary audience: ${safe(ctx.audienceProfile.summary)}`)
  if (Array.isArray(ctx.audienceProfile?.signals) && ctx.audienceProfile!.signals.length) {
    contextLines.push(`Audience cues: ${ctx.audienceProfile!.signals.slice(0, 3).join(', ')}`)
  }
  if (sparkSummaryLine) contextLines.push(`Spark summary: ${sparkSummaryLine}`)
  if (sparkAudienceLine) contextLines.push(`Spark audience cue: ${sparkAudienceLine}`)
  if (sparkTensionLine) contextLines.push(`Spark tensions: ${sparkTensionLine}`)
  if (sparkHookOptions.length) contextLines.push(`Spark hook cues: ${sparkHookOptions.slice(0, 3).join(' | ')}`)
  if (sparkCadenceNarrative || sparkCadenceLines.length) {
    const cadenceCue = sparkCadenceNarrative || sparkCadenceLines.slice(0, 2).join(' | ')
    contextLines.push(`Spark cadence cue: ${cadenceCue}`)
  }
  if (sparkTradeLine) contextLines.push(`Spark trade suggestion: ${sparkTradeLine}`)
  if (convenienceFocus) {
    contextLines.push('Secondary mode: plan for the emergency dessert dash via convenience — no staff intervention, all on-the-go friendly comms.')
  }
  if (heroPrize) contextLines.push(`Hero prize: ${heroPrize}${heroPrizeCount ? ` x${heroPrizeCount}` : ''}`)
  if (totalWinners != null) contextLines.push(`Total winners (brief): ${totalWinners}${winnersPerDay ? ` (~${winnersPerDay.toFixed(1)} per day)` : ''}`)
  if (assuredValue && (cashbackGuaranteed || assuredItemsList.length)) {
    const cbPercent =
      cashbackSpec && typeof (cashbackSpec as any).percent === 'number' && !Number.isNaN((cashbackSpec as any).percent)
        ? Number((cashbackSpec as any).percent)
        : null
    const descriptor = cashbackGuaranteed && cashbackSpec
      ? (cashbackSpec.amount != null
          ? `$${cashbackSpec.amount} cashback`
          : (cbPercent != null
              ? `${cbPercent}% cashback`
              : (Array.isArray(cashbackSpec.bands) && cashbackSpec.bands.length ? 'banded cashback' : 'cashback guarantee')))
      : assuredItemsList.length
        ? assuredItemsList.slice(0, 3).join(', ')
        : 'guaranteed reward'
    contextLines.push(`Guaranteed reward in play: ${descriptor}. Protect the promise and amplify proof points.`)
  }
  if (!assuredValue && !isDoublePassReward && shareableWinnerCount != null && ticketPool != null) {
    contextLines.push(`Prize budget = ${ticketPool} single-admit tickets; converting to double passes delivers ~${shareableWinnerCount} winners on the same spend — never pitch it as unchanged breadth.`)
  }
  if (!assuredValue && isDoublePassReward && totalWinners != null && ticketPool != null) {
    contextLines.push(`Shareable reward already in market: ${totalWinners} double passes (${ticketPool} tickets). Protect breadth and cadence.`)
  }
  if (rewardGuardSnippets.length) {
    contextLines.push(`Behavioural guardrail: ${rewardGuardSnippets[0].body}`)
  } else if (isDoublePassReward) {
    contextLines.push('Behavioural guardrail: Keep the shared movie ticket—emotional resonance beats a higher headline winner count.')
  }
  if (cadenceCopy) contextLines.push(`Cadence note: ${cadenceCopy}`)
  if (offerIQ) contextLines.push(`OfferIQ verdict: ${offerIQ.verdict ?? 'n/a'} | Adequacy score: ${safe(offerIQ.lenses?.adequacy?.score)}`)
  if (rewardShape) contextLines.push(`Reward shape: ${safe(rewardShape.status)} — ${safe(rewardShape.why)}`)
  if (friction) contextLines.push(`Friction: ${safe(friction.status)} — ${safe(friction.why)}`)
  if (trade) contextLines.push(`Retail readiness: ${safe(trade.status)} — ${safe(trade.why)}`)
  if (tradeOpportunity?.flag) {
    contextLines.push(`Trade gap flagged: ${tradeOpportunity.why || 'Retailers named but no sell-in hook.'}`)
  }
  if (entryLocked) contextLines.push('Entry mechanic is locked; only alter if a new value play demands it.')
  if (forbidHero) contextLines.push('Hero overlay is off the table—stretch breadth, cadence, or assured value instead.')
  else if (heroPref === true) contextLines.push('Hero overlay encouraged when it builds fame without breaking ops or fairness.')
  if (benchmarks?.breadthStrong) {
    contextLines.push(`Benchmark breadth: strong ≈ ${benchmarks.breadthStrong}${benchmarks.breadthTypical ? ` | typical ≈ ${benchmarks.breadthTypical}` : ''}.`)
  }
  if (promoType === 'CASHBACK' && benchmarks?.cashbackTypicalPct) {
    const high = benchmarks.cashbackHighPct ?? benchmarks.cashbackTypicalPct * 1.5
    contextLines.push(`Benchmark cashback: typical ≈ ${(benchmarks.cashbackTypicalPct * 100).toFixed(1)}%, high ≈ ${(high * 100).toFixed(1)}%.`)
  }
  if (researchLines.length) contextLines.push('Research flashes: ' + researchLines.join(' | '))
  if (rules.staff.zeroCapacity) contextLines.push('Operational guardrail: store teams have zero bandwidth—no staff-run demos, kiosks, or manual validation.')
  contextLines.push('Never suggest staff-run amplification, kiosks, or in-store terminals—cadence must be delivered through consumer comms alone.')
  if (rules.guardrails.allStockists) contextLines.push('Scale guardrail: campaign must work for all stockists—avoid retailer-exclusive mechanics.')
  if (rules.founder.notes.length) contextLines.push(...rules.founder.notes.map((note) => `Founder guidance: ${note}`))
  contextLines.push('Cadence must be dramatised through consumer-facing comms, not in-store labour.')

  const sparkDirectiveLines: string[] = []
  if (sparkHookOptions.length) {
    sparkDirectiveLines.push(`Interrogate Spark hook contenders before inventing new ones: ${sparkHookOptions.slice(0, 3).join(' | ')}.`)
  }
  if (sparkCadenceNarrative) {
    sparkDirectiveLines.push(`Cadence promise from Spark: ${sparkCadenceNarrative}. Keep the rhythm intact or justify the shift with numbers.`)
  } else if (sparkCadenceLines.length) {
    sparkDirectiveLines.push(`Cadence cues to uphold: ${sparkCadenceLines.slice(0, 2).join(' | ')}.`)
  }
  if (sparkAudienceLine) {
    sparkDirectiveLines.push(`Every scenario must overtly serve ${sparkAudienceLine}.`)
  }
  if (sparkTensionLine) {
    sparkDirectiveLines.push(`Answer these live tensions: ${sparkTensionLine}.`)
  }
  const sparkDirective = sparkDirectiveLines.join('\n')

  const speechGuard = 'Write in grounded Australian English. Plain speech, no marketing clichés, no hype words (especially “zeitgeist”, “crescendo”, or “game changer”).'
  const personaReminder = ctx.audienceProfile?.summary
    ? `Keep every scenario anchored in ${ctx.audienceProfile.summary.toLowerCase()}.`
    : ''
  const convenienceReminder = convenienceFocus
    ? 'When relevant, contrast the planned grocery bulk shopper with the emergency treat dash from convenience.'
    : ''

  const researchPack = (evaluationMeta?.ui?.research || evaluationMeta?.research || null) as ResearchPack | null
  const style = buildCampaignStyleSpec(ctx, 'strategist', researchPack, { briefSpec: spec })
  const structureDirective = pickStructure(style, 'strategist', ctx.id)
  const personaToneBlock = [
    speechGuard,
    personaReminder,
    convenienceReminder,
    style.persona ? `Write as a ${style.persona} who designs promo blueprints that land in the real world.` : '',
    ...(style.toneDirectives || []),
    structureDirective,
    style.lexiconHints.length ? `Thread campaign language like ${style.lexiconHints.join(', ')} through the scenarios.` : '',
    style.mustInclude.length ? `Reference explicitly: ${style.mustInclude.join(' | ')}.` : '',
    style.avoidPhrases.length ? `Avoid phrases such as ${style.avoidPhrases.join(', ')}.` : '',
  ].filter(Boolean).join('\n')

  const framingCue = (inputs.framing || '').split('\n').slice(0, 4).join(' ')
  const evaluationCue = (inputs.evaluation || '').split('\n').slice(0, 4).join(' ')

  const isCashbackAssured = Boolean(cashbackGuaranteed && assuredValue)

  const heroOverlayBriefed = Boolean(spec.majorPrizeOverlay || heroPrize)
  const heroOverlayAllowed = !forbidHero && (heroOverlayBriefed || heroPref === true)
  const brandWorldHint = ctx.category
    ? `${ctx.category.toLowerCase()} occasion`
    : `${brandAlias} world`

  const shareLabel = assuredValue
    ? 'Scenario — Assured theatre'
    : (isDoublePassReward
        ? 'Scenario — Double pass proof'
        : (!assuredValue && /ticket|pass/i.test(heroPrize) ? 'Scenario — Double passes' : 'Scenario — Shareable reward'))
  const cadenceLabel = isCashbackAssured ? 'Scenario — Proof pathway' : 'Scenario — Cadence burst'
  const heroLabel = isCashbackAssured
    ? 'Scenario — Liability & partners'
    : (heroOverlayAllowed ? 'Scenario — Hero overlay' : 'Scenario — Brand stretch')
  const prizeText = [spec?.heroPrize, Array.isArray(spec?.runnerUps) ? spec.runnerUps.join(' ') : '', ctx.title]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  const prizeFeelsTicket = /ticket|pass/.test(prizeText)
  const prizeFeelsCredit = /credit|cash|fund|upgrade|voucher|gift/.test(prizeText)

  const shareInstruction = assuredValue
    ? `You promise a guaranteed reward (${assuredItemsList.slice(0, 3).join(', ') || 'guaranteed fulfilment'}). Show the confirmation moment, define proof handling, and keep fulfilment central without inventing new mechanics beyond the brief. Make the deferred timing explicit.`
    : (isDoublePassReward || prizeFeelsTicket
        ? `You already issue double passes (${totalWinners ?? 'n/a'} winners from ${ticketPool ?? 'n/a'} tickets). Amplify the shared value without touching the prize count—tighten comms, CRM rhythm, or proof points that dramatise two seats filled every day.`
        : prizeFeelsCredit
          ? 'Turn the prize pool into brand-right credit (tabs, merch, festival funds) without drifting into home makeovers. Show the daily drop cadence, proof messages, and how cost stays flat.'
          : 'Recast the reward so it genuinely feels shared (paired prizes, co-created experiences) without rewriting the prize budget. Be explicit about what changes, what it costs, and how fairness stays intact.')
  const cadenceInstruction = isCashbackAssured
    ? 'Map the proof path: purchase verification, interim comms (claim submitted, approved, paid), payout timing, and who adjudicates. Keep it web-form simple—no extra portals, phased uploads, or daily bursts.'
    : 'Test an hourly or daily winner burst. Explain why it matters now, what it costs operationally, and how we monitor it.'
  const heroInstruction = isCashbackAssured
    ? `Detail how ${brandAlias} funds and reconciles the cashback pool, handles finance/ops partners, and keeps compliance tight without inventing new prizes. Spell out legal guardrails and the comms that carry claimants through to payment.`
    : (heroOverlayAllowed
        ? (prizeFeelsTicket
            ? 'Design a tight hero overlay (e.g., three hero prizes) and explain how to fund it without destroying breadth. Keep it in the pub/night-out world and show how zero staff lift is maintained.'
            : `If you add a hero tier, keep it inside the ${brandWorldHint}: think high-fidelity pub experiences, festival routes, or Guinness ritual upgrades. Detail budget offsets, why fairness holds, and never wander into household or unrelated lifestyle prizes.`)
        : `Hero overlay is not briefed. Use this slot to make the existing reward feel famous inside the ${brandWorldHint}: deepen the venue ritual, dial up cadence proof, or weaponise retailer CRM. No new prize tiers or off-category giveaways.`)

  const tradeCue = tradeOpportunity?.flag
    ? 'One scenario must introduce a retailer incentive that keeps store labour at zero.'
    : ''
  const scenarioDirective =
    strategistMode === 'ALT'
      ? `ALT MODE — deliver three divergent plays: (1) reframe the value or assurance, (2) reinvent cadence/odds, (3) retailer/ops stretch. No overlapping mechanics or hooks. ${tradeCue}`.trim()
      : `Write exactly three scenario paragraphs followed by one measurement line. Each paragraph is 3–4 sentences, no bullet points. Use the labels below exactly and quote the numbers that matter. ${tradeCue}`.trim()

  const measurementDirective =
    strategistMode === 'ALT'
      ? 'After the scenarios, add a blank line and write “Measurement — …” naming the boldest metric we must validate for the variants.'
      : 'After the scenarios, add a blank line and write “Measurement — …” naming the single metric we watch first. If a scenario needs extra budget, state the offset.'

  const summaryDirective =
    strategistMode === 'ALT'
      ? 'Then add another blank line and write “Summary” followed by three bullet points (use “- ”) that tie each variant to its commercial lever.'
      : 'Then add another blank line and write “Summary” followed by three bullet points (use “- ”) that capture the headline action from each scenario.'

  const prompt = `You are the Strategist: a senior promo architect who pressure-tests mechanics before the CMO sees them.\n\n` +
    'Context:\n' + contextLines.map((line) => `- ${line}`).join('\n') + '\n' +
    (framingCue ? `Framing cue: ${framingCue}\n` : '') +
    (evaluationCue ? `Evaluation cue: ${evaluationCue}\n` : '') +
    'Brief snapshot (compressed): ' + briefSnapshot.replace(/\s+/g, ' ').slice(0, 320) + '\n\n' +
    `${personaToneBlock}\n` +
    (sparkDirective ? `${sparkDirective}\n` : '') +
    `${scenarioDirective}\n` +
    'Each scenario must open with the behavioural reason it will move the shopper before you describe the mechanic.\n' +
    `${shareLabel} — ${shareInstruction}\n` +
    `${cadenceLabel} — ${cadenceInstruction}\n` +
    `${heroLabel} — ${heroInstruction}\n` +
    (isCashbackAssured
      ? 'Guardrail: do not invent partial rebates, hero overlays, or bursts that are absent in the brief—keep value identical and focus on clarity, compliance, and long-tail fulfilment.\n'
      : 'Guardrail: never recommend reverting to single-admit tickets; protect the shared experience even if the headline winner count halves.\n') +
    'Do not propose staff-run amplification, in-store kiosks, or terminals — your scenarios must run off existing consumer communications and zero store labour.\n' +
    `${measurementDirective} Reference OfferIQ, benchmarks, or research when useful.\n` +
    `${summaryDirective}`

  const response = await chat({
    model,
    system: 'You write decisive, imaginative, commercially sharp prose. You never waffle and you always cite the numbers you lean on.',
    messages: [{ role: 'user', content: prompt }],
    temperature: Number(process.env.STRATEGIST_TEMPERATURE || 0.26),
    top_p: 0.9,
    max_output_tokens: inputs.deepDive ? 1600 : 900,
    meta: { scope: inputs.deepDive ? 'strategist.deep' : 'strategist.core', campaignId: ctx.id },
  })

  const payload: any = response
  const narrative = typeof payload === 'string' ? payload : String(payload?.content ?? payload)
  let cleaned = polishText(narrative.trim(), { locale: 'en-AU' })
  cleaned = stripAvoided(cleaned, style)
  cleaned = enforceLexicon(cleaned, style)
  cleaned = await proofreadProse(cleaned, { scope: strategistMode === 'ALT' ? 'strategist.alt' : 'strategist', campaignId: ctx.id, medium: 'markdown' })
  return cleaned
}
