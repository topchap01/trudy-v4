import { prisma } from '../db/prisma.js'
import { chat } from './openai.js'
import { normaliseMarketCode } from './campaign-rules.js'

export type PrizeKnowledgeDossier = {
  prizeTruths?: string[]
  emotionalHooks?: string[]
  audienceFit?: string[]
  iconStatus?: string[]
}

const MODEL =
  process.env.MODEL_PRIZE_KNOWLEDGE ||
  process.env.MODEL_DEFAULT ||
  'gpt-4o'

const SYSTEM_PROMPT = `You are a cultural strategist. When asked about a prize (e.g., The Ghan train journey, Australian Open tickets), respond with JSON describing what it is, why it matters, and who it appeals to in the specified market. Keep responses factual, under 25 words each, and never hallucinate prices or availability.`

function buildPrompt(prize: string, marketCode: string) {
  const marketLabel = marketCode || 'the stated market'
  return [
    `Prize: ${prize}`,
    `Market: ${marketLabel}`,
    '',
    'Return JSON only with keys: prizeTruths, emotionalHooks, audienceFit, iconStatus.',
    '- prizeTruths: 2-4 lines defining the prize (what it is, geography, uniqueness).',
    '- emotionalHooks: 2-4 lines on feelings/occasion it unlocks.',
    '- audienceFit: 2-4 lines on who values it most.',
    '- iconStatus: optional lines on heritage, awards, symbolic status.',
    'No markdown, no prose outside JSON.',
  ].join('\n')
}

function normaliseList(input: any): string[] {
  if (!input) return []
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item.trim() : String(item ?? '').trim()))
      .filter(Boolean)
  }
  if (typeof input === 'string') return [input.trim()].filter(Boolean)
  return []
}

function buildSlug(prize: string, marketCode: string) {
  const prizeKey = prize.trim().toLowerCase()
  const marketKey = (marketCode || 'GLOBAL').trim().toUpperCase()
  return `${prizeKey}::${marketKey}`
}

export async function ensurePrizeKnowledge(prize?: string | null, market?: string | null): Promise<PrizeKnowledgeDossier | null> {
  if (!prize) return null
  const prizeName = prize.trim()
  if (!prizeName) return null
  const marketCode = normaliseMarketCode(market || '') || 'GLOBAL'
  const slug = buildSlug(prizeName, marketCode)

  const existing = await prisma.prizeKnowledge.findUnique({ where: { slug } })
  if (existing?.dossier) {
    return existing.dossier as PrizeKnowledgeDossier
  }

  try {
    const prompt = buildPrompt(prizeName, marketCode)
    const response = await chat({
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      model: MODEL,
      temperature: 0.2,
      json: true,
      max_output_tokens: 700,
      meta: { scope: 'prize.knowledge', prize: prizeName, market: marketCode },
    })

    let parsed: any = null
    try {
      parsed = response ? JSON.parse(response) : null
    } catch {
      parsed = null
    }

    if (!parsed || typeof parsed !== 'object') return null

    const dossier: PrizeKnowledgeDossier = {
      prizeTruths: normaliseList(parsed.prizeTruths),
      emotionalHooks: normaliseList(parsed.emotionalHooks),
      audienceFit: normaliseList(parsed.audienceFit),
      iconStatus: normaliseList(parsed.iconStatus),
    }

    const hasContent = Object.values(dossier).some((arr) => Array.isArray(arr) && arr.length)
    if (!hasContent) return null

    await prisma.prizeKnowledge.create({
      data: {
        slug,
        prize: prizeName,
        market: marketCode,
        dossier,
        sourceModel: MODEL,
        prompt,
        rawResponse: parsed,
      },
    })

    return dossier
  } catch (err) {
    console.warn('[prize-knowledge] failed to fetch GPT knowledge', err)
    return null
  }
}
