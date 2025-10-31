// apps/backend/src/lib/copydesk.ts
import { chat } from './openai.js'
import type { CampaignContext } from './context.js'

/**
 * Voice registry kept local to avoid external deps.
 * If you later want to centralise in bible.ts, you can re-export there.
 */
export const VOICE = {
  consultant: {
    name: 'Consultant',
    tone: 'Clear, senior, concise.',
    pattern: 'Use short paragraphs, avoid filler.',
  },
  ferrierSuit: {
    name: 'Ferrier+Suit',
    tone: 'Crisp, commercially astute, behaviour-led. Dry wit allowed, no clichés, no marketing bingo.',
    pattern: 'Prefer short lines. Specific, observed, retailer-real.',
  },
} as const

export const CREATE_FERRIER_COMPOSE_PROMPT = `
Rewrite the routes in Ferrier+Suit voice.
- Keep headings and bullet structure.
- Make hooks short, premium, brand-locked.
- Tighten mechanics into a five-second staff script.
- Keep ops/compliance lines plain.
- Remove repetition, hedge words, and generic claims.
`.trim()

export const EVAL_COMPOSE_PROMPT_FERRIER = `
Compose a client-facing evaluation in Ferrier+Suit voice:
- Start with what’s strong (behavioural truth, retailer reality, perceived odds, friction).
- Name what’s soft and why (hook clarity, mechanic burden, prize shape, cadence).
- State the single most important change to make it land in retail.
- Keep staff-explainable in 5 seconds; name compliance sensitivities (AU default).
- Use short, specific lines. No marketing bingo.
`.trim()

/**
 * Polishes Create routes without changing structure.
 */
export async function composeFerrierRoutes(
  ctx: CampaignContext,
  routesMarkdown: string,
  { model = process.env.MODEL_CREATE || process.env.MODEL_DEFAULT }: { model?: string } = {}
): Promise<string> {
  const system = [
    `${VOICE.ferrierSuit.name} style.`,
    VOICE.ferrierSuit.tone,
    'Keep the existing headings and bullet structure.',
    'Short sentences. No marketing bingo. Tighten claims.',
  ].join(' ')

  const user = [
    `Client: ${ctx.clientName} — ${ctx.title}`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Position: ${ctx.brandPosition || 'unknown'}`,
    '',
    'RAW ROUTES (markdown):',
    routesMarkdown,
    '',
    CREATE_FERRIER_COMPOSE_PROMPT,
  ].join('\n')

  return await chat({
    model: String(model),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.35,
    top_p: 0.95,
    max_output_tokens: 1600,
  })
}

/**
 * Consultant-toned polish (kept for backward compat where used).
 */
export async function composeConsultantRoutes(
  ctx: CampaignContext,
  routesMarkdown: string,
  { model = process.env.MODEL_CREATE || process.env.MODEL_DEFAULT }: { model?: string } = {}
): Promise<string> {
  const system = [
    `${VOICE.consultant.name} style.`,
    VOICE.consultant.tone,
    VOICE.consultant.pattern,
  ].join(' ')

  const user = [
    `Client: ${ctx.clientName} — ${ctx.title}`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Position: ${ctx.brandPosition || 'unknown'}`,
    '',
    'RAW ROUTES (markdown):',
    routesMarkdown,
    '',
    'Rewrite the raw routes into a client-facing presentation section. Keep the structure, fix clarity, remove repetition, tighten language.',
  ].join('\n')

  return await chat({
    model: String(model),
    system,
    messages: [{ role: 'user', content: user }],
    temperature: 0.3,
    top_p: 0.95,
  })
}

/**
 * Composes the Ferrier+Suit evaluation narrative from a structured JSON diagnosis.
 * (Used by orchestrator/evaluate.ts)
 */
export async function composeFerrierSuitFromJSON(
  ctx: CampaignContext,
  jsonPayload: unknown,
  {
    model = process.env.MODEL_EVAL || process.env.MODEL_DEFAULT,
    temperature = Number(process.env.EVAL_TEMP ?? 0.8),
    top_p = 0.9,
  }: { model?: string; temperature?: number; top_p?: number } = {}
): Promise<string> {
  const system = [
    `${VOICE.ferrierSuit.name} style.`,
    VOICE.ferrierSuit.tone,
    VOICE.ferrierSuit.pattern,
  ].join(' ')

  const briefLine = [
    ctx.briefSpec?.hook ? `Hook: ${ctx.briefSpec.hook}` : '',
    ctx.briefSpec?.mechanicOneLiner ? `Mechanic: ${ctx.briefSpec.mechanicOneLiner}` : '',
    ctx.briefSpec?.typeOfPromotion ? `Promotion: ${ctx.briefSpec.typeOfPromotion}` : '',
    ctx.briefSpec?.retailers?.length ? `Retailers: ${ctx.briefSpec.retailers.join(', ')}` : '',
    ctx.briefSpec?.heroPrize ? `Hero prize: ${ctx.briefSpec.heroPrize}${ctx.briefSpec?.heroPrizeCount ? ` x${ctx.briefSpec.heroPrizeCount}` : ''}` : '',
    ctx.briefSpec?.calendarTheme ? `Calendar: ${ctx.briefSpec.calendarTheme}` : '',
    ctx.orientation ? `Stance: ${ctx.orientation}` : '',
  ].filter(Boolean).join(' | ')

  const user = [
    `Client: ${ctx.clientName} — ${ctx.title}`,
    `Market: ${ctx.market || 'AU'} | Category: ${ctx.category || 'n/a'} | Position: ${ctx.brandPosition || 'UNKNOWN'}`,
    '',
    'BRIEF SNAPSHOT:',
    briefLine || '_none_',
    '',
    'STRUCTURED DIAGNOSIS JSON:',
    JSON.stringify(jsonPayload),
    '',
    EVAL_COMPOSE_PROMPT_FERRIER,
  ].join('\n')

  return await chat({
    model: String(model),
    system,
    messages: [{ role: 'user', content: user }],
    temperature,
    top_p,
    max_output_tokens: 1200,
  })
}
