// apps/backend/src/routes/synthesis-stream.ts
// SSE streaming endpoint for synthesis — sends tokens as they arrive from Claude.
// Matches the frontend sse.js EventSource protocol:
//   - Unnamed events (data: <text>\n\n) for token chunks
//   - data: [DONE]\n\n sentinel to end stream
//   - Final JSON payload with { text, model } before [DONE]

import { Router, type Request, type Response } from 'express'
import { prisma } from '../db/prisma.js'
import { buildCampaignContext, renderBriefSnapshot } from '../lib/context.js'
import { chatStream } from '../lib/openai.js'
import { resolveModel } from '../lib/models.js'
import { applyResearchOverrides, readResearchOverridesFromBrief } from '../lib/war-room-research.js'
import { buildCampaignStyleSpec, pickStructure, enforceLexicon, stripAvoided } from '../lib/style-spec.js'
import { loadCampaignRules } from '../lib/campaign-rules.js'
import { polishText } from '../lib/polish.js'
import { proofreadProse } from '../lib/proofreader.js'

const router = Router()

function parseMaybeJson(value: any): any {
  if (!value) return null
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  return typeof value === 'object' ? value : null
}

function extractPrimaryContent(row: any): string | null {
  if (!row) return null
  const direct = row.content
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  const params = parseMaybeJson(row.params) || row.params
  if (params && typeof params === 'object') {
    const candidates = [
      params?.result?.content, params?.content, params?.narrative,
      params?.output?.content, params?.data?.content, params?.value?.content, params?.text,
    ]
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim()
    }
  }
  return null
}

function extractMeta(row: any): any {
  if (!row) return null
  const params = parseMaybeJson(row.params) || row.params || null
  if (params && typeof params === 'object') {
    if (params.meta) return params.meta
    if (params.result?.meta) return params.result.meta
  }
  return parseMaybeJson(row.meta) || null
}

// GET /synthesis — matches the EventSource URL in sse.js
// Query params: campaignId (required)
router.get('/synthesis', async (req: Request, res: Response) => {
  const campaignId = req.query.campaignId as string
  if (!campaignId) {
    res.status(400).json({ error: 'campaignId query param required' })
    return
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  })

  // Send unnamed SSE events (data: <payload>\n\n) — this is what EventSource.onmessage reads
  const sendData = (payload: string) => {
    res.write(`data: ${payload}\n\n`)
  }

  try {
    const camp = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { brief: true, outputs: true },
    })
    if (!camp) {
      sendData(JSON.stringify({ error: 'Campaign not found' }))
      sendData('[DONE]')
      return res.end()
    }

    const ctx = buildCampaignContext(camp)
    const researchOverrides = readResearchOverridesFromBrief(camp.brief)

    const latestOutputOf = (types: string[]) =>
      camp.outputs
        .filter((o: any) => types.includes(o.type))
        .sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime())
        .at(-1) || null

    const framingOut = latestOutputOf(['framingNarrative', 'framing'])
    const evaluationOut = latestOutputOf(['evaluationNarrative', 'evaluation'])
    if (!evaluationOut) {
      sendData(JSON.stringify({ error: 'EVALUATION_REQUIRED' }))
      sendData('[DONE]')
      return res.end()
    }
    const ideasOut = latestOutputOf(['ideaRoutes', 'ideas'])
    const opinionOut = latestOutputOf(['opinionNarrative', 'opinion'])
    const strategistOut = latestOutputOf(['strategistNarrative', 'strategist'])

    const framing = extractPrimaryContent(framingOut) || ''
    const evaluation = extractPrimaryContent(evaluationOut) || ''
    const ideas = extractPrimaryContent(ideasOut) || ''
    const opinion = extractPrimaryContent(opinionOut) || ''
    const strategist = extractPrimaryContent(strategistOut) || ''
    const evaluationMeta = extractMeta(evaluationOut) || {}
    const effectiveResearch = applyResearchOverrides(
      evaluationMeta?.ui?.research || evaluationMeta?.research || null,
      researchOverrides
    )
    if (effectiveResearch) {
      if (!evaluationMeta.ui) evaluationMeta.ui = {}
      evaluationMeta.ui.research = effectiveResearch
      evaluationMeta.research = effectiveResearch
    }
    const offerIQ = evaluationMeta?.ui?.offerIQ || evaluationMeta?.offerIQ || null

    // Build prompt (same structure as runSynthesis in synthesis.ts)
    const spec: any = ctx.briefSpec || {}
    const rules = await loadCampaignRules(ctx)
    const briefSnapshot = renderBriefSnapshot(ctx) || '_none_'
    const research = (evaluationMeta.ui?.research || evaluationMeta.research || null) as any
    const style = buildCampaignStyleSpec(ctx, 'synthesis', research, { briefSpec: spec })
    const structureDirective = pickStructure(style, 'synthesis', ctx.id)

    const gatherInsightLines = (r: any, limit = 5): string[] => {
      const lines: string[] = []
      const dossier = r?.dossier
      if (dossier) {
        const sections: Array<[string, string]> = [
          ['brandTruths', 'Brand truth'], ['shopperTensions', 'Shopper tension'],
          ['retailerReality', 'Retailer reality'], ['competitorMoves', 'Competitor move'],
          ['categorySignals', 'Category signal'], ['benchmarks', 'Benchmark'],
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
      return lines
    }

    const retailers = rules.retailers
    const retailerLine = retailers.length ? retailers.slice(0, 6).join(', ') : 'n/a'
    const promotionType = rules.promotionType
    const assuredValue = Boolean(spec.cashback?.assured !== false && spec.cashback || spec.gwp || spec.assuredValue)
    const researchHighlights = gatherInsightLines(research, 5)

    const contextLines: string[] = []
    contextLines.push(`Campaign: ${ctx.clientName || spec.brand || 'Unknown'} — ${ctx.title || 'Untitled'}`)
    contextLines.push(`Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'}`)
    contextLines.push(`Retailers: ${retailerLine}`)
    contextLines.push(`Promotion type: ${promotionType} | Assured value: ${assuredValue ? 'Yes' : 'No'}`)
    if (offerIQ) contextLines.push(`OfferIQ verdict: ${offerIQ.verdict ?? 'n/a'}`)
    const limitedContext = contextLines.filter(Boolean).slice(0, 12)

    const framingNote = framing.split('\n').filter(Boolean).slice(0, 6).join(' ')
    const strategistNote = strategist.split('\n').filter(Boolean).slice(0, 6).join(' ')
    const evaluationNote = evaluation.split('\n').filter(Boolean).slice(0, 6).join(' ')
    const opinionNote = opinion.split('\n').filter(Boolean).slice(0, 6).join(' ')
    const ideasNote = ideas.split('\n').filter(Boolean).slice(0, 6).join(' ')

    const toneBlock = [
      'Use grounded Australian English. Plain speech, no marketing clichés.',
      style.persona ? `Write as a ${style.persona} translating strategy into a client-ready narrative.` : '',
      structureDirective,
    ].filter(Boolean).join('\n')

    const prompt = [
      `You are the Synthesis lead. You own the final narrative that goes to the client.`,
      '',
      '<context>',
      ...limitedContext.map((line) => `- ${line}`),
      '</context>',
      '',
      `<brief_snapshot>${briefSnapshot.replace(/\s+/g, ' ').slice(0, 360)}</brief_snapshot>`,
      '',
      '<team_inputs>',
      framingNote ? `<framing>${framingNote}</framing>` : '',
      strategistNote ? `<strategist>${strategistNote}</strategist>` : '',
      evaluationNote ? `<evaluation>${evaluationNote}</evaluation>` : '',
      opinionNote ? `<opinion>${opinionNote}</opinion>` : '',
      ideasNote ? `<ideas>${ideasNote}</ideas>` : '',
      researchHighlights.length ? `<research>${researchHighlights.join(' | ')}</research>` : '',
      '</team_inputs>',
      '',
      `<tone>${toneBlock}</tone>`,
      '',
      '<instructions>',
      'Write a ~550 word synthesis memo. No bullet points, no markdown headings, no emoji. Keep paragraphs ≤4 sentences.',
      '',
      'Structure your memo in five flowing movements:',
      '1. Verdict and why now — the decision and its commercial logic.',
      '2. Improvement plan — value, cadence, prize, hook.',
      '3. Retailer/trade reality and operations.',
      '4. Tighten versus Stretch — what to protect, what to push.',
      '5. Measurement paragraph starting "Measurement — …".',
      '',
      'Use the actual numbers supplied. Cite sources inline when mentioning data.',
      'After the measurement paragraph, add two standalone lines: Pack line in quotes, then Staff line in quotes (each ≤6 words, brand-locked).',
      'Tone: elegant, authoritative, commercially ruthless.',
      '</instructions>',
    ].filter(Boolean).join('\n')

    const systemMessage = [
      'You write world-class synthesis memos for promotional campaigns.',
      'Your voice: one clear voice, elegant, decisive, grounded in strategy and numbers.',
      'You synthesise inputs from Framing, Evaluation, Strategist, and Opinion teams into a single authoritative narrative.',
      'You never waffle. Every sentence earns its place.',
      style.persona ? `Embodied persona: ${style.persona}.` : '',
    ].filter(Boolean).join(' ')

    const model = resolveModel(
      process.env.MODEL_SYNTHESIS,
      process.env.MODEL_EVAL,
      process.env.MODEL_DEFAULT,
    )

    // Stream tokens from Claude — send each chunk as an unnamed SSE data event
    let fullText = ''
    for await (const delta of chatStream({
      model,
      system: systemMessage,
      messages: [{ role: 'user', content: prompt }],
      temperature: Number(process.env.SYNTHESIS_TEMP || 0.26),
      top_p: 0.9,
      max_output_tokens: 1900,
      meta: { scope: 'synthesis.stream', campaignId: ctx.id },
    })) {
      fullText += delta
      sendData(delta) // plain text chunk — sse.js accumulates these
    }

    // Post-process the complete text
    let cleaned = polishText(fullText.trim(), { locale: 'en-AU' })
    cleaned = stripAvoided(cleaned, style)
    cleaned = enforceLexicon(cleaned, style)
    cleaned = await proofreadProse(cleaned, { scope: 'synthesis', campaignId: ctx.id, medium: 'markdown' })

    // Save to database
    const row = await prisma.output.create({
      data: {
        campaignId,
        type: 'synthesisNarrative',
        prompt: 'synthesis',
        content: cleaned,
      },
    })

    // Send final polished version as JSON (sse.js detects JSON with `text` field and closes)
    sendData(JSON.stringify({ text: cleaned, model, id: row.id, final: true }))
    sendData('[DONE]')
    res.end()
  } catch (err: any) {
    console.error('[synthesis-stream] ERROR:', err?.message || err)
    sendData(JSON.stringify({ error: err?.message || 'Internal error' }))
    sendData('[DONE]')
    res.end()
  }
})

export default router
