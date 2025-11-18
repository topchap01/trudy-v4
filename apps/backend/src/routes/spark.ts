// apps/backend/src/routes/spark.ts
import { Router } from 'express'
import { chat } from '../lib/openai.js'

const router = Router()

const MODEL = process.env.MODEL_SPARK || process.env.MODEL_VARIANT || process.env.MODEL_DEFAULT || 'gpt-4o-mini'

const SYSTEM_PROMPT = `You are Trudy, a world-class shopper marketing strategist. When a user shares a campaign idea (sometimes messy, sometimes structured), you extract the essentials and return JSON only.

JSON schema:
{
  "summary": "One-sentence description of the idea",
  "hook": "Front-of-pack hook",
  "hook_support": "Reason to believe / proof",
  "mechanic": "Entry mechanic one-liner",
  "value": {
    "type": "CASHBACK | GWP | PRIZE | CREDIT",
    "amount": number|null,
    "currency": "string",
    "assured": boolean,
    "odds": "1-in-3",
    "processing_days": number|null,
    "gwp_item": "string|null",
    "gwp_value": number|null
  },
  "hero_prize": "string|null",
  "hero_prize_count": number|null,
  "cadence": "Winner rhythm / comms cadence",
  "audience": "Who it's for",
  "tensions": ["top shopper tension", "..."],
  "retailer_reality": "Retailer POV or constraints",
  "trade": {
    "audience": "Which retailers or staff",
    "reward": "What they get",
    "guardrail": "Operational guardrail"
  },
  "compliance": ["age gate", "permits", ...],
  "hook_playground": {
    "options": [
      { "headline": "string", "support": "string" }
    ],
    "cadence": ["string"]
  },
  "variantIdeas": [
    {
      "name": "Variant label",
      "summary": "What changes vs base",
      "overrides": { ... JSON fields to override brief ... }
    }
  ]
}

Rules:
- Ground everything in the provided idea; no unrelated pop-culture tangents.
- Make numbers concrete (e.g., odds, prize counts) when implied.
- If the user hints at multiple value possibilities (e.g., "$50 cashback OR 1-in-3 $150 chance"), treat the first as the baseline value and push the alternatives into variantIdeas with clear overrides.
- variantIdeas should include overrides for hook/value/mechanic/odds etc, but keep it concise.`

function toNumber(value: any): number | null {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function buildSpecFromSpark(payload: any = {}) {
  const spec: Record<string, any> = {}
  if (payload.hook) spec.hook = payload.hook
  if (payload.mechanic) spec.mechanicOneLiner = payload.mechanic
  if (payload.cadence) spec.cadenceCopy = payload.cadence
  if (payload.audience) spec.audienceSummary = payload.audience
  if (Array.isArray(payload.tensions)) {
    spec.audienceSignals = payload.tensions.filter(Boolean)
    spec.buyerTensions = payload.tensions.filter(Boolean)
  }
  if (payload.retailer_reality) {
    spec.retailerFocusNotes = payload.retailer_reality
  }
  if (payload.trade) {
    const trade = payload.trade
    spec.tradeIncentive = trade.reward || ''
    spec.tradeIncentiveSpec = {
      audience: trade.audience || '',
      reward: trade.reward || '',
      guardrail: trade.guardrail || '',
    }
  }
  if (Array.isArray(payload.compliance) && payload.compliance.length) {
    spec.nonNegotiables = payload.compliance.filter(Boolean)
  }
  if (payload.hero_prize) spec.heroPrize = payload.hero_prize
  if (payload.hero_prize_count != null) spec.heroPrizeCount = toNumber(payload.hero_prize_count)

  const value = payload.value || {}
  const vType = String(value.type || '').toUpperCase()
  if (vType === 'CASHBACK' || vType === 'CREDIT') {
    spec.cashback = {
      amount: toNumber(value.amount),
      currency: value.currency || 'AUD',
      assured: value.assured !== false,
      odds: value.odds || '',
      processingDays: toNumber(value.processing_days),
    }
  } else if (vType === 'GWP') {
    spec.gwp = {
      item: value.gwp_item || value.reward || null,
      triggerQty: 1,
      cap: 'UNLIMITED',
      rrp: toNumber(value.gwp_value),
    }
  } else if (vType === 'PRIZE' && value.amount) {
    spec.heroPrize = spec.heroPrize || (value.amount ? `${value.currency || '$'}${value.amount}` : null)
  }
  return spec
}

function normaliseHookPlayground(payload: any = {}) {
  const options = Array.isArray(payload?.hook_playground?.options)
    ? payload.hook_playground.options
        .map((opt: any) => ({
          headline: typeof opt?.headline === 'string' ? opt.headline.trim() : '',
          support: typeof opt?.support === 'string' ? opt.support.trim() : '',
        }))
        .filter((opt: any) => opt.headline)
    : []
  const cadence = Array.isArray(payload?.hook_playground?.cadence)
    ? payload.hook_playground.cadence.map((c: any) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    : []
  return { options, cadence }
}

router.post('/spark', async (req, res, next) => {
  try {
    const idea = typeof req.body?.idea === 'string' ? req.body.idea.trim() : ''
    if (!idea) {
      return res.status(400).json({ error: 'Idea text is required.' })
    }

    const prompt = [
      'Idea:',
      idea,
      '',
      'Return JSON only.',
    ].join('\n')

    const raw = await chat({
      model: MODEL,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      json: true,
      max_output_tokens: 900,
      temperature: 0.4,
      meta: { scope: 'spark.ingest' },
    })

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      return res.status(502).json({ error: 'Spark parser failed to return valid JSON.', detail: raw })
    }

    const spec = buildSpecFromSpark(parsed)
    res.json({ analysis: parsed, spec, hookPlayground: normaliseHookPlayground(parsed) })
  } catch (err) {
    next(err)
  }
})

export default router
