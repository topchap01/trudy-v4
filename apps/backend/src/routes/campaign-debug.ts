import { Router } from 'express'
import { buildCampaignBundle } from '../lib/campaign-bundle.js'
import { chat } from '../lib/openai.js'
import { runResearch } from '../lib/research.js'

const router = Router()

router.get('/campaigns/:id/debug/bundle', async (req, res, next) => {
  try {
    const { id } = req.params
    const bundle = await buildCampaignBundle(id)
    res.json(bundle)
  } catch (err) {
    next(err)
  }
})

router.post('/campaigns/:id/debug/query', async (req, res, next) => {
  try {
    const { id } = req.params
    const { message, history } = req.body || {}
    const question = typeof message === 'string' ? message.trim() : ''
    if (!question) {
      return res.status(400).json({ error: 'Message is required.' })
    }

    const bundle = await buildCampaignBundle(id)
    const contextText = formatBundleForChat(bundle)

    const sanitizedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (Array.isArray(history)) {
      for (const raw of history) {
        const role = raw?.role === 'assistant' ? 'assistant' : raw?.role === 'user' ? 'user' : null
        const content = typeof raw?.content === 'string' ? raw.content.trim() : ''
        if (!role || !content) continue
        sanitizedHistory.push({ role, content })
      }
    }
    const trimmedHistory = sanitizedHistory.slice(-8)

    const systemPrompt = 'You are the Campaign Analyst. Answer using only the provided campaign artefacts. Cite sections or data when possible.'

    const messages = [
      { role: 'user' as const, content: `Campaign artefacts:\n${contextText}` },
      ...trimmedHistory,
      { role: 'user' as const, content: question },
    ]

    const reply = await chat({
      model: process.env.MODEL_DEFAULT || 'gpt-4o',
      system: systemPrompt,
      messages,
      temperature: 0.2,
      top_p: 0.9,
      max_output_tokens: 800,
      meta: { scope: 'campaign.debug.chat', campaignId: id },
    })

    res.json({ reply })
  } catch (err) {
    next(err)
  }
})

router.post('/campaigns/:id/debug/research-task', async (req, res, next) => {
  try {
    const { id } = req.params
    const { level } = req.body || {}
    const bundle = await buildCampaignBundle(id)
    const ctx = bundle.snapshot.context

    const allowedLevels = ['LITE', 'DEEP', 'MAX'] as const
    const levelUpper = String(level || '').toUpperCase()
    const researchLevel = (allowedLevels as readonly string[]).includes(levelUpper) ? levelUpper as typeof allowedLevels[number] : 'MAX'

    const research = await runResearch(ctx, researchLevel, { forceRefresh: true })
    if (!research) {
      return res.status(500).json({ error: 'Research task failed to produce results.' })
    }

    const summaryPrompt = [
      'You are the Research Task analyst. Summarise the refreshed research so the strategist can see what changed.',
      'Keep it short and punchy: 1 line on brand truths, 1 on shopper tension, 1 on retailer reality, 1 on competitor moves, and note any new benchmarks if present.',
      'Mention sources inline (e.g., Source: insidefmcg.com.au).',
      'Research JSON:',
      JSON.stringify(research),
    ].join('\n')

    const summary = await chat({
      model: process.env.MODEL_DEFAULT || 'gpt-4o',
      system: 'You summarise research updates for campaign planners. Be crisp, cite sources.',
      messages: [{ role: 'user', content: summaryPrompt }],
      temperature: 0.2,
      top_p: 0.9,
      max_output_tokens: 600,
      meta: { scope: 'campaign.debug.research_task', campaignId: id },
    })

    const updatedBundle = await buildCampaignBundle(id)
    res.json({
      summary,
      generatedAt: new Date().toISOString(),
      bundle: updatedBundle,
      research,
    })
  } catch (err) {
    next(err)
  }
})

function formatBundleForChat(bundle: Awaited<ReturnType<typeof buildCampaignBundle>>): string {
  const { snapshot, rules } = bundle
  const sections: string[] = []

  sections.push([
    'Campaign overview:',
    `- Title: ${snapshot.campaign.title}`,
    `- Client: ${snapshot.campaign.clientName ?? 'n/a'}`,
    `- Market: ${snapshot.campaign.market ?? 'n/a'} | Category: ${snapshot.campaign.category ?? 'n/a'}`,
    `- Mode: ${snapshot.campaign.mode} | Status: ${snapshot.campaign.status}`,
  ].join('\n'))

  sections.push(`Brief snapshot:\n${snapshot.brief.snapshot}`)

  const framing = snapshot.narratives.framing?.content?.trim()
  if (framing) sections.push(`Framing:\n${framing}`)

  const evaluation = snapshot.narratives.evaluation?.content?.trim()
  if (evaluation) sections.push(`Evaluation:\n${evaluation}`)

  const strategist = snapshot.narratives.strategist?.content?.trim()
  if (strategist) sections.push(`Strategist:\n${strategist}`)

  const synthesis = snapshot.narratives.synthesis?.content?.trim()
  if (synthesis) sections.push(`Synthesis:\n${synthesis}`)

  if (snapshot.research) {
    sections.push(`Research dossier:\n${JSON.stringify(snapshot.research, null, 2)}`)
  }

  if (rules?.founder?.notes?.length) {
    sections.push(`Founder notes:\n- ${rules.founder.notes.join('\n- ')}`)
  }

  if (rules?.guardrails) {
    sections.push(`Guardrails:\n${JSON.stringify(rules.guardrails, null, 2)}`)
  }

  if (snapshot.offerIQ) {
    sections.push(`OfferIQ:\n${JSON.stringify(snapshot.offerIQ, null, 2)}`)
  }

  return sections.join('\n\n---\n\n')
}

export default router
